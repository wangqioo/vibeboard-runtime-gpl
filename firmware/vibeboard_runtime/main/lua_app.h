#pragma once

#include <stdbool.h>

#include "app_registry.h"
#include "lua.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    volatile bool *stop_requested;
    int exit_callback_ref;
    bool has_pending_launch;
    vb_app_registry_entry_t pending_launch;
} vb_lua_app_state_t;

void vb_lua_app_init(vb_lua_app_state_t *state);
void vb_lua_app_set_stop_flag(vb_lua_app_state_t *state, volatile bool *stop_requested);
void vb_lua_app_cleanup(lua_State *L, vb_lua_app_state_t *state);
void vb_lua_app_register(lua_State *L, vb_lua_app_state_t *state);
void vb_lua_app_dispatch_exit(lua_State *L, vb_lua_app_state_t *state);
bool vb_lua_app_take_pending_launch(vb_lua_app_state_t *state, vb_app_registry_entry_t *entry);

#ifdef __cplusplus
}
#endif
