#pragma once

#include <stdbool.h>

#include "app_registry.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    bool ran;
    esp_err_t error;
    char message[128];
} vb_app_runner_result_t;

esp_err_t vb_app_runner_run(const vb_app_registry_result_t *app, vb_app_runner_result_t *result);
esp_err_t vb_app_runner_run_entry(const vb_app_registry_entry_t *entry, vb_app_runner_result_t *result);
esp_err_t vb_app_runner_launch_async(const vb_app_registry_entry_t *entry);

#ifdef __cplusplus
}
#endif
