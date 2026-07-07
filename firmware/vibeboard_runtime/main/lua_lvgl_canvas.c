#include "lua_lvgl_internal.h"

#include <stdbool.h>
#include <stdint.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>

#include "board_lckfb_szpi_s3.h"
#include "esp_attr.h"
#include "esp_lvgl_port.h"
#include "esp_log.h"
#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "lauxlib.h"
#include "lvgl.h"

#define TAG "lua_lvgl_canvas"
#define VB_LVGL_CANVAS_WIDTH 320
#define VB_LVGL_CANVAS_HEIGHT 240
#define VB_BMP_READ_CHUNK_SIZE (4 * 1024)
#define VB_IMAGE_READ_CHUNK_MAX_SIZE (32 * 1024)
#define VBIMG_HEADER_SIZE 16
#define VBIMG_FORMAT_RGB565 1

static lv_color_t s_canvas_buffer[VB_LVGL_CANVAS_WIDTH * VB_LVGL_CANVAS_HEIGHT];
static uint8_t s_bmp_row[VB_LVGL_CANVAS_WIDTH * 2];
static DMA_ATTR uint8_t s_bmp_read_chunk[VB_BMP_READ_CHUNK_SIZE];
static bool s_canvas_buffer_used;

typedef struct {
    bool valid;
    char resolved[VB_LVGL_PATH_MAX];
    lv_color_t *pixels;
    int64_t last_read_us;
    size_t read_chunk_bytes;
    size_t largest_dma_before;
    size_t largest_dma_after;
} vb_vbimg_cache_t;

static vb_vbimg_cache_t s_vbimg_cache;

static uint8_t *alloc_image_read_chunk(size_t preferred_size, size_t *allocated_size)
{
    while (preferred_size >= VB_BMP_READ_CHUNK_SIZE) {
        uint8_t *buffer = heap_caps_malloc(preferred_size, MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA | MALLOC_CAP_8BIT);
        if (buffer != NULL) {
            *allocated_size = preferred_size;
            return buffer;
        }
        preferred_size /= 2;
    }

    *allocated_size = sizeof(s_bmp_read_chunk);
    return s_bmp_read_chunk;
}

static void free_image_read_chunk(uint8_t *buffer)
{
    if (buffer != NULL && buffer != s_bmp_read_chunk) {
        heap_caps_free(buffer);
    }
}

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

static bool bmp_is_rgb565(uint32_t compression, const uint8_t *header)
{
    if (compression == 0) {
        return true;
    }
    if (compression != 3) {
        return false;
    }
    uint32_t red_mask = read_le32(header + 54);
    uint32_t green_mask = read_le32(header + 58);
    uint32_t blue_mask = read_le32(header + 62);
    return red_mask == 0x0000f800U &&
           green_mask == 0x000007e0U &&
           blue_mask == 0x0000001fU;
}

#if LV_COLOR_DEPTH == 16
static uint16_t bmp_rgb565_to_lv_color_full(uint16_t raw)
{
#if LV_COLOR_16_SWAP
    return __builtin_bswap16(raw);
#else
    return raw;
#endif
}

static void reverse_bmp_rows(uint8_t *pixels, uint32_t row_size, int32_t height)
{
    for (int32_t y = 0; y < height / 2; y++) {
        uint8_t *top = pixels + ((size_t)y * row_size);
        uint8_t *bottom = pixels + ((size_t)(height - 1 - y) * row_size);
        memcpy(s_bmp_row, top, row_size);
        memcpy(top, bottom, row_size);
        memcpy(bottom, s_bmp_row, row_size);
    }
}

static void convert_rgb565_buffer_to_lv_color(lv_color_t *dest, int32_t width, int32_t height)
{
#if LV_COLOR_16_SWAP
    uint8_t *src = (uint8_t *)dest;
    size_t pixel_count = (size_t)width * (size_t)height;
    for (size_t i = 0; i < pixel_count; i++) {
        dest[i].full = bmp_rgb565_to_lv_color_full(read_le16(&src[i * 2]));
    }
#else
    (void)dest;
    (void)width;
    (void)height;
#endif
}
#endif

static bool read_bmp_pixels_dma(FILE *file,
                                uint8_t *dest,
                                size_t bytes,
                                int64_t *read_us,
                                size_t *read_chunk_bytes,
                                size_t *largest_dma_before,
                                size_t *largest_dma_after)
{
    size_t chunk_size = sizeof(s_bmp_read_chunk);
    if (largest_dma_before != NULL) {
        *largest_dma_before = heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA | MALLOC_CAP_8BIT);
    }
    uint8_t *chunk = alloc_image_read_chunk(VB_IMAGE_READ_CHUNK_MAX_SIZE, &chunk_size);
    if (chunk == NULL) {
        return false;
    }
    if (read_chunk_bytes != NULL) {
        *read_chunk_bytes = chunk_size;
    }

    bool ok = true;
    size_t total_read = 0;
    while (total_read < bytes) {
        size_t wanted = bytes - total_read;
        if (wanted > chunk_size) {
            wanted = chunk_size;
        }

        int64_t stage_us = esp_timer_get_time();
        size_t got = fread(chunk, 1, wanted, file);
        if (read_us != NULL) {
            *read_us += esp_timer_get_time() - stage_us;
        }
        if (got != wanted) {
            ok = false;
            break;
        }
        memcpy(dest + total_read, chunk, got);
        total_read += got;
    }

    free_image_read_chunk(chunk);
    if (largest_dma_after != NULL) {
        *largest_dma_after = heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA | MALLOC_CAP_8BIT);
    }
    return ok;
}

static bool read_vbimg_pixels_dma(FILE *file,
                                  uint8_t *dest,
                                  size_t bytes,
                                  int64_t *read_us,
                                  size_t *read_chunk_bytes,
                                  size_t *largest_dma_before,
                                  size_t *largest_dma_after)
{
    return read_bmp_pixels_dma(file, dest, bytes, read_us, read_chunk_bytes, largest_dma_before, largest_dma_after);
}

static void vbimg_cache_release(void)
{
    if (s_vbimg_cache.pixels != NULL) {
        heap_caps_free(s_vbimg_cache.pixels);
    }
    memset(&s_vbimg_cache, 0, sizeof(s_vbimg_cache));
}

static bool vbimg_cache_matches(const char *resolved)
{
    return s_vbimg_cache.valid &&
           resolved != NULL &&
           strcmp(s_vbimg_cache.resolved, resolved) == 0 &&
           s_vbimg_cache.pixels != NULL;
}

static bool vbimg_cache_load(const char *resolved,
                             const char *path,
                             char *error,
                             size_t error_size)
{
    if (vbimg_cache_matches(resolved)) {
        return true;
    }

    int64_t read_us = 0;
    size_t read_chunk_bytes = 0;
    size_t largest_dma_before = 0;
    size_t largest_dma_after = 0;
    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        snprintf(error, error_size, "VBIMG open failed");
        ESP_LOGE(TAG, "open vbimg failed path=%s detail=%s", path, strerror(errno));
        return false;
    }

    uint8_t header[VBIMG_HEADER_SIZE];
    if (fread(header, 1, sizeof(header), file) != sizeof(header)) {
        fclose(file);
        snprintf(error, error_size, "VBIMG header read failed");
        ESP_LOGE(TAG, "read vbimg failed path=%s detail=header read failed", path);
        return false;
    }

    uint16_t width = read_le16(header + 6);
    uint16_t height = read_le16(header + 8);
    uint8_t format = header[10];
    uint32_t pixel_bytes = read_le32(header + 12);
    if (memcmp(header, "VBIMG1", 6) != 0 ||
        width != VB_LVGL_CANVAS_WIDTH ||
        height != VB_LVGL_CANVAS_HEIGHT ||
        format != VBIMG_FORMAT_RGB565 ||
        pixel_bytes != sizeof(s_canvas_buffer)) {
        fclose(file);
        snprintf(error, error_size, "unsupported VBIMG format");
        ESP_LOGE(TAG, "resolve vbimg source failed path=%s detail=unsupported VBIMG format", resolved);
        return false;
    }

    lv_color_t *pixels = heap_caps_malloc(sizeof(s_canvas_buffer), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (pixels == NULL) {
        pixels = heap_caps_malloc(sizeof(s_canvas_buffer), MALLOC_CAP_8BIT);
    }
    if (pixels == NULL) {
        fclose(file);
        snprintf(error, error_size, "VBIMG cache allocation failed");
        ESP_LOGE(TAG, "resolve vbimg source failed path=%s detail=VBIMG cache allocation failed", resolved);
        return false;
    }

    if (!read_vbimg_pixels_dma(file,
                               (uint8_t *)pixels,
                               pixel_bytes,
                               &read_us,
                               &read_chunk_bytes,
                               &largest_dma_before,
                               &largest_dma_after)) {
        heap_caps_free(pixels);
        fclose(file);
        snprintf(error, error_size, "VBIMG pixel read failed");
        ESP_LOGE(TAG, "read vbimg failed path=%s detail=pixel read failed", path);
        return false;
    }
    fclose(file);

#if LV_COLOR_DEPTH == 16 && LV_COLOR_16_SWAP
    convert_rgb565_buffer_to_lv_color(pixels, width, height);
#endif

    vbimg_cache_release();
    s_vbimg_cache.valid = true;
    strlcpy(s_vbimg_cache.resolved, resolved, sizeof(s_vbimg_cache.resolved));
    s_vbimg_cache.pixels = pixels;
    s_vbimg_cache.last_read_us = read_us;
    s_vbimg_cache.read_chunk_bytes = read_chunk_bytes;
    s_vbimg_cache.largest_dma_before = largest_dma_before;
    s_vbimg_cache.largest_dma_after = largest_dma_after;
    return true;
}

static void push_vbimg_cache_stats(lua_State *L, int64_t started_us, bool cache_hit, int64_t lvgl_us)
{
    lua_newtable(L);
    lua_pushinteger(L, (lua_Integer)((esp_timer_get_time() - started_us) / 1000));
    lua_setfield(L, -2, "total_ms");
    lua_pushinteger(L, cache_hit ? 0 : (lua_Integer)(s_vbimg_cache.last_read_us / 1000));
    lua_setfield(L, -2, "read_ms");
    lua_pushinteger(L, (lua_Integer)s_vbimg_cache.read_chunk_bytes);
    lua_setfield(L, -2, "read_chunk_bytes");
    lua_pushinteger(L, (lua_Integer)s_vbimg_cache.largest_dma_before);
    lua_setfield(L, -2, "largest_dma_before");
    lua_pushinteger(L, (lua_Integer)s_vbimg_cache.largest_dma_after);
    lua_setfield(L, -2, "largest_dma_after");
    lua_pushinteger(L, 0);
    lua_setfield(L, -2, "convert_ms");
    lua_pushinteger(L, (lua_Integer)(lvgl_us / 1000));
    lua_setfield(L, -2, "lvgl_ms");
    lua_pushboolean(L, true);
    lua_setfield(L, -2, "fast_path");
    lua_pushboolean(L, cache_hit);
    lua_setfield(L, -2, "cache_hit");
    lua_pushinteger(L, (lua_Integer)(s_vbimg_cache.last_read_us / 1000));
    lua_setfield(L, -2, "cache_read_ms");
    lua_pushstring(L, "vbimg-rgb565");
    lua_setfield(L, -2, "format");
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
    int64_t started_us = esp_timer_get_time();
    int64_t open_us = 0;
    int64_t header_us = 0;
    int64_t alloc_us = 0;
    int64_t seek_us = 0;
    int64_t read_us = 0;
    int64_t convert_us = 0;
    int64_t lvgl_us = 0;
    size_t read_chunk_bytes = 0;
    size_t largest_dma_before = 0;
    size_t largest_dma_after = 0;

    if (!vb_lua_lvgl_resolve_asset_path(src, resolved, sizeof(resolved)) ||
        !resolved_lv_path_to_sd_path(resolved, path, sizeof(path))) {
        ESP_LOGE(TAG, "resolve bmp source failed path=%s detail=invalid BMP source path", src);
        return luaL_error(L, "invalid BMP source path");
    }

    int64_t stage_us = esp_timer_get_time();
    FILE *file = fopen(path, "rb");
    open_us = esp_timer_get_time() - stage_us;
    if (file == NULL) {
        ESP_LOGE(TAG, "open bmp failed path=%s detail=%s", path, strerror(errno));
        return luaL_error(L, "BMP open failed");
    }

    uint8_t header[66];
    stage_us = esp_timer_get_time();
    if (fread(header, 1, sizeof(header), file) != sizeof(header)) {
        fclose(file);
        ESP_LOGE(TAG, "read bmp failed path=%s detail=header read failed", path);
        return luaL_error(L, "BMP header read failed");
    }
    header_us = esp_timer_get_time() - stage_us;
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

    stage_us = esp_timer_get_time();
    lv_color_t *scratch = heap_caps_malloc(sizeof(s_canvas_buffer), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (scratch == NULL) {
        scratch = heap_caps_malloc(sizeof(s_canvas_buffer), MALLOC_CAP_8BIT);
    }
    alloc_us = esp_timer_get_time() - stage_us;
    if (scratch == NULL) {
        fclose(file);
        ESP_LOGE(TAG, "resolve bmp source failed path=%s detail=BMP canvas buffer allocation failed", src);
        return luaL_error(L, "BMP canvas buffer allocation failed");
    }
    stage_us = esp_timer_get_time();
    if (fseek(file, (long)px_offset, SEEK_SET) != 0) {
        heap_caps_free(scratch);
        fclose(file);
        ESP_LOGE(TAG, "read bmp failed path=%s detail=pixel read failed", path);
        return luaL_error(L, "BMP pixel read failed");
    }
    seek_us = esp_timer_get_time() - stage_us;

    bool use_rgb565_fast_path = false;
#if LV_COLOR_DEPTH == 16
    use_rgb565_fast_path = bpp == 16 &&
                           row_size == (uint32_t)width * 2U &&
                           bmp_is_rgb565(compression, header);
#endif
#if LV_COLOR_DEPTH == 16
    if (use_rgb565_fast_path) {
        size_t pixel_bytes = (size_t)row_size * (size_t)height;
        if (!read_bmp_pixels_dma(file,
                                 (uint8_t *)scratch,
                                 pixel_bytes,
                                 &read_us,
                                 &read_chunk_bytes,
                                 &largest_dma_before,
                                 &largest_dma_after)) {
            heap_caps_free(scratch);
            fclose(file);
            ESP_LOGE(TAG, "read bmp failed path=%s detail=pixel read failed", path);
            return luaL_error(L, "BMP pixel read failed");
        }
        stage_us = esp_timer_get_time();
        if (signed_height > 0) {
            reverse_bmp_rows((uint8_t *)scratch, row_size, height);
        }
        convert_rgb565_buffer_to_lv_color(scratch, width, height);
        convert_us += esp_timer_get_time() - stage_us;
    } else {
#endif
        for (int32_t file_y = 0; file_y < height; file_y++) {
            stage_us = esp_timer_get_time();
            if (fread(s_bmp_row, 1, row_size, file) != row_size) {
                heap_caps_free(scratch);
                fclose(file);
                ESP_LOGE(TAG, "read bmp failed path=%s detail=pixel read failed", path);
                return luaL_error(L, "BMP pixel read failed");
            }
            read_us += esp_timer_get_time() - stage_us;
            int32_t dest_y = signed_height > 0 ? (height - 1 - file_y) : file_y;
            lv_color_t *dest = &scratch[dest_y * VB_LVGL_CANVAS_WIDTH];
            stage_us = esp_timer_get_time();
            for (int32_t x = 0; x < width; x++) {
                uint16_t raw = read_le16(&s_bmp_row[x * 2]);
                uint8_t r = (uint8_t)(((raw >> 11) & 0x1f) * 255 / 31);
                uint8_t g = (uint8_t)(((raw >> 5) & 0x3f) * 255 / 63);
                uint8_t b = (uint8_t)((raw & 0x1f) * 255 / 31);
                dest[x] = lv_color_make(r, g, b);
            }
            convert_us += esp_timer_get_time() - stage_us;
        }
#if LV_COLOR_DEPTH == 16
    }
#endif

    stage_us = esp_timer_get_time();
    lvgl_port_lock(0);
    lv_obj_t *canvas = vb_lua_lvgl_resolve_object(id);
    memcpy(s_canvas_buffer, scratch, sizeof(s_canvas_buffer));
    lv_obj_invalidate(canvas);
    lvgl_port_unlock();
    lvgl_us = esp_timer_get_time() - stage_us;
    heap_caps_free(scratch);
    fclose(file);

    lua_pushstring(L, resolved);
    lua_newtable(L);
    lua_pushinteger(L, (lua_Integer)((esp_timer_get_time() - started_us) / 1000));
    lua_setfield(L, -2, "total_ms");
    lua_pushinteger(L, (lua_Integer)(open_us / 1000));
    lua_setfield(L, -2, "open_ms");
    lua_pushinteger(L, (lua_Integer)(header_us / 1000));
    lua_setfield(L, -2, "header_ms");
    lua_pushinteger(L, (lua_Integer)(alloc_us / 1000));
    lua_setfield(L, -2, "alloc_ms");
    lua_pushinteger(L, (lua_Integer)(seek_us / 1000));
    lua_setfield(L, -2, "seek_ms");
    lua_pushinteger(L, (lua_Integer)(read_us / 1000));
    lua_setfield(L, -2, "read_ms");
    lua_pushinteger(L, (lua_Integer)read_chunk_bytes);
    lua_setfield(L, -2, "read_chunk_bytes");
    lua_pushinteger(L, (lua_Integer)largest_dma_before);
    lua_setfield(L, -2, "largest_dma_before");
    lua_pushinteger(L, (lua_Integer)largest_dma_after);
    lua_setfield(L, -2, "largest_dma_after");
    lua_pushinteger(L, (lua_Integer)(convert_us / 1000));
    lua_setfield(L, -2, "convert_ms");
    lua_pushinteger(L, (lua_Integer)(lvgl_us / 1000));
    lua_setfield(L, -2, "lvgl_ms");
    lua_pushboolean(L, use_rgb565_fast_path);
    lua_setfield(L, -2, "fast_path");
    return 2;
}

static int l_lv_canvas_load_vbimg(lua_State *L)
{
    int id = vb_lua_lvgl_check_object_id(L, 1);
    const char *src = luaL_checkstring(L, 2);
    char resolved[VB_LVGL_PATH_MAX];
    char path[VB_LVGL_PATH_MAX];
    int64_t started_us = esp_timer_get_time();
    int64_t lvgl_us = 0;

    if (!vb_lua_lvgl_resolve_asset_path(src, resolved, sizeof(resolved)) ||
        !resolved_lv_path_to_sd_path(resolved, path, sizeof(path))) {
        ESP_LOGE(TAG, "resolve vbimg source failed path=%s detail=invalid VBIMG source path", src);
        return luaL_error(L, "invalid VBIMG source path");
    }

    bool cache_hit = vbimg_cache_matches(resolved);
    char error[64] = {0};
    if (!cache_hit && !vbimg_cache_load(resolved, path, error, sizeof(error))) {
        return luaL_error(L, error[0] ? error : "VBIMG cache load failed");
    }

    int64_t stage_us = esp_timer_get_time();
    lvgl_port_lock(0);
    lv_obj_t *canvas = vb_lua_lvgl_resolve_object(id);
    memcpy(s_canvas_buffer, s_vbimg_cache.pixels, sizeof(s_canvas_buffer));
    lv_obj_invalidate(canvas);
    lvgl_port_unlock();
    lvgl_us = esp_timer_get_time() - stage_us;

    lua_pushstring(L, resolved);
    push_vbimg_cache_stats(L, started_us, cache_hit, lvgl_us);
    return 2;
}

static int l_lv_canvas_prefetch_vbimg(lua_State *L)
{
    const char *src = luaL_checkstring(L, 1);
    char resolved[VB_LVGL_PATH_MAX];
    char path[VB_LVGL_PATH_MAX];
    int64_t started_us = esp_timer_get_time();

    if (!vb_lua_lvgl_resolve_asset_path(src, resolved, sizeof(resolved)) ||
        !resolved_lv_path_to_sd_path(resolved, path, sizeof(path))) {
        ESP_LOGE(TAG, "resolve vbimg source failed path=%s detail=invalid VBIMG source path", src);
        return luaL_error(L, "invalid VBIMG source path");
    }

    bool cache_hit = vbimg_cache_matches(resolved);
    char error[64] = {0};
    if (!cache_hit && !vbimg_cache_load(resolved, path, error, sizeof(error))) {
        return luaL_error(L, error[0] ? error : "VBIMG cache load failed");
    }

    lua_pushstring(L, resolved);
    push_vbimg_cache_stats(L, started_us, cache_hit, 0);
    return 2;
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
    vbimg_cache_release();

    const vb_lua_lvgl_canvas_function_t functions[] = {
        { "lv_canvas_create", l_lv_canvas_create },
        { "lv_canvas_fill_bg", l_lv_canvas_fill_bg },
        { "lv_canvas_draw_rect", l_lv_canvas_draw_rect },
        { "lv_canvas_draw_text", l_lv_canvas_draw_text },
        { "lv_canvas_load_bmp", l_lv_canvas_load_bmp },
        { "lv_canvas_prefetch_vbimg", l_lv_canvas_prefetch_vbimg },
        { "lv_canvas_load_vbimg", l_lv_canvas_load_vbimg },
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
