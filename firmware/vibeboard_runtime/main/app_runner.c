#include "app_runner.h"

#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lua_lvgl.h"
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"

static const char *TAG = "app_runner";
#define VB_LUA_TASK_STACK_SIZE (32 * 1024)
#define VB_LUA_TASK_PRIORITY 5
#define VB_LUA_INTERVAL_MAX 4
#define VB_LUA_SMOKE_LOOP_TICKS 8

typedef struct {
    int callback_ref;
    int period_ms;
    TickType_t last_run;
} vb_lua_interval_t;

typedef struct {
    vb_lua_interval_t intervals[VB_LUA_INTERVAL_MAX];
    int interval_count;
} vb_lua_runtime_t;

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

static vb_lua_runtime_t *get_runtime(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, "vb_runtime");
    vb_lua_runtime_t *runtime = (vb_lua_runtime_t *)lua_touserdata(L, -1);
    lua_pop(L, 1);
    return runtime;
}

static int vb_lua_set_interval(lua_State *L)
{
    int period_ms = (int)luaL_checkinteger(L, 1);
    luaL_checktype(L, 2, LUA_TFUNCTION);

    vb_lua_runtime_t *runtime = get_runtime(L);
    if (runtime == NULL) {
        return luaL_error(L, "runtime unavailable");
    }
    if (runtime->interval_count >= VB_LUA_INTERVAL_MAX) {
        return luaL_error(L, "too many intervals");
    }
    if (period_ms < 10) {
        return luaL_error(L, "interval too small");
    }

    lua_pushvalue(L, 2);
    vb_lua_interval_t *interval = &runtime->intervals[runtime->interval_count];
    interval->callback_ref = luaL_ref(L, LUA_REGISTRYINDEX);
    interval->period_ms = period_ms;
    interval->last_run = xTaskGetTickCount();
    runtime->interval_count++;
    return 0;
}

static esp_err_t run_interval_loop(lua_State *L, vb_lua_runtime_t *runtime, vb_app_runner_result_t *result)
{
    if (runtime->interval_count <= 0) {
        return ESP_OK;
    }

    ESP_LOGI(TAG, "Lua interval loop start: %d timers", runtime->interval_count);
    for (int tick = 0; tick < VB_LUA_SMOKE_LOOP_TICKS; tick++) {
        vTaskDelay(pdMS_TO_TICKS(1000));
        TickType_t now = xTaskGetTickCount();

        for (int i = 0; i < runtime->interval_count; i++) {
            vb_lua_interval_t *interval = &runtime->intervals[i];
            if ((now - interval->last_run) < pdMS_TO_TICKS(interval->period_ms)) {
                continue;
            }

            lua_rawgeti(L, LUA_REGISTRYINDEX, interval->callback_ref);
            if (lua_pcall(L, 0, 0, 0) != LUA_OK) {
                const char *err = lua_tostring(L, -1);
                ESP_LOGE(TAG, "Lua interval failed: %s", err ? err : "unknown error");
                set_result(result, true, ESP_FAIL, err ? err : "lua interval failed");
                return ESP_FAIL;
            }
            interval->last_run = now;
        }
    }

    ESP_LOGI(TAG, "Lua interval loop done");
    return ESP_OK;
}

typedef struct {
    const vb_app_registry_result_t *app;
    vb_app_runner_result_t *result;
    esp_err_t status;
    TaskHandle_t caller;
} vb_lua_task_context_t;

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
    lua_pushlightuserdata(L, &runtime);
    lua_setfield(L, LUA_REGISTRYINDEX, "vb_runtime");

    lua_pushcfunction(L, vb_lua_print);
    lua_setglobal(L, "print");
    lua_pushcfunction(L, vb_lua_set_interval);
    lua_setglobal(L, "set_interval");
    vb_lua_lvgl_register(L);

    int lua_err = luaL_dofile(L, app->first_app_path);
    if (lua_err != LUA_OK) {
        const char *err = lua_tostring(L, -1);
        ESP_LOGE(TAG, "Lua app failed: %s", err ? err : "unknown error");
        set_result(result, true, ESP_FAIL, err ? err : "lua failed");
        lua_close(L);
        return ESP_FAIL;
    }

    esp_err_t loop_err = run_interval_loop(L, &runtime, result);
    if (loop_err != ESP_OK) {
        lua_close(L);
        return loop_err;
    }

    ESP_LOGI(TAG, "Lua app ok");
    set_result(result, true, ESP_OK, "ok");
    lua_close(L);
    return ESP_OK;
}

static void lua_task(void *arg)
{
    vb_lua_task_context_t *context = (vb_lua_task_context_t *)arg;
    context->status = run_lua_file(context->app, context->result);
    xTaskNotifyGive(context->caller);
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
