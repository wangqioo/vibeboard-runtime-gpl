# Phase 5B Launcher Controls Design

Date: 2026-06-14

## Goal

Turn the board-verified native launcher MVP into a minimal device-side lifecycle control surface.

The user should be able to use the device screen to:

- stop the currently running Lua app;
- return to the native launcher after an app owns the screen;
- refresh the SD app list;
- see launch failures on screen.

This slice intentionally keeps Lua `app.*` APIs, upload staging, package hashes, browser UI, touch event APIs, and native module ABI work out of scope.

## Current Baseline

The runtime already boots through this path:

```text
board init
  -> scan /sdcard/apps
  -> start HTTP install service
  -> show native VibeBoard Apps launcher
  -> launch app by touch, BOOT, or HTTP
  -> app_runner owns Lua lifecycle
```

Relevant current files:

- `firmware/vibeboard_runtime/main/main.c` owns boot orchestration.
- `firmware/vibeboard_runtime/main/app_registry.c` scans `/sdcard/apps` into `vb_app_registry_result_t`.
- `firmware/vibeboard_runtime/main/app_runner.c` owns Lua launch, stop, lifecycle state, and current app id.
- `firmware/vibeboard_runtime/main/launcher_ui.c` draws the native launcher and launches selected apps.
- `firmware/vibeboard_runtime/main/install_service.c` exposes HTTP lifecycle endpoints that already share the same registry and runner.
- `tools/firmware-static-check/test.mjs` is the local guardrail for embedded firmware behavior.

The main product gap is device-side lifecycle recovery. Once the launcher hands the screen to Lua, launcher controls are intentionally deactivated to avoid stale LVGL pointer crashes. That fixed the BOOT-after-launch crash, but it also leaves no device-screen way to stop the app, return to launcher, refresh the app list, or surface a launch error.

## Recommended Approach

Extend the existing native launcher rather than introducing a Lua launcher or a new lifecycle subsystem.

Why:

- the current native launcher is already board-verified for touch and BOOT;
- HTTP lifecycle endpoints already prove `app_runner` stop, switch, rescan, and status paths;
- Phase 5B needs product control around the existing runner, not a new architecture;
- keeping this slice native avoids needing Lua `app.*` before there is a concrete Lua workflow.

Alternatives considered:

- Upload reliability first: useful, but it does not solve the device-screen recovery gap.
- Full lifecycle state machine rewrite: likely valuable later, but too large for this slice.
- Lua launcher: deferred until `app.*` APIs and Lua input events have a real workflow.

## UI Behavior

The launcher screen remains the first screen after boot.

The launcher adds a small system control area below or near the app list:

- `Stop`: requests stop of the current app if one is running.
- `Refresh`: rescans `/sdcard/apps` and rebuilds the launcher list.
- Status label: shows idle, launching, stopping, stopped, refreshed, and failure messages.

The exact visual treatment should stay compact and consistent with the current 320x240 native launcher. This is a utilitarian device control surface, not a new app gallery design.

Expected states:

- No SD or scan error: show the existing scan error message and keep refresh available when safe.
- No apps: show `No apps on SD` and keep refresh available.
- Apps available: show app buttons plus stop/refresh controls.
- Launch succeeds: app takes over the screen as it does today.
- Launch fails synchronously: stay on launcher and show the error.
- App fails after async launch: the next launcher/status refresh should expose the failure message.
- Stop succeeds: show launcher again with a fresh app list.
- Stop times out: show `Stop timeout` and keep controls active.

## Lifecycle Design

Keep `app_runner` as the lifecycle owner.

Add only small accessors if needed:

- current lifecycle state is already exposed through `vb_app_runner_current_state_name()`;
- current app id is already exposed through `vb_app_runner_current_id()`;
- stop and wait are already exposed through `vb_app_runner_stop()` and `vb_app_runner_wait_stopped()`.

If screen failure text needs the last async failure message, add a narrow accessor such as:

```c
const char *vb_app_runner_last_message(void);
```

The launcher should not inspect Lua internals. It should only use runner status, registry scans, and app entries.

## Registry Design

The screen app list and HTTP `/apps` must continue to come from the same `vb_app_registry_result_t`.

Refresh behavior:

```text
user taps Refresh or uses BOOT refresh path
  -> call vb_app_registry_scan(...)
  -> clean launcher screen
  -> rebuild app list from registry
  -> update status with app count or scan error
```

This design does not add a second registry cache.

## Error Handling

Errors should be visible on the native launcher screen when the launcher is active.

Minimum messages:

- scan error: ESP-IDF error name from `vb_app_registry_scan`;
- launch invalid state: ESP-IDF error name from `vb_app_runner_launch_async`;
- stop timeout: `Stop timeout`;
- async Lua failure: last runner failure message if available, otherwise runner state `failed`.

Do not try to render long stack traces on the 320x240 display. Keep the on-screen message short and rely on serial logs for full detail.

## Testing Strategy

Use test-first development.

Add static guardrails before implementation:

- `launcher_ui.c` exposes stop and refresh UI paths;
- launcher refresh calls `vb_app_registry_scan`;
- launcher stop calls `vb_app_runner_stop` and `vb_app_runner_wait_stopped`;
- launcher can rebuild/show itself after stop;
- launcher has a path for failure text from runner state or last message;
- `app_runner` exposes any new narrow failure-message accessor if one is added.

Run:

```bash
npm run test:firmware-static
npm test
```

Hardware verification after implementation should use:

- boot to launcher;
- tap an app to launch;
- stop it from the device screen;
- refresh after copying or uploading an app;
- launch `apps/smoke_fail` and confirm screen-visible failure recovery.

## Out Of Scope

This slice does not include:

- Lua `app.list()`, `app.launch()`, `app.current()`, or `app.rescan()`;
- upload staging, commit, delete, or hash validation;
- browser or desktop app manager UI;
- Lua touch/key event APIs;
- native module ABI;
- broad LVGL binding expansion;
- changing the firmware partition layout.

## Acceptance Criteria

- The launcher still boots as the first screen.
- The app list still launches apps by touch and BOOT.
- The device screen exposes stop and refresh controls.
- Stopping an app returns to a usable launcher screen.
- Refresh rebuilds the launcher list from the same registry used by HTTP `/apps`.
- Launch failures are visible on the device screen while preserving serial logs.
- Static firmware tests cover the new launcher controls and lifecycle hooks.
- `npm test` passes.
