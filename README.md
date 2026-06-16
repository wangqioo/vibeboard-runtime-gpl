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
- The runtime starts an HTTP install service on port `8080` with `GET /`, `GET /status`, `GET /apps`, `POST /stage`, `POST /commit`, `POST /discard`, `POST /install`, `POST /rescan`, `POST /launch`, `POST /stop`, and `POST /delete`.
- The uploader defaults to staged deployment: `/discard -> /stage -> /commit -> /apps`. A failed upload can discard staging data without polluting the launchable app directory.
- `POST /delete?app=<id>` and `npm run delete:app` are board-verified, including `409 app is running` protection.
- The browser Web Console is served directly by the board at `http://192.168.1.32:8080/` and is board-verified for HTML delivery, app list/status APIs, manual upload, launch, stop, and delete controls.
- The Web Console includes a browser-side AI app creator. It calls OpenAI directly from the user's browser, validates strict JSON package output, writes files through staged upload, commits only after all files are valid, and keeps the API key out of the ESP32 firmware.
- The uploader command writes a package through the staged path and confirms the app through `/apps`: `npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_visual_remote` uploaded 5 files and confirmed `smoke_visual_remote`.
- The runtime can launch an installed SD app without rebooting: `POST /launch?app=smoke_visual_remote` returned `200 OK`, and serial logs showed `smoke visual ok S:/apps/smoke_visual_remote/assets/icon.bmp` plus timer-driven progress updates.
- The local helper command is `npm run launch:app -- http://192.168.1.32:8080 smoke_visual_remote`.
- Controlled stop/switch is board-verified: launching a different app stops the current Lua app before starting the next one.
- The device now boots into the native `VibeBoard Apps` launcher instead of auto-running the first SD app. Touch tap-to-launch works on the device screen; BOOT short press selects, and BOOT long press launches.
- `/status.state` is board-verified for `idle`, `running`, controlled stop back to `idle`, `failed`, and recovery from failure. `apps/smoke_fail` intentionally fails for this lifecycle smoke path.
- A BOOT-after-launch crash was fixed and board-verified: once a Lua app owns the screen, launcher BOOT controls are ignored instead of touching stale LVGL objects.

## Current Phase

Phase 5A, Phase 5B, staged deployment, app delete/uninstall, and the first browser Web Console are closed on real hardware.

The runtime can now:

```text
boot -> runtime WiFi -> scan SD apps -> native launcher or browser console
  -> upload/create app -> stage/commit -> launch/stop/delete
```

The next productization slice is no longer basic launcher or upload plumbing. The remaining near-term work is:

- board-verify the formal `configure:wifi` SD setup flow, then remove the smoke-app compatibility fallback;
- run and record a real AI-generated app smoke from the Web Console with a user-provided API key;
- expose touch/key input events to Lua apps;
- add runtime/API/app schema compatibility checks;
- continue expanding the LVGL API whitelist that AI-generated apps are allowed to use.

Lua `app.list()` / `app.launch()` / `app.current()` are intentionally deferred until a Lua-side workflow needs them.

## Boundary

This repo is not trying to make every app a separately flashed firmware image.

Instead, the split is:

- **Runtime firmware:** stable ESP-IDF base that owns hardware, SD card, Lua VM, LVGL, and safe native bindings.
- **SD-card apps:** Lua packages that use the runtime API to draw UI and implement app behavior.

Normal app iteration:

```text
AI or developer produces app.info + Lua + assets
  -> validator checks package
  -> packager creates dist/apps/<app-id>
  -> user uploads through the browser console or host CLI
  -> runtime stages files under /sdcard/.staging/<app-id>
  -> commit validates app.info plus entry file and replaces /sdcard/apps/<app-id>
  -> user launches from the native launcher, browser console, or /launch
  -> Lua runner executes main.lua
```

The browser AI path skips the local plan-writer step for quick experiments:

```text
browser prompt + OpenAI API key
  -> OpenAI Responses API returns strict JSON files
  -> browser validates ids and paths
  -> browser uploads through /discard, /stage, and /commit
  -> app appears in /apps and can be launched
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
| `web-console/` | Browser console specification, UX notes, and AI creation plan. |
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

## Holocubic App Catalog

The repo includes a local VibeBoard-facing catalog entry for every app in `upstream/holocubic-apps` at commit `78da33f`.

Current split:

- `apps/holocubic_nixie_clock`, `apps/holocubic_analog_clock`, and `apps/holocubic_matrix_rain` are compatibility ports that run on the current Lua/LVGL runtime subset.
- `apps/weather`, `apps/voice_ai`, and `apps/nesgame` are existing local packages whose full upstream behavior still depends on later runtime work.
- The remaining Holocubic targets are explicit placeholder apps. They launch to a `Runtime update required` screen that names the missing runtime slice instead of failing with unsupported APIs.

See [docs/holocubic-app-migration.md](docs/holocubic-app-migration.md) and [docs/holocubic-app-migration.json](docs/holocubic-app-migration.json) for the migration matrix.

## Validate

```bash
npm test
npm run validate:apps
```

## Configure Runtime WiFi

Mount the SD card on the Mac, then write the runtime-owned WiFi config:

```bash
npm run configure:wifi -- /Volumes/VIBEBOARD --ssid "YOUR_WIFI_SSID" --password "YOUR_WIFI_PASSWORD"
```

This writes:

```text
/sdcard/runtime/wifi.json
```

After boot, the runtime reads this file before starting the browser console and install service. The old `apps/smoke_network/wifi.json` path remains only as a temporary bring-up fallback.

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

## Browser Console

Once the board has joined WiFi, open:

```text
http://<board-ip>:8080/
```

The console is served from the ESP32 runtime and supports:

- status and app list refresh;
- app launch, stop, and delete;
- folder upload through staged commit;
- browser-side AI app creation with strict JSON output and staged deployment.

The OpenAI API key is entered in the browser. It is never sent to the ESP32, but it is visible to that browser session and any local browser tooling, so use it only on a trusted network and device.

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

This CLI path is still a file-level workflow. It does not call an AI model, flash firmware, or upload to a device. For direct prompt-to-device experiments, use the browser Web Console AI creator.

## AI App Generation

See [docs/ai-generation-contract.md](docs/ai-generation-contract.md) for the package-plan format and fallback rules.

## Development Plan

See [docs/development-plan.md](docs/development-plan.md) for the current status, completed work, and next-phase roadmap.

For the tradeoffs between this runtime app model and traditional embedded firmware development, see [docs/runtime-vs-traditional-firmware.md](docs/runtime-vs-traditional-firmware.md).

For an explanation of the current ESP32-S3 flash partition layout, see [docs/esp32-flash-partitions.md](docs/esp32-flash-partitions.md).
