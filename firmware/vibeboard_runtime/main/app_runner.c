#include "app_runner.h"

#include <errno.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/portmacro.h"
#include "freertos/task.h"
#include "board_lckfb_szpi_s3.h"
#include "lua_app.h"
#include "lua_file.h"
#include "lua_gamepad.h"
#include "lua_http.h"
#include "lua_i2s.h"
#include "lua_key.h"
#include "lua_lvgl.h"
#include "lua_native_module.h"
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
#define VB_LUA_SCRIPT_READ_CHUNK 512

typedef struct {
    volatile vb_app_runner_lifecycle_state_t lifecycle_state;
    volatile bool stop_requested;
    char current_id[VB_APP_NAME_MAX];
    char current_name[VB_APP_NAME_MAX];
    esp_err_t last_status;
    char last_message[128];
} vb_app_runner_state_t;

static vb_app_runner_state_t s_runner_state;
static portMUX_TYPE s_runner_state_mux = portMUX_INITIALIZER_UNLOCKED;

typedef struct {
    vb_lua_app_state_t app;
    vb_lua_key_state_t key;
    vb_lua_tmr_state_t tmr;
} vb_lua_runtime_t;

typedef struct {
    FILE *file;
    char *buffer;
    char error[96];
} vb_lua_script_reader_t;

static bool runner_state_is_active(vb_app_runner_lifecycle_state_t state)
{
    return state == VB_APP_RUNNER_STATE_STARTING ||
           state == VB_APP_RUNNER_STATE_RUNNING ||
           state == VB_APP_RUNNER_STATE_STOPPING;
}

static void set_running_if_starting(void)
{
    taskENTER_CRITICAL(&s_runner_state_mux);
    if (s_runner_state.lifecycle_state == VB_APP_RUNNER_STATE_STARTING) {
        s_runner_state.lifecycle_state = VB_APP_RUNNER_STATE_RUNNING;
    }
    taskEXIT_CRITICAL(&s_runner_state_mux);
}

static esp_err_t reserve_runner_start(const char *id, const char *name)
{
    taskENTER_CRITICAL(&s_runner_state_mux);
    if (runner_state_is_active(s_runner_state.lifecycle_state)) {
        taskEXIT_CRITICAL(&s_runner_state_mux);
        return ESP_ERR_INVALID_STATE;
    }

    strlcpy(s_runner_state.current_id, id ? id : "", sizeof(s_runner_state.current_id));
    strlcpy(s_runner_state.current_name, name ? name : id ? id : "", sizeof(s_runner_state.current_name));
    s_runner_state.stop_requested = false;
    s_runner_state.lifecycle_state = VB_APP_RUNNER_STATE_STARTING;
    s_runner_state.last_status = ESP_OK;
    strlcpy(s_runner_state.last_message, "", sizeof(s_runner_state.last_message));
    taskEXIT_CRITICAL(&s_runner_state_mux);
    return ESP_OK;
}

static void fail_reserved_start(esp_err_t status)
{
    const char *message = esp_err_to_name(status);
    taskENTER_CRITICAL(&s_runner_state_mux);
    s_runner_state.lifecycle_state = VB_APP_RUNNER_STATE_FAILED;
    s_runner_state.stop_requested = false;
    s_runner_state.current_id[0] = '\0';
    s_runner_state.current_name[0] = '\0';
    s_runner_state.last_status = status;
    strlcpy(s_runner_state.last_message, message, sizeof(s_runner_state.last_message));
    taskEXIT_CRITICAL(&s_runner_state_mux);
}

static bool finish_runner_from_task(esp_err_t status, const char *message)
{
    bool was_stop_requested;
    taskENTER_CRITICAL(&s_runner_state_mux);
    was_stop_requested = s_runner_state.stop_requested;
    s_runner_state.last_status = status;
    strlcpy(s_runner_state.last_message, message ? message : esp_err_to_name(status), sizeof(s_runner_state.last_message));
    s_runner_state.stop_requested = false;
    if (status == ESP_OK || was_stop_requested) {
        s_runner_state.lifecycle_state = VB_APP_RUNNER_STATE_IDLE;
    } else {
        s_runner_state.lifecycle_state = VB_APP_RUNNER_STATE_FAILED;
    }
    s_runner_state.current_id[0] = '\0';
    s_runner_state.current_name[0] = '\0';
    taskEXIT_CRITICAL(&s_runner_state_mux);
    return was_stop_requested;
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

static int vb_lua_key_poll(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, "vb_runner_key_state");
    vb_lua_key_state_t *key = (vb_lua_key_state_t *)lua_touserdata(L, -1);
    lua_pop(L, 1);
    return vb_lua_key_process_pending(L, key);
}

static esp_err_t install_key_poll_timer(lua_State *L)
{
    lua_getglobal(L, "tmr");
    lua_getfield(L, -1, "create");
    lua_remove(L, -2); /* tmr */
    lua_call(L, 0, 1);

    lua_pushvalue(L, -1);
    lua_setfield(L, LUA_REGISTRYINDEX, "vb_runner_key_timer");

    lua_getfield(L, -1, "alarm");
    lua_pushvalue(L, -2);
    lua_pushinteger(L, 20);
    lua_getglobal(L, "tmr");
    lua_getfield(L, -1, "ALARM_AUTO");
    lua_remove(L, -2); /* tmr */
    lua_pushcfunction(L, vb_lua_key_poll);
    if (lua_pcall(L, 4, 1, 0) != LUA_OK) {
        lua_remove(L, -2); /* timer */
        return ESP_FAIL;
    }
    lua_pop(L, 1);
    lua_pop(L, 1); /* timer */
    return ESP_OK;
}

static void runner_input_cb(int code, int event, int timestamp_ms, void *user_data)
{
    (void)vb_lua_key_enqueue((vb_lua_key_state_t *)user_data, code, event, timestamp_ms);
}

static void cleanup_lua_runtime(lua_State *L, vb_lua_runtime_t *runtime)
{
    vb_lua_app_dispatch_exit(L, &runtime->app);
    vb_board_input_stop();
    vb_lua_app_cleanup(L, &runtime->app);
    vb_lua_key_cleanup(L, &runtime->key);
    vb_lua_tmr_cleanup(L, &runtime->tmr);
}

static const char *lua_script_reader(lua_State *L, void *data, size_t *size)
{
    (void)L;
    vb_lua_script_reader_t *reader = (vb_lua_script_reader_t *)data;
    if (reader == NULL || reader->file == NULL || reader->buffer == NULL || size == NULL) {
        return NULL;
    }

    size_t read = fread(reader->buffer, 1, VB_LUA_SCRIPT_READ_CHUNK, reader->file);
    if (read > 0) {
        *size = read;
        return reader->buffer;
    }

    if (ferror(reader->file)) {
        snprintf(reader->error, sizeof(reader->error), "script read failed: errno=%d", errno);
    }
    return NULL;
}

static int load_lua_file(lua_State *L, const char *path)
{
    vb_lua_script_reader_t reader = {0};
    reader.buffer = (char *)heap_caps_malloc(VB_LUA_SCRIPT_READ_CHUNK, MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA | MALLOC_CAP_8BIT);
    if (reader.buffer == NULL) {
        lua_pushstring(L, "script read buffer alloc failed");
        return LUA_ERRMEM;
    }

    reader.file = fopen(path, "rb");
    if (reader.file == NULL) {
        int open_errno = errno;
        heap_caps_free(reader.buffer);
        lua_pushfstring(L, "cannot open %s: errno=%d", path, open_errno);
        return LUA_ERRFILE;
    }

    char chunk_name[VB_APP_PATH_MAX + 2];
    snprintf(chunk_name, sizeof(chunk_name), "@%s", path);
    int load_err = lua_load(L, lua_script_reader, &reader, chunk_name, NULL);
    fclose(reader.file);
    heap_caps_free(reader.buffer);

    if (reader.error[0] != '\0') {
        lua_pushstring(L, reader.error);
        return LUA_ERRFILE;
    }
    if (load_err != LUA_OK) {
        return load_err;
    }
    return lua_pcall(L, 0, 0, 0);
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

static esp_err_t run_lua_file(const vb_app_registry_result_t *app,
                              vb_app_runner_result_t *result,
                              vb_app_registry_entry_t *pending_launch)
{
    ESP_LOGI(TAG, "Lua app start: %s", app->first_app_name);
    lua_State *L = luaL_newstate();
    if (L == NULL) {
        set_result(result, false, ESP_ERR_NO_MEM, "lua alloc failed");
        return ESP_ERR_NO_MEM;
    }

    luaL_openlibs(L);
    vb_lua_runtime_t runtime = {0};
    vb_lua_app_init(&runtime.app);
    vb_lua_key_init(&runtime.key);
    vb_lua_tmr_init(&runtime.tmr);
    vb_lua_app_set_stop_flag(&runtime.app, &s_runner_state.stop_requested);
    vb_lua_tmr_set_stop_flag(&runtime.tmr, &s_runner_state.stop_requested);

    lua_pushcfunction(L, vb_lua_print);
    lua_setglobal(L, "print");
    vb_lua_app_register(L, &runtime.app);
    vb_lua_tmr_register(L, &runtime.tmr);
    vb_lua_key_register(L, &runtime.key);
    vb_lua_gamepad_register(L);
    lua_pushlightuserdata(L, &runtime.key);
    lua_setfield(L, LUA_REGISTRYINDEX, "vb_runner_key_state");
    if (install_key_poll_timer(L) != ESP_OK) {
        const char *err = lua_tostring(L, -1);
        set_result(result, true, ESP_FAIL, err ? err : "key timer failed");
        cleanup_lua_runtime(L, &runtime);
        lua_close(L);
        return ESP_FAIL;
    }
    esp_err_t input_err = vb_board_input_start(runner_input_cb, &runtime.key);
    if (input_err != ESP_OK) {
        ESP_LOGW(TAG, "board input unavailable: %s", esp_err_to_name(input_err));
    }
    vb_lua_file_register(L, app);
    vb_lua_wifi_register(L);
    vb_lua_http_register(L);
    vb_lua_sjson_register(L);
    vb_lua_time_register(L);
    vb_lua_i2s_register(L);
    vb_lua_native_module_register(L, app);
    vb_lua_lvgl_set_app_dir(app->first_app_dir);
    vb_lua_lvgl_register(L);

    int lua_err = load_lua_file(L, app->first_app_path);
    if (lua_err != LUA_OK) {
        const char *err = lua_tostring(L, -1);
        ESP_LOGE(TAG, "Lua app failed: %s", err ? err : "unknown error");
        set_result(result, true, ESP_FAIL, err ? err : "lua failed");
        cleanup_lua_runtime(L, &runtime);
        lua_close(L);
        return ESP_FAIL;
    }

    char loop_error[128] = {0};
    esp_err_t loop_err = vb_lua_tmr_run_loop(L, &runtime.tmr, loop_error, sizeof(loop_error));
    if (loop_err != ESP_OK) {
        set_result(result, true, loop_err, loop_error[0] ? loop_error : "lua timer failed");
        if (pending_launch != NULL) {
            (void)vb_lua_app_take_pending_launch(&runtime.app, pending_launch);
        }
        cleanup_lua_runtime(L, &runtime);
        lua_close(L);
        return loop_err;
    }

    ESP_LOGI(TAG, "Lua app ok");
    set_result(result, true, ESP_OK, "ok");
    if (pending_launch != NULL) {
        (void)vb_lua_app_take_pending_launch(&runtime.app, pending_launch);
    }
    cleanup_lua_runtime(L, &runtime);
    lua_close(L);
    return ESP_OK;
}

static void lua_task(void *arg)
{
    vb_lua_task_context_t *context = (vb_lua_task_context_t *)arg;
    vb_app_registry_entry_t pending_launch = {0};
    set_running_if_starting();
    context->status = run_lua_file(context->app, context->result, &pending_launch);
    const char *message = context->result->message[0] ? context->result->message : esp_err_to_name(context->status);
    finish_runner_from_task(context->status, message);
    if (pending_launch.id[0] != '\0') {
        ESP_LOGI(TAG, "Lua app handoff: %s", pending_launch.id);
        esp_err_t launch_err = vb_app_runner_launch_async(&pending_launch);
        if (launch_err != ESP_OK) {
            ESP_LOGW(TAG, "Lua app handoff failed: %s", esp_err_to_name(launch_err));
        }
    }
    xTaskNotifyGive(context->caller);
    vTaskDelete(NULL);
}

static void lua_async_task(void *arg)
{
    vb_lua_async_context_t *context = (vb_lua_async_context_t *)arg;
    vb_app_registry_entry_t pending_launch = {0};
    set_running_if_starting();
    esp_err_t status = run_lua_file(&context->app, &context->result, &pending_launch);
    const char *message = context->result.message[0] ? context->result.message : esp_err_to_name(status);
    finish_runner_from_task(status, message);
    if (pending_launch.id[0] != '\0') {
        ESP_LOGI(TAG, "Lua app handoff: %s", pending_launch.id);
        esp_err_t launch_err = vb_app_runner_launch_async(&pending_launch);
        if (launch_err != ESP_OK) {
            ESP_LOGW(TAG, "Lua app handoff failed: %s", esp_err_to_name(launch_err));
        }
    }
    ESP_LOGI(TAG,
             "Lua async finished: %s status=%s message=%s",
             context->app.first_app_name,
             esp_err_to_name(status),
             context->result.message);
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
    esp_err_t err = reserve_runner_start(app->first_app_name, app->first_app_name);
    if (err != ESP_OK) {
        set_result(result, false, err, esp_err_to_name(err));
        return err;
    }

    vb_lua_task_context_t context = {
        .app = app,
        .result = result,
        .status = ESP_FAIL,
        .caller = xTaskGetCurrentTaskHandle(),
    };

    BaseType_t created = xTaskCreatePinnedToCoreWithCaps(lua_task,
                                                         "vb_lua",
                                                         VB_LUA_TASK_STACK_SIZE,
                                                         &context,
                                                         VB_LUA_TASK_PRIORITY,
                                                         NULL,
                                                         tskNO_AFFINITY,
                                                         MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (created != pdPASS) {
        fail_reserved_start(ESP_ERR_NO_MEM);
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
    return vb_app_runner_launch_async_with_options(entry, NULL);
}

esp_err_t vb_app_runner_launch_async_with_options(const vb_app_registry_entry_t *entry,
                                                  const vb_app_runner_launch_options_t *options)
{
    if (entry == NULL || entry->path[0] == '\0') {
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t err = reserve_runner_start(entry->id, entry->name[0] ? entry->name : entry->id);
    if (err != ESP_OK) {
        return err;
    }

    vb_lua_async_context_t *context = (vb_lua_async_context_t *)calloc(1, sizeof(*context));
    if (context == NULL) {
        fail_reserved_start(ESP_ERR_NO_MEM);
        return ESP_ERR_NO_MEM;
    }
    entry_to_registry(entry, &context->app);

    if (options != NULL && options->before_start != NULL) {
        options->before_start(options->user_data);
    }

    BaseType_t created = xTaskCreatePinnedToCoreWithCaps(lua_async_task,
                                                         "vb_lua_launch",
                                                         VB_LUA_TASK_STACK_SIZE,
                                                         context,
                                                         VB_LUA_TASK_PRIORITY,
                                                         NULL,
                                                         tskNO_AFFINITY,
                                                         MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (created != pdPASS) {
        fail_reserved_start(ESP_ERR_NO_MEM);
        free(context);
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "Lua async launch: %s", context->app.first_app_name);
    return ESP_OK;
}

esp_err_t vb_app_runner_stop(void)
{
    char current_name[VB_APP_NAME_MAX];
    taskENTER_CRITICAL(&s_runner_state_mux);
    if (!runner_state_is_active(s_runner_state.lifecycle_state)) {
        taskEXIT_CRITICAL(&s_runner_state_mux);
        return ESP_ERR_NOT_FOUND;
    }
    strlcpy(current_name, s_runner_state.current_name, sizeof(current_name));
    s_runner_state.stop_requested = true;
    s_runner_state.lifecycle_state = VB_APP_RUNNER_STATE_STOPPING;
    taskEXIT_CRITICAL(&s_runner_state_mux);
    ESP_LOGI(TAG, "Lua stop requested: %s", current_name);
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
    vb_app_runner_lifecycle_state_t state = vb_app_runner_current_state();
    return runner_state_is_active(state);
}

const char *vb_app_runner_current_id(void)
{
    static char current_id[VB_APP_NAME_MAX];
    taskENTER_CRITICAL(&s_runner_state_mux);
    strlcpy(current_id, s_runner_state.current_id, sizeof(current_id));
    taskEXIT_CRITICAL(&s_runner_state_mux);
    return current_id;
}

vb_app_runner_lifecycle_state_t vb_app_runner_current_state(void)
{
    vb_app_runner_lifecycle_state_t state;
    taskENTER_CRITICAL(&s_runner_state_mux);
    state = s_runner_state.lifecycle_state;
    taskEXIT_CRITICAL(&s_runner_state_mux);
    return state;
}

const char *vb_app_runner_current_state_name(void)
{
    return vb_app_runner_state_name(vb_app_runner_current_state());
}

esp_err_t vb_app_runner_last_status(void)
{
    esp_err_t status;
    taskENTER_CRITICAL(&s_runner_state_mux);
    status = s_runner_state.last_status;
    taskEXIT_CRITICAL(&s_runner_state_mux);
    return status;
}

const char *vb_app_runner_last_message(void)
{
    static char last_message[sizeof(s_runner_state.last_message)];
    taskENTER_CRITICAL(&s_runner_state_mux);
    strlcpy(last_message, s_runner_state.last_message, sizeof(last_message));
    taskEXIT_CRITICAL(&s_runner_state_mux);
    return last_message;
}
