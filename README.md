# VibeBoard Runtime GPL

VibeBoard Runtime GPL is the GPL-3.0 runtime/app-ecosystem line for ESP32-S3 small-screen devices.

The goal is to flash a generic ESP-IDF runtime once, then iterate on Lua/LVGL app packages without reflashing full firmware for every UI or app change.

## Boundary

Phase 2A does not build a complete ESP32 runtime firmware. It organizes the GPL runtime project, imports upstream source, validates app packages, and can create file-level deployment packages under `dist/apps/`.

Normal app iteration:

```text
AI generates app.info + Lua + assets
  -> validator checks package
  -> packager creates dist/apps/<app-id>
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
| `tools/app-packager/` | Validated app directory packager for device-storage deployment. |
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

## AI App Generation

See [docs/ai-generation-contract.md](docs/ai-generation-contract.md) for the package-plan format and fallback rules.

## Development Plan

See [docs/development-plan.md](docs/development-plan.md) for the current status, completed work, and next-phase roadmap.
