# Camera QVGA Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve camera preview clarity by trying native 320x240 QVGA preview first with automatic fallback to the stable 160x120 scaled preview.

**Architecture:** Keep camera frame-size selection in the board Runtime layer. Lua keeps using `camera.preview_start()` and reads `camera.status()` / smoke metrics for the actual selected preview mode. QVGA direct draw and QQVGA scaled draw share the same preview task and display takeover lifecycle.

**Tech Stack:** ESP-IDF 5.5, `esp32-camera`, GC2145 RGB565, ST7789 RGB565 LCD writes, Lua camera module, Node `node:test` static guardrails.

---

### Task 1: Static Guardrails

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Write failing assertions**

Add assertions inside `registers a Lua camera module backed by the board GC2145 camera` for:

```js
assert.match(boardHeader, /vb_board_camera_preview_mode/);
assert.match(boardSource, /VB_CAMERA_PREVIEW_MODE_QVGA_DIRECT/);
assert.match(boardSource, /VB_CAMERA_PREVIEW_MODE_QQVGA_SCALED/);
assert.match(boardSource, /vb_board_camera_preview_start_mode\(VB_CAMERA_PREVIEW_MODE_QVGA_DIRECT\)/);
assert.match(boardSource, /vb_board_camera_preview_start_mode\(VB_CAMERA_PREVIEW_MODE_QQVGA_SCALED\)/);
assert.match(boardSource, /qvga-direct/);
assert.match(boardSource, /qqvga-scaled/);
assert.match(cameraSource, /preview_mode/);
assert.match(cameraSource, /preview_width/);
assert.match(cameraSource, /preview_height/);
assert.match(smokeSource, /preview_mode/);
assert.match(smokeSource, /preview_width/);
assert.match(smokeSource, /preview_height/);
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tools/firmware-static-check/test.mjs --test-name-pattern camera
```

Expected: fails because preview mode API and metrics are not implemented yet.

### Task 2: Board Preview Mode Selection

**Files:**
- Modify: `firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.h`
- Modify: `firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.c`

- [ ] **Step 1: Add preview mode enum and status API**

Add an enum with `stopped`, `qvga-direct`, and `qqvga-scaled` modes, and expose `vb_board_camera_preview_mode(...)`.

- [ ] **Step 2: Split preview start by mode**

Replace the fixed QQVGA start with `vb_board_camera_preview_start_mode(mode)`. QVGA mode calls `vb_board_camera_start(VB_LCD_H_RES, VB_LCD_V_RES, "rgb565")`; QQVGA mode calls `vb_board_camera_start(VB_LCD_H_RES / 2, VB_LCD_V_RES / 2, "rgb565")`.

- [ ] **Step 3: Add fallback**

Make `vb_board_camera_preview_start()` call QVGA first. If it fails, stop the camera/display state and retry QQVGA.

- [ ] **Step 4: Preserve cleanup**

Ensure `vb_board_camera_preview_stop()` sets preview mode back to stopped after the task exits, and `vb_board_camera_stop()` releases display takeover on all failure paths.

### Task 3: Lua Status And Smoke Metrics

**Files:**
- Modify: `firmware/vibeboard_runtime/main/lua_camera.c`
- Modify: `apps/smoke_camera/main.lua`

- [ ] **Step 1: Expose status fields**

Add `preview_mode`, `preview_width`, and `preview_height` to `camera.status()`.

- [ ] **Step 2: Record smoke metrics**

After `camera.preview_start()` succeeds, call `camera.status()` and write `preview_mode`, `preview_width`, and `preview_height` to the metrics table.

### Task 4: Verification And Board Smoke

**Files:**
- Modify: `docs/device-bringup.md`
- Modify: `docs/runtime-capabilities.md`

- [ ] **Step 1: Run local checks**

Run:

```bash
node --test tools/firmware-static-check/test.mjs --test-name-pattern camera
node tools/app-validator/cli.mjs apps/smoke_camera
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Build and flash**

Run:

```bash
source /Users/wq/esp-idf/export.sh >/dev/null
idf.py build
idf.py -p /dev/cu.usbmodem112301 flash
```

Expected: build and flash pass on MAC `10:51:db:80:e2:e8`.

- [ ] **Step 3: Launch and inspect**

Run:

```bash
curl -s -X POST 'http://192.168.1.32:8080/launch?app=smoke_camera'
curl -s 'http://192.168.1.32:8080/status'
```

Expected: `current_app` is `smoke_camera`. User checks whether preview is clearer and stable. Record the result in `docs/device-bringup.md`.
