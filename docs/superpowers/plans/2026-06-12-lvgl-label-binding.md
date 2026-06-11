# LVGL Label Lua Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal Lua-to-LVGL bridge so an SD-card app can draw a visible label on the ESP32-S3 display.

**Architecture:** Register a tiny set of global Lua functions from `app_runner.c`. Keep LVGL object pointers inside `lua_lvgl.c` and expose integer handles to Lua. Draw the boot status screen before Lua starts so UI apps can clear it and own the final screen.

**Tech Stack:** ESP-IDF, FreeRTOS task-based Lua runner, georgik/lua, LVGL, esp_lvgl_port, Node static tests.

---

### Task 1: Static Guardrails

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Write failing tests**

Add checks that require `lua_lvgl.c`, `lua_lvgl.h`, the registration call, the LVGL API names, and `apps/smoke_ui/main.lua`.

- [ ] **Step 2: Verify red**

Run: `npm run test:firmware-static`

Expected: FAIL because `lua_lvgl.c` and `apps/smoke_ui/main.lua` do not exist yet.

### Task 2: Minimal LVGL Binding

**Files:**
- Create: `firmware/vibeboard_runtime/main/lua_lvgl.h`
- Create: `firmware/vibeboard_runtime/main/lua_lvgl.c`
- Modify: `firmware/vibeboard_runtime/main/app_runner.c`
- Modify: `firmware/vibeboard_runtime/main/CMakeLists.txt`

- [ ] **Step 1: Add the binding module**

Expose `void vb_lua_lvgl_register(lua_State *L);` and register these globals: `lv_scr_act`, `lv_obj_clean`, `lv_label_create`, `lv_label_set_text`, `lv_obj_align`, and `LV_ALIGN_CENTER`.

- [ ] **Step 2: Register it in the Lua runner**

Call `vb_lua_lvgl_register(L);` after standard Lua libraries and `print()` are registered.

- [ ] **Step 3: Verify green**

Run: `npm run test:firmware-static`

Expected: PASS.

### Task 3: Smoke UI App and Runtime Flow

**Files:**
- Create: `apps/smoke_ui/app.info`
- Create: `apps/smoke_ui/main.lua`
- Modify: `firmware/vibeboard_runtime/main/main.c`

- [ ] **Step 1: Add the app**

Create a smoke UI app that clears the active screen, creates one label, sets text to `Hello LVGL Lua`, centers it, and prints `lvgl smoke ok`.

- [ ] **Step 2: Adjust boot flow**

Draw the boot status before Lua starts. If Lua fails, redraw the boot status with the Lua error. If Lua succeeds, leave the app UI on screen.

- [ ] **Step 3: Verify all local tests**

Run: `npm test`

Expected: PASS.

### Task 4: Firmware and Board Verification

**Files:**
- Modify: `docs/device-bringup.md`

- [ ] **Step 1: Build firmware**

Run ESP-IDF build from `firmware/vibeboard_runtime`.

Expected: build completes without errors.

- [ ] **Step 2: Copy `smoke_ui` to SD**

Package `apps/smoke_ui`, copy it to `/Volumes/VIBESD/apps/smoke_ui`, and disable other app `app.info` files while testing.

- [ ] **Step 3: Flash and read serial logs**

Expected serial evidence: `Lua app start: smoke_ui`, `lvgl smoke ok`, `Lua app ok`.

- [ ] **Step 4: Record evidence**

Append the build, flash, and serial evidence to `docs/device-bringup.md`.
