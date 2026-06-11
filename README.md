# VibeBoard Runtime GPL

VibeBoard Runtime GPL is the GPL-3.0 runtime/app-ecosystem line for ESP32-S3 small-screen devices.

The goal is to flash a generic ESP-IDF runtime once, then iterate on Lua/LVGL app packages without reflashing full firmware for every UI or app change.

## Boundary

Phase 1 does not build a complete ESP32 runtime firmware. It organizes the GPL runtime project, imports upstream source, validates app packages, and documents the deployment path.

Normal app iteration:

```text
AI generates app.info + Lua + assets
  -> validator checks package
  -> user deploys files to device storage
  -> launcher runs the app
```

Still requires runtime firmware work:

- display, input, SD, WiFi, audio, and storage drivers;
- Lua VM and NodeMCU-style module changes;
- LVGL Lua binding changes;
- app launcher or system service changes;
- native module ABI changes.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `upstream/holocubic-apps/` | Full absorbed HoloCubic Lua/LVGL app snapshot. |
| `upstream/holocubic-nes-esp32/` | Full absorbed NES dynamic module snapshot. |
| `apps/` | Curated VibeBoard-facing app packages. |
| `modules/` | Curated native module paths. |
| `tools/app-validator/` | Package metadata parser and validator. |
| `docs/` | Runtime, deployment, app package, and AI generation docs. |

## First Demo Apps

- `apps/weather`: pure Lua/LVGL network/UI app.
- `apps/voice_ai`: device voice app plus desktop AI bridge.
- `apps/nesgame`: Lua app backed by native NES module.

## Validate

```bash
npm test
npm run validate:apps
```

## AI App Generation

See [docs/ai-generation-contract.md](docs/ai-generation-contract.md) for the package-plan format and fallback rules.
