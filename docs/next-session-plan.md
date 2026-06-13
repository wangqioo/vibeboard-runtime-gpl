# Next Session Plan

Date: 2026-06-13

## Current Head

```text
353267d feat: expose app runner lifecycle state
```

The working tree was clean after this commit.

## What Is Done

- Phase 5A native launcher MVP is board-verified.
- The device boots to `VibeBoard Apps` instead of auto-running the first app.
- Touch tap-to-launch works on the device screen.
- BOOT short press selects; BOOT long press launches.
- HTTP install, app listing, rescan, launch, stop, and switch are implemented.
- Missing app entry files are filtered before they enter the launchable app list.
- Phase 5B lifecycle-state foundation is build-verified:
  - `/status` includes `state`.
  - states are `idle`, `starting`, `running`, `stopping`, `failed`.
  - compatibility fields `running` and `current_app` remain.

## Last Verified Commands

```text
npm run test:firmware-static
npm test
git diff --check
```

The lifecycle-state worker reported all three passed after commit `353267d`.

## Immediate Next Work

### 1. Board-verify lifecycle `state`

Flash and monitor the board, then verify:

```text
GET /status before launch -> state=idle
POST /launch?app=smoke_visual_remote -> state=starting or running during launch
POST /stop -> state=stopping during stop, then idle
bad app launch -> state=failed
```

Record evidence in `docs/device-bringup.md`, then promote the lifecycle status row in `docs/runtime-capabilities.md` from `build-verified` to `board-verified`.

### 2. Launcher UI controls

Add device-screen controls to the native launcher:

- stop current app;
- refresh/rescan app list;
- return to launcher after an app is running;
- show launch failure on screen.

Suggested ownership:

```text
firmware/vibeboard_runtime/main/launcher_ui.c
firmware/vibeboard_runtime/main/launcher_ui.h
tools/firmware-static-check/test.mjs
docs/device-bringup.md
docs/runtime-capabilities.md
```

Avoid changing `app_runner.c` unless lifecycle state integration requires a small accessor.

### 3. Failure-sample app

Add a tiny app that fails intentionally, then use it to prove:

- app failure sets `state=failed`;
- launcher remains usable;
- another app can still be launched afterward.

Suggested app id:

```text
smoke_fail
```

## Parallelization Guidance

Safe parallel tracks after lifecycle board verification:

- Launcher UI controls.
- Failure-sample app and validator/package coverage.
- Deployment productization planning: delete, staging/commit, browser UI.
- Lua input-event design: `touch.on`, `key.on`.

Do not parallel-edit `app_runner.c` and `install_service.c` until the lifecycle state field is board-verified.

## Deferred

Do not implement Lua `app.*` APIs yet. Keep them deferred until there is a concrete Lua-side workflow such as a Lua desktop, in-app navigation, or app-to-app handoff.
