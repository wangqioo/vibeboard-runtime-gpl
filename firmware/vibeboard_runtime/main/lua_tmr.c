#include "lua_tmr.h"

#include <stdbool.h>
#include <stddef.h>
#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lauxlib.h"
#include "lua.h"

static const char *TAG = "lua_tmr";

#define VB_LUA_TMR_MIN_MS 10
#define VB_LUA_TMR_IDLE_EXIT_TICKS 2

#define TMR_ALARM_SINGLE 0
#define TMR_ALARM_SEMI 1
#define TMR_ALARM_AUTO 2

#define VB_LUA_TMR_STATE_REGISTRY_KEY "vb_tmr_state"
#define VB_LUA_TIMER_META "vb.timer"

typedef struct {
    int index;
} vb_lua_timer_handle_t;

static vb_lua_tmr_state_t *get_state(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, VB_LUA_TMR_STATE_REGISTRY_KEY);
    vb_lua_tmr_state_t *state = (vb_lua_tmr_state_t *)lua_touserdata(L, -1);
    lua_pop(L, 1);
    return state;
}

static vb_lua_timer_handle_t *check_timer(lua_State *L, int index)
{
    return (vb_lua_timer_handle_t *)luaL_checkudata(L, index, VB_LUA_TIMER_META);
}

static vb_lua_timer_t *timer_from_handle(lua_State *L, vb_lua_timer_handle_t *handle)
{
    vb_lua_tmr_state_t *state = get_state(L);
    if (state == NULL || handle == NULL || handle->index < 0 || handle->index >= VB_LUA_TMR_MAX) {
        luaL_error(L, "invalid timer");
    }
    vb_lua_timer_t *timer = &state->timers[handle->index];
    if (!timer->allocated) {
        luaL_error(L, "timer unregistered");
    }
    return timer;
}

static int tmr_now(lua_State *L)
{
    int64_t now_us = (int64_t)xTaskGetTickCount() * 1000000 / configTICK_RATE_HZ;
    lua_pushinteger(L, (lua_Integer)now_us);
    return 1;
}

static int tmr_time(lua_State *L)
{
    lua_pushinteger(L, (lua_Integer)(xTaskGetTickCount() / configTICK_RATE_HZ));
    return 1;
}

static int millis(lua_State *L)
{
    lua_pushinteger(L, (lua_Integer)(xTaskGetTickCount() * 1000 / configTICK_RATE_HZ));
    return 1;
}

static int tmr_create(lua_State *L)
{
    vb_lua_tmr_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "tmr state unavailable");
    }

    for (int i = 0; i < VB_LUA_TMR_MAX; i++) {
        vb_lua_timer_t *timer = &state->timers[i];
        if (!timer->allocated) {
            memset(timer, 0, sizeof(*timer));
            timer->allocated = true;
            timer->callback_ref = LUA_NOREF;

            vb_lua_timer_handle_t *handle = (vb_lua_timer_handle_t *)lua_newuserdata(L, sizeof(*handle));
            handle->index = i;
            luaL_getmetatable(L, VB_LUA_TIMER_META);
            lua_setmetatable(L, -2);
            return 1;
        }
    }

    return luaL_error(L, "too many timers");
}

static int timer_alarm(lua_State *L)
{
    vb_lua_timer_handle_t *handle = check_timer(L, 1);
    int period_ms = (int)luaL_checkinteger(L, 2);
    int mode = (int)luaL_checkinteger(L, 3);
    luaL_checktype(L, 4, LUA_TFUNCTION);

    if (period_ms < VB_LUA_TMR_MIN_MS) {
        return luaL_error(L, "interval too small");
    }
    if (mode != TMR_ALARM_SINGLE && mode != TMR_ALARM_SEMI && mode != TMR_ALARM_AUTO) {
        return luaL_error(L, "invalid timer mode");
    }

    vb_lua_timer_t *timer = timer_from_handle(L, handle);
    if (timer->callback_ref != LUA_NOREF) {
        luaL_unref(L, LUA_REGISTRYINDEX, timer->callback_ref);
    }

    lua_pushvalue(L, 4);
    timer->callback_ref = luaL_ref(L, LUA_REGISTRYINDEX);
    timer->period_ms = period_ms;
    timer->mode = mode;
    timer->active = true;
    timer->last_run = xTaskGetTickCount();

    lua_pushboolean(L, 1);
    return 1;
}

static int timer_stop(lua_State *L)
{
    vb_lua_timer_handle_t *handle = check_timer(L, 1);
    vb_lua_timer_t *timer = timer_from_handle(L, handle);
    timer->active = false;
    lua_pushboolean(L, 1);
    return 1;
}

static int timer_start(lua_State *L)
{
    vb_lua_timer_handle_t *handle = check_timer(L, 1);
    vb_lua_timer_t *timer = timer_from_handle(L, handle);
    if (timer->callback_ref == LUA_NOREF) {
        lua_pushboolean(L, 0);
        return 1;
    }
    timer->active = true;
    timer->last_run = xTaskGetTickCount();
    lua_pushboolean(L, 1);
    return 1;
}

static int timer_unregister(lua_State *L)
{
    vb_lua_timer_handle_t *handle = check_timer(L, 1);
    vb_lua_timer_t *timer = timer_from_handle(L, handle);

    if (timer->callback_ref != LUA_NOREF) {
        luaL_unref(L, LUA_REGISTRYINDEX, timer->callback_ref);
    }
    memset(timer, 0, sizeof(*timer));
    timer->callback_ref = LUA_NOREF;
    handle->index = -1;
    return 0;
}

static int timer_state(lua_State *L)
{
    vb_lua_timer_handle_t *handle = check_timer(L, 1);
    vb_lua_timer_t *timer = timer_from_handle(L, handle);
    if (timer->callback_ref == LUA_NOREF) {
        lua_pushnil(L);
        return 1;
    }
    lua_pushboolean(L, timer->active);
    lua_pushinteger(L, timer->mode);
    return 2;
}

static int timer_interval(lua_State *L)
{
    vb_lua_timer_handle_t *handle = check_timer(L, 1);
    int period_ms = (int)luaL_checkinteger(L, 2);
    if (period_ms < VB_LUA_TMR_MIN_MS) {
        return luaL_error(L, "interval too small");
    }
    vb_lua_timer_t *timer = timer_from_handle(L, handle);
    timer->period_ms = period_ms;
    return 0;
}

static int set_interval(lua_State *L)
{
    int period_ms = (int)luaL_checkinteger(L, 1);
    luaL_checktype(L, 2, LUA_TFUNCTION);

    lua_getglobal(L, "tmr");
    lua_getfield(L, -1, "create");
    lua_call(L, 0, 1);

    lua_pushvalue(L, -1);
    lua_getfield(L, -1, "alarm");
    lua_insert(L, -2);
    lua_pushinteger(L, period_ms);
    lua_pushinteger(L, TMR_ALARM_AUTO);
    lua_pushvalue(L, 2);
    lua_call(L, 4, 1);
    lua_pop(L, 1);
    return 1;
}

void vb_lua_tmr_init(vb_lua_tmr_state_t *state)
{
    if (state == NULL) {
        return;
    }
    memset(state, 0, sizeof(*state));
    for (int i = 0; i < VB_LUA_TMR_MAX; i++) {
        state->timers[i].callback_ref = LUA_NOREF;
    }
}

void vb_lua_tmr_set_stop_flag(vb_lua_tmr_state_t *state, volatile bool *stop_requested)
{
    if (state == NULL) {
        return;
    }
    state->stop_requested = stop_requested;
}

void vb_lua_tmr_register(lua_State *L, vb_lua_tmr_state_t *state)
{
    lua_pushlightuserdata(L, state);
    lua_setfield(L, LUA_REGISTRYINDEX, VB_LUA_TMR_STATE_REGISTRY_KEY);

    if (luaL_newmetatable(L, VB_LUA_TIMER_META)) {
        static const luaL_Reg timer_methods[] = {
            {"alarm", timer_alarm},
            {"start", timer_start},
            {"stop", timer_stop},
            {"unregister", timer_unregister},
            {"state", timer_state},
            {"interval", timer_interval},
            {NULL, NULL},
        };
        luaL_setfuncs(L, timer_methods, 0);
        lua_pushvalue(L, -1);
        lua_setfield(L, -2, "__index");
    }
    lua_pop(L, 1);

    static const luaL_Reg tmr_functions[] = {
        {"create", tmr_create},
        {"now", tmr_now},
        {"time", tmr_time},
        {NULL, NULL},
    };
    luaL_newlib(L, tmr_functions);
    lua_pushinteger(L, TMR_ALARM_SINGLE);
    lua_setfield(L, -2, "ALARM_SINGLE");
    lua_pushinteger(L, TMR_ALARM_SEMI);
    lua_setfield(L, -2, "ALARM_SEMI");
    lua_pushinteger(L, TMR_ALARM_AUTO);
    lua_setfield(L, -2, "ALARM_AUTO");
    lua_setglobal(L, "tmr");

    lua_pushcfunction(L, set_interval);
    lua_setglobal(L, "set_interval");

    lua_pushcfunction(L, millis);
    lua_setglobal(L, "millis");
}

esp_err_t vb_lua_tmr_run_loop(lua_State *L, vb_lua_tmr_state_t *state, char *error, size_t error_size)
{
    if (state == NULL) {
        return ESP_OK;
    }

    int idle_ticks = 0;
    ESP_LOGI(TAG, "Lua tmr loop start");
    while (true) {
        if (state->stop_requested != NULL && *state->stop_requested) {
            ESP_LOGI(TAG, "Lua tmr loop stop requested");
            if (error != NULL && error_size > 0) {
                strlcpy(error, "stopped", error_size);
            }
            return ESP_ERR_INVALID_STATE;
        }

        bool has_active_timer = false;
        TickType_t now = xTaskGetTickCount();

        for (int i = 0; i < VB_LUA_TMR_MAX; i++) {
            vb_lua_timer_t *timer = &state->timers[i];
            if (!timer->allocated || !timer->active || timer->callback_ref == LUA_NOREF) {
                continue;
            }

            has_active_timer = true;
            if ((now - timer->last_run) < pdMS_TO_TICKS(timer->period_ms)) {
                continue;
            }

            lua_rawgeti(L, LUA_REGISTRYINDEX, timer->callback_ref);
            if (lua_pcall(L, 0, 0, 0) != LUA_OK) {
                const char *err = lua_tostring(L, -1);
                ESP_LOGE(TAG, "Lua timer failed: %s", err ? err : "unknown error");
                if (error != NULL && error_size > 0) {
                    strlcpy(error, err ? err : "lua timer failed", error_size);
                }
                return ESP_FAIL;
            }

            timer->last_run = now;
            if (timer->mode == TMR_ALARM_SINGLE) {
                timer->active = false;
            } else if (timer->mode == TMR_ALARM_SEMI) {
                timer->active = false;
            }
        }

        if (!has_active_timer) {
            idle_ticks++;
            if (idle_ticks >= VB_LUA_TMR_IDLE_EXIT_TICKS) {
                ESP_LOGI(TAG, "Lua tmr loop idle");
                return ESP_OK;
            }
        } else {
            idle_ticks = 0;
        }

        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

void vb_lua_tmr_cleanup(lua_State *L, vb_lua_tmr_state_t *state)
{
    if (state == NULL) {
        return;
    }
    for (int i = 0; i < VB_LUA_TMR_MAX; i++) {
        vb_lua_timer_t *timer = &state->timers[i];
        if (timer->callback_ref != LUA_NOREF) {
            luaL_unref(L, LUA_REGISTRYINDEX, timer->callback_ref);
        }
        memset(timer, 0, sizeof(*timer));
        timer->callback_ref = LUA_NOREF;
    }
}
