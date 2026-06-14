# Phase 5B Launcher Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native launcher stop, return, refresh, and failure-feedback controls for the Phase 5B device-side lifecycle loop.

**Architecture:** Keep `app_runner` as lifecycle owner and keep `app_registry` as the only app-list source. Extend `launcher_ui.c` with small, native LVGL controls and task-safe rebuild helpers. Add a narrow runner failure-message accessor only if needed for screen-visible failure text.

**Tech Stack:** ESP-IDF C firmware, LVGL 8, FreeRTOS tasks, Lua runtime bindings, Node.js `node:test` static firmware guardrails.

---

## File Structure

- Modify `tools/firmware-static-check/test.mjs`: add static guardrails before changing firmware.
- Modify `firmware/vibeboard_runtime/main/app_runner.h`: declare last-status/message accessors.
- Modify `firmware/vibeboard_runtime/main/app_runner.c`: store and expose the last async result message.
- Modify `firmware/vibeboard_runtime/main/launcher_ui.c`: add refresh controls, stop/return flow, failure text, and a task-safe launcher rebuild path.
- Modify `docs/runtime-capabilities.md`: update Phase 5B launcher capability status after implementation.
- Modify `docs/next-session-plan.md`: remove completed launcher-control items or mark them done.

## Task 1: Add Firmware Static Guardrails

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Write the failing tests**

Add these tests inside `describe("vibeboard runtime firmware static guardrails", () => { ... })`, near the existing launcher and lifecycle tests:

```js
  it("exposes the last Lua runner result for launcher failure feedback", () => {
    const header = readRequired(runnerSourcePath);
    const runner = readRequired(runnerSourcePath);

    assert.match(header, /vb_app_runner_last_status/);
    assert.match(header, /vb_app_runner_last_message/);
    assert.match(runner, /last_message/);
    assert.match(runner, /vb_app_runner_last_status/);
    assert.match(runner, /vb_app_runner_last_message/);
    assert.match(runner, /strlcpy\(s_runner_state\.last_message/);
  });

  it("keeps native launcher refresh and stop controls on the device screen", () => {
    const source = readRequired(launcherSourcePath);

    assert.match(source, /create_control_button/);
    assert.match(source, /Stop/);
    assert.match(source, /Refresh/);
    assert.match(source, /stop_button_event_cb/);
    assert.match(source, /refresh_button_event_cb/);
    assert.match(source, /refresh_launcher_from_event/);
    assert.match(source, /refresh_launcher_from_task/);
    assert.match(source, /vb_app_registry_scan/);
    assert.match(source, /vb_app_runner_stop/);
    assert.match(source, /vb_app_runner_wait_stopped/);
  });

  it("returns to the native launcher after stop or async app failure", () => {
    const source = readRequired(launcherSourcePath);

    assert.match(source, /start_return_to_launcher_task/);
    assert.match(source, /return_to_launcher_task/);
    assert.match(source, /vb_app_runner_is_running/);
    assert.match(source, /vb_app_runner_current_state_name/);
    assert.match(source, /vb_app_runner_last_message/);
    assert.match(source, /Failed:/);
    assert.match(source, /Stopped/);
    assert.match(source, /launcher inactive; BOOT long press: stop app/);
  });
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
npm run test:firmware-static
```

Expected: FAIL. The failure should mention missing `vb_app_runner_last_status`, `create_control_button`, or `start_return_to_launcher_task`.

- [ ] **Step 3: Commit the failing tests**

Do not commit production changes in this task.

```bash
git add tools/firmware-static-check/test.mjs
git commit -m "test: add launcher phase 5b guardrails"
```

## Task 2: Add Runner Last Result Accessors

**Files:**
- Modify: `firmware/vibeboard_runtime/main/app_runner.h`
- Modify: `firmware/vibeboard_runtime/main/app_runner.c`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add the API declarations**

In `app_runner.h`, add declarations after `vb_app_runner_current_state_name(void);`:

```c
esp_err_t vb_app_runner_last_status(void);
const char *vb_app_runner_last_message(void);
```

- [ ] **Step 2: Store the last message in runner state**

In `app_runner.c`, extend `vb_app_runner_state_t`:

```c
typedef struct {
    volatile vb_app_runner_lifecycle_state_t lifecycle_state;
    volatile bool stop_requested;
    char current_id[VB_APP_NAME_MAX];
    char current_name[VB_APP_NAME_MAX];
    esp_err_t last_status;
    char last_message[128];
} vb_app_runner_state_t;
```

In `vb_app_runner_launch_async`, after `s_runner_state.last_status = ESP_OK;`, clear the last message:

```c
    s_runner_state.last_status = ESP_OK;
    strlcpy(s_runner_state.last_message, "", sizeof(s_runner_state.last_message));
```

In `lua_async_task`, after `s_runner_state.last_status = status;`, persist the result message:

```c
    s_runner_state.last_status = status;
    strlcpy(s_runner_state.last_message,
            context->result.message[0] ? context->result.message : esp_err_to_name(status),
            sizeof(s_runner_state.last_message));
```

At the bottom of `app_runner.c`, add:

```c
esp_err_t vb_app_runner_last_status(void)
{
    return s_runner_state.last_status;
}

const char *vb_app_runner_last_message(void)
{
    return s_runner_state.last_message;
}
```

- [ ] **Step 3: Run the focused test**

Run:

```bash
npm run test:firmware-static
```

Expected: still FAIL, because launcher controls are not implemented yet. The runner accessor assertions should now pass.

- [ ] **Step 4: Commit runner accessors**

```bash
git add firmware/vibeboard_runtime/main/app_runner.h firmware/vibeboard_runtime/main/app_runner.c
git commit -m "feat: expose runner last result"
```

## Task 3: Refactor Launcher Rendering For Rebuilds

**Files:**
- Modify: `firmware/vibeboard_runtime/main/launcher_ui.c`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Extract a rebuild helper**

In `launcher_ui.c`, add a persistent scan error and status override near the existing static globals:

```c
static esp_err_t s_scan_err;
static char s_pending_status[96];
```

Add this helper before `vb_launcher_ui_show`:

```c
static void set_pending_status(const char *text)
{
    strlcpy(s_pending_status, text ? text : "", sizeof(s_pending_status));
}
```

Rename the body of `vb_launcher_ui_show` into:

```c
static void rebuild_launcher_unlocked(const vb_app_registry_result_t *apps, esp_err_t scan_err)
```

Keep all existing LVGL drawing work inside this helper, but remove `lvgl_port_lock(0);`, `lvgl_port_unlock();`, and `start_boot_key_task();` from the helper.

Then make the public function a thin wrapper:

```c
void vb_launcher_ui_show(const vb_app_registry_result_t *apps, esp_err_t scan_err)
{
    s_apps = apps;
    s_scan_err = scan_err;

    lvgl_port_lock(0);
    rebuild_launcher_unlocked(apps, scan_err);
    lvgl_port_unlock();

    start_boot_key_task();
}
```

- [ ] **Step 2: Preserve existing initial status behavior**

Inside `rebuild_launcher_unlocked`, after the app buttons are created and `update_selection_unlocked();` has run, apply a pending status if present:

```c
    update_selection_unlocked();
    if (s_pending_status[0] != '\0') {
        set_status_unlocked(s_pending_status);
        s_pending_status[0] = '\0';
    }
```

For scan errors and no-app states, also prefer pending status when present:

```c
    if (scan_err != ESP_OK) {
        char line[96];
        snprintf(line, sizeof(line), "Apps: %s", esp_err_to_name(scan_err));
        set_status_unlocked(s_pending_status[0] ? s_pending_status : line);
        s_pending_status[0] = '\0';
        return;
    }
```

Use the same pattern for `No apps on SD`.

- [ ] **Step 3: Run focused test**

Run:

```bash
npm run test:firmware-static
```

Expected: still FAIL, because stop/refresh controls and return task are not implemented yet.

- [ ] **Step 4: Commit launcher rebuild helper**

```bash
git add firmware/vibeboard_runtime/main/launcher_ui.c
git commit -m "refactor: split launcher rebuild path"
```

## Task 4: Add Refresh And Stop Controls

**Files:**
- Modify: `firmware/vibeboard_runtime/main/launcher_ui.c`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add control-button helper and callbacks**

Add this helper near `create_label`:

```c
static lv_obj_t *create_control_button(lv_obj_t *parent, const char *text, lv_event_cb_t cb)
{
    lv_obj_t *button = lv_btn_create(parent);
    lv_obj_set_size(button, 96, 32);
    lv_obj_add_event_cb(button, cb, LV_EVENT_CLICKED, NULL);

    lv_obj_t *label = create_label(button, text, 78);
    lv_obj_center(label);
    return button;
}
```

Add refresh helpers:

```c
static void refresh_launcher_from_event(const char *status)
{
    if (s_apps == NULL) {
        return;
    }
    esp_err_t err = vb_app_registry_scan((vb_app_registry_result_t *)s_apps);
    set_pending_status(status ? status : (err == ESP_OK ? "Refreshed" : esp_err_to_name(err)));
    rebuild_launcher_unlocked(s_apps, err);
}

static void refresh_launcher_from_task(const char *status)
{
    if (s_apps == NULL) {
        return;
    }
    esp_err_t err = vb_app_registry_scan((vb_app_registry_result_t *)s_apps);
    set_pending_status(status ? status : (err == ESP_OK ? "Refreshed" : esp_err_to_name(err)));
    lvgl_port_lock(0);
    rebuild_launcher_unlocked(s_apps, err);
    lvgl_port_unlock();
}
```

Add event callbacks:

```c
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
    set_status_unlocked("Stopping");
    esp_err_t err = vb_app_runner_stop();
    if (err != ESP_OK && err != ESP_ERR_NOT_FOUND) {
        set_status_unlocked(esp_err_to_name(err));
        return;
    }
    err = vb_app_runner_wait_stopped(1500);
    if (err != ESP_OK) {
        set_status_unlocked("Stop timeout");
        return;
    }
    refresh_launcher_from_event("Stopped");
}
```

- [ ] **Step 2: Draw the controls**

Inside `rebuild_launcher_unlocked`, after the app list block or no-app message setup, create a compact control row:

```c
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
```

If vertical space is tight, reduce the app list height from `178` to `138` and keep the controls at the bottom. Preserve 320x240 fit.

- [ ] **Step 3: Run focused test**

Run:

```bash
npm run test:firmware-static
```

Expected: still FAIL only on return-task assertions.

- [ ] **Step 4: Commit controls**

```bash
git add firmware/vibeboard_runtime/main/launcher_ui.c
git commit -m "feat: add launcher stop and refresh controls"
```

## Task 5: Return To Launcher After Stop Or Failure

**Files:**
- Modify: `firmware/vibeboard_runtime/main/launcher_ui.c`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add return task state**

Near launcher globals, add:

```c
static bool s_return_task_running;
```

- [ ] **Step 2: Add return status formatter**

Add:

```c
static void build_return_status(char *line, size_t line_size)
{
    const char *state = vb_app_runner_current_state_name();
    const char *message = vb_app_runner_last_message();
    if (strcmp(state, "failed") == 0) {
        snprintf(line, line_size, "Failed: %s", message && message[0] ? message : "Lua app failed");
    } else {
        snprintf(line, line_size, "Stopped");
    }
}
```

- [ ] **Step 3: Add return-to-launcher task**

Add:

```c
static void return_to_launcher_task(void *arg)
{
    (void)arg;
    while (vb_app_runner_is_running()) {
        vTaskDelay(pdMS_TO_TICKS(80));
    }

    char line[96];
    build_return_status(line, sizeof(line));
    refresh_launcher_from_task(line);
    s_return_task_running = false;
    vTaskDelete(NULL);
}

static void start_return_to_launcher_task(void)
{
    if (s_return_task_running) {
        return;
    }
    BaseType_t created = xTaskCreate(return_to_launcher_task, "vb_launcher_return", 4096, NULL, 4, NULL);
    s_return_task_running = created == pdPASS;
}
```

- [ ] **Step 4: Start the return task after successful launcher launch**

In `launch_app`, when `vb_app_runner_launch_async(app)` returns `ESP_OK`, call `start_return_to_launcher_task();` after deactivating launcher controls:

```c
    if (err == ESP_OK) {
        if (from_task) {
            deactivate_launcher_from_task();
        } else {
            deactivate_launcher_unlocked();
        }
        start_return_to_launcher_task();
    } else {
```

- [ ] **Step 5: Let BOOT long press stop inactive apps**

In `launch_selected_from_task`, replace the inactive branch:

```c
    if (!s_launcher_active) {
        if (vb_app_runner_is_running()) {
            ESP_LOGI(TAG, "launcher inactive; BOOT long press: stop app");
            esp_err_t err = vb_app_runner_stop();
            if (err != ESP_OK && err != ESP_ERR_NOT_FOUND) {
                ESP_LOGW(TAG, "stop from BOOT failed: %s", esp_err_to_name(err));
            }
        } else {
            ESP_LOGI(TAG, "launcher inactive; BOOT long press: return to launcher");
            refresh_launcher_from_task(vb_app_runner_last_message());
        }
        return;
    }
```

Keep short press ignored while inactive.

- [ ] **Step 6: Run focused test to verify GREEN**

Run:

```bash
npm run test:firmware-static
```

Expected: PASS.

- [ ] **Step 7: Commit return flow**

```bash
git add firmware/vibeboard_runtime/main/launcher_ui.c
git commit -m "feat: return to launcher after app stop"
```

## Task 6: Update Documentation And Run Full Verification

**Files:**
- Modify: `docs/runtime-capabilities.md`
- Modify: `docs/next-session-plan.md`
- Test: full local suite

- [ ] **Step 1: Update runtime capabilities**

In `docs/runtime-capabilities.md`, update the Device Launcher row to mention build verification for stop/refresh/failure controls. Use `build-verified` if this has not yet been board-tested.

Example wording:

```markdown
| Device Launcher | native LVGL app list, tap-to-launch, BOOT short-select/long-launch, screen stop/refresh/failure feedback | `build-verified` | Phase 5B launcher controls are covered by static tests; board verification still required. |
```

- [ ] **Step 2: Update next-session plan**

In `docs/next-session-plan.md`, move launcher UI controls out of Immediate Next Work once implementation is complete, and leave board verification as the next hardware task.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
git diff --check
```

Expected: both pass.

- [ ] **Step 4: Commit docs**

```bash
git add docs/runtime-capabilities.md docs/next-session-plan.md
git commit -m "docs: update launcher controls status"
```

## Task 7: Hardware Verification Handoff

**Files:**
- Modify only after board testing: `docs/device-bringup.md`

- [ ] **Step 1: Build firmware**

Run from `firmware/vibeboard_runtime` with the ESP-IDF environment loaded:

```bash
idf.py build
```

Expected: build succeeds.

- [ ] **Step 2: Flash and smoke test on board**

Use the current board serial device documented in `docs/development-plan.md` if available.

Manual checks:

- boot shows native launcher;
- tap app launches it;
- BOOT long press while app is running stops it;
- launcher returns after stop;
- Refresh rescans the SD app list;
- `smoke_fail` returns to launcher with visible failure text.

- [ ] **Step 3: Record board evidence**

Append concise evidence to `docs/device-bringup.md`:

```markdown
## 2026-06-14 Phase 5B Launcher Controls

- Firmware build: pass.
- Boot to launcher: pass.
- Stop current app from device control: pass.
- Refresh app list: pass.
- `smoke_fail` failure visible on screen: pass.
- Notes: Serial logs match the screen result, and any remaining limitations are listed in prose immediately below this checklist.
```

- [ ] **Step 4: Commit board evidence**

```bash
git add docs/device-bringup.md
git commit -m "docs: record launcher controls board verification"
```

## Plan Self-Review

- Spec coverage: stop, return, refresh, failure feedback, shared registry, and TDD guardrails are covered.
- Scope check: upload staging, Lua `app.*`, touch event APIs, native module ABI, and LVGL expansion remain out of scope.
- Type consistency: functions use existing `vb_app_runner_*`, `vb_app_registry_scan`, LVGL event callback, and FreeRTOS task patterns.
- Placeholder scan: no task depends on missing implementation details.
