# Next Session Plan

Date: 2026-06-13

## Current Baseline

```text
eafbf7b docs: add next session plan
```

The local work after this baseline fixes a launcher BOOT-after-launch crash found during board verification.

## What Is Done

- Phase 5A native launcher MVP is board-verified.
- The device boots to `VibeBoard Apps` instead of auto-running the first app.
- Touch tap-to-launch works on the device screen.
- BOOT short press selects; BOOT long press launches.
- HTTP install, app listing, rescan, launch, stop, and switch are implemented.
- Missing app entry files are filtered before they enter the launchable app list.
- Phase 5B lifecycle-state foundation is board-verified:
  - `/status` includes `state`.
  - states are `idle`, `starting`, `running`, `stopping`, `failed`.
  - compatibility fields `running` and `current_app` remain.
- A real launcher/Lua screen ownership crash was reproduced and fixed:
  - launching `smoke_visual_remote`, then short-pressing BOOT used stale launcher LVGL pointers;
  - `launcher_ui.c` now deactivates launcher controls after handing the screen to a Lua app;
  - static tests and firmware build pass;
  - fixed firmware was flashed to the board and board-verified.
- `apps/smoke_fail` exists as an intentional Lua failure sample for lifecycle checks.

## Last Verified Commands

```text
npm run test:firmware-static
npm test
git diff --check
idf.py build
esptool write_flash
```

The BOOT-after-launch crash fix and lifecycle `state` checks are board-verified.

## Immediate Next Work

### 1. Launcher UI controls

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

### 2. Upload reliability cleanup

Manual `curl --data-binary` upload works against the board, but `npm run upload:app` can still fail through the `nc` fallback on this Mac/router path. Clean up the uploader transport so it prefers the reliable native HTTP path when available, or improves retry/backoff around `nc`.

### 3. Failure UI

Use `apps/smoke_fail` to make failure visible on the native launcher screen, not only in `/status` and serial logs.

## Parallelization Guidance

Safe parallel tracks now:

- Launcher UI controls.
- Uploader reliability cleanup.
- Deployment productization planning: delete, staging/commit, browser UI.
- Lua input-event design: `touch.on`, `key.on`.

## Deferred

Do not implement Lua `app.*` APIs yet. Keep them deferred until there is a concrete Lua-side workflow such as a Lua desktop, in-app navigation, or app-to-app handoff.
