if(NOT DEFINED VB_LVGL_BMP_SOURCE)
    get_filename_component(VB_RUNTIME_PROJECT_DIR "${CMAKE_CURRENT_LIST_DIR}/.." ABSOLUTE)
    set(VB_LVGL_BMP_SOURCE "${VB_RUNTIME_PROJECT_DIR}/managed_components/lvgl__lvgl/src/extra/libs/bmp/lv_bmp.c")
endif()

if(NOT EXISTS "${VB_LVGL_BMP_SOURCE}")
    message(FATAL_ERROR "LVGL managed component is missing; rerun idf.py so the component manager can fetch it before applying the Runtime BMP patch")
endif()

file(READ "${VB_LVGL_BMP_SOURCE}" VB_LVGL_BMP_TEXT)

if(VB_LVGL_BMP_TEXT MATCHES "LV_COLOR_DEPTH == 16 && \\(b\\.bpp != 16 && b\\.bpp != 24\\)"
   AND VB_LVGL_BMP_TEXT MATCHES "if\\(b->bpp == 24\\)")
    message(STATUS "VibeBoard LVGL BMP Runtime patch already applied")
else()
    set(VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_TEXT}")

    string(REPLACE
        [=[        else if(LV_COLOR_DEPTH == 16 && b.bpp != 16) {
            LV_LOG_WARN("LV_COLOR_DEPTH == 16 but bpp is %d (should be 16)", b.bpp);
            color_depth_error = true;
        }]=]
        [=[        else if(LV_COLOR_DEPTH == 16 && (b.bpp != 16 && b.bpp != 24)) {
            LV_LOG_WARN("LV_COLOR_DEPTH == 16 but bpp is %d (should be 16 or 24)", b.bpp);
            color_depth_error = true;
        }]=]
        VB_LVGL_BMP_PATCHED "${VB_LVGL_BMP_PATCHED}"
    )

    string(REPLACE
        [=[    p += x * (b->bpp / 8);
    lv_fs_seek(&b->f, p, LV_FS_SEEK_SET);
    lv_fs_read(&b->f, buf, len * (b->bpp / 8), NULL);]=]
        [=[    p += x * (b->bpp / 8);
    lv_fs_seek(&b->f, p, LV_FS_SEEK_SET);

#if LV_COLOR_DEPTH == 16
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

    if(NOT VB_LVGL_BMP_PATCHED MATCHES "LV_COLOR_DEPTH == 16 && \\(b\\.bpp != 16 && b\\.bpp != 24\\)"
       OR NOT VB_LVGL_BMP_PATCHED MATCHES "if\\(b->bpp == 24\\)"
       OR NOT VB_LVGL_BMP_PATCHED MATCHES "lv_color_make\\(bgr\\[2\\], bgr\\[1\\], bgr\\[0\\]\\)")
        message(FATAL_ERROR "VibeBoard LVGL BMP Runtime patch failed to install 24bpp-to-16bpp decoding")
    endif()

    file(WRITE "${VB_LVGL_BMP_SOURCE}" "${VB_LVGL_BMP_PATCHED}")
    message(STATUS "Applied VibeBoard LVGL BMP Runtime patch")
endif()
