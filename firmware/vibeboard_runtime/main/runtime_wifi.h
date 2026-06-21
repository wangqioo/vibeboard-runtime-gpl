#pragma once

#include <stdbool.h>

#include "esp_err.h"
#include "esp_netif.h"

typedef struct {
    bool found;
    char ssid[33];
    char password[65];
} vb_runtime_wifi_config_t;

esp_err_t vb_runtime_wifi_ensure_netif(void);
esp_err_t vb_runtime_wifi_ensure_wifi(void);
esp_err_t vb_runtime_wifi_start(void);
esp_err_t vb_runtime_wifi_configure_sta(const char *ssid, const char *password);
esp_err_t vb_runtime_wifi_connect_sta(void);
esp_err_t vb_runtime_wifi_start_sta(const char *ssid, const char *password, bool connect);
esp_err_t vb_runtime_wifi_load_config_from_sd(vb_runtime_wifi_config_t *config);
esp_err_t vb_runtime_wifi_prepare(void);
esp_err_t vb_runtime_wifi_start_config(const vb_runtime_wifi_config_t *config);
esp_err_t vb_runtime_wifi_start_from_sd(void);
esp_netif_t *vb_runtime_wifi_sta_netif(void);
