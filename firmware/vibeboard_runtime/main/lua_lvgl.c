#include "lua_lvgl.h"

#include <string.h>

#include "esp_lvgl_port.h"
#include "lauxlib.h"
#include "lvgl.h"

#define VB_LVGL_OBJECT_MAX 32

static lv_obj_t *s_objects[VB_LVGL_OBJECT_MAX];
static int s_object_count;

static int check_object_id(lua_State *L, int index)
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

static lv_obj_t *resolve_object(int id)
{
    if (id == 0) {
        return lv_scr_act();
    }
    return s_objects[id - 1];
}

static int store_object(lv_obj_t *object)
{
    s_objects[s_object_count] = object;
    s_object_count++;
    return s_object_count;
}

static int l_lv_scr_act(lua_State *L)
{
    lua_pushinteger(L, 0);
    return 1;
}

static int l_lv_obj_clean(lua_State *L)
{
    int id = check_object_id(L, 1);

    lvgl_port_lock(0);
    lv_obj_t *object = resolve_object(id);
    lv_obj_clean(object);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_create(lua_State *L)
{
    int parent_id = check_object_id(L, 1);
    if (s_object_count >= VB_LVGL_OBJECT_MAX) {
        return luaL_error(L, "lvgl object table full");
    }

    lvgl_port_lock(0);
    lv_obj_t *parent = resolve_object(parent_id);
    lv_obj_t *object = lv_obj_create(parent);
    lvgl_port_unlock();
    if (object == NULL) {
        return luaL_error(L, "lvgl object allocation failed");
    }

    int id = store_object(object);
    lua_pushinteger(L, id);
    return 1;
}

static int l_lv_label_create(lua_State *L)
{
    int parent_id = check_object_id(L, 1);
    if (s_object_count >= VB_LVGL_OBJECT_MAX) {
        return luaL_error(L, "lvgl object table full");
    }

    lvgl_port_lock(0);
    lv_obj_t *parent = resolve_object(parent_id);
    lv_obj_t *label = lv_label_create(parent);
    lvgl_port_unlock();
    if (label == NULL) {
        return luaL_error(L, "lvgl object allocation failed");
    }

    int id = store_object(label);
    lua_pushinteger(L, id);
    return 1;
}

static int l_lv_obj_set_size(lua_State *L)
{
    int id = check_object_id(L, 1);
    int width = (int)luaL_checkinteger(L, 2);
    int height = (int)luaL_checkinteger(L, 3);

    lvgl_port_lock(0);
    lv_obj_t *object = resolve_object(id);
    lv_obj_set_size(object, width, height);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_width(lua_State *L)
{
    int id = check_object_id(L, 1);
    int width = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = resolve_object(id);
    lv_obj_set_width(object, width);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_height(lua_State *L)
{
    int id = check_object_id(L, 1);
    int height = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = resolve_object(id);
    lv_obj_set_height(object, height);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_bg_color(lua_State *L)
{
    int id = check_object_id(L, 1);
    uint32_t color = (uint32_t)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = resolve_object(id);
    lv_obj_set_style_bg_color(object, lv_color_hex(color), 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_text_color(lua_State *L)
{
    int id = check_object_id(L, 1);
    uint32_t color = (uint32_t)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = resolve_object(id);
    lv_obj_set_style_text_color(object, lv_color_hex(color), 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_radius(lua_State *L)
{
    int id = check_object_id(L, 1);
    int radius = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = resolve_object(id);
    lv_obj_set_style_radius(object, radius, 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_pad_all(lua_State *L)
{
    int id = check_object_id(L, 1);
    int pad = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = resolve_object(id);
    lv_obj_set_style_pad_all(object, pad, 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_border_width(lua_State *L)
{
    int id = check_object_id(L, 1);
    int width = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = resolve_object(id);
    lv_obj_set_style_border_width(object, width, 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_border_color(lua_State *L)
{
    int id = check_object_id(L, 1);
    uint32_t color = (uint32_t)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = resolve_object(id);
    lv_obj_set_style_border_color(object, lv_color_hex(color), 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_label_set_text(lua_State *L)
{
    int id = check_object_id(L, 1);
    const char *text = luaL_checkstring(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *label = resolve_object(id);
    lv_label_set_text(label, text);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_align(lua_State *L)
{
    int id = check_object_id(L, 1);
    lv_align_t align = (lv_align_t)luaL_checkinteger(L, 2);
    int x = (int)luaL_optinteger(L, 3, 0);
    int y = (int)luaL_optinteger(L, 4, 0);

    lvgl_port_lock(0);
    lv_obj_t *object = resolve_object(id);
    lv_obj_align(object, align, x, y);
    lvgl_port_unlock();
    return 0;
}

void vb_lua_lvgl_register(lua_State *L)
{
    memset(s_objects, 0, sizeof(s_objects));
    s_object_count = 0;

    lua_pushcfunction(L, l_lv_scr_act);
    lua_setglobal(L, "lv_scr_act");

    lua_pushcfunction(L, l_lv_obj_clean);
    lua_setglobal(L, "lv_obj_clean");

    lua_pushcfunction(L, l_lv_obj_create);
    lua_setglobal(L, "lv_obj_create");

    lua_pushcfunction(L, l_lv_label_create);
    lua_setglobal(L, "lv_label_create");

    lua_pushcfunction(L, l_lv_obj_set_size);
    lua_setglobal(L, "lv_obj_set_size");

    lua_pushcfunction(L, l_lv_obj_set_width);
    lua_setglobal(L, "lv_obj_set_width");

    lua_pushcfunction(L, l_lv_obj_set_height);
    lua_setglobal(L, "lv_obj_set_height");

    lua_pushcfunction(L, l_lv_obj_set_style_bg_color);
    lua_setglobal(L, "lv_obj_set_style_bg_color");

    lua_pushcfunction(L, l_lv_obj_set_style_text_color);
    lua_setglobal(L, "lv_obj_set_style_text_color");

    lua_pushcfunction(L, l_lv_obj_set_style_radius);
    lua_setglobal(L, "lv_obj_set_style_radius");

    lua_pushcfunction(L, l_lv_obj_set_style_pad_all);
    lua_setglobal(L, "lv_obj_set_style_pad_all");

    lua_pushcfunction(L, l_lv_obj_set_style_border_width);
    lua_setglobal(L, "lv_obj_set_style_border_width");

    lua_pushcfunction(L, l_lv_obj_set_style_border_color);
    lua_setglobal(L, "lv_obj_set_style_border_color");

    lua_pushcfunction(L, l_lv_label_set_text);
    lua_setglobal(L, "lv_label_set_text");

    lua_pushcfunction(L, l_lv_obj_align);
    lua_setglobal(L, "lv_obj_align");

    lua_pushinteger(L, LV_ALIGN_CENTER);
    lua_setglobal(L, "LV_ALIGN_CENTER");

    lua_pushinteger(L, LV_ALIGN_TOP_LEFT);
    lua_setglobal(L, "LV_ALIGN_TOP_LEFT");

    lua_pushinteger(L, LV_ALIGN_TOP_MID);
    lua_setglobal(L, "LV_ALIGN_TOP_MID");

    lua_pushinteger(L, LV_ALIGN_BOTTOM_LEFT);
    lua_setglobal(L, "LV_ALIGN_BOTTOM_LEFT");
}
