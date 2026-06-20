#pragma once

#include "esp_err.h"
#include "module_host_api.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t vb_nes_native_module_init(vb_module_host_api_t *host_api, void **module);

#ifdef __cplusplus
}
#endif
