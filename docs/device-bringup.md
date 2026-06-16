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

### Backlight Inversion Fix Evidence

Date: 2026-06-12

Symptom:

```text
Serial logs showed SD mount, app scan, Lua app start, weather card ok, and Lua app ok.
The physical display still appeared unlit.
```

Root cause:

```text
The official 08-lcd_lvgl example configures the GPIO42 LEDC backlight channel with .flags.output_invert = true.
The runtime initially omitted that flag and set duty=1023, which keeps the inverted backlight output off.
```

Fix:

```text
Added .flags.output_invert = true to the backlight LEDC channel.
Moved the 100% backlight duty call into a separate backlight_on() step after LVGL display init.
Added a serial log: Setting LCD backlight: 100%.
Added a static guard so the inverted backlight setting is not accidentally removed.
```

Verification:

```text
npm run test:firmware-static passed.
idf.py build completed.
Flashed the fixed firmware to /dev/cu.usbmodem11301.
Serial log confirmed: board_lckfb: Setting LCD backlight: 100%.
Serial log still confirmed: Lua app start: smoke_ui, weather card ok, Lua app ok.
User confirmed the screen displayed after the fix.
```

### Lua Interval Shanghai Weather Card Evidence

Date: 2026-06-12

Source commit:

```text
3ba369a feat: add Lua interval weather card
```

Implemented runtime API:

```text
set_interval(ms, callback)
```

SD card preparation:

```text
Copied package: /Users/wq/vibeboard-runtime-gpl/dist/apps/smoke_ui
Device path on SD: /apps/smoke_ui
Only enabled app.info left on SD: /apps/smoke_ui/app.info
Confirmed SD app script contains Shanghai, Updated 00s, set_interval(1000, ...), and weather card dynamic ok.
```

Build and flash result:

```text
npm test passed.
idf.py build completed.
vibeboard_runtime.bin binary size 0xb0b50 bytes.
Flashed bootloader, partition table, and vibeboard_runtime.bin to /dev/cu.usbmodem11301 before the final SD write.
Flash hash verification passed.
```

Key boot lines:

```text
Project name:     vibeboard_runtime
App version:      19b1861-dirty
Name: SD64G
Type: SDHC
SSR: bus_width=1
app_registry: found 1 apps
Lua app start: smoke_ui
weather card dynamic ok
Lua interval loop start: 1 timers
weather card tick 1
weather card tick 2
weather card tick 3
Lua interval loop done
Lua app ok
VibeBoard Runtime ready: sd=ok apps=1 lua=ok
```

Runtime result:

```text
FAT32 SD mount succeeded.
The runtime executed the updated /sdcard/apps/smoke_ui/main.lua from SD.
The card now shows Shanghai instead of Shenzhen.
The Lua task remained alive long enough to call the interval callback repeatedly.
The interval callback updated the "Updated 00s" label once per second and printed the first three ticks to serial.
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
Backlight inversion matched to the official 08-lcd_lvgl example and verified on the physical display.
Lua interval callback runtime implemented and verified with the Shanghai dynamic weather card.
NodeMCU-style `tmr` core implemented and verified on hardware with `apps/smoke_timer`.
Sandboxed Lua `file` module implemented and verified on hardware with `apps/smoke_file`.
LVGL asset path, `S:` filesystem, image object, positioning, flag, and label long-mode bindings verified on hardware with `apps/smoke_assets`.
Touch input still needs verification.
Fonts, images, events, networking, real weather data, touch interaction, and full App lifecycle still need implementation.
```

### NodeMCU-style tmr Firmware Smoke Evidence

Date: 2026-06-12

Build, flash, and first firmware smoke result:

```text
npm test passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0xb1130 bytes.
Flashed bootloader, partition table, and vibeboard_runtime.bin to /dev/cu.usbmodem11301.
Flash hash verification passed for all written regions.
```

Key boot lines:

```text
Project name:     vibeboard_runtime
App version:      71bac0e-dirty
Compile time:     Jun 12 2026 03:30:17
Name: SD64G
Type: SDHC
SSR: bus_width=1
app_registry: found 1 apps
Lua app start: smoke_ui
weather card dynamic ok
lua_tmr: Lua tmr loop start
weather card tick 1
weather card tick 2
weather card tick 3
```

Runtime result:

```text
The new firmware boots on the board.
The SD card mounts.
The existing SD /apps/smoke_ui package still runs.
The existing SD app still uses set_interval, but set_interval is now implemented through the new tmr module.
The log line "lua_tmr: Lua tmr loop start" confirms the new timer loop is active on hardware.
The first three weather-card timer callbacks fired on hardware.
```

Dedicated `apps/smoke_timer` SD smoke result:

```text
Name: SD64G
Type: SDHC
SSR: bus_width=1
app_registry: found 1 apps
Lua app start: smoke_timer
smoke timer start
lua_tmr: Lua tmr loop start
smoke timer tick 1
smoke timer tick 2
smoke timer single 2 2730000
smoke timer tick 3
smoke timer tick 4
smoke timer tick 5
smoke timer state true 2
lua_tmr: Lua tmr loop idle
Lua app ok
VibeBoard Runtime ready: sd=ok apps=1 lua=ok
main_task: Returned from app_main()
```

Result:

```text
SD card package discovery still works.
tmr.create(), timer:alarm(), ALARM_AUTO, ALARM_SINGLE, timer:state(), timer:unregister(), and tmr.now() ran on the board.
The timer loop exits when the last timer is unregistered.
The Lua runner returns `Lua app ok`.
```

### LVGL Asset Path and Image Binding Smoke Evidence

Date: 2026-06-13

Build and flash result:

```text
npm test passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0xb2510 bytes.
Flashed bootloader, partition table, and vibeboard_runtime.bin to /dev/cu.usbmodem111301.
Flash hash verification passed for all written regions.
```

Dedicated `apps/smoke_assets` SD smoke result:

```text
Name: SD64G
Type: SDHC
SSR: bus_width=1
app_registry: found 1 apps
Lua app start: smoke_assets
lua_file: file module app dir: /sdcard/apps/smoke_assets
smoke assets start
asset path S:/apps/smoke_assets/assets/icon.bin
asset fs ok S:/apps/smoke_assets/assets/icon.bin
smoke assets ok S:/apps/smoke_assets/assets/icon.bin
lua_tmr: Lua tmr loop start
lua_tmr: Lua tmr loop idle
Lua app ok
VibeBoard Runtime ready: sd=ok apps=1 lua=ok
main_task: Returned from app_main()
```

Result:

```text
Relative asset paths, /sd/... paths, and S:/... paths resolve to the same LVGL asset path.
LVGL S: filesystem driver opens the app-local asset from SD.
lv_img_create(), lv_img_set_src(), lv_obj_set_pos(), lv_obj_set_x(), lv_obj_set_y(), lv_obj_add_flag(), lv_obj_clear_flag(), and lv_label_set_long_mode() ran on the board.
The Lua runner returns `Lua app ok`.
Real image decoding remains pending because PNG/BMP/SJPG/LVGL-bin decoder work is separate from path and object binding.
```

### Sandboxed file Module Smoke Evidence

Date: 2026-06-12

Build and flash result:

```text
npm test passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0xb1b30 bytes.
Flashed bootloader, partition table, and vibeboard_runtime.bin to /dev/cu.usbmodem11301.
Flash hash verification passed for all written regions.
```

Dedicated `apps/smoke_file` SD smoke result:

```text
Name: SD64G
Type: SDHC
SSR: bus_width=1
app_registry: found 1 apps
Lua app start: smoke_file
lua_file: file module app dir: /sdcard/apps/smoke_file
smoke file start
smoke file config 46
smoke file ok 6
lua_tmr: Lua tmr loop start
lua_tmr: Lua tmr loop idle
Lua app ok
VibeBoard Runtime ready: sd=ok apps=1 lua=ok
main_task: Returned from app_main()
```

Result:

```text
SD card package discovery still works.
file.exists(), file.read(), file.open(), file handle read/close, file.list(), and file.write() ran on the board.
Relative paths resolve to the current app directory.
The Lua runner returns `Lua app ok`.
```
## 2026-06-13 smoke_visual BMP/widget smoke

Firmware flashed to `/dev/cu.usbmodem111301` and `apps/smoke_visual` was installed on `VIBESD`.

Flash evidence:

```text
vibeboard_runtime.bin binary size 0xb27c0 bytes. Smallest app partition is 0x100000 bytes. 0x4d840 bytes (30%) free.
Serial port /dev/cu.usbmodem111301
Chip is ESP32-S3 (QFN56) (revision v0.2)
Hash of data verified.
Hash of data verified.
Hash of data verified.
Done
```

Runtime evidence:

```text
Name: SD64G
Type: SDHC
SSR: bus_width=1
app_registry: found 1 apps
Lua app start: smoke_visual
lua_file: file module app dir: /sdcard/apps/smoke_visual
smoke visual start
smoke visual ok S:/apps/smoke_visual/assets/icon.bmp
lua_tmr: Lua tmr loop start
smoke visual progress 23
smoke visual progress 34
smoke visual progress 45
smoke visual progress 56
smoke visual progress 67
smoke visual progress 78
smoke visual progress 89
smoke visual progress 100
smoke visual progress 0
```

Result: SD app discovery, Lua execution, BMP asset path resolution, button/bar binding use, and timer-driven bar updates are board-verified by serial evidence. Visual correctness of the BMP image still needs human screen confirmation.

## 2026-06-13 network-runtime flash-back verification

Context: the connected board was temporarily running another ESP32-S3 project. It was erased and flashed back to `vibeboard_runtime` before collecting runtime evidence.

Local verification before flashing:

```text
npm test passed.
npm run validate:apps passed.
npm run package:app -- apps/smoke_network passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0x16bb40 bytes.
Smallest app partition is 0x400000 bytes. 0x2944c0 bytes (64%) free.
```

Flash-back evidence:

```text
Chip erase completed successfully.
Wrote bootloader/bootloader.bin at 0x0. Hash of data verified.
Wrote build/partition_table/partition-table.bin at 0x8000. Hash of data verified.
Wrote build/vibeboard_runtime.bin at 0x10000. Hash of data verified.
```

Readback evidence:

```text
Readback partition table:
0 nvs      offset 0x9000  size 0x6000
1 phy_init offset 0xf000  size 0x1000
2 factory  offset 0x10000 size 0x400000

Readback app header contains:
vibeboard_runtime
```

Runtime evidence after reset:

```text
Project name:     vibeboard_runtime
Partition Table:
  0 nvs              WiFi data        01 02 00009000 00006000
  1 phy_init         RF data          01 01 0000f000 00001000
  2 factory          factory app      00 00 00010000 00400000
Loaded app from partition at offset 0x10000
VibeBoard Runtime start
VibeBoard Runtime board start
Setting LCD backlight: 100%
Name: SD64G
Type: SDHC
app_registry: found 1 apps
Lua app start: smoke_visual
lua_wifi: wifi module registered
smoke visual ok S:/apps/smoke_visual/assets/icon.bmp
lua_tmr: Lua tmr loop start
smoke visual progress 23
smoke visual progress 34
```

Result: the board is back on VibeBoard Runtime with the custom 4 MB app partition. The network-enabled firmware boots and still runs the existing `smoke_visual` SD app. `apps/smoke_network` is packaged but still needs SD deployment with a real `wifi.json` before WiFi/HTTP can be marked board-verified.

## 2026-06-13 smoke_network no-credentials crash fix

Initial `apps/smoke_network` SD smoke exposed a runtime bug:

```text
Lua app start: smoke_network
wifi.json missing; copy wifi.example.json to wifi.json and set credentials
json encode ok {"app":"smoke_network","city":"Shanghai"}
assert failed: tcpip_callback /IDF/components/lwip/lwip/src/api/tcpip.c:318 (Invalid mbox)
```

Root cause: `time.initntp()` called SNTP before lwIP/`esp_netif` initialization when no WiFi path had initialized networking yet.

Fix: `lua_time.c` now initializes `esp_netif` and the default event loop before `esp_sntp_init()`, accepting `ESP_ERR_INVALID_STATE` for already-initialized shared runtime state.

Verification:

```text
npm run test:firmware-static passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0x16bbe0 bytes.
Flash hash verification passed.

Lua app start: smoke_network
wifi.json missing; copy wifi.example.json to wifi.json and set credentials
json encode ok {"city":"Shanghai","app":"smoke_network"}
time now 23
smoke network ready without wifi credentials
smoke network ready
lua_tmr: Lua tmr loop start
lua_tmr: Lua tmr loop idle
Lua app ok
VibeBoard Runtime ready: sd=ok apps=1 lua=ok
```

Result: `apps/smoke_network` is board-verified for the no-credentials path: SD app discovery, `file.exists`, `sjson.encode`, `time.settimezone`, `time.initntp`, `time.get`, timer loop idle, and clean Lua exit. WiFi association and HTTP request still require a real `wifi.json`.

## 2026-06-13 smoke_network WiFi and HTTP smoke

SD config:

```json
{
  "ssid": "1-306",
  "password": "szyt1008",
  "url": "http://httpbin.org/get"
}
```

Intermediate finding: the first URL, `http://worldtimeapi.org/api/timezone/Asia/Shanghai`, returned an empty HTTP response from the Mac and produced `ESP_ERR_HTTP_FETCH_HEADER` on the board. The HTTP smoke URL was changed to `http://httpbin.org/get`.

Runtime fixes added during this smoke:

- `lua_wifi.c` logs `WIFI_EVENT_STA_DISCONNECTED` reason codes and `IP_EVENT_STA_GOT_IP`.
- `lua_wifi.c` reconnects from station start and disconnected events with a finite retry count.

Verification:

```text
npm run test:firmware-static passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0x16be00 bytes.
Flash hash verification passed.

Lua app start: smoke_network
json encode ok {"app":"smoke_network","city":"Shanghai"}
time now 580
wifi:mode : sta (10:51:db:80:e2:e8)
lua_wifi: sta disconnected reason=2
lua_wifi: sta reconnect attempt 1/8
lua_wifi: sta disconnected reason=205
lua_wifi: sta reconnect attempt 2/8
wifi:connected with 1-306, aid = 3, channel 7, BW20, bssid = 24:b8:da:f4:62:c0
lua_wifi: sta got ip 192.168.1.32
wifi poll 4 ip 192.168.1.32
http status 200
http body bytes 243
lua_tmr: Lua tmr loop idle
Lua app ok
VibeBoard Runtime ready: sd=ok apps=1 lua=ok
```

Result: `apps/smoke_network` is board-verified for WiFi association, DHCP IP acquisition, HTTP GET, response body capture, JSON encode, time/NTP initialization, timer loop exit, and clean Lua app completion.

## 2026-06-13 install service crash fix and first SD upload

Symptom:

```text
Screen flickered after flashing the first install-service firmware.
Serial showed a reboot loop:
assert failed: tcpip_send_msg_wait_sem ... (Invalid mbox)
```

Root cause: `install_service` called `httpd_start()` before lwIP/`esp_netif` and the default event loop were initialized. This matched the earlier `time.initntp()` `Invalid mbox` class of bug.

Fixes:

- `install_service.c` now calls `esp_netif_init()` and `esp_event_loop_create_default()` before `httpd_start()`, treating `ESP_ERR_INVALID_STATE` as already-initialized.
- `lua_wifi.c` sets `esp_wifi_set_ps(WIFI_PS_NONE)` after WiFi init so the board is more reliable as a LAN HTTP server.
- Static firmware guardrails now check both install-service netif initialization and WiFi power-save disable.
- `tools/app-uploader` now defaults to Node native HTTP instead of `fetch`, and prints lower-level connection errors.

Verification:

```text
npm run test:firmware-static passed.
npm run test:uploader passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0x171330 bytes.
Flash hash verification passed.

install_service: install service listening on port 8080
wifi:Set ps type: 0, coexist: 0
wifi:pm start, type: 0
lua_wifi: sta got ip 192.168.1.32
http status 200
Lua app ok
VibeBoard Runtime ready: sd=ok apps=1 lua=ok
```

Raw HTTP upload smoke from the Mac:

```text
POST /install?app=raw_upload&path=app.info HTTP/1.1
...
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 3

ok
```

Next boot evidence:

```text
app_registry: found 2 apps
install_service: install service listening on port 8080
VibeBoard Runtime ready: sd=ok apps=2 lua=ok
```

Result: the screen flicker/reboot loop is fixed. The first board-side HTTP install slice is board-verified for writing a file into `/sdcard/apps/<app>/`. The polished `npm run upload:app` path is still network-stability pending on this Mac/router path because Node/curl sometimes return `EHOSTUNREACH` to `192.168.1.32:8080`, even though `ping`, `nc`, and raw HTTP POST can reach the board.

## 2026-06-13 install service status, apps, and rescan endpoints

Added first management endpoints:

```text
GET  /status
GET  /apps
POST /rescan
```

Implementation notes:

- `app_registry` now stores up to `VB_APP_REGISTRY_MAX_APPS` entries while preserving `first_app_*` for the current runner.
- `main.c` stores the registry and install-service context in static storage so HTTP handlers do not keep pointers to expired `app_main()` stack variables.
- `/rescan` calls `vb_app_registry_scan()` against the live registry. It updates the registry but does not launch or switch apps yet.

Verification:

```text
npm test passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0x171780 bytes.
Flash hash verification passed.

app_registry: found 2 apps
install_service: install service listening on port 8080
lua_wifi: sta got ip 192.168.1.32
http status 200
VibeBoard Runtime ready: sd=ok apps=2 lua=ok
```

Raw HTTP endpoint checks:

```text
GET /status -> 200 OK
{"sd":true,"app_count":2,"first_app":"smoke_network","install":"ok"}

GET /apps -> 200 OK
{"apps":[{"id":"smoke_network","name":"smoke_network","entry":"main.lua"},{"id":"raw_upload","name":"smoke_visual","entry":"main.lua"}]}

POST /rescan -> 200 OK
{"ok":true,"app_count":2}
```

Result: the device can now report status, list installed SD apps, and rescan apps without reboot.

## 2026-06-13 uploader rescan and confirmation loop

The Mac-side uploader now:

```text
uploads every file through /install
  -> POST /rescan
  -> GET /apps
  -> fails if the target app id is missing
```

It still keeps the Node native HTTP implementation for tests and generic use, but the CLI uses an `nc` transport on this Mac because Node/curl can return `EHOSTUNREACH` while raw `nc` reaches the board reliably.

Verification:

```text
npm test passed.
npm run test:uploader passed.
npm run package:app -- apps/smoke_visual passed.

npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_visual_remote
uploaded smoke_visual_remote/app.info 144 bytes
uploaded smoke_visual_remote/assets/icon.bmp 30122 bytes
uploaded smoke_visual_remote/install-notes.txt 205 bytes
uploaded smoke_visual_remote/main.lua 1798 bytes
uploaded smoke_visual_remote/manifest.json 1105 bytes
uploaded 5 files
rescan ok; confirmed smoke_visual_remote in /apps
```

Independent `/apps` check:

```text
GET /apps -> 200 OK
{"apps":[{"id":"smoke_network","name":"smoke_network","entry":"main.lua"},{"id":"raw_upload","name":"smoke_visual","entry":"main.lua"},{"id":"smoke_visual_remote","name":"smoke_visual","entry":"main.lua"}]}
```

Result: the no-SD-pull app deployment loop is now board-verified through upload, rescan, and confirmation. The remaining work is app launch/switch support so newly uploaded apps can run without rebooting or manually changing the first app.

## 2026-06-13 remote launch endpoint

The board now exposes a first app launch slice:

```text
POST /launch?app=<id>
```

Implementation notes:

- `/launch` validates the `app` query, rescans `/sdcard/apps`, finds the requested app id in the live registry, then calls `vb_app_runner_launch_async()`.
- The async runner copies the registry entry into a heap-owned context before starting the Lua task, so HTTP request handling does not block while the app keeps running.
- A single-runner guard returns `ESP_ERR_INVALID_STATE` as `app already running` instead of starting multiple Lua/LVGL apps concurrently.
- `npm run launch:app -- http://<ip>:8080 <app-id>` wraps the same endpoint using the existing `nc` transport.

Verification:

```text
npm run test:uploader passed.
npm run test:firmware-static passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0x171b90 bytes.
idf.py -p /dev/cu.usbmodem112301 flash passed.
```

Boot evidence after flash:

```text
Name: SD64G
I app_registry: found 3 apps
I install_service: install service listening on port 8080
I lua_wifi: sta got ip 192.168.1.32
I vibeboard_runtime: VibeBoard Runtime ready: sd=ok apps=3 lua=ok
```

Raw HTTP launch:

```text
POST /launch?app=smoke_visual_remote -> 200 OK
{"ok":true,"launched":"smoke_visual_remote"}
```

Serial evidence:

```text
I app_registry: found 3 apps
I app_runner: Lua async launch: smoke_visual
I app_runner: Lua app start: smoke_visual
I lua_file: file module app dir: /sdcard/apps/smoke_visual_remote
I app_runner: smoke visual start
I app_runner: smoke visual ok S:/apps/smoke_visual_remote/assets/icon.bmp
I lua_tmr: Lua tmr loop start
I app_runner: smoke visual progress 23
I app_runner: smoke visual progress 34
```

CLI launch guard check while the visual app was already running:

```text
npm run launch:app -- http://192.168.1.32:8080 smoke_visual_remote
Launch smoke_visual_remote failed after 3 attempts: 500 app already running
```

Result: the no-SD-pull loop is now board-verified through package upload, rescan, confirmation, and direct remote launch. The remaining launcher work is product UX: list/select/switch apps from the device screen and define a controlled stop/restart model for long-running Lua apps.

## 2026-06-13 controlled stop and switch build check

Added the first controlled app lifecycle slice:

```text
POST /stop
POST /launch?app=<id> while another app is running
```

Implementation notes:

- `app_runner` now tracks a runner state instead of only a boolean `s_async_running`.
- The runner records the current app id/name and exposes `vb_app_runner_stop()`, `vb_app_runner_wait_stopped()`, `vb_app_runner_is_running()`, and `vb_app_runner_current_id()`.
- `lua_tmr` accepts a stop flag through `vb_lua_tmr_set_stop_flag()` and exits the timer loop with a `stopped` message when stop is requested.
- `/status` now includes `running` and `current_app`.
- `/stop` requests stop and waits up to 1500 ms.
- `/launch` keeps returning `app already running` for the same app, but for a different app it requests stop, waits, then launches the new app.

Verification completed in this slice:

```text
npm run test:firmware-static passed.
npm test passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0x171f60 bytes.
```

Initial board verification status:

```text
No /dev/cu.usbmodem* device was present.
Observed ports:
/dev/cu.Bluetooth-Incoming-Port
/dev/cu.debug-console
```

Next board check when the device is connected:

```text
idf.py -p /dev/cu.usbmodem... flash
POST /launch?app=smoke_visual_remote -> expect visual app starts
POST /launch?app=smoke_network -> expect visual app stops, network app starts
POST /stop -> expect current app stops and /status reports running=false
```

Result: controlled stop/switch is build-verified and ready for the next connected-board smoke.

## 2026-06-13 controlled stop and switch board verification

The LCKFB board was reconnected on:

```text
/dev/cu.usbmodem112301
```

Flash verification:

```text
idf.py -p /dev/cu.usbmodem112301 flash passed.
vibeboard_runtime.bin binary size 0x171f60 bytes.
Hard resetting via RTS pin... Done.
```

Boot evidence:

```text
I app_init: App version: 1d281ef-dirty
I app_init: Compile time: Jun 13 2026 13:14:48
Name: SD64G
I app_registry: found 3 apps
I install_service: install service listening on port 8080
I lua_wifi: sta got ip 192.168.1.32
I vibeboard_runtime: VibeBoard Runtime ready: sd=ok apps=3 lua=ok
```

Launch visual app:

```text
POST /launch?app=smoke_visual_remote -> 200 OK
{"ok":true,"launched":"smoke_visual_remote"}

I app_runner: Lua async launch: smoke_visual
I app_runner: Lua app start: smoke_visual
I lua_file: file module app dir: /sdcard/apps/smoke_visual_remote
I app_runner: smoke visual ok S:/apps/smoke_visual_remote/assets/icon.bmp
I lua_tmr: Lua tmr loop start
I app_runner: smoke visual progress 23
```

Switch to network app while the visual app is still running:

```text
POST /launch?app=smoke_network -> 200 OK
{"ok":true,"launched":"smoke_network"}

I install_service: switch app smoke_visual_remote -> smoke_network
I app_runner: Lua stop requested: smoke_visual
I lua_tmr: Lua tmr loop stop requested
I app_runner: Lua async finished: smoke_visual status=ESP_ERR_INVALID_STATE message=stopped
I app_runner: Lua async launch: smoke_network
I app_runner: Lua app start: smoke_network
I app_runner: smoke network start
I app_runner: http status 200
I app_runner: Lua app ok
I app_runner: Lua async finished: smoke_network status=ESP_OK message=ok
```

Status and idle stop checks:

```text
GET /status -> 200 OK
{"sd":true,"app_count":3,"first_app":"smoke_network","install":"ok","running":false,"current_app":""}

POST /stop -> 200 OK
{"ok":true,"stopped":false}
```

Result: controlled stop and remote app switch are now board-verified. The next product slice can build a screen Launcher on top of the same stop/switch path.

## 2026-06-13 device launcher UI build check

Added a native LVGL launcher screen:

```text
VibeBoard Apps
tap app -> vb_app_runner_launch_async()
```

Implementation notes:

- `launcher_ui` renders the native app list from `vb_app_registry_result_t`.
- `app_main()` now starts board hardware, scans SD apps, starts the install service, then shows the launcher.
- Boot no longer auto-runs the first app.
- Tapping an app uses the same runner lifecycle as remote `/launch`, including stop/wait before switching apps.

Verification:

```text
npm run test:firmware-static passed.
npm test passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0x171f40 bytes.
```

Result: device launcher UI is build-verified. Board verification still needs flashing and touch testing on the physical screen.

## 2026-06-13 device launcher UI board verification

The first `idf.py flash` run reported success, but serial boot logs showed the board was still running the older `esp32s3_device` OTA partition layout from `0x20000`. The flash contents were verified by reading back `0x8000`:

```text
ota_0,app,ota_0,0x20000,4032K,
ota_1,app,ota_1,0x410000,4032K,
assets,data,spiffs,0x800000,8M,
```

The runtime image was then written directly with `esptool write_flash`, and the partition table was read back again:

```text
nvs,data,nvs,0x9000,24K,
phy_init,data,phy,0xf000,4K,
factory,app,factory,0x10000,4M,
```

Boot evidence:

```text
I boot:  2 factory          factory app      00 00 00010000 00400000
I boot: Loaded app from partition at offset 0x10000
I app_init: Project name:     vibeboard_runtime
I app_init: App version:      1d2d794
I vibeboard_runtime: VibeBoard Runtime start
Name: SD64G
W app_registry: skip app entry that is missing: raw_upload/main.lua
I app_registry: found 2 apps
I install_service: install service listening on port 8080
I vibeboard_runtime: VibeBoard Runtime ready: sd=ok apps=2 launcher=ok
```

This confirms boot now stops at the native launcher list instead of auto-running the first Lua app. There is no `Lua app start` during the boot-ready sequence.

Touch check:

```text
FT5x06 regs=ESP_OK points=0x00 fw=0x01 state=0x00 err=0x0f
```

The touch controller answers on I2C. The launcher touch tap path was later confirmed on the physical device screen: tapping a list item starts the selected app. BOOT remains a hardware fallback for selection and launch.

BOOT fallback verification:

```text
I launcher_ui: launcher BOOT short press: next
I launcher_ui: launcher selected index: 1
I launcher_ui: launcher BOOT short press: next
I launcher_ui: launcher selected index: 0
```

The physical BOOT key short press was also confirmed by hand on the device screen: it changes the selected launcher item. Long-press launch was observed through the app runner after selection:

```text
I launcher_ui: launcher BOOT long press: launch
I launcher_ui: launcher selected app: smoke_network
I app_runner: Lua app start: smoke_network
I app_runner: Lua async launch: smoke_network
I app_runner: smoke network start
I lua_wifi: sta got ip 192.168.1.32
I app_runner: Lua app ok
I app_runner: Lua async finished: smoke_network status=ESP_OK message=ok
```

Result: device launcher is board-verified for boot-to-list, missing-entry filtering, touch tap-to-launch, BOOT short-select, and BOOT long-launch.

## 2026-06-13 launcher BOOT-after-launch crash fix

While preparing the Phase 5B lifecycle-state board check, a launcher/runtime interaction bug was reproduced on the board:

```text
I launcher_ui: launcher selected app: smoke_visual_remote
I app_runner: Lua app start: smoke_visual
I app_runner: smoke visual ok S:/apps/smoke_visual_remote/assets/icon.bmp
I launcher_ui: launcher BOOT short press: next
CORRUPT HEAP: multi_heap.c:123 detected at 0x3fcafacc

Backtrace:
lv_mem_realloc
get_local_style
lv_obj_set_style_border_width
update_selection_unlocked at launcher_ui.c:142
select_next_from_task at launcher_ui.c:163
boot_key_task at launcher_ui.c:202
```

Root cause:

- The BOOT key task remains alive after the launcher starts a Lua app.
- The Lua app can clear and take over the LVGL screen.
- The launcher still kept `s_app_buttons[]` and `s_status_label` pointers from the old launcher screen.
- A later BOOT short press tried to style a freed launcher button, corrupting LVGL heap state.

Fix:

- Added `s_launcher_active` to `launcher_ui.c`.
- After `vb_app_runner_launch_async()` succeeds, the launcher deactivates itself and clears `s_status_label` plus every `s_app_buttons[]` pointer.
- Later BOOT short/long presses are ignored while the launcher is inactive instead of touching stale LVGL objects.
- Added a static regression guard: `disables launcher controls after handing the screen to a Lua app`.

Verification:

```text
npm run test:firmware-static passed: 22/22
npm test passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0x1725e0 bytes.
esptool write_flash wrote bootloader, partition table, and app to:
  0x0
  0x8000
  0x10000
```

New boot evidence after flashing the fix:

```text
I app_init: Project name:     vibeboard_runtime
I app_init: ELF file SHA256:  585e7118b...
I boot:  2 factory          factory app      00 00 00010000 00400000
I app_registry: found 2 apps
I install_service: install service listening on port 8080
I vibeboard_runtime: VibeBoard Runtime ready: sd=ok apps=2 launcher=ok
```

Manual board re-test after reflashing `a491c29`:

```text
I app_init: Project name:     vibeboard_runtime
I app_init: App version:      a491c29
I app_init: ELF file SHA256:  1881e37f0...
I vibeboard_runtime: VibeBoard Runtime ready: sd=ok apps=2 launcher=ok
I launcher_ui: launcher BOOT long press: launch
I launcher_ui: launcher selected app: smoke_network
I app_runner: Lua app start: smoke_network
I launcher_ui: launcher BOOT short press: next
I launcher_ui: launcher inactive; BOOT short press ignored
I launcher_ui: launcher BOOT long press: launch
I launcher_ui: launcher inactive; BOOT long press ignored
```

Result: the crash fix is board-verified. After the launcher hands the screen to a Lua app, BOOT short/long presses are ignored instead of touching stale launcher LVGL objects. The board did not reboot and no `CORRUPT HEAP` or `Guru Meditation` appeared during the re-test.

## 2026-06-13 lifecycle state board verification

The Phase 5B `/status.state` field was verified on the board after reflashing the lifecycle stop fix:

```text
I app_init: Project name:     vibeboard_runtime
I app_init: App version:      a491c29
I app_init: ELF file SHA256:  09a2747e6...
I boot:  2 factory          factory app      00 00 00010000 00400000
I vibeboard_runtime: VibeBoard Runtime ready: sd=ok apps=2 launcher=ok
```

Initial HTTP state after `smoke_network` connected WiFi and exited:

```text
GET /status -> 200 OK
{"sd":true,"app_count":2,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}
```

Running state with a long-lived visual app:

```text
POST /launch?app=smoke_visual_remote -> 200 OK
{"ok":true,"launched":"smoke_visual_remote"}

GET /status -> 200 OK
{"sd":true,"app_count":2,"first_app":"smoke_network","install":"ok","state":"running","running":true,"current_app":"smoke_visual_remote"}

I app_runner: Lua async launch: smoke_visual
I app_runner: Lua app start: smoke_visual
I app_runner: smoke visual ok S:/apps/smoke_visual_remote/assets/icon.bmp
I lua_tmr: Lua tmr loop start
```

Controlled stop state fix:

```text
POST /stop -> 200 OK
{"ok":true,"stopped":true}

I app_runner: Lua stop requested: smoke_visual
I lua_tmr: Lua tmr loop stop requested
I app_runner: Lua async finished: smoke_visual status=ESP_ERR_INVALID_STATE message=stopped

GET /status -> 200 OK
{"sd":true,"app_count":2,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}
```

This confirms that a user-requested stop is no longer reported as `failed` even though the timer loop returns its internal stopped status.

Failure state with `apps/smoke_fail`:

```text
POST /launch?app=smoke_fail -> 200 OK
{"ok":true,"launched":"smoke_fail"}

I app_runner: Lua async launch: smoke_fail
I app_runner: Lua app start: smoke_fail
I app_runner: smoke fail start
E app_runner: Lua app failed: /sdcard/apps/smoke_fail/main.lua:2: intentional smoke failure
I app_runner: Lua async finished: smoke_fail status=ESP_FAIL message=/sdcard/apps/smoke_fail/main.lua:2: intentional smoke failure

GET /status -> 200 OK
{"sd":true,"app_count":3,"first_app":"smoke_network","install":"ok","state":"failed","running":false,"current_app":""}
```

Recovery after failure:

```text
POST /launch?app=smoke_network -> 200 OK
{"ok":true,"launched":"smoke_network"}

I app_runner: Lua async launch: smoke_network
I app_runner: Lua app start: smoke_network
I app_runner: Lua app ok
I app_runner: Lua async finished: smoke_network status=ESP_OK message=ok

GET /status -> 200 OK
{"sd":true,"app_count":3,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}
```

Result: `/status.state` is board-verified for idle, running, failed, controlled stop back to idle, and recovery from failed back to idle through a successful app launch. `current_app` is visible while running and cleared after app exit.

## 2026-06-15 runtime WiFi autoconnect and native uploader board verification

Phase 5B board closure was tested from branch `phase-5b-board-closure` on top of `5d8d4a7`.

The runtime now starts WiFi from SD before serving installs. The runtime-owned config path is `/sdcard/runtime/wifi.json`; for the current test board it also accepts the existing local smoke config at `/sdcard/apps/smoke_network/wifi.json` so the board can join WiFi without first launching `smoke_network`.

Build and flash evidence:

```text
idf.py build passed.
vibeboard_runtime.bin binary size 0x1735c0 bytes.
Smallest app partition is 0x400000 bytes. 0x28ca40 bytes (64%) free.

idf.py -p /dev/cu.usbmodem111301 flash passed.
MAC: 10:51:db:80:e2:e8
Hash of data verified.
```

Boot and autoconnect evidence:

```text
I app_init: Project name:     vibeboard_runtime
I app_init: App version:      5d8d4a7-dirty
Name: SD64G
W app_registry: skip app entry that is missing: raw_upload/main.lua
I app_registry: found 4 apps
I runtime_wifi: runtime WiFi autoconnect using /sdcard/apps/smoke_network/wifi.json
I install_service: install service listening on port 8080
I vibeboard_runtime: VibeBoard Runtime ready: sd=ok apps=4 launcher=ok
I wifi:connected with 1-306, aid = 3, channel 7, BW20, bssid = 24:b8:da:f4:62:c0
I runtime_wifi: runtime sta got ip 192.168.1.32
I esp_netif_handlers: sta ip: 192.168.1.32, mask: 255.255.255.0, gw: 192.168.1.1
```

Initial HTTP checks after boot:

```text
GET /status -> 200 OK
{"sd":true,"app_count":4,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}

GET /apps -> 200 OK
{"apps":[{"id":"smoke_network","name":"smoke_network","entry":"main.lua"},{"id":"smoke_visual_remote","name":"smoke_visual","entry":"main.lua"},{"id":"smoke_fail","name":"smoke_fail","entry":"main.lua"}]}
```

Default native HTTP uploader check:

```text
npm run package:app -- apps/smoke_visual
packaged smoke_visual
output dist/apps/smoke_visual

npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_visual_native
uploaded smoke_visual_native/app.info 144 bytes
uploaded smoke_visual_native/assets/icon.bmp 30122 bytes
uploaded smoke_visual_native/install-notes.txt 205 bytes
uploaded smoke_visual_native/main.lua 1798 bytes
uploaded smoke_visual_native/manifest.json 1105 bytes
uploaded 5 files
rescan ok; confirmed smoke_visual_native in /apps
```

The first launch check exposed a board-side HTTPD stack issue. Both `npm run launch:app` and raw `curl -X POST /launch?app=smoke_visual_native` reset the connection because the board rebooted:

```text
Launch smoke_visual_native failed after 3 attempts: read ECONNRESET
curl: (56) Recv failure: Connection reset by peer

***ERROR*** A stack overflow in task  has been detected.
ELF file SHA256: 716283217
Rebooting...
```

Root cause: `launch_handler` runs in the ESP-IDF HTTPD task, and the default `HTTPD_DEFAULT_CONFIG().stack_size` is 4096 bytes. The handler rescans SD, copies app metadata, hands off launcher state, and creates the Lua runner task, which overflowed the HTTPD task stack.

Fix:

```text
#define VB_INSTALL_HTTPD_STACK_SIZE 8192
config.stack_size = VB_INSTALL_HTTPD_STACK_SIZE;
```

Post-fix launch check:

```text
npm run launch:app -- http://192.168.1.32:8080 smoke_visual_native
launched smoke_visual_native

I app_runner: Lua async launch: smoke_visual
I app_runner: Lua app start: smoke_visual
I lua_file: file module app dir: /sdcard/apps/smoke_visual_native
I app_runner: smoke visual ok S:/apps/smoke_visual_native/assets/icon.bmp
I lua_tmr: Lua tmr loop start
I app_runner: smoke visual progress 23
I app_runner: smoke visual progress 34
...
```

Running, stop, rescan, and failure-recovery checks:

```text
GET /status -> 200 OK
{"sd":true,"app_count":4,"first_app":"smoke_network","install":"ok","state":"running","running":true,"current_app":"smoke_visual_native"}

POST /stop -> 200 OK
{"ok":true,"stopped":true}

GET /status -> 200 OK
{"sd":true,"app_count":4,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}

POST /rescan -> 200 OK
{"ok":true,"app_count":4}

npm run launch:app -- http://192.168.1.32:8080 smoke_fail
launched smoke_fail

I app_runner: smoke fail start
E app_runner: Lua app failed: /sdcard/apps/smoke_fail/main.lua:2: intentional smoke failure
I app_runner: Lua async finished: smoke_fail status=ESP_FAIL message=/sdcard/apps/smoke_fail/main.lua:2: intentional smoke failure

GET /status -> 200 OK
{"sd":true,"app_count":4,"first_app":"smoke_network","install":"ok","state":"failed","running":false,"current_app":""}

npm run launch:app -- http://192.168.1.32:8080 smoke_network
launched smoke_network

GET /status -> 200 OK
{"sd":true,"app_count":4,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}
```

Result: runtime WiFi autoconnect is board-verified, and the default Node native HTTP uploader plus launch helper are board-verified without `--transport nc`. The HTTPD stack overflow found during launch verification is fixed and regression-guarded by firmware static tests. Stop/rescan/failure/recovery are verified through HTTP and serial logs.

## 2026-06-15 physical launcher lifecycle screen smoke

Manual physical screen verification was performed on the LCKFB ESP32-S3 board after the runtime WiFi/upload/launch checks.

Checklist result:

- `smoke_visual_native` launched from the Mac helper and displayed the visual app image/progress UI on the device screen.
- Tapping the native Stop control stopped the running Lua app and returned the board to the launcher.
- Tapping the native Refresh control kept the app list usable and still showed the uploaded app.
- Launching `smoke_fail` returned to the launcher with readable failure feedback.
- BOOT long-press stop worked while a Lua app owned the screen.

Result: the Phase 5B launcher lifecycle controls are board-verified through HTTP, serial logs, and manual physical screen evidence.

## 2026-06-15 app delete/uninstall endpoint

Firmware with `POST /delete?app=<id>` was built and flashed to `/dev/cu.usbmodem111301`.

Build and flash evidence:

```text
vibeboard_runtime.bin binary size 0x173ae0 bytes. Smallest app partition is 0x400000 bytes. 0x28c520 bytes (64%) free.
esptool.py --chip esp32s3 -p /dev/cu.usbmodem111301 ... write_flash ...
Hash of data verified.
Hard resetting via RTS pin...
```

Post-flash status:

```text
GET /status -> 200 OK
{"sd":true,"app_count":4,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}
```

Disposable upload/delete smoke:

```text
npm run package:app -- apps/smoke_visual
packaged smoke_visual
output dist/apps/smoke_visual

npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_delete_probe
uploaded smoke_delete_probe/app.info 144 bytes
uploaded smoke_delete_probe/assets/icon.bmp 30122 bytes
uploaded smoke_delete_probe/install-notes.txt 205 bytes
uploaded smoke_delete_probe/main.lua 1798 bytes
uploaded smoke_delete_probe/manifest.json 1105 bytes
uploaded 5 files
rescan ok; confirmed smoke_delete_probe in /apps

npm run delete:app -- http://192.168.1.32:8080 smoke_delete_probe
deleted smoke_delete_probe; app_count=4

GET /apps -> 200 OK
{"apps":[{"id":"smoke_network","name":"smoke_network","entry":"main.lua"},{"id":"smoke_visual_remote","name":"smoke_visual","entry":"main.lua"},{"id":"smoke_fail","name":"smoke_fail","entry":"main.lua"},{"id":"smoke_visual_native","name":"smoke_visual","entry":"main.lua"}]}
```

Running-app delete protection:

```text
npm run launch:app -- http://192.168.1.32:8080 smoke_visual_native
launched smoke_visual_native

npm run delete:app -- http://192.168.1.32:8080 smoke_visual_native
Delete smoke_visual_native failed after 3 attempts: 409 app is running

POST /stop -> 200 OK
{"ok":true,"stopped":true}

GET /status -> 200 OK
{"sd":true,"app_count":4,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}
```

Result: app delete/uninstall is board-verified for successful recursive app directory deletion, registry rescan, host `delete:app` helper behavior, and running-app conflict protection.

## 2026-06-15 staged upload/commit endpoint

Firmware with staged upload endpoints was built and flashed to `/dev/cu.usbmodem111301`.

Build and flash evidence:

```text
vibeboard_runtime.bin binary size 0x1746c0 bytes. Smallest app partition is 0x400000 bytes. 0x28b940 bytes (64%) free.
esptool.py --chip esp32s3 -p /dev/cu.usbmodem111301 ... write_flash ...
Hash of data verified.
Hard resetting via RTS pin...
```

During the first board smoke, `/stop` and `/delete` returned HTTPD URI 404 after adding `/stage`, `/commit`, and `/discard`. Root cause: the install service exceeded the default HTTPD URI handler capacity. The firmware now sets `config.max_uri_handlers = VB_INSTALL_HTTPD_MAX_HANDLERS`, guarded by static tests. After flashing the fix:

```text
POST /stop -> 200 OK
{"ok":true,"stopped":false}

POST /delete?app=__missing_probe__ -> 404 app not found
```

Default staged upload smoke:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_stage_probe
uploaded smoke_stage_probe/app.info 144 bytes
uploaded smoke_stage_probe/assets/icon.bmp 30122 bytes
uploaded smoke_stage_probe/install-notes.txt 205 bytes
uploaded smoke_stage_probe/main.lua 1798 bytes
uploaded smoke_stage_probe/manifest.json 1105 bytes
uploaded 5 files
rescan ok; confirmed smoke_stage_probe in /apps

GET /apps -> 200 OK
{"apps":[{"id":"smoke_network","name":"smoke_network","entry":"main.lua"},{"id":"smoke_visual_remote","name":"smoke_visual","entry":"main.lua"},{"id":"smoke_fail","name":"smoke_fail","entry":"main.lua"},{"id":"smoke_visual_native","name":"smoke_visual","entry":"main.lua"},{"id":"smoke_stage_probe","name":"smoke_visual","entry":"main.lua"}]}
```

Launch, stop, and cleanup:

```text
npm run launch:app -- http://192.168.1.32:8080 smoke_stage_probe
launched smoke_stage_probe

GET /status -> 200 OK
{"sd":true,"app_count":5,"first_app":"smoke_network","install":"ok","state":"running","running":true,"current_app":"smoke_stage_probe"}

POST /stop -> 200 OK
{"ok":true,"stopped":true}

npm run delete:app -- http://192.168.1.32:8080 smoke_stage_probe
deleted smoke_stage_probe; app_count=4
```

Running-app commit protection:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_stage_running
uploaded 5 files
rescan ok; confirmed smoke_stage_running in /apps

npm run launch:app -- http://192.168.1.32:8080 smoke_stage_running
launched smoke_stage_running

npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_stage_running
Commit staging failed after 3 attempts: 409 app is running

POST /stop -> 200 OK
{"ok":true,"stopped":true}

npm run delete:app -- http://192.168.1.32:8080 smoke_stage_running
deleted smoke_stage_running; app_count=4
```

Final board state:

```text
GET /status -> 200 OK
{"sd":true,"app_count":4,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}

GET /apps -> 200 OK
{"apps":[{"id":"smoke_network","name":"smoke_network","entry":"main.lua"},{"id":"smoke_visual_remote","name":"smoke_visual","entry":"main.lua"},{"id":"smoke_fail","name":"smoke_fail","entry":"main.lua"},{"id":"smoke_visual_native","name":"smoke_visual","entry":"main.lua"}]}
```

Result: staged upload/commit is board-verified for default Mac upload behavior, staged file writes, commit validation into the app registry, launchability after commit, stop/delete cleanup, running-app conflict protection, and HTTPD handler capacity regression coverage.

## 2026-06-15 browser Web Console and AI creator delivery

Firmware with the embedded Web Console was built, flashed, and checked on the board at `192.168.1.32`.

Static and build verification:

```text
npm test
git diff --check
idf.py build
```

Board HTTP checks:

```text
GET / -> 200 OK
HTML contained:
VibeBoard Runtime
AI Create App
OpenAI API Key

GET /status -> 200 OK
{"sd":true,"app_count":4,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}

GET /apps -> 200 OK
{"apps":[{"id":"smoke_network","name":"smoke_network","entry":"main.lua"},{"id":"smoke_visual_remote","name":"smoke_visual","entry":"main.lua"},{"id":"smoke_fail","name":"smoke_fail","entry":"main.lua"},{"id":"smoke_visual_native","name":"smoke_visual","entry":"main.lua"}]}
```

Manual browser check:

```text
open http://192.168.1.32:8080/
```

Result: the board serves the browser management page from `GET /`, and the page includes the direct browser AI app creator. This verifies page delivery and API reachability from the same runtime HTTP service. A real OpenAI-key prompt-to-running-app smoke is still pending and should be recorded separately after a temporary API key is used.

## 2026-06-16 Phase 2 canvas and MatrixRain board verification

Firmware with the minimal Lua canvas binding was built and flashed to the LCKFB ESP32-S3 board.

Verification commands:

```text
npm test
idf.py build
idf.py -p /dev/cu.usbmodem111301 flash
```

Build result:

```text
vibeboard_runtime.bin binary size 0x17cb30 bytes.
Smallest app partition is 0x400000 bytes.
0x283510 bytes (63%) free.
```

Post-flash board status:

```text
GET /status -> 200 OK
{"sd":true,"app_count":12,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}
```

Canvas smoke app:

```text
npm run package:app -- apps/smoke_canvas
packaged smoke_canvas

npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_canvas smoke_canvas
uploaded 4 files
rescan ok; confirmed smoke_canvas in /apps

npm run launch:app -- http://192.168.1.32:8080 smoke_canvas
launched smoke_canvas

GET /status -> 200 OK
{"sd":true,"app_count":13,"first_app":"smoke_network","install":"ok","state":"running","running":true,"current_app":"smoke_canvas"}
```

Holocubic MatrixRain Phase 2 port:

```text
npm run package:app -- apps/holocubic_matrix_rain
packaged holocubic_matrix_rain

npm run upload:app -- http://192.168.1.32:8080 dist/apps/holocubic_matrix_rain holocubic_matrix_rain
uploaded 4 files
rescan ok; confirmed holocubic_matrix_rain in /apps

npm run launch:app -- http://192.168.1.32:8080 holocubic_matrix_rain
launched holocubic_matrix_rain

GET /status -> 200 OK
{"sd":true,"app_count":14,"first_app":"smoke_network","install":"ok","state":"running","running":true,"current_app":"holocubic_matrix_rain"}

Repeated `GET /status` checks after lowering the demo load returned immediately three times with `current_app=holocubic_matrix_rain`. The app uses conservative `COLUMN_W=24`, `TRAIL=6`, and a `180ms` timer so the HTTP service remains responsive while the canvas animation runs.
```

Lifecycle cleanup and switch check:

```text
POST /stop -> 200 OK
{"ok":true,"stopped":true}

GET /status -> 200 OK
{"sd":true,"app_count":14,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}

npm run launch:app -- http://192.168.1.32:8080 demo_digital_clock
launched demo_digital_clock

GET /status -> 200 OK
{"sd":true,"app_count":14,"first_app":"smoke_network","install":"ok","state":"running","running":true,"current_app":"demo_digital_clock"}
```

Result: the minimal canvas Runtime surface is board-verified for creation, PSRAM-backed buffer allocation, fill, rectangle drawing, text drawing, invalidation, staged upload, launch, stop, and switching back to a non-canvas app. The first Phase 2 Holocubic canvas screensaver, `MatrixRain`, is installed and launchable on the board.

## 2026-06-16 expanded Holocubic catalog and registry capacity board verification

Firmware with the 64-entry app registry, chunked `/apps` response, PSRAM-backed Lua task stack, and slim Lua app execution context was built and flashed to the LCKFB ESP32-S3 board.

Initial failure evidence before the fix:

```text
GET /apps returned truncated JSON when the SD card had the expanded app list.
Root cause: apps_handler used a fixed char body[1024].

npm run launch:app -- http://192.168.1.32:8080 demo_digital_clock
Launch demo_digital_clock failed after 3 attempts: 500 ESP_ERR_NO_MEM

After moving the Lua task stack to PSRAM, serial monitor exposed the remaining root cause:
***ERROR*** A stack overflow in task vb_lua_launch has been detected.

Root cause: lua_async_task still constructed a full vb_app_registry_result_t on the Lua task stack.
```

Fixes verified:

```text
GET /apps is streamed as chunked JSON instead of a fixed 1024-byte buffer.
Lua app tasks are created with xTaskCreatePinnedToCoreWithCaps and MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT.
The Lua runner now keeps only name, dir, and path in vb_lua_app_context_t while launching an app.
```

Build and flash:

```text
npm run test:firmware-static
idf.py -p /dev/cu.usbmodem111301 build flash

vibeboard_runtime.bin binary size 0x17ce30 bytes.
Smallest app partition is 0x400000 bytes.
0x2831d0 bytes (63%) free.
```

Board HTTP checks:

```text
GET /status -> 200 OK
{"sd":true,"app_count":16,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}

GET /apps -> JSON parse OK
{"count":16,"has2048":true,"hasBtc":true}
```

Launch checks:

```text
npm run launch:app -- http://192.168.1.32:8080 demo_digital_clock
launched demo_digital_clock

GET /status -> 200 OK
{"sd":true,"app_count":16,"first_app":"smoke_network","install":"ok","state":"running","running":true,"current_app":"demo_digital_clock"}

npm run launch:app -- http://192.168.1.32:8080 holocubic_2048
launched holocubic_2048

GET /status -> 200 OK
{"sd":true,"app_count":16,"first_app":"smoke_network","install":"ok","state":"running","running":true,"current_app":"holocubic_2048"}

POST /stop -> 200 OK
{"ok":true,"stopped":true}

GET /status -> 200 OK
{"sd":true,"app_count":16,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}
```

Result: the expanded registry firmware is board-verified for a 16-app live SD registry, `/apps` JSON parsing, launch of a known style demo, launch of a representative Holocubic placeholder app, switching from one app to another, and stop back to idle without `ESP_ERR_NO_MEM`, connection reset, or `vb_lua_launch` stack overflow.

Next-time runbook: `docs/runtime-troubleshooting.md` records the root cause chain, triage commands, and guardrails for `/apps` truncation, `ESP_ERR_NO_MEM`, and `vb_lua_launch` stack overflow.
