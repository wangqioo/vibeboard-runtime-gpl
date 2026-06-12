#include "lua_lvgl.h"

#include <string.h>

#include "board_lckfb_szpi_s3.h"
#include "lauxlib.h"
#include "lua_lvgl_internal.h"

static lv_obj_t *s_objects[VB_LVGL_OBJECT_MAX];
static int s_object_count;

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

void vb_lua_lvgl_register(lua_State *L)
{
    memset(s_objects, 0, sizeof(s_objects));
    s_object_count = 0;

    vb_lua_lvgl_fs_register(L);
    vb_lua_lvgl_widgets_register(L);

    lua_pushinteger(L, LV_ALIGN_CENTER);
    lua_setglobal(L, "LV_ALIGN_CENTER");

    lua_pushinteger(L, LV_ALIGN_TOP_LEFT);
    lua_setglobal(L, "LV_ALIGN_TOP_LEFT");

    lua_pushinteger(L, LV_ALIGN_TOP_MID);
    lua_setglobal(L, "LV_ALIGN_TOP_MID");

    lua_pushinteger(L, LV_ALIGN_BOTTOM_LEFT);
    lua_setglobal(L, "LV_ALIGN_BOTTOM_LEFT");

    lua_pushinteger(L, LV_OBJ_FLAG_SCROLLABLE);
    lua_setglobal(L, "LV_OBJ_FLAG_SCROLLABLE");

    lua_pushinteger(L, LV_OBJ_FLAG_HIDDEN);
    lua_setglobal(L, "LV_OBJ_FLAG_HIDDEN");

    lua_pushinteger(L, LV_LABEL_LONG_CLIP);
    lua_setglobal(L, "LV_LABEL_LONG_CLIP");

    lua_pushinteger(L, LV_LABEL_LONG_WRAP);
    lua_setglobal(L, "LV_LABEL_LONG_WRAP");

    lua_pushinteger(L, LV_LABEL_LONG_SCROLL_CIRCULAR);
    lua_setglobal(L, "LV_LABEL_LONG_SCROLL_CIRCULAR");

    lua_pushinteger(L, LV_ANIM_OFF);
    lua_setglobal(L, "LV_ANIM_OFF");

    lua_pushinteger(L, LV_ANIM_ON);
    lua_setglobal(L, "LV_ANIM_ON");
}
