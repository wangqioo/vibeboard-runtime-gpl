#pragma once

#include <stdbool.h>

#include "lua.h"

void vb_lua_lvgl_set_app_dir(const char *app_dir);
void vb_lua_lvgl_register(lua_State *L);
bool vb_lua_lvgl_has_cleanup(void);
void vb_lua_lvgl_cleanup(void);
