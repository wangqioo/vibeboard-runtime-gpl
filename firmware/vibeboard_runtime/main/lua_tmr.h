#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include "lua.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VB_LUA_TMR_MAX 8

typedef struct {
    bool allocated;
    bool active;
    int callback_ref;
    int period_ms;
    int mode;
    TickType_t last_run;
    uint32_t generation;
} vb_lua_timer_t;

typedef struct {
    vb_lua_timer_t timers[VB_LUA_TMR_MAX];
    volatile bool *stop_requested;
    uint32_t generation;
} vb_lua_tmr_state_t;

void vb_lua_tmr_init(vb_lua_tmr_state_t *state);
void vb_lua_tmr_set_stop_flag(vb_lua_tmr_state_t *state, volatile bool *stop_requested);
void vb_lua_tmr_register(lua_State *L, vb_lua_tmr_state_t *state);
esp_err_t vb_lua_tmr_run_loop(lua_State *L, vb_lua_tmr_state_t *state, char *error, size_t error_size);
void vb_lua_tmr_cleanup(lua_State *L, vb_lua_tmr_state_t *state);

#ifdef __cplusplus
}
#endif
