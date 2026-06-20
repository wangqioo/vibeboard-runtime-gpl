#include "lua_touch.h"

#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "lauxlib.h"

#define VB_LUA_TOUCH_STATE_REGISTRY_KEY "vb_touch_state"

static vb_lua_touch_state_t *get_state(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, VB_LUA_TOUCH_STATE_REGISTRY_KEY);
    vb_lua_touch_state_t *state = (vb_lua_touch_state_t *)lua_touserdata(L, -1);
    lua_pop(L, 1);
    return state;
}

static int now_ms(void)
{
    return (int)(xTaskGetTickCount() * 1000 / configTICK_RATE_HZ);
}

static void unref_handler(lua_State *L, int *ref)
{
    if (ref != NULL && *ref != LUA_NOREF) {
        luaL_unref(L, LUA_REGISTRYINDEX, *ref);
        *ref = LUA_NOREF;
    }
}

static int touch_on(lua_State *L)
{
    vb_lua_touch_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "touch state unavailable");
    }
    luaL_checktype(L, 1, LUA_TFUNCTION);
    unref_handler(L, &state->global_ref);
    lua_pushvalue(L, 1);
    state->global_ref = luaL_ref(L, LUA_REGISTRYINDEX);
    lua_pushboolean(L, 1);
    return 1;
}

static int touch_off(lua_State *L)
{
    vb_lua_touch_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "touch state unavailable");
    }
    unref_handler(L, &state->global_ref);
    return 0;
}

static int dispatch_event(lua_State *L, vb_lua_touch_state_t *state, int event, int x, int y, int timestamp)
{
    if (state == NULL) {
        return luaL_error(L, "touch state unavailable");
    }
    if (event < VB_LUA_TOUCH_DOWN || event > VB_LUA_TOUCH_UP) {
        return luaL_error(L, "invalid touch event");
    }

    if (state->global_ref != LUA_NOREF) {
        lua_rawgeti(L, LUA_REGISTRYINDEX, state->global_ref);
        lua_pushinteger(L, event);
        lua_pushinteger(L, x);
        lua_pushinteger(L, y);
        lua_pushinteger(L, timestamp);
        if (lua_pcall(L, 4, 0, 0) != LUA_OK) {
            return lua_error(L);
        }
    }

    lua_pushboolean(L, 1);
    return 1;
}

static int touch_push(lua_State *L)
{
    vb_lua_touch_state_t *state = get_state(L);
    int event = (int)luaL_checkinteger(L, 1);
    int x = (int)luaL_checkinteger(L, 2);
    int y = (int)luaL_checkinteger(L, 3);
    int timestamp = (int)luaL_optinteger(L, 4, now_ms());
    return dispatch_event(L, state, event, x, y, timestamp);
}

void vb_lua_touch_init(vb_lua_touch_state_t *state)
{
    if (state == NULL) {
        return;
    }

    memset(state, 0, sizeof(*state));
    state->global_ref = LUA_NOREF;
    state->queue = xQueueCreate(VB_LUA_TOUCH_QUEUE_DEPTH, sizeof(vb_lua_touch_event_t));
}

esp_err_t vb_lua_touch_enqueue(vb_lua_touch_state_t *state, int event, int x, int y, int timestamp_ms)
{
    if (state == NULL || state->queue == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    if (event < VB_LUA_TOUCH_DOWN || event > VB_LUA_TOUCH_UP) {
        return ESP_ERR_INVALID_ARG;
    }

    vb_lua_touch_event_t pending = {
        .event = event,
        .x = x,
        .y = y,
        .timestamp_ms = timestamp_ms > 0 ? timestamp_ms : now_ms(),
    };
    QueueHandle_t queue = (QueueHandle_t)state->queue;
    return xQueueSend(queue, &pending, 0) == pdTRUE ? ESP_OK : ESP_ERR_NO_MEM;
}

int vb_lua_touch_process_pending(lua_State *L, vb_lua_touch_state_t *state)
{
    if (L == NULL || state == NULL || state->queue == NULL) {
        return 0;
    }

    QueueHandle_t queue = (QueueHandle_t)state->queue;
    vb_lua_touch_event_t pending;
    while (xQueueReceive(queue, &pending, 0) == pdTRUE) {
        int top = lua_gettop(L);
        int result = dispatch_event(L, state, pending.event, pending.x, pending.y, pending.timestamp_ms);
        if (result != 1) {
            lua_settop(L, top);
            return result;
        }
        lua_pop(L, 1);
    }
    return 0;
}

void vb_lua_touch_cleanup(lua_State *L, vb_lua_touch_state_t *state)
{
    if (state == NULL) {
        return;
    }
    unref_handler(L, &state->global_ref);
    if (state->queue != NULL) {
        vQueueDelete((QueueHandle_t)state->queue);
        state->queue = NULL;
    }
}

void vb_lua_touch_register(lua_State *L, vb_lua_touch_state_t *state)
{
    if (state == NULL) {
        return;
    }
    if (state->queue == NULL) {
        vb_lua_touch_init(state);
    }
    state->global_ref = LUA_NOREF;
    xQueueReset((QueueHandle_t)state->queue);

    lua_pushlightuserdata(L, state);
    lua_setfield(L, LUA_REGISTRYINDEX, VB_LUA_TOUCH_STATE_REGISTRY_KEY);

    static const luaL_Reg touch_functions[] = {
        {"on", touch_on},
        {"off", touch_off},
        {"push", touch_push},
        {NULL, NULL},
    };
    luaL_newlib(L, touch_functions);

    lua_pushinteger(L, VB_LUA_TOUCH_DOWN);
    lua_setfield(L, -2, "DOWN");
    lua_pushinteger(L, VB_LUA_TOUCH_MOVE);
    lua_setfield(L, -2, "MOVE");
    lua_pushinteger(L, VB_LUA_TOUCH_UP);
    lua_setfield(L, -2, "UP");

    lua_setglobal(L, "touch");
}
