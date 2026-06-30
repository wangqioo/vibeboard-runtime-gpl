#pragma once

#include <stdbool.h>

#include "esp_err.h"
#include "lua.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int global_ref;
    bool available;
    bool enabled;
    int sample_interval_ms;
    int last_sample_ms;
    int sample_count;
    int error_count;
} vb_lua_imu_state_t;

void vb_lua_imu_init(vb_lua_imu_state_t *state);
void vb_lua_imu_set_available(vb_lua_imu_state_t *state, bool available);
int vb_lua_imu_process_pending(lua_State *L, vb_lua_imu_state_t *state);
void vb_lua_imu_cleanup(lua_State *L, vb_lua_imu_state_t *state);
void vb_lua_imu_register(lua_State *L, vb_lua_imu_state_t *state);

#ifdef __cplusplus
}
#endif
