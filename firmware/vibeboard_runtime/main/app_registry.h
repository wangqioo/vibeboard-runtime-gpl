#pragma once

#include <stdbool.h>
#include <stddef.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VB_APPS_PATH "/sdcard/apps"
#define VB_APP_NAME_MAX 64
#define VB_APP_PATH_MAX 192
#define VB_APP_MANIFEST_SCHEMA_MAX 48
#define VB_APP_VERSION_MAX 32
#define VB_APP_KIND_MAX 16
#define VB_APP_CAPABILITIES_MAX 128
#define VB_APP_REGISTRY_MAX_APPS 48

typedef struct {
    char id[VB_APP_NAME_MAX];
    char name[VB_APP_NAME_MAX];
    char entry[VB_APP_NAME_MAX];
    char dir[VB_APP_PATH_MAX];
    char path[VB_APP_PATH_MAX];
    char manifest_schema[VB_APP_MANIFEST_SCHEMA_MAX];
    char version[VB_APP_VERSION_MAX];
    char kind[VB_APP_KIND_MAX];
    char capabilities[VB_APP_CAPABILITIES_MAX];
    bool compatible;
} vb_app_registry_entry_t;

typedef struct {
    int app_count;
    int stored_app_count;
    vb_app_registry_entry_t apps[VB_APP_REGISTRY_MAX_APPS];
    char first_app_name[VB_APP_NAME_MAX];
    char first_app_entry[VB_APP_NAME_MAX];
    char first_app_dir[VB_APP_PATH_MAX];
    char first_app_path[VB_APP_PATH_MAX];
} vb_app_registry_result_t;

esp_err_t vb_app_registry_init(void);
void vb_app_registry_lock(void);
void vb_app_registry_unlock(void);
esp_err_t vb_app_registry_scan(vb_app_registry_result_t *result);

#ifdef __cplusplus
}
#endif
