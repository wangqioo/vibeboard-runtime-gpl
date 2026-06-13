# Device Launcher UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boot the ESP32-S3 runtime into a touchable on-device app list and launch apps only after the user taps one.

**Architecture:** Add a focused native LVGL module, `launcher_ui`, that renders the app list and calls the existing runner lifecycle. Change `app_main()` so it initializes board, SD, install service, and launcher, but no longer auto-runs the first app. Keep remote HTTP launch/stop behavior unchanged.

**Tech Stack:** ESP-IDF 5.5, C, LVGL 8.3, esp_lvgl_port, FT5x06 touch, existing `vb_app_registry_result_t` and `app_runner` APIs, Node.js static guardrails.

---

## File Structure

- Create: `firmware/vibeboard_runtime/main/launcher_ui.h`
  - Public entrypoint for showing the native launcher screen.
- Create: `firmware/vibeboard_runtime/main/launcher_ui.c`
  - LVGL screen rendering, app button event callbacks, runner stop/switch/launch calls.
- Modify: `firmware/vibeboard_runtime/main/CMakeLists.txt`
  - Compile `launcher_ui.c`.
- Modify: `firmware/vibeboard_runtime/main/main.c`
  - Include `launcher_ui.h`; call launcher instead of automatically running the first app.
- Modify: `tools/firmware-static-check/test.mjs`
  - Add static guardrails for launcher source/header, CMake registration, LVGL events, and removal of automatic boot launch.
- Modify: `docs/runtime-capabilities.md`
  - Mark on-device launcher as build-verified first, board-verified after flashing.
- Modify: `docs/device-bringup.md`
  - Add the build and board verification notes after implementation.

## Task 1: Static Guardrail For Launcher Boot Flow

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add launcher paths near the other firmware path constants**

```js
const launcherHeaderPath = join(firmwareRoot, "main/launcher_ui.h");
const launcherSourcePath = join(firmwareRoot, "main/launcher_ui.c");
```

- [ ] **Step 2: Replace the old first-app runner assertion**

Rename the existing test named `"runs the first app through a Lua runner"` to `"exposes Lua runner lifecycle for launcher and HTTP launch"` and replace the final main assertion:

```js
assert.doesNotMatch(main, /vb_app_runner_run\(&s_apps,\s*&run\)/);
assert.match(main, /vb_launcher_ui_show\(&s_apps,\s*scan_err\)/);
```

- [ ] **Step 3: Add a new failing launcher static test**

Add this test after the runner lifecycle test:

```js
it("boots into a native touch launcher", () => {
  const header = readRequired(launcherHeaderPath);
  const source = readRequired(launcherSourcePath);
  const cmake = readRequired(cmakePath);
  const main = readRequired(mainSourcePath);

  assert.match(cmake, /launcher_ui\.c/);
  assert.match(header, /vb_launcher_ui_show/);
  assert.match(source, /VibeBoard Apps/);
  assert.match(source, /lv_btn_create/);
  assert.match(source, /lv_obj_add_event_cb/);
  assert.match(source, /LV_EVENT_CLICKED/);
  assert.match(source, /vb_app_runner_is_running/);
  assert.match(source, /vb_app_runner_current_id/);
  assert.match(source, /vb_app_runner_stop/);
  assert.match(source, /vb_app_runner_wait_stopped\(1500\)/);
  assert.match(source, /vb_app_runner_launch_async/);
  assert.match(main, /#include "launcher_ui\.h"/);
  assert.match(main, /vb_launcher_ui_show\(&s_apps,\s*scan_err\)/);
  assert.doesNotMatch(main, /vb_app_runner_run\(&s_apps,\s*&run\)/);
});
```

- [ ] **Step 4: Run the static test and verify RED**

Run:

```bash
npm run test:firmware-static
```

Expected: FAIL because `launcher_ui.h` or `launcher_ui.c` does not exist, or because `main.c` still auto-runs the first app.

## Task 2: Native Launcher UI

**Files:**
- Create: `firmware/vibeboard_runtime/main/launcher_ui.h`
- Create: `firmware/vibeboard_runtime/main/launcher_ui.c`
- Modify: `firmware/vibeboard_runtime/main/CMakeLists.txt`
- Modify: `firmware/vibeboard_runtime/main/main.c`

- [ ] **Step 1: Create `launcher_ui.h`**

```c
#pragma once

#include "app_registry.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

void vb_launcher_ui_show(const vb_app_registry_result_t *apps, esp_err_t scan_err);

#ifdef __cplusplus
}
#endif
```

- [ ] **Step 2: Create `launcher_ui.c`**

```c
#include "launcher_ui.h"

#include <stdbool.h>
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
    return label;
}

static void create_app_button(lv_obj_t *parent, const vb_app_registry_entry_t *app)
{
    lv_obj_t *button = lv_btn_create(parent);
    lv_obj_set_width(button, 296);
    lv_obj_set_height(button, 44);
    lv_obj_add_event_cb(button, app_button_event_cb, LV_EVENT_CLICKED, (void *)app);

    lv_obj_t *name = create_label(button, app->name[0] ? app->name : app->id, 260);
    lv_obj_align(name, LV_ALIGN_TOP_LEFT, 10, 6);

    lv_obj_t *id = create_label(button, app->id, 260);
    lv_obj_set_style_text_font(id, &lv_font_montserrat_12, 0);
    lv_obj_align(id, LV_ALIGN_TOP_LEFT, 10, 25);
}

void vb_launcher_ui_show(const vb_app_registry_result_t *apps, esp_err_t scan_err)
{
    lvgl_port_lock(0);

    lv_obj_t *screen = lv_scr_act();
    lv_obj_clean(screen);
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x101418), 0);
    lv_obj_set_style_text_color(screen, lv_color_hex(0xf4f7fb), 0);

    lv_obj_t *title = create_label(screen, "VibeBoard Apps", 296);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
    lv_obj_align(title, LV_ALIGN_TOP_LEFT, 12, 10);

    s_status_label = create_label(screen, "", 296);
    lv_obj_set_style_text_color(s_status_label, lv_color_hex(0xb6c2d1), 0);
    lv_obj_align(s_status_label, LV_ALIGN_TOP_LEFT, 12, 38);

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
    lv_obj_set_size(list, 312, 174);
    lv_obj_align(list, LV_ALIGN_TOP_LEFT, 4, 62);
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
```

- [ ] **Step 3: Add `launcher_ui.c` to CMake**

In `firmware/vibeboard_runtime/main/CMakeLists.txt`, add this source next to the other runtime sources:

```cmake
        "launcher_ui.c"
```

- [ ] **Step 4: Change `main.c` boot flow**

Add:

```c
#include "launcher_ui.h"
```

Remove the local `set_label()` and `show_boot_screen()` helper functions if they become unused.

Replace the final automatic runner block:

```c
    vb_app_runner_result_t run = {0};
    esp_err_t run_err = (scan_err == ESP_OK && s_apps.app_count > 0) ? vb_app_runner_run(&s_apps, &run) : scan_err;
    if (run_err != ESP_OK) {
        show_boot_screen(&board, &s_apps, scan_err, &run, run_err);
    }
    ESP_LOGI(TAG,
             "VibeBoard Runtime ready: sd=%s apps=%d lua=%s",
             board.sd_ok ? "ok" : "missing",
             s_apps.app_count,
             run_err == ESP_OK ? "ok" : "skip");
```

With:

```c
    vb_launcher_ui_show(&s_apps, scan_err);
    ESP_LOGI(TAG,
             "VibeBoard Runtime ready: sd=%s apps=%d launcher=ok",
             board.sd_ok ? "ok" : "missing",
             s_apps.app_count);
```

- [ ] **Step 5: Run the static test and verify GREEN**

Run:

```bash
npm run test:firmware-static
```

Expected: PASS.

- [ ] **Step 6: Commit launcher implementation**

```bash
git add firmware/vibeboard_runtime/main/launcher_ui.h firmware/vibeboard_runtime/main/launcher_ui.c firmware/vibeboard_runtime/main/CMakeLists.txt firmware/vibeboard_runtime/main/main.c tools/firmware-static-check/test.mjs
git commit -m "feat: add device launcher ui"
```

## Task 3: Build Verification And Docs

**Files:**
- Modify: `docs/runtime-capabilities.md`
- Modify: `docs/device-bringup.md`

- [ ] **Step 1: Run the repo tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Build firmware**

Run from `firmware/vibeboard_runtime` with ESP-IDF exported:

```bash
idf.py build
```

Expected: PASS and a generated `build/vibeboard_runtime.bin`.

- [ ] **Step 3: Update runtime capabilities**

Add a row to `docs/runtime-capabilities.md`:

```markdown
| Device Launcher | native LVGL app list, tap-to-launch via `vb_launcher_ui_show` | `build-verified` | Firmware boots to the native app list instead of auto-running the first app; tapping an app uses the same runner lifecycle as remote `/launch`. |
```

If board verification is completed in Task 4, update this same row to `board-verified` with the board evidence.

- [ ] **Step 4: Add build verification notes**

Append to `docs/device-bringup.md`:

````markdown
## 2026-06-13 device launcher UI build check

Added a native LVGL launcher screen:

```text
VibeBoard Apps
tap app -> vb_app_runner_launch_async()
```

Verification:

```text
npm run test:firmware-static passed.
npm test passed.
idf.py build passed.
```

Result: device launcher UI is build-verified. Board verification still needs flashing and touch testing on the physical screen.
````

- [ ] **Step 5: Commit build docs**

```bash
git add docs/runtime-capabilities.md docs/device-bringup.md
git commit -m "docs: record device launcher build check"
```

## Task 4: Board Flash And Touch Verification

**Files:**
- Modify: `docs/runtime-capabilities.md`
- Modify: `docs/device-bringup.md`

- [ ] **Step 1: Flash the board**

Run from `firmware/vibeboard_runtime` with ESP-IDF exported and the board port connected:

```bash
idf.py -p /dev/cu.usbmodem112301 flash monitor
```

Expected serial evidence:

```text
VibeBoard Runtime ready: sd=ok apps=3 launcher=ok
```

- [ ] **Step 2: Confirm the screen manually**

Expected physical result:

```text
The screen shows "VibeBoard Apps" and app buttons.
No app starts automatically.
```

- [ ] **Step 3: Tap `smoke_visual_remote`**

Expected serial evidence:

```text
launcher selected app: smoke_visual_remote
Lua async launch: smoke_visual
Lua app start: smoke_visual
```

- [ ] **Step 4: Reboot and tap `smoke_network`**

Expected serial evidence:

```text
launcher selected app: smoke_network
Lua async launch: smoke_network
Lua app start: smoke_network
Lua async finished: smoke_network status=ESP_OK message=ok
```

- [ ] **Step 5: Update board verification docs**

Update the Device Launcher row in `docs/runtime-capabilities.md` to `board-verified`.

Append to `docs/device-bringup.md`:

````markdown
## 2026-06-13 device launcher UI board verification

Board port:

```text
/dev/cu.usbmodem112301
```

Boot evidence:

```text
VibeBoard Runtime ready: sd=ok apps=3 launcher=ok
```

Touch launch evidence:

```text
launcher selected app: smoke_visual_remote
Lua async launch: smoke_visual
Lua app start: smoke_visual

launcher selected app: smoke_network
Lua async launch: smoke_network
Lua app start: smoke_network
Lua async finished: smoke_network status=ESP_OK message=ok
```

Result: the device now boots to the on-screen app list and launches apps after touch selection.
````

- [ ] **Step 6: Commit board verification docs**

```bash
git add docs/runtime-capabilities.md docs/device-bringup.md
git commit -m "docs: verify device launcher on board"
```

## Self-Review

- Spec coverage: The plan covers native launcher module, boot flow change, touch app buttons, reuse of runner stop/switch/launch, build verification, and board verification.
- Scope check: The plan excludes app icons, Lua launcher, pagination, and a persistent return overlay, matching the design.
- Type consistency: The plan uses existing `vb_app_registry_result_t`, `vb_app_registry_entry_t`, `vb_app_runner_*`, `lv_event_t`, and `esp_err_t` APIs consistently.
