#include "native_module_static_adapter.h"

#include <stdio.h>
#include <string.h>

typedef esp_err_t (*vb_native_module_init_fn)(void *host_api, void **module);

static esp_err_t nes_native_module_init(void *host_api, void **module)
{
    (void)host_api;
    (void)module;
    return ESP_ERR_NOT_SUPPORTED;
}

esp_err_t vb_native_module_static_adapter_load(const char *module_name,
                                               const vb_native_module_manifest_t *manifest,
                                               vb_native_module_result_t *result)
{
    if (module_name == NULL || manifest == NULL || result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (strcmp(module_name, "nes") != 0) {
        snprintf(result->error, sizeof(result->error), "Native module host API unsupported: static adapter module");
        result->status = ESP_ERR_NOT_SUPPORTED;
        return result->status;
    }

    vb_native_module_init_fn vb_native_module_init = nes_native_module_init;
    if (vb_native_module_init == NULL) {
        snprintf(result->error, sizeof(result->error), "Native module symbol missing: vb_native_module_init");
        result->status = ESP_ERR_NOT_FOUND;
        return result->status;
    }

    snprintf(result->error, sizeof(result->error), "Native module load failed: native executor pending");
    result->status = ESP_ERR_NOT_FOUND;
    return result->status;
}
