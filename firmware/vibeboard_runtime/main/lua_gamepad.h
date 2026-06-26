#pragma once

#include <stdbool.h>

#include "esp_err.h"
#include "lua.h"

#define VB_LUA_GAMEPAD_QUEUE_DEPTH 8

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    bool started;
    bool connected;
    bool connecting;
    int buttons_mask;
    double lx;
    double ly;
    bool dpad_up;
    bool dpad_down;
    bool dpad_left;
    bool dpad_right;
    char address[32];
} vb_lua_gamepad_pending_state_t;

typedef struct {
    bool started;
    bool connected;
    bool connecting;
    int buttons_mask;
    double lx;
    double ly;
    bool dpad_up;
    bool dpad_down;
    bool dpad_left;
    bool dpad_right;
    char address[32];
    char last_address[32];
} vb_lua_gamepad_snapshot_t;

typedef struct {
    void *queue;
} vb_lua_gamepad_state_t;

void vb_lua_gamepad_init(vb_lua_gamepad_state_t *state);
esp_err_t vb_lua_gamepad_enqueue(vb_lua_gamepad_state_t *state, const vb_lua_gamepad_pending_state_t *pending);
bool vb_lua_gamepad_snapshot(vb_lua_gamepad_snapshot_t *out);
int vb_lua_gamepad_process_pending(lua_State *L, vb_lua_gamepad_state_t *state);
void vb_lua_gamepad_cleanup(lua_State *L, vb_lua_gamepad_state_t *state);
void vb_lua_gamepad_register(lua_State *L, vb_lua_gamepad_state_t *state);

#ifdef __cplusplus
}
#endif
