#include "lua_key.h"

#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "freertos/timers.h"
#include "lauxlib.h"

#define VB_LUA_KEY_STATE_REGISTRY_KEY "vb_key_state"
#define VB_LUA_KEY_REPEAT_DELAY_MS 450
#define VB_LUA_KEY_REPEAT_INTERVAL_MS 120

typedef struct {
    vb_lua_key_state_t *state;
    int code;
    int interval_ms;
} vb_lua_key_repeater_t;

static vb_lua_key_state_t *get_state(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, VB_LUA_KEY_STATE_REGISTRY_KEY);
    vb_lua_key_state_t *state = (vb_lua_key_state_t *)lua_touserdata(L, -1);
    lua_pop(L, 1);
    return state;
}

static void init_refs(vb_lua_key_state_t *state)
{
    state->global_ref = LUA_NOREF;
    for (int i = 0; i <= VB_LUA_KEY_CODE_MAX; i++) {
        state->refs[i] = LUA_NOREF;
    }
}

static int now_ms(void)
{
    return (int)(xTaskGetTickCount() * 1000 / configTICK_RATE_HZ);
}

static int repeat_slot_for(vb_lua_key_state_t *state, int code, bool allocate)
{
    int free_slot = -1;
    for (int i = 0; i < VB_LUA_KEY_MAX_REPEATERS; i++) {
        if (state->repeat_timers[i] != NULL && state->repeat_codes[i] == code) {
            return i;
        }
        if (free_slot < 0 && state->repeat_timers[i] == NULL) {
            free_slot = i;
        }
    }
    return allocate ? free_slot : -1;
}

static void unref_handler(lua_State *L, int *ref)
{
    if (ref != NULL && *ref != LUA_NOREF) {
        luaL_unref(L, LUA_REGISTRYINDEX, *ref);
        *ref = LUA_NOREF;
    }
}

static int store_handler(lua_State *L, int callback_index, int *ref)
{
    unref_handler(L, ref);
    lua_pushvalue(L, callback_index);
    *ref = luaL_ref(L, LUA_REGISTRYINDEX);
    lua_pushboolean(L, 1);
    return 1;
}

static int key_on(lua_State *L)
{
    vb_lua_key_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "key state unavailable");
    }

    if (lua_isfunction(L, 1)) {
        return store_handler(L, 1, &state->global_ref);
    }

    int code = (int)luaL_checkinteger(L, 1);
    luaL_checktype(L, 2, LUA_TFUNCTION);
    if (code < 0 || code > VB_LUA_KEY_CODE_MAX) {
        return luaL_error(L, "invalid key code");
    }

    return store_handler(L, 2, &state->refs[code]);
}

static int key_off(lua_State *L)
{
    vb_lua_key_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "key state unavailable");
    }

    if (lua_gettop(L) == 0 || lua_isnil(L, 1)) {
        unref_handler(L, &state->global_ref);
        for (int i = 0; i <= VB_LUA_KEY_CODE_MAX; i++) {
            unref_handler(L, &state->refs[i]);
        }
        return 0;
    }

    int code = (int)luaL_checkinteger(L, 1);
    if (code < 0 || code > VB_LUA_KEY_CODE_MAX) {
        return luaL_error(L, "invalid key code");
    }

    unref_handler(L, &state->refs[code]);
    return 0;
}

static int call_ref(lua_State *L, int ref, int args)
{
    if (ref == LUA_NOREF) {
        return 0;
    }

    lua_rawgeti(L, LUA_REGISTRYINDEX, ref);
    lua_insert(L, -1 - args);
    if (lua_pcall(L, args, 0, 0) != LUA_OK) {
        return lua_error(L);
    }
    return 0;
}

static int dispatch_event(lua_State *L, vb_lua_key_state_t *state, int code, int event, int timestamp)
{
    if (state == NULL) {
        return luaL_error(L, "key state unavailable");
    }
    if (code < 0 || code > VB_LUA_KEY_CODE_MAX) {
        return luaL_error(L, "invalid key code");
    }

    /* Default timestamp is compatible with upstream Lua tmr.now expectations. */
    const char *timestamp_semantics = "tmr.now";
    (void)timestamp_semantics;

    if (state->global_ref != LUA_NOREF) {
        lua_pushinteger(L, code);
        lua_pushinteger(L, event);
        lua_pushinteger(L, timestamp);
        call_ref(L, state->global_ref, 3);
    }

    if (state->refs[code] != LUA_NOREF) {
        lua_pushinteger(L, event);
        lua_pushinteger(L, timestamp);
        call_ref(L, state->refs[code], 2);
    }

    lua_pushboolean(L, 1);
    return 1;
}

static int key_push(lua_State *L)
{
    vb_lua_key_state_t *state = get_state(L);
    int code = (int)luaL_checkinteger(L, 1);
    int event = (int)luaL_optinteger(L, 2, VB_LUA_KEY_START);
    int timestamp = (int)luaL_optinteger(L, 3, now_ms());
    return dispatch_event(L, state, code, event, timestamp);
}

static void key_repeat_timer_cb(TimerHandle_t timer)
{
    vb_lua_key_repeater_t *repeater = (vb_lua_key_repeater_t *)pvTimerGetTimerID(timer);
    if (repeater == NULL || repeater->state == NULL) {
        return;
    }
    vb_lua_key_enqueue(repeater->state, repeater->code, VB_LUA_KEY_LONG_REPEAT, now_ms());
    xTimerChangePeriod(timer, pdMS_TO_TICKS(repeater->interval_ms), 0);
}

static int key_repeat_start(lua_State *L)
{
    vb_lua_key_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "key state unavailable");
    }

    int code = (int)luaL_checkinteger(L, 1);
    int delay_ms = (int)luaL_optinteger(L, 2, VB_LUA_KEY_REPEAT_DELAY_MS);
    int interval_ms = (int)luaL_optinteger(L, 3, VB_LUA_KEY_REPEAT_INTERVAL_MS);
    if (code < 0 || code > VB_LUA_KEY_CODE_MAX) {
        return luaL_error(L, "invalid key code");
    }
    if (delay_ms < 1 || interval_ms < 1) {
        return luaL_error(L, "invalid repeat timing");
    }

    int slot = repeat_slot_for(state, code, true);
    if (slot < 0) {
        return luaL_error(L, "too many key repeaters");
    }

    TimerHandle_t timer = (TimerHandle_t)state->repeat_timers[slot];
    vb_lua_key_repeater_t *repeater = NULL;
    if (timer == NULL) {
        repeater = calloc(1, sizeof(*repeater));
        if (repeater == NULL) {
            return luaL_error(L, "key repeater allocation failed");
        }
        repeater->state = state;
        repeater->code = code;
        repeater->interval_ms = interval_ms;
        timer = xTimerCreate("vb_key_repeat",
                             pdMS_TO_TICKS(delay_ms),
                             pdTRUE,
                             repeater,
                             key_repeat_timer_cb);
        if (timer == NULL) {
            free(repeater);
            return luaL_error(L, "key repeat timer allocation failed");
        }
        state->repeat_timers[slot] = timer;
        state->repeat_codes[slot] = code;
    } else {
        repeater = (vb_lua_key_repeater_t *)pvTimerGetTimerID(timer);
        if (repeater != NULL) {
            repeater->state = state;
            repeater->code = code;
            repeater->interval_ms = interval_ms;
        }
        xTimerStop(timer, 0);
        xTimerChangePeriod(timer, pdMS_TO_TICKS(delay_ms), 0);
    }

    vb_lua_key_enqueue(state, code, VB_LUA_KEY_LONG_START, now_ms());
    if (xTimerStart(timer, 0) != pdPASS) {
        return luaL_error(L, "key repeat timer start failed");
    }
    lua_pushboolean(L, 1);
    return 1;
}

static int key_repeat_stop(lua_State *L)
{
    vb_lua_key_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "key state unavailable");
    }

    int code = (int)luaL_checkinteger(L, 1);
    if (code < 0 || code > VB_LUA_KEY_CODE_MAX) {
        return luaL_error(L, "invalid key code");
    }

    int slot = repeat_slot_for(state, code, false);
    if (slot >= 0 && state->repeat_timers[slot] != NULL) {
        TimerHandle_t timer = (TimerHandle_t)state->repeat_timers[slot];
        vb_lua_key_repeater_t *repeater = (vb_lua_key_repeater_t *)pvTimerGetTimerID(timer);
        xTimerStop(timer, 0);
        xTimerDelete(timer, 0);
        free(repeater);
        state->repeat_timers[slot] = NULL;
        state->repeat_codes[slot] = -1;
    }
    vb_lua_key_enqueue(state, code, VB_LUA_KEY_LONG_END, now_ms());
    lua_pushboolean(L, slot >= 0);
    return 1;
}

void vb_lua_key_init(vb_lua_key_state_t *state)
{
    if (state == NULL) {
        return;
    }

    memset(state, 0, sizeof(*state));
    init_refs(state);
    for (int i = 0; i < VB_LUA_KEY_MAX_REPEATERS; i++) {
        state->repeat_codes[i] = -1;
    }
    state->queue = xQueueCreate(VB_LUA_KEY_QUEUE_DEPTH, sizeof(vb_lua_key_event_t));
}

esp_err_t vb_lua_key_enqueue(vb_lua_key_state_t *state, int code, int event, int timestamp_ms)
{
    if (state == NULL || state->queue == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    if (code < 0 || code > VB_LUA_KEY_CODE_MAX) {
        return ESP_ERR_INVALID_ARG;
    }

    vb_lua_key_event_t pending = {
        .code = code,
        .event = event,
        .timestamp_ms = timestamp_ms > 0 ? timestamp_ms : now_ms(),
    };
    QueueHandle_t queue = (QueueHandle_t)state->queue;
    return xQueueSend(queue, &pending, 0) == pdTRUE ? ESP_OK : ESP_ERR_NO_MEM;
}

int vb_lua_key_process_pending(lua_State *L, vb_lua_key_state_t *state)
{
    if (L == NULL || state == NULL || state->queue == NULL) {
        return 0;
    }

    QueueHandle_t queue = (QueueHandle_t)state->queue;
    vb_lua_key_event_t pending;
    while (xQueueReceive(queue, &pending, 0) == pdTRUE) {
        int top = lua_gettop(L);
        int result = dispatch_event(L, state, pending.code, pending.event, pending.timestamp_ms);
        if (result != 1) {
            lua_settop(L, top);
            return result;
        }
        lua_pop(L, 1);
    }
    return 0;
}

void vb_lua_key_cleanup(lua_State *L, vb_lua_key_state_t *state)
{
    if (state == NULL) {
        return;
    }
    unref_handler(L, &state->global_ref);
    for (int i = 0; i <= VB_LUA_KEY_CODE_MAX; i++) {
        unref_handler(L, &state->refs[i]);
    }
    for (int i = 0; i < VB_LUA_KEY_MAX_REPEATERS; i++) {
        TimerHandle_t timer = (TimerHandle_t)state->repeat_timers[i];
        if (timer != NULL) {
            vb_lua_key_repeater_t *repeater = (vb_lua_key_repeater_t *)pvTimerGetTimerID(timer);
            xTimerStop(timer, 0);
            xTimerDelete(timer, 0);
            free(repeater);
            state->repeat_timers[i] = NULL;
        }
        state->repeat_codes[i] = -1;
    }
    if (state->queue != NULL) {
        vQueueDelete((QueueHandle_t)state->queue);
        state->queue = NULL;
    }
}

void vb_lua_key_register(lua_State *L, vb_lua_key_state_t *state)
{
    if (state == NULL) {
        return;
    }
    if (state->queue == NULL) {
        vb_lua_key_init(state);
    }
    init_refs(state);
    xQueueReset((QueueHandle_t)state->queue);

    lua_pushlightuserdata(L, state);
    lua_setfield(L, LUA_REGISTRYINDEX, VB_LUA_KEY_STATE_REGISTRY_KEY);

    static const luaL_Reg key_functions[] = {
        {"on", key_on},
        {"off", key_off},
        {"push", key_push},
        {"repeat_start", key_repeat_start},
        {"repeat_stop", key_repeat_stop},
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
    lua_pushinteger(L, VB_LUA_KEY_EXIT);
    lua_setfield(L, -2, "EXIT");

    lua_pushinteger(L, VB_LUA_KEY_START);
    lua_setfield(L, -2, "START");
    lua_pushinteger(L, VB_LUA_KEY_SHORT);
    lua_setfield(L, -2, "SHORT");
    lua_pushinteger(L, VB_LUA_KEY_LONG_START);
    lua_setfield(L, -2, "LONG_START");
    lua_pushinteger(L, VB_LUA_KEY_LONG_REPEAT);
    lua_setfield(L, -2, "LONG_REPEAT");
    lua_pushinteger(L, VB_LUA_KEY_LONG_END);
    lua_setfield(L, -2, "LONG_END");

    lua_setglobal(L, "key");
}
