#include "lua_key.h"

#include <stdbool.h>
#include <stddef.h>
#include <string.h>

#include "driver/gpio.h"
#include "esp_log.h"
#include "lauxlib.h"
#include "lua.h"

static const char *TAG = "lua_key";

#define VB_LUA_KEY_BOOT_GPIO GPIO_NUM_0
#define VB_LUA_KEY_DEBOUNCE_MS 80
#define VB_LUA_KEY_LONG_START_MS 800
#define VB_LUA_KEY_LONG_REPEAT_MS 200

#define VB_LUA_KEY_LEFT 1
#define VB_LUA_KEY_RIGHT 2
#define VB_LUA_KEY_UP 3
#define VB_LUA_KEY_DOWN 4
#define VB_LUA_KEY_HOME 5

#define VB_LUA_KEY_EVENT_START 101
#define VB_LUA_KEY_EVENT_SHORT 102
#define VB_LUA_KEY_EVENT_LONG_START 103
#define VB_LUA_KEY_EVENT_LONG_REPEAT 104
#define VB_LUA_KEY_EVENT_LONG_END 105
#define VB_LUA_KEY_EVENT_EXIT 106

#define VB_LUA_KEY_STATE_REGISTRY_KEY "vb_key_state"

static vb_lua_key_state_t *get_state(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, VB_LUA_KEY_STATE_REGISTRY_KEY);
    vb_lua_key_state_t *state = (vb_lua_key_state_t *)lua_touserdata(L, -1);
    lua_pop(L, 1);
    return state;
}

static int key_on(lua_State *L)
{
    vb_lua_key_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "key state unavailable");
    }

    int callback_index = 1;
    int filter_code = 0;
    if (lua_isinteger(L, 1)) {
        filter_code = (int)lua_tointeger(L, 1);
        if (filter_code <= 0 || filter_code >= VB_LUA_KEY_MAX_CODE) {
            return luaL_error(L, "invalid key code");
        }
        callback_index = 2;
    }
    luaL_checktype(L, callback_index, LUA_TFUNCTION);

    int *callback_ref = filter_code == 0 ? &state->global_callback_ref : &state->callback_refs[filter_code];
    if (*callback_ref != LUA_NOREF) {
        luaL_unref(L, LUA_REGISTRYINDEX, *callback_ref);
    }
    lua_pushvalue(L, callback_index);
    *callback_ref = luaL_ref(L, LUA_REGISTRYINDEX);
    ESP_LOGI(TAG, "key handler registered");
    return 0;
}

static int key_off(lua_State *L)
{
    vb_lua_key_state_t *state = get_state(L);
    if (state == NULL) {
        return 0;
    }
    if (lua_isinteger(L, 1)) {
        int code = (int)lua_tointeger(L, 1);
        if (code > 0 && code < VB_LUA_KEY_MAX_CODE && state->callback_refs[code] != LUA_NOREF) {
            luaL_unref(L, LUA_REGISTRYINDEX, state->callback_refs[code]);
            state->callback_refs[code] = LUA_NOREF;
        }
        return 0;
    }
    if (state->global_callback_ref != LUA_NOREF) {
        luaL_unref(L, LUA_REGISTRYINDEX, state->global_callback_ref);
        state->global_callback_ref = LUA_NOREF;
    }
    for (int i = 0; i < VB_LUA_KEY_MAX_CODE; i++) {
        if (state->callback_refs[i] != LUA_NOREF) {
            luaL_unref(L, LUA_REGISTRYINDEX, state->callback_refs[i]);
            state->callback_refs[i] = LUA_NOREF;
        }
    }
    state->was_pressed = false;
    state->long_started = false;
    return 0;
}

void vb_lua_key_init(vb_lua_key_state_t *state)
{
    if (state == NULL) {
        return;
    }
    memset(state, 0, sizeof(*state));
    state->global_callback_ref = LUA_NOREF;
    for (int i = 0; i < VB_LUA_KEY_MAX_CODE; i++) {
        state->callback_refs[i] = LUA_NOREF;
    }
}

void vb_lua_key_register(lua_State *L, vb_lua_key_state_t *state)
{
    lua_pushlightuserdata(L, state);
    lua_setfield(L, LUA_REGISTRYINDEX, VB_LUA_KEY_STATE_REGISTRY_KEY);

    const gpio_config_t config = {
        .pin_bit_mask = BIT64(VB_LUA_KEY_BOOT_GPIO),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&config);

    static const luaL_Reg key_functions[] = {
        {"on", key_on},
        {"off", key_off},
        {NULL, NULL},
    };
    luaL_newlib(L, key_functions);
    lua_pushinteger(L, VB_LUA_KEY_LEFT);
    lua_setfield(L, -2, "LEFT");
    lua_pushinteger(L, VB_LUA_KEY_RIGHT);
    lua_setfield(L, -2, "RIGHT");
    lua_pushinteger(L, VB_LUA_KEY_UP);
    lua_setfield(L, -2, "UP");
    lua_pushinteger(L, VB_LUA_KEY_DOWN);
    lua_setfield(L, -2, "DOWN");
    lua_pushinteger(L, VB_LUA_KEY_HOME);
    lua_setfield(L, -2, "HOME");
    lua_pushinteger(L, VB_LUA_KEY_EVENT_START);
    lua_setfield(L, -2, "START");
    lua_pushinteger(L, VB_LUA_KEY_EVENT_SHORT);
    lua_setfield(L, -2, "SHORT");
    lua_pushinteger(L, VB_LUA_KEY_EVENT_LONG_START);
    lua_setfield(L, -2, "LONG_START");
    lua_pushinteger(L, VB_LUA_KEY_EVENT_LONG_REPEAT);
    lua_setfield(L, -2, "LONG_REPEAT");
    lua_pushinteger(L, VB_LUA_KEY_EVENT_LONG_END);
    lua_setfield(L, -2, "LONG_END");
    lua_pushinteger(L, VB_LUA_KEY_EVENT_EXIT);
    lua_setfield(L, -2, "EXIT");
    lua_setglobal(L, "key");
}

bool vb_lua_key_has_handlers(const vb_lua_key_state_t *state)
{
    if (state == NULL) {
        return false;
    }
    if (state->global_callback_ref != LUA_NOREF) {
        return true;
    }
    for (int i = 0; i < VB_LUA_KEY_MAX_CODE; i++) {
        if (state->callback_refs[i] != LUA_NOREF) {
            return true;
        }
    }
    return false;
}

static esp_err_t call_key_callback(lua_State *L,
                                   int callback_ref,
                                   int code,
                                   int event_type,
                                   TickType_t now,
                                   bool include_code,
                                   char *error,
                                   size_t error_size)
{
    if (callback_ref == LUA_NOREF) {
        return ESP_OK;
    }

    lua_rawgeti(L, LUA_REGISTRYINDEX, callback_ref);
    if (include_code) {
        lua_pushinteger(L, code);
        lua_pushinteger(L, event_type);
        lua_pushinteger(L, (lua_Integer)pdTICKS_TO_MS(now));
        if (lua_pcall(L, 3, 0, 0) != LUA_OK) {
            const char *err = lua_tostring(L, -1);
            ESP_LOGE(TAG, "Lua key failed: %s", err ? err : "unknown error");
            if (error != NULL && error_size > 0) {
                strlcpy(error, err ? err : "lua key failed", error_size);
            }
            return ESP_FAIL;
        }
    } else {
        lua_pushinteger(L, event_type);
        lua_pushinteger(L, (lua_Integer)pdTICKS_TO_MS(now));
        if (lua_pcall(L, 2, 0, 0) != LUA_OK) {
            const char *err = lua_tostring(L, -1);
            ESP_LOGE(TAG, "Lua key failed: %s", err ? err : "unknown error");
            if (error != NULL && error_size > 0) {
                strlcpy(error, err ? err : "lua key failed", error_size);
            }
            return ESP_FAIL;
        }
    }
    return ESP_OK;
}

static esp_err_t dispatch_key_event(lua_State *L,
                                    vb_lua_key_state_t *state,
                                    int code,
                                    int event_type,
                                    TickType_t now,
                                    char *error,
                                    size_t error_size)
{
    esp_err_t err = call_key_callback(L,
                                      state->global_callback_ref,
                                      code,
                                      event_type,
                                      now,
                                      true,
                                      error,
                                      error_size);
    if (err != ESP_OK) {
        return err;
    }
    if (code > 0 && code < VB_LUA_KEY_MAX_CODE) {
        return call_key_callback(L,
                                 state->callback_refs[code],
                                 code,
                                 event_type,
                                 now,
                                 false,
                                 error,
                                 error_size);
    }
    return ESP_OK;
}

esp_err_t vb_lua_key_poll(lua_State *L, vb_lua_key_state_t *state, char *error, size_t error_size)
{
    if (!vb_lua_key_has_handlers(state)) {
        return ESP_OK;
    }

    TickType_t now = xTaskGetTickCount();
    bool pressed = gpio_get_level(VB_LUA_KEY_BOOT_GPIO) == 0;
    int code = VB_LUA_KEY_HOME;

    if (pressed && !state->was_pressed) {
        state->pressed_at = now;
        state->repeat_at = now + pdMS_TO_TICKS(VB_LUA_KEY_LONG_START_MS + VB_LUA_KEY_LONG_REPEAT_MS);
        state->long_started = false;
        state->was_pressed = true;
        return dispatch_key_event(L, state, code, VB_LUA_KEY_EVENT_START, now, error, error_size);
    }

    if (pressed && state->was_pressed) {
        TickType_t held = now - state->pressed_at;
        if (!state->long_started && held >= pdMS_TO_TICKS(VB_LUA_KEY_LONG_START_MS)) {
            state->long_started = true;
            return dispatch_key_event(L, state, code, VB_LUA_KEY_EVENT_LONG_START, now, error, error_size);
        }
        if (state->long_started && (int32_t)(now - state->repeat_at) >= 0) {
            state->repeat_at = now + pdMS_TO_TICKS(VB_LUA_KEY_LONG_REPEAT_MS);
            return dispatch_key_event(L, state, code, VB_LUA_KEY_EVENT_LONG_REPEAT, now, error, error_size);
        }
        return ESP_OK;
    }

    if (!pressed && state->was_pressed) {
        TickType_t held = now - state->pressed_at;
        state->was_pressed = false;
        if (held < pdMS_TO_TICKS(VB_LUA_KEY_DEBOUNCE_MS)) {
            state->long_started = false;
            return ESP_OK;
        }
        int event_type = state->long_started ? VB_LUA_KEY_EVENT_LONG_END : VB_LUA_KEY_EVENT_SHORT;
        state->long_started = false;
        return dispatch_key_event(L, state, code, event_type, now, error, error_size);
    }

    return ESP_OK;
}

void vb_lua_key_cleanup(lua_State *L, vb_lua_key_state_t *state)
{
    if (state == NULL) {
        return;
    }
    if (state->global_callback_ref != LUA_NOREF) {
        luaL_unref(L, LUA_REGISTRYINDEX, state->global_callback_ref);
    }
    for (int i = 0; i < VB_LUA_KEY_MAX_CODE; i++) {
        if (state->callback_refs[i] != LUA_NOREF) {
            luaL_unref(L, LUA_REGISTRYINDEX, state->callback_refs[i]);
        }
    }
    vb_lua_key_init(state);
}
