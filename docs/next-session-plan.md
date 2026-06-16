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
- Runtime compatibility added during these app migrations:
  - minimal LVGL canvas binding;
  - PNG decoder enabled;
  - `time.getlocal()`;
  - image antialias, angle, pivot, zoom helpers;
  - common text style helpers and LVGL constants.

## Last Verified Commands

```text
npm run test:firmware-static
npm run test:packager
npm test
git diff --check
idf.py build
```

The latest full verification for today's migration work passed through package/static/test/build layers. The newly migrated `matrix_rain`, `nixie_clock`, and `clock` apps still need board screen verification before they can be marked board-verified.

## Immediate Next Work

### 1. Continue Phase 9 with `ConwayLife`

Use the same TDD migration slice as the previous apps:

- add RED static tests for `apps/conway_life` and any missing runtime API;
- import `upstream/holocubic-apps/ConwayLife/main.lua`;
- copy `font/time_46.bin`;
- adapt the hardcoded font path to `/sd/apps/conway_life/font/time_46.bin`;
- add `apps/conway_life/app.info`;
- implement minimal `lv_font_load`/`lv_font_free` compatibility if needed;
- add `conway_life` to demo packaging.

Suggested ownership:

```text
apps/conway_life/
firmware/vibeboard_runtime/main/lua_lvgl_widgets.c
tools/firmware-static-check/test.mjs
tools/app-packager/
```

Expected result: `npm run package:app -- apps/conway_life`, `npm run test:firmware-static`, `npm run test:packager`, `npm test`, `git diff --check`, and `idf.py build` all pass.

### 2. Board verification for migrated display apps

Once the codebase is green, install and launch these apps on the board:

- `matrix_rain`;
- `nixie_clock`;
- `clock`;
- `conway_life` if completed.

Record serial logs and screen observations in `docs/device-bringup.md`.

### 3. Remaining deployment productization

Deployment now has staged upload/delete, but still lacks:

- browser UI on top of `/apps`, `/install`, `/install/commit`, `/rescan`, `/launch`, `/stop`, and `/apps/delete`;
- interrupted-upload board test;
- stop-then-delete orchestration in tooling;
- persistent runtime WiFi config location outside compatibility fallback.

## Parallelization Guidance

Safe parallel tracks now:

- `ConwayLife` migration and static/runtime API compatibility.
- Board verification of already migrated display apps.
- Browser UI design for deployment management.
- Lua input-event design: `touch.on`, `key.on`.

## Deferred

Do not implement Lua `app.*` APIs yet. Keep them deferred until there is a concrete Lua-side workflow such as a Lua desktop, in-app navigation, or app-to-app handoff.
