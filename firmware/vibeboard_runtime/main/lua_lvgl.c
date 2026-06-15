#include "lua_lvgl.h"

#include <string.h>

#include "board_lckfb_szpi_s3.h"
#include "lauxlib.h"
#include "lua_lvgl_internal.h"

static lv_obj_t *s_objects[VB_LVGL_OBJECT_MAX];
static int s_object_count;

typedef struct {
    const char *global_name;
    const char *module_name;
} vb_lua_lvgl_symbol_t;

typedef struct {
    const char *global_name;
    const char *module_name;
    int value;
} vb_lua_lvgl_constant_t;

int vb_lua_lvgl_check_object_id(lua_State *L, int index)
{
    int id = (int)luaL_checkinteger(L, index);
    if (id == 0) {
        return id;
    }
    if (id < 0 || id > s_object_count || s_objects[id - 1] == NULL) {
        luaL_error(L, "invalid lvgl object id: %d", id);
    }
    return id;
}

lv_obj_t *vb_lua_lvgl_resolve_object(int id)
{
    if (id == 0) {
        return lv_scr_act();
    }
    return s_objects[id - 1];
}

bool vb_lua_lvgl_can_store_object(void)
{
    return s_object_count < VB_LVGL_OBJECT_MAX;
}

int vb_lua_lvgl_store_object(lv_obj_t *object)
{
    s_objects[s_object_count] = object;
    s_object_count++;
    return s_object_count;
}

static void set_global_integer(lua_State *L, const char *name, int value)
{
    lua_pushinteger(L, value);
    lua_setglobal(L, name);
}

static void set_table_from_global(lua_State *L, int table_index, const vb_lua_lvgl_symbol_t *symbol)
{
    lua_getglobal(L, symbol->global_name);
    if (lua_isnil(L, -1)) {
        lua_pop(L, 1);
        return;
    }

    lua_pushvalue(L, -1);
    lua_setfield(L, table_index, symbol->global_name);
    lua_setfield(L, table_index, symbol->module_name);
}

static void set_table_integer(lua_State *L, int table_index, const vb_lua_lvgl_constant_t *constant)
{
    lua_pushinteger(L, constant->value);
    lua_setfield(L, table_index, constant->global_name);
    lua_pushinteger(L, constant->value);
    lua_setfield(L, table_index, constant->module_name);
}

static void register_lvgl_module(lua_State *L, const vb_lua_lvgl_constant_t *constants, size_t constant_count)
{
    static const vb_lua_lvgl_symbol_t functions[] = {
        { "lv_scr_act", "scr_act" },
        { "lv_obj_clean", "obj_clean" },
        { "lv_obj_create", "obj_create" },
        { "lv_label_create", "label_create" },
        { "lv_img_create", "img_create" },
        { "lv_img_set_src", "img_set_src" },
        { "lv_btn_create", "btn_create" },
        { "lv_bar_create", "bar_create" },
        { "lv_bar_set_range", "bar_set_range" },
        { "lv_bar_set_value", "bar_set_value" },
        { "lv_obj_set_size", "obj_set_size" },
        { "lv_obj_set_width", "obj_set_width" },
        { "lv_obj_set_height", "obj_set_height" },
        { "lv_obj_set_pos", "obj_set_pos" },
        { "lv_obj_set_x", "obj_set_x" },
        { "lv_obj_set_y", "obj_set_y" },
        { "lv_obj_set_style_bg_color", "obj_set_style_bg_color" },
        { "lv_obj_set_style_text_color", "obj_set_style_text_color" },
        { "lv_obj_set_style_radius", "obj_set_style_radius" },
        { "lv_obj_set_style_pad_all", "obj_set_style_pad_all" },
        { "lv_obj_set_style_border_width", "obj_set_style_border_width" },
        { "lv_obj_set_style_border_color", "obj_set_style_border_color" },
        { "lv_label_set_text", "label_set_text" },
        { "lv_label_set_long_mode", "label_set_long_mode" },
        { "lv_obj_add_flag", "obj_add_flag" },
        { "lv_obj_clear_flag", "obj_clear_flag" },
        { "lv_obj_align", "obj_align" },
    };

    lua_newtable(L);
    int module_index = lua_gettop(L);

    for (size_t i = 0; i < sizeof(functions) / sizeof(functions[0]); i++) {
        set_table_from_global(L, module_index, &functions[i]);
    }
    for (size_t i = 0; i < constant_count; i++) {
        set_table_integer(L, module_index, &constants[i]);
    }

    lua_pushvalue(L, module_index);
    lua_setglobal(L, "lvgl");

    lua_getglobal(L, "package");
    if (lua_istable(L, -1)) {
        lua_getfield(L, -1, "loaded");
        if (lua_istable(L, -1)) {
            lua_pushvalue(L, module_index);
            lua_setfield(L, -2, "lvgl");
        }
        lua_pop(L, 1);
    }
    lua_pop(L, 1);
    lua_pop(L, 1);
}

void vb_lua_lvgl_register(lua_State *L)
{
    static const vb_lua_lvgl_constant_t constants[] = {
        { "LV_ALIGN_CENTER", "ALIGN_CENTER", LV_ALIGN_CENTER },
        { "LV_ALIGN_TOP_LEFT", "ALIGN_TOP_LEFT", LV_ALIGN_TOP_LEFT },
        { "LV_ALIGN_TOP_MID", "ALIGN_TOP_MID", LV_ALIGN_TOP_MID },
        { "LV_ALIGN_BOTTOM_LEFT", "ALIGN_BOTTOM_LEFT", LV_ALIGN_BOTTOM_LEFT },
        { "LV_OBJ_FLAG_SCROLLABLE", "OBJ_FLAG_SCROLLABLE", LV_OBJ_FLAG_SCROLLABLE },
        { "LV_OBJ_FLAG_HIDDEN", "OBJ_FLAG_HIDDEN", LV_OBJ_FLAG_HIDDEN },
        { "LV_LABEL_LONG_CLIP", "LABEL_LONG_CLIP", LV_LABEL_LONG_CLIP },
        { "LV_LABEL_LONG_WRAP", "LABEL_LONG_WRAP", LV_LABEL_LONG_WRAP },
        { "LV_LABEL_LONG_SCROLL_CIRCULAR", "LABEL_LONG_SCROLL_CIRCULAR", LV_LABEL_LONG_SCROLL_CIRCULAR },
        { "LV_ANIM_OFF", "ANIM_OFF", LV_ANIM_OFF },
        { "LV_ANIM_ON", "ANIM_ON", LV_ANIM_ON },
    };

    memset(s_objects, 0, sizeof(s_objects));
    s_object_count = 0;

    vb_lua_lvgl_fs_register(L);
    vb_lua_lvgl_widgets_register(L);

    for (size_t i = 0; i < sizeof(constants) / sizeof(constants[0]); i++) {
        set_global_integer(L, constants[i].global_name, constants[i].value);
    }
    register_lvgl_module(L, constants, sizeof(constants) / sizeof(constants[0]));
}
