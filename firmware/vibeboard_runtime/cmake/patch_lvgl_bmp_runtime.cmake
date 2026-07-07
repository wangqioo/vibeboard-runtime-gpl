if(NOT DEFINED VB_LVGL_BMP_SOURCE)
    get_filename_component(VB_RUNTIME_PROJECT_DIR "${CMAKE_CURRENT_LIST_DIR}/.." ABSOLUTE)
    set(VB_LVGL_BMP_SOURCE "${VB_RUNTIME_PROJECT_DIR}/managed_components/lvgl__lvgl/src/extra/libs/bmp/lv_bmp.c")
endif()

if(NOT EXISTS "${VB_LVGL_BMP_SOURCE}")
    message(FATAL_ERROR "LVGL managed component is missing; rerun idf.py so the component manager can fetch it before applying the Runtime BMP patch")
endif()

file(READ "${VB_LVGL_BMP_SOURCE}" VB_LVGL_BMP_TEXT)

if(VB_LVGL_BMP_TEXT MATCHES "LV_COLOR_DEPTH == 16 && \\(b\\.bpp != 16 && b\\.bpp != 24 && b\\.bpp != 32\\)"
   AND VB_LVGL_BMP_TEXT MATCHES "if\\(b->bpp == 32\\)"
   AND VB_LVGL_BMP_TEXT MATCHES "LV_IMG_CF_TRUE_COLOR_ALPHA"
   AND VB_LVGL_BMP_TEXT MATCHES "int32_t source_y")
    message(STATUS "VibeBoard LVGL BMP Runtime patch already applied")
else()
    set(VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_TEXT}")

    string(REPLACE
        [=[#include <string.h>]=]
        [=[#include <stdbool.h>
#include <stdint.h>
#include <string.h>]=]
        VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_PATCHED}"
    )

    string(REPLACE
        [=[    int px_height;
    unsigned int bpp;]=]
        [=[    int px_height;
    bool top_down;
    unsigned int bpp;]=]
        VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_PATCHED}"
    )

    string(REPLACE
        [=[            uint32_t h;
            memcpy(&w, headers + 18, 4);
            memcpy(&h, headers + 22, 4);
            header->w = w;
            header->h = h;
            header->always_zero = 0;
            lv_fs_close(&f);
#if LV_COLOR_DEPTH == 32
            uint16_t bpp;
            memcpy(&bpp, headers + 28, 2);
            header->cf = bpp == 32 ? LV_IMG_CF_TRUE_COLOR_ALPHA : LV_IMG_CF_TRUE_COLOR;
#else
            header->cf = LV_IMG_CF_TRUE_COLOR;
#endif]=]
        [=[            int32_t signed_h;
            uint32_t h;
            uint16_t bpp;
            memcpy(&w, headers + 18, 4);
            memcpy(&signed_h, headers + 22, 4);
            h = signed_h < 0 ? (uint32_t)(-signed_h) : (uint32_t)signed_h;
            header->w = w;
            header->h = h;
            header->always_zero = 0;
            lv_fs_close(&f);
            memcpy(&bpp, headers + 28, 2);
#if LV_COLOR_DEPTH == 16 || LV_COLOR_DEPTH == 32
            header->cf = bpp == 32 ? LV_IMG_CF_TRUE_COLOR_ALPHA : LV_IMG_CF_TRUE_COLOR;
#else
            header->cf = LV_IMG_CF_TRUE_COLOR;
#endif]=]
        VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_PATCHED}"
    )

    string(REPLACE
        [=[        memcpy(&b.px_height, header + 22, 4);
        memcpy(&b.bpp, header + 28, 2);]=]
        [=[        int32_t signed_height;
        memcpy(&signed_height, header + 22, 4);
        b.top_down = signed_height < 0;
        b.px_height = signed_height < 0 ? -signed_height : signed_height;
        memcpy(&b.bpp, header + 28, 2);]=]
        VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_PATCHED}"
    )

    string(REPLACE
        [=[        else if(LV_COLOR_DEPTH == 16 && b.bpp != 16) {
            LV_LOG_WARN("LV_COLOR_DEPTH == 16 but bpp is %d (should be 16)", b.bpp);
            color_depth_error = true;
        }]=]
        [=[        else if(LV_COLOR_DEPTH == 16 && (b.bpp != 16 && b.bpp != 24 && b.bpp != 32)) {
            LV_LOG_WARN("LV_COLOR_DEPTH == 16 but bpp is %d (should be 16, 24, or 32)", b.bpp);
            color_depth_error = true;
        }]=]
        VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_PATCHED}"
    )

    string(REPLACE
        [=[        else if(LV_COLOR_DEPTH == 16 && (b.bpp != 16 && b.bpp != 24)) {
            LV_LOG_WARN("LV_COLOR_DEPTH == 16 but bpp is %d (should be 16 or 24)", b.bpp);
            color_depth_error = true;
        }]=]
        [=[        else if(LV_COLOR_DEPTH == 16 && (b.bpp != 16 && b.bpp != 24 && b.bpp != 32)) {
            LV_LOG_WARN("LV_COLOR_DEPTH == 16 but bpp is %d (should be 16, 24, or 32)", b.bpp);
            color_depth_error = true;
        }]=]
        VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_PATCHED}"
    )

    string(REPLACE
        [=[    y = (b->px_height - 1) - y; /*BMP images are stored upside down*/
    uint32_t p = b->px_offset + b->row_size_bytes * y;]=]
        [=[    int32_t source_y = b->top_down ? y : (b->px_height - 1) - y;
    uint32_t p = b->px_offset + b->row_size_bytes * source_y;]=]
        VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_PATCHED}"
    )

    string(REPLACE
        [=[#if LV_COLOR_DEPTH == 16
    if(b->bpp == 24) {
        lv_color_t * colors = (lv_color_t *)buf;
        lv_coord_t i;

        for(i = 0; i < len; i++) {
            uint8_t bgr[3];
            uint32_t bytes_read = 0;
            lv_fs_read(&b->f, bgr, sizeof(bgr), &bytes_read);
            if(bytes_read != sizeof(bgr)) return LV_RES_INV;
            colors[i] = lv_color_make(bgr[2], bgr[1], bgr[0]);
        }

        return LV_RES_OK;
    }
#endif]=]
        [=[#if LV_COLOR_DEPTH == 16
    if(b->bpp == 32) {
        lv_coord_t i;

        for(i = 0; i < len; i++) {
            uint8_t bgra[4];
            uint32_t bytes_read = 0;
            lv_fs_read(&b->f, bgra, sizeof(bgra), &bytes_read);
            if(bytes_read != sizeof(bgra)) return LV_RES_INV;
            lv_color_t color = lv_color_make(bgra[2], bgra[1], bgra[0]);
            uint8_t * out = &buf[i * LV_IMG_PX_SIZE_ALPHA_BYTE];
            memcpy(out, &color, sizeof(color));
            out[LV_IMG_PX_SIZE_ALPHA_BYTE - 1] = bgra[3];
        }

        return LV_RES_OK;
    }

    if(b->bpp == 24) {
        lv_color_t * colors = (lv_color_t *)buf;
        lv_coord_t i;

        for(i = 0; i < len; i++) {
            uint8_t bgr[3];
            uint32_t bytes_read = 0;
            lv_fs_read(&b->f, bgr, sizeof(bgr), &bytes_read);
            if(bytes_read != sizeof(bgr)) return LV_RES_INV;
            colors[i] = lv_color_make(bgr[2], bgr[1], bgr[0]);
        }

        return LV_RES_OK;
    }
#endif]=]
        VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_PATCHED}"
    )

    string(REPLACE
        [=[    p += x * (b->bpp / 8);
    lv_fs_seek(&b->f, p, LV_FS_SEEK_SET);
    lv_fs_read(&b->f, buf, len * (b->bpp / 8), NULL);]=]
        [=[    p += x * (b->bpp / 8);
    lv_fs_seek(&b->f, p, LV_FS_SEEK_SET);

#if LV_COLOR_DEPTH == 16
    if(b->bpp == 32) {
        lv_coord_t i;

        for(i = 0; i < len; i++) {
            uint8_t bgra[4];
            uint32_t bytes_read = 0;
            lv_fs_read(&b->f, bgra, sizeof(bgra), &bytes_read);
            if(bytes_read != sizeof(bgra)) return LV_RES_INV;
            lv_color_t color = lv_color_make(bgra[2], bgra[1], bgra[0]);
            uint8_t * out = &buf[i * LV_IMG_PX_SIZE_ALPHA_BYTE];
            memcpy(out, &color, sizeof(color));
            out[LV_IMG_PX_SIZE_ALPHA_BYTE - 1] = bgra[3];
        }

        return LV_RES_OK;
    }

    if(b->bpp == 24) {
        lv_color_t * colors = (lv_color_t *)buf;
        lv_coord_t i;

        for(i = 0; i < len; i++) {
            uint8_t bgr[3];
            uint32_t bytes_read = 0;
            lv_fs_read(&b->f, bgr, sizeof(bgr), &bytes_read);
            if(bytes_read != sizeof(bgr)) return LV_RES_INV;
            colors[i] = lv_color_make(bgr[2], bgr[1], bgr[0]);
        }

        return LV_RES_OK;
    }
#endif

    lv_fs_read(&b->f, buf, len * (b->bpp / 8), NULL);]=]
        VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_PATCHED}"
    )

    if(VB_LVGL_BMP_PATCHED STREQUAL VB_LVGL_BMP_TEXT)
        message(FATAL_ERROR "VibeBoard LVGL BMP Runtime patch did not change lv_bmp.c; upstream source layout may have changed")
    endif()

    if(NOT VB_LVGL_BMP_PATCHED MATCHES "LV_COLOR_DEPTH == 16 && \\(b\\.bpp != 16 && b\\.bpp != 24 && b\\.bpp != 32\\)"
       OR NOT VB_LVGL_BMP_PATCHED MATCHES "if\\(b->bpp == 32\\)"
       OR NOT VB_LVGL_BMP_PATCHED MATCHES "if\\(b->bpp == 24\\)"
       OR NOT VB_LVGL_BMP_PATCHED MATCHES "LV_IMG_CF_TRUE_COLOR_ALPHA"
       OR NOT VB_LVGL_BMP_PATCHED MATCHES "int32_t source_y"
       OR NOT VB_LVGL_BMP_PATCHED MATCHES "lv_color_make\\(bgra\\[2\\], bgra\\[1\\], bgra\\[0\\]\\)"
       OR NOT VB_LVGL_BMP_PATCHED MATCHES "lv_color_make\\(bgr\\[2\\], bgr\\[1\\], bgr\\[0\\]\\)")
        message(FATAL_ERROR "VibeBoard LVGL BMP Runtime patch failed to install 24/32bpp Runtime decoding")
    endif()

    file(WRITE "${VB_LVGL_BMP_SOURCE}" "${VB_LVGL_BMP_PATCHED}")
    message(STATUS "Applied VibeBoard LVGL BMP Runtime patch")
endif()
