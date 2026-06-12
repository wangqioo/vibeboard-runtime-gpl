#pragma once

#include <stdbool.h>

#include "app_registry.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    bool sd_ok;
    esp_err_t sd_error;
    vb_app_registry_result_t *registry;
} vb_install_service_context_t;

esp_err_t vb_install_service_start(vb_install_service_context_t *context);

#ifdef __cplusplus
}
#endif
