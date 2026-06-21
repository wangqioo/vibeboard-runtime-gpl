#pragma once

#include "esp_err.h"
#include "lua.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VB_LUA_KEY_QUEUE_DEPTH 12
#define VB_LUA_KEY_CODE_MAX 32
#define VB_LUA_KEY_MAX_REPEATERS 4

#define VB_LUA_KEY_LEFT 1
#define VB_LUA_KEY_RIGHT 2
#define VB_LUA_KEY_UP 3
#define VB_LUA_KEY_DOWN 4
#define VB_LUA_KEY_HOME 5
#define VB_LUA_KEY_EXIT 6

#define VB_LUA_KEY_START 1
#define VB_LUA_KEY_LONG_START 2
#define VB_LUA_KEY_LONG_REPEAT 3
#define VB_LUA_KEY_LONG_END 4
#define VB_LUA_KEY_SHORT VB_LUA_KEY_START

typedef struct {
    int code;
    int event;
    int timestamp_ms;
} vb_lua_key_event_t;

typedef struct {
    int global_ref;
    int refs[VB_LUA_KEY_CODE_MAX + 1];
    void *queue;
    void *repeat_timers[VB_LUA_KEY_MAX_REPEATERS];
    int repeat_codes[VB_LUA_KEY_MAX_REPEATERS];
} vb_lua_key_state_t;

void vb_lua_key_init(vb_lua_key_state_t *state);
esp_err_t vb_lua_key_enqueue(vb_lua_key_state_t *state, int code, int event, int timestamp_ms);
int vb_lua_key_process_pending(lua_State *L, vb_lua_key_state_t *state);
void vb_lua_key_cleanup(lua_State *L, vb_lua_key_state_t *state);
void vb_lua_key_register(lua_State *L, vb_lua_key_state_t *state);

#ifdef __cplusplus
}
#endif
