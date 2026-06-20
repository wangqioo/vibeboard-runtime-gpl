#include "lua_lvgl_internal.h"

#include <stdbool.h>
#include <string.h>

#include "esp_lvgl_port.h"
#include "lauxlib.h"
#include "lvgl.h"

#define VB_LVGL_CANVAS_WIDTH 320
#define VB_LVGL_CANVAS_HEIGHT 240

static lv_color_t s_canvas_buffer[VB_LVGL_CANVAS_WIDTH * VB_LVGL_CANVAS_HEIGHT];
static bool s_canvas_buffer_used;

static int l_lv_canvas_create(lua_State *L)
{
    int parent_id = vb_lua_lvgl_check_object_id(L, 1);
    int width = (int)luaL_optinteger(L, 2, VB_LVGL_CANVAS_WIDTH);
    int height = (int)luaL_optinteger(L, 3, VB_LVGL_CANVAS_HEIGHT);

    if (width != VB_LVGL_CANVAS_WIDTH || height != VB_LVGL_CANVAS_HEIGHT) {
        return luaL_error(L, "only %dx%d canvas is supported", VB_LVGL_CANVAS_WIDTH, VB_LVGL_CANVAS_HEIGHT);
    }
    if (s_canvas_buffer_used) {
        return luaL_error(L, "lvgl canvas buffer already in use");
    }
    if (!vb_lua_lvgl_can_store_object()) {
        return luaL_error(L, "lvgl object table full");
    }

    lvgl_port_lock(0);
    lv_obj_t *parent = vb_lua_lvgl_resolve_object(parent_id);
    lv_obj_t *canvas = lv_canvas_create(parent);
    if (canvas != NULL) {
        lv_canvas_set_buffer(canvas, s_canvas_buffer, VB_LVGL_CANVAS_WIDTH, VB_LVGL_CANVAS_HEIGHT, LV_IMG_CF_TRUE_COLOR);
        lv_obj_set_size(canvas, VB_LVGL_CANVAS_WIDTH, VB_LVGL_CANVAS_HEIGHT);
        s_canvas_buffer_used = true;
    }
    lvgl_port_unlock();
    if (canvas == NULL) {
        return luaL_error(L, "lvgl canvas allocation failed");
    }

    int id = vb_lua_lvgl_store_object(canvas);
    lua_pushinteger(L, id);
    return 1;
}

static int l_lv_canvas_fill_bg(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    uint32_t color = (uint32_t)luaL_checkinteger(L, 2);
    lv_opa_t opa = (lv_opa_t)luaL_optinteger(L, 3, LV_OPA_COVER);

    lvgl_port_lock(0);
    lv_obj_t *canvas = vb_lua_lvgl_resolve_object(id);
    lv_canvas_fill_bg(canvas, lv_color_hex(color), opa);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_canvas_draw_rect(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int x = (int)luaL_checkinteger(L, 2);
    int y = (int)luaL_checkinteger(L, 3);
    int width = (int)luaL_checkinteger(L, 4);
    int height = (int)luaL_checkinteger(L, 5);
    uint32_t color = 0;
    lv_opa_t opa = LV_OPA_COVER;
    int radius = 0;
    int border_width = 0;

    if (lua_istable(L, 6)) {
        lua_getfield(L, 6, "bg_color");
        color = (uint32_t)luaL_optinteger(L, -1, 0);
        lua_pop(L, 1);
        lua_getfield(L, 6, "bg_opa");
        opa = (lv_opa_t)luaL_optinteger(L, -1, LV_OPA_COVER);
        lua_pop(L, 1);
        lua_getfield(L, 6, "radius");
        radius = (int)luaL_optinteger(L, -1, 0);
        lua_pop(L, 1);
        lua_getfield(L, 6, "border_width");
        border_width = (int)luaL_optinteger(L, -1, 0);
        lua_pop(L, 1);
    } else {
        color = (uint32_t)luaL_checkinteger(L, 6);
        opa = (lv_opa_t)luaL_optinteger(L, 7, LV_OPA_COVER);
    }

    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = lv_color_hex(color);
    dsc.bg_opa = opa;
    dsc.radius = radius;
    dsc.border_width = border_width;

    lv_area_t area = {
        .x1 = x,
        .y1 = y,
        .x2 = x + width - 1,
        .y2 = y + height - 1,
    };

    lvgl_port_lock(0);
    lv_obj_t *canvas = vb_lua_lvgl_resolve_object(id);
    lv_canvas_draw_rect(canvas, area.x1, area.y1, lv_area_get_width(&area), lv_area_get_height(&area), &dsc);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_canvas_draw_text(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int x = (int)luaL_checkinteger(L, 2);
    int y = (int)luaL_checkinteger(L, 3);
    int width = (int)luaL_checkinteger(L, 4);
    const char *text = luaL_checkstring(L, 5);
    uint32_t color = 0xffffff;
    lv_opa_t opa = LV_OPA_COVER;
    lv_text_align_t align = LV_TEXT_ALIGN_CENTER;

    if (lua_istable(L, 6)) {
        lua_getfield(L, 6, "color");
        color = (uint32_t)luaL_optinteger(L, -1, 0xffffff);
        lua_pop(L, 1);
        lua_getfield(L, 6, "opa");
        opa = (lv_opa_t)luaL_optinteger(L, -1, LV_OPA_COVER);
        lua_pop(L, 1);
        lua_getfield(L, 6, "align");
        align = (lv_text_align_t)luaL_optinteger(L, -1, LV_TEXT_ALIGN_CENTER);
        lua_pop(L, 1);
    } else {
        color = (uint32_t)luaL_checkinteger(L, 6);
        opa = (lv_opa_t)luaL_optinteger(L, 7, LV_OPA_COVER);
        align = (lv_text_align_t)luaL_optinteger(L, 8, LV_TEXT_ALIGN_CENTER);
    }

    lv_draw_label_dsc_t dsc;
    lv_draw_label_dsc_init(&dsc);
    dsc.color = lv_color_hex(color);
    dsc.opa = opa;
    dsc.align = align;

    lvgl_port_lock(0);
    lv_obj_t *canvas = vb_lua_lvgl_resolve_object(id);
    lv_canvas_draw_text(canvas, x, y, width, &dsc, text);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_canvas_frame_begin(lua_State *L)
{
    vb_lua_lvgl_check_object_id(L, 1);
    lua_pushboolean(L, 0);
    return 1;
}

static int l_lv_canvas_frame_end(lua_State *L)
{
    vb_lua_lvgl_check_object_id(L, 1);
    return 0;
}

static int l_lv_obj_invalidate(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_invalidate(object);
    lvgl_port_unlock();
    return 0;
}

typedef struct {
    const char *name;
    lua_CFunction function;
} vb_lua_lvgl_canvas_function_t;

void vb_lua_lvgl_canvas_register(lua_State *L)
{
    s_canvas_buffer_used = false;

    const vb_lua_lvgl_canvas_function_t functions[] = {
        { "lv_canvas_create", l_lv_canvas_create },
        { "lv_canvas_fill_bg", l_lv_canvas_fill_bg },
        { "lv_canvas_draw_rect", l_lv_canvas_draw_rect },
        { "lv_canvas_draw_text", l_lv_canvas_draw_text },
        { "lv_canvas_begin", l_lv_canvas_frame_begin },
        { "lv_canvas_end", l_lv_canvas_frame_end },
        { "lv_canvas_frame_begin", l_lv_canvas_frame_begin },
        { "lv_canvas_frame_end", l_lv_canvas_frame_end },
        { "lv_obj_invalidate", l_lv_obj_invalidate },
    };

    for (size_t i = 0; i < sizeof(functions) / sizeof(functions[0]); i++) {
        lua_pushcfunction(L, functions[i].function);
        lua_setglobal(L, functions[i].name);
    }
}
