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
#include "esp_check.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_heap_caps.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "launcher_ui.h"
#include "module_abi.h"
#include "mbedtls/sha256.h"

static const char *TAG = "install_service";
#define VB_INSTALL_HTTPD_STACK_SIZE 8192
#define VB_APP_STAGE_PATH "/sdcard/.vibeboard-staging"
#define VB_RUNTIME_VERSION "0.1.0"
#define VB_RUNTIME_LUA_API_VERSION "0.1.0"
#define VB_RUNTIME_LVGL_API_VERSION "0.1.0"
#define VB_RUNTIME_PACKAGE_SCHEMA "vibeboard-runtime-app-package@2"
#define VB_RUNTIME_NATIVE_ABI_VERSION VB_NATIVE_MODULE_ABI_VERSION
#define VB_RUNTIME_CUBICSERVER_CONFIG_PATH "/sdcard/runtime/cubicserver.json"
#define VB_RUNTIME_WIFI_CONFIG_PATH "/sdcard/runtime/wifi.json"
#define VB_RUNTIME_I2S_CONFIG_PATH "/sdcard/runtime/i2s.json"
#define VB_RUNTIME_CONFIG_MAX_BYTES 512
#define VB_MANIFEST_MAX_BYTES 16384
#define VB_SHA256_BYTES 32
#define VB_SHA256_HEX_LEN 64
#define VB_HASH_BUFFER_SIZE 512

static httpd_handle_t s_server;
static bool s_netif_ready;
static vb_install_service_context_t *s_context;

static void send_json(httpd_req_t *req, const char *json);

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

    for (char *cursor = buffer + 1; *cursor != '\0'; cursor++) {
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

static esp_err_t build_storage_path(char *dest, size_t dest_size, const char *root, const char *name, const char *path)
{
    int written;
    if (path == NULL || path[0] == '\0') {
        written = snprintf(dest, dest_size, "%s/%s", root, name);
    } else {
        written = snprintf(dest, dest_size, "%s/%s/%s", root, name, path);
    }
    return (written < 0 || written >= (int)dest_size) ? ESP_ERR_INVALID_SIZE : ESP_OK;
}

static const char *find_json_key_in_range(const char *start, const char *end, const char *key)
{
    size_t key_len = strlen(key);
    for (const char *cursor = start; cursor != NULL && cursor + key_len <= end; cursor++) {
        if (*cursor == '"' && cursor + key_len + 2 <= end &&
            strncmp(cursor + 1, key, key_len) == 0 &&
            cursor[key_len + 1] == '"') {
            return cursor + key_len + 2;
        }
    }
    return NULL;
}

static bool read_json_string_field_in_range(const char *start, const char *end, const char *key, char *dest, size_t dest_size)
{
    const char *cursor = find_json_key_in_range(start, end, key);
    if (cursor == NULL) {
        return false;
    }
    cursor = memchr(cursor, ':', (size_t)(end - cursor));
    if (cursor == NULL) {
        return false;
    }
    cursor++;
    while (cursor < end && (*cursor == ' ' || *cursor == '\n' || *cursor == '\r' || *cursor == '\t')) {
        cursor++;
    }
    if (cursor >= end || *cursor != '"') {
        return false;
    }
    cursor++;
    const char *value_end = memchr(cursor, '"', (size_t)(end - cursor));
    if (value_end == NULL) {
        return false;
    }

    size_t value_len = (size_t)(value_end - cursor);
    if (value_len >= dest_size) {
        value_len = dest_size - 1;
    }
    memcpy(dest, cursor, value_len);
    dest[value_len] = '\0';
    return true;
}

static bool read_json_size_field_in_range(const char *start, const char *end, const char *key, size_t *value)
{
    const char *cursor = find_json_key_in_range(start, end, key);
    if (cursor == NULL) {
        return false;
    }
    cursor = memchr(cursor, ':', (size_t)(end - cursor));
    if (cursor == NULL) {
        return false;
    }
    cursor++;
    while (cursor < end && (*cursor == ' ' || *cursor == '\n' || *cursor == '\r' || *cursor == '\t')) {
        cursor++;
    }
    if (cursor >= end || *cursor < '0' || *cursor > '9') {
        return false;
    }

    size_t parsed = 0;
    while (cursor < end && *cursor >= '0' && *cursor <= '9') {
        parsed = parsed * 10 + (size_t)(*cursor - '0');
        cursor++;
    }
    *value = parsed;
    return true;
}

static esp_err_t read_manifest_file(const char *manifest_path, char **manifest, size_t *manifest_size)
{
    FILE *file = fopen(manifest_path, "rb");
    if (file == NULL) {
        return errno == ENOENT ? ESP_ERR_NOT_FOUND : ESP_FAIL;
    }
    if (fseek(file, 0, SEEK_END) != 0) {
        fclose(file);
        return ESP_FAIL;
    }
    long size = ftell(file);
    if (size < 0 || size > VB_MANIFEST_MAX_BYTES) {
        fclose(file);
        return ESP_ERR_INVALID_SIZE;
    }
    if (fseek(file, 0, SEEK_SET) != 0) {
        fclose(file);
        return ESP_FAIL;
    }

    char *buffer = heap_caps_malloc((size_t)size + 1, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (buffer == NULL) {
        fclose(file);
        return ESP_ERR_NO_MEM;
    }
    size_t read = fread(buffer, 1, (size_t)size, file);
    fclose(file);
    if (read != (size_t)size) {
        free(buffer);
        return ESP_FAIL;
    }
    buffer[size] = '\0';
    *manifest = buffer;
    *manifest_size = (size_t)size;
    return ESP_OK;
}

static void hex_encode_sha256(const unsigned char digest[VB_SHA256_BYTES], char *dest, size_t dest_size)
{
    static const char hex[] = "0123456789abcdef";
    if (dest_size < VB_SHA256_HEX_LEN + 1) {
        return;
    }
    for (int i = 0; i < VB_SHA256_BYTES; i++) {
        dest[i * 2] = hex[(digest[i] >> 4) & 0x0f];
        dest[i * 2 + 1] = hex[digest[i] & 0x0f];
    }
    dest[VB_SHA256_HEX_LEN] = '\0';
}

static esp_err_t sha256_file_hex(const char *path, char *hex, size_t hex_size)
{
    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        return ESP_ERR_NOT_FOUND;
    }

    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);
    int ret = mbedtls_sha256_starts(&ctx, 0);
    unsigned char buffer[VB_HASH_BUFFER_SIZE];
    while (ret == 0) {
        size_t read = fread(buffer, 1, sizeof(buffer), file);
        if (read > 0) {
            ret = mbedtls_sha256_update(&ctx, buffer, read);
        }
        if (read < sizeof(buffer)) {
            if (ferror(file)) {
                ret = -1;
            }
            break;
        }
    }

    unsigned char digest[VB_SHA256_BYTES];
    if (ret == 0) {
        ret = mbedtls_sha256_finish(&ctx, digest);
    }
    mbedtls_sha256_free(&ctx);
    fclose(file);
    if (ret != 0) {
        return ESP_FAIL;
    }

    hex_encode_sha256(digest, hex, hex_size);
    return ESP_OK;
}

static esp_err_t validate_manifest_file_entry(const char *stage_path, const char *object_start, const char *object_end)
{
    char relative_path[128] = {0};
    char expected_sha[VB_SHA256_HEX_LEN + 1] = {0};
    size_t expected_size = 0;
    if (!read_json_string_field_in_range(object_start, object_end, "path", relative_path, sizeof(relative_path)) ||
        !read_json_string_field_in_range(object_start, object_end, "sha256", expected_sha, sizeof(expected_sha)) ||
        !read_json_size_field_in_range(object_start, object_end, "size", &expected_size) ||
        reject_unsafe_path(relative_path) ||
        strlen(expected_sha) != VB_SHA256_HEX_LEN) {
        ESP_LOGW(TAG, "manifest file entry invalid");
        return ESP_ERR_INVALID_ARG;
    }

    char full_path[VB_APP_PATH_MAX];
    if (build_storage_path(full_path, sizeof(full_path), stage_path, relative_path, NULL) != ESP_OK) {
        return ESP_ERR_INVALID_SIZE;
    }

    struct stat st;
    if (stat(full_path, &st) != 0 || !S_ISREG(st.st_mode)) {
        ESP_LOGW(TAG, "manifest file missing %s", relative_path);
        return ESP_ERR_NOT_FOUND;
    }
    if ((size_t)st.st_size != expected_size) {
        ESP_LOGW(TAG, "manifest size mismatch %s expected=%u actual=%u",
                 relative_path,
                 (unsigned)expected_size,
                 (unsigned)st.st_size);
        return ESP_ERR_INVALID_SIZE;
    }

    char actual_sha[VB_SHA256_HEX_LEN + 1] = {0};
    esp_err_t err = sha256_file_hex(full_path, actual_sha, sizeof(actual_sha));
    if (err != ESP_OK) {
        return err;
    }
    if (strcmp(actual_sha, expected_sha) != 0) {
        ESP_LOGW(TAG, "sha256 mismatch %s expected=%s actual=%s", relative_path, expected_sha, actual_sha);
        return ESP_ERR_INVALID_CRC;
    }
    return ESP_OK;
}

static esp_err_t validate_stage_manifest(const char *stage_path)
{
    char manifest_path[VB_APP_PATH_MAX];
    if (build_storage_path(manifest_path, sizeof(manifest_path), stage_path, "manifest.json", NULL) != ESP_OK) {
        return ESP_ERR_INVALID_SIZE;
    }

    char *manifest = NULL;
    size_t manifest_size = 0;
    esp_err_t err = read_manifest_file(manifest_path, &manifest, &manifest_size);
    if (err == ESP_ERR_NOT_FOUND) {
        return ESP_OK;
    }
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "manifest read failed: %s", esp_err_to_name(err));
        return err;
    }

    const char *manifest_end = manifest + manifest_size;
    const char *files_key = find_json_key_in_range(manifest, manifest_end, "files");
    if (files_key == NULL) {
        free(manifest);
        return ESP_OK;
    }
    const char *array_start = memchr(files_key, '[', (size_t)(manifest_end - files_key));
    if (array_start == NULL) {
        free(manifest);
        return ESP_ERR_INVALID_ARG;
    }
    const char *array_end = memchr(array_start, ']', (size_t)(manifest_end - array_start));
    if (array_end == NULL) {
        free(manifest);
        return ESP_ERR_INVALID_ARG;
    }

    const char *cursor = array_start;
    while (cursor < array_end) {
        const char *object_start = memchr(cursor, '{', (size_t)(array_end - cursor));
        if (object_start == NULL) {
            break;
        }
        const char *object_end = memchr(object_start, '}', (size_t)(array_end - object_start));
        if (object_end == NULL) {
            free(manifest);
            return ESP_ERR_INVALID_ARG;
        }
        err = validate_manifest_file_entry(stage_path, object_start, object_end);
        if (err != ESP_OK) {
            free(manifest);
            return err;
        }
        cursor = object_end + 1;
    }

    free(manifest);
    return ESP_OK;
}

static esp_err_t build_app_path(char *dest, size_t dest_size, const char *app, const char *path)
{
    return build_storage_path(dest, dest_size, VB_APPS_PATH, app, path);
}

static esp_err_t build_stage_path(char *dest, size_t dest_size, const char *stage, const char *path)
{
    return build_storage_path(dest, dest_size, VB_APP_STAGE_PATH, stage, path);
}

static esp_err_t remove_tree(const char *path)
{
    struct stat st;
    if (stat(path, &st) != 0) {
        return errno == ENOENT ? ESP_OK : ESP_FAIL;
    }

    if (S_ISDIR(st.st_mode)) {
        DIR *dir = opendir(path);
        if (dir == NULL) {
            return ESP_FAIL;
        }

        struct dirent *entry;
        while ((entry = readdir(dir)) != NULL) {
            if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
                continue;
            }

            char child[VB_APP_PATH_MAX];
            if (build_storage_path(child, sizeof(child), path, entry->d_name, NULL) != ESP_OK) {
                closedir(dir);
                return ESP_ERR_INVALID_SIZE;
            }
            esp_err_t err = remove_tree(child);
            if (err != ESP_OK) {
                closedir(dir);
                return err;
            }
        }
        closedir(dir);
        return rmdir(path) == 0 ? ESP_OK : ESP_FAIL;
    }

    return unlink(path) == 0 ? ESP_OK : ESP_FAIL;
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
    char stage[64] = {0};
    if (get_query_value(req, "app", app, sizeof(app)) != ESP_OK ||
        get_query_value(req, "path", path, sizeof(path)) != ESP_OK ||
        reject_unsafe_path(app) ||
        reject_unsafe_path(path)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "unsafe or missing app/path");
        return ESP_FAIL;
    }
    bool staged = get_query_value(req, "stage", stage, sizeof(stage)) == ESP_OK && stage[0] != '\0';
    if (staged && reject_unsafe_path(stage)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "unsafe stage");
        return ESP_FAIL;
    }

    char full_path[VB_APP_PATH_MAX];
    esp_err_t path_err = staged ? build_stage_path(full_path, sizeof(full_path), stage, path)
                                : build_app_path(full_path, sizeof(full_path), app, path);
    if (path_err != ESP_OK) {
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

static esp_err_t install_commit_handler(httpd_req_t *req)
{
    char app[64] = {0};
    char stage[64] = {0};
    if (get_query_value(req, "app", app, sizeof(app)) != ESP_OK ||
        get_query_value(req, "stage", stage, sizeof(stage)) != ESP_OK ||
        reject_unsafe_path(app) ||
        reject_unsafe_path(stage)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "unsafe or missing app/stage");
        return ESP_FAIL;
    }

    char app_path[VB_APP_PATH_MAX];
    char stage_path[VB_APP_PATH_MAX];
    if (build_app_path(app_path, sizeof(app_path), app, NULL) != ESP_OK ||
        build_stage_path(stage_path, sizeof(stage_path), stage, NULL) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_414_URI_TOO_LONG, "path too long");
        return ESP_FAIL;
    }

    struct stat st;
    if (stat(stage_path, &st) != 0 || !S_ISDIR(st.st_mode)) {
        httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "stage not found");
        return ESP_FAIL;
    }
    if (validate_stage_manifest(stage_path) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "manifest validation failed");
        return ESP_FAIL;
    }
    if (remove_tree(app_path) != ESP_OK || ensure_parent_dirs(app_path) != ESP_OK || rename(stage_path, app_path) != 0) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "commit failed");
        return ESP_FAIL;
    }
    if (s_context != NULL && s_context->registry != NULL && s_context->sd_ok) {
        vb_app_registry_scan(s_context->registry);
    }

    char body[128];
    snprintf(body, sizeof(body), "{\"ok\":true,\"committed\":\"%s\"}\n", app);
    send_json(req, body);
    return ESP_OK;
}

static esp_err_t install_abort_handler(httpd_req_t *req)
{
    char stage[64] = {0};
    if (get_query_value(req, "stage", stage, sizeof(stage)) != ESP_OK || reject_unsafe_path(stage)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "unsafe or missing stage");
        return ESP_FAIL;
    }

    char stage_path[VB_APP_PATH_MAX];
    if (build_stage_path(stage_path, sizeof(stage_path), stage, NULL) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_414_URI_TOO_LONG, "path too long");
        return ESP_FAIL;
    }
    if (remove_tree(stage_path) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "abort failed");
        return ESP_FAIL;
    }

    char body[128];
    snprintf(body, sizeof(body), "{\"ok\":true,\"aborted\":\"%s\"}\n", stage);
    send_json(req, body);
    return ESP_OK;
}

static esp_err_t write_runtime_config_body(httpd_req_t *req, const char *path)
{
    if (req->content_len <= 0 || req->content_len > VB_RUNTIME_CONFIG_MAX_BYTES) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "config too large");
        return ESP_FAIL;
    }
    if (ensure_parent_dirs(path) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "mkdir failed");
        return ESP_FAIL;
    }

    FILE *file = fopen(path, "wb");
    if (file == NULL) {
        ESP_LOGE(TAG, "open failed %s errno=%d", path, errno);
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "open failed");
        return ESP_FAIL;
    }

    char buffer[128];
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

static esp_err_t runtime_config_handler(httpd_req_t *req)
{
    char name[32] = {0};
    if (get_query_value(req, "name", name, sizeof(name)) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "unsupported config");
        return ESP_FAIL;
    }

    const char *path = NULL;
    if (strcmp(name, "cubicserver") == 0) {
        path = VB_RUNTIME_CUBICSERVER_CONFIG_PATH;
    } else if (strcmp(name, "wifi") == 0) {
        path = VB_RUNTIME_WIFI_CONFIG_PATH;
    } else if (strcmp(name, "i2s") == 0) {
        path = VB_RUNTIME_I2S_CONFIG_PATH;
    } else {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "unsupported config");
        return ESP_FAIL;
    }

    if (write_runtime_config_body(req, path) != ESP_OK) {
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "runtime config %s bytes=%d", name, req->content_len);
    char body[64];
    snprintf(body, sizeof(body), "{\"ok\":true,\"config\":\"%s\"}\n", name);
    send_json(req, body);
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
    char body[768];
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
    const char *last_message = vb_app_runner_last_message();
    const char *last_status = esp_err_to_name(vb_app_runner_last_status());
    snprintf(body,
             sizeof(body),
             "{\"sd\":%s,\"app_count\":%d,\"first_app\":\"%s\",\"install\":\"ok\",\"state\":\"%s\",\"running\":%s,\"current_app\":\"%s\",\"runtime_version\":\"%s\",\"lua_api_version\":\"%s\",\"lvgl_api_version\":\"%s\",\"package_schema\":\"%s\",\"native_abi_version\":\"%s\",\"last_status\":\"%s\",\"last_message\":\"%s\"}\n",
             (s_context && s_context->sd_ok) ? "true" : "false",
             app_count,
             first_app,
             state,
             running ? "true" : "false",
             current_app,
             VB_RUNTIME_VERSION,
             VB_RUNTIME_LUA_API_VERSION,
             VB_RUNTIME_LVGL_API_VERSION,
             VB_RUNTIME_PACKAGE_SCHEMA,
             VB_RUNTIME_NATIVE_ABI_VERSION,
             last_status,
             last_message);
    send_json(req, body);
    return ESP_OK;
}

static esp_err_t apps_handler(httpd_req_t *req)
{
    const vb_app_registry_result_t *registry = s_context ? s_context->registry : NULL;
    char item[384];

    httpd_resp_set_type(req, "application/json");
    ESP_RETURN_ON_ERROR(httpd_resp_sendstr_chunk(req, "{\"apps\":["), TAG, "apps chunk start failed");
    vb_app_registry_lock();
    int stored = registry ? registry->stored_app_count : 0;
    for (int i = 0; i < stored; i++) {
        const vb_app_registry_entry_t *app = &registry->apps[i];
        int written = snprintf(item,
                               sizeof(item),
                               "%s{\"id\":\"%s\",\"name\":\"%s\",\"entry\":\"%s\",\"schema\":\"%s\",\"version\":\"%s\",\"kind\":\"%s\",\"capabilities\":\"%s\",\"compatible\":%s}",
                               i == 0 ? "" : ",",
                               app->id,
                               app->name,
                               app->entry,
                               app->manifest_schema,
                               app->version,
                               app->kind,
                               app->capabilities,
                               app->compatible ? "true" : "false");
        if (written < 0 || written >= (int)sizeof(item)) {
            vb_app_registry_unlock();
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "app entry too long");
            return ESP_FAIL;
        }
        esp_err_t err = httpd_resp_sendstr_chunk(req, item);
        if (err != ESP_OK) {
            vb_app_registry_unlock();
            return err;
        }
    }
    vb_app_registry_unlock();
    ESP_RETURN_ON_ERROR(httpd_resp_sendstr_chunk(req, "]}\n"), TAG, "apps chunk end failed");
    return httpd_resp_sendstr_chunk(req, NULL);
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
    if (!selected_app.compatible) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "app incompatible");
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
        err = vb_app_runner_wait_stopped(VB_APP_RUNNER_STOP_TIMEOUT_MS);
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
    err = vb_app_runner_wait_stopped(VB_APP_RUNNER_STOP_TIMEOUT_MS);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "app stop timeout");
        return ESP_FAIL;
    }

    send_json(req, "{\"ok\":true,\"stopped\":true}\n");
    return ESP_OK;
}

static esp_err_t app_delete_handler(httpd_req_t *req)
{
    char app[64] = {0};
    if (get_query_value(req, "app", app, sizeof(app)) != ESP_OK || reject_unsafe_path(app)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "unsafe or missing app");
        return ESP_FAIL;
    }
    if (vb_app_runner_is_running() && strcmp(vb_app_runner_current_id(), app) == 0) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "app is running");
        return ESP_FAIL;
    }

    char app_path[VB_APP_PATH_MAX];
    if (build_app_path(app_path, sizeof(app_path), app, NULL) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_414_URI_TOO_LONG, "path too long");
        return ESP_FAIL;
    }
    if (remove_tree(app_path) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "delete failed");
        return ESP_FAIL;
    }
    if (s_context != NULL && s_context->registry != NULL && s_context->sd_ok) {
        vb_app_registry_scan(s_context->registry);
    }

    char body[128];
    snprintf(body, sizeof(body), "{\"ok\":true,\"deleted\":\"%s\"}\n", app);
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
    config.task_caps = (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    config.max_uri_handlers = 12;
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
    err = register_handler("/install/commit", HTTP_POST, install_commit_handler);
    if (err != ESP_OK) {
        return err;
    }
    err = register_handler("/install/abort", HTTP_POST, install_abort_handler);
    if (err != ESP_OK) {
        return err;
    }
    err = register_handler("/runtime/config", HTTP_POST, runtime_config_handler);
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
    err = register_handler("/apps/delete", HTTP_POST, app_delete_handler);
    if (err != ESP_OK) {
        return err;
    }

    ESP_LOGI(TAG, "install service listening on port %d", config.server_port);
    return ESP_OK;
}
