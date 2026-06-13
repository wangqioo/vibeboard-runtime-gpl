# VibeBoard Runtime GPL

VibeBoard Runtime GPL is the GPL-3.0 runtime/app-ecosystem line for ESP32-S3 small-screen devices.

The goal is to flash a generic ESP-IDF runtime once, then iterate on Lua/LVGL app packages without reflashing full firmware for every UI or app change.

## Current Hardware Status

The runtime has been brought up on the LCKFB/Lichuang ESP32-S3 board with the 320x240 ST7789 display and SD card slot.

Validated on real hardware:

- ESP32-S3 boot, PSRAM, LCD, inverted backlight, LVGL task, and SD card mount.
- SD app discovery under `/sdcard/apps`.
- Lua app execution from SD card.
- Lua `print()` routed to ESP-IDF serial logs.
- Minimal Lua-to-LVGL bridge for labels, containers, sizing, colors, borders, radius, padding, and alignment.
- Lua `set_interval(ms, callback)` for simple dynamic UI refresh.
- `apps/smoke_ui` weather-card demo ran from SD card with the previous `set_interval` loop, showing `Shanghai` and an updating `Updated 00s` label.
- NodeMCU-style Lua `tmr` module with `tmr.create()`, `timer:alarm(...)`, `timer:stop()`, `timer:unregister()`, `timer:state()`, `timer:interval(...)`, `tmr.now()`, and `tmr.time()`.
- `apps/smoke_timer` ran from SD card and verified auto timers, single timers, state, unregister, timer-loop idle, and `Lua app ok` on real hardware.
- Lua `file` module, LVGL `S:` SD filesystem asset path, positioning, flags, and label long modes have board smoke evidence through `apps/smoke_file` and `apps/smoke_assets`.

Display follow-up and structure notes:

- Current `apps/smoke_ui` has been migrated from direct `set_interval` usage to `tmr`; the earlier display demo was verified before that migration.
- BMP image decoding is enabled with `CONFIG_LV_USE_BMP=y`; `apps/smoke_visual` packages a real BMP asset and uses `lv_img_create`, `lv_img_set_src`, `lv_btn_create`, `lv_bar_create`, `lv_bar_set_range`, and `lv_bar_set_value`. It is board-verified through serial/runtime progress logs; BMP visual correctness still needs human screen confirmation.
- LVGL binding code has been split into core registration, SD/asset filesystem, and widget bindings to keep new API work maintainable.
- The firmware now uses a custom 4 MB app partition because the network-enabled runtime no longer fits in ESP-IDF's default 1 MB factory app partition.

Board-verified networking and install-service work:

- WiFi, HTTP, JSON, and NTP/time Lua modules are board-verified through `apps/smoke_network` with local `wifi.json`; the board connected to `1-306`, got `192.168.1.32`, and completed an HTTP 200 smoke request.
- The runtime starts a minimal HTTP install service on port `8080`: `POST /install?app=<id>&path=<relative>` writes files under `/sdcard/apps/<id>/`.
- The uploader command now writes a package, calls `/rescan`, and confirms the app through `/apps`: `npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_visual_remote` uploaded 5 files and confirmed `smoke_visual_remote`.
- The runtime can launch an installed SD app without rebooting: `POST /launch?app=smoke_visual_remote` returned `200 OK`, and serial logs showed `smoke visual ok S:/apps/smoke_visual_remote/assets/icon.bmp` plus timer-driven progress updates.
- The local helper command is `npm run launch:app -- http://192.168.1.32:8080 smoke_visual_remote`.
- Controlled stop/switch is board-verified: launching a different app stops the current Lua app before starting the next one.
- The device now boots into the native `VibeBoard Apps` launcher instead of auto-running the first SD app. Touch tap-to-launch works on the device screen; BOOT short press selects, and BOOT long press launches.

## Current Phase

Phase 5A is closed: the native launcher MVP and basic app lifecycle loop are board-verified.

The runtime can now:

```text
boot -> scan SD apps -> show native launcher -> launch by touch/BOOT/HTTP -> stop/switch apps
```

Phase 5B is the next productization slice:

- return to launcher after an app is running;
- stop the current app from the device screen;
- refresh the app list from the device screen;
- show launch failures on screen;
- expose clearer lifecycle state through `/status`.

Lua `app.list()` / `app.launch()` / `app.current()` are intentionally deferred until a Lua-side workflow needs them.

## Boundary

This repo is not trying to make every app a separately flashed firmware image.

Instead, the split is:

- **Runtime firmware:** stable ESP-IDF base that owns hardware, SD card, Lua VM, LVGL, and safe native bindings.
- **SD-card apps:** Lua packages that use the runtime API to draw UI and implement app behavior.

Normal app iteration:

```text
AI generates app.info + Lua + assets
  -> validator checks package
  -> packager creates dist/apps/<app-id>
  -> user copies files to SD card /apps/<app-id> or uploads through the install service
  -> runtime scans /sdcard/apps
  -> user launches the app from the native screen launcher or through /launch
  -> Lua runner executes main.lua
```

Still requires firmware work:

- display, input, SD, WiFi, audio, and storage drivers;
- Lua VM and NodeMCU-style module changes;
- LVGL Lua binding changes;
- app launcher or system service changes;
- native module ABI changes.

## How SD Apps Execute

The SD card app is not a standalone ESP32 program. It is a Lua script executed inside the runtime firmware.

Boot flow:

```text
ESP32 runtime boots
  -> initializes LCD, LVGL, backlight, SD card
  -> mounts SD at /sdcard
  -> scans /sdcard/apps
  -> finds app directories with app.info and valid entry files
  -> shows the native VibeBoard Apps launcher
  -> user taps an app or uses BOOT short-select/long-launch
  -> creates a Lua state
  -> registers runtime APIs such as lv_label_create, tmr, and set_interval
  -> runs /sdcard/apps/<app-id>/main.lua
```

When Lua calls a function like this:

```lua
local label = lv_label_create(root)
lv_label_set_text(label, "Shanghai")
lv_obj_align(label, LV_ALIGN_TOP_LEFT, 16, 40)
```

it is calling a C wrapper registered by the firmware. That wrapper calls real LVGL, and LVGL flushes pixels to the LCD.

The chain is:

```text
Lua app
  -> runtime Lua API
  -> C wrapper
  -> LVGL
  -> LCD
```

This is why updating `main.lua` on SD can change the app without changing the firmware, as long as the app only uses APIs already exposed by the runtime.

## Why AI App Generation Works Well Here

AI is unreliable when asked to generate complete embedded firmware because it must get many low-level details right at the same time:

```text
GPIO
SPI
I2C
SDMMC
LCD init
LVGL buffers
FreeRTOS tasks
CMake
flash settings
crash logs
```

This repo reduces the AI's job to a much smaller, safer surface:

```lua
local card = lv_obj_create(root)
lv_obj_set_size(card, 288, 196)
lv_obj_set_style_bg_color(card, 0x18212b)

local title = lv_label_create(card)
lv_label_set_text(title, "VibeBoard Weather")
lv_obj_align(title, LV_ALIGN_TOP_LEFT, 16, 14)
```

The strategy is:

```text
Firmware layer: slow, careful, hardware-specific, rarely changed.
Lua app layer: small, structured, easy for AI to generate and iterate.
```

That raises AI success rate because:

- the API surface is small and explicit;
- app structure is template-like: clear screen, create containers, add labels, align, refresh;
- failures are contained to one Lua app instead of breaking board firmware;
- iteration is faster because changing Lua does not require rebuilding and flashing firmware;
- runtime tests and package validation can reject malformed app packages before they reach the device.

The product idea is not just "ESP32 can run Lua." The useful idea is turning ESP32 small-screen development into a constrained AI-friendly scripting workflow.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `upstream/holocubic-apps/` | Full absorbed HoloCubic Lua/LVGL app snapshot. |
| `upstream/holocubic-nes-esp32/` | Full absorbed NES dynamic module snapshot. |
| `apps/` | Curated VibeBoard-facing app packages. |
| `modules/` | Curated native module paths. |
| `tools/app-validator/` | Package metadata parser and validator. |
| `tools/app-packager/` | Validated app directory packager for device-storage deployment. |
| `docs/` | Runtime, deployment, app package, and AI generation docs. |

## First Demo Apps

- `apps/smoke_ui`: validated runtime smoke app. Currently shows the Shanghai weather-card demo and updates a label through `tmr`.
- `apps/smoke_timer`: timer smoke app for `tmr.create()`, auto timers, single timers, state, and unregister behavior.
- `apps/smoke_file`: file module smoke app for app-local config reads, directory listing, file handles, and app-local writes.
- `apps/smoke_assets`: asset-path smoke app for app-local resource path resolution and `lv_img_*` binding checks.
- `apps/smoke_visual`: visual smoke app for BMP assets, image objects, buttons, bars, and timer-driven widget updates.
- `apps/smoke_network`: network smoke app for app-local WiFi config, JSON encode/decode, NTP/time, WiFi STA connection, and HTTP GET.
- `apps/weather`: pure Lua/LVGL network/UI app.
- `apps/voice_ai`: device voice app plus desktop AI bridge.
- `apps/nesgame`: Lua app backed by native NES module.

## Validate

```bash
npm test
npm run validate:apps
```

## Package Apps

Package one app:

```bash
npm run package:app -- apps/weather
```

Package all curated demos:

```bash
npm run package:demos
```

Outputs are written to:

```text
dist/apps/<app-id>/
  app.info
  main.lua
  assets/...
  manifest.json
  install-notes.txt
```

Copy the contents of `dist/apps/<app-id>/` to `/sd/apps/<app-id>/` on the device storage. This package step does not flash firmware.

## Write AI App Plans

Turn an AI package plan JSON file into a local app directory:

```bash
npm run write:app-plan -- plan.json
```

Write and package it in one step:

```bash
npm run write:app-plan -- plan.json --package
```

Outputs:

```text
generated/apps/<app-id>/
dist/apps/<app-id>/        # only with --package
```

This is still a file-level workflow. It does not call an AI model, flash firmware, or upload to a device.

## AI App Generation

See [docs/ai-generation-contract.md](docs/ai-generation-contract.md) for the package-plan format and fallback rules.

## Development Plan

See [docs/development-plan.md](docs/development-plan.md) for the current status, completed work, and next-phase roadmap.
