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
- `apps/smoke_ui` weather-card demo running from SD card, showing `Shanghai` and an updating `Updated 00s` label.

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
  -> user copies files to SD card /apps/<app-id>
  -> runtime scans /sdcard/apps
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
  -> finds an app directory with app.info
  -> reads entry = main.lua
  -> creates a Lua state
  -> registers runtime APIs such as lv_label_create and set_interval
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

- `apps/smoke_ui`: validated runtime smoke app. Currently shows the Shanghai weather-card demo and updates a label through `set_interval`.
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
