#include "install_service.h"

#include <dirent.h>
#include <errno.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include "app_registry.h"
#include "app_runner.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "launcher_ui.h"
#include "web_console.h"

static const char *TAG = "install_service";
#define VB_INSTALL_HTTPD_STACK_SIZE 8192
#define VB_INSTALL_HTTPD_MAX_HANDLERS 12
#define VB_STAGING_PATH "/sdcard/.staging"
#define VB_STAGING_BACKUP_SUFFIX ".previous"

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

static esp_err_t ensure_parent_dirs_from_base(const char *path, const char *base)
{
    char buffer[VB_APP_PATH_MAX];
    strlcpy(buffer, path, sizeof(buffer));

    for (char *cursor = buffer + strlen(base) + 1; *cursor != '\0'; cursor++) {
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

static bool build_child_path(char *dest, size_t dest_size, const char *parent, const char *child)
{
    int written = snprintf(dest, dest_size, "%s/%s", parent, child);
    return written >= 0 && written < (int)dest_size;
}

static esp_err_t remove_app_tree(const char *path)
{
    struct stat statbuf;
    if (stat(path, &statbuf) != 0) {
        ESP_LOGE(TAG, "stat failed %s errno=%d", path, errno);
        return ESP_FAIL;
    }

    if (!S_ISDIR(statbuf.st_mode)) {
        if (unlink(path) == 0) {
            return ESP_OK;
        }
        ESP_LOGE(TAG, "unlink failed %s errno=%d", path, errno);
        return ESP_FAIL;
    }

    DIR *dir = opendir(path);
    if (dir == NULL) {
        ESP_LOGE(TAG, "opendir failed %s errno=%d", path, errno);
        return ESP_FAIL;
    }

    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
            continue;
        }

        char child_path[VB_APP_PATH_MAX];
        int written = snprintf(child_path, sizeof(child_path), "%s/%s", path, entry->d_name);
        if (written < 0 || written >= (int)sizeof(child_path)) {
            closedir(dir);
            ESP_LOGE(TAG, "delete path too long: %s/%s", path, entry->d_name);
            return ESP_FAIL;
        }

        if (remove_app_tree(child_path) != ESP_OK) {
            closedir(dir);
            return ESP_FAIL;
        }
    }

    closedir(dir);
    if (rmdir(path) == 0) {
        return ESP_OK;
    }

    ESP_LOGE(TAG, "rmdir failed %s errno=%d", path, errno);
    return ESP_FAIL;
}

static esp_err_t remove_tree_if_exists(const char *path)
{
    struct stat statbuf;
    if (stat(path, &statbuf) != 0) {
        if (errno == ENOENT) {
            return ESP_OK;
        }
        ESP_LOGE(TAG, "stat failed %s errno=%d", path, errno);
        return ESP_FAIL;
    }
    return remove_app_tree(path);
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

static esp_err_t receive_request_file(httpd_req_t *req, const char *full_path)
{
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
    if (mkdir_if_missing(VB_APPS_PATH) != ESP_OK ||
        ensure_parent_dirs_from_base(full_path, VB_APPS_PATH) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "mkdir failed");
        return ESP_FAIL;
    }

    if (receive_request_file(req, full_path) != ESP_OK) {
        return ESP_FAIL;
    }
    ESP_LOGI(TAG, "installed %s bytes=%d", full_path, req->content_len);
    httpd_resp_set_type(req, "text/plain");
    httpd_resp_sendstr(req, "ok\n");
    return ESP_OK;
}

static void copy_trimmed_info_value(char *dest, size_t dest_size, const char *value)
{
    while (*value == ' ' || *value == '\t') {
        value++;
    }

    size_t len = strcspn(value, "\r\n");
    while (len > 0 && (value[len - 1] == ' ' || value[len - 1] == '\t')) {
        len--;
    }
    if (len >= dest_size) {
        len = dest_size - 1;
    }
    memcpy(dest, value, len);
    dest[len] = '\0';
}

static bool read_entry_from_info(const char *info_path, char *entry, size_t entry_size)
{
    FILE *file = fopen(info_path, "r");
    if (file == NULL) {
        return false;
    }

    char line[128];
    while (fgets(line, sizeof(line), file) != NULL) {
        char *equals = strchr(line, '=');
        if (equals == NULL) {
            continue;
        }

        char *key_end = equals;
        while (key_end > line && (key_end[-1] == ' ' || key_end[-1] == '\t')) {
            key_end--;
        }
        size_t key_len = key_end - line;
        if (key_len == 5 && strncmp(line, "entry", 5) == 0) {
            copy_trimmed_info_value(entry, entry_size, equals + 1);
            break;
        }
    }

    fclose(file);
    if (entry[0] == '\0') {
        strlcpy(entry, "main.lua", entry_size);
    }
    return true;
}

static esp_err_t validate_staged_app(const char *staging_dir)
{
    char info_path[VB_APP_PATH_MAX];
    if (!build_child_path(info_path, sizeof(info_path), staging_dir, "app.info")) {
        ESP_LOGE(TAG, "staged app info path too long: %s", staging_dir);
        return ESP_ERR_INVALID_SIZE;
    }

    struct stat st;
    if (stat(info_path, &st) != 0 || !S_ISREG(st.st_mode)) {
        ESP_LOGE(TAG, "staged app missing app.info: %s", staging_dir);
        return ESP_ERR_NOT_FOUND;
    }

    char entry[VB_APP_NAME_MAX] = {0};
    if (!read_entry_from_info(info_path, entry, sizeof(entry)) || reject_unsafe_path(entry)) {
        ESP_LOGE(TAG, "staged app has unsafe entry: %s", staging_dir);
        return ESP_ERR_INVALID_ARG;
    }

    char entry_path[VB_APP_PATH_MAX];
    if (!build_child_path(entry_path, sizeof(entry_path), staging_dir, entry)) {
        ESP_LOGE(TAG, "staged app entry path too long: %s/%s", staging_dir, entry);
        return ESP_ERR_INVALID_SIZE;
    }
    if (stat(entry_path, &st) != 0 || !S_ISREG(st.st_mode)) {
        ESP_LOGE(TAG, "staged app missing entry: %s", entry_path);
        return ESP_ERR_NOT_FOUND;
    }

    return ESP_OK;
}

static esp_err_t stage_handler(httpd_req_t *req)
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
    if (s_context == NULL || !s_context->sd_ok) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "sd unavailable");
        return ESP_FAIL;
    }

    char full_path[VB_APP_PATH_MAX];
    int written = snprintf(full_path, sizeof(full_path), "%s/%s/%s", VB_STAGING_PATH, app, path);
    if (written < 0 || written >= (int)sizeof(full_path)) {
        httpd_resp_send_err(req, HTTPD_414_URI_TOO_LONG, "path too long");
        return ESP_FAIL;
    }
    if (mkdir_if_missing(VB_STAGING_PATH) != ESP_OK ||
        ensure_parent_dirs_from_base(full_path, VB_STAGING_PATH) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "mkdir failed");
        return ESP_FAIL;
    }

    if (receive_request_file(req, full_path) != ESP_OK) {
        return ESP_FAIL;
    }
    ESP_LOGI(TAG, "staged %s bytes=%d", full_path, req->content_len);
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
    const vb_app_registry_result_t *registry = s_context ? s_context->registry : NULL;

    httpd_resp_set_type(req, "application/json");
    esp_err_t err = httpd_resp_send_chunk(req, "{\"apps\":[", HTTPD_RESP_USE_STRLEN);
    if (err != ESP_OK) {
        return err;
    }

    vb_app_registry_lock();
    int stored = registry ? registry->stored_app_count : 0;
    for (int i = 0; i < stored; i++) {
        const vb_app_registry_entry_t *app = &registry->apps[i];
        char item[256];
        int written = snprintf(item,
                               sizeof(item),
                               "%s{\"id\":\"%s\",\"name\":\"%s\",\"entry\":\"%s\"}",
                               i == 0 ? "" : ",",
                               app->id,
                               app->name,
                               app->entry);
        if (written < 0 || written >= (int)sizeof(item)) {
            vb_app_registry_unlock();
            httpd_resp_send_chunk(req, NULL, 0);
            return ESP_ERR_INVALID_SIZE;
        }
        err = httpd_resp_send_chunk(req, item, HTTPD_RESP_USE_STRLEN);
        if (err != ESP_OK) {
            vb_app_registry_unlock();
            return err;
        }
    }
    vb_app_registry_unlock();

    err = httpd_resp_send_chunk(req, "]}\n", HTTPD_RESP_USE_STRLEN);
    if (err != ESP_OK) {
        return err;
    }
    return httpd_resp_send_chunk(req, NULL, 0);
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

static esp_err_t delete_handler(httpd_req_t *req)
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

    if (vb_app_runner_is_running() && strcmp(vb_app_runner_current_id(), selected_app.id) == 0) {
        httpd_resp_set_status(req, "409 Conflict");
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_sendstr(req, "app is running\n");
        return ESP_FAIL;
    }

    char app_dir[VB_APP_PATH_MAX];
    int written = snprintf(app_dir, sizeof(app_dir), "%s/%s", VB_APPS_PATH, selected_app.id);
    if (written < 0 || written >= (int)sizeof(app_dir)) {
        httpd_resp_send_err(req, HTTPD_414_URI_TOO_LONG, "path too long");
        return ESP_FAIL;
    }

    err = remove_app_tree(app_dir);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "delete failed");
        return ESP_FAIL;
    }

    err = vb_app_registry_scan(s_context->registry);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, esp_err_to_name(err));
        return ESP_FAIL;
    }

    vb_app_registry_lock();
    int app_count = s_context->registry->app_count;
    vb_app_registry_unlock();

    char body[128];
    snprintf(body, sizeof(body), "{\"ok\":true,\"deleted\":\"%s\",\"app_count\":%d}\n", selected_app.id, app_count);
    send_json(req, body);
    return ESP_OK;
}

static esp_err_t discard_handler(httpd_req_t *req)
{
    char app_id[64] = {0};
    if (get_query_value(req, "app", app_id, sizeof(app_id)) != ESP_OK || reject_unsafe_path(app_id)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "unsafe or missing app");
        return ESP_FAIL;
    }
    if (s_context == NULL || !s_context->sd_ok) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "sd unavailable");
        return ESP_FAIL;
    }

    char staging_dir[VB_APP_PATH_MAX];
    if (!build_child_path(staging_dir, sizeof(staging_dir), VB_STAGING_PATH, app_id)) {
        httpd_resp_send_err(req, HTTPD_414_URI_TOO_LONG, "path too long");
        return ESP_FAIL;
    }

    esp_err_t err = remove_tree_if_exists(staging_dir);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "discard failed");
        return ESP_FAIL;
    }

    char body[128];
    snprintf(body, sizeof(body), "{\"ok\":true,\"discarded\":\"%s\"}\n", app_id);
    send_json(req, body);
    return ESP_OK;
}

static esp_err_t commit_handler(httpd_req_t *req)
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
    if (vb_app_runner_is_running() && strcmp(vb_app_runner_current_id(), app_id) == 0) {
        httpd_resp_set_status(req, "409 Conflict");
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_sendstr(req, "app is running\n");
        return ESP_FAIL;
    }

    char staging_dir[VB_APP_PATH_MAX];
    char app_dir[VB_APP_PATH_MAX];
    char backup_dir[VB_APP_PATH_MAX];
    if (!build_child_path(staging_dir, sizeof(staging_dir), VB_STAGING_PATH, app_id) ||
        !build_child_path(app_dir, sizeof(app_dir), VB_APPS_PATH, app_id)) {
        httpd_resp_send_err(req, HTTPD_414_URI_TOO_LONG, "path too long");
        return ESP_FAIL;
    }
    int backup_written = snprintf(backup_dir, sizeof(backup_dir), "%s/%s%s", VB_STAGING_PATH, app_id, VB_STAGING_BACKUP_SUFFIX);
    if (backup_written < 0 || backup_written >= (int)sizeof(backup_dir)) {
        httpd_resp_send_err(req, HTTPD_414_URI_TOO_LONG, "path too long");
        return ESP_FAIL;
    }

    esp_err_t err = validate_staged_app(staging_dir);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "invalid staged app");
        return ESP_FAIL;
    }

    if (mkdir_if_missing(VB_APPS_PATH) != ESP_OK || mkdir_if_missing(VB_STAGING_PATH) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "mkdir failed");
        return ESP_FAIL;
    }
    if (remove_tree_if_exists(backup_dir) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "backup cleanup failed");
        return ESP_FAIL;
    }

    bool has_backup = false;
    struct stat st;
    if (stat(app_dir, &st) == 0) {
        if (rename(app_dir, backup_dir) != 0) {
            ESP_LOGE(TAG, "backup rename failed %s -> %s errno=%d", app_dir, backup_dir, errno);
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "backup failed");
            return ESP_FAIL;
        }
        has_backup = true;
    } else if (errno != ENOENT) {
        ESP_LOGE(TAG, "stat app dir failed %s errno=%d", app_dir, errno);
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "stat failed");
        return ESP_FAIL;
    }

    if (rename(staging_dir, app_dir) != 0) {
        ESP_LOGE(TAG, "commit rename failed %s -> %s errno=%d", staging_dir, app_dir, errno);
        if (has_backup && rename(backup_dir, app_dir) != 0) {
            ESP_LOGE(TAG, "backup restore failed %s -> %s errno=%d", backup_dir, app_dir, errno);
        }
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "commit failed");
        return ESP_FAIL;
    }

    err = vb_app_registry_scan(s_context->registry);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, esp_err_to_name(err));
        return ESP_FAIL;
    }

    if (has_backup) {
        remove_tree_if_exists(backup_dir);
    }

    vb_app_registry_lock();
    int app_count = s_context->registry->app_count;
    vb_app_registry_unlock();

    char body[128];
    snprintf(body, sizeof(body), "{\"ok\":true,\"committed\":\"%s\",\"app_count\":%d}\n", app_id, app_count);
    send_json(req, body);
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
    config.stack_size = VB_INSTALL_HTTPD_STACK_SIZE;
    config.max_uri_handlers = VB_INSTALL_HTTPD_MAX_HANDLERS;
    config.uri_match_fn = httpd_uri_match_wildcard;

    err = httpd_start(&s_server, &config);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "httpd_start failed: %s", esp_err_to_name(err));
        s_server = NULL;
        return err;
    }

    err = vb_web_console_register(s_server);
    if (err != ESP_OK) {
        return err;
    }

    err = register_handler("/install", HTTP_POST, install_handler);
    if (err != ESP_OK) {
        return err;
    }
    err = register_handler("/stage", HTTP_POST, stage_handler);
    if (err != ESP_OK) {
        return err;
    }
    err = register_handler("/commit", HTTP_POST, commit_handler);
    if (err != ESP_OK) {
        return err;
    }
    err = register_handler("/discard", HTTP_POST, discard_handler);
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
    err = register_handler("/delete", HTTP_POST, delete_handler);
    if (err != ESP_OK) {
        return err;
    }

    ESP_LOGI(TAG, "install service listening on port %d", config.server_port);
    return ESP_OK;
}
