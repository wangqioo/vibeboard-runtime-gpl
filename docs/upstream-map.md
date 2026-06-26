# Upstream Map

This repository absorbs two GPL-3.0 upstream projects and ports selected apps/modules into the VibeBoard Runtime model.

## Imported Snapshots

| Path | Source | Purpose |
| --- | --- | --- |
| `upstream/holocubic-apps/` | `https://github.com/clocteck/holocubic-apps` | Lua/LVGL apps, assets, bridge docs, and app-side patterns. |
| `upstream/holocubic-nes-esp32/` | `https://github.com/clocteck/holocubic-nes-esp32` | NES native module source and host API reference. |

## Migrated Or Curated Apps

| App | Source path | Local path | Notes |
| --- | --- | --- | --- |
| 2048 | `upstream/holocubic-apps/2048/` | `apps/2048/` | Key/touch-driven game migration. |
| BTC | `upstream/holocubic-apps/btc/` | `apps/btc/` | Minimal network price card. |
| Clock | `upstream/holocubic-apps/clock/` | `apps/clock/` | Analog image-clock migration. |
| Codex Buddy | `upstream/holocubic-apps/codex_buddy/` | `apps/codex_buddy/` | Desktop bridge/GIF/HOME permission app. |
| Conway Life | `upstream/holocubic-apps/ConwayLife/` | `apps/conway_life/` | Canvas/timer migration. |
| Fluid Pendant | `upstream/holocubic-apps/FluidPendant/` | `apps/fluid_pendant/` | Canvas animation migration. |
| HW Monitor | `upstream/holocubic-apps/hwmon/` | `apps/hwmon/` | Host metrics panel. |
| LV Benchmark | `upstream/holocubic-apps/lv-benchmark/` | `apps/lv-benchmark/` | Runtime benchmark app. |
| Matrix Rain | `upstream/holocubic-apps/MatrixRain/` | `apps/matrix_rain/` | Canvas display migration. |
| Mini Claw | `upstream/holocubic-apps/mini_claw/` | `apps/mini_claw/` | WebUI service and brightness route app. |
| NES game | `upstream/holocubic-apps/nesgame/` | `apps/nesgame/` | Lua frontend backed by native NES module. |
| NES module | `upstream/holocubic-nes-esp32/` | `modules/nes/` | Native NES core integration. |
| Nixie Clock | `upstream/holocubic-apps/NixieClock/` | `apps/nixie_clock/` | Image-clock migration. |
| Photos | `upstream/holocubic-apps/photos/` | `apps/photos/` | Minimal image playlist. |
| Plane | `upstream/holocubic-apps/plane/` | `apps/plane/` | Sprite game migration. |
| Settings | `upstream/holocubic-apps/settings/` | `apps/settings/` | Minimal device settings panel. |
| Spectrum | `upstream/holocubic-apps/spectrum/` | `apps/spectrum/` | Real-I2S audio visualizer. |
| Videos | `upstream/holocubic-apps/videos/` | `apps/videos/` | GIF playlist migration. |
| Voice AI | `upstream/holocubic-apps/voice_ai/` | `apps/voice_ai/` | Device voice UI plus desktop bridge. |
| Weather | `upstream/holocubic-apps/weather/` | `apps/weather/` | Lua/LVGL weather card with local assets and Cubic server HTTP. |

Some upstream directories have different capitalization or naming conventions. Local app IDs are normalized for the Runtime app registry.

## Local Smoke Apps

The `apps/smoke_*` packages are not upstream products. They are small regression apps that lock down Runtime behavior before or after migrating larger apps:

- `smoke_ui`, `smoke_timer`, `smoke_file`, `smoke_assets`, `smoke_visual`, `smoke_network`;
- `smoke_fail`, `smoke_key`, `smoke_touch`, `smoke_gamepad`, `smoke_i2s`;
- `smoke_nes`, `smoke_app_manager`, `smoke_controls`, `smoke_lvgl_widgets`, `smoke_lvgl_style`.

## Remaining Migration Risks

The main remaining work is not copying files from upstream. It is validating physical behavior and extending Runtime APIs only when a migrated app needs them:

- physical screen/photo QA for Weather backgrounds, GIF animation, fonts, and complex widget layouts;
- physical touch coordinate QA beyond existing 2048 gameplay evidence;
- real BLE/Xbox controller input, not only synthetic gamepad injection;
- real microphone/provider/speaker path for Voice AI;
- longer NES real-game performance and audio soak;
- any new LVGL or Lua APIs required by future upstream apps.

When an app requires support outside the current Runtime API surface, the validator and AI contract should report `Runtime update required` instead of hiding the gap in app code.

## License

Both upstream projects are GPL-3.0. This repository is GPL-3.0-only.
