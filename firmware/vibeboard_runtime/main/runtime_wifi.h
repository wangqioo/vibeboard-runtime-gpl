#pragma once

#include <stdbool.h>

#include "esp_err.h"
#include "esp_netif.h"

esp_err_t vb_runtime_wifi_ensure_netif(void);
esp_err_t vb_runtime_wifi_ensure_wifi(void);
esp_err_t vb_runtime_wifi_start(void);
esp_err_t vb_runtime_wifi_configure_sta(const char *ssid, const char *password);
esp_err_t vb_runtime_wifi_connect_sta(void);
esp_err_t vb_runtime_wifi_start_sta(const char *ssid, const char *password, bool connect);
esp_err_t vb_runtime_wifi_start_from_sd(void);
esp_netif_t *vb_runtime_wifi_sta_netif(void);
