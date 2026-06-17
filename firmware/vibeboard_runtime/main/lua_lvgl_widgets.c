#include "lua_lvgl_internal.h"

#include <string.h>

#include "esp_lvgl_port.h"
#include "lauxlib.h"
#include "lvgl.h"

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

static int l_lv_img_set_antialias(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    bool enabled = lua_toboolean(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *image = vb_lua_lvgl_resolve_object(id);
    lv_img_set_antialias(image, enabled);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_img_set_angle(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int angle = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *image = vb_lua_lvgl_resolve_object(id);
    lv_img_set_angle(image, angle);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_img_set_pivot(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int x = (int)luaL_checkinteger(L, 2);
    int y = (int)luaL_checkinteger(L, 3);

    lvgl_port_lock(0);
    lv_obj_t *image = vb_lua_lvgl_resolve_object(id);
    lv_img_set_pivot(image, x, y);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_img_set_zoom(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int zoom = (int)luaL_checkinteger(L, 2);

    lvgl_port_lock(0);
    lv_obj_t *image = vb_lua_lvgl_resolve_object(id);
    lv_img_set_zoom(image, zoom);
    lvgl_port_unlock();
    return 0;
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

static int l_lv_obj_set_style_text_color(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    uint32_t color = (uint32_t)luaL_checkinteger(L, 2);
    lv_style_selector_t selector = (lv_style_selector_t)luaL_optinteger(L, 3, 0);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_text_color(object, lv_color_hex(color), selector);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_text_font(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int font = (int)luaL_checkinteger(L, 2);
    lv_style_selector_t selector = (lv_style_selector_t)luaL_optinteger(L, 3, 0);

    (void)font;
    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_text_font(object, LV_FONT_DEFAULT, selector);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_text_opa(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    lv_opa_t opa = (lv_opa_t)luaL_checkinteger(L, 2);
    lv_style_selector_t selector = (lv_style_selector_t)luaL_optinteger(L, 3, 0);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_text_opa(object, opa, selector);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_text_align(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    lv_text_align_t align = (lv_text_align_t)luaL_checkinteger(L, 2);
    lv_style_selector_t selector = (lv_style_selector_t)luaL_optinteger(L, 3, 0);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_text_align(object, align, selector);
    lvgl_port_unlock();
    return 0;
}

static int l_lv_obj_set_style_text_letter_space(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    int space = (int)luaL_checkinteger(L, 2);
    lv_style_selector_t selector = (lv_style_selector_t)luaL_optinteger(L, 3, 0);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_set_style_text_letter_space(object, space, selector);
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

static int l_lv_obj_remove_style_all(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);

    lvgl_port_lock(0);
    lv_obj_t *object = vb_lua_lvgl_resolve_object(id);
    lv_obj_remove_style_all(object);
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

static int l_lv_font_load(lua_State *L)
{
    (void)luaL_checkstring(L, 1);
    lua_pushinteger(L, 0);
    return 1;
}

static int l_lv_font_free(lua_State *L)
{
    (void)luaL_optinteger(L, 1, 0);
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
        { "lv_img_set_antialias", l_lv_img_set_antialias },
        { "lv_img_set_angle", l_lv_img_set_angle },
        { "lv_img_set_pivot", l_lv_img_set_pivot },
        { "lv_img_set_zoom", l_lv_img_set_zoom },
        { "lv_btn_create", l_lv_btn_create },
        { "lv_bar_create", l_lv_bar_create },
        { "lv_bar_set_range", l_lv_bar_set_range },
        { "lv_bar_set_value", l_lv_bar_set_value },
        { "lv_font_load", l_lv_font_load },
        { "lv_font_free", l_lv_font_free },
        { "lv_obj_set_size", l_lv_obj_set_size },
        { "lv_obj_set_width", l_lv_obj_set_width },
        { "lv_obj_set_height", l_lv_obj_set_height },
        { "lv_obj_set_pos", l_lv_obj_set_pos },
        { "lv_obj_set_x", l_lv_obj_set_x },
        { "lv_obj_set_y", l_lv_obj_set_y },
        { "lv_obj_set_style_bg_color", l_lv_obj_set_style_bg_color },
        { "lv_obj_set_style_text_color", l_lv_obj_set_style_text_color },
        { "lv_obj_set_style_text_font", l_lv_obj_set_style_text_font },
        { "lv_obj_set_style_text_opa", l_lv_obj_set_style_text_opa },
        { "lv_obj_set_style_text_align", l_lv_obj_set_style_text_align },
        { "lv_obj_set_style_text_letter_space", l_lv_obj_set_style_text_letter_space },
        { "lv_obj_set_style_radius", l_lv_obj_set_style_radius },
        { "lv_obj_set_style_pad_all", l_lv_obj_set_style_pad_all },
        { "lv_obj_set_style_border_width", l_lv_obj_set_style_border_width },
        { "lv_obj_set_style_border_color", l_lv_obj_set_style_border_color },
        { "lv_label_set_text", l_lv_label_set_text },
        { "lv_label_set_long_mode", l_lv_label_set_long_mode },
        { "lv_obj_add_flag", l_lv_obj_add_flag },
        { "lv_obj_clear_flag", l_lv_obj_clear_flag },
        { "lv_obj_remove_style_all", l_lv_obj_remove_style_all },
        { "lv_obj_align", l_lv_obj_align },
    };

    for (size_t i = 0; i < sizeof(functions) / sizeof(functions[0]); i++) {
        lua_pushcfunction(L, functions[i].function);
        lua_setglobal(L, functions[i].name);
    }
}
