#include "app_registry.h"

#include <dirent.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include "esp_log.h"

static const char *TAG = "app_registry";

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

static bool read_app_name(const char *info_path, char *name, size_t name_size)
{
    FILE *file = fopen(info_path, "r");
    if (file == NULL) {
        return false;
    }

    char line[128];
    bool found = false;
    while (fgets(line, sizeof(line), file) != NULL) {
        if (strncmp(line, "name", 4) != 0) {
            continue;
        }

        char *equals = strchr(line, '=');
        if (equals == NULL) {
            continue;
        }

        char *value = equals + 1;
        while (*value == ' ' || *value == '\t') {
            value++;
        }

        size_t len = strcspn(value, "\r\n");
        if (len >= name_size) {
            len = name_size - 1;
        }
        memcpy(name, value, len);
        name[len] = '\0';
        found = true;
        break;
    }

    fclose(file);
    return found;
}

esp_err_t vb_app_registry_scan(vb_app_registry_result_t *result)
{
    if (result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    memset(result, 0, sizeof(*result));
    strcpy(result->first_app_name, "-");

    DIR *dir = opendir(VB_APPS_PATH);
    if (dir == NULL) {
        ESP_LOGW(TAG, "apps directory not found: %s", VB_APPS_PATH);
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

        result->app_count++;
        if (result->app_count == 1) {
            if (!read_app_name(info_path, result->first_app_name, sizeof(result->first_app_name))) {
                strlcpy(result->first_app_name, entry->d_name, sizeof(result->first_app_name));
            }
        }
    }

    closedir(dir);
    ESP_LOGI(TAG, "found %d apps", result->app_count);
    return ESP_OK;
}
