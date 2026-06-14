#pragma once

#include "app_registry.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

void vb_launcher_ui_show(vb_app_registry_result_t *apps, esp_err_t scan_err);

#ifdef __cplusplus
}
#endif
