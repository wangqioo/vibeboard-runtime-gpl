if(NOT DEFINED VB_ESP32_CAMERA_CAM_HAL)
    get_filename_component(VB_RUNTIME_PROJECT_DIR "${CMAKE_CURRENT_LIST_DIR}/.." ABSOLUTE)
    set(VB_ESP32_CAMERA_CAM_HAL "${VB_RUNTIME_PROJECT_DIR}/managed_components/espressif__esp32-camera/driver/cam_hal.c")
endif()

if(NOT EXISTS "${VB_ESP32_CAMERA_CAM_HAL}")
    message(FATAL_ERROR "esp32-camera managed component is missing; rerun idf.py so the component manager can fetch it before applying the Runtime camera patch")
endif()

file(READ "${VB_ESP32_CAMERA_CAM_HAL}" VB_CAM_HAL_SOURCE)

set(VB_ESP32_CAMERA_LL_CAM "${VB_RUNTIME_PROJECT_DIR}/managed_components/espressif__esp32-camera/target/esp32s3/ll_cam.c")
if(NOT EXISTS "${VB_ESP32_CAMERA_LL_CAM}")
    message(FATAL_ERROR "esp32-camera ESP32-S3 ll_cam.c is missing; rerun idf.py so the component manager can fetch it before applying the Runtime camera patch")
endif()

file(READ "${VB_ESP32_CAMERA_LL_CAM}" VB_LL_CAM_SOURCE)

set(VB_CAMERA_PATCH_HAS_TASK FALSE)
set(VB_CAMERA_PATCH_HAS_LOW_DMA FALSE)
if(VB_CAM_HAL_SOURCE MATCHES "xTaskCreatePinnedToCoreWithCaps\\(cam_task")
    set(VB_CAMERA_PATCH_HAS_TASK TRUE)
endif()
if(VB_LL_CAM_SOURCE MATCHES "runtime_node_max = 640 / cam->dma_bytes_per_item")
    set(VB_CAMERA_PATCH_HAS_LOW_DMA TRUE)
endif()

if(VB_CAMERA_PATCH_HAS_TASK AND VB_CAMERA_PATCH_HAS_LOW_DMA)
    message(STATUS "VibeBoard esp32-camera Runtime patch already applied")
else()
    set(VB_CAM_HAL_PATCHED "${VB_CAM_HAL_SOURCE}")
    set(VB_LL_CAM_PATCHED "${VB_LL_CAM_SOURCE}")

    if(NOT VB_CAMERA_PATCH_HAS_TASK)
        string(REPLACE
            "#include \"freertos/FreeRTOS.h\"\n#include \"freertos/task.h\""
            "#include \"freertos/FreeRTOS.h\"\n#include \"freertos/idf_additions.h\"\n#include \"freertos/task.h\""
            VB_CAM_HAL_PATCHED "${VB_CAM_HAL_PATCHED}"
        )

        string(REPLACE
            "    size_t queue_size = cam_obj->dma_half_buffer_cnt - 1;\n    if (queue_size == 0) {\n        queue_size = 1;\n    }"
            "    size_t queue_size = cam_obj->dma_half_buffer_cnt - 1;\n    if (queue_size < 4) {\n        queue_size = 4;\n    }"
            VB_CAM_HAL_PATCHED "${VB_CAM_HAL_PATCHED}"
        )

        string(REPLACE
            [=[#if CONFIG_CAMERA_CORE0
    xTaskCreatePinnedToCore(cam_task, "cam_task", CAM_TASK_STACK, NULL, configMAX_PRIORITIES - 2, &cam_obj->task_handle, 0);
#elif CONFIG_CAMERA_CORE1
    xTaskCreatePinnedToCore(cam_task, "cam_task", CAM_TASK_STACK, NULL, configMAX_PRIORITIES - 2, &cam_obj->task_handle, 1);
#else
    xTaskCreate(cam_task, "cam_task", CAM_TASK_STACK, NULL, configMAX_PRIORITIES - 2, &cam_obj->task_handle);
#endif

    ESP_LOGI(TAG, "cam config ok");]=]
            [=[#if CONFIG_CAMERA_CORE0
    BaseType_t task_created = xTaskCreatePinnedToCoreWithCaps(cam_task, "cam_task", CAM_TASK_STACK, NULL, configMAX_PRIORITIES - 2,
                                                              &cam_obj->task_handle, 0, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    ESP_LOGI(TAG, "cam_task create core=0 stack=psram result=%ld handle=%p", (long)task_created, cam_obj->task_handle);
#elif CONFIG_CAMERA_CORE1
    BaseType_t task_created = xTaskCreatePinnedToCoreWithCaps(cam_task, "cam_task", CAM_TASK_STACK, NULL, configMAX_PRIORITIES - 2,
                                                              &cam_obj->task_handle, 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    ESP_LOGI(TAG, "cam_task create core=1 stack=psram result=%ld handle=%p", (long)task_created, cam_obj->task_handle);
#else
    BaseType_t task_created = xTaskCreatePinnedToCoreWithCaps(cam_task, "cam_task", CAM_TASK_STACK, NULL, configMAX_PRIORITIES - 2,
                                                              &cam_obj->task_handle, tskNO_AFFINITY, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    ESP_LOGI(TAG, "cam_task create core=any stack=psram result=%ld handle=%p", (long)task_created, cam_obj->task_handle);
#endif
    CAM_CHECK_GOTO(task_created == pdPASS, "cam_task create failed", err);

    ESP_LOGI(TAG, "cam config ok");]=]
            VB_CAM_HAL_PATCHED "${VB_CAM_HAL_PATCHED}"
        )

        string(REPLACE
            "        vTaskDelete(cam_obj->task_handle);"
            "        vTaskDeleteWithCaps(cam_obj->task_handle);"
            VB_CAM_HAL_PATCHED "${VB_CAM_HAL_PATCHED}"
        )
    endif()

    if(NOT VB_CAMERA_PATCH_HAS_LOW_DMA AND VB_LL_CAM_PATCHED MATCHES "runtime_dma_half_buffer_limit")
        string(REPLACE
            "Runtime low-memory RGB path: keep the required contiguous internal DMA block under 4 KiB."
            "Runtime low-memory RGB path: keep the required contiguous internal DMA block under 1536 bytes."
            VB_LL_CAM_PATCHED "${VB_LL_CAM_PATCHED}"
        )
        string(REPLACE
            "Runtime low-memory RGB path: keep the required contiguous internal DMA block under 2 KiB."
            "Runtime low-memory RGB path: keep the required contiguous internal DMA block under 1536 bytes."
            VB_LL_CAM_PATCHED "${VB_LL_CAM_PATCHED}"
        )
        string(REPLACE
            "runtime_node_max = 1920 / cam->dma_bytes_per_item"
            "runtime_node_max = 640 / cam->dma_bytes_per_item"
            VB_LL_CAM_PATCHED "${VB_LL_CAM_PATCHED}"
        )
        string(REPLACE
            "runtime_node_max = 960 / cam->dma_bytes_per_item"
            "runtime_node_max = 640 / cam->dma_bytes_per_item"
            VB_LL_CAM_PATCHED "${VB_LL_CAM_PATCHED}"
        )
    endif()

    if(NOT VB_CAMERA_PATCH_HAS_LOW_DMA AND NOT VB_LL_CAM_PATCHED MATCHES "runtime_dma_half_buffer_limit")
        string(REPLACE
            "    size_t node_max = LCD_CAM_DMA_NODE_BUFFER_MAX_SIZE / cam->dma_bytes_per_item;\n    size_t line_width = cam->width * cam->in_bytes_per_pixel;"
            "    size_t node_max = LCD_CAM_DMA_NODE_BUFFER_MAX_SIZE / cam->dma_bytes_per_item;\n    size_t line_width = cam->width * cam->in_bytes_per_pixel;\n    size_t runtime_dma_half_buffer_limit = 0;\n    if (!cam->psram_mode && cam->width <= 160 && cam->height <= 120 && line_width <= 320) {\n        // Runtime low-memory RGB path: keep the required contiguous internal DMA block under 1536 bytes.\n        const size_t runtime_node_max = 640 / cam->dma_bytes_per_item;\n        runtime_dma_half_buffer_limit = runtime_node_max;\n        if (node_max > runtime_node_max) {\n            node_max = runtime_node_max;\n        }\n    }"
            VB_LL_CAM_PATCHED "${VB_LL_CAM_PATCHED}"
        )
        string(REPLACE
            "    size_t dma_half_buffer_max = CONFIG_CAMERA_DMA_BUFFER_SIZE_MAX / 2 / cam->dma_bytes_per_item;\n    if (line_width > dma_half_buffer_max) {"
            "    size_t dma_half_buffer_max = CONFIG_CAMERA_DMA_BUFFER_SIZE_MAX / 2 / cam->dma_bytes_per_item;\n    if (runtime_dma_half_buffer_limit > 0 && dma_half_buffer_max > runtime_dma_half_buffer_limit) {\n        dma_half_buffer_max = runtime_dma_half_buffer_limit;\n    }\n    if (line_width > dma_half_buffer_max) {"
            VB_LL_CAM_PATCHED "${VB_LL_CAM_PATCHED}"
        )
    endif()

    if(VB_CAM_HAL_PATCHED STREQUAL VB_CAM_HAL_SOURCE AND VB_LL_CAM_PATCHED STREQUAL VB_LL_CAM_SOURCE)
        message(FATAL_ERROR "VibeBoard esp32-camera Runtime patch did not change any camera files; upstream source layout may have changed")
    endif()

    if(NOT VB_CAM_HAL_PATCHED MATCHES "xTaskCreatePinnedToCoreWithCaps\\(cam_task")
        message(FATAL_ERROR "VibeBoard esp32-camera Runtime patch failed to install PSRAM task creation")
    endif()
    if(NOT VB_LL_CAM_PATCHED MATCHES "Runtime low-memory RGB path")
        message(FATAL_ERROR "VibeBoard esp32-camera Runtime patch failed to install low-memory RGB DMA sizing")
    endif()

    file(WRITE "${VB_ESP32_CAMERA_CAM_HAL}" "${VB_CAM_HAL_PATCHED}")
    file(WRITE "${VB_ESP32_CAMERA_LL_CAM}" "${VB_LL_CAM_PATCHED}")
    message(STATUS "Applied VibeBoard esp32-camera Runtime patch")
endif()
