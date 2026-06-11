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

### Flash Evidence

Date: 2026-06-12

Project:

```text
/Users/wq/Downloads/szpi-s3-esp/08-lcd_lvgl
```

First `idf.py flash` attempts failed because the board reset caused the serial port to alternate between:

```text
/dev/cu.usbmodem11301
/dev/cu.usbmodem1101
```

Direct esptool flashing on the stable current port succeeded:

```bash
python -m esptool --chip esp32s3 -p /dev/cu.usbmodem11301 -b 460800 --before default_reset --after hard_reset write_flash @flash_args
```

Result:

```text
Wrote 20832 bytes at 0x00000000.
Wrote 574432 bytes at 0x00010000.
Wrote 3072 bytes at 0x00008000.
Hash of data verified for all images.
Hard resetting via RTS pin.
```

### Boot Log Evidence

Date: 2026-06-12

Captured with pyserial at 115200 baud.

Key boot lines:

```text
ESP-IDF v5.5.4-dirty 2nd stage bootloader
Boot SPI Speed : 80MHz
SPI Mode       : DIO
SPI Flash Size : 16MB
Loaded app from partition at offset 0x10000
Found 8MB PSRAM device
Speed: 80MHz
SPI SRAM memory test OK
Project name: lvgl
ESP-IDF: v5.5.4-dirty
LVGL: Starting LVGL task
esp32_s3_szp: Setting LCD backlight: 100%
main_task: Returned from app_main()
```

Serial boot result:

```text
Boot success.
PSRAM success.
LVGL task started.
LCD backlight command issued.
```

Physical screen result:

```text
Confirmed by user: screen shows animation.
Touch input not yet verified.
```

### VibeBoard Runtime Skeleton Evidence

Date: 2026-06-12

Project:

```text
/Users/wq/vibeboard-runtime-gpl/firmware/vibeboard_runtime
```

Committed source version:

```text
147fdfb feat: add LCKFB runtime firmware skeleton
```

Build command:

```bash
export IDF_PATH=/Users/wq/esp-idf
export IDF_PYTHON_ENV_PATH=/Users/wq/.espressif/python_env/idf5.5_py3.13_env
export PATH=/Users/wq/.espressif/python_env/idf5.5_py3.13_env/bin:/Users/wq/.espressif/tools/xtensa-esp-elf/esp-14.2.0_20260121/xtensa-esp-elf/bin:$PATH
python /Users/wq/esp-idf/tools/idf.py build
```

Build result:

```text
Project build complete.
Generated build/vibeboard_runtime.bin
vibeboard_runtime.bin binary size: 0x8a5c0
Smallest app partition: 0x100000
Free app partition space: 0x75a40
```

Flash command:

```bash
python -m esptool --chip esp32s3 -p /dev/cu.usbmodem11301 -b 460800 --before default_reset --after hard_reset write_flash @flash_args
```

Flash result:

```text
Wrote 20832 bytes at 0x00000000.
Wrote 566720 bytes at 0x00010000.
Wrote 3072 bytes at 0x00008000.
Hash of data verified for all images.
Hard resetting via RTS pin.
```

Key boot lines:

```text
Project name:     vibeboard_runtime
App version:      147fdfb
Found 8MB PSRAM device
VibeBoard Runtime start
VibeBoard Runtime board start
LVGL: Starting LVGL task
SD mount failed: ESP_ERR_TIMEOUT
app scan unavailable: ESP_ERR_TIMEOUT
VibeBoard Runtime ready: sd=missing apps=0
```

Runtime result:

```text
Boot success.
PSRAM success.
LVGL task started.
Runtime UI path reached.
SD card mount did not succeed in this run: ESP_ERR_TIMEOUT.
App scan did not run because SD was unavailable.
```

### FAT32 SD App Scan Evidence

Date: 2026-06-12

SD card preparation on macOS:

```text
Original card format observed: ExFAT
Formatted target: FAT32
Formatted volume name: VIBESD
Copied package: /Users/wq/vibeboard-runtime-gpl/dist/apps/weather
Device path on SD: /apps/weather
Required metadata: /apps/weather/app.info
```

Key boot lines after inserting the FAT32 card into the board:

```text
Name: SD64G
Type: SDHC
Speed: 20.00 MHz (limit: 20.00 MHz)
Size: 60906MB
CSD: ver=2, sector_size=512, capacity=124735488 read_bl_len=9
SSR: bus_width=1
app_registry: found 1 apps
VibeBoard Runtime ready: sd=ok apps=1
```

Runtime result:

```text
FAT32 SD mount succeeded.
The runtime scanned /sdcard/apps.
The weather package at /apps/weather was counted as one app.
Lua execution is not implemented yet; this only proves file-level app discovery.
```

### Lua Smoke Runner Evidence

Date: 2026-06-12

Source commit:

```text
ee1ec34 feat: run smoke Lua app from SD
```

Important runtime finding:

```text
Running Lua directly on the ESP-IDF main task stack caused weather/main.lua to trigger a stack overflow.
The runner was changed to execute Lua in a dedicated 32 KB FreeRTOS task.
After that change, weather no longer rebooted the board; it printed "[weather.lua] ui api missing" and returned.
```

SD card preparation:

```text
Copied package: /Users/wq/vibeboard-runtime-gpl/dist/apps/smoke
Device path on SD: /apps/smoke
Temporarily disabled weather by renaming /apps/weather to /apps/weather.disabled and app.info to app.info.disabled.
```

Key boot lines:

```text
Project name:     vibeboard_runtime
App version:      ee1ec34
Name: SD64G
Type: SDHC
SSR: bus_width=1
app_registry: found 1 apps
Lua app start: smoke
hello from vibeboard lua
Lua app ok
VibeBoard Runtime ready: sd=ok apps=1 lua=ok
```

Runtime result:

```text
FAT32 SD mount succeeded.
The runtime scanned /sdcard/apps.
The smoke package was discovered.
The runtime executed /sdcard/apps/smoke/main.lua.
Lua print() output reached ESP-IDF serial logs.
```

### LVGL Lua Smoke UI Evidence

Date: 2026-06-12

Source commit:

```text
66b71a3 feat: add minimal LVGL Lua bindings
```

Implemented Lua API surface:

```text
lv_scr_act()
lv_obj_clean(obj)
lv_label_create(parent)
lv_label_set_text(label, text)
lv_obj_align(obj, align, x, y)
LV_ALIGN_CENTER
```

SD card preparation:

```text
Copied package: /Users/wq/vibeboard-runtime-gpl/dist/apps/smoke_ui
Device path on SD: /apps/smoke_ui
Only enabled app.info left on SD: /apps/smoke_ui/app.info
Disabled old smoke package by renaming /apps/smoke/app.info to /apps/smoke/app.info.disabled.
```

Build and flash result:

```text
idf.py build completed.
vibeboard_runtime.bin binary size 0xb0180 bytes.
Flashed bootloader, partition table, and vibeboard_runtime.bin to /dev/cu.usbmodem11301.
Flash hash verification passed.
```

Key boot lines:

```text
Project name:     vibeboard_runtime
App version:      41c685b-dirty
Name: SD64G
Type: SDHC
SSR: bus_width=1
app_registry: found 1 apps
Lua app start: smoke_ui
lvgl smoke ok
Lua app ok
VibeBoard Runtime ready: sd=ok apps=1 lua=ok
```

Runtime result:

```text
FAT32 SD mount succeeded.
The runtime scanned /sdcard/apps.
The smoke_ui package was discovered as the only enabled app.
The runtime executed /sdcard/apps/smoke_ui/main.lua.
Lua called the firmware LVGL bridge without crashing.
The app cleared the screen, created a label, set text to "Hello LVGL Lua", and centered it.
```

### Weather Card LVGL Lua Evidence

Date: 2026-06-12

Source commit:

```text
ea1c44c feat: add weather card LVGL Lua demo
```

Implemented additional Lua API surface:

```text
lv_obj_create(parent)
lv_obj_set_size(obj, width, height)
lv_obj_set_width(obj, width)
lv_obj_set_height(obj, height)
lv_obj_set_style_bg_color(obj, hex_color)
lv_obj_set_style_text_color(obj, hex_color)
lv_obj_set_style_radius(obj, radius)
lv_obj_set_style_pad_all(obj, pad)
lv_obj_set_style_border_width(obj, width)
lv_obj_set_style_border_color(obj, hex_color)
LV_ALIGN_TOP_LEFT
LV_ALIGN_TOP_MID
LV_ALIGN_BOTTOM_LEFT
```

SD card preparation:

```text
Copied package: /Users/wq/vibeboard-runtime-gpl/dist/apps/smoke_ui
Device path on SD: /apps/smoke_ui
Only enabled app.info left on SD: /apps/smoke_ui/app.info
Confirmed SD app script contains VibeBoard Weather, Shenzhen, 26C, Cloudy, Humidity 68%, and Wind 12 km/h.
```

Build and flash result:

```text
npm test passed.
idf.py build completed.
vibeboard_runtime.bin binary size 0xb0720 bytes.
Flashed bootloader, partition table, and vibeboard_runtime.bin to /dev/cu.usbmodem11301.
Flash hash verification passed.
```

Key boot lines:

```text
Project name:     vibeboard_runtime
App version:      b411307-dirty
Name: SD64G
Type: SDHC
SSR: bus_width=1
app_registry: found 1 apps
Lua app start: smoke_ui
weather card ok
Lua app ok
VibeBoard Runtime ready: sd=ok apps=1 lua=ok
```

Runtime result:

```text
FAT32 SD mount succeeded.
The runtime scanned /sdcard/apps.
The weather-card smoke_ui package was discovered as the only enabled app.
The runtime executed /sdcard/apps/smoke_ui/main.lua.
Lua created a card container, styled background/text/border/radius, positioned multiple labels, and returned successfully.
This proves a static card-style UI can now be changed from SD Lua without reflashing firmware, as long as it stays within the exposed LVGL API surface.
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
Official 08-lcd_lvgl example flashed successfully.
Serial boot log confirms PSRAM, LVGL task, and LCD backlight command.
Physical screen animation confirmed by user.
VibeBoard Runtime skeleton builds successfully.
VibeBoard Runtime skeleton flashed successfully.
Serial boot log confirms the committed runtime version 147fdfb starts and reaches Runtime ready.
Runtime currently tolerates missing SD card and reports sd=missing apps=0.
FAT32 SD card mount verified.
Weather app package discovery verified: app_registry found 1 app and runtime reports sd=ok apps=1.
Lua smoke app execution verified from SD card.
Lua print() bridge verified in serial logs.
Minimal LVGL Lua binding implemented and verified with smoke_ui from SD card.
smoke_ui serial logs verified: Lua app start, lvgl smoke ok, Lua app ok.
Weather-card LVGL Lua demo implemented and verified from SD card.
Expanded LVGL Lua API now covers containers, size, background/text colors, border, radius, padding, and top/bottom alignment constants.
Touch input still needs verification.
Fonts, images, timers, events, networking, real weather data, and touch interaction still need implementation.
```
