# Weather Card LVGL Lua Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the minimal LVGL Lua bridge enough for a static weather card demo on the ESP32-S3 display.

**Architecture:** Keep the binding in `lua_lvgl.c` as a small integer-handle bridge over LVGL objects. Add only card layout/style functions and alignment constants. Update `apps/smoke_ui` to exercise those functions from SD card.

**Tech Stack:** ESP-IDF, LVGL 8, esp_lvgl_port, georgik/lua, Node static tests.

---

### Task 1: Static Tests

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Extend the LVGL binding test**

Require `lv_obj_create`, size setters, style setters, and new alignment constants in `lua_lvgl.c`.

- [ ] **Step 2: Extend the smoke UI test**

Require `apps/smoke_ui/main.lua` to render weather-card text and print `weather card ok`.

- [ ] **Step 3: Verify red**

Run: `npm run test:firmware-static`

Expected: FAIL because the new API and weather-card script are not implemented yet.

### Task 2: Binding Implementation

**Files:**
- Modify: `firmware/vibeboard_runtime/main/lua_lvgl.c`

- [ ] **Step 1: Add object creation**

Register `lv_obj_create(parent)` and store the returned object handle.

- [ ] **Step 2: Add size and style setters**

Register size, width, height, background color, text color, radius, padding, border width, and border color setters.

- [ ] **Step 3: Add alignment constants**

Expose `LV_ALIGN_TOP_LEFT`, `LV_ALIGN_TOP_MID`, and `LV_ALIGN_BOTTOM_LEFT`.

- [ ] **Step 4: Verify green**

Run: `npm run test:firmware-static`

Expected: PASS.

### Task 3: Weather Card Demo

**Files:**
- Modify: `apps/smoke_ui/main.lua`

- [ ] **Step 1: Replace Hello label with a card UI**

Create a dark root background, one card container, and labels for `VibeBoard Weather`, `Shenzhen`, `26C`, `Cloudy`, `Humidity 68%`, and `Wind 12 km/h`.

- [ ] **Step 2: Verify all Node tests**

Run: `npm test`

Expected: PASS.

### Task 4: Board Verification

**Files:**
- Modify: `docs/device-bringup.md`

- [ ] **Step 1: Build firmware**

Run `idf.py build` from `firmware/vibeboard_runtime`.

- [ ] **Step 2: Package and write SD app**

Run `npm run package:app -- apps/smoke_ui`, copy it to `/Volumes/VIBESD/apps/smoke_ui`, and keep only `/apps/smoke_ui/app.info` enabled.

- [ ] **Step 3: Flash and monitor**

Flash the firmware and capture serial logs showing `Lua app start: smoke_ui`, `weather card ok`, and `Lua app ok`.

- [ ] **Step 4: Record evidence**

Append the board evidence to `docs/device-bringup.md` and commit it.
