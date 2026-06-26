#pragma once

#include <stdbool.h>
#include <stddef.h>

#include "app_registry.h"
#include "lua.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VB_LUA_APP_EVENT_CALLBACK_COUNT 3

typedef struct {
    volatile bool *stop_requested;
    bool home_exit_enabled;
    bool webui_enabled;
    int route_callback_ref;
    const vb_app_registry_result_t *registry;
    int event_callback_refs[VB_LUA_APP_EVENT_CALLBACK_COUNT];
    bool has_pending_launch;
    vb_app_registry_entry_t pending_launch;
} vb_lua_app_state_t;

typedef struct {
    int status;
    char type[64];
    char body[512];
} vb_lua_app_webui_response_t;

void vb_lua_app_init(vb_lua_app_state_t *state);
void vb_lua_app_set_stop_flag(vb_lua_app_state_t *state, volatile bool *stop_requested);
void vb_lua_app_set_registry(vb_lua_app_state_t *state, const vb_app_registry_result_t *registry);
void vb_lua_app_cleanup(lua_State *L, vb_lua_app_state_t *state);
void vb_lua_app_register(lua_State *L, vb_lua_app_state_t *state);
void vb_lua_app_dispatch_exit(lua_State *L, vb_lua_app_state_t *state);
bool vb_lua_app_dispatch_webui(lua_State *L,
                               vb_lua_app_state_t *state,
                               const char *path,
                               const char *query,
                               const char *method,
                               const char *body,
                               vb_lua_app_webui_response_t *response);
bool vb_lua_app_take_pending_launch(vb_lua_app_state_t *state, vb_app_registry_entry_t *entry);
bool vb_lua_app_should_handle_home_exit(const vb_lua_app_state_t *state);

#ifdef __cplusplus
}
#endif
