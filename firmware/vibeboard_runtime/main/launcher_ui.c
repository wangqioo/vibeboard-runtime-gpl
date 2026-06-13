#include "launcher_ui.h"

#include <stdio.h>
#include <string.h>

#include "app_runner.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_lvgl_port.h"
#include "lvgl.h"

static const char *TAG = "launcher_ui";

static lv_obj_t *s_status_label;

static void set_status(const char *text)
{
    if (s_status_label == NULL) {
        return;
    }
    lv_label_set_text(s_status_label, text);
}

static void update_status(const char *prefix, const char *app_id)
{
    char line[96];
    snprintf(line, sizeof(line), "%s %s", prefix, app_id);
    set_status(line);
}

static void launch_app(const vb_app_registry_entry_t *app)
{
    if (app == NULL) {
        return;
    }

    update_status("Launching", app->id);
    ESP_LOGI(TAG, "launcher selected app: %s", app->id);

    if (vb_app_runner_is_running()) {
        const char *current_id = vb_app_runner_current_id();
        if (strcmp(current_id, app->id) == 0) {
            update_status("Already running", app->id);
            return;
        }

        esp_err_t err = vb_app_runner_stop();
        if (err != ESP_OK && err != ESP_ERR_NOT_FOUND) {
            set_status(esp_err_to_name(err));
            return;
        }

        err = vb_app_runner_wait_stopped(1500);
        if (err != ESP_OK) {
            set_status("Stop timeout");
            return;
        }
    }

    esp_err_t err = vb_app_runner_launch_async(app);
    if (err == ESP_OK) {
        update_status("Launched", app->id);
    } else {
        set_status(esp_err_to_name(err));
    }
}

static void app_button_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    const vb_app_registry_entry_t *app = (const vb_app_registry_entry_t *)lv_event_get_user_data(event);
    launch_app(app);
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

static void create_app_button(lv_obj_t *parent, const vb_app_registry_entry_t *app)
{
    lv_obj_t *button = lv_btn_create(parent);
    lv_obj_set_width(button, 296);
    lv_obj_set_height(button, 44);
    lv_obj_add_event_cb(button, app_button_event_cb, LV_EVENT_CLICKED, (void *)app);

    lv_obj_t *name = create_label(button, app->name[0] ? app->name : app->id, 260);
    lv_obj_align(name, LV_ALIGN_TOP_LEFT, 10, 5);

    lv_obj_t *id = create_label(button, app->id, 260);
    lv_obj_set_style_text_color(id, lv_color_hex(0xd2dae6), 0);
    lv_obj_align(id, LV_ALIGN_TOP_LEFT, 10, 24);
}

void vb_launcher_ui_show(const vb_app_registry_result_t *apps, esp_err_t scan_err)
{
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
        set_status(line);
        lvgl_port_unlock();
        return;
    }

    if (apps == NULL || apps->stored_app_count <= 0) {
        set_status("No apps on SD");
        lvgl_port_unlock();
        return;
    }

    char line[96];
    snprintf(line, sizeof(line), "Apps: %d", apps->app_count);
    set_status(line);

    lv_obj_t *list = lv_obj_create(screen);
    lv_obj_set_size(list, 312, 178);
    lv_obj_align(list, LV_ALIGN_TOP_LEFT, 4, 58);
    lv_obj_set_flex_flow(list, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_all(list, 6, 0);
    lv_obj_set_style_pad_row(list, 6, 0);
    lv_obj_set_style_bg_opa(list, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(list, 0, 0);

    for (int i = 0; i < apps->stored_app_count; i++) {
        create_app_button(list, &apps->apps[i]);
    }

    lvgl_port_unlock();
}
