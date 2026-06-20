#include "native_module_loader.h"

#include <errno.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#include "module_abi.h"

static const char *const VB_NATIVE_MODULE_ERROR_LOAD_FAILED = "Native module load failed";
static const char *const VB_NATIVE_MODULE_ERROR_SYMBOL_MISSING = "Native module symbol missing";
static const char *const VB_NATIVE_MODULE_ERROR_ABI_MISMATCH = "Native module ABI mismatch";
static const char *const VB_NATIVE_MODULE_ERROR_HOST_API_UNSUPPORTED = "Native module host API unsupported";
#define VB_NATIVE_MODULE_REQUIRED_SYMBOL "vb_native_module_init"
#define VB_NATIVE_MODULE_HOST_API_VERSION "vibeboard-native-host@1"
#define VB_NATIVE_MODULE_MANIFEST_MAX_BYTES 512

static bool parse_manifest_line(vb_native_module_manifest_t *manifest, char *line)
{
    if (manifest == NULL || line == NULL || line[0] == '\0' || line[0] == '#') {
        return true;
    }

    char *equals = strchr(line, '=');
    if (equals == NULL) {
        return false;
    }

    *equals = '\0';
    char *key = line;
    char *value = equals + 1;
    while (*key == ' ' || *key == '\t') {
        key++;
    }
    while (*value == ' ' || *value == '\t') {
        value++;
    }

    char *key_end = key + strlen(key);
    while (key_end > key && (key_end[-1] == ' ' || key_end[-1] == '\t')) {
        *--key_end = '\0';
    }

    char *value_end = value + strlen(value);
    while (value_end > value &&
           (value_end[-1] == ' ' || value_end[-1] == '\t' || value_end[-1] == '\r' || value_end[-1] == '\n')) {
        *--value_end = '\0';
    }

    if (strcmp(key, "magic") == 0) {
        strlcpy(manifest->magic, value, sizeof(manifest->magic));
    } else if (strcmp(key, "abi") == 0) {
        strlcpy(manifest->abi, value, sizeof(manifest->abi));
    } else if (strcmp(key, "symbol") == 0) {
        strlcpy(manifest->symbol, value, sizeof(manifest->symbol));
    } else if (strcmp(key, "min_host") == 0) {
        strlcpy(manifest->min_host, value, sizeof(manifest->min_host));
    }
    return true;
}

static esp_err_t read_native_manifest(const char *module_path,
                                      vb_native_module_manifest_t *manifest,
                                      char *error,
                                      size_t error_size)
{
    FILE *file = fopen(module_path, "rb");
    if (file == NULL) {
        snprintf(error, error_size, "%s: %s errno=%d", VB_NATIVE_MODULE_ERROR_LOAD_FAILED, module_path, errno);
        return ESP_ERR_NOT_FOUND;
    }

    char buffer[VB_NATIVE_MODULE_MANIFEST_MAX_BYTES + 1];
    size_t read = fread(buffer, 1, VB_NATIVE_MODULE_MANIFEST_MAX_BYTES, file);
    bool failed = ferror(file);
    fclose(file);
    if (failed) {
        snprintf(error, error_size, "%s: manifest read failed", VB_NATIVE_MODULE_ERROR_LOAD_FAILED);
        return ESP_FAIL;
    }
    buffer[read] = '\0';

    memset(manifest, 0, sizeof(*manifest));
    char *cursor = buffer;
    while (cursor != NULL && *cursor != '\0') {
        char *line = cursor;
        char *next = strchr(cursor, '\n');
        if (next != NULL) {
            *next = '\0';
            cursor = next + 1;
        } else {
            cursor = NULL;
        }
        if (!parse_manifest_line(manifest, line)) {
            snprintf(error, error_size, "%s: malformed manifest", VB_NATIVE_MODULE_ERROR_LOAD_FAILED);
            return ESP_ERR_INVALID_ARG;
        }
    }

    if (strcmp(manifest->magic, VB_NATIVE_MODULE_MANIFEST_MAGIC) != 0) {
        snprintf(error, error_size, "%s: magic", VB_NATIVE_MODULE_ERROR_LOAD_FAILED);
        return ESP_ERR_INVALID_ARG;
    }
    if (strcmp(manifest->abi, VB_NATIVE_MODULE_ABI_VERSION) != 0) {
        snprintf(error, error_size, "%s: %s", VB_NATIVE_MODULE_ERROR_ABI_MISMATCH, manifest->abi);
        return ESP_ERR_NOT_SUPPORTED;
    }
    if (strcmp(manifest->symbol, VB_NATIVE_MODULE_REQUIRED_SYMBOL) != 0) {
        snprintf(error, error_size, "%s: %s", VB_NATIVE_MODULE_ERROR_SYMBOL_MISSING, manifest->symbol);
        return ESP_ERR_NOT_FOUND;
    }
    if (manifest->min_host[0] != '\0' && strcmp(manifest->min_host, VB_NATIVE_MODULE_HOST_API_VERSION) != 0) {
        snprintf(error, error_size, "%s: %s", VB_NATIVE_MODULE_ERROR_HOST_API_UNSUPPORTED, manifest->min_host);
        return ESP_ERR_NOT_SUPPORTED;
    }

    return ESP_OK;
}

static bool is_supported_module_name(const char *module_name)
{
    return module_name != NULL && strcmp(module_name, "nes") == 0;
}

esp_err_t vb_native_module_load(const char *module_name,
                                const char *module_path,
                                vb_native_module_result_t *result)
{
    if (result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    memset(result, 0, sizeof(*result));

    if (!is_supported_module_name(module_name)) {
        snprintf(result->error, sizeof(result->error), "%s: module name", VB_NATIVE_MODULE_ERROR_HOST_API_UNSUPPORTED);
        result->status = ESP_ERR_NOT_SUPPORTED;
        return result->status;
    }

    result->kind = VB_NATIVE_MODULE_KIND_NES;

    struct stat st;
    if (module_path == NULL || stat(module_path, &st) != 0) {
        snprintf(result->error,
                 sizeof(result->error),
                 "%s: %s errno=%d",
                 VB_NATIVE_MODULE_ERROR_LOAD_FAILED,
                 module_path ? module_path : "(null)",
                 errno);
        result->status = ESP_ERR_NOT_FOUND;
        return result->status;
    }

    if ((st.st_mode & S_IFREG) == 0) {
        snprintf(result->error, sizeof(result->error), "%s: %s is not a file", VB_NATIVE_MODULE_ERROR_LOAD_FAILED, module_path);
        result->status = ESP_ERR_INVALID_ARG;
        return result->status;
    }

    /*
     * This manifest-first slice validates the native payload contract without
     * executing module code. The later ELF/native adapter will continue after
     * these checks and call VB_NATIVE_MODULE_REQUIRED_SYMBOL.
     *
     * Expected manifest:
     * magic = VBNM
     * abi = vibeboard-native-module-abi@1
     * symbol = vb_native_module_init
     * min_host = vibeboard-native-host@1
     */
    vb_native_module_manifest_t manifest;
    esp_err_t manifest_err = read_native_manifest(module_path, &manifest, result->error, sizeof(result->error));
    if (manifest_err != ESP_OK) {
        result->status = manifest_err;
        return result->status;
    }

    snprintf(result->error, sizeof(result->error), "%s: native executor pending", VB_NATIVE_MODULE_ERROR_LOAD_FAILED);
    result->status = ESP_ERR_NOT_FOUND;
    return result->status;
}
