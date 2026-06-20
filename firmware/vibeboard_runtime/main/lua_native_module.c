#include "lua_native_module.h"

#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include "lauxlib.h"
#include "lua.h"
#include "native_module_loader.h"

#define VB_NATIVE_MODULE_PATH_MAX 192

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
