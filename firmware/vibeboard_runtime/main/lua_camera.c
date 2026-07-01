#include "lua_camera.h"

#include <string.h>

#include "esp_err.h"
#include "lauxlib.h"

#define VB_LUA_CAMERA_STATE_REGISTRY_KEY "vb_camera_state"

static vb_lua_camera_state_t *get_state(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, VB_LUA_CAMERA_STATE_REGISTRY_KEY);
    vb_lua_camera_state_t *state = (vb_lua_camera_state_t *)lua_touserdata(L, -1);
    lua_pop(L, 1);
    return state;
}

static void set_error(vb_lua_camera_state_t *state, const char *message)
{
    if (state == NULL) {
        return;
    }
    strlcpy(state->last_error, message != NULL ? message : "", sizeof(state->last_error));
}

static void release_held_frame(vb_lua_camera_state_t *state)
{
    if (state == NULL) {
        return;
    }
    vb_board_camera_return(&state->held_frame);
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
    if (state->held_frame.driver_frame == NULL) {
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

static int camera_stop(lua_State *L)
{
    vb_lua_camera_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "camera state unavailable");
    }
    release_held_frame(state);
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
        {"draw", camera_draw},
        {"release", camera_release},
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
    if (state->ready) {
        vb_board_camera_stop();
    }
    state->ready = false;
}
