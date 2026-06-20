#include "native_module_static_adapter.h"

#include <stdio.h>
#include <string.h>

#include "module_host_api.h"
#include "nes_native_adapter.h"

typedef esp_err_t (*vb_native_module_init_fn)(vb_module_host_api_t *host_api, void **module);

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

    vb_module_host_api_t host_api;
    vb_module_host_api_init(&host_api);

    vb_native_module_init_fn vb_native_module_init = vb_nes_native_module_init;
    if (vb_native_module_init == NULL) {
        snprintf(result->error, sizeof(result->error), "Native module symbol missing: vb_native_module_init");
        result->status = ESP_ERR_NOT_FOUND;
        return result->status;
    }

    void *module = NULL;
    esp_err_t init_err = vb_native_module_init(&host_api, &module);
    if (init_err == ESP_ERR_NOT_SUPPORTED) {
        snprintf(result->error, sizeof(result->error), "Native module host API unsupported: vb_native_module_init");
        result->status = init_err;
        return result->status;
    }
    if (init_err != ESP_OK || module == NULL) {
        snprintf(result->error, sizeof(result->error), "Native module load failed: native executor pending");
        result->status = init_err == ESP_OK ? ESP_ERR_NOT_FOUND : init_err;
        return result->status;
    }

    result->error[0] = '\0';
    result->module = module;
    result->status = ESP_OK;
    return result->status;
}
