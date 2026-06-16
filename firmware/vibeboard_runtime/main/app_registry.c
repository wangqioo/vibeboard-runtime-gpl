#include "app_registry.h"

#include <dirent.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "app_registry";
static SemaphoreHandle_t s_registry_mutex;

esp_err_t vb_app_registry_init(void)
{
    if (s_registry_mutex == NULL) {
        s_registry_mutex = xSemaphoreCreateMutex();
    }
    return s_registry_mutex != NULL ? ESP_OK : ESP_ERR_NO_MEM;
}

void vb_app_registry_lock(void)
{
    if (vb_app_registry_init() != ESP_OK) {
        return;
    }
    if (s_registry_mutex != NULL) {
        xSemaphoreTake(s_registry_mutex, portMAX_DELAY);
    }
}

void vb_app_registry_unlock(void)
{
    if (s_registry_mutex != NULL) {
        xSemaphoreGive(s_registry_mutex);
    }
}

static bool build_path(char *dest, size_t dest_size, const char *parent, const char *child)
{
    size_t parent_len = strlen(parent);
    size_t child_len = strlen(child);
    if (parent_len + 1 + child_len + 1 > dest_size) {
        return false;
    }

    memcpy(dest, parent, parent_len);
    dest[parent_len] = '/';
    memcpy(dest + parent_len + 1, child, child_len);
    dest[parent_len + 1 + child_len] = '\0';
    return true;
}

static void copy_trimmed_value(char *dest, size_t dest_size, const char *value)
{
    while (*value == ' ' || *value == '\t') {
        value++;
    }

    size_t len = strcspn(value, "\r\n");
    if (len >= dest_size) {
        len = dest_size - 1;
    }
    memcpy(dest, value, len);
    dest[len] = '\0';
}

static bool read_app_info(const char *info_path, char *name, size_t name_size, char *entry, size_t entry_size)
{
    FILE *file = fopen(info_path, "r");
    if (file == NULL) {
        return false;
    }

    char line[128];
    bool found_name = false;
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
        char *value = equals + 1;

        if (key_len == 4 && strncmp(line, "name", 4) == 0) {
            copy_trimmed_value(name, name_size, value);
            found_name = true;
        } else if (key_len == 5 && strncmp(line, "entry", 5) == 0) {
            copy_trimmed_value(entry, entry_size, value);
        }
    }

    fclose(file);
    return found_name;
}

static void read_json_string_field(const char *json,
                                   const char *key,
                                   char *dest,
                                   size_t dest_size)
{
    if (json == NULL || key == NULL || dest == NULL || dest_size == 0) {
        return;
    }

    char pattern[48];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *cursor = strstr(json, pattern);
    if (cursor == NULL) {
        return;
    }
    cursor += strlen(pattern);
    cursor = strchr(cursor, ':');
    if (cursor == NULL) {
        return;
    }
    cursor++;
    while (*cursor == ' ' || *cursor == '\t' || *cursor == '\r' || *cursor == '\n') {
        cursor++;
    }
    if (*cursor != '"') {
        return;
    }
    cursor++;

    size_t len = 0;
    while (cursor[len] != '\0' && cursor[len] != '"' && len + 1 < dest_size) {
        len++;
    }
    memcpy(dest, cursor, len);
    dest[len] = '\0';
}

static void read_json_array_strings(const char *json,
                                    const char *key,
                                    char *dest,
                                    size_t dest_size)
{
    if (json == NULL || key == NULL || dest == NULL || dest_size == 0) {
        return;
    }

    char pattern[48];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *cursor = strstr(json, pattern);
    if (cursor == NULL) {
        return;
    }
    cursor += strlen(pattern);
    cursor = strchr(cursor, ':');
    if (cursor == NULL) {
        return;
    }
    cursor = strchr(cursor, '[');
    if (cursor == NULL) {
        return;
    }
    cursor++;

    size_t used = 0;
    dest[0] = '\0';
    while (*cursor != '\0' && *cursor != ']') {
        while (*cursor == ' ' || *cursor == '\t' || *cursor == '\r' || *cursor == '\n' || *cursor == ',') {
            cursor++;
        }
        if (*cursor != '"') {
            break;
        }
        cursor++;
        const char *start = cursor;
        while (*cursor != '\0' && *cursor != '"') {
            cursor++;
        }
        size_t len = cursor - start;
        if (used != 0 && used + 1 < dest_size) {
            dest[used++] = ',';
        }
        if (used + len >= dest_size) {
            len = dest_size - used - 1;
        }
        memcpy(dest + used, start, len);
        used += len;
        dest[used] = '\0';
        if (*cursor == '"') {
            cursor++;
        }
    }
}

static void read_app_manifest(const char *manifest_path, vb_app_registry_entry_t *app)
{
    strlcpy(app->manifest_schema, "", sizeof(app->manifest_schema));
    strlcpy(app->version, "0.0.0", sizeof(app->version));
    strlcpy(app->kind, "app", sizeof(app->kind));
    strlcpy(app->capabilities, "", sizeof(app->capabilities));
    app->compatible = true;

    FILE *file = fopen(manifest_path, "r");
    if (file == NULL) {
        return;
    }

    char json[1024];
    size_t got = fread(json, 1, sizeof(json) - 1, file);
    fclose(file);
    json[got] = '\0';

    read_json_string_field(json, "schema", app->manifest_schema, sizeof(app->manifest_schema));
    read_json_string_field(json, "version", app->version, sizeof(app->version));
    read_json_string_field(json, "kind", app->kind, sizeof(app->kind));
    read_json_array_strings(json, "capabilities", app->capabilities, sizeof(app->capabilities));

    if (app->manifest_schema[0] != '\0' &&
        strcmp(app->manifest_schema, "vibeboard-runtime-app-package@2") != 0) {
        app->compatible = false;
    }
}

esp_err_t vb_app_registry_scan(vb_app_registry_result_t *result)
{
    if (result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    vb_app_registry_lock();
    memset(result, 0, sizeof(*result));
    strcpy(result->first_app_name, "-");
    strcpy(result->first_app_entry, "main.lua");

    DIR *dir = opendir(VB_APPS_PATH);
    if (dir == NULL) {
        ESP_LOGW(TAG, "apps directory not found: %s", VB_APPS_PATH);
        vb_app_registry_unlock();
        return ESP_ERR_NOT_FOUND;
    }

    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (entry->d_name[0] == '.') {
            continue;
        }

        char app_dir[160];
        if (!build_path(app_dir, sizeof(app_dir), VB_APPS_PATH, entry->d_name)) {
            ESP_LOGW(TAG, "skip app path that is too long: %s", entry->d_name);
            continue;
        }

        struct stat st;
        if (stat(app_dir, &st) != 0 || !S_ISDIR(st.st_mode)) {
            continue;
        }

        char info_path[192];
        if (!build_path(info_path, sizeof(info_path), app_dir, "app.info")) {
            ESP_LOGW(TAG, "skip app info path that is too long: %s", entry->d_name);
            continue;
        }
        if (stat(info_path, &st) != 0 || !S_ISREG(st.st_mode)) {
            continue;
        }

        char app_name[VB_APP_NAME_MAX] = {0};
        char app_entry[VB_APP_NAME_MAX] = {0};
        bool has_name = read_app_info(info_path, app_name, sizeof(app_name), app_entry, sizeof(app_entry));
        if (!has_name) {
            strlcpy(app_name, entry->d_name, sizeof(app_name));
        }
        if (app_entry[0] == '\0') {
            strcpy(app_entry, "main.lua");
        }

        char app_path[VB_APP_PATH_MAX] = {0};
        if (!build_path(app_path, sizeof(app_path), app_dir, app_entry)) {
            ESP_LOGW(TAG, "app entry path is too long: %s", entry->d_name);
            continue;
        }
        if (stat(app_path, &st) != 0 || !S_ISREG(st.st_mode)) {
            ESP_LOGW(TAG, "skip app entry that is missing: %s/%s", entry->d_name, app_entry);
            continue;
        }

        result->app_count++;
        if (result->stored_app_count < VB_APP_REGISTRY_MAX_APPS) {
            vb_app_registry_entry_t *app = &result->apps[result->stored_app_count++];
            strlcpy(app->id, entry->d_name, sizeof(app->id));
            strlcpy(app->name, app_name, sizeof(app->name));
            strlcpy(app->entry, app_entry, sizeof(app->entry));
            strlcpy(app->dir, app_dir, sizeof(app->dir));
            strlcpy(app->path, app_path, sizeof(app->path));

            char manifest_path[VB_APP_PATH_MAX] = {0};
            if (build_path(manifest_path, sizeof(manifest_path), app_dir, "manifest.json")) {
                read_app_manifest(manifest_path, app);
            }
        }

        if (result->app_count == 1) {
            strlcpy(result->first_app_name, app_name, sizeof(result->first_app_name));
            strlcpy(result->first_app_entry, app_entry, sizeof(result->first_app_entry));
            strlcpy(result->first_app_dir, app_dir, sizeof(result->first_app_dir));
            strlcpy(result->first_app_path, app_path, sizeof(result->first_app_path));
            if (result->first_app_entry[0] == '\0') {
                strcpy(result->first_app_entry, "main.lua");
            }
        }
    }

    closedir(dir);
    ESP_LOGI(TAG, "found %d apps", result->app_count);
    vb_app_registry_unlock();
    return ESP_OK;
}
