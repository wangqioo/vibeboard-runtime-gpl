# Phase 5A Closure: Native Launcher MVP

Date: 2026-06-13

## Scope

Phase 5A closes the first usable on-device app lifecycle slice:

```text
boot runtime
  -> scan SD apps
  -> show native app list
  -> launch selected app
  -> stop/switch when another app is launched
```

This phase uses a native LVGL launcher in firmware. It does not make the launcher a Lua app, and it does not expose Lua `app.*` manager APIs yet.

## Board-Verified Done

- Runtime boots from the custom 4 MB `factory` app partition at `0x10000`.
- Runtime scans `/sdcard/apps` and stores multiple registry entries.
- Registry skips apps whose declared entry file is missing.
- Runtime starts the HTTP install service on port `8080`.
- `GET /apps`, `POST /rescan`, `POST /launch`, and `POST /stop` are board-verified.
- App switching is controlled: launching a new app requests stop on the current app before starting the next one.
- Boot shows the native `VibeBoard Apps` launcher instead of auto-running the first app.
- Touch tap-to-launch works on the device screen.
- BOOT short press selects the next app.
- BOOT long press launches the selected app.

## Evidence

Primary evidence is in `docs/device-bringup.md`.

Key boot evidence:

```text
I boot: Loaded app from partition at offset 0x10000
I app_init: Project name:     vibeboard_runtime
W app_registry: skip app entry that is missing: raw_upload/main.lua
I app_registry: found 2 apps
I install_service: install service listening on port 8080
I vibeboard_runtime: VibeBoard Runtime ready: sd=ok apps=2 launcher=ok
```

Key launcher evidence:

```text
I launcher_ui: launcher BOOT short press: next
I launcher_ui: launcher selected index: 1
I launcher_ui: launcher BOOT long press: launch
I launcher_ui: launcher selected app: smoke_network
I app_runner: Lua app start: smoke_network
I app_runner: Lua async finished: smoke_network status=ESP_OK message=ok
```

## Deferred To Phase 5B

- Return to launcher after an app is running.
- Stop current app from the device screen.
- Refresh/rescan app list from the device screen.
- Show launch failure details on the device screen.
- Board-verify the build-verified `/status` lifecycle state: `idle`, `starting`, `running`, `stopping`, `failed`.
- Add failure-sample verification proving a bad app does not break the runtime or launcher.
- Expose Lua app manager APIs:

```lua
app.list()
app.current()
app.launch(id)
app.rescan()
app.exiting()
app.on(event, callback)
```

## Non-Goals

- Native module loading.
- Full HoloCubic compatibility.
- Browser-based app management.
- Lua touch/key event APIs. Those belong to the next input-event phase.

## Current Decision

Do not implement Lua `app.*` APIs as part of Phase 5A. The native launcher already satisfies the current device-screen launch requirement. Lua app manager APIs should be introduced only when there is a concrete Lua-side workflow, such as a Lua desktop, in-app navigation, or app-to-app handoff.
