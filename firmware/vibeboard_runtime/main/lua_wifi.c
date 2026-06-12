#include "lua_wifi.h"

#include <string.h>

#include "esp_err.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "esp_wifi_types.h"
#include "esp_event_base.h"
#include "lauxlib.h"
#include "lua.h"
#include "nvs_flash.h"

static const char *TAG = "lua_wifi";

static bool s_nvs_ready;
static bool s_netif_ready;
static bool s_wifi_ready;
static bool s_wifi_started;
static bool s_event_handlers_ready;
static bool s_sta_should_connect;
static int s_sta_retry_count;
static esp_netif_t *s_sta_netif;

enum {
    VB_WIFI_MAX_RETRY = 8,
};

static int push_esp_result(lua_State *L, esp_err_t err)
{
    lua_pushboolean(L, err == ESP_OK);
    if (err != ESP_OK) {
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }
    return 1;
}

static esp_err_t ensure_nvs(void)
{
    if (s_nvs_ready) {
        return ESP_OK;
    }

    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "resetting NVS after init error: %s", esp_err_to_name(err));
        err = nvs_flash_erase();
        if (err != ESP_OK) {
            return err;
        }
        err = nvs_flash_init();
    }
    if (err == ESP_OK) {
        s_nvs_ready = true;
    }
    return err;
}

static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    (void)arg;
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        if (s_sta_should_connect) {
            ESP_LOGI(TAG, "sta start connect");
            esp_wifi_connect();
        }
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_event_sta_disconnected_t *event = (wifi_event_sta_disconnected_t *)event_data;
        ESP_LOGW(TAG, "sta disconnected reason=%d", event ? event->reason : -1);
        if (s_sta_should_connect && s_sta_retry_count < VB_WIFI_MAX_RETRY) {
            s_sta_retry_count++;
            ESP_LOGI(TAG, "sta reconnect attempt %d/%d", s_sta_retry_count, VB_WIFI_MAX_RETRY);
            esp_wifi_connect();
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        if (event != NULL) {
            s_sta_retry_count = 0;
            ESP_LOGI(TAG, "sta got ip " IPSTR, IP2STR(&event->ip_info.ip));
        }
    }
}

static esp_err_t ensure_event_handlers(void)
{
    if (s_event_handlers_ready) {
        return ESP_OK;
    }

    esp_err_t err = esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_START, wifi_event_handler, NULL);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }
    err = esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_DISCONNECTED, wifi_event_handler, NULL);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }
    err = esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }
    s_event_handlers_ready = true;
    return ESP_OK;
}

static esp_err_t ensure_netif(void)
{
    esp_err_t err = ensure_nvs();
    if (err != ESP_OK) {
        return err;
    }

    if (!s_netif_ready) {
        err = esp_netif_init();
        if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
            return err;
        }
        err = esp_event_loop_create_default();
        if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
            return err;
        }
        s_netif_ready = true;
    }

    err = ensure_event_handlers();
    if (err != ESP_OK) {
        return err;
    }

    if (s_sta_netif == NULL) {
        s_sta_netif = esp_netif_create_default_wifi_sta();
        if (s_sta_netif == NULL) {
            return ESP_ERR_NO_MEM;
        }
    }
    return ESP_OK;
}

static esp_err_t ensure_wifi(void)
{
    esp_err_t err = ensure_netif();
    if (err != ESP_OK) {
        return err;
    }
    if (!s_wifi_ready) {
        wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
        err = esp_wifi_init(&cfg);
        if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
            return err;
        }
        err = esp_wifi_set_ps(WIFI_PS_NONE);
        if (err != ESP_OK && err != ESP_ERR_WIFI_NOT_INIT) {
            return err;
        }
        s_wifi_ready = true;
    }
    return ESP_OK;
}

static int wifi_mode(lua_State *L)
{
    const char *mode = luaL_checkstring(L, 1);
    esp_err_t err = ensure_wifi();
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
    esp_err_t err = ensure_wifi();
    if (err != ESP_OK) {
        return push_esp_result(L, err);
    }
    if (!s_wifi_started) {
        err = esp_wifi_start();
        if (err == ESP_OK || err == ESP_ERR_WIFI_CONN) {
            s_wifi_started = true;
        }
    }
    return push_esp_result(L, err);
}

static int wifi_sta_config(lua_State *L)
{
    luaL_checktype(L, 1, LUA_TTABLE);
    esp_err_t err = ensure_wifi();
    if (err != ESP_OK) {
        return push_esp_result(L, err);
    }

    lua_getfield(L, 1, "ssid");
    const char *ssid = luaL_checkstring(L, -1);
    lua_getfield(L, 1, "password");
    const char *password = luaL_optstring(L, -1, "");

    wifi_config_t config = {0};
    strlcpy((char *)config.sta.ssid, ssid, sizeof(config.sta.ssid));
    strlcpy((char *)config.sta.password, password, sizeof(config.sta.password));
    config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
    if (password[0] == '\0') {
        config.sta.threshold.authmode = WIFI_AUTH_OPEN;
    }
    s_sta_retry_count = 0;

    lua_pop(L, 2);
    return push_esp_result(L, esp_wifi_set_config(WIFI_IF_STA, &config));
}

static int wifi_sta_connect(lua_State *L)
{
    esp_err_t err = ensure_wifi();
    if (err != ESP_OK) {
        return push_esp_result(L, err);
    }
    if (!s_wifi_started) {
        err = esp_wifi_start();
        if (err != ESP_OK && err != ESP_ERR_WIFI_CONN) {
            return push_esp_result(L, err);
        }
        s_wifi_started = true;
    }
    s_sta_should_connect = true;
    return push_esp_result(L, esp_wifi_connect());
}

static int wifi_sta_getip(lua_State *L)
{
    esp_err_t err = ensure_netif();
    if (err != ESP_OK) {
        lua_pushnil(L);
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }

    esp_netif_ip_info_t ip = {0};
    err = esp_netif_get_ip_info(s_sta_netif, &ip);
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
