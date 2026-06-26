#pragma once

#include "app_registry.h"
#include "lua.h"

#ifdef __cplusplus
extern "C" {
#endif

void vb_lua_native_module_register(lua_State *L, const vb_app_registry_result_t *app);
void vb_lua_native_module_cleanup(lua_State *L);

#ifdef __cplusplus
}
#endif
