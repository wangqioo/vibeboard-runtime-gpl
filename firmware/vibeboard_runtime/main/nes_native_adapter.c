#include "nes_native_adapter.h"

typedef struct {
    vb_module_host_api_t host_api;
    uint16_t display_width;
    uint16_t display_height;
} vb_nes_native_module_t;

static vb_nes_native_module_t s_nes_module;

esp_err_t vb_nes_native_module_init(vb_module_host_api_t *host_api, void **module)
{
    if (host_api == NULL || module == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (host_api->version == 0 || host_api->display.width == NULL || host_api->display.height == NULL ||
        host_api->heap.malloc == NULL) {
        return ESP_ERR_NOT_SUPPORTED;
    }

    s_nes_module.host_api = *host_api;
    s_nes_module.display_width = host_api->display.width();
    s_nes_module.display_height = host_api->display.height();
    *module = &s_nes_module;
    return ESP_OK;
}
