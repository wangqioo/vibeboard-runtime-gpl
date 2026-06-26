#pragma once

#include "lua.h"

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void vb_lua_i2s_register(lua_State *L);
int vb_i2s_tx_stream_begin(uint8_t port_id, uint32_t sample_rate, uint16_t bits, uint16_t channels, void **out_stream);
int vb_i2s_tx_stream_write(void *stream, const void *data, size_t bytes, size_t *out_written, uint32_t timeout_ms);
int vb_i2s_tx_stream_end(void *stream);

#ifdef __cplusplus
}
#endif
