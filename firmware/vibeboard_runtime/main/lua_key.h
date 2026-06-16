#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include "lua.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VB_LUA_KEY_MAX_CODE 6

typedef struct {
    int global_callback_ref;
    int callback_refs[VB_LUA_KEY_MAX_CODE];
    bool was_pressed;
    bool long_started;
    TickType_t pressed_at;
    TickType_t repeat_at;
} vb_lua_key_state_t;

void vb_lua_key_init(vb_lua_key_state_t *state);
void vb_lua_key_register(lua_State *L, vb_lua_key_state_t *state);
bool vb_lua_key_has_handlers(const vb_lua_key_state_t *state);
esp_err_t vb_lua_key_poll(lua_State *L, vb_lua_key_state_t *state, char *error, size_t error_size);
void vb_lua_key_cleanup(lua_State *L, vb_lua_key_state_t *state);

#ifdef __cplusplus
}
#endif
