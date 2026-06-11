# Lua Smoke Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute a minimal Lua app from the SD card and prove it through serial logs.

**Architecture:** Extend the existing app registry to return first-app entry metadata. Add a focused Lua runner component that owns Lua state setup, `print()` logging, and entry execution. Keep LVGL and NodeMCU bindings out of this slice.

**Tech Stack:** ESP-IDF 5.5.4, ESP-IDF component manager, Lua component, C, Node static tests.

---

### Task 1: Static Guardrails

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Write the failing test**

Add checks that expect:

```js
assert.match(appRegistryHeader, /first_app_entry/);
assert.match(appRegistryHeader, /first_app_path/);
assert.match(read("firmware/vibeboard_runtime/main/app_runner.c"), /luaL_newstate/);
assert.match(read("firmware/vibeboard_runtime/main/app_runner.c"), /luaL_dofile/);
assert.match(read("firmware/vibeboard_runtime/main/main.c"), /vb_app_runner_run/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:firmware-static
```

Expected: FAIL because `app_runner.c` does not exist and registry metadata is missing.

### Task 2: App Registry Metadata

**Files:**
- Modify: `firmware/vibeboard_runtime/main/app_registry.h`
- Modify: `firmware/vibeboard_runtime/main/app_registry.c`

- [ ] **Step 1: Implement first-app fields**

Extend `vb_app_registry_result_t` with:

```c
char first_app_entry[VB_APP_NAME_MAX];
char first_app_path[192];
```

Parse `entry = main.lua` from `app.info`; default to `main.lua` if missing. Fill `first_app_path` as `/sdcard/apps/<dir>/<entry>`.

- [ ] **Step 2: Run static test**

Run:

```bash
npm run test:firmware-static
```

Expected: still FAIL until the Lua runner exists.

### Task 3: Lua Runner

**Files:**
- Create: `firmware/vibeboard_runtime/main/app_runner.h`
- Create: `firmware/vibeboard_runtime/main/app_runner.c`
- Modify: `firmware/vibeboard_runtime/main/CMakeLists.txt`
- Modify: `firmware/vibeboard_runtime/main/idf_component.yml`

- [ ] **Step 1: Add runner interface**

Create `vb_app_runner_result_t` with:

```c
bool ran;
esp_err_t error;
char message[128];
```

Expose:

```c
esp_err_t vb_app_runner_run(const vb_app_registry_result_t *app, vb_app_runner_result_t *result);
```

- [ ] **Step 2: Add Lua execution**

Use `luaL_newstate`, `luaL_openlibs`, and `luaL_dofile`. Register `print()` so Lua output appears under an ESP-IDF log tag.

- [ ] **Step 3: Add dependencies**

Add the Lua source component to `idf_component.yml`, then add the matching component name to `main/CMakeLists.txt` if needed by ESP-IDF include/link rules.

### Task 4: Boot Flow Integration

**Files:**
- Modify: `firmware/vibeboard_runtime/main/main.c`

- [ ] **Step 1: Run the first app**

After `vb_app_registry_scan()`, call:

```c
vb_app_runner_result_t run = {0};
esp_err_t run_err = scan_err == ESP_OK && apps.app_count > 0
    ? vb_app_runner_run(&apps, &run)
    : scan_err;
```

Show `Lua: OK`, `Lua: no app`, or `Lua: <error>` on the boot screen.

- [ ] **Step 2: Run tests and build**

Run:

```bash
npm run test:firmware-static
npm test
python /Users/wq/esp-idf/tools/idf.py build
```

Expected: all tests pass and firmware builds.

### Task 5: Board Smoke Test

**Files:**
- Create: `apps/smoke/app.info`
- Create: `apps/smoke/main.lua`

- [ ] **Step 1: Add smoke app**

`app.info`:

```text
name = smoke
entry = main.lua
description = Lua smoke test
capabilities = 
```

`main.lua`:

```lua
print("hello from vibeboard lua")
```

- [ ] **Step 2: Package and copy smoke app to SD**

Run the packager or copy files so the SD card contains:

```text
/apps/smoke/app.info
/apps/smoke/main.lua
```

- [ ] **Step 3: Flash and verify serial**

Flash the new firmware and capture serial logs.

Expected:

```text
Lua app start: smoke
hello from vibeboard lua
Lua app ok
```

### Task 6: Documentation and Commit

**Files:**
- Modify: `docs/device-bringup.md`

- [ ] **Step 1: Record evidence**

Add the build, flash, and serial log evidence for the Lua smoke run.

- [ ] **Step 2: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-06-12-lua-smoke-runner-design.md docs/superpowers/plans/2026-06-12-lua-smoke-runner.md firmware/vibeboard_runtime apps/smoke tools/firmware-static-check/test.mjs docs/device-bringup.md
git commit -m "feat: run smoke Lua app from SD"
```
