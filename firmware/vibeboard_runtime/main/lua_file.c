#include "lua_file.h"

#include <dirent.h>
#include <errno.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include "app_registry.h"
#include "board_lckfb_szpi_s3.h"
#include "esp_log.h"
#include "lauxlib.h"
#include "lua.h"

static const char *TAG = "lua_file";

#define VB_LUA_FILE_APP_DIR_REGISTRY_KEY "vb_file_app_dir"
#define VB_LUA_FILE_HANDLE_META "vb.file"
#define VB_LUA_FILE_MAX_READ (16 * 1024)

typedef struct {
    FILE *file;
} vb_lua_file_handle_t;

static const char *get_app_dir(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, VB_LUA_FILE_APP_DIR_REGISTRY_KEY);
    const char *app_dir = lua_tostring(L, -1);
    lua_pop(L, 1);
    return app_dir;
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

static bool resolve_path(lua_State *L, int arg, char *resolved, size_t resolved_size, bool write_access)
{
    const char *path = luaL_checkstring(L, arg);
    const char *app_dir = get_app_dir(L);
    if (app_dir == NULL || app_dir[0] == '\0') {
        return luaL_error(L, "file app dir unavailable");
    }
    if (path[0] == '\0' || has_traversal(path)) {
        return luaL_error(L, "file path escapes app sandbox");
    }

    if (strcmp(path, ".") == 0) {
        strlcpy(resolved, app_dir, resolved_size);
        return true;
    }

    if (strncmp(path, "/sd/", 4) == 0) {
        if (write_access) {
            return luaL_error(L, "file write only supports app-local paths");
        }
        return build_joined_path(resolved, resolved_size, VB_SD_MOUNT_POINT, path + 4);
    }

    if (strncmp(path, VB_SD_MOUNT_POINT, strlen(VB_SD_MOUNT_POINT)) == 0) {
        if (write_access) {
            return luaL_error(L, "file write only supports app-local paths");
        }
        strlcpy(resolved, path, resolved_size);
        return true;
    }

    if (path[0] == '/') {
        return luaL_error(L, "file path must be app-relative or /sd/...");
    }

    return build_joined_path(resolved, resolved_size, app_dir, path);
}

static int file_exists(lua_State *L)
{
    char path[VB_APP_PATH_MAX];
    if (!resolve_path(L, 1, path, sizeof(path), false)) {
        lua_pushboolean(L, 0);
        return 1;
    }

    struct stat st;
    lua_pushboolean(L, stat(path, &st) == 0);
    return 1;
}

static int file_read(lua_State *L)
{
    char path[VB_APP_PATH_MAX];
    if (!resolve_path(L, 1, path, sizeof(path), false)) {
        lua_pushnil(L);
        lua_pushliteral(L, "path too long");
        return 2;
    }

    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        lua_pushnil(L);
        lua_pushfstring(L, "open failed: %s", strerror(errno));
        return 2;
    }

    if (fseek(file, 0, SEEK_END) != 0) {
        fclose(file);
        lua_pushnil(L);
        lua_pushliteral(L, "seek failed");
        return 2;
    }
    long size = ftell(file);
    if (size < 0 || size > VB_LUA_FILE_MAX_READ) {
        fclose(file);
        lua_pushnil(L);
        lua_pushliteral(L, "file too large");
        return 2;
    }
    rewind(file);

    char *buffer = (char *)lua_newuserdata(L, (size_t)size);
    size_t read = fread(buffer, 1, (size_t)size, file);
    fclose(file);
    lua_pushlstring(L, buffer, read);
    lua_remove(L, -2);
    return 1;
}

static int file_write(lua_State *L)
{
    char path[VB_APP_PATH_MAX];
    if (!resolve_path(L, 1, path, sizeof(path), true)) {
        lua_pushboolean(L, 0);
        lua_pushliteral(L, "path too long");
        return 2;
    }

    size_t len = 0;
    const char *data = luaL_checklstring(L, 2, &len);
    FILE *file = fopen(path, "wb");
    if (file == NULL) {
        lua_pushboolean(L, 0);
        lua_pushfstring(L, "open failed: %s", strerror(errno));
        return 2;
    }
    size_t written = fwrite(data, 1, len, file);
    fclose(file);
    lua_pushboolean(L, written == len);
    if (written != len) {
        lua_pushliteral(L, "short write");
        return 2;
    }
    return 1;
}

static int file_list(lua_State *L)
{
    char path[VB_APP_PATH_MAX];
    if (!resolve_path(L, 1, path, sizeof(path), false)) {
        lua_pushnil(L);
        lua_pushliteral(L, "path too long");
        return 2;
    }

    DIR *dir = opendir(path);
    if (dir == NULL) {
        lua_pushnil(L);
        lua_pushfstring(L, "opendir failed: %s", strerror(errno));
        return 2;
    }

    lua_newtable(L);
    int index = 1;
    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (entry->d_name[0] == '.') {
            continue;
        }
        lua_pushinteger(L, index++);
        lua_pushstring(L, entry->d_name);
        lua_settable(L, -3);
    }
    closedir(dir);
    return 1;
}

static vb_lua_file_handle_t *check_file(lua_State *L, int index)
{
    return (vb_lua_file_handle_t *)luaL_checkudata(L, index, VB_LUA_FILE_HANDLE_META);
}

static int file_handle_read(lua_State *L)
{
    vb_lua_file_handle_t *handle = check_file(L, 1);
    if (handle->file == NULL) {
        lua_pushnil(L);
        lua_pushliteral(L, "file closed");
        return 2;
    }

    int bytes = (int)luaL_optinteger(L, 2, VB_LUA_FILE_MAX_READ);
    if (bytes <= 0 || bytes > VB_LUA_FILE_MAX_READ) {
        return luaL_error(L, "invalid read size");
    }
    char *buffer = (char *)lua_newuserdata(L, (size_t)bytes);
    size_t read = fread(buffer, 1, (size_t)bytes, handle->file);
    lua_pushlstring(L, buffer, read);
    lua_remove(L, -2);
    return 1;
}

static int file_handle_close(lua_State *L)
{
    vb_lua_file_handle_t *handle = check_file(L, 1);
    if (handle->file != NULL) {
        fclose(handle->file);
        handle->file = NULL;
    }
    return 0;
}

static int file_open(lua_State *L)
{
    const char *mode = luaL_optstring(L, 2, "r");
    bool write_access = strchr(mode, 'w') != NULL || strchr(mode, 'a') != NULL || strchr(mode, '+') != NULL;

    char path[VB_APP_PATH_MAX];
    if (!resolve_path(L, 1, path, sizeof(path), write_access)) {
        lua_pushnil(L);
        lua_pushliteral(L, "path too long");
        return 2;
    }

    FILE *file = fopen(path, mode);
    if (file == NULL) {
        lua_pushnil(L);
        lua_pushfstring(L, "open failed: %s", strerror(errno));
        return 2;
    }

    vb_lua_file_handle_t *handle = (vb_lua_file_handle_t *)lua_newuserdata(L, sizeof(*handle));
    handle->file = file;
    luaL_getmetatable(L, VB_LUA_FILE_HANDLE_META);
    lua_setmetatable(L, -2);
    return 1;
}

void vb_lua_file_register(lua_State *L, const char *app_dir)
{
    const char *sandbox_dir = (app_dir != NULL && app_dir[0] != '\0') ? app_dir : VB_APPS_PATH;
    lua_pushstring(L, sandbox_dir);
    lua_setfield(L, LUA_REGISTRYINDEX, VB_LUA_FILE_APP_DIR_REGISTRY_KEY);

    if (luaL_newmetatable(L, VB_LUA_FILE_HANDLE_META)) {
        static const luaL_Reg handle_methods[] = {
            {"read", file_handle_read},
            {"close", file_handle_close},
            {"__gc", file_handle_close},
            {NULL, NULL},
        };
        luaL_setfuncs(L, handle_methods, 0);
        lua_pushvalue(L, -1);
        lua_setfield(L, -2, "__index");
    }
    lua_pop(L, 1);

    static const luaL_Reg file_functions[] = {
        {"exists", file_exists},
        {"read", file_read},
        {"getcontents", file_read},
        {"write", file_write},
        {"list", file_list},
        {"listdir", file_list},
        {"open", file_open},
        {NULL, NULL},
    };

    luaL_newlib(L, file_functions);
    lua_pushstring(L, sandbox_dir);
    lua_setfield(L, -2, "APP_DIR");
    lua_setglobal(L, "file");
    ESP_LOGI(TAG, "file module app dir: %s", sandbox_dir);
}
