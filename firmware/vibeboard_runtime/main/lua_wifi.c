#include "lua_wifi.h"

#include <string.h>

#include "esp_err.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "lauxlib.h"
#include "lua.h"
#include "runtime_wifi.h"

static const char *TAG = "lua_wifi";

static int push_esp_result(lua_State *L, esp_err_t err)
{
    lua_pushboolean(L, err == ESP_OK);
    if (err != ESP_OK) {
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }
    return 1;
}

static int wifi_mode(lua_State *L)
{
    const char *mode = luaL_checkstring(L, 1);
    esp_err_t err = vb_runtime_wifi_ensure_wifi();
    if (err != ESP_OK) {
        return push_esp_result(L, err);
    }

    wifi_mode_t wifi_mode_value = WIFI_MODE_STA;
    if (strcmp(mode, "sta") == 0 || strcmp(mode, "station") == 0) {
        wifi_mode_value = WIFI_MODE_STA;
    } else {
        return luaL_error(L, "unsupported wifi mode: %s", mode);
    }
    return push_esp_result(L, esp_wifi_set_mode(wifi_mode_value));
}

static int wifi_start(lua_State *L)
{
    esp_err_t err = vb_runtime_wifi_start();
    return push_esp_result(L, err);
}

static int wifi_sta_config(lua_State *L)
{
    luaL_checktype(L, 1, LUA_TTABLE);
    esp_err_t err = vb_runtime_wifi_ensure_wifi();
    if (err != ESP_OK) {
        return push_esp_result(L, err);
    }

    lua_getfield(L, 1, "ssid");
    const char *ssid = luaL_checkstring(L, -1);
    lua_getfield(L, 1, "password");
    const char *password = luaL_optstring(L, -1, "");

    lua_pop(L, 2);
    return push_esp_result(L, vb_runtime_wifi_configure_sta(ssid, password));
}

static int wifi_sta_connect(lua_State *L)
{
    return push_esp_result(L, vb_runtime_wifi_connect_sta());
}

static int wifi_sta_getip(lua_State *L)
{
    esp_err_t err = vb_runtime_wifi_ensure_netif();
    if (err != ESP_OK) {
        lua_pushnil(L);
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }

    esp_netif_ip_info_t ip = {0};
    err = esp_netif_get_ip_info(vb_runtime_wifi_sta_netif(), &ip);
    if (err != ESP_OK) {
        lua_pushnil(L);
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }

    lua_newtable(L);
    char addr[16];
    snprintf(addr, sizeof(addr), IPSTR, IP2STR(&ip.ip));
    lua_pushstring(L, addr);
    lua_setfield(L, -2, "ip");
    snprintf(addr, sizeof(addr), IPSTR, IP2STR(&ip.gw));
    lua_pushstring(L, addr);
    lua_setfield(L, -2, "gateway");
    snprintf(addr, sizeof(addr), IPSTR, IP2STR(&ip.netmask));
    lua_pushstring(L, addr);
    lua_setfield(L, -2, "netmask");
    return 1;
}

void vb_lua_wifi_register(lua_State *L)
{
    static const luaL_Reg wifi_functions[] = {
        {"mode", wifi_mode},
        {"start", wifi_start},
        {NULL, NULL},
    };
    static const luaL_Reg sta_functions[] = {
        {"config", wifi_sta_config},
        {"connect", wifi_sta_connect},
        {"getip", wifi_sta_getip},
        {NULL, NULL},
    };

    luaL_newlib(L, wifi_functions);
    luaL_newlib(L, sta_functions);
    lua_setfield(L, -2, "sta");
    lua_setglobal(L, "wifi");
    ESP_LOGI(TAG, "wifi module registered");
}
