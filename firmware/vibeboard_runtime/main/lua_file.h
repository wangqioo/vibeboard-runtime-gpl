#pragma once

#include "lua.h"

#ifdef __cplusplus
extern "C" {
#endif

void vb_lua_file_register(lua_State *L, const char *app_dir);

#ifdef __cplusplus
}
#endif
