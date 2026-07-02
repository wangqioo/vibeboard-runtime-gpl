#include "app_runner.h"

#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/portmacro.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "board_lckfb_szpi_s3.h"
#include "lua_app.h"
#include "lua_camera.h"
#include "lua_file.h"
#include "lua_gamepad.h"
#include "lua_http.h"
#include "lua_imu.h"
#include "lua_i2s.h"
#include "lua_key.h"
#include "lua_lvgl.h"
#include "lua_native_module.h"
#include "lua_sjson.h"
#include "lua_sys.h"
#include "lua_time.h"
#include "lua_tmr.h"
#include "lua_touch.h"
#include "lua_wifi.h"
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"

static const char *TAG = "app_runner";
#define VB_LUA_TASK_STACK_SIZE (48 * 1024)
#define VB_LUA_TASK_PRIORITY 5

typedef struct {
    volatile vb_app_runner_lifecycle_state_t lifecycle_state;
    volatile bool stop_requested;
    char current_id[VB_APP_NAME_MAX];
    char current_name[VB_APP_NAME_MAX];
    esp_err_t last_status;
    char last_message[128];
} vb_app_runner_state_t;

typedef struct {
    lua_State *L;
    vb_lua_app_state_t app;
    vb_lua_key_state_t key;
    vb_lua_touch_state_t touch;
    vb_lua_gamepad_state_t gamepad;
    vb_lua_imu_state_t imu;
    vb_lua_camera_state_t camera;
    vb_lua_tmr_state_t tmr;
} vb_lua_runtime_t;

typedef struct {
    char path[128];
    char query[192];
    char method[8];
    char request_body[512];
    int status;
    char type[64];
    char body[512];
    esp_err_t result;
    SemaphoreHandle_t done;
    StaticSemaphore_t done_buffer;
    volatile bool timed_out;
} vb_webui_request_t;

typedef struct {
    char *data;
    size_t size;
} vb_lua_script_t;

static vb_app_runner_state_t s_runner_state;
static portMUX_TYPE s_runner_state_mux = portMUX_INITIALIZER_UNLOCKED;
static vb_lua_runtime_t *s_active_runtime;
static SemaphoreHandle_t s_script_reader_mutex;
static StaticSemaphore_t s_script_reader_mutex_buffer;
static QueueHandle_t s_webui_queue;
static StaticQueue_t s_webui_queue_buffer;
static uint8_t s_webui_queue_storage[sizeof(vb_webui_request_t *)];

static bool app_has_capability(const vb_app_registry_entry_t *entry, const char *capability)
{
    if (entry == NULL || capability == NULL || entry->capabilities[0] == '\0') {
        return false;
    }

    const char *cursor = entry->capabilities;
    const size_t capability_len = strlen(capability);
    while (*cursor != '\0') {
        while (*cursor == ' ' || *cursor == ',') {
            cursor++;
        }
        const char *start = cursor;
        while (*cursor != '\0' && *cursor != ',') {
            cursor++;
        }
        const char *end = cursor;
        while (end > start && end[-1] == ' ') {
            end--;
        }
        if ((size_t)(end - start) == capability_len && memcmp(start, capability, capability_len) == 0) {
            return true;
        }
    }
    return false;
}

static bool prewarm_camera_if_needed(const vb_app_registry_entry_t *entry)
{
    if (!app_has_capability(entry, "camera")) {
        return false;
    }
    if (strcmp(entry->id, "camera") == 0) {
        vb_board_camera_reserve_internal_dma(8192);
        return false;
    }

    ESP_LOGI(TAG, "starting camera preview before Lua task");
    esp_err_t err = vb_board_camera_preview_start();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "camera preview prestart failed: %s", esp_err_to_name(err));
        vb_board_camera_stop();
        return false;
    }
    return true;
}

static bool runner_state_is_active(vb_app_runner_lifecycle_state_t state)
{
    return state == VB_APP_RUNNER_STATE_STARTING ||
           state == VB_APP_RUNNER_STATE_RUNNING ||
           state == VB_APP_RUNNER_STATE_STOPPING;
}

static bool ensure_script_reader_mutex(void)
{
    if (s_script_reader_mutex != NULL) {
        return true;
    }

    s_script_reader_mutex = xSemaphoreCreateMutexStatic(&s_script_reader_mutex_buffer);
    return s_script_reader_mutex != NULL;
}

static bool ensure_webui_queue(void)
{
    if (s_webui_queue != NULL) {
        return true;
    }

    s_webui_queue = xQueueCreateStatic(1,
                                       sizeof(vb_webui_request_t *),
                                       s_webui_queue_storage,
                                       &s_webui_queue_buffer);
    return s_webui_queue != NULL;
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

esp_err_t vb_app_runner_enqueue_key(int code, int event)
{
    vb_lua_runtime_t *runtime = s_active_runtime;
    if (runtime == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    if ((code == VB_LUA_KEY_HOME || code == VB_LUA_KEY_EXIT) &&
        (event == VB_LUA_KEY_SHORT || event == VB_LUA_KEY_LONG_START) &&
        vb_lua_app_should_handle_home_exit(&runtime->app)) {
        s_runner_state.stop_requested = true;
    }
    return vb_lua_key_enqueue(&runtime->key, code, event, 0);
}

esp_err_t vb_app_runner_enqueue_gamepad(const vb_lua_gamepad_pending_state_t *state)
{
    vb_lua_runtime_t *runtime = s_active_runtime;
    if (runtime == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    return vb_lua_gamepad_enqueue(&runtime->gamepad, state);
}

esp_err_t vb_app_runner_dispatch_webui(const char *path,
                                       const char *query,
                                       const char *method,
                                       const char *request_body,
                                       int *status,
                                       char *type,
                                       size_t type_size,
                                       char *body,
                                       size_t body_size)
{
    vb_lua_runtime_t *runtime = s_active_runtime;
    if (runtime == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    lua_State *L = runtime->L;
    if (L == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    if (!ensure_webui_queue()) {
        return ESP_ERR_NO_MEM;
    }

    vb_webui_request_t *request = (vb_webui_request_t *)heap_caps_malloc(sizeof(vb_webui_request_t),
                                                                         MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (request == NULL) {
        request = (vb_webui_request_t *)heap_caps_malloc(sizeof(vb_webui_request_t), MALLOC_CAP_8BIT);
    }
    if (request == NULL) {
        return ESP_ERR_NO_MEM;
    }
    memset(request, 0, sizeof(*request));

    request->done = xSemaphoreCreateBinaryStatic(&request->done_buffer);
    if (request->done == NULL) {
        heap_caps_free(request);
        return ESP_ERR_NO_MEM;
    }

    strlcpy(request->path, path ? path : "", sizeof(request->path));
    strlcpy(request->query, query ? query : "", sizeof(request->query));
    strlcpy(request->method, method ? method : "GET", sizeof(request->method));
    strlcpy(request->request_body, request_body ? request_body : "", sizeof(request->request_body));
    request->result = ESP_ERR_TIMEOUT;

    vb_webui_request_t *request_ptr = request;
    if (xQueueSend(s_webui_queue, &request_ptr, pdMS_TO_TICKS(50)) != pdTRUE) {
        heap_caps_free(request);
        return ESP_ERR_TIMEOUT;
    }

    if (xSemaphoreTake(request->done, pdMS_TO_TICKS(3000)) != pdTRUE) {
        request->timed_out = true;
        return ESP_ERR_TIMEOUT;
    }

    if (status != NULL) {
        *status = request->status;
    }
    if (type != NULL && type_size > 0) {
        strlcpy(type, request->type, type_size);
    }
    if (body != NULL && body_size > 0) {
        strlcpy(body, request->body, body_size);
    }
    esp_err_t result = request->result;
    heap_caps_free(request);
    return result;
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

static int vb_lua_input_poll(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, "vb_runner_runtime");
    vb_lua_runtime_t *runtime = (vb_lua_runtime_t *)lua_touserdata(L, -1);
    lua_pop(L, 1);
    if (runtime == NULL) {
        return 0;
    }
    int key_result = vb_lua_key_process_pending(L, &runtime->key);
    if (key_result != 0) {
        return key_result;
    }
    int touch_result = vb_lua_touch_process_pending(L, &runtime->touch);
    if (touch_result != 0) {
        return touch_result;
    }
    int gamepad_result = vb_lua_gamepad_process_pending(L, &runtime->gamepad);
    if (gamepad_result != 0) {
        return gamepad_result;
    }
    return vb_lua_imu_process_pending(L, &runtime->imu);
}

static int vb_lua_runner_poll(lua_State *L, void *user_data)
{
    vb_lua_runtime_t *runtime = (vb_lua_runtime_t *)user_data;
    if (runtime == NULL) {
        return 0;
    }

    int input_result = vb_lua_input_poll(L);
    if (input_result != 0) {
        return input_result;
    }

    if (s_webui_queue == NULL) {
        return 0;
    }

    vb_webui_request_t *request = NULL;
    while (xQueueReceive(s_webui_queue, &request, 0) == pdTRUE) {
        if (request == NULL) {
            continue;
        }

        vb_lua_app_webui_response_t response;
        if (!vb_lua_app_dispatch_webui(L,
                                       &runtime->app,
                                       request->path,
                                       request->query,
                                       request->method,
                                       request->request_body,
                                       &response)) {
            request->result = ESP_ERR_NOT_FOUND;
        } else {
            request->result = ESP_OK;
            request->status = response.status;
            strlcpy(request->type, response.type, sizeof(request->type));
            strlcpy(request->body, response.body, sizeof(request->body));
        }

        bool timed_out = request->timed_out;
        if (timed_out) {
            heap_caps_free(request);
        } else if (request->done != NULL) {
            xSemaphoreGive(request->done);
        }
    }
    return 0;
}

static void runner_input_cb(int code, int event, int timestamp_ms, uint16_t x, uint16_t y, void *user_data)
{
    vb_lua_runtime_t *runtime = (vb_lua_runtime_t *)user_data;
    if (runtime == NULL) {
        return;
    }
    if (code != 0) {
        if ((code == VB_LUA_KEY_HOME || code == VB_LUA_KEY_EXIT) &&
            (event == VB_LUA_KEY_SHORT || event == VB_LUA_KEY_LONG_START) &&
            vb_lua_app_should_handle_home_exit(&runtime->app)) {
            s_runner_state.stop_requested = true;
        }
        (void)vb_lua_key_enqueue(&runtime->key, code, event, timestamp_ms);
        return;
    }
    int touch_event = event - 100;
    (void)vb_lua_touch_enqueue(&runtime->touch, touch_event, x, y, timestamp_ms);
}

static void cleanup_lua_runtime(lua_State *L, vb_lua_runtime_t *runtime)
{
    vb_lua_app_dispatch_exit(L, &runtime->app);
    vb_board_input_stop();
    if (s_active_runtime == runtime) {
        s_active_runtime = NULL;
    }
    vb_lua_app_cleanup(L, &runtime->app);
    vb_lua_key_cleanup(L, &runtime->key);
    vb_lua_touch_cleanup(L, &runtime->touch);
    vb_lua_gamepad_cleanup(L, &runtime->gamepad);
    vb_lua_imu_cleanup(L, &runtime->imu);
    vb_lua_camera_cleanup(L, &runtime->camera);
    vb_lua_tmr_cleanup(L, &runtime->tmr);
    vb_lua_native_module_cleanup(L);
}

static void free_lua_script(vb_lua_script_t *script)
{
    if (script == NULL) {
        return;
    }
    heap_caps_free(script->data);
    script->data = NULL;
    script->size = 0;
}

static esp_err_t preload_lua_file(const char *path, vb_lua_script_t *script, char *error, size_t error_size)
{
    if (!ensure_script_reader_mutex()) {
        strlcpy(error, "script read mutex alloc failed", error_size);
        return ESP_ERR_NO_MEM;
    }

    xSemaphoreTake(s_script_reader_mutex, portMAX_DELAY);

    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        snprintf(error, error_size, "cannot open %s", path ? path : "(null)");
        xSemaphoreGive(s_script_reader_mutex);
        return ESP_ERR_NOT_FOUND;
    }

    if (fseek(file, 0, SEEK_END) != 0) {
        fclose(file);
        xSemaphoreGive(s_script_reader_mutex);
        snprintf(error, error_size, "cannot seek %s", path);
        return ESP_FAIL;
    }

    long size = ftell(file);
    if (size <= 0) {
        fclose(file);
        xSemaphoreGive(s_script_reader_mutex);
        snprintf(error, error_size, "empty script: %s", path);
        return ESP_ERR_INVALID_SIZE;
    }
    if (fseek(file, 0, SEEK_SET) != 0) {
        fclose(file);
        xSemaphoreGive(s_script_reader_mutex);
        snprintf(error, error_size, "cannot rewind %s", path);
        return ESP_FAIL;
    }

    char *data = (char *)heap_caps_malloc((size_t)size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (data == NULL) {
        fclose(file);
        xSemaphoreGive(s_script_reader_mutex);
        strlcpy(error, "script buffer alloc failed", error_size);
        return ESP_ERR_NO_MEM;
    }

    size_t read = fread(data, 1, (size_t)size, file);
    fclose(file);
    xSemaphoreGive(s_script_reader_mutex);
    if (read != (size_t)size) {
        heap_caps_free(data);
        snprintf(error, error_size, "cannot read %s", path);
        return ESP_FAIL;
    }

    script->data = data;
    script->size = (size_t)size;
    return ESP_OK;
}

static int load_lua_script(lua_State *L, const char *path, const vb_lua_script_t *script)
{
    if (script == NULL || script->data == NULL || script->size == 0) {
        lua_pushfstring(L, "empty script: %s", path ? path : "(null)");
        return LUA_ERRSYNTAX;
    }
    char chunk_name[VB_APP_PATH_MAX + 2];
    snprintf(chunk_name, sizeof(chunk_name), "@%s", path);
    int load_err = luaL_loadbufferx(L, script->data, script->size, chunk_name, NULL);
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

static void *lua_psram_alloc(void *ud, void *ptr, size_t osize, size_t nsize)
{
    (void)ud;
    if (nsize == 0) {
        heap_caps_free(ptr);
        return NULL;
    }
    if (ptr == NULL) {
        return heap_caps_malloc(nsize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    }

    void *new_ptr = heap_caps_realloc(ptr, nsize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (new_ptr != NULL) {
        return new_ptr;
    }

    new_ptr = heap_caps_malloc(nsize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (new_ptr == NULL) {
        return NULL;
    }
    memcpy(new_ptr, ptr, osize < nsize ? osize : nsize);
    heap_caps_free(ptr);
    return new_ptr;
}

typedef struct {
    const vb_app_registry_result_t *app;
    vb_lua_script_t script;
    vb_app_runner_result_t *result;
    esp_err_t status;
    TaskHandle_t caller;
} vb_lua_task_context_t;

typedef struct {
    vb_app_registry_result_t registry;
    vb_lua_script_t script;
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
                              const vb_lua_script_t *script,
                              vb_app_runner_result_t *result,
                              vb_app_registry_entry_t *pending_launch)
{
    ESP_LOGI(TAG, "Lua app start: %s", app->first_app_name);
    lua_State *L = lua_newstate(lua_psram_alloc, NULL, 0);
    if (L == NULL) {
        set_result(result, false, ESP_ERR_NO_MEM, "lua alloc failed");
        return ESP_ERR_NO_MEM;
    }

    luaL_openlibs(L);
    vb_lua_runtime_t runtime = {0};
    runtime.L = L;
    vb_lua_app_init(&runtime.app);
    vb_lua_key_init(&runtime.key);
    vb_lua_touch_init(&runtime.touch);
    vb_lua_gamepad_init(&runtime.gamepad);
    vb_lua_imu_init(&runtime.imu);
    vb_lua_imu_set_available(&runtime.imu, vb_board_imu_available());
    vb_lua_camera_init(&runtime.camera);
    vb_lua_tmr_init(&runtime.tmr);
    vb_lua_app_set_stop_flag(&runtime.app, &s_runner_state.stop_requested);
    vb_lua_app_set_registry(&runtime.app, app);
    vb_lua_tmr_set_stop_flag(&runtime.tmr, &s_runner_state.stop_requested);
    vb_lua_tmr_set_poll_callback(&runtime.tmr, vb_lua_runner_poll, &runtime);

    lua_pushcfunction(L, vb_lua_print);
    lua_setglobal(L, "print");
    vb_lua_app_register(L, &runtime.app);
    vb_lua_tmr_register(L, &runtime.tmr);
    vb_lua_key_register(L, &runtime.key);
    vb_lua_touch_register(L, &runtime.touch);
    vb_lua_gamepad_register(L, &runtime.gamepad);
    vb_lua_imu_register(L, &runtime.imu);
    vb_lua_camera_register(L, &runtime.camera);
    lua_pushlightuserdata(L, &runtime);
    lua_setfield(L, LUA_REGISTRYINDEX, "vb_runner_runtime");
    s_active_runtime = &runtime;
    (void)ensure_webui_queue();
    esp_err_t input_err = vb_board_input_start(runner_input_cb, &runtime);
    if (input_err != ESP_OK) {
        ESP_LOGW(TAG, "board input unavailable: %s", esp_err_to_name(input_err));
    }
    vb_lua_file_register(L, app);
    vb_lua_wifi_register(L);
    vb_lua_http_register(L);
    vb_lua_sjson_register(L);
    vb_lua_sys_register(L);
    vb_lua_time_register(L);
    vb_lua_i2s_register(L);
    vb_lua_native_module_register(L, app);
    vb_lua_lvgl_set_app_dir(app->first_app_dir);
    vb_lua_lvgl_register(L);

    int lua_err = load_lua_script(L, app->first_app_path, script);
    if (lua_err != LUA_OK) {
        const char *err = lua_tostring(L, -1);
        ESP_LOGE(TAG, "Lua app failed: %s", err ? err : "unknown error");
        set_result(result, true, ESP_FAIL, err ? err : "lua failed");
        cleanup_lua_runtime(L, &runtime);
        lua_close(L);
        return ESP_FAIL;
    }

    set_running_if_starting();

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
    context->status = run_lua_file(context->app, &context->script, context->result, &pending_launch);
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
    esp_err_t status = run_lua_file(&context->registry, &context->script, &context->result, &pending_launch);
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
             context->registry.first_app_name,
             esp_err_to_name(status),
             context->result.message);
    free_lua_script(&context->script);
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
    char preload_error[128] = {0};
    err = preload_lua_file(app->first_app_path, &context.script, preload_error, sizeof(preload_error));
    if (err != ESP_OK) {
        fail_reserved_start(err);
        set_result(result, false, err, preload_error[0] ? preload_error : esp_err_to_name(err));
        return err;
    }

    bool camera_prewarmed = prewarm_camera_if_needed(&app->apps[0]);
    BaseType_t created = xTaskCreatePinnedToCoreWithCaps(lua_task,
                                                         "vb_lua",
                                                         VB_LUA_TASK_STACK_SIZE,
                                                         &context,
                                                         VB_LUA_TASK_PRIORITY,
                                                         NULL,
                                                         tskNO_AFFINITY,
                                                         MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (created != pdPASS) {
        if (camera_prewarmed) {
            vb_board_camera_stop();
        }
        free_lua_script(&context.script);
        fail_reserved_start(ESP_ERR_NO_MEM);
        set_result(result, false, ESP_ERR_NO_MEM, "lua task failed");
        return ESP_ERR_NO_MEM;
    }

    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    free_lua_script(&context.script);
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

esp_err_t vb_app_runner_launch_async_from_registry(const vb_app_registry_result_t *registry, int selected_index)
{
    if (registry == NULL || selected_index < 0 || selected_index >= registry->stored_app_count) {
        return ESP_ERR_INVALID_ARG;
    }

    const vb_app_registry_entry_t *entry = &registry->apps[selected_index];
    if (entry->path[0] == '\0') {
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
    context->registry = *registry;
    strlcpy(context->registry.first_app_name, entry->name[0] ? entry->name : entry->id, sizeof(context->registry.first_app_name));
    strlcpy(context->registry.first_app_entry, entry->entry, sizeof(context->registry.first_app_entry));
    strlcpy(context->registry.first_app_dir, entry->dir, sizeof(context->registry.first_app_dir));
    strlcpy(context->registry.first_app_path, entry->path, sizeof(context->registry.first_app_path));

    char preload_error[128] = {0};
    err = preload_lua_file(context->registry.first_app_path, &context->script, preload_error, sizeof(preload_error));
    if (err != ESP_OK) {
        fail_reserved_start(err);
        free(context);
        return err;
    }

    bool camera_prewarmed = prewarm_camera_if_needed(entry);

    BaseType_t created = xTaskCreatePinnedToCoreWithCaps(lua_async_task,
                                                         "vb_lua_launch",
                                                         VB_LUA_TASK_STACK_SIZE,
                                                         context,
                                                         VB_LUA_TASK_PRIORITY,
                                                         NULL,
                                                         tskNO_AFFINITY,
                                                         MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (created != pdPASS) {
        if (camera_prewarmed) {
            vb_board_camera_stop();
        }
        free_lua_script(&context->script);
        fail_reserved_start(ESP_ERR_NO_MEM);
        free(context);
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "Lua async launch: %s", context->registry.first_app_name);
    return ESP_OK;
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
    entry_to_registry(entry, &context->registry);

    char preload_error[128] = {0};
    err = preload_lua_file(context->registry.first_app_path, &context->script, preload_error, sizeof(preload_error));
    if (err != ESP_OK) {
        fail_reserved_start(err);
        free(context);
        return err;
    }

    if (options != NULL && options->before_start != NULL) {
        options->before_start(options->user_data);
    }

    bool camera_prewarmed = prewarm_camera_if_needed(entry);

    BaseType_t created = xTaskCreatePinnedToCoreWithCaps(lua_async_task,
                                                         "vb_lua_launch",
                                                         VB_LUA_TASK_STACK_SIZE,
                                                         context,
                                                         VB_LUA_TASK_PRIORITY,
                                                         NULL,
                                                         tskNO_AFFINITY,
                                                         MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (created != pdPASS) {
        if (camera_prewarmed) {
            vb_board_camera_stop();
        }
        free_lua_script(&context->script);
        fail_reserved_start(ESP_ERR_NO_MEM);
        free(context);
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "Lua async launch: %s", context->registry.first_app_name);
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

void vb_app_runner_note_launch_failure(esp_err_t status, const char *message)
{
    taskENTER_CRITICAL(&s_runner_state_mux);
    s_runner_state.lifecycle_state = VB_APP_RUNNER_STATE_FAILED;
    s_runner_state.stop_requested = false;
    s_runner_state.current_id[0] = '\0';
    s_runner_state.current_name[0] = '\0';
    s_runner_state.last_status = status;
    strlcpy(s_runner_state.last_message,
            message ? message : esp_err_to_name(status),
            sizeof(s_runner_state.last_message));
    taskEXIT_CRITICAL(&s_runner_state_mux);
}
