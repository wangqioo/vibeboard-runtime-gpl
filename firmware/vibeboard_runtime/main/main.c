#include <stdio.h>

#include "app_registry.h"
#include "app_runner.h"
#include "board_lckfb_szpi_s3.h"
#include "esp_log.h"
#include "esp_lvgl_port.h"
#include "lvgl.h"

static const char *TAG = "vibeboard_runtime";

static void set_label(lv_obj_t *parent, const char *text, int y)
{
    lv_obj_t *label = lv_label_create(parent);
    lv_label_set_text(label, text);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_14, 0);
    lv_obj_align(label, LV_ALIGN_TOP_LEFT, 12, y);
}

static void show_boot_screen(const vb_board_status_t *board,
                             const vb_app_registry_result_t *apps,
                             esp_err_t scan_err,
                             const vb_app_runner_result_t *run,
                             esp_err_t run_err)
{
    lvgl_port_lock(0);

    lv_obj_t *screen = lv_scr_act();
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x101418), 0);
    lv_obj_set_style_text_color(screen, lv_color_hex(0xf4f7fb), 0);

    set_label(screen, "VibeBoard Runtime", 12);
    set_label(screen, "Board: LCKFB SZPI ESP32-S3", 42);
    set_label(screen, board->display_ok ? "LCD: OK" : "LCD: FAIL", 72);
    set_label(screen, board->touch_ok ? "Touch: OK" : "Touch: unavailable", 102);

    char line[96];
    if (board->sd_ok) {
        snprintf(line, sizeof(line), "SD: OK");
    } else {
        snprintf(line, sizeof(line), "SD: %s", esp_err_to_name(board->sd_error));
    }
    set_label(screen, line, 132);

    if (scan_err == ESP_OK) {
        snprintf(line, sizeof(line), "Apps: %d", apps->app_count);
    } else {
        snprintf(line, sizeof(line), "Apps: %s", esp_err_to_name(scan_err));
    }
    set_label(screen, line, 162);

    snprintf(line, sizeof(line), "First: %s", apps->first_app_name);
    set_label(screen, line, 192);

    if (scan_err != ESP_OK || apps->app_count <= 0) {
        snprintf(line, sizeof(line), "Lua: no app");
    } else if (run_err == ESP_OK) {
        snprintf(line, sizeof(line), "Lua: OK");
    } else {
        snprintf(line, sizeof(line), "Lua: %s", esp_err_to_name(run_err));
    }
    set_label(screen, line, 216);

    lvgl_port_unlock();
}

void app_main(void)
{
    ESP_LOGI(TAG, "VibeBoard Runtime start");

    vb_board_status_t board = {0};
    ESP_ERROR_CHECK(vb_board_start(&board));

    vb_app_registry_result_t apps = {0};
    esp_err_t scan_err = board.sd_ok ? vb_app_registry_scan(&apps) : board.sd_error;
    if (scan_err != ESP_OK) {
        ESP_LOGW(TAG, "app scan unavailable: %s", esp_err_to_name(scan_err));
    }

    vb_app_runner_result_t run = {0};
    esp_err_t run_err = (scan_err == ESP_OK && apps.app_count > 0) ? vb_app_runner_run(&apps, &run) : scan_err;

    show_boot_screen(&board, &apps, scan_err, &run, run_err);
    ESP_LOGI(TAG,
             "VibeBoard Runtime ready: sd=%s apps=%d lua=%s",
             board.sd_ok ? "ok" : "missing",
             apps.app_count,
             run_err == ESP_OK ? "ok" : "skip");
}
