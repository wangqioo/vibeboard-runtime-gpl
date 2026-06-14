#include "app_runner.h"

#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lua_file.h"
#include "lua_http.h"
#include "lua_lvgl.h"
#include "lua_sjson.h"
#include "lua_time.h"
#include "lua_tmr.h"
#include "lua_wifi.h"
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"

static const char *TAG = "app_runner";
#define VB_LUA_TASK_STACK_SIZE (32 * 1024)
#define VB_LUA_TASK_PRIORITY 5

typedef struct {
    volatile vb_app_runner_lifecycle_state_t lifecycle_state;
    volatile bool stop_requested;
    char current_id[VB_APP_NAME_MAX];
    char current_name[VB_APP_NAME_MAX];
    esp_err_t last_status;
    char last_message[128];
} vb_app_runner_state_t;

static vb_app_runner_state_t s_runner_state;

typedef struct {
    vb_lua_tmr_state_t tmr;
} vb_lua_runtime_t;

static void set_lifecycle_state(vb_app_runner_lifecycle_state_t state)
{
    s_runner_state.lifecycle_state = state;
}

static void finish_lifecycle_state(esp_err_t status, bool was_stop_requested)
{
    if (status == ESP_OK || was_stop_requested) {
        set_lifecycle_state(VB_APP_RUNNER_STATE_IDLE);
    } else {
        set_lifecycle_state(VB_APP_RUNNER_STATE_FAILED);
    }
}

const char *vb_app_runner_state_name(vb_app_runner_lifecycle_state_t state)
{
    switch (state) {
    case VB_APP_RUNNER_STATE_IDLE:
        return "idle";
    case VB_APP_RUNNER_STATE_STARTING:
        return "starting";
    case VB_APP_RUNNER_STATE_RUNNING:
        return "running";
    case VB_APP_RUNNER_STATE_STOPPING:
        return "stopping";
    case VB_APP_RUNNER_STATE_FAILED:
        return "failed";
    default:
        return "unknown";
    }
}

static int vb_lua_print(lua_State *L)
{
    int argc = lua_gettop(L);
    char line[192] = {0};
    size_t used = 0;

    for (int i = 1; i <= argc; i++) {
        size_t len = 0;
        const char *text = luaL_tolstring(L, i, &len);
        if (i > 1 && used + 1 < sizeof(line)) {
            line[used++] = '\t';
        }
        if (text != NULL && used + 1 < sizeof(line)) {
            size_t remaining = sizeof(line) - used - 1;
            if (len > remaining) {
                len = remaining;
            }
            memcpy(line + used, text, len);
            used += len;
            line[used] = '\0';
        }
        lua_pop(L, 1);
    }

    ESP_LOGI(TAG, "%s", line);
    return 0;
}

static void set_result(vb_app_runner_result_t *result, bool ran, esp_err_t error, const char *message)
{
    if (result == NULL) {
        return;
    }
    result->ran = ran;
    result->error = error;
    strlcpy(result->message, message ? message : "", sizeof(result->message));
}

typedef struct {
    const vb_app_registry_result_t *app;
    vb_app_runner_result_t *result;
    esp_err_t status;
    TaskHandle_t caller;
} vb_lua_task_context_t;

typedef struct {
    vb_app_registry_result_t app;
    vb_app_runner_result_t result;
} vb_lua_async_context_t;

static void entry_to_registry(const vb_app_registry_entry_t *entry, vb_app_registry_result_t *app)
{
    memset(app, 0, sizeof(*app));
    app->app_count = 1;
    app->stored_app_count = 1;
    app->apps[0] = *entry;
    strlcpy(app->first_app_name, entry->name[0] ? entry->name : entry->id, sizeof(app->first_app_name));
    strlcpy(app->first_app_entry, entry->entry, sizeof(app->first_app_entry));
    strlcpy(app->first_app_dir, entry->dir, sizeof(app->first_app_dir));
    strlcpy(app->first_app_path, entry->path, sizeof(app->first_app_path));
}

static esp_err_t run_lua_file(const vb_app_registry_result_t *app, vb_app_runner_result_t *result)
{
    ESP_LOGI(TAG, "Lua app start: %s", app->first_app_name);
    lua_State *L = luaL_newstate();
    if (L == NULL) {
        set_result(result, false, ESP_ERR_NO_MEM, "lua alloc failed");
        return ESP_ERR_NO_MEM;
    }

    luaL_openlibs(L);
    vb_lua_runtime_t runtime = {0};
    vb_lua_tmr_init(&runtime.tmr);
    vb_lua_tmr_set_stop_flag(&runtime.tmr, &s_runner_state.stop_requested);

    lua_pushcfunction(L, vb_lua_print);
    lua_setglobal(L, "print");
    vb_lua_tmr_register(L, &runtime.tmr);
    vb_lua_file_register(L, app);
    vb_lua_wifi_register(L);
    vb_lua_http_register(L);
    vb_lua_sjson_register(L);
    vb_lua_time_register(L);
    vb_lua_lvgl_set_app_dir(app->first_app_dir);
    vb_lua_lvgl_register(L);

    int lua_err = luaL_dofile(L, app->first_app_path);
    if (lua_err != LUA_OK) {
        const char *err = lua_tostring(L, -1);
        ESP_LOGE(TAG, "Lua app failed: %s", err ? err : "unknown error");
        set_result(result, true, ESP_FAIL, err ? err : "lua failed");
        vb_lua_tmr_cleanup(L, &runtime.tmr);
        lua_close(L);
        return ESP_FAIL;
    }

    char loop_error[128] = {0};
    esp_err_t loop_err = vb_lua_tmr_run_loop(L, &runtime.tmr, loop_error, sizeof(loop_error));
    if (loop_err != ESP_OK) {
        set_result(result, true, loop_err, loop_error[0] ? loop_error : "lua timer failed");
        vb_lua_tmr_cleanup(L, &runtime.tmr);
        lua_close(L);
        return loop_err;
    }

    ESP_LOGI(TAG, "Lua app ok");
    set_result(result, true, ESP_OK, "ok");
    vb_lua_tmr_cleanup(L, &runtime.tmr);
    lua_close(L);
    return ESP_OK;
}

static void lua_task(void *arg)
{
    vb_lua_task_context_t *context = (vb_lua_task_context_t *)arg;
    set_lifecycle_state(VB_APP_RUNNER_STATE_RUNNING);
    context->status = run_lua_file(context->app, context->result);
    bool was_stop_requested = s_runner_state.stop_requested;
    finish_lifecycle_state(context->status, was_stop_requested);
    xTaskNotifyGive(context->caller);
    vTaskDelete(NULL);
}

static void lua_async_task(void *arg)
{
    vb_lua_async_context_t *context = (vb_lua_async_context_t *)arg;
    set_lifecycle_state(VB_APP_RUNNER_STATE_RUNNING);
    esp_err_t status = run_lua_file(&context->app, &context->result);
    bool was_stop_requested = s_runner_state.stop_requested;
    s_runner_state.last_status = status;
    strlcpy(s_runner_state.last_message,
            context->result.message[0] ? context->result.message : esp_err_to_name(status),
            sizeof(s_runner_state.last_message));
    ESP_LOGI(TAG,
             "Lua async finished: %s status=%s message=%s",
             context->app.first_app_name,
             esp_err_to_name(status),
             context->result.message);
    s_runner_state.stop_requested = false;
    finish_lifecycle_state(status, was_stop_requested);
    s_runner_state.current_id[0] = '\0';
    s_runner_state.current_name[0] = '\0';
    free(context);
    vTaskDelete(NULL);
}

esp_err_t vb_app_runner_run(const vb_app_registry_result_t *app, vb_app_runner_result_t *result)
{
    if (app == NULL || result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    memset(result, 0, sizeof(*result));
    if (app->app_count <= 0 || app->first_app_path[0] == '\0') {
        set_result(result, false, ESP_ERR_NOT_FOUND, "no app");
        return ESP_ERR_NOT_FOUND;
    }

    vb_lua_task_context_t context = {
        .app = app,
        .result = result,
        .status = ESP_FAIL,
        .caller = xTaskGetCurrentTaskHandle(),
    };

    BaseType_t created = xTaskCreatePinnedToCore(lua_task,
                                                 "vb_lua",
                                                 VB_LUA_TASK_STACK_SIZE,
                                                 &context,
                                                 VB_LUA_TASK_PRIORITY,
                                                 NULL,
                                                 tskNO_AFFINITY);
    if (created != pdPASS) {
        set_result(result, false, ESP_ERR_NO_MEM, "lua task failed");
        return ESP_ERR_NO_MEM;
    }

    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    return context.status;
}

esp_err_t vb_app_runner_run_entry(const vb_app_registry_entry_t *entry, vb_app_runner_result_t *result)
{
    if (entry == NULL || result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    vb_app_registry_result_t app;
    entry_to_registry(entry, &app);
    return vb_app_runner_run(&app, result);
}

esp_err_t vb_app_runner_launch_async(const vb_app_registry_entry_t *entry)
{
    if (entry == NULL || entry->path[0] == '\0') {
        return ESP_ERR_INVALID_ARG;
    }
    if (vb_app_runner_is_running()) {
        return ESP_ERR_INVALID_STATE;
    }

    vb_lua_async_context_t *context = (vb_lua_async_context_t *)calloc(1, sizeof(*context));
    if (context == NULL) {
        return ESP_ERR_NO_MEM;
    }
    entry_to_registry(entry, &context->app);

    strlcpy(s_runner_state.current_id, entry->id, sizeof(s_runner_state.current_id));
    strlcpy(s_runner_state.current_name, entry->name[0] ? entry->name : entry->id, sizeof(s_runner_state.current_name));
    s_runner_state.stop_requested = false;
    set_lifecycle_state(VB_APP_RUNNER_STATE_STARTING);
    s_runner_state.last_status = ESP_OK;
    strlcpy(s_runner_state.last_message, "", sizeof(s_runner_state.last_message));
    BaseType_t created = xTaskCreatePinnedToCore(lua_async_task,
                                                 "vb_lua_launch",
                                                 VB_LUA_TASK_STACK_SIZE,
                                                 context,
                                                 VB_LUA_TASK_PRIORITY,
                                                 NULL,
                                                 tskNO_AFFINITY);
    if (created != pdPASS) {
        set_lifecycle_state(VB_APP_RUNNER_STATE_FAILED);
        s_runner_state.current_id[0] = '\0';
        s_runner_state.current_name[0] = '\0';
        s_runner_state.last_status = ESP_ERR_NO_MEM;
        strlcpy(s_runner_state.last_message, esp_err_to_name(ESP_ERR_NO_MEM), sizeof(s_runner_state.last_message));
        free(context);
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "Lua async launch: %s", context->app.first_app_name);
    return ESP_OK;
}

esp_err_t vb_app_runner_stop(void)
{
    if (!vb_app_runner_is_running()) {
        return ESP_ERR_NOT_FOUND;
    }
    ESP_LOGI(TAG, "Lua stop requested: %s", s_runner_state.current_name);
    s_runner_state.stop_requested = true;
    set_lifecycle_state(VB_APP_RUNNER_STATE_STOPPING);
    return ESP_OK;
}

esp_err_t vb_app_runner_wait_stopped(uint32_t timeout_ms)
{
    TickType_t start = xTaskGetTickCount();
    TickType_t timeout_ticks = pdMS_TO_TICKS(timeout_ms);
    while (vb_app_runner_is_running()) {
        if (timeout_ms > 0 && (xTaskGetTickCount() - start) >= timeout_ticks) {
            return ESP_ERR_TIMEOUT;
        }
        vTaskDelay(pdMS_TO_TICKS(20));
    }
    return ESP_OK;
}

bool vb_app_runner_is_running(void)
{
    return s_runner_state.lifecycle_state == VB_APP_RUNNER_STATE_STARTING ||
           s_runner_state.lifecycle_state == VB_APP_RUNNER_STATE_RUNNING ||
           s_runner_state.lifecycle_state == VB_APP_RUNNER_STATE_STOPPING;
}

const char *vb_app_runner_current_id(void)
{
    return s_runner_state.current_id;
}

vb_app_runner_lifecycle_state_t vb_app_runner_current_state(void)
{
    return s_runner_state.lifecycle_state;
}

const char *vb_app_runner_current_state_name(void)
{
    return vb_app_runner_state_name(vb_app_runner_current_state());
}

esp_err_t vb_app_runner_last_status(void)
{
    return s_runner_state.last_status;
}

const char *vb_app_runner_last_message(void)
{
    return s_runner_state.last_message;
}
