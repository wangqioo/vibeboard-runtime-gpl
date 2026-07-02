#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "board_lckfb_szpi_s3.h"
#include "lua.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    bool ready;
    uint32_t captures;
    uint16_t width;
    uint16_t height;
    char format[16];
    char last_error[64];
    vb_board_camera_frame_t held_frame;
    vb_board_camera_frame_t owned_frame;
    void *owned_frame_buf;
} vb_lua_camera_state_t;

void vb_lua_camera_init(vb_lua_camera_state_t *state);
void vb_lua_camera_register(lua_State *L, vb_lua_camera_state_t *state);
void vb_lua_camera_cleanup(lua_State *L, vb_lua_camera_state_t *state);

#ifdef __cplusplus
}
#endif
