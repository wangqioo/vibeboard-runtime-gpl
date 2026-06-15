# Next Session Plan

Date: 2026-06-15

## Current Baseline

```text
eafbf7b docs: add next session plan
```

The local work after this baseline fixes a launcher BOOT-after-launch crash found during board verification.
The current branch also implements Phase 5B launcher lifecycle controls, runtime WiFi autoconnect, and the native HTTP uploader/launch board check.

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
- Phase 5B launcher lifecycle controls are implemented and build-verified:
  - native Stop control requests runner stop and waits for completion;
  - native Refresh control rescans the SD app registry and rebuilds the launcher list;
  - stopping an app or observing an async app failure returns to the native launcher;
  - launcher failure feedback uses the runner last-result message;
  - BOOT long press can stop a running app while the launcher is inactive.
- Runtime WiFi autoconnect is implemented and board-verified:
  - boot reads `/sdcard/runtime/wifi.json`;
  - the current test board also accepts the existing local `/sdcard/apps/smoke_network/wifi.json`;
  - boot logs `runtime sta got ip 192.168.1.32` without manually launching `smoke_network`.
- Uploader reliability cleanup is implemented and board-verified:
  - `upload:app` and `launch:app` default to Node native HTTP;
  - `nc` remains available as an explicit `--transport nc` fallback.
- Native HTTP upload/launch board check passed without `--transport nc`:
  - uploaded `smoke_visual_native`;
  - `/rescan` and `/apps` confirmed it;
  - launched `smoke_visual_native`, `smoke_fail`, and `smoke_network`.
- Launch verification exposed a board-side HTTPD stack overflow in `/launch`; the install service now sets `config.stack_size = 8192`, and the post-fix board launch check passed.

## Last Verified Commands

```text
npm run test:firmware-static
npm test
git diff --check
idf.py build
esptool write_flash
```

The BOOT-after-launch crash fix, lifecycle `state` checks, runtime WiFi autoconnect, and native HTTP upload/launch path are board-verified. The Phase 5B lifecycle controls are board-verified through HTTP and serial for stop/rescan/failure/recovery, but the visible native screen controls still need one short physical touch/BOOT smoke.

## Immediate Next Work

### 1. Physical screen smoke for launcher lifecycle controls

Verify the visible device-screen controls on the physical board:

- tap native Stop while `smoke_visual_native` is running;
- tap native Refresh and confirm the app list still shows the uploaded app;
- confirm the launcher screen returns after an app stops or fails;
- launch `apps/smoke_fail` and confirm the screen shows a readable failure message;
- BOOT long-press stop while a Lua app owns the screen.

Suggested ownership:

```text
docs/device-bringup.md
docs/runtime-capabilities.md
```

Expected result: record human screen evidence for Stop, Refresh, return-to-launcher, and failure-feedback behavior; then promote the Phase 5B launcher lifecycle controls from `partly-board-verified` to `board-verified`.

## Parallelization Guidance

Safe parallel tracks now:

- Physical screen smoke for launcher lifecycle controls.
- Deployment productization planning: delete, staging/commit, browser UI.
- Lua input-event design: `touch.on`, `key.on`.

## Deferred

Do not implement Lua `app.*` APIs yet. Keep them deferred until there is a concrete Lua-side workflow such as a Lua desktop, in-app navigation, or app-to-app handoff.
