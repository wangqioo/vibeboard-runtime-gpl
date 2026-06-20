#pragma once

#include "esp_err.h"
#include "module_host_api.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t vb_nes_native_module_init(vb_module_host_api_t *host_api, void **module);
int vb_nes_native_module_state(lua_State *L, void *module);
int vb_nes_native_module_start(lua_State *L, void *module);
int vb_nes_native_module_stop(lua_State *L, void *module);
int vb_nes_native_module_input_set_mask(lua_State *L, void *module);
int vb_nes_native_module_input_clear(lua_State *L, void *module);

#ifdef __cplusplus
}
#endif
