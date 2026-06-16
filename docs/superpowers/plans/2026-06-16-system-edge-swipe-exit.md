# System Edge Swipe Exit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a firmware-level left/right edge swipe gesture that exits the currently running Lua app and returns to the native launcher.

**Architecture:** Keep the gesture outside Lua apps. The board layer exposes the LVGL touch input device, a new system gesture task polls pointer state, and the task calls the existing app runner stop path when a horizontal edge swipe is recognized.

**Tech Stack:** ESP-IDF, LVGL, esp_lvgl_port, FreeRTOS, Node static firmware tests.

---

### Task 1: Static Guardrail

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] Add a failing test that checks for `system_gesture.c`, `system_gesture.h`, `vb_board_touch_indev`, edge thresholds, LVGL input polling, and `vb_app_runner_stop`.
- [ ] Run `npm run test:firmware-static`.
- [ ] Expected result before implementation: fail because `system_gesture.c` does not exist.

### Task 2: Touch Indev Accessor

**Files:**
- Modify: `firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.h`
- Modify: `firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.c`

- [ ] Store the return value of `lvgl_port_add_touch`.
- [ ] Expose it through `lv_indev_t *vb_board_touch_indev(void)`.
- [ ] Return `ESP_FAIL` from touch init if the port returns `NULL`.

### Task 3: System Gesture Watcher

**Files:**
- Create: `firmware/vibeboard_runtime/main/system_gesture.h`
- Create: `firmware/vibeboard_runtime/main/system_gesture.c`
- Modify: `firmware/vibeboard_runtime/main/CMakeLists.txt`
- Modify: `firmware/vibeboard_runtime/main/main.c`

- [ ] Add `vb_system_gesture_start()`.
- [ ] Poll `lv_indev_get_state()` and `lv_indev_get_point()` under `lvgl_port_lock()`.
- [ ] Track swipes starting inside the left or right `32px` edge.
- [ ] Trigger only when horizontal distance is at least `70px` and vertical drift is at most `50px`.
- [ ] Call `vb_app_runner_stop()` only when `vb_app_runner_current_state() == VB_APP_RUNNER_STATE_RUNNING`.
- [ ] Add a cooldown so one press cannot trigger repeated exits.
- [ ] Start the watcher from `app_main()` after board start.

### Task 4: Verification

**Files:**
- Verify all touched files.

- [ ] Run `npm run test:firmware-static`.
- [ ] Run `npm test`.
- [ ] Build and flash with ESP-IDF.
- [ ] Launch a demo app, swipe from either screen edge, and verify `/status` returns idle or launcher is visible.
