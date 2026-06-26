#include "lua_http.h"

#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_crt_bundle.h"
#include "esp_err.h"
#include "esp_http_client.h"
#include "lauxlib.h"
#include "lua.h"

#define VB_HTTP_MAX_BODY (32 * 1024)
#define VB_HTTP_DEFAULT_TIMEOUT_MS 10000
#define VB_HTTP_CUBICSERVER_CONFIG_PATH "/sdcard/runtime/cubicserver.json"
#define VB_HTTP_URL_MAX 512
#define VB_HTTP_CUBICSERVER_CONFIG_MAX 512

typedef struct {
    char *body;
    int body_len;
    int capacity;
} vb_http_response_t;

static esp_err_t http_event_handler(esp_http_client_event_t *evt)
{
    if (evt->event_id != HTTP_EVENT_ON_DATA || evt->data == NULL || evt->data_len <= 0) {
        return ESP_OK;
    }

    vb_http_response_t *response = (vb_http_response_t *)evt->user_data;
    if (response == NULL) {
        return ESP_OK;
    }
    if (response->body_len + evt->data_len > VB_HTTP_MAX_BODY) {
        return ESP_FAIL;
    }
    if (response->body_len + evt->data_len + 1 > response->capacity) {
        int new_capacity = response->capacity == 0 ? 1024 : response->capacity * 2;
        while (new_capacity < response->body_len + evt->data_len + 1) {
            new_capacity *= 2;
        }
        char *new_body = (char *)realloc(response->body, (size_t)new_capacity);
        if (new_body == NULL) {
            return ESP_ERR_NO_MEM;
        }
        response->body = new_body;
        response->capacity = new_capacity;
    }
    memcpy(response->body + response->body_len, evt->data, (size_t)evt->data_len);
    response->body_len += evt->data_len;
    response->body[response->body_len] = '\0';
    return ESP_OK;
}

static int get_timeout(lua_State *L, int index)
{
    if (!lua_istable(L, index)) {
        return VB_HTTP_DEFAULT_TIMEOUT_MS;
    }
    lua_getfield(L, index, "timeout_ms");
    int timeout = (int)luaL_optinteger(L, -1, 0);
    lua_pop(L, 1);
    if (timeout <= 0) {
        lua_getfield(L, index, "timeout");
        timeout = (int)luaL_optinteger(L, -1, VB_HTTP_DEFAULT_TIMEOUT_MS);
        lua_pop(L, 1);
    }
    return timeout;
}

static void apply_headers(lua_State *L, esp_http_client_handle_t client, int options_index)
{
    if (!lua_istable(L, options_index)) {
        return;
    }

    lua_getfield(L, options_index, "headers");
    if (!lua_istable(L, -1)) {
        lua_pop(L, 1);
        return;
    }

    lua_pushnil(L);
    while (lua_next(L, -2) != 0) {
        if (lua_type(L, -2) == LUA_TSTRING && lua_type(L, -1) == LUA_TSTRING) {
            const char *key = lua_tostring(L, -2);
            const char *value = lua_tostring(L, -1);
            if (key != NULL && value != NULL) {
                esp_http_client_set_header(client, key, value);
            }
        }
        lua_pop(L, 1);
    }
    lua_pop(L, 1);
}

static int push_response(lua_State *L, esp_err_t err, esp_http_client_handle_t client, vb_http_response_t *response)
{
    if (err != ESP_OK) {
        lua_pushnil(L);
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }

    lua_newtable(L);
    lua_pushinteger(L, esp_http_client_get_status_code(client));
    lua_setfield(L, -2, "status");
    lua_pushlstring(L, response->body != NULL ? response->body : "", (size_t)response->body_len);
    lua_setfield(L, -2, "body");
    return 1;
}

static void call_callback(lua_State *L, int callback_index, esp_err_t err, esp_http_client_handle_t client, vb_http_response_t *response)
{
    lua_pushvalue(L, callback_index);
    if (err == ESP_OK) {
        lua_pushinteger(L, esp_http_client_get_status_code(client));
        lua_pushlstring(L, response->body != NULL ? response->body : "", (size_t)response->body_len);
    } else {
        lua_pushinteger(L, 0);
        lua_pushnil(L);
    }
    lua_call(L, 2, 0);
}

static esp_err_t perform_get_url(const char *url, int timeout_ms, vb_http_response_t *response, int *status_code)
{
    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .event_handler = http_event_handler,
        .user_data = response,
        .timeout_ms = timeout_ms,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == NULL) {
        return ESP_FAIL;
    }

    esp_err_t err = esp_http_client_perform(client);
    if (status_code != NULL) {
        *status_code = esp_http_client_get_status_code(client);
    }
    esp_http_client_cleanup(client);
    return err;
}

static int perform_request(lua_State *L, esp_http_client_method_t method)
{
    const char *url = luaL_checkstring(L, 1);
    const char *body = NULL;
    size_t body_len = 0;
    int options_index = 2;
    int callback_index = 0;
    if (method == HTTP_METHOD_POST) {
        if (lua_istable(L, 2)) {
            options_index = 2;
            body = luaL_checklstring(L, 3, &body_len);
            if (lua_isfunction(L, 4)) {
                callback_index = 4;
            }
        } else {
            body = luaL_checklstring(L, 2, &body_len);
            options_index = 3;
            if (lua_isfunction(L, 4)) {
                callback_index = 4;
            }
        }
    } else if (lua_isfunction(L, 2)) {
        callback_index = 2;
    } else if (lua_istable(L, 2) && lua_isfunction(L, 3)) {
        options_index = 2;
        callback_index = 3;
    }

    vb_http_response_t response = {0};
    esp_http_client_config_t config = {
        .url = url,
        .method = method,
        .event_handler = http_event_handler,
        .user_data = &response,
        .timeout_ms = get_timeout(L, options_index),
        .crt_bundle_attach = esp_crt_bundle_attach,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == NULL) {
        if (callback_index > 0) {
            lua_pushvalue(L, callback_index);
            lua_pushinteger(L, 0);
            lua_pushnil(L);
            lua_call(L, 2, 0);
            return 0;
        }
        lua_pushnil(L);
        lua_pushliteral(L, "http client init failed");
        return 2;
    }

    apply_headers(L, client, options_index);
    if (method == HTTP_METHOD_POST) {
        if (!lua_istable(L, options_index)) {
            esp_http_client_set_header(client, "Content-Type", "application/json");
        }
        esp_http_client_set_post_field(client, body, (int)body_len);
    }

    esp_err_t err = esp_http_client_perform(client);
    if (callback_index > 0) {
        call_callback(L, callback_index, err, client, &response);
        esp_http_client_cleanup(client);
        free(response.body);
        return 0;
    }

    int results = push_response(L, err, client, &response);
    esp_http_client_cleanup(client);
    free(response.body);
    return results;
}

static bool is_absolute_url(const char *url)
{
    return strncmp(url, "http://", 7) == 0 || strncmp(url, "https://", 8) == 0;
}

static bool load_cubicserver_base_url(char *buffer, size_t buffer_size)
{
    FILE *file = fopen(VB_HTTP_CUBICSERVER_CONFIG_PATH, "rb");
    if (file == NULL) {
        return false;
    }

    char json_text[VB_HTTP_CUBICSERVER_CONFIG_MAX];
    size_t bytes = fread(json_text, 1, sizeof(json_text) - 1, file);
    bool too_large = !feof(file);
    fclose(file);
    if (too_large) {
        return false;
    }
    json_text[bytes] = '\0';

    cJSON *root = cJSON_Parse(json_text);
    if (root == NULL) {
        return false;
    }

    bool loaded = false;
    cJSON *base_url = cJSON_GetObjectItem(root, "base_url");
    if (cJSON_IsString(base_url) && base_url->valuestring != NULL && is_absolute_url(base_url->valuestring)) {
        int written = snprintf(buffer, buffer_size, "%s", base_url->valuestring);
        loaded = written >= 0 && (size_t)written < buffer_size;
    }

    cJSON_Delete(root);
    return loaded;
}

static int build_cubicserver_url(lua_State *L, const char *url, char *buffer, size_t buffer_size)
{
    if (is_absolute_url(url)) {
        int written = snprintf(buffer, buffer_size, "%s", url);
        if (written < 0 || (size_t)written >= buffer_size) {
            return luaL_error(L, "cubicserver url too long");
        }
        return 0;
    }

    char base_url[VB_HTTP_URL_MAX];
    if (!load_cubicserver_base_url(base_url, sizeof(base_url))) {
        return luaL_error(L, "cubicserver base_url missing");
    }

    int written = snprintf(buffer, buffer_size, "%s%s", base_url, url);
    if (written < 0 || (size_t)written >= buffer_size) {
        return luaL_error(L, "cubicserver url too long");
    }
    return 0;
}

static int http_cubicserver_get(lua_State *L)
{
    const char *url = luaL_checkstring(L, 1);
    int options_index = 2;
    int callback_index = 3;
    if (lua_isfunction(L, 2)) {
        callback_index = 2;
        options_index = 0;
    } else {
        luaL_checktype(L, 3, LUA_TFUNCTION);
    }

    char full_url[VB_HTTP_URL_MAX];
    build_cubicserver_url(L, url, full_url, sizeof(full_url));

    vb_http_response_t response = {0};
    int status_code = 0;
    esp_err_t err = perform_get_url(full_url, get_timeout(L, options_index), &response, &status_code);

    lua_pushvalue(L, callback_index);
    if (err == ESP_OK) {
        lua_pushinteger(L, status_code);
        lua_pushlstring(L, response.body != NULL ? response.body : "", (size_t)response.body_len);
        lua_newtable(L);
    } else {
        lua_pushinteger(L, 0);
        lua_pushnil(L);
        lua_newtable(L);
        lua_pushstring(L, esp_err_to_name(err));
        lua_setfield(L, -2, "error");
    }

    free(response.body);
    lua_call(L, 3, 0);
    return 0;
}

static int http_get(lua_State *L)
{
    return perform_request(L, HTTP_METHOD_GET);
}

static int http_post(lua_State *L)
{
    return perform_request(L, HTTP_METHOD_POST);
}

void vb_lua_http_register(lua_State *L)
{
    static const luaL_Reg http_functions[] = {
        {"get", http_get},
        {"post", http_post},
        {NULL, NULL},
    };
    static const luaL_Reg cubicserver_functions[] = {
        {"get", http_cubicserver_get},
        {NULL, NULL},
    };
    luaL_newlib(L, http_functions);
    luaL_newlib(L, cubicserver_functions);
    lua_setfield(L, -2, "cubicserver");
    lua_setglobal(L, "http");
}
