#include "lua_lvgl_internal.h"

#include <string.h>

#include "esp_lvgl_port.h"
#include "esp_heap_caps.h"
#include "lauxlib.h"
#include "lvgl.h"

#define VB_LVGL_CANVAS_MAX_PIXELS (320 * 240)

static lv_opa_t clamp_opa(int value)
{
    if (value < 0) {
        return 0;
    }
    if (value > 255) {
        return 255;
    }
    return (lv_opa_t)value;
}

static bool table_integer(lua_State *L, int table_index, const char *name, lua_Integer *value)
{
    lua_getfield(L, table_index, name);
    bool found = lua_isnumber(L, -1);
    if (found) {
        *value = lua_tointeger(L, -1);
    }
    lua_pop(L, 1);
    return found;
}

static uint32_t table_color(lua_State *L, int table_index, const char *first, const char *second, uint32_t default_value)
{
    lua_Integer value = 0;
    if (table_integer(L, table_index, first, &value)) {
        return (uint32_t)value;
    }
    if (second != NULL && table_integer(L, table_index, second, &value)) {
        return (uint32_t)value;
    }
    return default_value;
}

static int table_int(lua_State *L, int table_index, const char *first, const char *second, int default_value)
{
    lua_Integer value = 0;
    if (table_integer(L, table_index, first, &value)) {
        return (int)value;
    }
    if (second != NULL && table_integer(L, table_index, second, &value)) {
        return (int)value;
    }
    return default_value;
}

static void heap_buffer_cleanup(void *data)
{
    heap_caps_free(data);
}

static int create_object(lua_State *L, lv_obj_t *(*create_fn)(lv_obj_t *))
{
    int parent_id = vb_lua_lvgl_check_object_id(L, 1);
    if (!vb_lua_lvgl_can_store_object()) {
        return luaL_error(L, "lvgl object table full");
    }

    lvgl_port_lock(0);
    lv_obj_t *parent = vb_lua_lvgl_resolve_object(parent_id);
    lv_obj_t *object = create_fn(parent);
    lvgl_port_unlock();
    if (object == NULL) {
        return luaL_error(L, "lvgl object allocation failed");
    }

    int id = vb_lua_lvgl_store_object(object);
    lua_pushinteger(L, id);
    return 1;
}

static int l_lv_scr_act(lua_State *L)
{
    lua_pushinteger(L, 0);
    return 1;
}

static int l_lv_obj_clean(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_clean(object);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_create(lua_State *L)
{
    return create_object(L, lv_obj_create);
}

static int l_lv_label_create(lua_State *L)
{
    return create_object(L, lv_label_create);
}

static int l_lv_img_create(lua_State *L)
{
    return create_object(L, lv_img_create);
}

static int l_lv_btn_create(lua_State *L)
{
    return create_object(L, lv_btn_create);
}

static int l_lv_bar_create(lua_State *L)
{
    return create_object(L, lv_bar_create);
}

static int l_lv_img_set_src(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    const char *src = luaL_checkstring(L, 2);
    char resolved[VB_LVGL_PATH_MAX];
    if (!vb_lua_lvgl_resolve_asset_path(src, resolved, sizeof(resolved))) {
        return luaL_error(L, "invalid image source path");
    }

    lvgl_port_lock(0);
    lv_obj_t *image = vb_lua_lvgl_resolve_object(id);
    lv_img_set_src(image, resolved);
    lvgl_port_unlock();
    lua_pushstring(L, resolved);
    return 1;
}

static int l_lv_obj_set_size(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int width = (int)luaL_checkinteger(L, 2);
    int height = (int)luaL_checkinteger(L, 3);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_size(object, width, height);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_width(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int width = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_width(object, width);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_height(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int height = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_height(object, height);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_pos(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int x = (int)luaL_checkinteger(L, 2);
    int y = (int)luaL_checkinteger(L, 3);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_pos(object, x, y);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_x(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int x = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_x(object, x);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_y(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int y = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_y(object, y);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_bg_color(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    uint32_t color = (uint32_t)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_bg_color(object, lv_color_hex(color), 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_bg_opa(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    lv_opa_t opa = clamp_opa((int)luaL_checkinteger(L, 2));

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_bg_opa(object, opa, 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_text_color(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    uint32_t color = (uint32_t)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_text_color(object, lv_color_hex(color), 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_radius(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int radius = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_radius(object, radius, 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_pad_all(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int pad = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_pad_all(object, pad, 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_border_width(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int width = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_border_width(object, width, 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_border_color(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    uint32_t color = (uint32_t)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_border_color(object, lv_color_hex(color), 0);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_add_flag(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    lv_obj_flag_t flag = (lv_obj_flag_t)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_add_flag(object, flag);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_clear_flag(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    lv_obj_flag_t flag = (lv_obj_flag_t)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_clear_flag(object, flag);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_label_set_text(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    const char *text = luaL_checkstring(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *label = vb_lua_lvgl_resolve_object(id);
    lv_label_set_text(label, text);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_label_set_long_mode(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    lv_label_long_mode_t mode = (lv_label_long_mode_t)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *label = vb_lua_lvgl_resolve_object(id);
    lv_label_set_long_mode(label, mode);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_align(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    lv_align_t align = (lv_align_t)luaL_checkinteger(L, 2);
    int x = (int)luaL_optinteger(L, 3, 0);
    int y = (int)luaL_optinteger(L, 4, 0);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_align(object, align, x, y);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_bar_set_range(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int min = (int)luaL_checkinteger(L, 2);
    int max = (int)luaL_checkinteger(L, 3);

    lvgl_port_lock(0);
    lv_obj_t *bar = vb_lua_lvgl_resolve_object(id);
    lv_bar_set_range(bar, min, max);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_bar_set_value(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int value = (int)luaL_checkinteger(L, 2);
    lv_anim_enable_t anim = (lv_anim_enable_t)luaL_optinteger(L, 3, LV_ANIM_OFF);

    lvgl_port_lock(0);
    lv_obj_t *bar = vb_lua_lvgl_resolve_object(id);
    lv_bar_set_value(bar, value, anim);
    lvgl_port_unlock();
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

static int l_lv_canvas_create(lua_State *L)
{
    int parent_id = vb_lua_lvgl_check_object_id(L, 1);
    int width = (int)luaL_checkinteger(L, 2);
    int height = (int)luaL_checkinteger(L, 3);
    lv_img_cf_t color_format = (lv_img_cf_t)luaL_optinteger(L, 4, LV_IMG_CF_TRUE_COLOR);

    if (width <= 0 || height <= 0) {
        return luaL_error(L, "canvas size must be positive");
    }
    if ((size_t)width * (size_t)height > VB_LVGL_CANVAS_MAX_PIXELS) {
        return luaL_error(L, "canvas exceeds maximum size");
    }
    if (color_format != LV_IMG_CF_TRUE_COLOR) {
        return luaL_error(L, "only LV_IMG_CF_TRUE_COLOR canvas is supported");
    }
    if (!vb_lua_lvgl_can_store_object()) {
        return luaL_error(L, "lvgl object table full");
    }

    size_t buffer_size = (size_t)width * (size_t)height * sizeof(lv_color_t);
    void *buffer = heap_caps_malloc(buffer_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (buffer == NULL) {
        buffer = heap_caps_malloc(buffer_size, MALLOC_CAP_8BIT);
    }
    if (buffer == NULL) {
        return luaL_error(L, "canvas buffer allocation failed");
    }

    lvgl_port_lock(0);
    lv_obj_t *parent = vb_lua_lvgl_resolve_object(parent_id);
    lv_obj_t *canvas = lv_canvas_create(parent);
    if (canvas != NULL) {
        lv_canvas_set_buffer(canvas, buffer, width, height, LV_IMG_CF_TRUE_COLOR);
    }
    lvgl_port_unlock();

    if (canvas == NULL) {
        heap_caps_free(buffer);
        return luaL_error(L, "canvas allocation failed");
    }

    int id = vb_lua_lvgl_store_object_with_cleanup(canvas, heap_buffer_cleanup, buffer);
    lua_pushinteger(L, id);
    return 1;
}

static int l_lv_canvas_fill_bg(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    uint32_t color = (uint32_t)luaL_checkinteger(L, 2);
    lv_opa_t opa = clamp_opa((int)luaL_optinteger(L, 3, 255));

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

    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);

    if (lua_istable(L, 6)) {
        dsc.bg_color = lv_color_hex(table_color(L, 6, "bg_color", "color", 0xffffff));
        dsc.bg_opa = clamp_opa(table_int(L, 6, "bg_opa", "opa", 255));
        dsc.radius = (lv_coord_t)table_int(L, 6, "radius", NULL, 0);
        dsc.border_width = (lv_coord_t)table_int(L, 6, "border_width", NULL, 0);
        dsc.border_color = lv_color_hex(table_color(L, 6, "border_color", NULL, 0xffffff));
        dsc.border_opa = clamp_opa(table_int(L, 6, "border_opa", NULL, 255));
    } else {
        uint32_t color = (uint32_t)luaL_optinteger(L, 6, 0xffffff);
        dsc.bg_color = lv_color_hex(color);
        dsc.bg_opa = clamp_opa((int)luaL_optinteger(L, 7, 255));
        dsc.border_width = 0;
    }

    lvgl_port_lock(0);
    lv_obj_t *canvas = vb_lua_lvgl_resolve_object(id);
    lv_canvas_draw_rect(canvas, x, y, width, height, &dsc);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_canvas_draw_text(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int x = (int)luaL_checkinteger(L, 2);
    int y = (int)luaL_checkinteger(L, 3);
    int max_width = (int)luaL_checkinteger(L, 4);
    const char *text = NULL;
    int style_index = 0;

    if (lua_isstring(L, 5)) {
        text = lua_tostring(L, 5);
        if (lua_istable(L, 6)) {
            style_index = 6;
        }
    } else if (lua_istable(L, 5) && lua_isstring(L, 6)) {
        style_index = 5;
        text = lua_tostring(L, 6);
    } else {
        return luaL_error(L, "canvas text expects text string");
    }

    lv_draw_label_dsc_t dsc;
    lv_draw_label_dsc_init(&dsc);
    dsc.font = LV_FONT_DEFAULT;

    if (style_index > 0) {
        dsc.color = lv_color_hex(table_color(L, style_index, "color", NULL, 0xffffff));
        dsc.opa = clamp_opa(table_int(L, style_index, "opa", NULL, 255));
        dsc.align = (lv_text_align_t)table_int(L, style_index, "align", NULL, LV_TEXT_ALIGN_LEFT);
    } else if (lua_isnumber(L, 6)) {
        uint32_t color = (uint32_t)lua_tointeger(L, 6);
        dsc.color = lv_color_hex(color);
        dsc.opa = clamp_opa((int)luaL_optinteger(L, 7, 255));
        dsc.align = (lv_text_align_t)luaL_optinteger(L, 8, LV_TEXT_ALIGN_LEFT);
    }

    lvgl_port_lock(0);
    lv_obj_t *canvas = vb_lua_lvgl_resolve_object(id);
    lv_canvas_draw_text(canvas, x, y, max_width, &dsc, text);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_canvas_frame_begin(lua_State *L)
{
    vb_lua_lvgl_check_object_id(L, 1);
    lua_pushboolean(L, true);
    return 1;
}

static int l_lv_canvas_frame_end(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);

    lvgl_port_lock(0);
    lv_obj_t *canvas = vb_lua_lvgl_resolve_object(id);
    lv_obj_invalidate(canvas);
    lvgl_port_unlock();
    return 0;
}

typedef struct {
    const char *name;
    lua_CFunction function;
} vb_lua_lvgl_function_t;

void vb_lua_lvgl_widgets_register(lua_State *L)
{
    const vb_lua_lvgl_function_t functions[] = {
        { "lv_scr_act", l_lv_scr_act },
        { "lv_obj_clean", l_lv_obj_clean },
        { "lv_obj_create", l_lv_obj_create },
        { "lv_label_create", l_lv_label_create },
        { "lv_img_create", l_lv_img_create },
        { "lv_img_set_src", l_lv_img_set_src },
        { "lv_btn_create", l_lv_btn_create },
        { "lv_bar_create", l_lv_bar_create },
        { "lv_bar_set_range", l_lv_bar_set_range },
        { "lv_bar_set_value", l_lv_bar_set_value },
        { "lv_canvas_create", l_lv_canvas_create },
        { "lv_canvas_fill_bg", l_lv_canvas_fill_bg },
        { "lv_canvas_draw_rect", l_lv_canvas_draw_rect },
        { "lv_canvas_draw_text", l_lv_canvas_draw_text },
        { "lv_canvas_frame_begin", l_lv_canvas_frame_begin },
        { "lv_canvas_frame_end", l_lv_canvas_frame_end },
        { "lv_canvas_begin", l_lv_canvas_frame_begin },
        { "lv_canvas_end", l_lv_canvas_frame_end },
        { "lv_obj_set_size", l_lv_obj_set_size },
        { "lv_obj_set_width", l_lv_obj_set_width },
        { "lv_obj_set_height", l_lv_obj_set_height },
        { "lv_obj_set_pos", l_lv_obj_set_pos },
        { "lv_obj_set_x", l_lv_obj_set_x },
        { "lv_obj_set_y", l_lv_obj_set_y },
        { "lv_obj_set_style_bg_color", l_lv_obj_set_style_bg_color },
        { "lv_obj_set_style_bg_opa", l_lv_obj_set_style_bg_opa },
        { "lv_obj_set_style_text_color", l_lv_obj_set_style_text_color },
        { "lv_obj_set_style_radius", l_lv_obj_set_style_radius },
        { "lv_obj_set_style_pad_all", l_lv_obj_set_style_pad_all },
        { "lv_obj_set_style_border_width", l_lv_obj_set_style_border_width },
        { "lv_obj_set_style_border_color", l_lv_obj_set_style_border_color },
        { "lv_label_set_text", l_lv_label_set_text },
        { "lv_label_set_long_mode", l_lv_label_set_long_mode },
        { "lv_obj_add_flag", l_lv_obj_add_flag },
        { "lv_obj_clear_flag", l_lv_obj_clear_flag },
        { "lv_obj_invalidate", l_lv_obj_invalidate },
        { "lv_obj_align", l_lv_obj_align },
    };

    for (size_t i = 0; i < sizeof(functions) / sizeof(functions[0]); i++) {
        lua_pushcfunction(L, functions[i].function);
        lua_setglobal(L, functions[i].name);
    }
}
