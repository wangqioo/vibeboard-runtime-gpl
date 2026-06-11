# LCKFB ESP32-S3 Device Bring-Up

## Target Board

Current user device description:

```text
立创 ESP32S3 开发板
```

Local source snapshot provided by the user:

```text
/Users/wq/Downloads/szpi-s3-esp
```

Source map:

```text
docs/lckfb-szpi-s3-source-map.md
```

There are at least two relevant LCKFB documentation tracks:

- `立创·实战派ESP32-S3开发板`
  - Docs: https://wiki.lckfb.com/zh-hans/szpi-esp32s3/
  - Download center: https://wiki.lckfb.com/zh-hans/szpi-esp32s3/download-center.html
  - Open hardware: https://wiki.lckfb.com/zh-hans/szpi-esp32s3/open-source-hardware/
  - Open software: https://wiki.lckfb.com/zh-hans/szpi-esp32s3/open-source-software/
- `立创·ESP32S3R8N8开发板`
  - Docs: https://wiki.lckfb.com/zh-hans/esp32s3r8n8/
  - Download center: https://wiki.lckfb.com/zh-hans/esp32s3r8n8/download-center.html
  - Open source materials: https://wiki.lckfb.com/zh-hans/esp32s3r8n8/open-source/

The `实战派ESP32-S3` track is the better first assumption for VibeBoard Runtime work if the physical board has an integrated 2.0-inch display, touch panel, TF card slot, speaker/microphones, and enclosure-like product shape.

The `ESP32S3R8N8` track is the fallback if the board is a more general ESP32-S3 development board without the integrated display/audio product shell.

## Why This Board Is Useful

The `实战派ESP32-S3` documentation describes hardware that aligns with the VibeBoard Runtime direction:

- ESP32-S3-WROOM-1-N16R8 module, 16 MB flash and 8 MB PSRAM.
- ST7789 2.0-inch IPS display, 320 x 240, SPI.
- FT6336 capacitive touch, I2C.
- TF card interface using 1-bit SD mode.
- Wi-Fi and Bluetooth.
- Audio input/output path using ES7210, ES8311, amplifier, microphones, and speaker.
- Official examples for SD card, LCD, LVGL, WiFi, MP3, voice, and handheld-game style demos.

This means the next practical work can be board-first:

```text
prove SD card
  -> prove LCD
  -> prove LVGL + touch
  -> prove WiFi
  -> then decide whether to port Lua/LVGL runtime
```

## Phase 2B Goal

Prove that this physical board can be the first VibeBoard Runtime target.

Done means we have a written record of:

- exact board variant;
- serial port identity;
- flash/PSRAM size;
- SD card mount result;
- LCD result;
- LVGL result;
- whether `dist/apps/weather/` can become a realistic deployable app path once the runtime exists.

## Bring-Up Checklist

### 1. Identify Board Variant

Record:

```text
Board name:
Board photo/marking:
Module marking:
Flash:
PSRAM:
Has integrated screen:
Has TF card slot:
Has speaker/mic:
USB serial chip:
```

Expected first guess:

```text
Board name: 立创·实战派ESP32-S3开发板
Module: ESP32-S3-WROOM-1-N16R8
Display: ST7789, 2.0 inch, 320 x 240, SPI
Touch: FT6336, I2C
Storage: TF card, 1-bit SD mode
```

Do not hard-code these values into runtime code until verified against the exact board or official source files.

### 2. Prepare Local ESP-IDF Check

Commands to run once the board is connected:

```bash
ls /dev/cu.*
idf.py --version
esptool.py chip_id
esptool.py flash_id
```

If `esptool.py` is not on PATH, use the ESP-IDF Python environment already configured on the machine.

### 3. Run Official SD Example First

Use the LCKFB official SD card example before touching VibeBoard runtime code.

Expected evidence:

```text
Initializing SD card
Using SDMMC peripheral
Mounting filesystem
Filesystem mounted
SSR: bus_width=1
```

Important safety rule:

```text
Do not enable "format if mount failed" while testing a card with valuable data.
```

Reason: the official docs note ESP-IDF supports FAT32 for this path and warn that a failed mount plus auto-format can erase card contents.

### 4. Run Official LCD Example

Use the LCKFB LCD display example.

Expected evidence:

```text
LCD backlight turns on
screen displays expected color/image
serial log shows LCD initialization
```

Board facts to extract from the official code:

```text
LCD controller:
LCD SPI host:
LCD MOSI/SCLK/CS/DC/RST/BK GPIOs:
LCD width/height:
rotation/mirror settings:
```

### 5. Run Official LVGL Example

Use the LCKFB LVGL example as the display/touch baseline.

Expected evidence:

```text
LVGL demo renders
touch input works
FPS/benchmark or widget demo is visible
```

Board facts to extract from the official code:

```text
LVGL version:
esp_lvgl_port version:
touch component:
I2C pins:
display buffer height:
PSRAM usage:
```

### 6. Decide Runtime Baseline

After SD + LCD + LVGL are proven, choose one path:

1. **Use LCKFB official examples as BSP seed**

   Start a VibeBoard ESP-IDF runtime from the official `08-lcd_lvgl` style example, then add Lua VM and app scanning.

2. **Use upstream Clocteck/Cubic Lua runtime as Lua seed**

   Port board display/SD/touch/audio configuration from LCKFB examples into the existing Lua/LVGL runtime direction.

Recommended first path:

```text
LCKFB BSP seed first
```

Reason: this board's screen, touch, SD, and audio pins must be correct before Lua app loading matters.

## Weather App Deployment Target

Once a runtime exists on this board, the package output should map like this:

```text
dist/apps/weather/* -> /sd/apps/weather/
```

Runtime launcher expectation:

```text
/sd/apps/weather/app.info
/sd/apps/weather/main.lua
/sd/apps/weather/assets/...
```

This cannot be verified until the board has a runtime that scans `/sd/apps`.

## Open Questions

- Whether the board already has an official firmware installed.
- Whether the SD card is FAT32 and safe to use for testing.
- Whether the flashed `08-lcd_lvgl` demo displays and accepts touch input on the physical screen.

## Live Bring-Up Evidence

### Serial and Chip Identity

Date: 2026-06-12

```text
Serial port: /dev/cu.usbmodem11301
Chip: ESP32-S3 QFN56 revision v0.2
Features: WiFi, BLE, Embedded PSRAM 8MB
Crystal: 40 MHz
MAC: 10:51:db:80:e2:e8
Flash: 16 MB
Flash manufacturer: 0x46
Flash device: 0x4018
Flash mode in eFuse: quad
Flash voltage: 3.3 V
```

### Local Build Evidence

Date: 2026-06-12

Project:

```text
/Users/wq/Downloads/szpi-s3-esp/08-lcd_lvgl
```

Command used:

```bash
export IDF_PATH=/Users/wq/esp-idf
export IDF_PYTHON_ENV_PATH=/Users/wq/.espressif/python_env/idf5.5_py3.13_env
export PATH=/Users/wq/.espressif/python_env/idf5.5_py3.13_env/bin:/Users/wq/.espressif/tools/xtensa-esp-elf/esp-14.2.0_20260121/xtensa-esp-elf/bin:$PATH
python /Users/wq/esp-idf/tools/idf.py build
```

Result:

```text
Project build complete.
Generated build/bootloader/bootloader.bin
Generated build/partition_table/partition-table.bin
Generated build/lvgl.bin
lvgl.bin binary size: 0x8c3e0
Smallest app partition: 0x100000
Free app partition space: 0x73c20
```

Observed environment issue:

```text
source /Users/wq/esp-idf/export.sh did not add xtensa-esp32s3-elf-gcc to PATH in this shell.
Build succeeded after explicitly adding /Users/wq/.espressif/tools/xtensa-esp-elf/esp-14.2.0_20260121/xtensa-esp-elf/bin.
```

## Current Status

Status as of 2026-06-12:

```text
Official documentation found.
Docs URLs returned HTTP 200 during planning.
Local /Users/wq/Downloads/szpi-s3-esp source tree inspected.
Source tree matches the 立创·实战派ESP32-S3 example set.
Board identified over serial as ESP32-S3 with 8 MB PSRAM and 16 MB flash.
Official 08-lcd_lvgl example built successfully.
No firmware has been flashed in this repo for this board yet.
No SD/LCD/LVGL serial logs have been collected yet.
```
