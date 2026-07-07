# VibeBoard Runtime GPL

VibeBoard Runtime GPL is the GPL-3.0-only runtime and app ecosystem for ESP32-S3 small-screen devices.

The project turns the board into a small runtime platform:

```text
flash Runtime firmware once
  -> install Lua/LVGL app packages on SD storage
  -> scan /sdcard/apps
  -> launch apps from the device launcher, HTTP API, or local web UI
```

The current hardware target is the LCKFB/Lichuang ESP32-S3 board with a 320x240 ST7789 display, touch input, PSRAM, WiFi, and SD card slot.

## Current Status

The runtime has been built, flashed, and verified on real hardware. The latest board run confirmed:

- ESP32-S3 boot, PSRAM, LCD, backlight, LVGL task, SD mount, and Runtime launcher.
- Runtime WiFi autoconnect from `/sdcard/runtime/wifi.json`.
- HTTP install service on port `8080`.
- `/status`, `/apps`, `/rescan`, `/launch`, `/stop`, staged upload/commit, and app delete.
- Native `VibeBoard Apps` launcher with touch/BOOT launch and stop/refresh lifecycle controls.
- Lua/LVGL apps loaded from `/sdcard/apps/<app-id>/main.lua`.
- Runtime modules for `app`, `camera`, `file`, `gamepad`, `http`, `i2s`, `json`/`sjson`, `key`, `sys`, `time`, `tmr`, `touch`, and `wifi`.
- LVGL bindings for labels, objects, images, GIFs, preconverted `.vbimg` canvas backgrounds, BMP fallback backgrounds, common widgets, styles, fonts, and animations.
- NES native module smoke paths, Voice AI bridge paths, I2S RX/TX smoke paths, and app lifecycle smoke tools.

Recent known-good board evidence includes `app_count=49`, HTTP Runtime status at `http://192.168.1.32:8080/status`, `device:check` passing, `2048` launch/stop lifecycle smoke returning to idle, `smoke_camera` showing a board-confirmed live GC2145 preview, and the user-facing `camera` app running through the Runtime camera stack on `/dev/cu.usbmodem112301`.

The latest productized hardware path is the Camera/Photos loop: `apps/camera` starts a Runtime-owned GC2145 preview, captures BMP photos to `/sd/data/camera/photos`, exposes a narrow WebUI/API surface for capture and photo listing, and hands captured photos to an on-device gallery plus the standalone `photos` app. The board-verified baseline uses QVGA-first preview with QQVGA-scaled fallback, capture-busy input suppression, a native busy overlay, and a native gallery-entry hint when photos exist.

The current release-candidate closure is recorded in [docs/releases/v0.1-release-candidate.md](docs/releases/v0.1-release-candidate.md). It includes the fresh local `npm test`, `package:demos`, ESP-IDF build, and `git diff --check` evidence for the v0.1 baseline.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `firmware/vibeboard_runtime/` | ESP-IDF Runtime firmware flashed to the board. |
| `apps/` | Curated app packages installed on SD storage. |
| `modules/nes/` | Curated NES native module integration. |
| `tools/app-validator/` | App metadata, capability, Lua API, and LVGL API validator. |
| `tools/app-packager/` | Creates deployable `dist/apps/<app-id>` packages. |
| `tools/app-uploader/` | Uploads, commits, launches, stops, deletes, and configures apps over HTTP. |
| `tools/device-web-ui/` | Local browser UI for managing a board without adding CORS to firmware. |
| `desktop-bridge/` | Voice AI desktop bridge and OpenAI-compatible command wrappers. |
| `upstream/holocubic-apps/` | Absorbed HoloCubic Lua/LVGL app snapshot. |
| `upstream/holocubic-nes-esp32/` | Absorbed HoloCubic NES module snapshot. |
| `docs/` | Architecture, package format, deployment, capability, and bring-up docs. |

## App Model

Apps are directories containing `app.info`, Lua files, and assets:

```text
apps/weather/
  app.info
  main.lua
  assets/
  font/
```

At runtime:

```text
Lua app
  -> Runtime Lua API
  -> C bindings
  -> LVGL / board drivers / native modules
```

Updating Lua or assets does not require reflashing firmware as long as the app only uses APIs already exposed by the Runtime. Driver changes, new Lua modules, new LVGL bindings, launcher/service changes, and native ABI changes still require firmware work.

See [docs/new-app-development-guide.md](docs/new-app-development-guide.md) for the standard new-app workflow and [docs/runtime-boundary.md](docs/runtime-boundary.md) for the exact Runtime/app boundary.

## Quick Start

Install dependencies:

```bash
npm install
```

Run local tests:

```bash
npm test
```

Build firmware:

```bash
cd firmware/vibeboard_runtime
source /Users/wq/esp-idf/export.sh
idf.py build
```

Flash firmware:

```bash
# Replace with the verified target port for the board you intend to flash.
# The 2026-07-01 camera smoke target was /dev/cu.usbmodem112301.
idf.py -p /dev/cu.usbmodem112301 flash
```

Check the board without flashing:

```bash
npm run device:check -- http://192.168.1.32:8080
```

## Device Web UI

Start the local management page:

```bash
npm run device:web -- --board http://192.168.1.32:8080
```

Open:

```text
http://127.0.0.1:8790
```

The page can show Runtime status, list compatible and legacy apps, launch/stop/rescan/delete apps, upload an app directory, and show recent proxy actions. It is a local Node proxy over the board's HTTP API; the board firmware does not need browser CORS support.

## Package And Upload Apps

Package one app:

```bash
npm run package:app -- apps/weather
```

Package all curated apps:

```bash
npm run package:demos
```

The packager also preconverts compatible 320x240 RGB565 `.bmp` assets into
Runtime-native `.vbimg` files. Apps should prefer `.vbimg` for large full-screen
images and keep BMP as a fallback, so SD app deployment stays dynamic without
paying BMP decode cost on every launch. Apps with a loading screen can call
`lv_canvas_prefetch_vbimg(path)` first, then later call
`lv_canvas_load_vbimg(canvas, path)`; the Runtime keeps the decoded pixels in a
single PSRAM cache so the visible canvas update avoids a second SD read.
For layered LVGL apps, use `.vbimg` for large static backgrounds, `32-bit BMP
alpha` for small transparent icons, native LVGL widgets for text/cards/buttons,
and Runtime-native frame paths for camera previews, games, and other dynamic
streams. This is the current Weather reference architecture.

Upload a packaged app:

```bash
npm run upload:app -- http://192.168.1.32:8080 dist/apps/weather weather
```

Launch, stop, and delete:

```bash
npm run launch:app -- http://192.168.1.32:8080 weather
npm run delete:app -- http://192.168.1.32:8080 weather
curl -X POST http://192.168.1.32:8080/stop
```

Write runtime-owned config:

```bash
npm run runtime:config -- http://192.168.1.32:8080 wifi runtime/wifi.local.json
npm run runtime:config -- http://192.168.1.32:8080 cubicserver runtime/cubicserver.local.json
npm run runtime:config -- http://192.168.1.32:8080 i2s runtime/i2s.local.json
```

Run a local real-weather bridge for the migrated Weather app:

```bash
npm run weather:bridge
```

The bridge listens on `0.0.0.0:8792`, defaults to Shanghai, fetches Open-Meteo, and returns the QWeather-shaped `/v1/weather/now` JSON that `apps/weather` expects. Point the board at the host running the bridge:

```bash
npm run runtime:config -- http://192.168.1.32:8080 cubicserver '{"base_url":"http://192.168.1.26:8792"}'
```

## Curated Apps

Migrated or curated user-facing apps:

- `2048`
- `btc`
- `camera`
- `clock`
- `codex_buddy`
- `conway_life`
- `fluid_pendant`
- `hwmon`
- `lv-benchmark`
- `matrix_rain`
- `mini_claw`
- `nesgame`
- `nixie_clock`
- `photos`
- `plane`
- `settings`
- `spectrum`
- `videos`
- `voice_ai`
- `weather`

Smoke and regression apps:

- `smoke`, `smoke_ui`, `smoke_timer`, `smoke_file`, `smoke_assets`, `smoke_visual`
- `smoke_network`, `smoke_fail`, `smoke_key`, `smoke_touch`
- `smoke_gamepad`, `smoke_i2s`, `smoke_nes`, `smoke_app_manager`, `smoke_camera`
- `smoke_controls`, `smoke_lvgl_widgets`, `smoke_lvgl_style`

See [docs/upstream-map.md](docs/upstream-map.md) for upstream source mapping.

## Smoke Commands

Representative board smoke commands:

```bash
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app 2048 --stop
npm run input:smoke -- --board http://192.168.1.32:8080 --app smoke_key --key LEFT:SHORT
npm run gamepad:smoke -- --board http://192.168.1.32:8080 --inject-gamepad --require-updates 1
npm run i2s:smoke -- --board http://192.168.1.32:8080 --require-write --require-tone-writes 8
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app smoke_camera --allow-starting --require-metrics camera_ready=true --require-metrics 'captures>=1' --require-metrics preview=true --stop
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app camera --allow-starting --require-metrics preview=true --stop
npm run nes:rom:smoke -- --board http://192.168.1.32:8080 --app smoke_nes --path roms/smoke.nes
npm run nes:smoke -- --board http://192.168.1.32:8080 --require-rom --require-frame-growth 120
npm run nesgame:smoke -- --board http://192.168.1.32:8080 --require-frame-growth 120
npm run app-manager:smoke -- --board http://192.168.1.32:8080
npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://127.0.0.1:8790
```

These commands are automation hooks for development and bring-up. They do not replace physical screen, touch, controller, microphone, or speaker QA.

## AI App Generation

AI-generated apps should produce a package plan, not firmware. The toolchain writes `app.info`, Lua files, and assets, then validates the package against the current Runtime API surface.

```bash
npm run write:app-plan -- plan.json
npm run write:app-plan -- plan.json --package
```

See [docs/ai-generation-contract.md](docs/ai-generation-contract.md) for the package-plan format and fallback rule: if a request needs missing runtime support, report `Runtime update required`.

## Documentation Map

- [docs/architecture.md](docs/architecture.md): short architecture summary.
- [docs/runtime-boundary.md](docs/runtime-boundary.md): what can be done as an app vs firmware.
- [docs/app-package-format.md](docs/app-package-format.md): app metadata, manifest, paths, runtime configs.
- [docs/deployment-flow.md](docs/deployment-flow.md): packaging, staged upload, launch/delete flow.
- [docs/releases/v0.1-runtime-milestone.md](docs/releases/v0.1-runtime-milestone.md): v0.1 milestone scope and release notes.
- [docs/post-v0.1-backlog.md](docs/post-v0.1-backlog.md): follow-up backlog for physical QA, external services, long soak, and performance work.
- [docs/runtime-capabilities.md](docs/runtime-capabilities.md): implemented APIs with build and board evidence.
- [docs/development-plan.md](docs/development-plan.md): detailed Chinese status log and roadmap.
- [docs/device-bringup.md](docs/device-bringup.md): hardware bring-up evidence log.
- [docs/upstream-map.md](docs/upstream-map.md): HoloCubic source-to-local migration mapping.
- [docs/runtime-vs-traditional-firmware.md](docs/runtime-vs-traditional-firmware.md): runtime app model tradeoffs.
- [docs/esp32-flash-partitions.md](docs/esp32-flash-partitions.md): flash partition layout.

## License

This repository is GPL-3.0-only. The absorbed upstream HoloCubic app and NES sources are also GPL-3.0.
