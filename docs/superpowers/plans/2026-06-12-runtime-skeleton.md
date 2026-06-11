# Runtime Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and flash the first VibeBoard-owned ESP-IDF firmware skeleton for the LCKFB SZPI ESP32-S3 board.

**Architecture:** Add `firmware/vibeboard_runtime/` as a standalone ESP-IDF project. Keep board initialization, SD/app scanning, and UI setup in separate C files so Lua runtime work can be added later without rewriting the BSP.

**Tech Stack:** ESP-IDF 5.5, ESP32-S3, ST7789, esp_lvgl_port, LVGL 8.3, FT5x06 touch, SDMMC 1-bit.

---

## File Structure

- Create `firmware/vibeboard_runtime/CMakeLists.txt`: top-level ESP-IDF project.
- Create `firmware/vibeboard_runtime/sdkconfig.defaults`: board target, flash, PSRAM, LVGL config.
- Create `firmware/vibeboard_runtime/main/CMakeLists.txt`: main component registration and dependencies.
- Create `firmware/vibeboard_runtime/main/idf_component.yml`: managed LVGL/touch dependencies.
- Create `firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.h`: board API and constants.
- Create `firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.c`: board display/touch/SD implementation.
- Create `firmware/vibeboard_runtime/main/app_registry.h`: app scan result types.
- Create `firmware/vibeboard_runtime/main/app_registry.c`: `/sdcard/apps` scanner.
- Create `firmware/vibeboard_runtime/main/main.c`: boot UI and orchestration.
- Create `tools/firmware-static-check/test.mjs`: static guardrails for required constants and safe SD config.
- Modify `package.json`: add `test:firmware-static` and include it in `npm test`.
- Modify docs after verification: `docs/device-bringup.md`, `docs/development-plan.md`.

## Task 1: Static Firmware Guardrails

- [ ] Create `tools/firmware-static-check/test.mjs`.
- [ ] Add tests asserting:
  - `firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.h` exists.
  - LCD pins match documented values: MOSI 40, SCLK 41, DC 39, backlight 42.
  - SD pins match documented values: CLK 47, CMD 48, D0 21.
  - SD mount uses `format_if_mount_failed = false`.
  - app registry scans `/sdcard/apps`.
- [ ] Add `test:firmware-static` to `package.json`.
- [ ] Run `npm run test:firmware-static` and confirm it fails because firmware files are missing.
- [ ] Commit after implementation passes.

## Task 2: ESP-IDF Project Skeleton

- [ ] Create top-level firmware project files.
- [ ] Create `board_lckfb_szpi_s3.*` with LCD/LVGL/touch/SD APIs.
- [ ] Create `app_registry.*` with app count and first-name scanning.
- [ ] Create `main.c` with a diagnostic LVGL screen.
- [ ] Run `npm run test:firmware-static`.
- [ ] Run ESP-IDF build with explicit environment:

```bash
export IDF_PATH=/Users/wq/esp-idf
export IDF_PYTHON_ENV_PATH=/Users/wq/.espressif/python_env/idf5.5_py3.13_env
export PATH=/Users/wq/.espressif/python_env/idf5.5_py3.13_env/bin:/Users/wq/.espressif/tools/xtensa-esp-elf/esp-14.2.0_20260121/xtensa-esp-elf/bin:$PATH
python /Users/wq/esp-idf/tools/idf.py build
```

- [ ] Fix build issues without importing full LCKFB source.
- [ ] Commit buildable skeleton.

## Task 3: Flash and Record

- [ ] Flash using direct esptool if `idf.py flash` hits serial re-enumeration:

```bash
python -m esptool --chip esp32s3 -p /dev/cu.usbmodem11301 -b 460800 --before default_reset --after hard_reset write_flash @flash_args
```

- [ ] Capture 5 seconds of serial logs using pyserial.
- [ ] Ask user to confirm screen text.
- [ ] Update `docs/device-bringup.md` with build, flash, serial, and visual evidence.
- [ ] Run:

```bash
npm test
git diff --check
git status --short
```

- [ ] Commit verification docs.
