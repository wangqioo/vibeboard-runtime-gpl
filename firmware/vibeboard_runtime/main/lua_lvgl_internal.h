#pragma once

#include <stdbool.h>
#include <stddef.h>

#include "lua.h"
#include "lvgl.h"

#define VB_LVGL_OBJECT_MAX 128
#define VB_LVGL_PATH_MAX 256
#define LVGL_FS_SD_LETTER 'S'

int vb_lua_lvgl_check_object_id(lua_State *L, int index);
lv_obj_t *vb_lua_lvgl_resolve_object(int id);
int vb_lua_lvgl_store_object(lv_obj_t *object);
bool vb_lua_lvgl_can_store_object(void);
void vb_lua_lvgl_forget_object(int id);
void vb_lua_lvgl_forget_object_tree(lv_obj_t *object);

bool vb_lua_lvgl_resolve_asset_path(const char *path, char *resolved, size_t resolved_size);

void vb_lua_lvgl_fs_register(lua_State *L);
void vb_lua_lvgl_canvas_register(lua_State *L);
void vb_lua_lvgl_widgets_register(lua_State *L);
lua_Integer vb_lua_lvgl_simsun_16_cjk_font_ref(void);
lua_Integer vb_lua_lvgl_common_cn_13_font_ref(void);
lua_Integer vb_lua_lvgl_voice_ai_13_font_ref(void);
