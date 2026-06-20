#pragma once

#include <stdint.h>

#include "esp_err.h"
#include "lua.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VB_LUA_TOUCH_QUEUE_DEPTH 16

#define VB_LUA_TOUCH_DOWN 1
#define VB_LUA_TOUCH_MOVE 2
#define VB_LUA_TOUCH_UP 3

typedef struct {
    int event;
    int x;
    int y;
    int timestamp_ms;
} vb_lua_touch_event_t;

typedef struct {
    int global_ref;
    void *queue;
} vb_lua_touch_state_t;

void vb_lua_touch_init(vb_lua_touch_state_t *state);
esp_err_t vb_lua_touch_enqueue(vb_lua_touch_state_t *state, int event, int x, int y, int timestamp_ms);
int vb_lua_touch_process_pending(lua_State *L, vb_lua_touch_state_t *state);
void vb_lua_touch_cleanup(lua_State *L, vb_lua_touch_state_t *state);
void vb_lua_touch_register(lua_State *L, vb_lua_touch_state_t *state);

#ifdef __cplusplus
}
#endif
