#include "launcher_ui.h"

#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include "app_runner.h"
#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_lvgl_port.h"
#include "freertos/FreeRTOS.h"
#include "freertos/portmacro.h"
#include "freertos/task.h"
#include "lvgl.h"

static const char *TAG = "launcher_ui";
#define VB_LAUNCHER_BOOT_KEY GPIO_NUM_0
#define VB_LAUNCHER_LONG_PRESS_MS 800
#define VB_LAUNCHER_DEBOUNCE_MS 80
#define VB_LAUNCHER_KEY_COOLDOWN_MS 350

typedef struct {
    vb_app_registry_entry_t app;
} vb_launcher_launch_context_t;

typedef struct {
    vb_app_registry_entry_t apps[VB_APP_REGISTRY_MAX_APPS];
    int app_count;
} vb_launcher_render_snapshot_t;

static lv_obj_t *s_status_label;
static vb_app_registry_result_t *s_apps;
static esp_err_t s_scan_err;
static char s_pending_status[96];
static int s_selected_index;
static lv_obj_t *s_app_buttons[VB_APP_REGISTRY_MAX_APPS];
static vb_app_registry_entry_t s_rendered_apps[VB_APP_REGISTRY_MAX_APPS];
static int s_rendered_app_count;
static bool s_boot_key_task_started;
static bool s_launcher_active;
static bool s_launch_task_running;
static bool s_refresh_task_running;
static bool s_stop_task_running;
static bool s_return_task_running;
static portMUX_TYPE s_launcher_state_mux = portMUX_INITIALIZER_UNLOCKED;

static void launch_app_task(void *arg);
static void refresh_launcher_task(void *arg);
static void stop_launcher_task(void *arg);
static void return_to_launcher_task(void *arg);
static void start_return_to_launcher_task(void);
static void refresh_launcher_from_task(const char *status);
static void refresh_button_event_cb(lv_event_t *event);
static void stop_button_event_cb(lv_event_t *event);
static void collect_rendered_apps_snapshot(vb_app_registry_result_t *apps,
                                           esp_err_t scan_err,
                                           vb_launcher_render_snapshot_t *snapshot);
static void publish_rendered_apps_snapshot(const vb_launcher_render_snapshot_t *snapshot);
static void rebuild_launcher_unlocked(vb_app_registry_result_t *apps, esp_err_t scan_err);

static void deactivate_launcher_unlocked(void)
{
    taskENTER_CRITICAL(&s_launcher_state_mux);
    s_launcher_active = false;
    taskEXIT_CRITICAL(&s_launcher_state_mux);
    s_status_label = NULL;
    for (int i = 0; i < VB_APP_REGISTRY_MAX_APPS; i++) {
        s_app_buttons[i] = NULL;
    }
}

static void deactivate_launcher_from_task(void)
{
    lvgl_port_lock(0);
    deactivate_launcher_unlocked();
    lvgl_port_unlock();
}

static void set_status_unlocked(const char *text)
{
    if (s_status_label == NULL) {
        return;
    }
    lv_label_set_text(s_status_label, text);
}

static void set_status_from_task(const char *text)
{
    lvgl_port_lock(0);
    set_status_unlocked(text);
    lvgl_port_unlock();
}

static bool try_set_task_running(bool *flag)
{
    bool started = false;
    taskENTER_CRITICAL(&s_launcher_state_mux);
    if (!*flag) {
        *flag = true;
        started = true;
    }
    taskEXIT_CRITICAL(&s_launcher_state_mux);
    return started;
}

static void clear_task_running(bool *flag)
{
    taskENTER_CRITICAL(&s_launcher_state_mux);
    *flag = false;
    taskEXIT_CRITICAL(&s_launcher_state_mux);
}

static bool is_launcher_active(void)
{
    bool active;
    taskENTER_CRITICAL(&s_launcher_state_mux);
    active = s_launcher_active;
    taskEXIT_CRITICAL(&s_launcher_state_mux);
    return active;
}

static void update_status_unlocked(const char *prefix, const char *app_id)
{
    char line[96];
    snprintf(line, sizeof(line), "%s %s", prefix, app_id);
    set_status_unlocked(line);
}

static void update_status_from_task(const char *prefix, const char *app_id)
{
    char line[96];
    snprintf(line, sizeof(line), "%s %s", prefix, app_id);
    set_status_from_task(line);
}

static void format_return_status(char *dest, size_t dest_size)
{
    const char *state = vb_app_runner_current_state_name();
    if (state != NULL && strcmp(state, "failed") == 0) {
        const char *message = vb_app_runner_last_message();
        if (message != NULL && message[0] != '\0') {
            snprintf(dest, dest_size, "Failed: %s", message);
        } else {
            strlcpy(dest, "Failed:", dest_size);
        }
        return;
    }

    strlcpy(dest, "Stopped", dest_size);
}

static void launch_app(const vb_app_registry_entry_t *app, bool from_task)
{
    if (app == NULL) {
        return;
    }

    if (from_task) {
        update_status_from_task("Launching", app->id);
    } else {
        update_status_unlocked("Launching", app->id);
    }
    ESP_LOGI(TAG, "launcher selected app: %s", app->id);

    if (vb_app_runner_is_running()) {
        const char *current_id = vb_app_runner_current_id();
        if (strcmp(current_id, app->id) == 0) {
            if (from_task) {
                update_status_from_task("Already running", app->id);
            } else {
                update_status_unlocked("Already running", app->id);
            }
            return;
        }

        esp_err_t err = vb_app_runner_stop();
        if (err != ESP_OK && err != ESP_ERR_NOT_FOUND) {
            if (from_task) {
                set_status_from_task(esp_err_to_name(err));
            } else {
                set_status_unlocked(esp_err_to_name(err));
            }
            return;
        }

        err = vb_app_runner_wait_stopped(1500);
        if (err != ESP_OK) {
            if (from_task) {
                set_status_from_task("Stop timeout");
            } else {
                set_status_unlocked("Stop timeout");
            }
            return;
        }
    }

    esp_err_t err = vb_app_runner_launch_async(app);
    if (err == ESP_OK) {
        vb_launcher_ui_note_async_launch();
    } else {
        if (from_task) {
            set_status_from_task(esp_err_to_name(err));
        } else {
            set_status_unlocked(esp_err_to_name(err));
        }
    }
}

static void launch_app_task(void *arg)
{
    vb_launcher_launch_context_t *context = (vb_launcher_launch_context_t *)arg;
    if (context != NULL) {
        launch_app(&context->app, true);
        free(context);
    }
    clear_task_running(&s_launch_task_running);
    vTaskDelete(NULL);
}

static void app_button_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    const vb_app_registry_entry_t *app = (const vb_app_registry_entry_t *)lv_event_get_user_data(event);
    if (app == NULL) {
        return;
    }
    if (!try_set_task_running(&s_launch_task_running)) {
        set_status_unlocked("Launch already running");
        return;
    }

    update_status_unlocked("Launching", app->id);
    vb_launcher_launch_context_t *context = calloc(1, sizeof(*context));
    if (context == NULL) {
        clear_task_running(&s_launch_task_running);
        set_status_unlocked("Launch task failed");
        return;
    }
    context->app = *app;

    BaseType_t created = xTaskCreate(launch_app_task, "vb_launch", 4096, context, 4, NULL);
    if (created != pdPASS) {
        clear_task_running(&s_launch_task_running);
        free(context);
        set_status_unlocked("Launch task failed");
    }
}

static void update_selection_unlocked(void)
{
    if (s_rendered_app_count <= 0) {
        return;
    }

    for (int i = 0; i < s_rendered_app_count; i++) {
        lv_obj_t *button = s_app_buttons[i];
        if (button == NULL) {
            continue;
        }
        if (i == s_selected_index) {
            lv_obj_set_style_border_width(button, 3, 0);
            lv_obj_set_style_border_color(button, lv_color_hex(0xffd166), 0);
        } else {
            lv_obj_set_style_border_width(button, 0, 0);
        }
    }

    char line[96];
    snprintf(line,
             sizeof(line),
             "BOOT short: next  hold: launch  %d/%d",
             s_selected_index + 1,
             s_rendered_app_count);
    set_status_unlocked(line);
}

static void select_next_from_task(void)
{
    lvgl_port_lock(0);
    bool launcher_active = is_launcher_active();
    if (!launcher_active) {
        lvgl_port_unlock();
        ESP_LOGI(TAG, "launcher inactive; BOOT short press ignored");
        return;
    }
    if (s_rendered_app_count <= 0) {
        lvgl_port_unlock();
        return;
    }
    s_selected_index = (s_selected_index + 1) % s_rendered_app_count;
    update_selection_unlocked();
    lvgl_port_unlock();
    ESP_LOGI(TAG, "launcher selected index: %d", s_selected_index);
}

static void launch_selected_from_task(void)
{
    lvgl_port_lock(0);
    bool launcher_active = is_launcher_active();
    if (!launcher_active) {
        lvgl_port_unlock();
        if (vb_app_runner_is_running()) {
            ESP_LOGI(TAG, "launcher inactive; BOOT long press: stop app");
            esp_err_t err = vb_app_runner_stop();
            if (err != ESP_OK && err != ESP_ERR_NOT_FOUND) {
                ESP_LOGW(TAG, "failed to stop app from BOOT long press: %s", esp_err_to_name(err));
            }
            return;
        }

        ESP_LOGI(TAG, "launcher inactive; BOOT long press: return to launcher");
        char status[96];
        format_return_status(status, sizeof(status));
        refresh_launcher_from_task(status);
        return;
    }
    if (s_rendered_app_count <= 0) {
        lvgl_port_unlock();
        return;
    }
    vb_app_registry_entry_t selected_app = s_rendered_apps[s_selected_index];
    lvgl_port_unlock();
    launch_app(&selected_app, true);
}

static void boot_key_task(void *arg)
{
    (void)arg;
    bool was_pressed = false;
    TickType_t pressed_at = 0;
    TickType_t cooldown_until = 0;

    while (true) {
        TickType_t now = xTaskGetTickCount();
        bool pressed = gpio_get_level(VB_LAUNCHER_BOOT_KEY) == 0;
        if (pressed && !was_pressed) {
            pressed_at = now;
        } else if (!pressed && was_pressed) {
            uint32_t duration_ms = pdTICKS_TO_MS(now - pressed_at);
            bool is_cooling_down = (int32_t)(cooldown_until - now) > 0;
            if (duration_ms < VB_LAUNCHER_DEBOUNCE_MS || is_cooling_down) {
                was_pressed = pressed;
                vTaskDelay(pdMS_TO_TICKS(40));
                continue;
            }

            if (duration_ms >= VB_LAUNCHER_LONG_PRESS_MS) {
                ESP_LOGI(TAG, "launcher BOOT long press: launch");
                launch_selected_from_task();
            } else {
                ESP_LOGI(TAG, "launcher BOOT short press: next");
                select_next_from_task();
            }
            cooldown_until = now + pdMS_TO_TICKS(VB_LAUNCHER_KEY_COOLDOWN_MS);
        }
        was_pressed = pressed;
        vTaskDelay(pdMS_TO_TICKS(40));
    }
}

static void start_boot_key_task(void)
{
    if (s_boot_key_task_started) {
        return;
    }

    const gpio_config_t config = {
        .pin_bit_mask = BIT64(VB_LAUNCHER_BOOT_KEY),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&config);

    BaseType_t created = xTaskCreate(boot_key_task, "vb_boot_key", 4096, NULL, 4, NULL);
    s_boot_key_task_started = created == pdPASS;
}

static lv_obj_t *create_label(lv_obj_t *parent, const char *text, int32_t width)
{
    lv_obj_t *label = lv_label_create(parent);
    lv_label_set_text(label, text);
    lv_label_set_long_mode(label, LV_LABEL_LONG_DOT);
    lv_obj_set_width(label, width);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_14, 0);
    return label;
}

static lv_obj_t *create_control_button(lv_obj_t *parent, const char *text, lv_event_cb_t cb)
{
    lv_obj_t *button = lv_btn_create(parent);
    lv_obj_set_size(button, 96, 32);
    lv_obj_add_event_cb(button, cb, LV_EVENT_CLICKED, NULL);

    lv_obj_t *label = create_label(button, text, 78);
    lv_obj_center(label);
    return button;
}

static void set_pending_status(const char *text)
{
    taskENTER_CRITICAL(&s_launcher_state_mux);
    strlcpy(s_pending_status, text ? text : "", sizeof(s_pending_status));
    taskEXIT_CRITICAL(&s_launcher_state_mux);
}

static bool take_pending_status(char *dest, size_t dest_size)
{
    bool has_status = false;
    taskENTER_CRITICAL(&s_launcher_state_mux);
    if (s_pending_status[0] != '\0') {
        strlcpy(dest, s_pending_status, dest_size);
        s_pending_status[0] = '\0';
        has_status = true;
    }
    taskEXIT_CRITICAL(&s_launcher_state_mux);
    return has_status;
}

static void refresh_launcher_from_event(const char *status)
{
    if (s_apps == NULL) {
        return;
    }
    if (!try_set_task_running(&s_refresh_task_running)) {
        set_status_unlocked("Refresh already running");
        return;
    }
    set_status_unlocked("Refreshing");
    BaseType_t created = xTaskCreate(refresh_launcher_task, "vb_refresh", 4096, (void *)status, 4, NULL);
    if (created != pdPASS) {
        clear_task_running(&s_refresh_task_running);
        set_status_unlocked("Refresh task failed");
    }
}

static void refresh_launcher_from_task(const char *status)
{
    if (s_apps == NULL) {
        return;
    }
    esp_err_t err = vb_app_registry_scan(s_apps);
    set_pending_status(status ? status : (err == ESP_OK ? "Refreshed" : esp_err_to_name(err)));
    vb_launcher_render_snapshot_t snapshot;
    collect_rendered_apps_snapshot(s_apps, err, &snapshot);
    lvgl_port_lock(0);
    publish_rendered_apps_snapshot(&snapshot);
    rebuild_launcher_unlocked(s_apps, err);
    lvgl_port_unlock();
}

static void refresh_launcher_task(void *arg)
{
    refresh_launcher_from_task((const char *)arg);
    clear_task_running(&s_refresh_task_running);
    vTaskDelete(NULL);
}

static void stop_launcher_task(void *arg)
{
    (void)arg;
    esp_err_t err = vb_app_runner_wait_stopped(1500);
    if (err == ESP_OK) {
        refresh_launcher_from_task("Stopped");
    } else {
        refresh_launcher_from_task("Stop timeout");
    }
    clear_task_running(&s_stop_task_running);
    vTaskDelete(NULL);
}

static void return_to_launcher_task(void *arg)
{
    (void)arg;
    while (vb_app_runner_is_running()) {
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    char status[96];
    format_return_status(status, sizeof(status));
    refresh_launcher_from_task(status);
    clear_task_running(&s_return_task_running);
    vTaskDelete(NULL);
}

static void start_return_to_launcher_task(void)
{
    if (!try_set_task_running(&s_return_task_running)) {
        return;
    }

    BaseType_t created = xTaskCreate(return_to_launcher_task, "vb_return", 4096, NULL, 4, NULL);
    if (created != pdPASS) {
        clear_task_running(&s_return_task_running);
        ESP_LOGW(TAG, "Return task failed");
    }
}

static void refresh_button_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) == LV_EVENT_CLICKED) {
        refresh_launcher_from_event("Refreshed");
    }
}

static void stop_button_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }
    if (!vb_app_runner_is_running()) {
        set_status_unlocked("No app running");
        return;
    }
    if (!try_set_task_running(&s_stop_task_running)) {
        set_status_unlocked("Stop already running");
        return;
    }
    set_status_unlocked("Stopping");
    esp_err_t err = vb_app_runner_stop();
    if (err != ESP_OK && err != ESP_ERR_NOT_FOUND) {
        clear_task_running(&s_stop_task_running);
        set_status_unlocked(esp_err_to_name(err));
        return;
    }
    BaseType_t created = xTaskCreate(stop_launcher_task, "vb_stop", 4096, NULL, 4, NULL);
    if (created != pdPASS) {
        clear_task_running(&s_stop_task_running);
        set_status_unlocked("Stop task failed");
    }
}

static void collect_rendered_apps_snapshot(vb_app_registry_result_t *apps,
                                           esp_err_t scan_err,
                                           vb_launcher_render_snapshot_t *snapshot)
{
    memset(snapshot, 0, sizeof(*snapshot));

    if (scan_err == ESP_OK && apps != NULL) {
        vb_app_registry_lock();
        int stored_app_count = apps->stored_app_count;
        if (stored_app_count > VB_APP_REGISTRY_MAX_APPS) {
            stored_app_count = VB_APP_REGISTRY_MAX_APPS;
        }
        for (int i = 0; i < stored_app_count; i++) {
            snapshot->apps[i] = apps->apps[i];
        }
        snapshot->app_count = stored_app_count;
        vb_app_registry_unlock();
    }
}

static void publish_rendered_apps_snapshot(const vb_launcher_render_snapshot_t *snapshot)
{
    memset(s_rendered_apps, 0, sizeof(s_rendered_apps));
    s_rendered_app_count = 0;
    if (snapshot == NULL) {
        return;
    }
    for (int i = 0; i < snapshot->app_count; i++) {
        s_rendered_apps[i] = snapshot->apps[i];
    }
    s_rendered_app_count = snapshot->app_count;
}

static void rebuild_launcher_unlocked(vb_app_registry_result_t *apps, esp_err_t scan_err)
{
    s_apps = apps;
    s_scan_err = scan_err;
    s_selected_index = 0;
    memset(s_app_buttons, 0, sizeof(s_app_buttons));
    taskENTER_CRITICAL(&s_launcher_state_mux);
    s_launcher_active = true;
    taskEXIT_CRITICAL(&s_launcher_state_mux);

    lv_obj_t *screen = lv_scr_act();
    lv_obj_clean(screen);
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x101418), 0);
    lv_obj_set_style_text_color(screen, lv_color_hex(0xf4f7fb), 0);

    lv_obj_t *title = create_label(screen, "VibeBoard Apps", 296);
    lv_obj_align(title, LV_ALIGN_TOP_LEFT, 12, 10);

    s_status_label = create_label(screen, "", 296);
    lv_obj_set_style_text_color(s_status_label, lv_color_hex(0xb6c2d1), 0);
    lv_obj_align(s_status_label, LV_ALIGN_TOP_LEFT, 12, 36);

    char pending_status[sizeof(s_pending_status)];
    bool has_pending_status = take_pending_status(pending_status, sizeof(pending_status));
    if (scan_err != ESP_OK) {
        char line[96];
        snprintf(line, sizeof(line), "Apps: %s", esp_err_to_name(scan_err));
        set_status_unlocked(has_pending_status ? pending_status : line);
    } else if (s_rendered_app_count <= 0) {
        set_status_unlocked(has_pending_status ? pending_status : "No apps on SD");
    } else {
        lv_obj_t *list = lv_obj_create(screen);
        lv_obj_set_size(list, 312, 138);
        lv_obj_align(list, LV_ALIGN_TOP_LEFT, 4, 58);
        lv_obj_set_flex_flow(list, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_style_pad_all(list, 6, 0);
        lv_obj_set_style_pad_row(list, 6, 0);
        lv_obj_set_style_bg_opa(list, LV_OPA_TRANSP, 0);
        lv_obj_set_style_border_width(list, 0, 0);

        for (int i = 0; i < s_rendered_app_count; i++) {
            lv_obj_t *button = lv_btn_create(list);
            lv_obj_set_width(button, 296);
            lv_obj_set_height(button, 44);
            lv_obj_add_event_cb(button, app_button_event_cb, LV_EVENT_CLICKED, (void *)&s_rendered_apps[i]);
            s_app_buttons[i] = button;

            lv_obj_t *name = create_label(button,
                                          s_rendered_apps[i].name[0] ? s_rendered_apps[i].name : s_rendered_apps[i].id,
                                          260);
            lv_obj_align(name, LV_ALIGN_TOP_LEFT, 10, 5);

            lv_obj_t *id = create_label(button, s_rendered_apps[i].id, 260);
            lv_obj_set_style_text_color(id, lv_color_hex(0xd2dae6), 0);
            lv_obj_align(id, LV_ALIGN_TOP_LEFT, 10, 24);
        }
        update_selection_unlocked();
        if (has_pending_status) {
            set_status_unlocked(pending_status);
        }
    }

    lv_obj_t *controls = lv_obj_create(screen);
    lv_obj_set_size(controls, 312, 36);
    lv_obj_align(controls, LV_ALIGN_BOTTOM_LEFT, 4, -2);
    lv_obj_set_flex_flow(controls, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_all(controls, 2, 0);
    lv_obj_set_style_pad_column(controls, 8, 0);
    lv_obj_set_style_bg_opa(controls, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(controls, 0, 0);
    create_control_button(controls, "Stop", stop_button_event_cb);
    create_control_button(controls, "Refresh", refresh_button_event_cb);
}

void vb_launcher_ui_show(vb_app_registry_result_t *apps, esp_err_t scan_err)
{
    s_apps = apps;
    s_scan_err = scan_err;

    vb_launcher_render_snapshot_t snapshot;
    collect_rendered_apps_snapshot(apps, scan_err, &snapshot);
    lvgl_port_lock(0);
    publish_rendered_apps_snapshot(&snapshot);
    rebuild_launcher_unlocked(apps, scan_err);
    lvgl_port_unlock();

    start_boot_key_task();
}

void vb_launcher_ui_note_async_launch(void)
{
    deactivate_launcher_from_task();
    start_return_to_launcher_task();
}
