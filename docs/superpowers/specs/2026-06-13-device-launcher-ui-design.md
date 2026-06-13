# Device Launcher UI Design

Date: 2026-06-13

## Goal

Make the board boot into an on-device app list, then run an app only after the user taps it on the device screen.

This replaces the current boot behavior where `app_main()` automatically runs the first app found on the SD card.

## Current Context

The runtime already initializes the LCKFB SZPI ESP32-S3 board display, LVGL, FT5x06 touch, SD card, WiFi, and HTTP install service. App discovery is handled by `vb_app_registry_scan()`, with up to `VB_APP_REGISTRY_MAX_APPS` entries stored in `vb_app_registry_result_t`.

Remote app lifecycle is already available through the runner:

- `vb_app_runner_launch_async()`
- `vb_app_runner_stop()`
- `vb_app_runner_wait_stopped()`
- `vb_app_runner_is_running()`
- `vb_app_runner_current_id()`

The device UI should reuse that runner path instead of introducing a separate launcher lifecycle.

## Approach

Add a native LVGL launcher module in firmware, tentatively named `launcher_ui`.

The launcher owns only the system app-selection screen. User apps still own their own LVGL screens after launch.

## Boot Flow

1. `app_main()` starts board hardware and scans `/sdcard/apps`.
2. `app_main()` starts the install service when SD is available.
3. `app_main()` shows the native launcher screen.
4. `app_main()` does not automatically run the first app.
5. The device stays on the launcher until the user taps an app.

## Launcher Screen

The first version should be simple and testable:

- Title: `VibeBoard Apps`
- Status row showing SD/app scan result.
- One tap target per stored app.
- Primary text: `app.name`.
- Secondary text: `app.id`.
- Empty/error state when no app is available.

The first version supports the existing stored registry limit, `VB_APP_REGISTRY_MAX_APPS`. Complex pagination can wait until the board has more than 12 installed apps in normal use.

## Tap Behavior

When the user taps an app:

1. Update the status row to `Launching <app id>...`.
2. If the same app is already running, show `Already running`.
3. If a different app is running, request stop with `vb_app_runner_stop()` and wait with `vb_app_runner_wait_stopped(1500)`.
4. Launch the tapped app with `vb_app_runner_launch_async()`.
5. On success, show `Launched <app id>`.
6. On failure, show the ESP error name.

This mirrors the remote `/launch?app=<id>` behavior so screen and HTTP app switching stay consistent.

## Out Of Scope

- A polished home screen or brand redesign.
- App icons.
- Scrolling or pagination beyond the current stored app limit.
- A persistent overlay for returning from a running app back to the launcher.
- Making the launcher a Lua app.

## Test And Verification Plan

Static checks should guard that:

- `launcher_ui.c` and `launcher_ui.h` exist and are compiled.
- `app_main()` calls the launcher instead of automatically calling `vb_app_runner_run()`.
- The launcher uses LVGL button/event APIs.
- The launcher calls the runner lifecycle functions for stop/switch/launch.

Build verification:

- `npm run test:firmware-static`
- `npm test`
- `idf.py build`

Board verification:

1. Flash the firmware.
2. Confirm the boot screen is the app list, not an automatically launched app.
3. Tap `smoke_visual_remote`; confirm the app starts.
4. Reboot, tap `smoke_network`; confirm the app starts.
5. If touch is reliable enough during the same session, tap a different app from the launcher path and confirm stop/switch logs match the remote lifecycle.
