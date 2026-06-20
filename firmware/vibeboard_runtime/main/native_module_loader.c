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
     * First slice only defines the contract and precise error boundary. The
     * NES core will later provide a linked registration symbol that is checked
     * against VB_NATIVE_MODULE_ABI_VERSION before its Lua table is returned.
     */
    (void)VB_NATIVE_MODULE_ABI_VERSION;
    (void)VB_NATIVE_MODULE_ERROR_ABI_MISMATCH;
    snprintf(result->error, sizeof(result->error), "%s: vb_native_module_init", VB_NATIVE_MODULE_ERROR_SYMBOL_MISSING);
    result->status = ESP_ERR_NOT_FOUND;
    return result->status;
}
