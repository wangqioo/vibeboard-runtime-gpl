if(NOT DEFINED VB_ESP32_CAMERA_CAM_HAL)
    get_filename_component(VB_RUNTIME_PROJECT_DIR "${CMAKE_CURRENT_LIST_DIR}/.." ABSOLUTE)
    set(VB_ESP32_CAMERA_CAM_HAL "${VB_RUNTIME_PROJECT_DIR}/managed_components/espressif__esp32-camera/driver/cam_hal.c")
endif()

if(NOT EXISTS "${VB_ESP32_CAMERA_CAM_HAL}")
    message(FATAL_ERROR "esp32-camera managed component is missing; rerun idf.py so the component manager can fetch it before applying the Runtime camera patch")
endif()

file(READ "${VB_ESP32_CAMERA_CAM_HAL}" VB_CAM_HAL_SOURCE)

if(VB_CAM_HAL_SOURCE MATCHES "xTaskCreatePinnedToCoreWithCaps\\(cam_task")
    message(STATUS "VibeBoard esp32-camera Runtime patch already applied")
else()
    set(VB_CAM_HAL_PATCHED "${VB_CAM_HAL_SOURCE}")

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

    if(VB_CAM_HAL_PATCHED STREQUAL VB_CAM_HAL_SOURCE)
        message(FATAL_ERROR "VibeBoard esp32-camera Runtime patch did not change cam_hal.c; upstream source layout may have changed")
    endif()

    if(NOT VB_CAM_HAL_PATCHED MATCHES "xTaskCreatePinnedToCoreWithCaps\\(cam_task")
        message(FATAL_ERROR "VibeBoard esp32-camera Runtime patch failed to install PSRAM task creation")
    endif()

    file(WRITE "${VB_ESP32_CAMERA_CAM_HAL}" "${VB_CAM_HAL_PATCHED}")
    message(STATUS "Applied VibeBoard esp32-camera Runtime patch")
endif()
