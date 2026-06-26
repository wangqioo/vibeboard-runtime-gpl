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
- Runtime modules for `app`, `file`, `gamepad`, `http`, `i2s`, `json`/`sjson`, `key`, `sys`, `time`, `tmr`, `touch`, and `wifi`.
- LVGL bindings for labels, objects, images, GIFs, canvas BMP backgrounds, common widgets, styles, fonts, and animations.
- NES native module smoke paths, Voice AI bridge paths, I2S RX/TX smoke paths, and app lifecycle smoke tools.

Recent known-good board evidence includes `app_count=45`, HTTP Runtime status at `http://192.168.1.32:8080/status`, `device:check` passing, and `2048` launch/stop lifecycle smoke returning to idle.

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

See [docs/runtime-boundary.md](docs/runtime-boundary.md) for the exact boundary.

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
idf.py -p /dev/cu.usbmodem111301 flash
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

## Curated Apps

Migrated or curated user-facing apps:

- `2048`
- `btc`
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
- `smoke_gamepad`, `smoke_i2s`, `smoke_nes`, `smoke_app_manager`
- `smoke_controls`, `smoke_lvgl_widgets`, `smoke_lvgl_style`

See [docs/upstream-map.md](docs/upstream-map.md) for upstream source mapping.

## Smoke Commands

Representative board smoke commands:

```bash
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app 2048 --stop
npm run input:smoke -- --board http://192.168.1.32:8080 --app smoke_key --key LEFT:SHORT
npm run gamepad:smoke -- --board http://192.168.1.32:8080 --inject-gamepad --require-updates 1
npm run i2s:smoke -- --board http://192.168.1.32:8080 --require-write --require-tone-writes 8
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
- [docs/runtime-capabilities.md](docs/runtime-capabilities.md): implemented APIs with build and board evidence.
- [docs/development-plan.md](docs/development-plan.md): detailed Chinese status log and roadmap.
- [docs/device-bringup.md](docs/device-bringup.md): hardware bring-up evidence log.
- [docs/upstream-map.md](docs/upstream-map.md): HoloCubic source-to-local migration mapping.
- [docs/runtime-vs-traditional-firmware.md](docs/runtime-vs-traditional-firmware.md): runtime app model tradeoffs.
- [docs/esp32-flash-partitions.md](docs/esp32-flash-partitions.md): flash partition layout.

## License

This repository is GPL-3.0-only. The absorbed upstream HoloCubic app and NES sources are also GPL-3.0.
