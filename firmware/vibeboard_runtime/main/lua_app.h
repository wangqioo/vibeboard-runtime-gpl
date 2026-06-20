#pragma once

#include <stdbool.h>

#include "lua.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    volatile bool *stop_requested;
    int exit_callback_ref;
} vb_lua_app_state_t;

void vb_lua_app_init(vb_lua_app_state_t *state);
void vb_lua_app_set_stop_flag(vb_lua_app_state_t *state, volatile bool *stop_requested);
void vb_lua_app_cleanup(lua_State *L, vb_lua_app_state_t *state);
void vb_lua_app_register(lua_State *L, vb_lua_app_state_t *state);
void vb_lua_app_dispatch_exit(lua_State *L, vb_lua_app_state_t *state);

#ifdef __cplusplus
}
#endif
