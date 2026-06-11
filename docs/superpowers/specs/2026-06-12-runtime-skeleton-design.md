# VibeBoard Runtime Skeleton Design

## Goal

Create the first VibeBoard-owned ESP-IDF firmware skeleton for the LCKFB `立创·实战派ESP32-S3` board.

This firmware proves:

- the VibeBoard repo can build its own ESP32-S3 image;
- the board-specific LCD/LVGL path works outside the LCKFB demo project;
- SD card mounting can be attempted safely;
- `/sdcard/apps` can be scanned for app directories;
- app metadata can be summarized on screen.

## Non-Goals

- No Lua VM yet.
- No LVGL Lua binding yet.
- No app execution yet.
- No WiFi upload endpoint yet.
- No audio, camera, BLE, or native module loading yet.
- No direct import of the full LCKFB source tree.

## Source Boundary

The local LCKFB snapshot is:

```text
/Users/wq/Downloads/szpi-s3-esp
```

It has no top-level license file in the inspected snapshot. For this skeleton, use it as a hardware reference and implement a clean, minimal BSP in this repo using ESP-IDF public APIs and the documented constants in `docs/lckfb-szpi-s3-source-map.md`.

## Firmware Location

Create:

```text
firmware/vibeboard_runtime/
```

This is separate from file-level app tooling under `tools/`.

## Components

### Board BSP

Files:

```text
firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.h
firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.c
```

Responsibilities:

- initialize I2C;
- initialize PCA9557 for LCD CS;
- initialize ST7789 LCD and backlight;
- initialize LVGL through `esp_lvgl_port`;
- initialize FT5x06-compatible touch;
- mount SD card at `/sdcard` with `format_if_mount_failed = false`.

### App Registry

Files:

```text
firmware/vibeboard_runtime/main/app_registry.h
firmware/vibeboard_runtime/main/app_registry.c
```

Responsibilities:

- scan `/sdcard/apps`;
- count directories that contain `app.info`;
- parse only `name`, `entry`, and `description`;
- return summary counts and first app name;
- never execute Lua.

### Main UI

File:

```text
firmware/vibeboard_runtime/main/main.c
```

Responsibilities:

- show `VibeBoard Runtime` boot screen;
- show serial, LCD, SD, and app-scan status;
- keep LVGL running after `app_main` finishes setup.

## Display Text

The first screen should be simple and diagnostic:

```text
VibeBoard Runtime
Board: LCKFB SZPI ESP32-S3
LCD: OK
SD: OK or missing
Apps: <count>
First: <name or -> 
```

## SD Path

Use:

```text
/sdcard/apps
```

Reason: LCKFB's SD example mounts at `/sdcard`. Existing app packaging docs can later map `dist/apps/<app-id>` to `/sdcard/apps/<app-id>` for this board runtime.

## Verification

Local checks:

- static tests confirm required files and constants exist;
- `idf.py build` succeeds.

Device checks:

- flash succeeds;
- serial boot log contains `VibeBoard Runtime start`;
- serial boot log reports LCD init;
- serial boot log reports SD mount success or a clear SD error;
- screen shows the diagnostic UI.

## Open Items After This Phase

- Decide whether to keep `/sdcard/apps` globally or support `/sd/apps` as an alias.
- Add a sample SD card app copy workflow.
- Add Lua VM and a minimal Lua execution path.
- Add touch verification UI.
