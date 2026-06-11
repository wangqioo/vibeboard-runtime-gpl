#pragma once

#include <stddef.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VB_APPS_PATH "/sdcard/apps"
#define VB_APP_NAME_MAX 64
#define VB_APP_PATH_MAX 192

typedef struct {
    int app_count;
    char first_app_name[VB_APP_NAME_MAX];
    char first_app_entry[VB_APP_NAME_MAX];
    char first_app_path[VB_APP_PATH_MAX];
} vb_app_registry_result_t;

esp_err_t vb_app_registry_scan(vb_app_registry_result_t *result);

#ifdef __cplusplus
}
#endif
