#include "launcher_ui.h"

#include <stdio.h>
#include <string.h>

#include "app_runner.h"
#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_lvgl_port.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lvgl.h"

static const char *TAG = "launcher_ui";
#define VB_LAUNCHER_BOOT_KEY GPIO_NUM_0
#define VB_LAUNCHER_LONG_PRESS_MS 800
#define VB_LAUNCHER_DEBOUNCE_MS 80
#define VB_LAUNCHER_KEY_COOLDOWN_MS 350

static lv_obj_t *s_status_label;
static const vb_app_registry_result_t *s_apps;
static int s_selected_index;
static lv_obj_t *s_app_buttons[VB_APP_REGISTRY_MAX_APPS];
static bool s_boot_key_task_started;
static bool s_launcher_active;

static void deactivate_launcher_unlocked(void)
{
    s_launcher_active = false;
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
        if (from_task) {
            deactivate_launcher_from_task();
        } else {
            deactivate_launcher_unlocked();
        }
    } else {
        if (from_task) {
            set_status_from_task(esp_err_to_name(err));
        } else {
            set_status_unlocked(esp_err_to_name(err));
        }
    }
}

static void app_button_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    const vb_app_registry_entry_t *app = (const vb_app_registry_entry_t *)lv_event_get_user_data(event);
    launch_app(app, false);
}

static void update_selection_unlocked(void)
{
    if (s_apps == NULL || s_apps->stored_app_count <= 0) {
        return;
    }

    for (int i = 0; i < s_apps->stored_app_count; i++) {
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
             s_apps->stored_app_count);
    set_status_unlocked(line);
}

static void select_next_from_task(void)
{
    lvgl_port_lock(0);
    if (!s_launcher_active) {
        lvgl_port_unlock();
        ESP_LOGI(TAG, "launcher inactive; BOOT short press ignored");
        return;
    }
    if (s_apps == NULL || s_apps->stored_app_count <= 0) {
        lvgl_port_unlock();
        return;
    }
    s_selected_index = (s_selected_index + 1) % s_apps->stored_app_count;
    update_selection_unlocked();
    lvgl_port_unlock();
    ESP_LOGI(TAG, "launcher selected index: %d", s_selected_index);
}

static void launch_selected_from_task(void)
{
    if (!s_launcher_active) {
        ESP_LOGI(TAG, "launcher inactive; BOOT long press ignored");
        return;
    }
    if (s_apps == NULL || s_apps->stored_app_count <= 0) {
        return;
    }
    launch_app(&s_apps->apps[s_selected_index], true);
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

void vb_launcher_ui_show(const vb_app_registry_result_t *apps, esp_err_t scan_err)
{
    s_apps = apps;
    s_selected_index = 0;
    memset(s_app_buttons, 0, sizeof(s_app_buttons));
    s_launcher_active = true;

    lvgl_port_lock(0);

    lv_obj_t *screen = lv_scr_act();
    lv_obj_clean(screen);
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x101418), 0);
    lv_obj_set_style_text_color(screen, lv_color_hex(0xf4f7fb), 0);

    lv_obj_t *title = create_label(screen, "VibeBoard Apps", 296);
    lv_obj_align(title, LV_ALIGN_TOP_LEFT, 12, 10);

    s_status_label = create_label(screen, "", 296);
    lv_obj_set_style_text_color(s_status_label, lv_color_hex(0xb6c2d1), 0);
    lv_obj_align(s_status_label, LV_ALIGN_TOP_LEFT, 12, 36);

    if (scan_err != ESP_OK) {
        char line[96];
        snprintf(line, sizeof(line), "Apps: %s", esp_err_to_name(scan_err));
        set_status_unlocked(line);
        lvgl_port_unlock();
        return;
    }

    if (apps == NULL || apps->stored_app_count <= 0) {
        set_status_unlocked("No apps on SD");
        lvgl_port_unlock();
        return;
    }

    lv_obj_t *list = lv_obj_create(screen);
    lv_obj_set_size(list, 312, 178);
    lv_obj_align(list, LV_ALIGN_TOP_LEFT, 4, 58);
    lv_obj_set_flex_flow(list, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_all(list, 6, 0);
    lv_obj_set_style_pad_row(list, 6, 0);
    lv_obj_set_style_bg_opa(list, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(list, 0, 0);

    for (int i = 0; i < apps->stored_app_count; i++) {
        lv_obj_t *button = lv_btn_create(list);
        lv_obj_set_width(button, 296);
        lv_obj_set_height(button, 44);
        lv_obj_add_event_cb(button, app_button_event_cb, LV_EVENT_CLICKED, (void *)&apps->apps[i]);
        s_app_buttons[i] = button;

        lv_obj_t *name = create_label(button, apps->apps[i].name[0] ? apps->apps[i].name : apps->apps[i].id, 260);
        lv_obj_align(name, LV_ALIGN_TOP_LEFT, 10, 5);

        lv_obj_t *id = create_label(button, apps->apps[i].id, 260);
        lv_obj_set_style_text_color(id, lv_color_hex(0xd2dae6), 0);
        lv_obj_align(id, LV_ALIGN_TOP_LEFT, 10, 24);
    }
    update_selection_unlocked();

    lvgl_port_unlock();
    start_boot_key_task();
}
