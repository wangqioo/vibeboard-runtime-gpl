#include "install_service.h"

#include <errno.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include "app_registry.h"
#include "app_runner.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "launcher_ui.h"

static const char *TAG = "install_service";

static httpd_handle_t s_server;
static bool s_netif_ready;
static vb_install_service_context_t *s_context;

static void note_launcher_async_launch(void *user_data)
{
    (void)user_data;
    vb_launcher_ui_note_async_launch();
}

static bool reject_unsafe_path(const char *path)
{
    return path == NULL || path[0] == '\0' || path[0] == '/' || strstr(path, "..") != NULL;
}

static esp_err_t mkdir_if_missing(const char *path)
{
    if (mkdir(path, 0775) == 0 || errno == EEXIST) {
        return ESP_OK;
    }
    ESP_LOGE(TAG, "mkdir failed %s errno=%d", path, errno);
    return ESP_FAIL;
}

static esp_err_t ensure_parent_dirs(const char *path)
{
    char buffer[VB_APP_PATH_MAX];
    strlcpy(buffer, path, sizeof(buffer));

    for (char *cursor = buffer + strlen(VB_APPS_PATH) + 1; *cursor != '\0'; cursor++) {
        if (*cursor != '/') {
            continue;
        }
        *cursor = '\0';
        esp_err_t err = mkdir_if_missing(buffer);
        *cursor = '/';
        if (err != ESP_OK) {
            return err;
        }
    }
    return ESP_OK;
}

static esp_err_t get_query_value(httpd_req_t *req, const char *key, char *value, size_t value_size)
{
    char query[192] = {0};
    esp_err_t err = httpd_req_get_url_query_str(req, query, sizeof(query));
    if (err != ESP_OK) {
        return err;
    }
    return httpd_query_key_value(query, key, value, value_size);
}

static esp_err_t ensure_netif_ready(void)
{
    if (s_netif_ready) {
        return ESP_OK;
    }

    esp_err_t err = esp_netif_init();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "esp_netif_init failed: %s", esp_err_to_name(err));
        return err;
    }

    err = esp_event_loop_create_default();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "event loop init failed: %s", esp_err_to_name(err));
        return err;
    }

    s_netif_ready = true;
    return ESP_OK;
}

static esp_err_t install_handler(httpd_req_t *req)
{
    char app[64] = {0};
    char path[128] = {0};
    if (get_query_value(req, "app", app, sizeof(app)) != ESP_OK ||
        get_query_value(req, "path", path, sizeof(path)) != ESP_OK ||
        reject_unsafe_path(app) ||
        reject_unsafe_path(path)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "unsafe or missing app/path");
        return ESP_FAIL;
    }

    char full_path[VB_APP_PATH_MAX];
    int written = snprintf(full_path, sizeof(full_path), "%s/%s/%s", VB_APPS_PATH, app, path);
    if (written < 0 || written >= (int)sizeof(full_path)) {
        httpd_resp_send_err(req, HTTPD_414_URI_TOO_LONG, "path too long");
        return ESP_FAIL;
    }
    if (ensure_parent_dirs(full_path) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "mkdir failed");
        return ESP_FAIL;
    }

    FILE *file = fopen(full_path, "wb");
    if (file == NULL) {
        ESP_LOGE(TAG, "open failed %s errno=%d", full_path, errno);
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "open failed");
        return ESP_FAIL;
    }

    char buffer[512];
    int remaining = req->content_len;
    while (remaining > 0) {
        int received = httpd_req_recv(req, buffer, remaining < (int)sizeof(buffer) ? remaining : (int)sizeof(buffer));
        if (received <= 0) {
            fclose(file);
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "recv failed");
            return ESP_FAIL;
        }
        if (fwrite(buffer, 1, (size_t)received, file) != (size_t)received) {
            fclose(file);
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "write failed");
            return ESP_FAIL;
        }
        remaining -= received;
    }

    fclose(file);
    ESP_LOGI(TAG, "installed %s bytes=%d", full_path, req->content_len);
    httpd_resp_set_type(req, "text/plain");
    httpd_resp_sendstr(req, "ok\n");
    return ESP_OK;
}

static void send_json(httpd_req_t *req, const char *json)
{
    httpd_resp_set_type(req, "application/json");
    httpd_resp_sendstr(req, json);
}

static const vb_app_registry_entry_t *find_app_by_id(const vb_app_registry_result_t *registry, const char *id)
{
    if (registry == NULL || id == NULL) {
        return NULL;
    }

    for (int i = 0; i < registry->stored_app_count; i++) {
        const vb_app_registry_entry_t *app = &registry->apps[i];
        if (strcmp(app->id, id) == 0) {
            return app;
        }
    }
    return NULL;
}

static esp_err_t status_handler(httpd_req_t *req)
{
    char body[384];
    const vb_app_registry_result_t *registry = s_context ? s_context->registry : NULL;
    int app_count = 0;
    char first_app[VB_APP_NAME_MAX];
    strcpy(first_app, "-");
    vb_app_registry_lock();
    if (registry != NULL) {
        app_count = registry->app_count;
        if (registry->first_app_name[0] != '\0') {
            strlcpy(first_app, registry->first_app_name, sizeof(first_app));
        }
    }
    vb_app_registry_unlock();
    bool running = vb_app_runner_is_running();
    const char *state = vb_app_runner_current_state_name();
    const char *current_app = running ? vb_app_runner_current_id() : "";
    snprintf(body,
             sizeof(body),
             "{\"sd\":%s,\"app_count\":%d,\"first_app\":\"%s\",\"install\":\"ok\",\"state\":\"%s\",\"running\":%s,\"current_app\":\"%s\"}\n",
             (s_context && s_context->sd_ok) ? "true" : "false",
             app_count,
             first_app,
             state,
             running ? "true" : "false",
             current_app);
    send_json(req, body);
    return ESP_OK;
}

static esp_err_t apps_handler(httpd_req_t *req)
{
    char body[1024];
    size_t used = 0;
    const vb_app_registry_result_t *registry = s_context ? s_context->registry : NULL;

    used += snprintf(body + used, sizeof(body) - used, "{\"apps\":[");
    vb_app_registry_lock();
    int stored = registry ? registry->stored_app_count : 0;
    for (int i = 0; i < stored && used < sizeof(body); i++) {
        const vb_app_registry_entry_t *app = &registry->apps[i];
        used += snprintf(body + used,
                         sizeof(body) - used,
                         "%s{\"id\":\"%s\",\"name\":\"%s\",\"entry\":\"%s\"}",
                         i == 0 ? "" : ",",
                         app->id,
                         app->name,
                         app->entry);
    }
    vb_app_registry_unlock();
    if (used < sizeof(body)) {
        snprintf(body + used, sizeof(body) - used, "]}\n");
    } else {
        strlcpy(body + sizeof(body) - 4, "]}\n", 4);
    }
    send_json(req, body);
    return ESP_OK;
}

static esp_err_t rescan_handler(httpd_req_t *req)
{
    if (s_context == NULL || s_context->registry == NULL || !s_context->sd_ok) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "sd unavailable");
        return ESP_FAIL;
    }

    esp_err_t err = vb_app_registry_scan(s_context->registry);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, esp_err_to_name(err));
        return ESP_FAIL;
    }

    vb_app_registry_lock();
    int app_count = s_context->registry->app_count;
    vb_app_registry_unlock();

    char body[96];
    snprintf(body, sizeof(body), "{\"ok\":true,\"app_count\":%d}\n", app_count);
    send_json(req, body);
    return ESP_OK;
}

static esp_err_t launch_handler(httpd_req_t *req)
{
    char app_id[64] = {0};
    if (get_query_value(req, "app", app_id, sizeof(app_id)) != ESP_OK || reject_unsafe_path(app_id)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "unsafe or missing app");
        return ESP_FAIL;
    }
    if (s_context == NULL || s_context->registry == NULL || !s_context->sd_ok) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "sd unavailable");
        return ESP_FAIL;
    }

    esp_err_t err = vb_app_registry_scan(s_context->registry);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, esp_err_to_name(err));
        return ESP_FAIL;
    }

    vb_app_registry_entry_t selected_app = {0};
    vb_app_registry_lock();
    const vb_app_registry_entry_t *app = find_app_by_id(s_context->registry, app_id);
    if (app != NULL) {
        selected_app = *app;
    }
    vb_app_registry_unlock();
    if (selected_app.id[0] == '\0') {
        httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "app not found");
        return ESP_FAIL;
    }

    if (vb_app_runner_is_running()) {
        const char *current_id = vb_app_runner_current_id();
        if (strcmp(current_id, selected_app.id) == 0) {
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "app already running");
            return ESP_FAIL;
        }
        ESP_LOGI(TAG, "switch app %s -> %s", current_id, selected_app.id);
        err = vb_app_runner_stop();
        if (err != ESP_OK && err != ESP_ERR_NOT_FOUND) {
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, esp_err_to_name(err));
            return ESP_FAIL;
        }
        err = vb_app_runner_wait_stopped(1500);
        if (err != ESP_OK) {
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "app stop timeout");
            return ESP_FAIL;
        }
    }

    const vb_app_runner_launch_options_t launch_options = {
        .before_start = note_launcher_async_launch,
        .user_data = NULL,
    };
    err = vb_app_runner_launch_async_with_options(&selected_app, &launch_options);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, esp_err_to_name(err));
        return ESP_FAIL;
    }

    char body[128];
    snprintf(body, sizeof(body), "{\"ok\":true,\"launched\":\"%s\"}\n", selected_app.id);
    send_json(req, body);
    return ESP_OK;
}

static esp_err_t stop_handler(httpd_req_t *req)
{
    if (!vb_app_runner_is_running()) {
        send_json(req, "{\"ok\":true,\"stopped\":false}\n");
        return ESP_OK;
    }

    esp_err_t err = vb_app_runner_stop();
    if (err != ESP_OK && err != ESP_ERR_NOT_FOUND) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, esp_err_to_name(err));
        return ESP_FAIL;
    }
    err = vb_app_runner_wait_stopped(1500);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "app stop timeout");
        return ESP_FAIL;
    }

    send_json(req, "{\"ok\":true,\"stopped\":true}\n");
    return ESP_OK;
}

static esp_err_t register_handler(const char *uri, httpd_method_t method, esp_err_t (*handler)(httpd_req_t *req))
{
    const httpd_uri_t http_uri = {
        .uri = uri,
        .method = method,
        .handler = handler,
        .user_ctx = NULL,
    };
    esp_err_t err = httpd_register_uri_handler(s_server, &http_uri);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "register %s handler failed: %s", uri, esp_err_to_name(err));
    }
    return err;
}

esp_err_t vb_install_service_start(vb_install_service_context_t *context)
{
    s_context = context;
    if (s_server != NULL) {
        return ESP_OK;
    }

    esp_err_t err = ensure_netif_ready();
    if (err != ESP_OK) {
        return err;
    }

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 8080;
    config.uri_match_fn = httpd_uri_match_wildcard;

    err = httpd_start(&s_server, &config);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "httpd_start failed: %s", esp_err_to_name(err));
        s_server = NULL;
        return err;
    }

    err = register_handler("/install", HTTP_POST, install_handler);
    if (err != ESP_OK) {
        return err;
    }
    err = register_handler("/status", HTTP_GET, status_handler);
    if (err != ESP_OK) {
        return err;
    }
    err = register_handler("/apps", HTTP_GET, apps_handler);
    if (err != ESP_OK) {
        return err;
    }
    err = register_handler("/rescan", HTTP_POST, rescan_handler);
    if (err != ESP_OK) {
        return err;
    }
    err = register_handler("/launch", HTTP_POST, launch_handler);
    if (err != ESP_OK) {
        return err;
    }
    err = register_handler("/stop", HTTP_POST, stop_handler);
    if (err != ESP_OK) {
        return err;
    }

    ESP_LOGI(TAG, "install service listening on port %d", config.server_port);
    return ESP_OK;
}
