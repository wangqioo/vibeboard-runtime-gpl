#include "lua_lvgl.h"

#include <dirent.h>
#include <stdio.h>
#include <string.h>

#include "board_lckfb_szpi_s3.h"
#include "esp_log.h"
#include "lauxlib.h"
#include "lua_lvgl_internal.h"
#include "lvgl.h"
#include "src/extra/lv_extra.h"

static const char *TAG = "lua_lvgl_fs";
static char s_app_dir[VB_LVGL_PATH_MAX];
static lv_fs_drv_t s_sd_drv;
static bool s_sd_drv_registered;
static bool s_extra_registered;

typedef struct {
    DIR *dir;
} vb_lvgl_dir_t;

static bool build_joined_path(char *dest, size_t dest_size, const char *parent, const char *child)
{
    size_t parent_len = strlen(parent);
    size_t child_len = strlen(child);
    bool parent_has_slash = parent_len > 0 && parent[parent_len - 1] == '/';
    size_t needed = parent_len + (parent_has_slash ? 0 : 1) + child_len + 1;
    if (needed > dest_size) {
        return false;
    }

    memcpy(dest, parent, parent_len);
    size_t pos = parent_len;
    if (!parent_has_slash) {
        dest[pos++] = '/';
    }
    memcpy(dest + pos, child, child_len);
    dest[pos + child_len] = '\0';
    return true;
}

static bool has_traversal(const char *path)
{
    if (path == NULL) {
        return true;
    }
    size_t len = strlen(path);
    if (strcmp(path, "..") == 0 || strncmp(path, "../", 3) == 0) {
        return true;
    }
    return strstr(path, "/../") != NULL || (len >= 3 && strcmp(path + len - 3, "/..") == 0);
}

bool vb_lua_lvgl_resolve_asset_path(const char *path, char *resolved, size_t resolved_size)
{
    if (path == NULL || path[0] == '\0' || has_traversal(path)) {
        ESP_LOGE(TAG, "resolve asset failed path=%s detail=invalid or traversal", path != NULL ? path : "<null>");
        return false;
    }

    if (strncmp(path, "S:/", 3) == 0) {
        strlcpy(resolved, path, resolved_size);
        return true;
    }

    if (strncmp(path, "/sd/", 4) == 0) {
        int written = snprintf(resolved, resolved_size, "S:/%s", path + 4);
        return written > 0 && (size_t)written < resolved_size;
    }

    if (strncmp(path, VB_SD_MOUNT_POINT, strlen(VB_SD_MOUNT_POINT)) == 0) {
        const char *suffix = path + strlen(VB_SD_MOUNT_POINT);
        while (*suffix == '/') {
            suffix++;
        }
        int written = snprintf(resolved, resolved_size, "S:/%s", suffix);
        return written > 0 && (size_t)written < resolved_size;
    }

    if (path[0] == '/') {
        ESP_LOGE(TAG, "resolve asset failed path=%s detail=unsupported absolute path", path);
        return false;
    }

    char absolute[VB_LVGL_PATH_MAX];
    if (!build_joined_path(absolute, sizeof(absolute), s_app_dir, path)) {
        return false;
    }
    const char *suffix = absolute + strlen(VB_SD_MOUNT_POINT);
    while (*suffix == '/') {
        suffix++;
    }
    int written = snprintf(resolved, resolved_size, "S:/%s", suffix);
    return written > 0 && (size_t)written < resolved_size;
}

static bool resolve_sd_driver_path(const char *path, char *resolved, size_t resolved_size)
{
    if (path == NULL || has_traversal(path)) {
        return false;
    }
    while (*path == '/') {
        path++;
    }
    return build_joined_path(resolved, resolved_size, VB_SD_MOUNT_POINT, path);
}

static void *sd_fs_open(lv_fs_drv_t *drv, const char *path, lv_fs_mode_t mode)
{
    LV_UNUSED(drv);
    char resolved[VB_LVGL_PATH_MAX];
    if (!resolve_sd_driver_path(path, resolved, sizeof(resolved))) {
        return NULL;
    }
    const char *flags = "rb";
    if (mode == LV_FS_MODE_WR) {
        flags = "wb";
    } else if (mode == (LV_FS_MODE_WR | LV_FS_MODE_RD)) {
        flags = "rb+";
    }
    return fopen(resolved, flags);
}

static lv_fs_res_t sd_fs_close(lv_fs_drv_t *drv, void *file_p)
{
    LV_UNUSED(drv);
    fclose((FILE *)file_p);
    return LV_FS_RES_OK;
}

static lv_fs_res_t sd_fs_read(lv_fs_drv_t *drv, void *file_p, void *buf, uint32_t btr, uint32_t *br)
{
    LV_UNUSED(drv);
    size_t read = fread(buf, 1, btr, (FILE *)file_p);
    if (br != NULL) {
        *br = (uint32_t)read;
    }
    return LV_FS_RES_OK;
}

static lv_fs_res_t sd_fs_write(lv_fs_drv_t *drv, void *file_p, const void *buf, uint32_t btw, uint32_t *bw)
{
    LV_UNUSED(drv);
    size_t written = fwrite(buf, 1, btw, (FILE *)file_p);
    if (bw != NULL) {
        *bw = (uint32_t)written;
    }
    return written == btw ? LV_FS_RES_OK : LV_FS_RES_UNKNOWN;
}

static lv_fs_res_t sd_fs_seek(lv_fs_drv_t *drv, void *file_p, uint32_t pos, lv_fs_whence_t whence)
{
    LV_UNUSED(drv);
    return fseek((FILE *)file_p, pos, whence) == 0 ? LV_FS_RES_OK : LV_FS_RES_UNKNOWN;
}

static lv_fs_res_t sd_fs_tell(lv_fs_drv_t *drv, void *file_p, uint32_t *pos_p)
{
    LV_UNUSED(drv);
    long pos = ftell((FILE *)file_p);
    if (pos < 0) {
        return LV_FS_RES_UNKNOWN;
    }
    if (pos_p != NULL) {
        *pos_p = (uint32_t)pos;
    }
    return LV_FS_RES_OK;
}

static void *sd_fs_dir_open(lv_fs_drv_t *drv, const char *path)
{
    LV_UNUSED(drv);
    char resolved[VB_LVGL_PATH_MAX];
    if (!resolve_sd_driver_path(path, resolved, sizeof(resolved))) {
        return NULL;
    }
    DIR *dir = opendir(resolved);
    if (dir == NULL) {
        return NULL;
    }
    vb_lvgl_dir_t *handle = lv_mem_alloc(sizeof(*handle));
    if (handle == NULL) {
        closedir(dir);
        return NULL;
    }
    handle->dir = dir;
    return handle;
}

static lv_fs_res_t sd_fs_dir_read(lv_fs_drv_t *drv, void *dir_p, char *fn)
{
    LV_UNUSED(drv);
    vb_lvgl_dir_t *handle = (vb_lvgl_dir_t *)dir_p;
    struct dirent *entry;
    do {
        entry = readdir(handle->dir);
        if (entry == NULL) {
            strcpy(fn, "");
            return LV_FS_RES_OK;
        }
    } while (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0);

    strlcpy(fn, entry->d_name, LV_FS_MAX_FN_LENGTH);
    return LV_FS_RES_OK;
}

static lv_fs_res_t sd_fs_dir_close(lv_fs_drv_t *drv, void *dir_p)
{
    LV_UNUSED(drv);
    vb_lvgl_dir_t *handle = (vb_lvgl_dir_t *)dir_p;
    closedir(handle->dir);
    lv_mem_free(handle);
    return LV_FS_RES_OK;
}

static void register_sd_fs_driver(void)
{
    if (s_sd_drv_registered) {
        return;
    }

    lv_fs_drv_init(&s_sd_drv);
    s_sd_drv.letter = LVGL_FS_SD_LETTER;
    s_sd_drv.open_cb = sd_fs_open;
    s_sd_drv.close_cb = sd_fs_close;
    s_sd_drv.read_cb = sd_fs_read;
    s_sd_drv.write_cb = sd_fs_write;
    s_sd_drv.seek_cb = sd_fs_seek;
    s_sd_drv.tell_cb = sd_fs_tell;
    s_sd_drv.dir_open_cb = sd_fs_dir_open;
    s_sd_drv.dir_read_cb = sd_fs_dir_read;
    s_sd_drv.dir_close_cb = sd_fs_dir_close;
    lv_fs_drv_register(&s_sd_drv);
    s_sd_drv_registered = true;
}

static void register_extra_decoders(void)
{
    if (s_extra_registered) {
        return;
    }
    lv_extra_init();
    s_extra_registered = true;
}

static int l_lv_resolve_asset_path(lua_State *L)
{
    const char *path = luaL_checkstring(L, 1);
    char resolved[VB_LVGL_PATH_MAX];
    if (!vb_lua_lvgl_resolve_asset_path(path, resolved, sizeof(resolved))) {
        ESP_LOGE(TAG, "resolve asset failed path=%s detail=invalid asset path", path);
        return luaL_error(L, "invalid asset path");
    }
    lua_pushstring(L, resolved);
    return 1;
}

static int l_lv_asset_exists(lua_State *L)
{
    const char *path = luaL_checkstring(L, 1);
    char resolved[VB_LVGL_PATH_MAX];
    if (!vb_lua_lvgl_resolve_asset_path(path, resolved, sizeof(resolved))) {
        ESP_LOGE(TAG, "resolve asset failed path=%s detail=invalid asset path", path);
        lua_pushboolean(L, 0);
        lua_pushliteral(L, "invalid asset path");
        return 2;
    }

    lv_fs_file_t file;
    lv_fs_res_t result = lv_fs_open(&file, resolved, LV_FS_MODE_RD);
    if (result != LV_FS_RES_OK) {
        lua_pushboolean(L, 0);
        lua_pushinteger(L, result);
        return 2;
    }
    lv_fs_close(&file);
    lua_pushboolean(L, 1);
    lua_pushstring(L, resolved);
    return 2;
}

void vb_lua_lvgl_fs_register(lua_State *L)
{
    if (s_app_dir[0] == '\0') {
        strlcpy(s_app_dir, VB_SD_MOUNT_POINT, sizeof(s_app_dir));
    }
    register_sd_fs_driver();
    register_extra_decoders();

    lua_pushcfunction(L, l_lv_resolve_asset_path);
    lua_setglobal(L, "lv_resolve_asset_path");

    lua_pushcfunction(L, l_lv_asset_exists);
    lua_setglobal(L, "lv_asset_exists");
}

void vb_lua_lvgl_set_app_dir(const char *app_dir)
{
    if (app_dir == NULL || app_dir[0] == '\0') {
        strlcpy(s_app_dir, VB_SD_MOUNT_POINT, sizeof(s_app_dir));
        return;
    }
    strlcpy(s_app_dir, app_dir, sizeof(s_app_dir));
}
