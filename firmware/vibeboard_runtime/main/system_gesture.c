#include "system_gesture.h"

#include <stdbool.h>
#include <stdint.h>

#include "app_runner.h"
#include "board_lckfb_szpi_s3.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_lvgl_port.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lvgl.h"

static const char *TAG = "system_gesture";
#define VB_SYSTEM_EDGE_SWIPE_EDGE_PX 32
#define VB_SYSTEM_EDGE_SWIPE_MIN_DX 70
#define VB_SYSTEM_EDGE_SWIPE_MAX_DY 50
#define VB_SYSTEM_GESTURE_POLL_MS 30
#define VB_SYSTEM_GESTURE_COOLDOWN_MS 800
#define VB_SYSTEM_GESTURE_TASK_STACK 4096
#define VB_SYSTEM_GESTURE_TASK_PRIORITY 4

typedef enum {
    VB_SYSTEM_EDGE_NONE = 0,
    VB_SYSTEM_EDGE_LEFT,
    VB_SYSTEM_EDGE_RIGHT,
} vb_system_edge_t;

typedef struct {
    bool pressed;
    bool triggered;
    vb_system_edge_t edge;
    lv_point_t start;
} vb_system_gesture_state_t;

static bool s_gesture_task_started;

static lv_indev_state_t lv_indev_get_state(lv_indev_t *indev)
{
    if (indev == NULL) {
        return LV_INDEV_STATE_RELEASED;
    }
    return indev->proc.state;
}

static int abs_i16(int value)
{
    return value < 0 ? -value : value;
}

static vb_system_edge_t edge_for_start_x(lv_coord_t x)
{
    if (x <= VB_SYSTEM_EDGE_SWIPE_EDGE_PX) {
        return VB_SYSTEM_EDGE_LEFT;
    }
    if (x >= (VB_LCD_H_RES - VB_SYSTEM_EDGE_SWIPE_EDGE_PX)) {
        return VB_SYSTEM_EDGE_RIGHT;
    }
    return VB_SYSTEM_EDGE_NONE;
}

static bool should_trigger_exit(const vb_system_gesture_state_t *gesture, const lv_point_t *point)
{
    int dx = point->x - gesture->start.x;
    int dy = abs_i16(point->y - gesture->start.y);
    if (dy > VB_SYSTEM_EDGE_SWIPE_MAX_DY) {
        return false;
    }
    if (gesture->edge == VB_SYSTEM_EDGE_LEFT) {
        return dx >= VB_SYSTEM_EDGE_SWIPE_MIN_DX;
    }
    if (gesture->edge == VB_SYSTEM_EDGE_RIGHT) {
        return dx <= -VB_SYSTEM_EDGE_SWIPE_MIN_DX;
    }
    return false;
}

static void maybe_stop_running_app(vb_system_edge_t edge)
{
    if (vb_app_runner_current_state() != VB_APP_RUNNER_STATE_RUNNING) {
        return;
    }

    const char *message = edge == VB_SYSTEM_EDGE_LEFT ? "left edge swipe exit" : "right edge swipe exit";
    ESP_LOGI(TAG, "%s", message);
    esp_err_t err = vb_app_runner_stop();
    if (err != ESP_OK && err != ESP_ERR_NOT_FOUND) {
        ESP_LOGW(TAG, "edge swipe app stop failed: %s", esp_err_to_name(err));
    }
}

static bool read_touch(lv_indev_state_t *state, lv_point_t *point)
{
    lv_indev_t *indev = vb_board_touch_indev();
    if (indev == NULL) {
        return false;
    }

    lvgl_port_lock(0);
    *state = lv_indev_get_state(indev);
    lv_indev_get_point(indev, point);
    lvgl_port_unlock();
    return true;
}

static void update_gesture(vb_system_gesture_state_t *gesture,
                           lv_indev_state_t touch_state,
                           const lv_point_t *point,
                           TickType_t *cooldown_until)
{
    TickType_t now = xTaskGetTickCount();
    bool is_cooling_down = (int32_t)(*cooldown_until - now) > 0;
    bool is_pressed = touch_state == LV_INDEV_STATE_PR;

    if (!is_pressed) {
        gesture->pressed = false;
        gesture->triggered = false;
        gesture->edge = VB_SYSTEM_EDGE_NONE;
        return;
    }

    if (!gesture->pressed) {
        gesture->pressed = true;
        gesture->triggered = false;
        gesture->start = *point;
        gesture->edge = edge_for_start_x(point->x);
    }

    if (is_cooling_down || gesture->triggered || gesture->edge == VB_SYSTEM_EDGE_NONE) {
        return;
    }

    if (should_trigger_exit(gesture, point)) {
        gesture->triggered = true;
        *cooldown_until = now + pdMS_TO_TICKS(VB_SYSTEM_GESTURE_COOLDOWN_MS);
        maybe_stop_running_app(gesture->edge);
    }
}

static void system_gesture_task(void *arg)
{
    (void)arg;
    vb_system_gesture_state_t gesture = {0};
    TickType_t cooldown_until = 0;

    while (true) {
        lv_indev_state_t state = LV_INDEV_STATE_RELEASED;
        lv_point_t point = {0};
        if (read_touch(&state, &point)) {
            update_gesture(&gesture, state, &point, &cooldown_until);
        }
        vTaskDelay(pdMS_TO_TICKS(VB_SYSTEM_GESTURE_POLL_MS));
    }
}

esp_err_t vb_system_gesture_start(void)
{
    if (s_gesture_task_started) {
        return ESP_OK;
    }
    if (vb_board_touch_indev() == NULL) {
        ESP_LOGW(TAG, "touch unavailable; edge swipe exit disabled");
        return ESP_ERR_NOT_FOUND;
    }

    BaseType_t created = xTaskCreate(system_gesture_task,
                                     "vb_gesture",
                                     VB_SYSTEM_GESTURE_TASK_STACK,
                                     NULL,
                                     VB_SYSTEM_GESTURE_TASK_PRIORITY,
                                     NULL);
    if (created != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    s_gesture_task_started = true;
    ESP_LOGI(TAG, "edge swipe exit enabled");
    return ESP_OK;
}
