#pragma once

#include "esp_err.h"
#include "native_module_loader.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t vb_native_module_static_adapter_load(const char *module_name,
                                               const vb_native_module_manifest_t *manifest,
                                               vb_native_module_result_t *result);

#ifdef __cplusplus
}
#endif
