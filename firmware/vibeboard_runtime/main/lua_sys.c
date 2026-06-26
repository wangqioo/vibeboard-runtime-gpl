#include "lua_sys.h"

#include "board_lckfb_szpi_s3.h"
#include "esp_err.h"
#include "lauxlib.h"
#include "lua.h"
#include "runtime_version.h"

static int push_esp_result(lua_State *L, esp_err_t err)
{
    lua_pushboolean(L, err == ESP_OK);
    if (err != ESP_OK) {
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }
    return 1;
}

static int sys_version(lua_State *L)
{
    lua_pushliteral(L, VB_RUNTIME_VERSION);
    return 1;
}

static int sys_getbrightness(lua_State *L)
{
    int level = 0;
    esp_err_t err = vb_board_get_backlight_percent(&level);
    if (err != ESP_OK) {
        lua_pushnil(L);
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }
    lua_pushinteger(L, level);
    return 1;
}

static int sys_setbrightness(lua_State *L)
{
    int level = (int)luaL_checkinteger(L, 1);
    return push_esp_result(L, vb_board_set_backlight_percent(level));
}

void vb_lua_sys_register(lua_State *L)
{
    static const luaL_Reg sys_functions[] = {
        {"version", sys_version},
        {"getbrightness", sys_getbrightness},
        {"setbrightness", sys_setbrightness},
        {NULL, NULL},
    };

    luaL_newlib(L, sys_functions);
    lua_setglobal(L, "sys");
}
