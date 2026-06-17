# Next Session Plan

Date: 2026-06-17

## Current Baseline

```text
origin/main plus local uncommitted migration work
```

The local work after the previous baseline implements deployment productization and starts the Phase 9 upstream app compatibility migration. The worktree is intentionally dirty; do not reset it.

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
- App package manifest v2 is implemented:
  - `tools/app-packager` emits `schema = vibeboard-runtime-app-package@2`;
  - manifests include structured `app`, `requires`, and `provides` sections while preserving existing top-level fields;
  - app registry exposes manifest-derived schema/version/kind/capabilities/compatible metadata through `/apps`.
- Runtime version metadata is exposed through `/status`:
  - runtime version;
  - Lua API version;
  - LVGL API version;
  - package schema;
  - native ABI version;
  - last status/message.
- Deployment productization first slice is implemented:
  - staged file upload using `/sdcard/.vibeboard-staging/<stage>`;
  - `/install/commit`;
  - `/install/abort`;
  - `/apps/delete`;
  - uploader defaults to staged upload + commit;
  - `--legacy-direct` keeps the old direct install flow available.
- Upstream display apps migrated so far:
  - `apps/matrix_rain` from upstream `MatrixRain`;
  - `apps/nixie_clock` from upstream `NixieClock`;
  - `apps/clock` from upstream `clock`.
  - `apps/conway_life` from upstream `ConwayLife`.
  - `apps/fluid_pendant` from upstream `FluidPendant`.
- Runtime compatibility added during these app migrations:
  - minimal LVGL canvas binding;
  - PNG decoder enabled;
  - `time.getlocal()`;
  - image antialias, angle, pivot, zoom helpers;
  - `lv_font_load`/`lv_font_free` fallback compatibility;
  - common text style helpers and LVGL constants.
- Firmware bring-up fixes from the 2026-06-17 board reflash:
  - main task stack increased to 8192 so SD app scanning no longer overflows `main`;
  - install service `max_uri_handlers` raised to 12 so all current HTTP endpoints can register;
  - LVGL display driver now yields in `wait_cb` while waiting for flush completion, avoiding task watchdog starvation in the observed refresh path.

## Last Verified Commands

```text
npm run test:firmware-static
npm run test:packager
npm test
git diff --check
idf.py build
idf.py -p /dev/cu.usbmodem112301 build flash
```

The latest full verification for migration work passed through package/static/test/build layers. The board was reflashed after fixing the `main` stack overflow, HTTP handler capacity, and LVGL watchdog starvation path. The final captured serial window showed the board still running and printing `SystemInfo` memory logs without stack overflow or watchdog output, but `http://192.168.1.32:8080/status` was not reachable. Treat HTTP/WiFi visibility as the first blocker to clear before uploaded-app screen verification.

## Immediate Next Work

### 1. Recover board HTTP/WiFi visibility

Before uploading apps, confirm the board is serving HTTP again.

Suggested checks:

```text
ls /dev/cu.usbmodem*
curl -s --max-time 5 http://192.168.1.32:8080/status
arp -a | grep 10:51:db:80:e2:e8
serial log on /dev/cu.usbmodem112301
```

Expected result:

- serial boot or runtime logs show runtime WiFi autoconnect;
- `/status` returns JSON from the install service;
- no `stack overflow in task main`;
- no repeated `task_wdt` report from `LVGL task`;
- no `ESP_ERR_HTTPD_HANDLERS_FULL`.

If `/status` is still unreachable but serial shows the board is alive, inspect runtime WiFi state and whether an existing SD app is interfering with the launcher/install-service path.

### 2. Board verification for migrated display apps

Install and launch these apps on the board:

- `matrix_rain`;
- `nixie_clock`;
- `clock`;
- `conway_life`.
- `fluid_pendant`.

Suggested ownership:

```text
docs/device-bringup.md
tools/app-uploader/
dist/apps/
```

Expected result: each app has serial logs and screen observations recorded. Keep the status as package/static/build until this hardware check is done.

### 3. Choose the next upstream migration slice

After display-app board verification, choose one:

- `2048` or another light interactive app to drive Lua touch/key input;
- `weather` to harden network UI compatibility;
- a smaller non-interactive display app if the board verification exposes LVGL stability issues.

Use the same TDD migration slice: API inventory, RED static test, minimal Runtime binding, local app package, package/static/test/build verification.

### 4. Remaining deployment productization

Deployment now has staged upload/delete, but still lacks:

- browser UI on top of `/apps`, `/install`, `/install/commit`, `/rescan`, `/launch`, `/stop`, and `/apps/delete`;
- interrupted-upload board test;
- stop-then-delete orchestration in tooling;
- persistent runtime WiFi config location outside compatibility fallback.

## Parallelization Guidance

Safe parallel tracks now:

- Board verification of already migrated display apps.
- Next app API inventory and RED static tests.
- Browser UI design for deployment management.
- Lua input-event design: `touch.on`, `key.on`.

## Deferred

Do not implement Lua `app.*` APIs yet. Keep them deferred until there is a concrete Lua-side workflow such as a Lua desktop, in-app navigation, or app-to-app handoff.
