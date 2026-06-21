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
    if (id < 0 || id > VB_LVGL_OBJECT_MAX || s_objects[id - 1] == NULL) {
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
    for (int i = 0; i < VB_LVGL_OBJECT_MAX; i++) {
        if (s_objects[i] == NULL) {
            return true;
        }
    }
    return false;
}

int vb_lua_lvgl_store_object(lv_obj_t *object)
{
    for (int i = 0; i < VB_LVGL_OBJECT_MAX; i++) {
        if (s_objects[i] == NULL) {
            s_objects[i] = object;
            if (i + 1 > s_object_count) {
                s_object_count = i + 1;
            }
            return i + 1;
        }
    }
    return 0;
}

void vb_lua_lvgl_forget_object(int id)
{
    if (id > 0 && id <= s_object_count) {
        s_objects[id - 1] = NULL;
    }
}

static void forget_object_pointer(lv_obj_t *object)
{
    for (int i = 0; i < s_object_count; i++) {
        if (s_objects[i] == object) {
            s_objects[i] = NULL;
        }
    }
}

void vb_lua_lvgl_forget_object_tree(lv_obj_t *object)
{
    if (object == NULL) {
        return;
    }

    uint32_t child_count = lv_obj_get_child_cnt(object);
    for (uint32_t i = 0; i < child_count; i++) {
        vb_lua_lvgl_forget_object_tree(lv_obj_get_child(object, i));
    }
    forget_object_pointer(object);
}

void vb_lua_lvgl_register(lua_State *L)
{
    memset(s_objects, 0, sizeof(s_objects));
    s_object_count = 0;

    vb_lua_lvgl_fs_register(L);
    vb_lua_lvgl_canvas_register(L);
    vb_lua_lvgl_widgets_register(L);

    lua_pushinteger(L, LV_PART_MAIN);
    lua_setglobal(L, "LV_PART_MAIN");

    lua_pushinteger(L, LV_STATE_DEFAULT);
    lua_setglobal(L, "LV_STATE_DEFAULT");

    lua_pushinteger(L, LV_TEXT_ALIGN_CENTER);
    lua_setglobal(L, "LV_TEXT_ALIGN_CENTER");

    lua_pushinteger(L, LV_IMG_CF_TRUE_COLOR);
    lua_setglobal(L, "LV_IMG_CF_TRUE_COLOR");

    lua_pushinteger(L, LV_OPA_COVER);
    lua_setglobal(L, "LV_OPA_COVER");

    lua_pushinteger(L, LV_OPA_TRANSP);
    lua_setglobal(L, "LV_OPA_TRANSP");

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

    lua_pushinteger(L, LV_ROLLER_MODE_NORMAL);
    lua_setglobal(L, "LV_ROLLER_MODE_NORMAL");

    lua_pushinteger(L, 1);
    lua_setglobal(L, "ANIM_X");

    lua_pushinteger(L, 2);
    lua_setglobal(L, "ANIM_Y");

    lua_pushinteger(L, 3);
    lua_setglobal(L, "ANIM_W");

    lua_pushinteger(L, 4);
    lua_setglobal(L, "ANIM_H");

    lua_pushinteger(L, 5);
    lua_setglobal(L, "ANIM_OPA");

    lua_pushinteger(L, 1);
    lua_setglobal(L, "ANIM_PATH_EASE_OUT");

    lua_pushinteger(L, LV_GRAD_DIR_VER);
    lua_setglobal(L, "LV_GRAD_DIR_VER");
}
