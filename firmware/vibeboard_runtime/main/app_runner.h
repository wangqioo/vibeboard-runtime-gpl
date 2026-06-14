#pragma once

#include <stdbool.h>
#include <stdint.h>

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

typedef enum {
    VB_APP_RUNNER_STATE_IDLE = 0,
    VB_APP_RUNNER_STATE_STARTING,
    VB_APP_RUNNER_STATE_RUNNING,
    VB_APP_RUNNER_STATE_STOPPING,
    VB_APP_RUNNER_STATE_FAILED,
} vb_app_runner_lifecycle_state_t;

esp_err_t vb_app_runner_run(const vb_app_registry_result_t *app, vb_app_runner_result_t *result);
esp_err_t vb_app_runner_run_entry(const vb_app_registry_entry_t *entry, vb_app_runner_result_t *result);
esp_err_t vb_app_runner_launch_async(const vb_app_registry_entry_t *entry);
esp_err_t vb_app_runner_stop(void);
esp_err_t vb_app_runner_wait_stopped(uint32_t timeout_ms);
bool vb_app_runner_is_running(void);
const char *vb_app_runner_current_id(void);
vb_app_runner_lifecycle_state_t vb_app_runner_current_state(void);
const char *vb_app_runner_state_name(vb_app_runner_lifecycle_state_t state);
const char *vb_app_runner_current_state_name(void);
esp_err_t vb_app_runner_last_status(void);
const char *vb_app_runner_last_message(void);

#ifdef __cplusplus
}
#endif
