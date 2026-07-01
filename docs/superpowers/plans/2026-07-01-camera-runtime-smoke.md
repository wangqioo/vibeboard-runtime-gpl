# Camera Runtime Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first GC2145 camera Runtime path and verify it with a `smoke_camera` app on the LCKFB-SZPI-ESP32-S3-VA board.

**Architecture:** The board layer owns GC2145 setup through `esp32-camera`, PCA9557 `DVP_PWDN`, and frame buffer lifetime. A focused Lua `camera` module exposes start/capture/release/stop/status to apps, while `smoke_camera` proves capture metrics and optional RGB565 preview without adding photo gallery or face detection scope.

**Tech Stack:** ESP-IDF 5.5, espressif/esp32-camera 2.1.x, Lua 5.5, LVGL 8.3, Node `node:test`, app validator/packager/uploader, board HTTP smoke tools.

---

## File Structure

- Modify `firmware/vibeboard_runtime/main/idf_component.yml`: add the `espressif/esp32-camera` dependency.
- Modify `firmware/vibeboard_runtime/main/CMakeLists.txt`: compile `lua_camera.c` and require the camera component.
- Modify `firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.h`: add camera pin constants and board camera function declarations.
- Modify `firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.c`: implement GC2145 start/capture/return/stop and preview draw helper.
- Create `firmware/vibeboard_runtime/main/lua_camera.h`: declare Lua camera registration and cleanup API.
- Create `firmware/vibeboard_runtime/main/lua_camera.c`: implement Lua `camera` module and frame lifetime handling.
- Modify `firmware/vibeboard_runtime/main/app_runner.c`: register and clean up the camera Lua module.
- Modify `tools/app-validator/index.mjs`: accept `camera` capability and camera Lua symbols.
- Modify `tools/firmware-static-check/test.mjs`: add static guardrails for camera pins, module registration, validator support, and `smoke_camera`.
- Create `apps/smoke_camera/app.info`: declare the app and capabilities.
- Create `apps/smoke_camera/main.lua`: capture a frame, preview if possible, write metrics, and stay lifecycle-responsive.
- Modify `README.md`, `docs/runtime-capabilities.md`, and `docs/device-bringup.md`: record the new camera status and board evidence after verification.

## Tasks

### Task 1: Static Guardrails Red Test

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [x] Add a failing static test named `registers a Lua camera module backed by the board GC2145 camera`.
- [ ] Assert `board_lckfb_szpi_s3.h` contains the LCKFB camera pins: `GPIO_NUM_5`, `GPIO_NUM_9`, `GPIO_NUM_4`, `GPIO_NUM_6`, `GPIO_NUM_15`, `GPIO_NUM_17`, `GPIO_NUM_8`, `GPIO_NUM_18`, `GPIO_NUM_16`, `GPIO_NUM_3`, `GPIO_NUM_46`, `GPIO_NUM_7`.
- [x] Assert `board_lckfb_szpi_s3.c` includes `esp_camera.h`, uses `PIXFORMAT_RGB565`, `FRAMESIZE_QQVGA`, `GC2145_PID`, and `VB_PCA9557_DVP_PWDN_BIT`.
- [ ] Assert `lua_camera.c` exposes `"start"`, `"capture"`, `"release"`, `"stop"`, and `"status"`.
- [ ] Assert `app_runner.c` includes `lua_camera.h`, calls `vb_lua_camera_register`, and calls `vb_lua_camera_cleanup`.
- [ ] Assert `tools/app-validator/index.mjs` supports `camera.start` and the `camera` capability.
- [ ] Assert `apps/smoke_camera/main.lua` writes `camera_ready`, `captures`, `frame_bytes`, `preview`, `capture_error`, and `preview_error`.
- [ ] Run:

```bash
node --test tools/firmware-static-check/test.mjs --test-name-pattern "camera"
```

Expected: fail because camera source, app, and validator support do not exist yet.

- [ ] Commit after the red test only if the project convention allows red-test commits; otherwise continue to Task 2 and commit once green.

### Task 2: Validator And App Skeleton

**Files:**
- Modify: `tools/app-validator/index.mjs`
- Create: `apps/smoke_camera/app.info`
- Create: `apps/smoke_camera/main.lua`

- [ ] Add `camera` capability usage detection for `camera.` calls.
- [ ] Add supported Lua API symbols: `camera.start`, `camera.capture`, `camera.release`, `camera.stop`, `camera.status`.
- [ ] Add `camera` to checked Lua API modules.
- [ ] Create `apps/smoke_camera/app.info` with schema v2, app id `smoke_camera`, and capabilities `lvgl,timer,file,camera`.
- [ ] Create `apps/smoke_camera/main.lua` that uses `pcall(require, "camera")`, writes metrics through `file.putcontents`, and renders status text through LVGL.
- [ ] Before firmware implementation, `node tools/app-validator/cli.mjs apps/smoke_camera` should fail on missing Runtime symbols only if symbols were not added; after validator edits it should pass.
- [ ] Run:

```bash
node tools/app-validator/cli.mjs apps/smoke_camera
node --test tools/firmware-static-check/test.mjs --test-name-pattern "camera"
```

Expected: validator passes; static camera test still fails until firmware files are added.

### Task 3: Board Camera Driver

**Files:**
- Modify: `firmware/vibeboard_runtime/main/idf_component.yml`
- Modify: `firmware/vibeboard_runtime/main/CMakeLists.txt`
- Modify: `firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.h`
- Modify: `firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.c`

- [ ] Add dependency `espressif/esp32-camera: "^2.1.4"`.
- [ ] Add `espressif__esp32-camera` to the main component `REQUIRES`.
- [x] Add board camera constants for all GC2145 pins and `VB_CAMERA_XCLK_FREQ_HZ`.
- [ ] Add a `vb_board_camera_frame_t` wrapper with width, height, len, format string, and opaque frame pointer.
- [ ] Implement `vb_board_camera_start(uint16_t width, uint16_t height, const char *format)`.
- [ ] Implement `vb_board_camera_capture(vb_board_camera_frame_t *frame)`.
- [ ] Implement `vb_board_camera_draw(const vb_board_camera_frame_t *frame)`.
- [ ] Implement `vb_board_camera_return(vb_board_camera_frame_t *frame)`.
- [ ] Implement `vb_board_camera_stop(void)`.
- [ ] Keep `DVP_PWDN` low while camera is enabled and high when stopped.
- [x] Use PSRAM frame buffers, `PIXFORMAT_RGB565`, `FRAMESIZE_QQVGA` for smoke capture, `fb_count = 2`, and `xclk_freq_hz = 24000000`.
- [ ] Run:

```bash
node --test tools/firmware-static-check/test.mjs --test-name-pattern "camera"
```

Expected: still fails until Lua module registration is added.

### Task 4: Lua Camera Module

**Files:**
- Create: `firmware/vibeboard_runtime/main/lua_camera.h`
- Create: `firmware/vibeboard_runtime/main/lua_camera.c`
- Modify: `firmware/vibeboard_runtime/main/CMakeLists.txt`
- Modify: `firmware/vibeboard_runtime/main/app_runner.c`

- [ ] Define `vb_lua_camera_state_t` with held frame metadata and counters.
- [ ] Implement `vb_lua_camera_init`.
- [ ] Implement `vb_lua_camera_register`.
- [ ] Implement `vb_lua_camera_cleanup`.
- [ ] Implement Lua `camera.start(opts)` returning `true` or `nil, err`.
- [ ] Implement Lua `camera.capture()` returning frame table or `nil, err`.
- [ ] Implement Lua `camera.release(frame)` returning `true`.
- [ ] Implement Lua `camera.stop()` returning `true`.
- [ ] Implement Lua `camera.status()` returning ready/captures/error/width/height/format.
- [ ] Register the module in `app_runner.c` with the same pattern as `imu`, `i2s`, and `touch`.
- [ ] Clean up the camera module during Lua runtime cleanup.
- [ ] Run:

```bash
node --test tools/firmware-static-check/test.mjs --test-name-pattern "camera"
```

Expected: camera static tests pass.

### Task 5: Local Validation And Build

**Files:**
- Current implementation files.

- [ ] Run:

```bash
node tools/app-validator/cli.mjs apps/smoke_camera
node --test tools/firmware-static-check/test.mjs --test-name-pattern "camera|GC2145|smoke_camera"
npm run package:app -- apps/smoke_camera
git diff --check
```

Expected: all pass.

- [ ] Run:

```bash
source /Users/wq/esp-idf/export.sh
idf.py build
```

Expected: firmware builds and app partition has free space.

### Task 6: Board Flash And Smoke

**Files:**
- Current implementation files.

- [ ] Confirm target port:

```bash
ls /dev/cu.usbmodem*
```

Expected: target board remains `/dev/cu.usbmodem112301`.

- [ ] Flash:

```bash
source /Users/wq/esp-idf/export.sh
idf.py -p /dev/cu.usbmodem112301 flash
```

Expected: ESP32-S3 QFN56, MAC `10:51:db:80:e2:e8`, flash verified.

- [ ] Wait for Runtime:

```bash
curl -s --max-time 2 http://192.168.1.32:8080/status
```

Expected: `sd=true`, `install=ok`, `state=idle`.

- [ ] Upload app:

```bash
npm run package:app -- apps/smoke_camera
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_camera smoke_camera
```

Expected: upload commits and `/apps` confirms `smoke_camera`.

- [ ] Run smoke:

```bash
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app smoke_camera --allow-starting --polls 80 --interval-ms 500 --metrics-polls 60 --metrics-interval-ms 500 --require-metrics camera_ready=true --require-metrics 'captures>=1' --stop --stop-polls 40 --stop-interval-ms 500
```

Expected: app launches, captures at least one frame, writes metrics, and returns to idle.

### Task 7: Documentation And Commit

**Files:**
- Modify: `README.md`
- Modify: `docs/runtime-capabilities.md`
- Modify: `docs/device-bringup.md`

- [ ] Add `smoke_camera` to smoke/regression apps in README.
- [ ] Add camera API status to runtime capabilities with exact verification result.
- [ ] Add a dated bring-up entry with build, flash, app upload, smoke output, and physical preview observation state.
- [ ] Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended files changed.

- [ ] Commit:

```bash
git add firmware/vibeboard_runtime/main/idf_component.yml firmware/vibeboard_runtime/main/CMakeLists.txt firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.h firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.c firmware/vibeboard_runtime/main/lua_camera.h firmware/vibeboard_runtime/main/lua_camera.c firmware/vibeboard_runtime/main/app_runner.c tools/app-validator/index.mjs tools/firmware-static-check/test.mjs apps/smoke_camera README.md docs/runtime-capabilities.md docs/device-bringup.md docs/superpowers/plans/2026-07-01-camera-runtime-smoke.md
git commit -m "feat: add camera runtime smoke"
```

Expected: one committed camera runtime slice.

## Self-Review

Spec coverage:

- GC2145 driver path: Task 3.
- Lua camera API: Task 4.
- Smoke app and metrics: Task 2 and Task 6.
- Static tests first: Task 1.
- Board flash and smoke: Task 6.
- Docs evidence: Task 7.

No placeholders remain. Function names and metrics match the design document.
