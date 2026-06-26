#include "lua_lvgl_internal.h"

#include <stdbool.h>
#include <stdint.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>

#include "board_lckfb_szpi_s3.h"
#include "esp_lvgl_port.h"
#include "esp_log.h"
#include "esp_heap_caps.h"
#include "lauxlib.h"
#include "lvgl.h"

#define TAG "lua_lvgl_canvas"
#define VB_LVGL_CANVAS_WIDTH 320
#define VB_LVGL_CANVAS_HEIGHT 240

static lv_color_t s_canvas_buffer[VB_LVGL_CANVAS_WIDTH * VB_LVGL_CANVAS_HEIGHT];
static uint8_t s_bmp_row[VB_LVGL_CANVAS_WIDTH * 2];
static bool s_canvas_buffer_used;

static uint16_t read_le16(const uint8_t *data)
{
    return (uint16_t)data[0] | ((uint16_t)data[1] << 8);
}

static uint32_t read_le32(const uint8_t *data)
{
    return (uint32_t)data[0] | ((uint32_t)data[1] << 8) | ((uint32_t)data[2] << 16) | ((uint32_t)data[3] << 24);
}

static int32_t read_le32_signed(const uint8_t *data)
{
    return (int32_t)read_le32(data);
}

static bool resolved_lv_path_to_sd_path(const char *resolved, char *path, size_t path_size)
{
    if (strncmp(resolved, "S:/", 3) != 0) {
        return false;
    }
    int written = snprintf(path, path_size, "%s/%s", VB_SD_MOUNT_POINT, resolved + 3);
    return written > 0 && (size_t)written < path_size;
}

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

static int l_lv_canvas_load_bmp(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    const char *src = luaL_checkstring(L, 2);
    char resolved[VB_LVGL_PATH_MAX];
    char path[VB_LVGL_PATH_MAX];

    if (!vb_lua_lvgl_resolve_asset_path(src, resolved, sizeof(resolved)) ||
        !resolved_lv_path_to_sd_path(resolved, path, sizeof(path))) {
        ESP_LOGE(TAG, "resolve bmp source failed path=%s detail=invalid BMP source path", src);
        return luaL_error(L, "invalid BMP source path");
    }

    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        ESP_LOGE(TAG, "open bmp failed path=%s detail=%s", path, strerror(errno));
        return luaL_error(L, "BMP open failed");
    }

    uint8_t header[66];
    if (fread(header, 1, sizeof(header), file) != sizeof(header)) {
        fclose(file);
        ESP_LOGE(TAG, "read bmp failed path=%s detail=header read failed", path);
        return luaL_error(L, "BMP header read failed");
    }
    uint32_t px_offset = read_le32(header + 10);
    int32_t width = read_le32_signed(header + 18);
    int32_t signed_height = read_le32_signed(header + 22);
    uint16_t bpp = read_le16(header + 28);
    uint32_t compression = read_le32(header + 30);
    int32_t height = signed_height < 0 ? -signed_height : signed_height;

    if (header[0] != 'B' || header[1] != 'M' ||
        width != VB_LVGL_CANVAS_WIDTH ||
        height != VB_LVGL_CANVAS_HEIGHT ||
        bpp != 16 ||
        (compression != 0 && compression != 3)) {
        fclose(file);
        ESP_LOGE(TAG, "resolve bmp source failed path=%s detail=unsupported BMP format", src);
        return luaL_error(L, "unsupported BMP format");
    }
    uint32_t row_size = ((uint32_t)bpp * (uint32_t)width + 31U) / 32U * 4U;
    if (row_size > sizeof(s_bmp_row)) {
        fclose(file);
        ESP_LOGE(TAG, "resolve bmp source failed path=%s detail=BMP row too large", src);
        return luaL_error(L, "BMP row too large");
    }

    lv_color_t *scratch = heap_caps_malloc(sizeof(s_canvas_buffer), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (scratch == NULL) {
        scratch = heap_caps_malloc(sizeof(s_canvas_buffer), MALLOC_CAP_8BIT);
    }
    if (scratch == NULL) {
        fclose(file);
        ESP_LOGE(TAG, "resolve bmp source failed path=%s detail=BMP canvas buffer allocation failed", src);
        return luaL_error(L, "BMP canvas buffer allocation failed");
    }
    for (int32_t file_y = 0; file_y < height; file_y++) {
        long offset = (long)(px_offset + (uint32_t)file_y * row_size);
        if (fseek(file, offset, SEEK_SET) != 0 ||
            fread(s_bmp_row, 1, row_size, file) != row_size) {
            heap_caps_free(scratch);
            fclose(file);
            ESP_LOGE(TAG, "read bmp failed path=%s detail=pixel read failed", path);
            return luaL_error(L, "BMP pixel read failed");
        }
        int32_t dest_y = signed_height > 0 ? (height - 1 - file_y) : file_y;
        lv_color_t *dest = &scratch[dest_y * VB_LVGL_CANVAS_WIDTH];
        for (int32_t x = 0; x < width; x++) {
            uint16_t raw = read_le16(&s_bmp_row[x * 2]);
            uint8_t r = (uint8_t)(((raw >> 11) & 0x1f) * 255 / 31);
            uint8_t g = (uint8_t)(((raw >> 5) & 0x3f) * 255 / 63);
            uint8_t b = (uint8_t)((raw & 0x1f) * 255 / 31);
            dest[x] = lv_color_make(r, g, b);
        }
    }

    lvgl_port_lock(0);
    lv_obj_t *canvas = vb_lua_lvgl_resolve_object(id);
    memcpy(s_canvas_buffer, scratch, sizeof(s_canvas_buffer));
    lv_obj_invalidate(canvas);
    lvgl_port_unlock();
    heap_caps_free(scratch);
    fclose(file);

    lua_pushstring(L, resolved);
    return 1;
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
        { "lv_canvas_load_bmp", l_lv_canvas_load_bmp },
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
