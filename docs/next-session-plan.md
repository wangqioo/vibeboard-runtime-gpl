# Next Session Plan

Date: 2026-06-15

## Current Baseline

```text
eafbf7b docs: add next session plan
```

The local work after this baseline fixes a launcher BOOT-after-launch crash found during board verification.
The current branch also implements Phase 5B launcher lifecycle controls, runtime WiFi autoconnect, the native HTTP uploader/launch board check, app delete/uninstall, and staged upload/commit.

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
- App delete/uninstall is implemented and board-verified:
  - `POST /delete?app=<id>` recursively deletes one installed app directory and rescans;
  - deletion of the currently running app returns `409 app is running`;
  - `npm run delete:app` wraps the endpoint from the Mac.
- Staged upload/commit is implemented and board-verified:
  - `upload:app` defaults to `/discard -> /stage -> /commit -> /apps`;
  - `--mode direct` keeps the old `/install -> /rescan -> /apps` path for recovery;
  - firmware rejects unsafe paths, validates staged `app.info` plus entry file, refuses to commit over the running app, and uses same-filesystem rename replacement;
  - adding staged endpoints exposed the default HTTPD URI handler capacity limit; the install service now sets `config.max_uri_handlers = 12`, and `/stop` plus `/delete` stayed registered after reflashing.

## Last Verified Commands

```text
npm run test:firmware-static
npm test
git diff --check
idf.py build
esptool write_flash
```

The BOOT-after-launch crash fix, lifecycle `state` checks, runtime WiFi autoconnect, native HTTP upload/launch path, app delete/uninstall, staged upload/commit, and Phase 5B lifecycle controls are board-verified. Verification includes HTTP status checks, serial logs, and manual physical screen smoke for Stop, Refresh, return-to-launcher, readable failure feedback, and BOOT long-press stop.

## Immediate Next Work

### 1. Deployment productization

Turn the now-verified upload/launch path into a more complete app deployment workflow:

- consider a small browser UI on top of `/apps`, `/stage`, `/commit`, `/discard`, `/launch`, `/stop`, and `/delete`;
- decide where persistent runtime WiFi config should live outside the current compatibility fallback.

Suggested ownership:

```text
tools/app-uploader/
firmware/vibeboard_runtime/main/install_service.c
docs/app-package-format.md
```

Expected result: make deployment reliable enough for repeated app iteration without SD-card removal and without relying on manual recovery steps.

## Parallelization Guidance

Safe parallel tracks now:

- Deployment productization planning: browser UI and formal WiFi configuration.
- Lua input-event design: `touch.on`, `key.on`.

## Deferred

Do not implement Lua `app.*` APIs yet. Keep them deferred until there is a concrete Lua-side workflow such as a Lua desktop, in-app navigation, or app-to-app handoff.
