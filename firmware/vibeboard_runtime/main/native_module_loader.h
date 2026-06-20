#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VB_NATIVE_MODULE_ERROR_MAX 160
#define VB_NATIVE_MODULE_MANIFEST_MAGIC "VBNM"
#define VB_NATIVE_MODULE_FIELD_MAX 64

typedef enum {
    VB_NATIVE_MODULE_KIND_UNKNOWN = 0,
    VB_NATIVE_MODULE_KIND_NES = 1,
} vb_native_module_kind_t;

typedef struct {
    char magic[VB_NATIVE_MODULE_FIELD_MAX];
    char abi[VB_NATIVE_MODULE_FIELD_MAX];
    char symbol[VB_NATIVE_MODULE_FIELD_MAX];
    char min_host[VB_NATIVE_MODULE_FIELD_MAX];
} vb_native_module_manifest_t;

typedef struct {
    esp_err_t status;
    vb_native_module_kind_t kind;
    char error[VB_NATIVE_MODULE_ERROR_MAX];
} vb_native_module_result_t;

esp_err_t vb_native_module_load(const char *module_name,
                                const char *module_path,
                                vb_native_module_result_t *result);

#ifdef __cplusplus
}
#endif
