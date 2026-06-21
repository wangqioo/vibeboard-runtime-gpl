#include "runtime_wifi.h"

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_event.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_wifi_types.h"
#include "nvs_flash.h"

static const char *TAG = "runtime_wifi";
static const char *VB_RUNTIME_WIFI_CONFIG_PATH = "/sdcard/runtime/wifi.json";
static const char *VB_LEGACY_SMOKE_WIFI_CONFIG_PATH = "/sdcard/apps/smoke_network/wifi.json";

static bool s_nvs_ready;
static bool s_netif_ready;
static bool s_wifi_ready;
static bool s_wifi_started;
static bool s_event_handlers_ready;
static bool s_sta_should_connect;
static int s_sta_retry_count;
static esp_netif_t *s_sta_netif;

enum {
    VB_RUNTIME_WIFI_MAX_RETRY = 8,
    VB_RUNTIME_WIFI_CONFIG_MAX = 512,
};

static esp_err_t normalize_wifi_result(esp_err_t err)
{
    if (err == ESP_ERR_WIFI_CONN || err == ESP_ERR_WIFI_STATE) {
        return ESP_OK;
    }
    return err;
}

static void log_internal_heap(const char *stage)
{
    ESP_LOGI(TAG,
             "%s internal_free=%u internal_largest=%u",
             stage,
             (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT),
             (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
}

static esp_err_t ensure_nvs(void)
{
#if !CONFIG_ESP_WIFI_NVS_ENABLED && !CONFIG_ESP_PHY_CALIBRATION_AND_DATA_STORAGE
    s_nvs_ready = true;
    return ESP_OK;
#else
    if (s_nvs_ready) {
        return ESP_OK;
    }

    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "resetting NVS after init error: %s", esp_err_to_name(err));
        err = nvs_flash_erase();
        if (err != ESP_OK) {
            return err;
        }
        err = nvs_flash_init();
    }
    if (err == ESP_OK) {
        s_nvs_ready = true;
    }
    return err;
#endif
}

static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    (void)arg;
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        if (s_sta_should_connect) {
            ESP_LOGI(TAG, "runtime sta start connect");
            esp_wifi_connect();
        }
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_event_sta_disconnected_t *event = (wifi_event_sta_disconnected_t *)event_data;
        ESP_LOGW(TAG, "runtime sta disconnected reason=%d", event ? event->reason : -1);
        if (s_sta_should_connect && s_sta_retry_count < VB_RUNTIME_WIFI_MAX_RETRY) {
            s_sta_retry_count++;
            ESP_LOGI(TAG, "runtime sta reconnect attempt %d/%d", s_sta_retry_count, VB_RUNTIME_WIFI_MAX_RETRY);
            esp_wifi_connect();
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        if (event != NULL) {
            s_sta_retry_count = 0;
            ESP_LOGI(TAG, "runtime sta got ip " IPSTR, IP2STR(&event->ip_info.ip));
        }
    }
}

static esp_err_t ensure_event_handlers(void)
{
    if (s_event_handlers_ready) {
        return ESP_OK;
    }

    esp_err_t err = esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_START, wifi_event_handler, NULL);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }
    err = esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_DISCONNECTED, wifi_event_handler, NULL);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }
    err = esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }
    s_event_handlers_ready = true;
    return ESP_OK;
}

esp_err_t vb_runtime_wifi_ensure_netif(void)
{
    log_internal_heap("wifi ensure_nvs before");
    esp_err_t err = ensure_nvs();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "ensure_nvs failed: %s", esp_err_to_name(err));
        return err;
    }
    log_internal_heap("wifi ensure_nvs after");

    if (!s_netif_ready) {
        log_internal_heap("wifi netif_init before");
        err = esp_netif_init();
        if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
            ESP_LOGW(TAG, "esp_netif_init failed: %s", esp_err_to_name(err));
            return err;
        }
        log_internal_heap("wifi event_loop before");
        err = esp_event_loop_create_default();
        if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
            ESP_LOGW(TAG, "esp_event_loop_create_default failed: %s", esp_err_to_name(err));
            return err;
        }
        s_netif_ready = true;
        log_internal_heap("wifi event_loop after");
    }

    err = ensure_event_handlers();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "ensure_event_handlers failed: %s", esp_err_to_name(err));
        return err;
    }

    if (s_sta_netif == NULL) {
        log_internal_heap("wifi sta_netif before");
        s_sta_netif = esp_netif_create_default_wifi_sta();
        if (s_sta_netif == NULL) {
            log_internal_heap("wifi sta_netif no_mem");
            return ESP_ERR_NO_MEM;
        }
        log_internal_heap("wifi sta_netif after");
    }
    return ESP_OK;
}

esp_err_t vb_runtime_wifi_prepare(void)
{
    log_internal_heap("wifi prepare_nvs before");
    esp_err_t err = ensure_nvs();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "prepare_nvs failed: %s", esp_err_to_name(err));
        return err;
    }
    log_internal_heap("wifi prepare_nvs after");
    return ESP_OK;
}

esp_err_t vb_runtime_wifi_ensure_wifi(void)
{
    esp_err_t err = vb_runtime_wifi_ensure_netif();
    if (err != ESP_OK) {
        return err;
    }
    if (!s_wifi_ready) {
        wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
        log_internal_heap("wifi init before");
        err = esp_wifi_init(&cfg);
        if (err != ESP_OK && err != ESP_ERR_WIFI_INIT_STATE) {
            ESP_LOGW(TAG, "esp_wifi_init failed: %s", esp_err_to_name(err));
            log_internal_heap("wifi init failed");
            return err;
        }
        log_internal_heap("wifi init after");
        err = esp_wifi_set_ps(WIFI_PS_NONE);
        if (err != ESP_OK && err != ESP_ERR_WIFI_NOT_INIT) {
            ESP_LOGW(TAG, "esp_wifi_set_ps failed: %s", esp_err_to_name(err));
            return err;
        }
        s_wifi_ready = true;
    }
    return ESP_OK;
}

esp_err_t vb_runtime_wifi_start(void)
{
    esp_err_t err = vb_runtime_wifi_ensure_wifi();
    if (err != ESP_OK) {
        return err;
    }
    if (!s_wifi_started) {
        log_internal_heap("wifi start before");
        err = normalize_wifi_result(esp_wifi_start());
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "esp_wifi_start failed: %s", esp_err_to_name(err));
            log_internal_heap("wifi start failed");
            return err;
        }
        s_wifi_started = true;
        log_internal_heap("wifi start after");
    }
    return ESP_OK;
}

esp_err_t vb_runtime_wifi_configure_sta(const char *ssid, const char *password)
{
    if (ssid == NULL || ssid[0] == '\0') {
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t err = vb_runtime_wifi_ensure_wifi();
    if (err != ESP_OK) {
        return err;
    }

    err = esp_wifi_set_mode(WIFI_MODE_STA);
    if (err != ESP_OK) {
        return err;
    }

    wifi_config_t config = {0};
    strlcpy((char *)config.sta.ssid, ssid, sizeof(config.sta.ssid));
    strlcpy((char *)config.sta.password, password ? password : "", sizeof(config.sta.password));
    config.sta.threshold.authmode = (password != NULL && password[0] != '\0') ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;
    s_sta_retry_count = 0;

    return normalize_wifi_result(esp_wifi_set_config(WIFI_IF_STA, &config));
}

esp_err_t vb_runtime_wifi_connect_sta(void)
{
    esp_err_t err = vb_runtime_wifi_start();
    if (err != ESP_OK) {
        return err;
    }
    s_sta_should_connect = true;
    return normalize_wifi_result(esp_wifi_connect());
}

esp_err_t vb_runtime_wifi_start_sta(const char *ssid, const char *password, bool connect)
{
    esp_err_t err = vb_runtime_wifi_configure_sta(ssid, password);
    if (err != ESP_OK) {
        return err;
    }

    s_sta_should_connect = connect;
    if (!connect) {
        return vb_runtime_wifi_start();
    }
    return vb_runtime_wifi_connect_sta();
}

esp_netif_t *vb_runtime_wifi_sta_netif(void)
{
    return s_sta_netif;
}

static bool read_wifi_config(const char *path, char *buffer, size_t buffer_size)
{
    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        return false;
    }

    size_t bytes = fread(buffer, 1, buffer_size - 1, file);
    bool too_large = !feof(file);
    fclose(file);
    if (too_large) {
        ESP_LOGW(TAG, "runtime WiFi config too large: %s", path);
        buffer[0] = '\0';
        return true;
    }
    buffer[bytes] = '\0';
    return true;
}

esp_err_t vb_runtime_wifi_load_config_from_sd(vb_runtime_wifi_config_t *config)
{
    if (config == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(config, 0, sizeof(*config));

    char json_text[VB_RUNTIME_WIFI_CONFIG_MAX] = {0};
    const char *path = VB_RUNTIME_WIFI_CONFIG_PATH;
    bool found = read_wifi_config(path, json_text, sizeof(json_text));
    if (!found) {
        path = VB_LEGACY_SMOKE_WIFI_CONFIG_PATH;
        found = read_wifi_config(path, json_text, sizeof(json_text));
    }
    if (!found) {
        ESP_LOGI(TAG, "runtime WiFi config not found: %s", VB_RUNTIME_WIFI_CONFIG_PATH);
        return ESP_OK;
    }
    if (json_text[0] == '\0') {
        return ESP_OK;
    }

    cJSON *root = cJSON_Parse(json_text);
    if (root == NULL) {
        ESP_LOGW(TAG, "runtime WiFi config parse failed: %s", path);
        return ESP_OK;
    }

    cJSON *ssid = cJSON_GetObjectItem(root, "ssid");
    cJSON *password = cJSON_GetObjectItem(root, "password");
    if (!cJSON_IsString(ssid) || ssid->valuestring == NULL || ssid->valuestring[0] == '\0') {
        ESP_LOGW(TAG, "runtime WiFi config missing ssid: %s", path);
        cJSON_Delete(root);
        return ESP_OK;
    }

    const char *password_value = "";
    if (cJSON_IsString(password) && password->valuestring != NULL) {
        password_value = password->valuestring;
    }

    strlcpy(config->ssid, ssid->valuestring, sizeof(config->ssid));
    strlcpy(config->password, password_value, sizeof(config->password));
    config->found = true;
    cJSON_Delete(root);
    ESP_LOGI(TAG, "runtime WiFi autoconnect using %s", path);
    return ESP_OK;
}

esp_err_t vb_runtime_wifi_start_config(const vb_runtime_wifi_config_t *config)
{
    if (config == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!config->found) {
        return ESP_OK;
    }
    return vb_runtime_wifi_start_sta(config->ssid, config->password, true);
}

esp_err_t vb_runtime_wifi_start_from_sd(void)
{
    vb_runtime_wifi_config_t config = {0};
    esp_err_t err = vb_runtime_wifi_load_config_from_sd(&config);
    if (err != ESP_OK) {
        return err;
    }
    return vb_runtime_wifi_start_config(&config);
}
