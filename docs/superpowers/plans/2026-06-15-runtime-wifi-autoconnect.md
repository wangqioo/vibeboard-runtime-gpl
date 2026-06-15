# Runtime Wi-Fi Autoconnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start Wi-Fi from a runtime-owned SD config so the HTTP install service can be reached after boot.

**Architecture:** Add a focused `runtime_wifi` firmware module that owns runtime-level STA startup. `main.c` calls it after board/SD initialization and before starting the install service. The feature is best-effort and never blocks launcher startup.

**Tech Stack:** ESP-IDF C, `esp_wifi`, `esp_netif`, `esp_event`, cJSON, existing Node firmware static tests.

---

### Task 1: Static Contract

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add a failing static test**

Add tests that assert `runtime_wifi.c`, `runtime_wifi.h`, `main.c`, and `CMakeLists.txt` expose and wire `vb_runtime_wifi_start_from_sd`.

- [ ] **Step 2: Run the focused test**

Run: `npm run test:firmware-static`

Expected: FAIL because `runtime_wifi.c` does not exist yet.

### Task 2: Minimal Firmware Module

**Files:**
- Create: `firmware/vibeboard_runtime/main/runtime_wifi.h`
- Create: `firmware/vibeboard_runtime/main/runtime_wifi.c`
- Modify: `firmware/vibeboard_runtime/main/CMakeLists.txt`
- Modify: `firmware/vibeboard_runtime/main/main.c`

- [ ] **Step 1: Implement the service**

Implement `vb_runtime_wifi_start_from_sd()` as best-effort startup from `/sdcard/runtime/wifi.json`, with a read-only compatibility fallback to `/sdcard/apps/smoke_network/wifi.json`, using cJSON for `ssid` and `password`.

- [ ] **Step 2: Wire startup**

Call `vb_runtime_wifi_start_from_sd()` after `vb_board_lckfb_start()` succeeds and before `vb_install_service_start()`.

- [ ] **Step 3: Run the focused test**

Run: `npm run test:firmware-static`

Expected: PASS.

### Task 3: Board Verification And Docs

**Files:**
- Modify: `docs/device-bringup.md`
- Modify: `docs/runtime-capabilities.md`
- Modify: `docs/next-session-plan.md`

- [ ] **Step 1: Build and flash**

Run `idf.py build flash` for `/dev/cu.usbmodem111301`.

- [ ] **Step 2: Verify boot and network**

Confirm serial logs show `VibeBoard Runtime ready`, `runtime sta got ip`, and no reboot loop.

- [ ] **Step 3: Verify uploader**

Run `npm run upload:app` and `npm run launch:app` against `http://192.168.1.32:8080` without `--transport nc`.

- [ ] **Step 4: Update docs**

Record the exact board evidence and leave any physical screen-only checks explicit.
