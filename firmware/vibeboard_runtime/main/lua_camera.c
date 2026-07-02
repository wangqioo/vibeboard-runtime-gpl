#include "lua_camera.h"

#include <errno.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "app_registry.h"
#include "esp_err.h"
#include "esp_heap_caps.h"
#include "lauxlib.h"

#define VB_LUA_CAMERA_STATE_REGISTRY_KEY "vb_camera_state"
#define VB_LUA_FILE_APP_DIR_REGISTRY_KEY "vb_file_app_dir"
#define VB_LUA_FILE_DATA_PREFIX "/sd/data/"

static vb_lua_camera_state_t *get_state(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, VB_LUA_CAMERA_STATE_REGISTRY_KEY);
    vb_lua_camera_state_t *state = (vb_lua_camera_state_t *)lua_touserdata(L, -1);
    lua_pop(L, 1);
    return state;
}

static bool build_app_path(char *dest, size_t dest_size, const char *app_dir, const char *path);

static void set_error(vb_lua_camera_state_t *state, const char *message)
{
    if (state == NULL) {
        return;
    }
    strlcpy(state->last_error, message != NULL ? message : "", sizeof(state->last_error));
}

static const char *get_app_id_from_dir(const char *app_dir)
{
    if (app_dir == NULL || app_dir[0] == '\0') {
        return NULL;
    }
    const char *slash = strrchr(app_dir, '/');
    return slash != NULL ? slash + 1 : app_dir;
}

static bool allow_data_write(const char *path, const char *app_dir)
{
    if (path == NULL || app_dir == NULL) {
        return false;
    }
    if (strcmp(path, "/sd/data") == 0) {
        return true;
    }
    if (strncmp(path, VB_LUA_FILE_DATA_PREFIX, strlen(VB_LUA_FILE_DATA_PREFIX)) != 0) {
        return false;
    }
    const char *app_id = get_app_id_from_dir(app_dir);
    if (app_id == NULL || app_id[0] == '\0') {
        return false;
    }
    const char *relative = path + strlen(VB_LUA_FILE_DATA_PREFIX);
    size_t app_id_len = strlen(app_id);
    return strncmp(relative, app_id, app_id_len) == 0 && (relative[app_id_len] == '\0' || relative[app_id_len] == '/');
}

static bool resolve_camera_save_path(char *resolved, size_t resolved_size, const char *app_dir, const char *path)
{
    if (strncmp(path, VB_LUA_FILE_DATA_PREFIX, strlen(VB_LUA_FILE_DATA_PREFIX)) == 0) {
        if (!allow_data_write(path, app_dir)) {
            return false;
        }
        return build_app_path(resolved, resolved_size, VB_SD_MOUNT_POINT, path + 4);
    }
    return build_app_path(resolved, resolved_size, app_dir, path);
}

static void set_save_error(char *dest, size_t dest_size, const char *format, ...)
{
    if (dest == NULL || dest_size == 0) {
        return;
    }

    va_list args;
    va_start(args, format);
    vsnprintf(dest, dest_size, format, args);
    va_end(args);
}

static void release_held_frame(vb_lua_camera_state_t *state)
{
    if (state == NULL) {
        return;
    }
    vb_board_camera_return(&state->held_frame);
}

static void release_owned_frame(vb_lua_camera_state_t *state)
{
    if (state == NULL) {
        return;
    }
    if (state->owned_frame_buf != NULL) {
        heap_caps_free(state->owned_frame_buf);
    }
    memset(&state->owned_frame, 0, sizeof(state->owned_frame));
    state->owned_frame_buf = NULL;
}

static bool has_frame(const vb_board_camera_frame_t *frame)
{
    return frame != NULL && frame->buf != NULL && frame->len > 0 && frame->width > 0 && frame->height > 0;
}

static int push_error(lua_State *L, vb_lua_camera_state_t *state, esp_err_t err)
{
    const char *message = esp_err_to_name(err);
    set_error(state, message);
    lua_pushnil(L);
    lua_pushstring(L, message);
    return 2;
}

static int camera_start(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }

    int width = 320;
    int height = 240;
    const char *format = "rgb565";
    if (lua_istable(L, 1)) {
        lua_getfield(L, 1, "width");
        if (lua_isnumber(L, -1)) {
            width = (int)lua_tointeger(L, -1);
        }
        lua_pop(L, 1);
        lua_getfield(L, 1, "height");
        if (lua_isnumber(L, -1)) {
            height = (int)lua_tointeger(L, -1);
        }
        lua_pop(L, 1);
        lua_getfield(L, 1, "format");
        if (lua_isstring(L, -1)) {
            format = lua_tostring(L, -1);
        }
        lua_pop(L, 1);
    }

    esp_err_t err = vb_board_camera_start((uint16_t)width, (uint16_t)height, format);
    if (err != ESP_OK) {
        state->ready = false;
        return push_error(L, state, err);
    }

    state->ready = true;
    state->width = (uint16_t)width;
    state->height = (uint16_t)height;
    strlcpy(state->format, format, sizeof(state->format));
    set_error(state, "");
    lua_pushboolean(L, true);
    return 1;
}

static void push_frame_table(lua_State *L, const vb_board_camera_frame_t *frame)
{
    lua_newtable(L);
    lua_pushinteger(L, frame->width);
    lua_setfield(L, -2, "width");
    lua_pushinteger(L, frame->height);
    lua_setfield(L, -2, "height");
    lua_pushstring(L, frame->format != NULL ? frame->format : "");
    lua_setfield(L, -2, "format");
    lua_pushinteger(L, (lua_Integer)frame->len);
    lua_setfield(L, -2, "len");
    lua_pushinteger(L, (lua_Integer)(uintptr_t)frame->driver_frame);
    lua_setfield(L, -2, "ptr");
}

static int camera_capture(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }
    if (!state->ready) {
        lua_pushnil(L);
        lua_pushliteral(L, "camera not started");
        set_error(state, "camera not started");
        return 2;
    }

    release_held_frame(state);
    esp_err_t err = vb_board_camera_capture(&state->held_frame);
    if (err != ESP_OK) {
        return push_error(L, state, err);
    }
    state->captures++;
    state->width = state->held_frame.width;
    state->height = state->held_frame.height;
    strlcpy(state->format, state->held_frame.format != NULL ? state->held_frame.format : "", sizeof(state->format));
    set_error(state, "");
    push_frame_table(L, &state->held_frame);
    return 1;
}

static int camera_draw(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }
    if (!has_frame(&state->held_frame)) {
        lua_pushnil(L);
        lua_pushliteral(L, "no held frame");
        set_error(state, "no held frame");
        return 2;
    }
    esp_err_t err = vb_board_camera_draw(&state->held_frame);
    if (err != ESP_OK) {
        return push_error(L, state, err);
    }
    lua_pushboolean(L, true);
    return 1;
}

static int camera_clone(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }
    if (!has_frame(&state->held_frame)) {
        lua_pushnil(L);
        lua_pushliteral(L, "no held frame");
        set_error(state, "no held frame");
        return 2;
    }

    void *copy = heap_caps_malloc(state->held_frame.len, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (copy == NULL) {
        copy = heap_caps_malloc(state->held_frame.len, MALLOC_CAP_8BIT);
    }
    if (copy == NULL) {
        return push_error(L, state, ESP_ERR_NO_MEM);
    }

    memcpy(copy, state->held_frame.buf, state->held_frame.len);
    release_owned_frame(state);
    state->owned_frame = state->held_frame;
    state->owned_frame.buf = copy;
    state->owned_frame.driver_frame = NULL;
    state->owned_frame_buf = copy;
    set_error(state, "");
    push_frame_table(L, &state->owned_frame);
    return 1;
}

static int camera_preview_start(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }

    release_held_frame(state);
    esp_err_t err = vb_board_camera_preview_start();
    if (err != ESP_OK) {
        state->ready = false;
        return push_error(L, state, err);
    }

    uint16_t preview_width = 0;
    uint16_t preview_height = 0;
    (void)vb_board_camera_preview_mode(&preview_width, &preview_height);
    state->ready = true;
    state->width = preview_width;
    state->height = preview_height;
    strlcpy(state->format, "rgb565", sizeof(state->format));
    set_error(state, "");
    lua_pushboolean(L, true);
    return 1;
}

static int camera_preview_start_low(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }

    release_held_frame(state);
    esp_err_t err = vb_board_camera_preview_start_low_memory();
    if (err != ESP_OK) {
        state->ready = false;
        return push_error(L, state, err);
    }

    uint16_t preview_width = 0;
    uint16_t preview_height = 0;
    (void)vb_board_camera_preview_mode(&preview_width, &preview_height);
    state->ready = true;
    state->width = preview_width;
    state->height = preview_height;
    strlcpy(state->format, "rgb565", sizeof(state->format));
    set_error(state, "");
    lua_pushboolean(L, true);
    return 1;
}

static int camera_preview_stop(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }

    vb_board_camera_preview_stop();
    lua_pushboolean(L, true);
    return 1;
}

static int camera_overlay(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }
    (void)state;
    vb_board_camera_overlay_set(lua_toboolean(L, 1));
    lua_pushboolean(L, true);
    return 1;
}

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

static bool build_app_path(char *dest, size_t dest_size, const char *app_dir, const char *path)
{
    size_t app_dir_len = strlen(app_dir);
    size_t path_len = strlen(path);
    bool app_dir_has_slash = app_dir_len > 0 && app_dir[app_dir_len - 1] == '/';
    size_t needed = app_dir_len + (app_dir_has_slash ? 0 : 1) + path_len + 1;
    if (needed > dest_size) {
        return false;
    }

    memcpy(dest, app_dir, app_dir_len);
    size_t pos = app_dir_len;
    if (!app_dir_has_slash) {
        dest[pos++] = '/';
    }
    memcpy(dest + pos, path, path_len);
    dest[pos + path_len] = '\0';
    return true;
}

static bool path_has_suffix_ci(const char *path, const char *suffix)
{
    if (path == NULL || suffix == NULL) {
        return false;
    }
    size_t path_len = strlen(path);
    size_t suffix_len = strlen(suffix);
    if (suffix_len > path_len) {
        return false;
    }

    const char *tail = path + path_len - suffix_len;
    for (size_t i = 0; i < suffix_len; i++) {
        char lhs = tail[i];
        char rhs = suffix[i];
        if (lhs >= 'A' && lhs <= 'Z') {
            lhs = (char)(lhs - 'A' + 'a');
        }
        if (rhs >= 'A' && rhs <= 'Z') {
            rhs = (char)(rhs - 'A' + 'a');
        }
        if (lhs != rhs) {
            return false;
        }
    }
    return true;
}

static void write_le16(uint8_t *dest, uint16_t value)
{
    dest[0] = (uint8_t)(value & 0xff);
    dest[1] = (uint8_t)((value >> 8) & 0xff);
}

static void write_le32(uint8_t *dest, uint32_t value)
{
    dest[0] = (uint8_t)(value & 0xff);
    dest[1] = (uint8_t)((value >> 8) & 0xff);
    dest[2] = (uint8_t)((value >> 16) & 0xff);
    dest[3] = (uint8_t)((value >> 24) & 0xff);
}

static bool camera_save_bmp_rgb565(FILE *file, const vb_board_camera_frame_t *frame, size_t *written_out, char *error, size_t error_size)
{
    if (file == NULL || frame == NULL || frame->buf == NULL || written_out == NULL ||
        frame->width == 0 || frame->height == 0) {
        set_save_error(error, error_size, "invalid frame");
        return false;
    }
    size_t expected_len = (size_t)frame->width * frame->height * sizeof(uint16_t);
    if (frame->len < expected_len) {
        set_save_error(error, error_size, "short frame: %u x %u needs %u bytes, got %u",
            frame->width,
            frame->height,
            (unsigned)expected_len,
            (unsigned)frame->len);
        return false;
    }

    const uint32_t width = frame->width;
    const uint32_t height = frame->height;
    const uint32_t bmp_header_size = 54;
    const uint32_t bmp_row_stride = (width * 3 + 3) & ~3U;
    const uint32_t pixel_bytes = bmp_row_stride * height;
    const uint32_t file_size = bmp_header_size + pixel_bytes;

    uint8_t header[54] = {0};
    header[0] = 'B';
    header[1] = 'M';
    write_le32(&header[2], file_size);
    write_le32(&header[10], bmp_header_size);
    write_le32(&header[14], 40);
    write_le32(&header[18], width);
    write_le32(&header[22], height);
    write_le16(&header[26], 1);
    write_le16(&header[28], 24); // bits per pixel
    write_le32(&header[34], pixel_bytes);
    write_le32(&header[38], 2835);
    write_le32(&header[42], 2835);

    if (fwrite(header, 1, sizeof(header), file) != sizeof(header)) {
        set_save_error(error, error_size, "bmp header write failed: %s", strerror(errno));
        return false;
    }

    uint8_t *row = (uint8_t *)malloc(bmp_row_stride);
    if (row == NULL) {
        set_save_error(error, error_size, "bmp row malloc failed: %u bytes", (unsigned)bmp_row_stride);
        return false;
    }

    const uint16_t *pixels = (const uint16_t *)frame->buf;
    for (int32_t y = (int32_t)height - 1; y >= 0; y--) {
        memset(row, 0, bmp_row_stride);
        const uint16_t *src = pixels + ((size_t)y * width);
        for (uint32_t x = 0; x < width; x++) {
            uint16_t pixel = src[x];
            uint8_t r = (uint8_t)((((pixel >> 11) & 0x1f) * 255) / 31);
            uint8_t g = (uint8_t)((((pixel >> 5) & 0x3f) * 255) / 63);
            uint8_t b = (uint8_t)(((pixel & 0x1f) * 255) / 31);
            row[x * 3] = b;
            row[x * 3 + 1] = g;
            row[x * 3 + 2] = r;
        }
        if (fwrite(row, 1, bmp_row_stride, file) != bmp_row_stride) {
            set_save_error(error, error_size, "bmp pixel write failed at row %ld: %s", (long)y, strerror(errno));
            free(row);
            return false;
        }
    }

    free(row);
    *written_out = file_size;
    set_save_error(error, error_size, "");
    return true;
}

static int camera_save(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }
    const vb_board_camera_frame_t *frame = NULL;
    if (has_frame(&state->owned_frame)) {
        frame = &state->owned_frame;
    } else if (has_frame(&state->held_frame)) {
        frame = &state->held_frame;
    }
    if (frame == NULL) {
        lua_pushnil(L);
        lua_pushliteral(L, "no held frame");
        set_error(state, "no held frame");
        return 2;
    }

    int path_arg = lua_istable(L, 1) ? 2 : 1;
    const char *path = luaL_checkstring(L, path_arg);
    const char *app_dir = get_app_dir(L);
    if (app_dir == NULL || app_dir[0] == '\0') {
        lua_pushnil(L);
        lua_pushliteral(L, "file app dir unavailable");
        set_error(state, "file app dir unavailable");
        return 2;
    }
    if (path[0] == '\0' || has_traversal(path) || (path[0] == '/' && !allow_data_write(path, app_dir))) {
        lua_pushnil(L);
        lua_pushliteral(L, "file path escapes app sandbox");
        set_error(state, "file path escapes app sandbox");
        return 2;
    }

    char resolved[VB_APP_PATH_MAX];
    if (!resolve_camera_save_path(resolved, sizeof(resolved), app_dir, path)) {
        lua_pushnil(L);
        lua_pushliteral(L, "file path too long");
        set_error(state, "file path too long");
        return 2;
    }

    FILE *file = fopen(resolved, "wb");
    if (file == NULL) {
        lua_pushnil(L);
        lua_pushstring(L, strerror(errno));
        set_error(state, strerror(errno));
        return 2;
    }

    size_t written = 0;
    bool write_ok = false;
    char save_error[128] = {0};
    if (path_has_suffix_ci(path, ".bmp") && strcmp(frame->format, "rgb565") == 0) {
        write_ok = camera_save_bmp_rgb565(file, frame, &written, save_error, sizeof(save_error));
    } else {
        written = fwrite(frame->buf, 1, frame->len, file);
        write_ok = written == frame->len;
        if (!write_ok) {
            set_save_error(save_error, sizeof(save_error), "raw write short: wrote %u of %u bytes: %s",
                (unsigned)written,
                (unsigned)frame->len,
                strerror(errno));
        }
    }
    int close_result = fclose(file);
    if (!write_ok || close_result != 0) {
        if (close_result != 0) {
            set_save_error(save_error, sizeof(save_error), "close failed: %s", strerror(errno));
        } else if (save_error[0] == '\0') {
            set_save_error(save_error, sizeof(save_error), "save failed");
        }
        lua_pushnil(L);
        lua_pushstring(L, save_error);
        set_error(state, save_error);
        return 2;
    }

    set_error(state, "");
    lua_pushboolean(L, true);
    lua_pushinteger(L, (lua_Integer)written);
    return 2;
}

static int camera_release(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }
    (void)L;
    release_held_frame(state);
    lua_pushboolean(L, true);
    return 1;
}

static int camera_release_clone(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }
    (void)L;
    release_owned_frame(state);
    lua_pushboolean(L, true);
    return 1;
}

static int camera_stop(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }
    release_held_frame(state);
    vb_board_camera_overlay_set(false);
    vb_board_camera_stop();
    state->ready = false;
    lua_pushboolean(L, true);
    return 1;
}

static int camera_status(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }
    lua_newtable(L);
    lua_pushboolean(L, state->ready);
    lua_setfield(L, -2, "ready");
    lua_pushinteger(L, state->captures);
    lua_setfield(L, -2, "captures");
    lua_pushstring(L, state->last_error);
    lua_setfield(L, -2, "last_error");
    lua_pushinteger(L, state->width);
    lua_setfield(L, -2, "width");
    lua_pushinteger(L, state->height);
    lua_setfield(L, -2, "height");
    lua_pushstring(L, state->format);
    lua_setfield(L, -2, "format");
    uint16_t preview_width = 0;
    uint16_t preview_height = 0;
    const char *preview_mode = vb_board_camera_preview_mode(&preview_width, &preview_height);
    lua_pushstring(L, preview_mode);
    lua_setfield(L, -2, "preview_mode");
    lua_pushinteger(L, preview_width);
    lua_setfield(L, -2, "preview_width");
    lua_pushinteger(L, preview_height);
    lua_setfield(L, -2, "preview_height");
    return 1;
}

void vb_lua_camera_init(vb_lua_camera_state_t *state)
{
    if (state == NULL) {
        return;
    }
    memset(state, 0, sizeof(*state));
    strlcpy(state->format, "rgb565", sizeof(state->format));
}

void vb_lua_camera_register(lua_State *L, vb_lua_camera_state_t *state)
{
    if (state == NULL) {
        return;
    }
    lua_pushlightuserdata(L, state);
    lua_setfield(L, LUA_REGISTRYINDEX, VB_LUA_CAMERA_STATE_REGISTRY_KEY);

    static const luaL_Reg camera_functions[] = {
        {"start", camera_start},
        {"capture", camera_capture},
        {"clone", camera_clone},
        {"draw", camera_draw},
        {"overlay", camera_overlay},
        {"preview_start", camera_preview_start},
        {"preview_start_low", camera_preview_start_low},
        {"preview_stop", camera_preview_stop},
        {"save", camera_save},
        {"release", camera_release},
        {"release_clone", camera_release_clone},
        {"stop", camera_stop},
        {"status", camera_status},
        {NULL, NULL},
    };
    luaL_newlib(L, camera_functions);
    lua_pushvalue(L, -1);
    lua_setglobal(L, "camera");
    lua_getglobal(L, "package");
    if (lua_istable(L, -1)) {
        lua_getfield(L, -1, "loaded");
        if (lua_istable(L, -1)) {
            lua_pushvalue(L, -3);
            lua_setfield(L, -2, "camera");
        }
        lua_pop(L, 1);
    }
    lua_pop(L, 2);
}

void vb_lua_camera_cleanup(lua_State *L, vb_lua_camera_state_t *state)
{
    (void)L;
    if (state == NULL) {
        return;
    }
    release_held_frame(state);
    release_owned_frame(state);
    if (state->ready) {
        vb_board_camera_stop();
    }
    state->ready = false;
}
