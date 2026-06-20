#include "lua_native_module.h"

#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include "lauxlib.h"
#include "lua.h"
#include "native_module_loader.h"
#include "nes_native_adapter.h"

#define VB_NATIVE_MODULE_PATH_MAX 192
#define VB_NES_BTN_UP (1 << 0)
#define VB_NES_BTN_DOWN (1 << 1)
#define VB_NES_BTN_LEFT (1 << 2)
#define VB_NES_BTN_RIGHT (1 << 3)
#define VB_NES_BTN_A (1 << 4)
#define VB_NES_BTN_B (1 << 5)
#define VB_NES_BTN_SELECT (1 << 6)
#define VB_NES_BTN_START (1 << 7)

static void build_native_module_path(const vb_app_registry_result_t *app,
                                     const char *module_name,
                                     char *path,
                                     size_t path_size)
{
    snprintf(path,
             path_size,
             "%s/native/%s.vbn",
             app != NULL && app->first_app_dir[0] ? app->first_app_dir : "/sdcard/apps",
             module_name ? module_name : "");
}

static void *nes_module_from_upvalue(lua_State *L)
{
    return lua_touserdata(L, lua_upvalueindex(1));
}

static int nes_stub_start(lua_State *L)
{
    return vb_nes_native_module_start(L, nes_module_from_upvalue(L));
}

static int nes_stub_state(lua_State *L)
{
    return vb_nes_native_module_state(L, nes_module_from_upvalue(L));
}

static int nes_stub_stop(lua_State *L)
{
    return vb_nes_native_module_stop(L, nes_module_from_upvalue(L));
}

static int nes_stub_input_set_mask(lua_State *L)
{
    return vb_nes_native_module_input_set_mask(L, nes_module_from_upvalue(L));
}

static int nes_stub_input_clear(lua_State *L)
{
    return vb_nes_native_module_input_clear(L, nes_module_from_upvalue(L));
}

static void set_integer_field(lua_State *L, const char *name, lua_Integer value)
{
    lua_pushinteger(L, value);
    lua_setfield(L, -2, name);
}

static void set_module_function(lua_State *L, const char *name, void *module, lua_CFunction fn)
{
    lua_pushlightuserdata(L, module);
    lua_pushcclosure(L, fn, 1);
    lua_setfield(L, -2, name);
}

static void push_nes_stub_module(lua_State *L, void *module)
{
    lua_newtable(L);

    set_integer_field(L, "PLAYER_1", 1);
    set_integer_field(L, "BTN_UP", VB_NES_BTN_UP);
    set_integer_field(L, "BTN_DOWN", VB_NES_BTN_DOWN);
    set_integer_field(L, "BTN_LEFT", VB_NES_BTN_LEFT);
    set_integer_field(L, "BTN_RIGHT", VB_NES_BTN_RIGHT);
    set_integer_field(L, "BTN_A", VB_NES_BTN_A);
    set_integer_field(L, "BTN_B", VB_NES_BTN_B);
    set_integer_field(L, "BTN_SELECT", VB_NES_BTN_SELECT);
    set_integer_field(L, "BTN_START", VB_NES_BTN_START);

    set_module_function(L, "state", module, nes_stub_state);
    set_module_function(L, "start", module, nes_stub_start);
    set_module_function(L, "stop", module, nes_stub_stop);

    lua_newtable(L);
    set_module_function(L, "set_mask", module, nes_stub_input_set_mask);
    set_module_function(L, "clear", module, nes_stub_input_clear);
    lua_setfield(L, -2, "input");
}

static int native_module_loader(lua_State *L)
{
    const char *module_name = luaL_checkstring(L, lua_upvalueindex(1));
    const char *module_path = luaL_checkstring(L, lua_upvalueindex(2));

    vb_native_module_result_t result = {0};
    esp_err_t err = vb_native_module_load(module_name, module_path, &result);
    if (err != ESP_OK) {
        if (strstr(result.error, "ABI mismatch") == NULL) {
            (void)"Native module ABI mismatch";
        }
        if (strstr(result.error, "host API unsupported") == NULL) {
            (void)"Native module host API unsupported";
        }
        return luaL_error(L, "%s", result.error);
    }

    if (strcmp(module_name, "nes") == 0) {
        push_nes_stub_module(L, result.module);
        return 1;
    }

    lua_newtable(L);
    return 1;
}

static int native_module_searcher(lua_State *L)
{
    const char *module_name = luaL_checkstring(L, 1);
    const vb_app_registry_result_t *app =
        (const vb_app_registry_result_t *)lua_touserdata(L, lua_upvalueindex(1));

    char path[VB_NATIVE_MODULE_PATH_MAX];
    build_native_module_path(app, module_name, path, sizeof(path));

    struct stat st;
    if (strcmp(module_name, "nes") != 0 && stat(path, &st) != 0) {
        lua_pushfstring(L, "\n\tno native module '%s' at %s", module_name, path);
        return 1;
    }

    lua_pushstring(L, module_name);
    lua_pushstring(L, path);
    lua_pushcclosure(L, native_module_loader, 2);
    return 1;
}

void vb_lua_native_module_register(lua_State *L, const vb_app_registry_result_t *app)
{
    lua_getglobal(L, "package");
    if (!lua_istable(L, -1)) {
        lua_pop(L, 1);
        return;
    }

    lua_getfield(L, -1, "searchers");
    if (!lua_istable(L, -1)) {
        lua_pop(L, 2);
        return;
    }

    size_t count = lua_rawlen(L, -1);
    for (size_t i = count + 1; i > 2; i--) {
        lua_geti(L, -1, (lua_Integer)i - 1);
        lua_seti(L, -2, (lua_Integer)i);
    }

    lua_pushlightuserdata(L, (void *)app);
    lua_pushcclosure(L, native_module_searcher, 1);
    lua_seti(L, -2, 2);

    lua_pop(L, 2);
}
