# VibeBoard Runtime GPL Design

## Decision

Build a new GPL-3.0 project at `/Users/wq/vibeboard-runtime-gpl`.

This project directly absorbs source from:

- `https://github.com/clocteck/holocubic-apps`
- `https://github.com/clocteck/holocubic-nes-esp32`

Because those upstream repositories are GPL-3.0, this new project is GPL-3.0. The existing `/Users/wq/VibeBoard` repository remains separate and keeps its current MIT license boundary. GPL source must not be copied into the existing MIT repository.

## Product Goal

Create a VibeBoard Runtime line for ESP32-S3 small-screen devices:

```text
flash a generic ESP-IDF runtime once
  -> generate Lua/LVGL app packages with AI
  -> deploy app files and assets to device storage
  -> run apps through a device launcher
  -> optionally load native .so modules for performance-heavy features
```

The point is to avoid rebuilding and reflashing full ESP-IDF firmware for routine app iteration. Firmware flashing remains necessary when changing the runtime itself, hardware drivers, system services, Lua/LVGL bindings, or incompatible native ABI surfaces.

## Relationship To Current VibeBoard

Current VibeBoard Micro is an ESP-IDF-first workflow:

```text
natural-language request
  -> Program Manifest and ESP-IDF application source
  -> compiler service
  -> USB / WiFi OTA / BLE OTA flashing
  -> device evidence and repair loop
```

VibeBoard Runtime GPL adds a second workflow:

```text
natural-language request
  -> Lua/LVGL app package
  -> app validation and preview
  -> browser upload / WiFi deploy / SD deploy
  -> device launcher runs the app
```

The two lines should stay product-related but repository-separated:

- `/Users/wq/VibeBoard`: MIT, ESP-IDF code generation and flashing workflow.
- `/Users/wq/vibeboard-runtime-gpl`: GPL-3.0, Lua/LVGL runtime app ecosystem and absorbed upstream source.

## Initial Repository Shape

```text
vibeboard-runtime-gpl/
  LICENSE
  NOTICE.md
  README.md
  docs/
    architecture.md
    app-package-format.md
    ai-generation-contract.md
    deployment-flow.md
    runtime-boundary.md
    upstream-map.md
    superpowers/specs/2026-06-11-vibeboard-runtime-gpl-design.md
  upstream/
    holocubic-apps/
    holocubic-nes-esp32/
  apps/
    weather/
    voice_ai/
    nesgame/
  modules/
    nes/
  tools/
    import-upstream.sh
    app-validator/
  web-console/
```

## Absorption Plan

The first version imports upstream source as source, not as a vague reference:

- `upstream/holocubic-apps/` contains the full `clocteck/holocubic-apps` tree.
- `upstream/holocubic-nes-esp32/` contains the full `clocteck/holocubic-nes-esp32` tree.
- `NOTICE.md` records upstream repository URLs, observed license, import date, and any local changes.
- `apps/` contains curated VibeBoard-facing app packages copied from upstream for the first demo path.
- `modules/nes/` contains the NES dynamic module path copied or bridged from upstream for focused development.

The repo may initially duplicate selected app/module files from `upstream/` into `apps/` and `modules/` so the VibeBoard-facing paths are easy to understand. When duplicated, `NOTICE.md` must say which upstream path each curated copy came from.

## Runtime Boundary

The runtime is the firmware/platform layer that must be flashed onto ESP32-S3. It owns:

- display, input, SD card, network, audio, and storage drivers;
- Lua VM and NodeMCU-style modules;
- LVGL Lua bindings;
- app launcher and app lifecycle;
- app installation/update APIs;
- optional dynamic module ABI for `.so` modules;
- crash/log/evidence reporting back to VibeBoard tools.

The AI-generated layer owns:

- `app.info`;
- `main.lua` or declared entry script;
- app-local assets, fonts, config examples, and metadata;
- optional requests to use allowed runtime capabilities.

AI-generated app code must not assume it can mutate runtime internals. It should target documented Lua/LVGL APIs and package-format rules.

## App Package Contract

Each app directory must include:

```ini
name = Weather
entry = main.lua
description = Weather card
```

Required fields:

- `name`: launcher display name.
- `entry`: Lua entry file inside the app directory.
- `description`: one-sentence summary.

Allowed package contents:

- Lua scripts.
- Images, GIFs, BMPs, and other runtime-supported visual assets.
- Font binaries supported by the runtime.
- `config.example.json`.
- App-specific README or `info.html`.

The validator should check that:

- `app.info` exists.
- Required fields are present.
- The entry file exists.
- Paths stay inside the app directory.
- The app declares special capabilities before using network, audio, file, or module access.

## AI Generation Contract

The AI app generator should output a package plan first, then files:

```json
{
  "app": {
    "name": "Timer",
    "entry": "main.lua",
    "description": "Simple countdown timer",
    "capabilities": ["lvgl", "timer"]
  },
  "files": [
    {
      "path": "app.info",
      "type": "text",
      "content": "name = Timer\nentry = main.lua\ndescription = Simple countdown timer\n"
    },
    {
      "path": "main.lua",
      "type": "lua",
      "content": "..."
    }
  ]
}
```

The generator should prefer Lua/LVGL apps over full ESP-IDF firmware when the user asks for screen UI, simple tools, dashboards, media display, small games, AI widgets, or network cards that fit the runtime API.

The generator should fall back to the existing ESP-IDF workflow when the user asks to change drivers, pin maps, low-level protocols, BLE services, partitioning, SDK config, or capabilities not exposed by the runtime.

## Deployment Flow

The desired first demo deployment flow:

```text
user describes app
  -> AI produces app package
  -> validator checks package
  -> web console shows package contents and warnings
  -> user deploys to device storage
  -> device launcher refreshes app list
  -> app starts without reflashing firmware
```

Acceptable first transport options:

- SD-card copy documented as the manual baseline.
- WiFi HTTP upload when the runtime exposes an upload endpoint.
- Browser-to-device upload through a small web console when the endpoint is available.

USB flashing remains part of runtime installation and recovery, not the normal app-edit loop.

## First Demo Target

The first demo should prove three app classes:

- `weather`: ordinary network/UI card.
- `voice_ai`: device app plus desktop bridge returning text and optional Lua/LVGL UI snippets.
- `nesgame`: Lua app using a native `.so` module for performance-heavy emulation.

This gives a clean spread:

```text
pure Lua/LVGL app
  + desktop AI bridge app
  + Lua app calling native module
```

## Error Handling

The system should surface errors by layer:

- Package validation errors before deployment.
- Upload/deploy transport errors.
- Launcher/app metadata errors.
- Runtime Lua exceptions.
- Native module load or ABI mismatch errors.
- Device logs and crash evidence.

The user-facing wording must distinguish:

- "App update failed" for Lua/assets/package problems.
- "Runtime update required" for missing firmware-level capability.
- "Native module ABI mismatch" for `.so` compatibility failures.

## Testing

Initial testing should be file/package focused:

- app metadata parser tests;
- app package validator tests;
- curated upstream copy checks;
- NOTICE/upstream mapping checks;
- AI generation contract fixture tests;
- deployment manifest tests.

Hardware tests come later, once a runtime flashing target is selected and available.

## Explicit Non-Goals For Phase 1

Phase 1 does not build a complete new ESP32 firmware runtime from scratch.

Phase 1 does not merge GPL source into `/Users/wq/VibeBoard`.

Phase 1 does not promise no-flash development for runtime or driver changes.

Phase 1 does not attempt to support every board. The product direction stays ESP32-S3 small-screen first.

Phase 1 does not turn semantic/browser preview into proof that real LVGL code works on hardware.

## Open Implementation Choice

The implementation plan should decide whether to preserve upstream Git history by subtree/fork import or to import release snapshots with explicit source notices. The faster first step is snapshot import into `upstream/`, followed by a script that can refresh snapshots deliberately.
