#include "lua_time.h"

#include <stdlib.h>
#include <time.h>

#include "esp_err.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "lauxlib.h"
#include "lua.h"

static bool s_netif_ready;

static int push_esp_result(lua_State *L, esp_err_t err)
{
    lua_pushboolean(L, err == ESP_OK);
    if (err != ESP_OK) {
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }
    return 1;
}

static esp_err_t ensure_netif(void)
{
    if (s_netif_ready) {
        return ESP_OK;
    }

    esp_err_t err = esp_netif_init();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }

    err = esp_event_loop_create_default();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }

    s_netif_ready = true;
    return ESP_OK;
}

static int time_get(lua_State *L)
{
    time_t now = 0;
    time(&now);
    lua_pushinteger(L, (lua_Integer)now);
    return 1;
}

static int time_settimezone(lua_State *L)
{
    const char *timezone = luaL_checkstring(L, 1);
    setenv("TZ", timezone, 1);
    tzset();
    lua_pushboolean(L, 1);
    return 1;
}

static int time_initntp(lua_State *L)
{
    const char *server = luaL_optstring(L, 1, "pool.ntp.org");
    esp_err_t err = ensure_netif();
    if (err != ESP_OK) {
        return push_esp_result(L, err);
    }

    if (esp_sntp_enabled()) {
        lua_pushboolean(L, 1);
        return 1;
    }
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, server);
    esp_sntp_init();
    lua_pushboolean(L, 1);
    return 1;
}

void vb_lua_time_register(lua_State *L)
{
    static const luaL_Reg time_functions[] = {
        {"get", time_get},
        {"settimezone", time_settimezone},
        {"initntp", time_initntp},
        {NULL, NULL},
    };
    luaL_newlib(L, time_functions);
    lua_setglobal(L, "time");
}
