#include <stdio.h>
#include <string.h>

#include "app_registry.h"
#include "board_lckfb_szpi_s3.h"
#include "esp_log.h"
#include "install_service.h"
#include "launcher_ui.h"
#include "runtime_wifi.h"

static const char *TAG = "vibeboard_runtime";
static vb_app_registry_result_t s_apps;
static vb_install_service_context_t s_install_context;

void app_main(void)
{
    ESP_LOGI(TAG, "VibeBoard Runtime start");

    vb_board_status_t board = {0};
    ESP_ERROR_CHECK(vb_board_start(&board));

    ESP_ERROR_CHECK(vb_app_registry_init());
    memset(&s_apps, 0, sizeof(s_apps));
    esp_err_t scan_err = board.sd_ok ? vb_app_registry_scan(&s_apps) : board.sd_error;
    if (scan_err != ESP_OK) {
        ESP_LOGW(TAG, "app scan unavailable: %s", esp_err_to_name(scan_err));
    }

    if (board.sd_ok) {
        esp_err_t wifi_err = vb_runtime_wifi_start_from_sd();
        if (wifi_err != ESP_OK) {
            ESP_LOGW(TAG, "runtime WiFi unavailable: %s", esp_err_to_name(wifi_err));
        }

        s_install_context.sd_ok = board.sd_ok;
        s_install_context.sd_error = board.sd_error;
        s_install_context.registry = &s_apps;
        esp_err_t install_err = vb_install_service_start(&s_install_context);
        if (install_err != ESP_OK) {
            ESP_LOGW(TAG, "install service unavailable: %s", esp_err_to_name(install_err));
        }
    }

    vb_launcher_ui_show(&s_apps, scan_err);
    ESP_LOGI(TAG,
             "VibeBoard Runtime ready: sd=%s apps=%d launcher=ok",
             board.sd_ok ? "ok" : "missing",
             s_apps.app_count);
}
