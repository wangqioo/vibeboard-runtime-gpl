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

## 2026-06-24/25 Weather Resource Lifecycle Follow-Up

The user-provided board photo showed partial rendering: solid color blocks, missing image detail, and square placeholder glyphs. The display issue has multiple layers:

- firmware/resource layer: actual `sdkconfig` had drifted from defaults for PNG and CJK font support;
- LVGL memory layer: resource reads and object allocation could exhaust internal RAM before the PSRAM-first LVGL allocator fix;
- app lifecycle layer: `apps/weather` created and later destroyed fonts, background images, icons, and screen objects synchronously, so HTTP `/stop` could remain stuck at `state=stopping`.

The `weather` app now uses:

- a lightweight startup shell with only basic labels;
- one `stage_boot` timer that serially advances main UI, font, and image stages without exceeding the Runtime timer limit;
- delayed Cubicserver fetch and explicit `/sd/runtime/cubicserver.json` guard;
- lightweight stop once image/font resources are active, avoiding synchronous large LVGL teardown from the HTTP stop path.

Board evidence on `http://192.168.1.32:8080`:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500
lifecycle smoke ok: weather state=running current_app=weather polls=2 stop_state=idle stop_current_app= stop_polls=1

curl -s -X POST 'http://192.168.1.32:8080/launch?app=weather'
sleep 3
curl -s http://192.168.1.32:8080/status
{"state":"running","current_app":"weather",...}
curl -s --max-time 15 -X POST http://192.168.1.32:8080/stop
{"ok":true,"stopped":true}
curl -s http://192.168.1.32:8080/status
{"state":"idle","current_app":"",...}
```

Remaining work is physical visual QA: photograph `weather`, `nixie_clock`, `clock`, and `voice_ai` after a fresh Runtime flash and app upload, then inspect glyph coverage, PNG decode, resource paths, color depth, image scale, and animation.

## Current Runtime Board Evidence

Board endpoint used during the current VibeBoard Runtime bring-up:

```text
http://192.168.1.32:8080
```

The board was running the VibeBoard ESP32 runtime with SD app scanning enabled. `/status`
reported SD present and 28 apps after the smoke apps were uploaded.

### Gamepad Software Metrics Smoke

The `smoke_gamepad` app exercises the Lua gamepad API lifecycle by registering callbacks,
starting the gamepad module, and pushing synthetic gamepad states from a timer. This verifies
that an app using the gamepad API can be packaged, uploaded, launched, observed through
runtime status, and stopped on the real board. The later metrics pass also verifies that the
app writes a board-readable `metrics.json` artifact with connection, update, Xbox-button-seen,
dpad-seen, address, and event-counter fields.

Commands and observed results:

```bash
npm run package:app -- apps/smoke_gamepad
```

```text
packaged smoke_gamepad
output dist/apps/smoke_gamepad
install /sd/apps/smoke_gamepad
```

```bash
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_gamepad smoke_gamepad
```

```text
uploaded app.info 121 bytes
uploaded install-notes 208 bytes
uploaded main.lua 2315 bytes
uploaded manifest.json 1474 bytes
uploaded 4 files
commit ok
confirmed smoke_gamepad in /apps
```

```bash
npm run gamepad:smoke -- --board http://192.168.1.32:8080 --polls 8 --interval-ms 300
```

```text
gamepad smoke ok: smoke_gamepad state=running current_app=smoke_gamepad polls=1
```

The metrics upgrade changed `smoke_gamepad` to require `capabilities = lvgl,timer,input,file`
and added `--metrics-delay-ms`, `--metrics-polls`, `--require-updates`,
`--require-connected`, and `--require-xbox` to `npm run gamepad:smoke`. Local verification:

```bash
npm run test:gamepad-smoke
npm run test:firmware-static
npm run package:app -- apps/smoke_gamepad
```

Board verification required reflashing the Runtime once because `/apps` briefly returned an
empty registry and upload commit failed. The board was reflashed on `/dev/cu.usbmodem111301`,
after which `/status` returned `app_count:31,state:idle` and `/apps` again included
`smoke_gamepad` with `capabilities:"lvgl,timer,input,file"`.

```bash
npm run gamepad:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-delay-ms 3000 --metrics-polls 16 --interval-ms 500 --require-updates 2 --require-connected --require-xbox
```

```text
gamepad smoke ok: smoke_gamepad state=running current_app=smoke_gamepad polls=1 connected=true updates=4 xbox=true buttons=0
```

2026-06-24 follow-up: the software lifecycle smoke now also covers disconnect event metrics.
`smoke_gamepad` exposes `connect_failed` in `metrics.json`, and `npm run gamepad:smoke` accepts
`--inject-disconnect`, `--require-disconnects <n>`, and `--require-connect-failed <n>`.
After packaging and uploading the updated app, the board first showed the app was running and the
metrics file contained the expected lifecycle counters:

```json
{"ok":true,"tag":"update","started":true,"connected":true,"connecting":false,"buttons_mask":256,"xbox":true,"xbox_seen":true,"dpad_left":true,"dpad_right":false,"left_seen":true,"right_seen":true,"updates":7,"connects":2,"disconnects":1,"connect_failed":0,"pair_events":1,"address":"smoke","last_address":"smoke"}
```

The repeatable tool smoke then passed with a small metrics delay:

```bash
npm run gamepad:smoke -- --board http://192.168.1.32:8080 --inject-gamepad --inject-disconnect --require-updates 2 --require-disconnects 1 --metrics-delay-ms 1000 --metrics-polls 20 --polls 12 --interval-ms 500
```

```text
gamepad smoke ok: smoke_gamepad state=running current_app=smoke_gamepad polls=2 connected=true updates=8 disconnects=1 connect_failed=0 xbox=true buttons=0
```

This proves the queued Runtime gamepad path can drive connected, update, and disconnected lifecycle
events through Lua and expose them as machine-readable board metrics. It remains a synthetic HTTP
smoke hook; it does not prove real BLE/Xbox discovery or native gamepad host input.

```bash
curl -s -X POST http://192.168.1.32:8080/stop
```

```json
{"ok":true,"stopped":true}
```

Final board status:

```json
{"sd":true,"app_count":28,"state":"idle","running":false,"current_app":"","last_status":"ESP_ERR_INVALID_STATE","last_message":"stopped"}
```

Remaining gamepad evidence still needed:

- Pair and read a real Bluetooth/BLE controller.
- Verify Xbox-style button mapping against the physical controller model.
- Observe `smoke_gamepad` labels on the physical display while input states change.
- Decide whether native gamepad polling belongs in firmware, an external bridge, or both.

### Generic App Lifecycle Smoke For Controls And Touch

The shared lifecycle smoke tool launches one installed app, polls `/status`, and succeeds when
the expected state/current app pair appears. This is useful for moving build-only smoke apps
into board lifecycle evidence before doing manual screen checks.

Local tool verification:

```bash
npm run test:lifecycle-smoke
```

```text
# tests 4
# pass 4
```

Common controls app package/upload:

```bash
npm run package:app -- apps/smoke_controls
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_controls smoke_controls
```

```text
packaged smoke_controls
output dist/apps/smoke_controls
install /sd/apps/smoke_controls
uploaded 4 files
commit ok; confirmed smoke_controls in /apps
```

Common controls lifecycle smoke:

```bash
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app smoke_controls --polls 8 --interval-ms 300
```

```text
lifecycle smoke ok: smoke_controls state=running current_app=smoke_controls polls=1
```

Touch app package/upload:

```bash
npm run package:app -- apps/smoke_touch
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_touch smoke_touch
```

```text
packaged smoke_touch
output dist/apps/smoke_touch
install /sd/apps/smoke_touch
uploaded 4 files
commit ok; confirmed smoke_touch in /apps
```

Touch lifecycle smoke:

```bash
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app smoke_touch --polls 8 --interval-ms 300
```

```text
lifecycle smoke ok: smoke_touch state=running current_app=smoke_touch polls=1
```

Each app was stopped after its smoke run:

```bash
curl -s -X POST http://192.168.1.32:8080/stop
```

```json
{"ok":true,"stopped":true}
```

This proves `smoke_controls` and `smoke_touch` can be uploaded, launched, observed as running,
and stopped on the board. It does not prove every control is visually correct or that physical
touch coordinates are displayed correctly; those still require observing the device screen.

### Runtime I2S Config Write Smoke

The runtime-owned I2S config path can be smoke-tested without starting microphone capture.
The tool writes a config through `/runtime/config?name=i2s`, then reads `/status` and requires
the response to still look like VibeBoard Runtime.

Local tool verification:

```bash
npm run test:uploader
```

```text
# tests 37
# pass 37
```

Board smoke:

```bash
npm run runtime:config:smoke -- http://192.168.1.32:8080 i2s '{"bclk_pin":1,"ws_pin":2,"din_pin":3,"mclk_pin":-1,"sample_rate":16000,"bits":16,"channel":2}'
```

```text
runtime config smoke ok: i2s state=idle runtime=0.1.0
```

This proves `/sdcard/runtime/i2s.json` can be updated through the install service and the
Runtime remains responsive afterward. It does not prove the pins are correct for the physical
microphone path, and it does not prove nonzero PCM capture. Those still require `apps/smoke_i2s`
with the verified board audio pins.

2026-06-23 follow-up: the Runtime now exposes a controlled `POST /reboot` endpoint, and
`runtime:config:smoke` can use `--reboot` to write a config, reboot the board, and wait for
`/status` to return.

Local verification:

```bash
npm run test:uploader
npm run test:firmware-static
idf.py build
```

Board smoke after flashing `/dev/cu.usbmodem111301`:

```bash
npm run runtime:config:smoke -- --reboot --reboot-polls 45 --reboot-delay-ms 1000 http://192.168.1.32:8080 i2s '{"bclk_pin":1,"ws_pin":2,"din_pin":3,"mclk_pin":-1,"sample_rate":16000,"bits":16,"channel":2}'
```

```text
runtime config smoke ok: i2s state=idle runtime=0.1.0 polls=2
```

This proves the generic config-write-plus-reboot path. The WiFi-specific write/reboot/join
smoke still needs a real local WiFi JSON file; the repo only contains placeholder WiFi
credentials, so this pass did not overwrite the board's working WiFi config.

### I2S Nonzero PCM And TX Write Smoke

`apps/smoke_i2s` now writes machine-readable capture metrics to its app-local `metrics.json`.
The install service exposes that artifact through `GET /apps/file?app=smoke_i2s&path=metrics.json`,
and the local smoke tool starts from a clean app state before polling the file.

Local tool verification:

```bash
npm run test:i2s-smoke
```

```text
# tests 13
# pass 13
```

Board smoke after flashing the firmware that includes `/apps/file` and uploading `smoke_i2s`:

```bash
npm run i2s:smoke -- --board http://192.168.1.32:8080 --polls 20 --interval-ms 500 --require-reads --require-nonzero
```

```text
i2s smoke ok: smoke_i2s started=true reads=1 bytes=2048 nonzero=2048 error= polls=11
```

This proves the board can start Lua I2S RX, receive nonzero PCM bytes, write an app-local
metrics artifact, and serve that artifact over HTTP.

2026-06-23 follow-up: the Lua I2S module now also supports TX. The board config can include
`dout_pin`; `i2s.start(...)` recreates the ESP-IDF channel when an app changes from RX-only to
RX+TX, which fixes the stale `started=true` state observed after adding a `dout_pin` to an
already-running board. `i2s.write(port, data, timeout_ms)` writes to the TX channel and
`i2s.status(port)` reports `rx_started`, `tx_started`, `reads`, `rx_bytes`, `writes`, and
`tx_bytes`.

Board config used for the TX write smoke:

```bash
npm run runtime:config -- http://192.168.1.32:8080 i2s '{"bclk_pin":1,"ws_pin":2,"din_pin":3,"dout_pin":4,"mclk_pin":-1,"sample_rate":16000,"bits":16,"channel":2}'
```

Local verification:

```bash
npm run test:i2s-smoke
npm run test:firmware-static -- --test-name-pattern I2S
npm run test:validator
node tools/app-validator/validate-demo-apps.mjs
npm run package:app -- apps/smoke_i2s
git diff --check
```

Board smoke after uploading the updated `smoke_i2s` package:

```bash
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_i2s smoke_i2s
npm run i2s:smoke -- --board http://192.168.1.32:8080 --polls 20 --interval-ms 500 --require-reads --require-nonzero --require-write
```

```text
i2s smoke ok: smoke_i2s started=true reads=1 bytes=1536 nonzero=1536 writes=1 tx_bytes=512 error= polls=9
```

The test app was stopped afterward with `POST /stop`, returning `{"ok":true,"stopped":true}`.
This proves board-level I2S TX driver writes through Lua and machine-readable TX metrics. It
does not prove audible speaker playback, ES8311 codec initialization, amplifier control, or the
final production audio pinout.

2026-06-24 follow-up: `smoke_i2s` was changed from a one-shot TX write to a sustained
TX-only 440Hz smoke. The app now reports `tone_hz`, `tone_writes`, and `phase` in
`metrics.json`, and `npm run i2s:smoke` accepts `--require-tone-writes <n>`.

During the first run, the board still had a stale `nes_core` task active from an earlier NES
smoke. Serial logs showed repeated task watchdog warnings for `nes_core`, followed by SD read
failures:

```text
task_wdt: CPU 0: nes_core
sdmmc_read_sectors: not enough mem, err=0x101
apps directory not found: /sdcard/apps
```

`POST /reboot` cleared the stale task and restored `/status` to `app_count=32,state=idle`.
After uploading the updated `smoke_i2s`, the sustained TX smoke passed:

```bash
npm run i2s:smoke -- --board http://192.168.1.32:8080 --polls 20 --interval-ms 500 --require-write --require-tone-writes 8
```

```text
i2s smoke ok: smoke_i2s started=true reads=18 bytes=0 nonzero=0 writes=18 tx_bytes=4608 tone_hz=440 tone_writes=18 error= polls=1
```

The app was stopped afterward with `POST /stop`, returning `{"ok":true,"stopped":true}`.
This proves sustained driver-level TX sample writes from Lua. It still does not prove ES8311
codec setup, amplifier enable, or audible speaker output.

Later on 2026-06-24, the stale `nes_core` finding was fixed at the Lua/native boundary. The
runner now calls `vb_lua_native_module_cleanup(L)` during `cleanup_lua_runtime()`, which calls
`vb_nes_native_module_cleanup()` and forces `nes_core_stop(..., force=1)` plus
`nes_core_destroy(...)` on the static NES runtime. The static regression
`cleans up native module state when a Lua app exits` guards this cleanup hook.

After flashing the fixed firmware to `/dev/cu.usbmodem111301`, the board passed the NES host
audio smoke, was stopped, and then ran I2S without rebooting:

```text
nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=2 rom=true started=true frames=138 frame_growth=126 samples=10 frames=12->138 audio=0 backend=host audio_error=
POST /stop -> {"ok":true,"stopped":true}
smoke_i2s metrics after no-reboot launch: tone_writes=26, tx_bytes=6656, last_error=""
```

Serial during the post-NES I2S run no longer showed `task_wdt CPU 0: nes_core` or SD
`not enough mem` errors. This proves native NES stop/cleanup no longer leaves the smoke-path
host tasks alive across app exits.

Follow-up local reliability hardening on 2026-06-24: `npm run i2s:smoke` now treats a transient
`/launch` transport reset as recoverable only when `/status` confirms the target app became
`state=running,current_app=smoke_i2s`. This covers the board pattern where the HTTP response can
drop after the launch job is queued, while still preserving real launch failures. The regression
was added test-first in `tools/i2s-smoke/test.mjs`; local verification was:

```text
npm run test:i2s-smoke
# tests 16
# pass 16
```

This is a tool reliability improvement. It does not add new ES8311/speaker evidence until the
next physical board audio run uses the hardened smoke command.

The same hardened command was then run against the board while it was online at
`192.168.1.32:8080`:

```bash
npm run i2s:smoke -- --board http://192.168.1.32:8080 --polls 20 --interval-ms 500 --require-write --require-tone-writes 8
```

```text
i2s smoke ok: smoke_i2s started=true reads=28 bytes=0 nonzero=0 writes=28 tx_bytes=7168 tone_hz=440 tone_writes=28 error= polls=1
POST /stop -> {"ok":true,"stopped":true}
GET /status -> state=idle, app_count=32
```

This confirms the hardened smoke tool still passes the current board-level I2S TX metrics path.
It remains driver-level evidence, not audible speaker verification.

### Voice AI Mock Bridge End-To-End Smoke

The follow-up Voice AI smoke used the local mock bridge at `192.168.1.26:8790` and the board
at `192.168.1.32:8080`. `apps/voice_ai` was changed to expose `metrics.json`, read
`config.json` through app-local `file.open("config.json", "r")`, guard config loading with
`pcall`, wait for `init_stage=ready`, count HOME events, and drain I2S synchronously before
submitting audio.

Local verification:

```text
npm run test:voice-bridge
npm run test:voice-ai-smoke
npm run test:firmware-static
```

Board verification:

```text
npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1800 --ready-polls 60 --polls 30 --interval-ms 500 --min-audio-bytes 1024
voice-ai smoke ok: audio=2048 chats=0->1 state=running current_app=voice_ai reply=我已收到录音：收到 2048 字节音频，约 0.0 秒
```

This proves the mock bridge record/upload/reply loop. The board smoke config used
`"use_gif": false`, so physical GIF rendering with `"use_gif": true`, production
STT/LLM command-provider wrappers, and credential/privacy policy remain pending.

### Lua App Manager Handoff Smoke

The app-manager smoke tool launches `smoke_app_manager` and waits for its software HOME
handoff to `smoke_key`. This standardizes the earlier manual `/launch` + `/status` checks.

Local tool verification:

```bash
npm run test:app-manager-smoke
```

```text
# tests 2
# pass 2
```

Board smoke:

```bash
npm run app-manager:smoke -- --board http://192.168.1.32:8080 --polls 12 --interval-ms 500
```

```text
app-manager smoke ok: smoke_app_manager->smoke_key state=running current_app=smoke_key polls=5
```

The handoff leaves `smoke_key` running, so the board was stopped afterward:

```bash
curl -s -X POST http://192.168.1.32:8080/stop
```

```json
{"ok":true,"stopped":true}
```

This proves the Lua `app.launch("smoke_key")` handoff path is repeatable through local tooling.
It does not prove physical BOOT HOME forwarding; that still needs a manual button smoke.

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

## 2026-06-17 upstream display migration firmware reflash

Context: after migrating `ConwayLife` and `FluidPendant`, the connected board needed a fresh firmware flash before display-app board verification could continue.

Local verification before flashing:

```text
npm test passed.
npm run test:firmware-static passed with 37 tests.
idf.py build passed.
```

The first reflashed firmware still rebooted during startup. Serial showed the board reached SD card mount, then crashed before registry/WiFi/HTTP startup:

```text
I vibeboard_runtime: VibeBoard Runtime start
I board_lckfb: VibeBoard Runtime board start
I LVGL: Starting LVGL task
Name: SD64G
***ERROR*** A stack overflow in task main has been detected.
Rebooting...
```

Root cause: the generated local `sdkconfig` still had the default main task stack even after `sdkconfig.defaults` was updated. The effective build config was changed to:

```text
CONFIG_ESP_MAIN_TASK_STACK_SIZE=8192
CONFIG_MAIN_TASK_STACK_SIZE=8192
```

Post-reconfigure evidence:

```text
build/config/sdkconfig.h:#define CONFIG_ESP_MAIN_TASK_STACK_SIZE 8192
```

After reflashing that build, the main-task stack overflow was gone. The board scanned SD apps and WiFi associated:

```text
I app_registry: found 16 apps
I runtime_wifi: runtime WiFi autoconnect using /sdcard/runtime/wifi.json
I vibeboard_runtime: VibeBoard Runtime ready: sd=ok apps=16 launcher=ok
I runtime_wifi: runtime sta got ip 192.168.1.32
```

That boot also exposed an HTTP handler capacity issue:

```text
W httpd_uri: httpd_register_uri_handler: no slots left for registering handler
W install_service: register /apps/delete handler failed: ESP_ERR_HTTPD_HANDLERS_FULL
```

Fix:

```text
config.max_uri_handlers = 12;
```

The next run exposed LVGL task watchdog reports while LVGL waited inside the display refresh path:

```text
E task_wdt: Task watchdog got triggered.
Tasks currently running:
CPU 0: LVGL task
Backtrace resolved to:
lv_timer_handler -> _lv_disp_refr_timer -> refr_area_part
```

Fix:

```text
disp_ctx->disp_drv.wait_cb = lvgl_port_wait_callback;
lvgl_port_wait_callback -> vTaskDelay(pdMS_TO_TICKS(1))
```

Post-fix runtime observation:

```text
I SystemInfo: free sram: 106787 minimal sram: 102751
I SystemInfo: free sram: 107303 minimal sram: 102751
I SystemInfo: free sram: 106787 minimal sram: 102751
```

No `main` stack overflow and no LVGL task watchdog appeared in the final captured runtime log window. However, `curl http://192.168.1.32:8080/status` returned connection failure after this last flash, even though ARP still mapped `192.168.1.32` to board MAC `10:51:db:80:e2:e8`. The board was running an existing SD app that printed `SystemInfo` memory logs.

Result: the firmware was reflashed and the startup crash path is fixed. Main stack size, HTTP handler count, and LVGL wait-yield behavior are regression-guarded by static tests. The migrated display apps are still not board-verified because the final HTTP upload/launch path was unreachable; next session should first recover HTTP/WiFi service visibility, then upload and launch `matrix_rain`, `nixie_clock`, `clock`, `conway_life`, and `fluid_pendant`.

## 2026-06-18 2048 migration and hardware blocker

Software migration completed for upstream `2048`:

```text
Source: upstream/holocubic-apps/2048/
Target: apps/2048/
Runtime additions:
- lua_key.c / lua_key.h with key.on, key.off, key.push
- global millis()
- LVGL object delete/foreground helpers
- LVGL opacity, gradient, shadow, clip-corner helpers
- simple lv_anim_start/lv_anim_del/lv_anim_delete wrappers
```

Local verification:

```text
npm run test:firmware-static passed with 39 tests.
npm run test:packager passed.
npm run package:app -- apps/2048 packaged dist/apps/2048.
npm test passed.
idf.py build passed.
vibeboard_runtime.bin binary size 0x176b60 bytes.
Smallest app partition is 0x400000 bytes.
Free app partition space is 0x2894a0 bytes (63%).
```

Board verification could not continue because the currently connected USB serial device is not the ESP32-S3 Runtime board:

```text
Serial path: /dev/cu.usbmodem11301
USB Product Name: CDC ACM serial backend
USB Vendor Name: Zephyr Project
idVendor: 12259
idProduct: 4
Serial number: 12EBF0B1B70E5B58
```

Observed failures:

```text
curl http://192.168.1.32:8080/status timed out.
arp -a no longer showed board MAC 10:51:db:80:e2:e8.
esptool.py --chip esp32s3 -p /dev/cu.usbmodem11301 chip_id failed with:
Failed to connect to ESP32-S3: No serial data received.
```

Conclusion: the correct ESP32-S3 board is not connected or is not exposed as the expected USB-Serial/JTAG device. The next hardware session should first reconnect the ESP32-S3 Runtime board, confirm `esptool.py chip_id`, then flash/upload and screen-test `matrix_rain`, `nixie_clock`, `clock`, `conway_life`, `fluid_pendant`, and `2048`.

## 2026-06-19 board reconnect, temporary Runtime flash, and shared-firmware note

The ESP32-S3 board was reconnected and identified as the expected LCKFB/ESP32-S3 target:

```text
Serial path: /dev/cu.usbmodem112301
USB Product Name: USB JTAG/serial debug unit
USB Vendor Name: Espressif
Chip: ESP32-S3 QFN56 revision v0.2
PSRAM: 8 MB
MAC: 10:51:db:80:e2:e8
Runtime IP after WiFi: 192.168.1.32
```

Important ownership note:

```text
This physical board is shared with the user's other ESP32 project firmware.
Do not assume it is permanently running VibeBoard Runtime.
For VibeBoard hardware verification, first temporarily flash VibeBoard Runtime.
After testing, record whether the board is left on VibeBoard Runtime or on the user's other firmware.
```

Use the non-destructive shared-board preflight before any VibeBoard hardware test:

```bash
npm run device:check
```

The check lists candidate `/dev/cu.usbmodem*` ports, probes `chip_id` for ESP32-S3 identity, and checks `http://192.168.1.32:8080/status` for VibeBoard Runtime metadata. It does not erase, flash, upload, or otherwise write to the board.

The first VibeBoard flash attempt booted into older residual firmware. A full erase plus fresh flash was needed to remove stale OTA/partition state before the board booted the expected Runtime:

```text
Project name: vibeboard_runtime
app_registry: found 16 apps
install_service: install service listening on port 8080
runtime sta got ip 192.168.1.32
```

The temporary Runtime hardware run exposed two memory/boot issues and one app-listing issue.

### LVGL SPI DMA internal-memory pressure

Observed failure:

```text
spi_master: setup_dma_priv_buffer... Failed to allocate priv TX buffer
panel_io_spi_tx_color
task_wdt: CPU 0: LVGL task
```

Root cause: the LVGL draw buffer was in PSRAM. The SPI LCD driver then needed a temporary internal DMA TX buffer; after WiFi and runtime services were active, that internal allocation could fail and the LVGL flush path could stall.

Fix:

```text
Display buffer uses internal DMA memory.
VB_LCD_DRAW_BUF_HEIGHT reduced to 5 rows.
.buff_dma = true
.buff_spiram = false
```

Post-fix observation: the boot window no longer showed the SPI DMA TX buffer allocation failure or LVGL watchdog report.

### HTTPD task stack placement

Observed failure:

```text
install_service: httpd_start failed: ESP_ERR_HTTPD_TASK
```

Root cause: after moving the LCD draw buffer into internal DMA memory, the HTTPD 8192-byte stack could fail to allocate from internal RAM.

Fix:

```text
config.task_caps = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT
config.stack_size = 8192
```

Post-fix evidence:

```text
install_service: install service listening on port 8080
GET /status returned JSON from the board.
```

### `/apps` response size

Observed failure: the uploader could upload files, but the follow-up app-list confirmation saw truncated or invalid JSON when many apps were installed.

Fix:

```text
GET /apps now streams chunked JSON instead of building one fixed-size response buffer.
```

Post-fix evidence:

```text
HTTP/1.1 200 OK
Content-Type: application/json
Transfer-Encoding: chunked
```

The board returned a complete app list including `2048`:

```text
{"id":"2048","name":"2048","entry":"main.lua","schema":"vibeboard-runtime-app-package@2","version":"0.1.0","kind":"app","capabilities":"lvgl,file,timer,input","compatible":true}
```

The Mac uploader also succeeded against the temporary Runtime firmware:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/2048 2048
uploaded 5 files
commit ok; confirmed 2048 in /apps
```

### 2048 launch status

Before the Lua runner stack was moved to PSRAM, launching `2048` returned:

```text
ESP_ERR_NO_MEM
```

Fix added after that result:

```text
Lua runner tasks use xTaskCreatePinnedToCoreWithCaps(..., MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT).
```

The first post-fix launch exposed two app/API compatibility issues:

```text
/sdcard/apps/2048/main.lua:122: bad argument #1 to 'lv_begin' (number expected, got no value)
/sdcard/apps/2048/main.lua:374: only 320x240 canvas is supported
```

Fixes:

```text
2048 no longer calls the object-id `lv_begin`/`lv_canvas_frame_begin` API as a no-arg frame batch.
2048 no longer creates a small game-over blur canvas; it uses a normal LVGL overlay panel because the current Runtime canvas binding only supports 320x240.
FATFS no longer prefers external RAM, the PSRAM malloc threshold is lower, internal reserve is 64 KB, and SDMMC enables `SDMMC_HOST_FLAG_ALLOC_ALIGNED_BUF`.
Lua script loading reads through an internal DMA-capable 512-byte buffer.
```

Final 2026-06-19 board evidence:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/2048 2048
uploaded 5 files
commit ok; confirmed 2048 in /apps

POST /launch?app=2048
{"ok":true,"launched":"2048"}

GET /status
{"state":"running","running":true,"current_app":"2048","last_status":"ESP_OK","last_message":""}
```

The board stayed in `running` for repeated `/status` polls. Manual visual confirmation and real touch-swipe gameplay are still pending; HTTP/serial evidence verifies launch stability.

### 2048 exit guard and LVGL object table follow-up

User feedback after the first launch check: accidental left/right swipe exits are too easy while playing `2048`; the app should require two consecutive exit gestures before leaving the game.

App-side change:

```text
apps/2048/main.lua
HOME/EXIT exit events now require the same event twice within 1200 ms before APP.stop().
Normal LEFT/RIGHT/UP/DOWN movement remains immediate.
```

The first post-change hardware run exposed another Runtime-side stability issue:

```text
/sdcard/apps/2048/main.lua:790: lvgl object table full
```

Root cause: deleted LVGL objects left holes in the Lua object handle table, but new objects were allocated only after the current high-water count. `2048` creates/deletes animated tiles often enough to exhaust the fixed table even though many previous objects have already been deleted.

Follow-up finding: slot reuse and a 128-handle limit were still not enough. `2048` deletes temporary animation tile parents, and LVGL deletes their child labels as part of that object subtree. The Lua handle table had only forgotten the parent object id, so child label handles remained registered even after LVGL had freed the real objects.

Runtime fix:

```text
lua_lvgl.c now stores new object handles into the first free slot.
lua_lvgl.c now accepts valid sparse object IDs instead of requiring id <= s_object_count.
lua_lvgl.c now forgets registered handles for a deleted object's full child subtree.
lua_lvgl_widgets.c calls vb_lua_lvgl_forget_object_tree() before lv_obj_clean() and lv_obj_del().
VB_LVGL_OBJECT_MAX increased from 64 to 128.
```

Final 2026-06-19 follow-up evidence:

```text
npm run test:firmware-static
git diff --check
npm test
idf.py build flash
npm run upload:app -- http://192.168.1.32:8080 dist/apps/2048 2048
POST /launch?app=2048
repeated GET /status for about 90 seconds
{"state":"running","running":true,"current_app":"2048","last_status":"ESP_OK","last_message":""}
```

Result: the `lvgl object table full` failure did not recur during the longer follow-up status polling window.

Manual follow-up from the user on the physical board:

```text
2048 screen/gameplay looks OK.
Directional swipe gameplay works.
The accidental-exit path now requires the intended double gesture.
```

Result: `2048` is board-verified for upload/list/launch/stability, physical swipe gameplay, and the double-exit guard. Future sessions should keep it as a quick regression check after Runtime input or LVGL lifecycle changes.

### Incompatible package launch guard

After reflashing the Runtime, the device screen appeared to have apps that would not open. HTTP diagnostics showed the SD card and registry were healthy, but most installed apps were old package schema v1:

```text
GET /status
{"sd":true,"state":"failed","last_status":"ESP_ERR_NO_MEM","last_message":"ESP_ERR_NO_MEM"}

GET /apps
{"id":"smoke_network",...,"schema":"vibeboard-runtime-app-package@1","compatible":false}
{"id":"2048",...,"schema":"vibeboard-runtime-app-package@2","compatible":true}
```

Root cause: the registry correctly marked old schema v1 packages as `compatible:false`, but the native Launcher still rendered every stored app and HTTP `/launch` still attempted to start incompatible entries. Tapping old entries looked like all apps were broken.

Fix:

```text
launcher_ui.c refresh_rendered_apps() now skips !compatible apps.
install_service.c /launch now returns HTTP 400 "app incompatible" for incompatible packages.
```

Board evidence after flashing the fix:

```text
POST /launch?app=smoke_network
HTTP/1.1 400 Bad Request
app incompatible

POST /launch?app=2048
{"ok":true,"launched":"2048"}

GET /status
{"state":"running","running":true,"current_app":"2048","last_status":"ESP_OK","last_message":""}
```

Result: incompatible legacy packages are no longer launchable, and compatible schema v2 apps still launch normally. To make the screen show more than `2048`, re-upload current schema v2 builds of the desired apps with `npm run upload:app`.

### Expanded app registry and migrated app uploads

The first attempt to upload `matrix_rain` exposed a second many-app issue:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/matrix_rain matrix_rain
Uploaded app matrix_rain was not found after rescan

GET /status
{"app_count":18,...}
```

Root cause: the board had more than 12 SD app directories. The registry counted all app directories, but `VB_APP_REGISTRY_MAX_APPS` was still 12, so later uploaded schema v2 apps could be present on SD while absent from `/apps`, the Launcher, and uploader confirmation.

Runtime fix:

```text
VB_APP_REGISTRY_MAX_APPS increased from 12 to 32.
main.c allocates vb_app_registry_result_t in PSRAM instead of static DRAM.
launcher_ui.c allocates the compatible rendered-app cache in PSRAM instead of static DRAM.
```

The first naive max-app increase failed at link time with:

```text
.dram0.bss will not fit in region dram0_0_seg
region dram0_0_seg overflowed by 19496 bytes
```

After moving the large buffers to PSRAM, verification passed:

```text
npm run test:firmware-static
idf.py build
idf.py -p /dev/cu.usbmodem112301 flash

GET /status
{"sd":true,"app_count":22,"install":"ok","state":"idle","last_status":"ESP_OK"}

GET /apps
returns 22 app entries
```

Current board app state after uploads:

```text
Compatible schema v2 apps:
2048
matrix_rain
nixie_clock
clock
conway_life
fluid_pendant

Legacy schema v1 apps still present but hidden from Launcher:
smoke_network
smoke_visual_remote
smoke_fail
demo_auto_snake
demo_focus_timer
holocubic_nixie_clock
demo_lucky_card
demo_pixel_pet
demo_digital_clock
holocubic_analog_clock
demo_terminal_status
demo_night_light
smoke_canvas
holocubic_matrix_rain
holocubic_2048
holocubic_btc
```

Result: the board has not lost the earlier apps. The native Launcher intentionally shows only compatible schema v2 apps; the old schema v1 apps remain on SD and need migration or replacement packages before they become launchable again.

### Migrated app launch verification and shared-board flash note

During follow-up verification, `/status` became unreachable and serial logs showed the board was running the user's other ESP32 project again:

```text
Project name:     esp32s3_device
Partition Table:
factory app offset 0x20000
```

Important shared-board finding: a normal `idf.py -p /dev/cu.usbmodem112301 flash` can leave the board booting the other project's partition layout. For VibeBoard verification on this shared board, use full erase plus flash:

```text
idf.py -p /dev/cu.usbmodem112301 erase-flash flash
```

The correct VibeBoard boot evidence is:

```text
Project name:     vibeboard_runtime
Partition Table:
factory app offset 0x10000
VibeBoard Runtime ready: sd=ok apps=22 launcher=ok
runtime sta got ip 192.168.1.32
```

After full erase+flash, HTTP launch checks passed for the migrated schema v2 apps:

```text
npm run launch:app -- http://192.168.1.32:8080 nixie_clock
GET /status -> {"state":"running","current_app":"nixie_clock","last_status":"ESP_OK"}

npm run launch:app -- http://192.168.1.32:8080 matrix_rain
GET /status -> {"state":"running","current_app":"matrix_rain","last_status":"ESP_OK"}

npm run launch:app -- http://192.168.1.32:8080 clock
GET /status -> {"state":"running","current_app":"clock","last_status":"ESP_OK"}

npm run launch:app -- http://192.168.1.32:8080 conway_life
GET /status -> {"state":"running","current_app":"conway_life","last_status":"ESP_OK"}

npm run launch:app -- http://192.168.1.32:8080 fluid_pendant
GET /status -> {"state":"running","current_app":"fluid_pendant","last_status":"ESP_OK"}
```

One switch path exposed a lifecycle timing issue:

```text
conway_life -> fluid_pendant
Launch fluid_pendant failed after 3 attempts: 500 app stop timeout
```

Root cause: `conway_life` stopped successfully, but its heavier canvas/timer cleanup could exceed the hard-coded 1500 ms stop wait used by HTTP `/launch`, `/stop`, and the native Launcher. The runner later reported idle with `last_message:"stopped"`, so this was a timeout window problem rather than an app crash.

Runtime fix:

```text
app_runner.h defines VB_APP_RUNNER_STOP_TIMEOUT_MS 5000.
install_service.c uses VB_APP_RUNNER_STOP_TIMEOUT_MS for switch and stop waits.
launcher_ui.c uses VB_APP_RUNNER_STOP_TIMEOUT_MS for screen launch/stop waits.
```

Verification after rebuild and full erase+flash:

```text
npm run test:firmware-static
idf.py build
idf.py -p /dev/cu.usbmodem112301 erase-flash flash
npm run launch:app -- http://192.168.1.32:8080 conway_life
npm run launch:app -- http://192.168.1.32:8080 fluid_pendant
launched fluid_pendant
GET /status -> {"state":"running","current_app":"fluid_pendant","last_status":"ESP_OK"}
```

Result: migrated app HTTP lifecycle verification is now green for `nixie_clock`, `matrix_rain`, `clock`, `conway_life`, and `fluid_pendant`. Manual physical screen inspection is still useful for visual quality, but the Runtime launch/switch/status path is verified.

Earlier in this session the board had booted the user's other ESP32 firmware:

```text
Project name: esp32s3_device
Loaded app from partition at offset 0x1a0000
```

That is expected for the shared board workflow. At the end of this session the board is temporarily flashed with VibeBoard Runtime and is running `2048`, but the next VibeBoard hardware session should still first check the current firmware because the same board may be reflashed back to the user's other project.

```text
GET /status
GET /apps JSON parse
npm run upload:app -- http://192.168.1.32:8080 dist/apps/2048 2048
POST /launch?app=2048
quick 2048 screen/input/double-exit regression if firmware changed
```

### smoke_key input smoke verification

Date: 2026-06-19

Commands:

```text
npm run device:check
npm run package:app -- apps/smoke_key
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_key smoke_key
npm run launch:app -- http://192.168.1.32:8080 smoke_key
GET /status -> {"state":"running","current_app":"smoke_key","last_status":"ESP_OK"}
```

Board status:

```text
/dev/cu.usbmodem112301 identified as ESP32-S3
HTTP /status reachable: yes
VibeBoard Runtime: yes
app_count=23
current_app=smoke_key
last_status=ESP_OK
```

Serial monitor evidence after launching `smoke_key`:

```text
app_runner: smoke key start
app_runner: smoke key ok
app_runner: smoke key event LEFT type=1 ...
app_runner: smoke key event RIGHT type=1 ...
app_runner: smoke key event LEFT type=1 ...
app_runner: smoke key event RIGHT type=1 ...
```

Result: software `key.push()` dispatch is board-verified through the Lua `key.on` callback and serial event logs. The first run exposed a smoke-app labeling bug: `apps/smoke_key/main.lua` mapped `[key.START] = "START"` even though `key.START` is an event type and its value collides with the `LEFT` key code. The app now only maps key codes to names, and `tools/firmware-static-check/test.mjs` prevents that `key.START` name-table regression.

Pending manual screen check: physical touch swipes should still be observed on the device screen and recorded separately to confirm the same label updates for LEFT, RIGHT, UP, and DOWN gestures outside the existing `2048` gameplay evidence.

### Migrated app HTTP lifecycle regression

Date: 2026-06-19

Preflight:

```text
GET /status -> {"state":"running","current_app":"smoke_key","last_status":"ESP_OK","app_count":23}
GET /apps -> compatible schema v2 apps include 2048, matrix_rain, nixie_clock, clock, conway_life, fluid_pendant, smoke_key
```

The sandboxed `npm run device:check` could not open local serial ports in this environment and reported serial `Operation not permitted`, but HTTP status and app listing were reachable and identified VibeBoard Runtime at `192.168.1.32:8080`.

HTTP launch/status checks:

```text
npm run launch:app -- http://192.168.1.32:8080 matrix_rain
GET /status -> {"state":"running","current_app":"matrix_rain","last_status":"ESP_OK"}

npm run launch:app -- http://192.168.1.32:8080 nixie_clock
GET /status -> {"state":"running","current_app":"nixie_clock","last_status":"ESP_OK"}

npm run launch:app -- http://192.168.1.32:8080 clock
GET /status -> {"state":"running","current_app":"clock","last_status":"ESP_OK"}

npm run launch:app -- http://192.168.1.32:8080 conway_life
GET /status -> {"state":"running","current_app":"conway_life","last_status":"ESP_OK"}

npm run launch:app -- http://192.168.1.32:8080 fluid_pendant
GET /status -> {"state":"running","current_app":"fluid_pendant","last_status":"ESP_OK"}

npm run launch:app -- http://192.168.1.32:8080 2048
GET /status -> {"state":"running","current_app":"2048","last_status":"ESP_OK"}
```

Result: the migrated schema v2 apps still pass HTTP lifecycle switching, including the previously risky `conway_life -> fluid_pendant` path. Manual physical screen QA remains pending for visual details such as black screen, overlap, asset visibility, animation quality, and launcher switch-away behavior.

### Runtime WiFi/NVS memory recovery and status JSON verification

Date: 2026-06-21

The shared ESP32-S3 board was connected as `/dev/cu.usbmodem112301` and identified as the VibeBoard test board:

```text
Chip is ESP32-S3 (QFN56) (revision v0.2)
Features: WiFi, BLE, Embedded PSRAM 8MB (AP_3v3)
MAC: 10:51:db:80:e2:e8
```

Initial Runtime reflashes exposed a boot-time WiFi regression. Serial logs showed runtime WiFi autoconnect could read `/sdcard/runtime/wifi.json`, but failed before `esp_netif_init()`:

```text
I runtime_wifi: runtime WiFi autoconnect using /sdcard/runtime/wifi.json
I runtime_wifi: wifi ensure_nvs before internal_free=86988 internal_largest=57344
W runtime_wifi: ensure_nvs failed: ESP_ERR_NO_MEM
W vibeboard_runtime: runtime WiFi unavailable: ESP_ERR_NO_MEM
```

Moving NVS earlier and enabling `CONFIG_NVS_ALLOCATE_CACHE_IN_SPIRAM=y` did not fix it. The board still had only a 57 KB largest internal block, and `nvs_flash_init()` returned `ESP_ERR_NO_MEM` before SD/display/app registry initialization.

Runtime fix:

```text
# CONFIG_ESP_WIFI_NVS_ENABLED is not set
# CONFIG_ESP_PHY_CALIBRATION_AND_DATA_STORAGE is not set
CONFIG_ESP_PHY_RF_CAL_FULL=y
CONFIG_ESP_PHY_CALIBRATION_MODE=2
CONFIG_SPIRAM_TRY_ALLOCATE_WIFI_LWIP=y
CONFIG_NVS_ALLOCATE_CACHE_IN_SPIRAM=y
```

The Runtime reads WiFi credentials from SD and does not need WiFi settings persisted in NVS. Disabling PHY calibration storage trades a full calibration at boot for avoiding NVS allocation pressure. `vb_runtime_wifi_prepare()` and `vb_runtime_wifi_ensure_netif()` now treat NVS as already satisfied when both WiFi NVS and PHY calibration storage are disabled.

Board verification after rebuild and flash:

```text
I runtime_wifi: wifi prepare_nvs before internal_free=89972 internal_largest=59392
I runtime_wifi: wifi prepare_nvs after internal_free=89972 internal_largest=59392
I runtime_wifi: runtime WiFi autoconnect using /sdcard/runtime/wifi.json
I runtime_wifi: wifi init after internal_free=46100 internal_largest=36864
I wifi:config NVS flash: disabled
I wifi_init: WiFi/LWIP prefer SPIRAM
I runtime_wifi: wifi start after internal_free=45584 internal_largest=36864
I runtime_wifi: runtime sta got ip 192.168.1.32
```

The same pass also fixed `/status` JSON. `native_abi_version` was previously emitted without quotes, which made `npm run device:check` report `status response was not JSON` even though HTTP returned 200. The status response now parses correctly:

```text
curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":24,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":"","runtime_version":"0.1.0","lua_api_version":"0.1.0","lvgl_api_version":"0.1.0","package_schema":"vibeboard-runtime-app-package@2","native_abi_version":"vibeboard-native-module-abi@1","last_status":"ESP_OK","last_message":""}
```

Final device check:

```text
npm run device:check
HTTP /status reachable: yes (200)
VibeBoard Runtime: yes
Runtime note: status JSON exposes VibeBoard Runtime metadata
```

Result: runtime WiFi autoconnect is restored on the shared board, the install service is reachable at `192.168.1.32:8080`, and `device:check` can identify the board as VibeBoard Runtime again. The board is temporarily flashed with VibeBoard Runtime at the end of this pass, but future sessions must still start with `npm run device:check` because the user may reflash this ESP32-S3 for other projects.

### Lua app manager handoff and HTTP runtime stability

Date: 2026-06-21

This pass fixed the remaining Lua app manager board path after `smoke_app_manager` exposed two runtime issues:

- app manager `app.list()`/`app.rescan()` originally rescanned SD from inside the active Lua app, which could trigger SDMMC allocation failures while WiFi/LVGL/Lua were active;
- HTTP launches originally handed Lua apps a single-app registry, so `app.launch("smoke_key")` from `smoke_app_manager` could not find `smoke_key`;
- after handoff, `/status` and `/stop` initially reset connections because the default Lua allocator consumed too much internal RAM while WiFi/LwIP/httpd still needed internal buffers.

Runtime fixes:

```text
Lua app scripts are preloaded before the Lua task starts.
Lua runner tasks use a 48 KB PSRAM-capable stack.
Lua app manager list/rescan reads the cached registry snapshot instead of scanning SD inside the Lua task.
HTTP /launch passes the full registry snapshot plus selected app index into the async runner.
The selected entry still populates first_app_name/dir/path so app-local files and LVGL assets resolve against the running app.
Lua VM allocations now use a PSRAM-backed allocator via lua_newstate(lua_psram_alloc, NULL, 0).
HTTPD task stack allocation is kept on the default internal-memory path.
```

Board verification:

```text
curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":25,"state":"idle","running":false,...}

curl -s -X POST 'http://192.168.1.32:8080/launch?app=smoke_app_manager'
{"ok":true,"launched":"smoke_app_manager"}
```

Serial evidence during the handoff:

```text
app_runner: [smoke_app_manager] count: 25 | rescan: 25 | state: running | id: smoke_app_manager ...
app_runner: [smoke_app_manager] app.launch("smoke_key") true
app_runner: Lua app handoff: smoke_key
app_runner: Lua async launch: smoke_key
app_runner: Lua app start: smoke_key
app_runner: smoke key start
app_runner: smoke key ok
```

HTTP evidence after the handoff:

```text
curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":25,"state":"running","running":true,"current_app":"smoke_key","last_status":"ESP_OK","last_message":""}

curl -s -X POST http://192.168.1.32:8080/stop
{"ok":true,"stopped":true}

curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":25,"state":"idle","running":false,"current_app":"","last_status":"ESP_ERR_INVALID_STATE","last_message":"stopped"}
```

Result: `apps/smoke_app_manager` is board-verified for cached `app.list()`/`app.rescan()`, software HOME event handling, `app.launch("smoke_key")`, non-reentrant app-to-app handoff, and keeping the HTTP install/status service responsive while the handed-off Lua app is running. Physical BOOT-to-Lua HOME forwarding still needs a manual button smoke; this pass verified the same Lua HOME path through software injection.

### HTTP key injection smoke hook

Date: 2026-06-22

This pass added a narrow HTTP smoke hook for active Lua apps:

```text
POST /input/key?code=<LEFT|RIGHT|UP|DOWN|HOME|EXIT|START>&event=<SHORT|LONG_START|LONG_REPEAT|LONG_END>
```

The handler accepts only named key codes/events, calls `vb_app_runner_enqueue_key(code, event)`, and does not call Lua from the HTTPD task. The goal is repeatable board automation for app input paths such as `smoke_key` and `voice_ai`, not a general remote-control API.

Verification sequence:

```text
npm run test:firmware-static
idf.py build
idf.py -p /dev/cu.usbmodem112301 build flash
```

The first non-escalated flash attempt failed with macOS serial permission `Operation not permitted`; the escalated flash succeeded. `esptool.py` identified the board as ESP32-S3, MAC `10:51:db:80:e2:e8`, wrote bootloader/app/partition table, and verified hashes. The final build generated `vibeboard_runtime.bin` size `0x1867c0`, with 62% free in the 4 MB app partition.

Board evidence:

```text
curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":26,"state":"idle","running":false,"last_status":"ESP_OK","last_message":""}

curl -s -i -X POST 'http://192.168.1.32:8080/input/key?code=HOME&event=SHORT'
HTTP/1.1 400 Bad Request
no active app

curl -s -X POST 'http://192.168.1.32:8080/launch?app=smoke_key'
{"ok":true,"launched":"smoke_key"}

curl -s -X POST 'http://192.168.1.32:8080/input/key?code=LEFT&event=SHORT'
{"ok":true,"injected":{"code":"LEFT","event":"SHORT"}}

curl -s -X POST 'http://192.168.1.32:8080/input/key?code=HOME&event=SHORT'
{"ok":true,"injected":{"code":"HOME","event":"SHORT"}}

curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":26,"state":"idle","running":false,"current_app":"","last_status":"ESP_ERR_INVALID_STATE","last_message":"stopped"}
```

### NES native smoke app launch

Date: 2026-06-22

This pass added a repeatable board smoke wrapper for the NES native module path:

```text
npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --interval-ms 300
```

The first run exposed that `smoke_nes` was not installed on the board yet:

```text
POST http://192.168.1.32:8080/launch?app=smoke_nes failed: 404 app not found
```

After packaging and upload:

```text
npm run package:app -- apps/smoke_nes
packaged smoke_nes
output dist/apps/smoke_nes
install /sd/apps/smoke_nes

npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_nes smoke_nes
uploaded smoke_nes/app.info 117 bytes
uploaded smoke_nes/install-notes.txt 196 bytes
uploaded smoke_nes/main.lua 3204 bytes
uploaded smoke_nes/manifest.json 1613 bytes
uploaded smoke_nes/native/nes.vbn 115 bytes
uploaded 5 files
commit ok; confirmed smoke_nes in /apps
```

The NES smoke wrapper then verified launch/status:

```text
npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --interval-ms 300
nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=1

curl -s -X POST http://192.168.1.32:8080/stop
{"ok":true,"stopped":true}

curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":27,"state":"idle","running":false,"current_app":"","last_status":"ESP_ERR_INVALID_STATE","last_message":"stopped"}
```

Result: `apps/smoke_nes` is now installed on the board and can be launched through the Runtime HTTP lifecycle without crashing. This proves the native loader smoke app is board-launchable. It does not prove full NES completion: there is still no legal `/sdcard/nes/smoke.nes` ROM evidence, no observed RGB565 frame output, no audio-output verification, and no native gamepad bridge verification.

### NES native metrics smoke

Date: 2026-06-22

The follow-up NES smoke upgrade made `apps/smoke_nes` write app-local `metrics.json`
with `rom_present`, `started`, `running`, `rendered_frames`, `audio_bytes`, and
`last_error`. The local wrapper now reads the artifact through `/apps/file` and supports
`--require-rom` plus `--require-audio-bytes <n>` for the future legal-ROM pass.

Local verification:

```text
npm run test:nes-smoke
npm run test:firmware-static
npm run package:app -- apps/smoke_nes
```

Board verification without a ROM:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_nes smoke_nes
uploaded smoke_nes/app.info 122 bytes
uploaded smoke_nes/install-notes.txt 196 bytes
uploaded smoke_nes/main.lua 5713 bytes
uploaded smoke_nes/manifest.json 1639 bytes
uploaded smoke_nes/native/nes.vbn 115 bytes
uploaded 5 files
commit ok; confirmed smoke_nes in /apps

npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 8 --interval-ms 500
nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=1 rom=false started=false frames=0 audio=0

curl -s 'http://192.168.1.32:8080/apps/file?app=smoke_nes&path=metrics.json'
{"ok":true,"rom_path":"/sdcard/nes/smoke.nes","rom_present":false,"started":false,"running":false,"status":"no_rom","frames":0,"rendered_frames":0,"display_stream_supported":false,"audio_active":false,"audio_backend":"","audio_bytes":0,"last_error":"open rom failed"}

curl -s -X POST http://192.168.1.32:8080/stop
{"ok":true,"stopped":true}
```

Result: NES smoke is now machine-readable. This pass still proved the no-ROM
loader/error path only; the next NES pass should upload a legal iNES ROM to the
app-local ROM path and run `npm run nes:smoke -- --require-rom` to verify frame
metrics before audio/gamepad work.

### NES legal ROM smoke and LCD ownership

Date: 2026-06-22

The next NES pass diagnosed the user's "keeps restarting" report. Serial logs showed
that the board was not in a panic/watchdog reboot loop after flashing VibeBoard
Runtime. The visible failure was the `smoke_nes` app entering native-core errors as
each missing compatibility layer was exposed.

Changes:

- added `tools/nes-rom-smoke`, exposed as `npm run nes:rom:smoke`, to generate a
  legal mapper-0 iNES smoke ROM and upload it to
  `/sdcard/apps/smoke_nes/roms/smoke.nes`;
- moved `apps/smoke_nes` from `/sdcard/nes/smoke.nes` to the app-local ROM path
  and kept `metrics.json` as the machine-readable artifact;
- implemented TFT-style `setAddrWindow`/`pushPixelsDMA` in `nes_host_v1_shim.c`
  by tracking the active stream window and forwarding row chunks through the
  Runtime rectangle DMA path;
- fixed the NES task stack clamp so requested stacks below 8192 bytes are no
  longer silently expanded to 16 KB; the smoke app now uses
  `task_stack_bytes=6144`;
- set `transfer_rows=1` for the smoke app to avoid internal DMA private TX-buffer
  pressure during the reliable board smoke;
- wrapped direct native LCD writes in `vb_board_draw_rgb565()` with
  `lvgl_port_lock(pdMS_TO_TICKS(100))` / `lvgl_port_unlock()` so NES and LVGL do
  not race the SPI panel;
- added `--require-frame-growth <n>` to `npm run nes:smoke` and changed
  `apps/smoke_nes` to refresh `metrics.json` periodically instead of writing a
  one-shot snapshot;
- after frame-growth smoke exposed a repeatable 12-frame stop, added diagnostic
  logging in `module_host_api.c`; serial showed
  `display push failed owner=nes x=32 y=227 w=256 h=1 err=ESP_ERR_TIMEOUT`;
- added board display takeover/release hooks that call `lvgl_port_stop()` while
  a native display owner streams frames and `lvgl_port_resume()` on release.

Failure progression observed on board:

```text
open rom failed
nes task stack is in PSRAM; rebuild host with internal dynmod task stack
create nes task failed
set display window failed
push display pixels failed
push display pixels failed after 12 frames because LVGL lock timed out
```

Final verification:

```text
npm run test:firmware-static
npm run test:nes-smoke
npm run test:nes-rom-smoke
npm run package:app -- apps/smoke_nes
idf.py -p /dev/cu.usbmodem111301 -b 115200 build flash
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_nes smoke_nes
npm run nes:rom:smoke -- --board http://192.168.1.32:8080
npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 30 --interval-ms 500 --require-rom --require-frame-growth 120 --require-audio-bytes 128
nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=1 rom=true started=true frames=152 frame_growth=142 audio=1024
```

Result: legal-ROM NES startup, short sustained frame rendering, and Lua fallback PCM extraction are now
board-verified. This is not full NES completion yet: hardware audio output, real
gamepad/native input, full `nesgame` UI smoke, and a longer frame-rate/LCD soak
still need dedicated passes.

The next 2026-06-23 pass extended the same legal ROM smoke into a longer soak.
`tools/nes-smoke` now reports metrics samples plus first/last rendered frame counts so
the board evidence is easier to read.

```bash
npm run test:nes-smoke
npm run test:nes-rom-smoke
npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 120 --interval-ms 500 --require-rom --require-frame-growth 1800 --require-audio-bytes 128
```

```text
nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=2 rom=true started=true frames=1835 frame_growth=1809 samples=113 frames=26->1835 audio=1024
```

After the soak, `POST /stop` returned `{"ok":true,"stopped":true}` and `/status`
returned `state=idle,app_count=31`. This upgrades NES display evidence from a short
frame-growth smoke to about 56 seconds of continuous legal-ROM frame rendering with Lua
fallback PCM still active. Longer real-game soak, hardware audio output, real gamepad/native
input, and full `nesgame` UI smoke remain open.

The next 2026-06-23 hardware pass investigated the user's report that the board was
"一直在重启" after NES testing. `/status` was briefly reachable, but serial capture showed
the real failure mode:

```text
E task_wdt: Task watchdog got triggered.
E task_wdt:  - IDLE0 (CPU 0)
E task_wdt: CPU 0: nes_core
E task_wdt: CPU 1: nes_apu
```

Symbolicating the backtraces mapped the hot paths to `NesCoreRuntime::taskLoop()` inside
`m_bus->clock()` and `NesCoreRuntime::apuTaskLoop()` inside `bus->cpu.apu.clock()`. The
fix adds `nes_port_yield()` to the NES port layer and calls it after each main frame clock
and each APU batch. `tools/firmware-static-check/test.mjs` now guards this with
`keeps NES core and APU tasks watchdog-friendly during long soaks`.

Verification:

```bash
npm run test:firmware-static -- --test-name-pattern "watchdog-friendly"
npm run test:nes-smoke
idf.py build
idf.py -p /dev/cu.usbmodem111301 build flash
npm run nes:rom:smoke -- --board http://192.168.1.32:8080 --app smoke_nes --path roms/smoke.nes
npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 120 --interval-ms 500 --require-rom --require-frame-growth 1800 --require-audio-bytes 128
```

```text
nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=2 rom=true started=true frames=1816 frame_growth=1804 samples=118 frames=12->1816 audio=1024
```

After `/stop`, `/status` returned `state=idle,app_count=31`. This fixes the observed NES
watchdog reboot loop on the smoke ROM path. It still does not close full NES product work:
hardware audio output, real BLE/Xbox/native gamepad integration, full `nesgame` UI smoke,
and longer real-game soak remain open.

The follow-up 2026-06-23 NES audio pass moved native module audio from the Lua PCM fallback
toward the host I2S path. `lua_i2s` now exposes shared C helpers
`vb_i2s_tx_stream_begin/write/end`, and `nes_host_v1_shim.c` routes
`module_audio_api_t.begin/write/end` through those helpers. `apps/smoke_nes` writes
`audio_requested`, `audio_backend`, and `audio_error` into `metrics.json`, while
`npm run nes:smoke` can require a specific backend with `--require-audio-backend`.

The first board run after flashing the helper reached ROM execution and frame growth, but
failed the host-audio gate:

```text
expected smoke_nes audio_backend host; last metrics ... "audio_requested":true,"audio_active":false,"audio_backend":"none","audio_error":"create nes apu task failed"
```

The first hypothesis, increasing `audio_task_stack_bytes`, kept static tests honest but did
not change the board failure. The root cause was resource placement for the separate
`nes_apu` task: the main NES task must stay on an internal stack because the core checks for
PSRAM stack usage, but the APU task can use a SPIRAM-capable stack. The v1 host shim now wraps
opaque task handles and creates only `nes_apu` with
`xTaskCreatePinnedToCoreWithCaps(..., MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)`, deleting it with
`vTaskDeleteWithCaps`. The main `nes_core` task still uses the original Runtime task API.

Verification:

```bash
npm run test:firmware-static -- --test-name-pattern "native module loader|NES core and APU|NES host audio"
npm run test:nes-smoke
idf.py -p /dev/cu.usbmodem111301 build flash
npm run package:app -- apps/smoke_nes
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_nes smoke_nes
npm run nes:rom:smoke -- --board http://192.168.1.32:8080 --app smoke_nes --path roms/smoke.nes
npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 60 --interval-ms 500 --require-rom --require-frame-growth 120 --require-audio-backend host
```

```text
nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=2 rom=true started=true frames=137 frame_growth=126 samples=10 frames=11->137 audio=0 backend=host audio_error=
```

After the smoke, `POST /stop` returned `{"ok":true,"stopped":true}`. This board-verifies
the NES host audio backend selection and I2S TX write path at the Runtime/native boundary.
It is still not a physical speaker/ES8311 audible-output test.

The next same-day pass moved from `smoke_nes` into the migrated `apps/nesgame` UI. The first
board launch used an older package and failed with:

```text
/sdcard/apps/nesgame/main.lua:705: bad argument #2 to 'lv_obj_align' (number expected, got nil)
```

Root cause: the Runtime exports a smaller LVGL alignment constant set than the upstream app
expected. `apps/nesgame` now defines local fallbacks for `LV_ALIGN_LEFT_MID`,
`LV_ALIGN_RIGHT_MID`, and `LV_ALIGN_TOP_RIGHT`, and avoids `align or LV_ALIGN_CENTER` in the
badge helper. The next package exposed a second Lua ordering issue:

```text
/sdcard/apps/nesgame/main.lua:1087: attempt to call a nil value (global 'update_metrics')
```

Root cause: `render_selector_ui()` was defined before local `update_metrics`, so Lua resolved
that call as a global. The fix predeclares `local update_metrics` before the selector function
and later assigns `update_metrics = function(status_override) ... end`. The final selector issue
was path semantics: `file.listdir()` returns app-sandbox relative string entries, while NES core
opening still needs an absolute `/sdcard/...` ROM path. `nesgame` now scans app-local `roms/`
and maps those entries to `/sdcard/apps/nesgame/roms/<file>` for `nes.start`.

Verification:

```bash
npm run test:firmware-static -- --test-name-pattern "nesgame smokeable"
npm run package:app -- apps/nesgame
npm run upload:app -- http://192.168.1.32:8080 dist/apps/nesgame nesgame
npm run nes:rom:smoke -- --board http://192.168.1.32:8080 --app nesgame --path roms/smoke.nes
curl -s -X POST 'http://192.168.1.32:8080/launch?app=nesgame'
curl -s 'http://192.168.1.32:8080/apps/file?app=nesgame&path=metrics.json'
curl -s -X POST 'http://192.168.1.32:8080/input/key?code=UP&event=LONG_START'
curl -s 'http://192.168.1.32:8080/apps/file?app=nesgame&path=metrics.json'
curl -s -X POST http://192.168.1.32:8080/stop
```

Selector metrics after upload:

```json
{"ok":true,"screen_mode":"select","rom_path":"/sdcard/apps/nesgame/roms/smoke.nes","rom_present":true,"rom_count":1,"selected_index":1,"started":false,"running":false,"status":"empty","frames":0,"rendered_frames":0,"audio_active":false,"audio_backend":"none","audio_bytes":0,"last_error":""}
```

Running metrics after `UP/LONG_START`:

```json
{"ok":true,"screen_mode":"running","rom_path":"/sdcard/apps/nesgame/roms/smoke.nes","rom_present":true,"rom_count":1,"selected_index":1,"started":true,"running":true,"status":"running","frames":433,"rendered_frames":433,"audio_active":false,"audio_backend":"none","audio_bytes":0,"last_error":""}
```

A later poll returned `frames=722`, confirming frame growth in the full `nesgame` app. The app
was stopped cleanly. This closes the first board-level `nesgame` selector-to-ROM smoke. It does
not close hardware audio output (`audio_backend` is still `none` here), real BLE/Xbox/native
gamepad input, physical UX observation, or longer real-game soak.

Follow-up automation: `tools/nesgame-smoke` and `npm run nesgame:smoke` now encode this manual
sequence. The tool uploads the generated legal smoke ROM to `roms/smoke.nes`, launches `nesgame`,
waits for selector metrics with `rom_present=true`, injects `UP/LONG_START`, then requires running
metrics and rendered frame growth. Local verification passed with:

```bash
npm run test:nesgame-smoke
npm run test:firmware-static -- --test-name-pattern "nesgame smokeable"
```

The same tool was then run on the board:

```bash
npm run nesgame:smoke -- --board http://192.168.1.32:8080 --require-frame-growth 120 --metrics-polls 30 --selector-polls 12 --interval-ms 500
```

```text
nesgame smoke ok: nesgame state=running current_app=nesgame rom=/sdcard/apps/nesgame/roms/smoke.nes frames=12->139 frame_growth=127 audio=0 backend=none
```

`POST /stop` returned `{"ok":true,"stopped":true}` and `/status` returned `state=idle`.
This confirms the automation covers the same selector-to-ROM path. It still reports
`backend=none`, so hardware audio output remains open.

Voice AI smoke:

```text
node desktop-bridge/server.mjs --host 0.0.0.0 --port 8790 --provider mock
curl -s -X POST 'http://192.168.1.32:8080/launch?app=voice_ai'
{"ok":true,"launched":"voice_ai"}
curl -s -X POST 'http://192.168.1.32:8080/input/key?code=HOME&event=SHORT'
{"ok":true,"injected":{"code":"HOME","event":"SHORT"}}
curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":26,"state":"running","running":true,"current_app":"voice_ai","last_status":"ESP_OK","last_message":""}
```

This earlier smoke only verified that the active Lua key path and `voice_ai` HOME short-press entry did not crash. A later Voice AI smoke in this document verified mock bridge audio upload and reply with 2048 bytes of PCM. GIF visual verification and production STT/LLM provider work remain pending. The pass ended by stopping `voice_ai` and stopping the local mock bridge.

Follow-up automation tool smoke:

```text
npm run input:smoke -- --board http://192.168.1.32:8080 --app smoke_key --key LEFT:SHORT --key HOME:SHORT --expect-state idle --delay-ms 100
input smoke ok: smoke_key 2 keys final=idle

npm run input:smoke -- --board http://192.168.1.32:8080 --app voice_ai --key HOME:SHORT --expect-state running --delay-ms 100
input smoke ok: voice_ai 1 keys final=running
```

The first non-escalated `input:smoke` board run was blocked by the local sandbox with `connect EPERM 192.168.1.32:8080`; rerunning with network permission succeeded. The board ended idle:

```text
curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":26,"state":"idle","running":false,"current_app":"","last_status":"ESP_ERR_INVALID_STATE","last_message":"stopped"}
```

## 2026-06-22 registry cache hardening after gamepad smoke

During the gamepad metrics smoke pass, the board briefly entered a bad app-registry state:

```text
GET /status -> {"sd":true,"app_count":0,"first_app":"-","state":"idle",...}
GET /apps -> {"apps":[]}
POST /rescan -> ESP_ERR_NOT_FOUND
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_gamepad smoke_gamepad
Commit smoke_gamepad failed after 3 attempts: 500 commit failed
```

Root cause: `vb_app_registry_scan()` cleared the live `vb_app_registry_result_t` before
confirming that `opendir("/sdcard/apps")` succeeded. A transient scan failure could therefore
erase the cached HTTP `/apps` view even though the SD card and app directories were still
valid. The first fix used a stack-local `vb_app_registry_result_t next`; that boot-looped the
board because the 32-entry registry is too large for the startup task stack.

Final fix:

- allocate the temporary scan result from PSRAM/heap with an 8-bit heap fallback;
- leave the live registry untouched on `opendir` failure or allocation failure;
- copy the temporary result into the live registry only after a successful scan;
- add a static guardrail to prevent returning to a stack-local registry buffer.

Verification:

```text
npm run test:firmware-static
idf.py build
idf.py -p /dev/cu.usbmodem111301 -b 115200 flash
```

The normal 460800 baud flash attempt failed while the bad firmware was rebooting:

```text
termios.error: (6, 'Device not configured')
```

Retrying at 115200 baud succeeded. After the fixed flash:

```text
curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":31,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":"","last_status":"ESP_OK","last_message":""}

curl -s -X POST http://192.168.1.32:8080/rescan
{"ok":true,"app_count":31}
```

`npm run gamepad:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-delay-ms 3000 --metrics-polls 16 --interval-ms 500 --require-updates 2 --require-connected --require-xbox`
timed out waiting for the `/launch` response, but the app did launch:

```text
curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":31,"state":"running","running":true,"current_app":"smoke_gamepad","last_status":"ESP_OK","last_message":""}

curl -s 'http://192.168.1.32:8080/apps/file?app=smoke_gamepad&path=metrics.json'
{"ok":true,"tag":"update","started":true,"connected":true,"xbox_seen":true,"updates":14,...}
```

After stopping the app, registry remained healthy:

```text
curl -s -X POST http://192.168.1.32:8080/stop
{"ok":true,"stopped":true}

curl -s http://192.168.1.32:8080/status
{"sd":true,"app_count":31,"state":"idle","running":false,"current_app":"","last_status":"ESP_ERR_INVALID_STATE","last_message":"stopped"}

curl -s -X POST http://192.168.1.32:8080/rescan
{"ok":true,"app_count":31}
```

Follow-up: `/launch` should respond before heavy app startup can exceed the uploader/smoke
client timeout. The timeout is now documented as an HTTP lifecycle responsiveness issue, not
as a failed gamepad metrics path.

## 2026-06-22 deferred HTTP launch response fix

The board was observed with the USB serial port still present but HTTP requests timing out:

```text
/dev/cu.usbmodem111301
curl -sS --max-time 3 http://192.168.1.32:8080/status
curl: (28) Operation timed out after 3002 milliseconds with 0 out of 364 bytes received
```

Root cause from the previous smoke: `/launch` called `vb_app_runner_launch_async_from_registry(...)`
before sending its HTTP response. That path reserves runner state, allocates/copies the registry,
preloads the Lua script from SD, and creates the high-priority Lua app task. Heavy app startup can
therefore run before the HTTPD task has finished responding, producing a client timeout even though
the app eventually starts.

Fix:

- add a heap-backed deferred launch job in `install_service.c`;
- keep `/launch` validation, app lookup, compatibility rejection, and controlled stop/switch in the
  handler;
- queue `launch_deferred_task`, return `{"ok":true,"launched":...}` from the HTTP handler, then let
  the background task call `vb_app_runner_launch_async_from_registry(...)` after a short scheduler
  delay;
- record deferred launch failure through `vb_app_runner_note_launch_failure(...)`.

Verification:

```text
npm run test:firmware-static
idf.py build
idf.py -p /dev/cu.usbmodem111301 -b 115200 flash
curl -sS --max-time 5 http://192.168.1.32:8080/status
{"sd":true,"app_count":31,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":"","runtime_version":"0.1.0","lua_api_version":"0.1.0","lvgl_api_version":"0.1.0","package_schema":"vibeboard-runtime-app-package@2","native_abi_version":"vibeboard-native-module-abi@1","last_status":"ESP_OK","last_message":""}
```

The same command that previously timed out now succeeds:

```text
npm run gamepad:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-delay-ms 3000 --metrics-polls 16 --interval-ms 500 --require-updates 2 --require-connected --require-xbox
gamepad smoke ok: smoke_gamepad state=running current_app=smoke_gamepad polls=1 connected=true updates=5 xbox=true buttons=256
```

Final board state:

```text
curl -sS --max-time 5 -X POST http://192.168.1.32:8080/stop
{"ok":true,"stopped":true}

curl -sS --max-time 5 http://192.168.1.32:8080/status
{"sd":true,"app_count":31,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":"","runtime_version":"0.1.0","lua_api_version":"0.1.0","lvgl_api_version":"0.1.0","package_schema":"vibeboard-runtime-app-package@2","native_abi_version":"vibeboard-native-module-abi@1","last_status":"ESP_ERR_INVALID_STATE","last_message":"stopped"}
```

Result: the `/launch` responsiveness issue is fixed for the heavy `smoke_gamepad` metrics path, and
the board ended idle with the app registry still intact at 31 apps. Remaining input work is real
BLE/Xbox discovery, physical BOOT forwarding smoke, hardware-origin long press repeat, and native
gamepad host integration.

## 2026-06-23 HTTP gamepad injection smoke

The board had been used by other firmware again, so the first preflight saw USB but no Runtime HTTP:

```text
npm run device:check -- http://192.168.1.32:8080
Candidate serial ports:
  /dev/cu.usbmodem111301
    ESP32-S3: yes
HTTP /status reachable: no
HTTP note: timed out after 5000ms
```

The current Runtime build was checked before flashing:

```text
npm run test:gamepad-smoke
# pass 5

npm run test:firmware-static -- --test-name-pattern "gamepad"
# pass 75

idf.py build
Generated build/vibeboard_runtime.bin
vibeboard_runtime.bin binary size 0x187740 bytes. Smallest app partition is 0x400000 bytes. 0x2788c0 bytes (62%) free.
```

Then the current firmware was flashed to the shared board:

```text
idf.py -p /dev/cu.usbmodem111301 build flash
Chip is ESP32-S3 (QFN56) (revision v0.2)
MAC: 10:51:db:80:e2:e8
Hash of data verified.
Hard resetting via RTS pin...
Done
```

After reset, standalone Runtime HTTP status was healthy:

```text
curl -s --max-time 5 http://192.168.1.32:8080/status
{"sd":true,"app_count":32,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":"","runtime_version":"0.1.0","lua_api_version":"0.1.0","lvgl_api_version":"0.1.0","package_schema":"vibeboard-runtime-app-package@2","native_abi_version":"vibeboard-native-module-abi@1","last_status":"ESP_OK","last_message":""}
```

Note: a second `npm run device:check` immediately after this reported HTTP timeout even though
standalone `curl /status` worked before and after. The likely cause is the esptool chip probe
resetting the USB/JTAG serial port during the device-check flow. Treat `device:check` as a
non-destructive board identity preflight; use standalone `/status` and the targeted smoke command
as the Runtime availability proof after any reset window.

The new `/input/gamepad` smoke hook was then verified through `smoke_gamepad`:

```text
npm run gamepad:smoke -- --board http://192.168.1.32:8080 --inject-gamepad --require-updates 1 --require-connected --require-xbox --metrics-polls 12 --polls 12 --interval-ms 500
gamepad smoke ok: smoke_gamepad state=running current_app=smoke_gamepad polls=2 connected=true updates=2 xbox=true buttons=256
```

Final board state:

```text
curl -s --max-time 8 http://192.168.1.32:8080/status
{"sd":true,"app_count":32,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":"","runtime_version":"0.1.0","lua_api_version":"0.1.0","lvgl_api_version":"0.1.0","package_schema":"vibeboard-runtime-app-package@2","native_abi_version":"vibeboard-native-module-abi@1","last_status":"ESP_ERR_INVALID_STATE","last_message":"stopped"}
```

Result: current firmware is not stuck in a reboot loop after reflashing Runtime, and synthetic
gamepad events can now be injected through HTTP into the active Lua runner. This still does not
prove real BLE/Xbox discovery or native gamepad host input.

## 2026-06-23 nesgame gamepad injection smoke

`apps/nesgame` was updated so its app-local `metrics.json` includes the last gamepad button mask
seen by the Lua compatibility layer and the NES input mask produced from that state:

```json
{
  "last_gamepad_buttons": 1,
  "last_gamepad_mask": 24
}
```

Local verification:

```text
npm run test:nesgame-smoke
# pass 4

npm run test:firmware-static -- --test-name-pattern "nesgame smokeable"
# pass 75

node tools/app-validator/validate-demo-apps.mjs
ok apps/weather (weather)
ok apps/voice_ai (Voice AI)
ok apps/nesgame (nesgame)
```

The updated app was packaged and uploaded:

```text
npm run package:app -- apps/nesgame
packaged nesgame
output dist/apps/nesgame
install /sd/apps/nesgame

npm run upload:app -- http://192.168.1.32:8080 dist/apps/nesgame nesgame
uploaded 10 files
commit ok; confirmed nesgame in /apps
```

Board smoke used `/input/gamepad` instead of `/input/key` to confirm the selected ROM and then
inject a running dpad/right + A state:

```text
npm run nesgame:smoke -- --board http://192.168.1.32:8080 --inject-gamepad --inject-running-buttons 1 --inject-running-dpad-right --require-frame-growth 120 --metrics-polls 30 --selector-polls 12 --polls 12 --interval-ms 500
nesgame smoke ok: nesgame state=running current_app=nesgame rom=/sdcard/apps/nesgame/roms/smoke.nes frames=12->138 frame_growth=126 audio=0 backend=none gamepad_mask=24
```

The app stopped cleanly:

```text
curl -s --max-time 8 -X POST http://192.168.1.32:8080/stop
{"ok":true,"stopped":true}
```

Result: the migrated `nesgame` can now consume queued Runtime gamepad events, use them to start a
ROM from the selector, and convert a running gamepad state into a NES input mask. This is still a
synthetic HTTP smoke hook; real BLE/Xbox discovery and native gamepad host input remain open.

## 2026-06-23 Voice AI GIF metrics smoke and deferred launch OOM fix

`apps/voice_ai` now writes GIF selection state into `metrics.json`:

```json
{
  "use_gif": true,
  "gif_visible": true,
  "gif_state": "idle",
  "gif_src": "assets/buddy/standby.gif"
}
```

`npm run voice-ai:smoke` gained `--require-gif`, which checks those metrics before it starts the
recording path. Local verification passed:

```text
npm run test:voice-ai-smoke
# pass 5

npm run test:firmware-static -- --test-name-pattern "Voice AI|GIF"
# pass 75

npm run test:firmware-static -- --test-name-pattern "runtime API gaps"
# pass 75

node tools/app-validator/validate-demo-apps.mjs
# pass
```

The first board attempt exposed a new launch-memory failure after uploading the larger `voice_ai`
package with GIF assets and a test `config.json`:

```text
POST http://192.168.1.32:8080/launch?app=voice_ai failed: 500 ESP_ERR_NO_MEM
```

Diagnosis: the deferred launch job itself was already allocated with `heap_caps_calloc(...,
MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)`, but `queue_launch_after_response()` still created
`launch_deferred_task` with ordinary `xTaskCreatePinnedToCore`, so the task stack consumed internal
RAM. The same code also freed heap-caps memory with `free(job)`.

Fix:

- `install_service.c` now creates `launch_deferred_task` with
  `xTaskCreatePinnedToCoreWithCaps(..., MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)`;
- deferred launch job cleanup now uses `heap_caps_free(job)`;
- firmware static tests guard the SPIRAM allocation, SPIRAM-capable task stack, and cleanup path.

Firmware verification and flash:

```text
npm run test:firmware-static -- --test-name-pattern "returns to the native launcher"
# pass 75

npm run test:voice-ai-smoke
# pass 5

idf.py build
# vibeboard_runtime.bin binary size 0x187750; 62% free in the 4 MB app partition

idf.py -p /dev/cu.usbmodem111301 build flash
# flash verified; hard reset completed
```

After reboot, the board returned:

```json
{"sd":true,"app_count":32,"state":"idle","running":false,"current_app":"","last_status":"ESP_OK","last_message":""}
```

The mock bridge was running at `http://192.168.1.26:8790` and the final board smoke passed:

```text
npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1800 --ready-polls 80 --polls 35 --interval-ms 500 --min-audio-bytes 1024 --require-gif
voice-ai smoke ok: audio=4096 chats=0->1 state=running current_app=voice_ai gif=idle reply=我已收到录音：收到 4096 字节音频，约 0.1 秒
```

Result: `voice_ai` now survives the larger GIF-enabled package launch path, exposes enabled visible
GIF metrics, records nonzero PCM through the existing I2S path, uploads to the mock bridge, and
renders the mock reply path without crashing. This is still a machine-readable smoke; production
STT/LLM wrappers, credential/privacy policy, physical GIF animation observation, and hardware audio
output remain open.

2026-06-24 follow-up: the desktop bridge now includes an OpenAI-compatible command wrapper for
production-provider bring-up without changing the ESP32 protocol:

```bash
export OPENAI_API_KEY="..."
export OPENAI_TRANSCRIBE_MODEL="gpt-4o-mini-transcribe"
export OPENAI_REPLY_MODEL="gpt-4.1-mini"
export OPENAI_REPLY_ENDPOINT="responses" # or chat_completions

VOICE_BRIDGE_TRANSCRIBE_COMMAND="npm run -s voice:openai:transcribe" \
VOICE_BRIDGE_REPLY_COMMAND="npm run -s voice:openai:reply" \
node desktop-bridge/server.mjs --host 0.0.0.0 --port 8790 --provider command
```

The transcribe wrapper accepts the existing command-provider `audio_base64` payload, wraps PCM in a
WAV container, and calls `/v1/audio/transcriptions`. The reply wrapper calls `/v1/responses` with
transcript-only input by default, or `/v1/chat/completions` when
`OPENAI_REPLY_ENDPOINT=chat_completions`, and intentionally ignores any `audio_base64` field.
`npm run test:voice-bridge` passes with mocked OpenAI HTTP responses. This is local
provider-boundary evidence only; a real API-key run and a board `voice_ai` smoke through this
provider still remain open.

## 2026-06-24/25 Voice AI command-provider board smoke and display-resource finding

After a board-side registry/VFS inconsistency (`/rescan` returning `ESP_ERR_NOT_FOUND` while
individual `/apps/file` reads still worked), the Runtime firmware was rebuilt and reflashed on the
current enumerated port:

```text
idf.py -p /dev/cu.usbmodem111301 flash
# Hash of data verified.
# Hard resetting via RTS pin...
```

The board came back with the expected app registry:

```json
{"sd":true,"app_count":32,"state":"idle","running":false,"current_app":"","last_status":"ESP_OK","last_message":""}
```

`voice_ai` was re-uploaded successfully with staged commit:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/voice_ai voice_ai
# uploaded 20 files
# commit ok; confirmed voice_ai in /apps
```

The app now avoids writing `metrics.json` at the earliest `load_config` stage; it writes the first
startup metrics only after `init_stage=ready`. A manual launch returned:

```text
curl -s --max-time 20 -X POST 'http://192.168.1.32:8080/launch?app=voice_ai'
{"ok":true,"launched":"voice_ai"}
```

and metrics showed the app had reached ready with GIF resources visible:

```json
{"mode":"idle","init_stage":"ready","bridge_url":"http://192.168.1.26:8790","use_gif":true,"gif_visible":true,"gif_state":"idle","gif_src":"/apps/voice_ai/assets/buddy/idle_0.gif","metrics_error":""}
```

The command-provider board smoke then passed the audio-upload boundary:

```text
npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1800 --ready-polls 120 --polls 35 --interval-ms 500 --min-audio-bytes 1024 --require-gif --require-bridge-provider command
voice-ai smoke ok: audio=6144 chats=0->1 state=running current_app=voice_ai gif=idle reply=
```

Bridge stats after the run:

```json
{"ok":true,"provider":"command","chat_requests":1,"last_audio_bytes":6144,"last_metadata":{"format":"pcm_s16le","sampleRate":16000,"bits":16,"channels":1,"replyLimit":100},"last_transcript":"","last_reply":""}
```

This proves `voice_ai` can record on the board and upload PCM through the non-mock command-provider
boundary. It is not yet a successful real AI reply: with the current test command provider,
`metrics.json` recorded `last_http_code=500` and empty transcript/reply.

The user-provided device photo from the same session showed two separate display-resource issues:
small square boxes are consistent with missing glyphs or `lv_font_load` fallback not covering the
current Chinese text, while the large solid color block is consistent with a failed image/GIF/PNG
decode or an incompatible resource format. The `voice_ai` font and GIF assets were readable through
`/apps/file`, and `voice_ai` metrics proved the idle GIF path was selected, so the next visual QA
slice should instrument font load success, glyph coverage, image decode return values, and physical
screen verification for resource-heavy apps.

2026-06-24 follow-up: the font side of that finding was confirmed in firmware. The Lua LVGL
bindings had two placeholders: `lv_font_load()` always returned `0`, and
`lv_obj_set_style_text_font()` ignored the Lua font argument and always applied `LV_FONT_DEFAULT`.
The binding now resolves SD/app-relative font paths, calls LVGL's real `lv_font_load()`, returns the
font pointer as a Lua integer handle, frees dynamic font handles through `lv_font_free()`, and maps
legacy small numeric font refs such as `10`, `12`, `14`, `16`, and `28` to built-in Montserrat fonts.
`apps/voice_ai` now exposes `font_loaded`, `font_handle`, `font_src`, and `font_error` in
`metrics.json`, and `tools/voice-ai-smoke` can require `--require-font` in addition to
`--require-gif`.

Validation for this display-resource slice:

```text
npm run test:firmware-static -- --test-name-pattern "runtime API gaps|minimal LVGL Lua surface"
npm run test:voice-ai-smoke
idf.py build
idf.py -p /dev/cu.usbmodem111301 flash
node tools/app-uploader/cli.mjs http://192.168.1.32:8080 apps/voice_ai voice_ai
node tools/voice-ai-smoke/index.mjs --board http://192.168.1.32:8080 --bridge http://127.0.0.1:8790 --record-ms 1500 --require-gif --require-font --require-bridge-provider command --min-audio-bytes 1
voice-ai smoke ok: audio=5120 chats=1->2 state=running current_app=voice_ai gif=idle font=loaded reply=
```

The full 175 KB `apps/voice_ai/font/msyh_cn_13.bin` proved too large for the current LVGL/font/SD
memory budget when combined with GIF resources. `voice_ai` was temporarily pointed at the smaller
existing `/sd/apps/weather/font/weather_ui_12.bin` font to keep the app launchable and prove the
font binding path. This is a compatibility compromise, not the final font strategy: larger Chinese
coverage still needs either a smaller generated subset, a PSRAM-capable font allocator strategy, or
lazy per-screen font loading.

2026-06-24/25 follow-up: the remaining app-switch reliability gap was narrowed to LVGL allocation
pressure and fixed in the firmware build. The earlier failure was reproduced as repeated SDMMC read
failures when switching from a resource-heavy app such as `2048` into `voice_ai`:

```text
sdmmc_read_sectors: not enough mem, err=0x101
diskio_sdmmc: sdmmc_read_blocks failed (0x101)
```

In that state `/reboot` could also fail with `ESP_ERR_NO_MEM`; a hard reset/flash restored the
board. Clean-boot `voice_ai` passed, proving the app and bridge path were not the only problem.

Root cause: LVGL custom memory was enabled, but the generated Runtime config still used
`CONFIG_LV_MEM_CUSTOM_INCLUDE="stdlib.h"` and default `malloc/free/realloc`. Display objects,
GIF/font state, and decoder buffers could therefore consume internal RAM and fragment the memory
SDMMC needs for DMA-aligned reads. The firmware now adds `main/lvgl_runtime_alloc.[ch]`; alloc and
realloc prefer `heap_caps_malloc/realloc(..., MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)` and only fall
back to internal `MALLOC_CAP_8BIT`. `main/CMakeLists.txt` injects that source, include directory,
and `LV_MEM_CUSTOM_ALLOC/FREE/REALLOC` definitions into the `lvgl__lvgl` component itself so
`lv_mem.c` resolves the symbols inside the same static library. `sdkconfig.defaults` and the tracked
`sdkconfig` now include `lvgl_runtime_alloc.h` instead of `stdlib.h`.

Validation:

```text
npm run test:firmware-static -- --test-name-pattern "reserves internal DMA memory"
# pass 77

idf.py build
# vibeboard_runtime.bin binary size 0x188b70 bytes. Smallest app partition is 0x400000 bytes. 0x277490 bytes (62%) free.

idf.py -p /dev/cu.usbmodem111301 flash
# Hash of data verified for bootloader, partition table, and vibeboard_runtime.bin.

curl -s http://192.168.1.32:8080/status
# {"sd":true,"app_count":32,...,"state":"idle","last_status":"ESP_OK"}

curl -s -X POST "http://192.168.1.32:8080/launch?app=2048"
curl -s -X POST "http://192.168.1.32:8080/launch?app=voice_ai"
curl -s "http://192.168.1.32:8080/apps/file?app=voice_ai&path=metrics.json"
# font_loaded=true, gif_visible=true, gif_src=/apps/voice_ai/assets/buddy/idle_0.gif

npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1200 --ready-polls 60 --polls 30 --interval-ms 500 --require-gif --require-font --require-bridge-provider command --min-audio-bytes 1
# voice-ai smoke ok: audio=5120 chats=2->3 state=running current_app=voice_ai gif=idle font=loaded reply=

curl -s -X POST http://192.168.1.32:8080/stop
# {"ok":true,"stopped":true}
```

Result: the firmware no longer reproduces the `2048 -> voice_ai` display-resource/SDMMC DMA
failure path after reflashing the shared board. Remaining visual work is physical/photo validation
of resource-heavy apps such as NixieClock, Clock, and Voice AI, plus a final Chinese-font subset
strategy for text that is not covered by the small weather font.

### smoke_key repeat metrics and stopping regression

The next input pass made `smoke_key` repeat behavior machine-readable instead of relying on screen
or serial observation only. Local changes:

- `apps/smoke_key` now declares `capabilities = lvgl,timer,input,file`;
- the app writes `metrics.json` with event counters such as `LEFT:SHORT`, `UP:LONG_REPEAT`, and
  `UP:LONG_END`;
- the self-triggered `UP` repeat now spans timer ticks so `key.repeat_start()` has time to emit
  `LONG_REPEAT` before `key.repeat_stop()`;
- the timer checks `app.exiting()` and stops itself during runner shutdown;
- `npm run input:smoke` now waits for the launched app to become active before injection and can
  require metrics events with `--metrics-polls` and `--require-event`.

Local verification:

```text
npm run test:input-smoke
# pass 7

npm run test:firmware-static -- --test-name-pattern "ships a key input smoke app|input smoke"
# pass 75

node tools/app-validator/validate-demo-apps.mjs
# pass

npm run package:app -- apps/smoke_key
# packaged smoke_key
```

The first board pass exposed a real regression in the old uploaded app:

```text
npm run input:smoke -- --board http://192.168.1.32:8080 --app smoke_key --key LEFT:SHORT --expect-state running --delay-ms 500 --metrics-polls 14 --require-event UP:LONG_REPEAT --require-event UP:LONG_END
# POST /input/key failed: 400 no active app

GET /status
# {"state":"running","current_app":"smoke_key","last_status":"ESP_OK",...}

POST /stop
# timed out

GET /status
# {"state":"stopping","running":true,"current_app":"smoke_key",...}
```

This was not a full board reboot; the old `smoke_key` stayed stuck in runner `stopping`. The board
was recovered through the Runtime reboot endpoint:

```text
POST /reboot
# {"ok":true,"rebooting":true}

GET /status
# {"state":"idle","running":false,"current_app":"","last_status":"ESP_OK",...}
```

After uploading the fixed app:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_key smoke_key
# uploaded 4 files
# commit ok; confirmed smoke_key in /apps

npm run input:smoke -- --board http://192.168.1.32:8080 --app smoke_key --key LEFT:SHORT --expect-state running --delay-ms 500 --metrics-polls 14 --require-event UP:LONG_REPEAT --require-event UP:LONG_END
# input smoke ok: smoke_key 1 keys final=running metrics_count=9

POST /stop
# {"ok":true,"stopped":true}

GET /status
# {"state":"idle","running":false,"current_app":"","last_status":"ESP_ERR_INVALID_STATE","last_message":"stopped",...}
```

Result: timer-backed Lua repeat is now board-verified through machine-readable app metrics, and
`smoke_key` no longer sticks in `stopping` after `/stop`. This still does not replace the remaining
manual physical BOOT-to-Lua HOME and hardware-origin long-press repeat smoke.

## 2026-06-24 PNG/CJK firmware flash and NES native gamepad host smoke

The follow-up display-resource build had already enabled PNG decoding and default SimSun CJK in the
tracked `sdkconfig`, but the previous flash attempt failed to open `/dev/cu.usbmodem111301`. The
non-sandbox ESP-IDF flash path was retried and succeeded:

```text
idf.py -p /dev/cu.usbmodem111301 build flash
# Chip is ESP32-S3 (QFN56), MAC 10:51:db:80:e2:e8
# vibeboard_runtime.bin binary size 0x1b61b0 bytes
# Smallest app partition is 0x400000 bytes. 0x249e50 bytes (57%) free.
# Hash of data verified for bootloader, app, and partition table.

curl -s --max-time 5 http://192.168.1.32:8080/status
# {"sd":true,"app_count":32,"state":"idle","last_status":"ESP_OK",...}
```

This proves the PNG/CJK firmware is flashed and reachable. It does not by itself prove that the
photo-visible resource issue is fixed; that still requires physical screenshots or photos of
`nixie_clock`, `clock`, `weather`, and `voice_ai`.

The same session then upgraded the native gamepad host bridge from build evidence to board evidence.
`smoke_nes` was repackaged and uploaded, and the legal mapper-0 smoke ROM was placed at
`/sdcard/apps/smoke_nes/roms/smoke.nes`:

```text
npm run package:app -- apps/smoke_nes
# packaged smoke_nes

npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_nes smoke_nes
# uploaded 5 files
# commit ok; confirmed smoke_nes in /apps

npm run nes:rom:smoke -- --board http://192.168.1.32:8080 --app smoke_nes --path roms/smoke.nes
# nes smoke rom uploaded: app=smoke_nes path=roms/smoke.nes bytes=24592
```

The first NES launch attempt exposed an unrelated lifecycle problem:

```text
npm run nes:smoke -- ... --require-host-gamepad-mask
# POST /launch?app=smoke_nes failed: 500 app stop timeout

curl -s http://192.168.1.32:8080/status
# {"state":"stopping","running":true,"current_app":"weather",...}

curl -s -X POST http://192.168.1.32:8080/stop
# app stop timeout

curl -s -X POST http://192.168.1.32:8080/reboot
# {"ok":true,"rebooting":true}
```

After rebooting back to `state=idle`, the native gamepad smoke passed:

```text
npm run nes:smoke -- --board http://192.168.1.32:8080 \
  --polls 8 --metrics-polls 60 --interval-ms 500 \
  --require-rom --require-frame-growth 120 \
  --inject-gamepad --inject-buttons 1 --inject-dpad-right \
  --require-host-gamepad-mask

# nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=2 rom=true started=true frames=140 frame_growth=129 samples=10 frames=11->140 audio=0 backend=host host_gamepad=129 audio_error=

curl -s 'http://192.168.1.32:8080/apps/file?app=smoke_nes&path=metrics.json'
# {"host_gamepad_active":true,"host_gamepad_mask":129,"rendered_frames":826,"audio_backend":"host",...}

curl -s -X POST http://192.168.1.32:8080/stop
# {"ok":true,"stopped":true}
```

Result: synthetic HTTP/Lua gamepad state now reaches the native NES host API and the NES core input
mask on hardware. Remaining input work is real BLE/Xbox discovery and physical controller input.
The `weather` stop timeout is now a separately reproduced lifecycle bug and should be diagnosed
before relying on `weather` as a clean app-switch regression case.

## 2026-06-24/25 Weather lifecycle stop diagnosis

The reproduced `weather` lifecycle bug was narrowed with a new stop-aware lifecycle smoke path:

```text
npm run test:lifecycle-smoke
# pass 6/6

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 \
  --app weather --polls 8 --interval-ms 500 \
  --stop --stop-polls 12 --stop-interval-ms 500
# initially failed with: POST /stop failed: 500 app stop timeout
```

Findings and fixes landed locally:

- `tools/lifecycle-smoke` can now launch an app, request `/stop`, and verify final
  `state=idle,current_app=""`.
- `http.cubicserver.get(path, opts, callback)` now accepts `timeout_ms`.
- The old implicit `http://cubicserver.local` fallback was removed from the firmware path; missing
  `/sdcard/runtime/cubicserver.json` now fails fast instead of entering a potentially blocking
  `.local` DNS/HTTP path.
- `apps/weather` now declares `file`, checks `/sd/runtime/cubicserver.json` before requesting
  weather, and reports `Cubic config missing` locally instead of making a doomed network request.
- The runner no longer marks Lua apps `running` at task entry; it marks them `running` only after
  the script has loaded and is about to enter the timer loop, so `/status` no longer claims that a
  heavy app is ready while it is still in startup initialization.
- `VB_APP_RUNNER_STOP_TIMEOUT_MS` was raised from 5000 ms to 15000 ms for heavier migrated apps.

Verification performed:

```text
npm run test:firmware-static
# pass 81/81

npm run test:lifecycle-smoke
# pass 6/6

idf.py build
# vibeboard_runtime.bin binary size 0x1b61c0 bytes
# Smallest app partition is 0x400000 bytes. 0x249e40 bytes (57%) free.

idf.py -p /dev/cu.usbmodem111301 flash
# Hash of data verified for bootloader, app, and partition table.

npm run package:app -- apps/weather
# packaged weather

npm run upload:app -- http://192.168.1.32:8080 dist/apps/weather weather
# uploaded 37 files
# commit ok; confirmed weather in /apps
```

Superseded finding:

This intermediate pass still showed `weather` spending too long in `state=starting` before it reached
the timer loop. During that board run, `lifecycle:smoke -- --app weather --stop` timed out waiting
for `state=running`, and a manual `/stop` request could time out at the HTTP client, but a follow-up
`/status` showed the runner had returned to idle:

```text
curl -s http://192.168.1.32:8080/status
# {"state":"idle","running":false,"current_app":"","last_status":"ESP_OK","last_message":""}
```

That next slice has since landed: `weather` now loads a minimal startup shell, enters the timer loop,
and advances UI, font, and image setup through one `stage_boot` timer. The updated app then passed
both immediate lifecycle smoke and delayed stop on the board, as recorded in the earlier
`2026-06-24/25 Weather Resource Lifecycle Follow-Up` section.

## 2026-06-25 Weather metrics gate follow-up

To make the staged startup checkable without relying only on photos, the local follow-up added a
generic metrics gate to `tools/lifecycle-smoke` and resource-stage metrics to `apps/weather`.

`tools/lifecycle-smoke` now accepts:

```text
--metrics-polls <count>
--metrics-interval-ms <ms>
--require-metrics key=value
```

The tool reads `/apps/file?app=<app>&path=metrics.json` after the target app reaches the expected
runtime state, then polls until all required top-level metrics match.

`apps/weather` now writes `metrics.json` with:

```text
ui_ready
fonts_ready
assets_ready
boot_stage
startup_visible
valid
last_error
forecast_error
```

Local verification performed:

```text
npm run test:lifecycle-smoke
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "defers weather network startup"
# pass 81/81
```

First board pass result:

```text
npm run package:app -- apps/weather
npm run upload:app -- http://192.168.1.32:8080 dist/apps/weather weather
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 200 --require-metrics ui_ready=true --require-metrics fonts_ready=true --require-metrics assets_ready=true --require-metrics boot_stage=3 --stop --stop-polls 35 --stop-interval-ms 500
# failed with last metrics:
# {"ui_ready":true,"fonts_ready":true,"assets_ready":false,"boot_stage":2,"startup_visible":true,"valid":false,"last_error":"","forecast_error":""}
```

After adding observability around the assets stage, the next board pass reached `boot_stage=3` but
stayed at `last_error="assets loading"`, and `/stop` left the Runtime in `state=stopping`. That
proved the assets stage was entering the heavy `init_ui()` rebuild and then blocking inside PNG/image
resource setup instead of throwing a Lua error.

The landed fix keeps `stage_assets()` as a lightweight gate: it marks `assets_ready=true`, hides the
startup shell, writes metrics, and does not call `init_ui()`. Static guardrails now require this shape
so the Weather lifecycle gate cannot regress back into synchronous full-image UI rebuild.

Final board verification:

```text
npm run test:lifecycle-smoke
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "defers weather network startup"
# pass 81/81

npm run package:app -- apps/weather
# packaged weather

npm run upload:app -- http://192.168.1.32:8080 dist/apps/weather weather
# uploaded 37 files
# commit ok; confirmed weather in /apps

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --metrics-polls 30 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics fonts_ready=true --require-metrics assets_ready=true --require-metrics boot_stage=3 --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: weather state=running current_app=weather polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"ui_ready":true,"fonts_ready":true,"assets_ready":true,"boot_stage":3,"startup_visible":false,"valid":false,"last_error":"","forecast_error":""}
```

Follow-up visual asset lazy-loading slice:

The first safe lifecycle fix intentionally removed the full PNG/background/icon rebuild from
`stage_assets()`. That kept Weather stoppable but also meant the visual resource path still had no
machine-readable proof. The follow-up restores a small, bounded visual resource pass:

- `metrics.json` now includes `visual_assets_ready`, `visual_asset_attempts`, and
  `visual_asset_error`;
- `stage_assets()` calls `lazy_load_visual_assets()` but still does not call `init_ui()`;
- the lazy loader creates only the current weather icon plus the precip/humidity/wind small icons;
- the large background PNG remains outside the lifecycle gate because it was the risky path during
  the blocking assets rebuild.

Local verification:

```text
npm run test:lifecycle-smoke
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "defers weather network startup"
# pass 81/81
```

Board verification after uploading the updated Weather package:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --metrics-polls 30 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics fonts_ready=true --require-metrics assets_ready=true --require-metrics visual_assets_ready=true --require-metrics visual_asset_attempts=1 --require-metrics boot_stage=3 --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: weather state=running current_app=weather polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"ui_ready":true,"fonts_ready":true,"assets_ready":true,"visual_assets_ready":true,"visual_asset_attempts":1,"visual_asset_error":"","boot_stage":3,"startup_visible":false,"valid":false,"last_error":"","forecast_error":""}
```

This proves Weather's staged startup, metrics artifact, small-icon lazy load, and clean stop path on
hardware. It does not prove the full PNG background path, because that path remains intentionally
outside the lifecycle gate after it was shown to block the app. Next, do the physical visual QA pass
for `weather`, `nixie_clock`, `clock`, and `voice_ai`:
photograph or screenshot the screen and inspect glyph coverage, PNG decode, resource paths, color
depth, image scale, and GIF/animation behavior.

### 2026-06-25 Weather background PNG follow-up

An additional attempt added `background_ready`, `background_attempts`, and `background_error` metrics
plus a delayed `lazy_load_background()` path for the full Weather background PNG.

Local verification passed:

```text
npm run test:lifecycle-smoke
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "defers weather network startup"
# pass 81/81

npm run package:app -- apps/weather
# packaged weather
```

Board upload passed:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/weather weather
# uploaded 37 files
# commit ok; confirmed weather in /apps
```

Board smoke did not pass the background gate:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --metrics-polls 40 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics fonts_ready=true --require-metrics assets_ready=true --require-metrics visual_assets_ready=true --require-metrics visual_asset_attempts=1 --require-metrics background_ready=true --require-metrics background_attempts=1 --require-metrics boot_stage=3 --stop --stop-polls 35 --stop-interval-ms 500
# failed with last metrics:
# {"ui_ready":true,"fonts_ready":true,"assets_ready":true,"visual_assets_ready":true,"visual_asset_attempts":1,"visual_asset_error":"","background_ready":false,"background_attempts":0,"background_error":"scheduled","boot_stage":3,"startup_visible":false,"valid":false,"last_error":"","forecast_error":""}
```

The board returned to idle after each failed smoke. Evidence pointed away from PNG decode and toward
Lua timer scheduling: the background timer was created and marked `scheduled`, but its callback did not
run before the metrics timeout.

Follow-up in the same session fixed `firmware/vibeboard_runtime/main/lua_tmr.c`:

- timer handles now carry a generation number so reused slots cannot be mutated through stale handles;
- timers created inside callbacks are deferred until a later scheduler pass instead of being consumed
  during the same array walk;
- one-shot timers release their slot and registry callback ref after their callback runs.

The fixed firmware was rebuilt, flashed to `/dev/cu.usbmodem111301`, and Weather was repackaged and
uploaded. A metrics-only background probe then passed:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --metrics-polls 60 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics fonts_ready=true --require-metrics assets_ready=true --require-metrics visual_assets_ready=true --require-metrics background_ready=true --require-metrics background_attempts=1 --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: weather state=running current_app=weather polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"ui_ready":true,"fonts_ready":true,"assets_ready":true,"visual_assets_ready":true,"visual_asset_attempts":1,"visual_asset_error":"","background_ready":true,"background_attempts":1,"background_error":"","boot_stage":3,"startup_visible":false,"valid":false,"last_error":"","forecast_error":""}
```

This closed the timer scheduling blocker at the time. Later sections supersede the remaining
large-background conclusion: direct PNG/image-object loading stayed a negative path, but the
2026-06-25 BMP canvas loader plus larger LVGL task stack closed the Weather background machine gate.

### 2026-06-25 Completion execution baseline

Started the project-completion sweep from
`docs/superpowers/plans/2026-06-25-runtime-completion-execution.md`.

Workspace state remains intentionally dirty with many uncommitted changes from the ongoing Runtime
migration; no unrelated files were reverted. Device identity and runtime health were checked before
continuing hardware verification:

```text
npm run device:check
# Candidate serial ports:
#   /dev/cu.usbmodem111301
#     ESP32-S3: yes
# HTTP /status reachable: yes (200)
# VibeBoard Runtime: yes
```

Runtime status at the start of the sweep:

```json
{"sd":true,"app_count":32,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":"","runtime_version":"0.1.0","lua_api_version":"0.1.0","lvgl_api_version":"0.1.0","package_schema":"vibeboard-runtime-app-package@2","native_abi_version":"vibeboard-native-module-abi@1","last_status":"ESP_OK","last_message":""}
```

This establishes a clean board starting point for the next smoke slice. Physical-only evidence such
as display appearance, speaker output, BOOT button forwarding, touch coordinates, and real BLE/Xbox
input is still not claimed unless separately observed and recorded.

### 2026-06-25 Weather background gate repeat

Task 2 of the completion execution plan repeated the Weather packaging, upload, and metrics-gated
lifecycle smoke after the baseline device check:

```text
npm run package:app -- apps/weather
# packaged weather

npm run upload:app -- http://192.168.1.32:8080 dist/apps/weather weather
# uploaded 37 files
# commit ok; confirmed weather in /apps

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --metrics-polls 60 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics fonts_ready=true --require-metrics assets_ready=true --require-metrics visual_assets_ready=true --require-metrics background_ready=true --require-metrics background_attempts=1 --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: weather state=running current_app=weather polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"ui_ready":true,"fonts_ready":true,"assets_ready":true,"visual_assets_ready":true,"visual_asset_attempts":1,"visual_asset_error":"","background_ready":true,"background_attempts":1,"background_error":"","boot_stage":3,"startup_visible":false,"valid":false,"last_error":"","forecast_error":""}
```

This repeat confirmed the timer/background metrics gate was stable on that firmware and SD package.
It was later superseded by the BMP canvas background closure below, which verifies the visible
large-background metrics path instead of a metrics-only probe.

### 2026-06-25 Resource app lifecycle sweep

Task 3 of the completion execution plan repackaged demos and ran machine lifecycle smoke for migrated
display/resource apps:

```text
npm run package:demos
# weather -> dist/apps/weather
# voice_ai -> dist/apps/voice_ai
# nesgame -> dist/apps/nesgame
# matrix_rain -> dist/apps/matrix_rain
# nixie_clock -> dist/apps/nixie_clock
# clock -> dist/apps/clock
# conway_life -> dist/apps/conway_life
# fluid_pendant -> dist/apps/fluid_pendant
# smoke_app_manager -> dist/apps/smoke_app_manager
# smoke_controls -> dist/apps/smoke_controls
# smoke_gamepad -> dist/apps/smoke_gamepad
# smoke_i2s -> dist/apps/smoke_i2s
# smoke_key -> dist/apps/smoke_key
# smoke_nes -> dist/apps/smoke_nes
# smoke_touch -> dist/apps/smoke_touch
# 2048 -> dist/apps/2048
```

Results:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app matrix_rain --polls 35 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: matrix_rain state=running current_app=matrix_rain polls=8 stop_state=idle stop_current_app= stop_polls=1

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app nixie_clock --polls 35 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500
# initial run hit read ECONNRESET even though /status showed state=running,current_app=nixie_clock
# lifecycle-smoke was fixed to keep polling when launch/status transport briefly resets.
# rerun:
# lifecycle smoke ok: nixie_clock state=running current_app=nixie_clock polls=10 stop_state=idle stop_current_app= stop_polls=1

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app clock --polls 80 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: clock state=running current_app=clock polls=2 stop_state=idle stop_current_app= stop_polls=32

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app conway_life --polls 80 --interval-ms 500 --stop --stop-polls 80 --stop-interval-ms 500
# lifecycle smoke ok: conway_life state=running current_app=conway_life polls=19 stop_state=idle stop_current_app= stop_polls=5

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app fluid_pendant --polls 80 --interval-ms 500 --stop --stop-polls 80 --stop-interval-ms 500
# first run failed with /sdcard/apps/fluid_pendant/main.lua:2065: unsupported app event: imu
# FluidPendant now registers optional app.on("imu", ...) through pcall and only marks the event registered on success.
# upload:
# uploaded 5 files
# commit ok; confirmed fluid_pendant in /apps
# rerun:
# lifecycle smoke ok: fluid_pendant state=running current_app=fluid_pendant polls=6 stop_state=idle stop_current_app= stop_polls=1

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app smoke_controls --polls 80 --interval-ms 500 --stop --stop-polls 80 --stop-interval-ms 500
# lifecycle smoke ok: smoke_controls state=running current_app=smoke_controls polls=2 stop_state=idle stop_current_app= stop_polls=1
```

Local regression checks for this sweep:

```text
npm run test:lifecycle-smoke
# pass 10/10

npm run test:firmware-static -- --test-name-pattern "FluidPendant"
# pass 83/83

git diff --check
# clean
```

This machine-verifies launch/status/stop lifecycle for the selected display/resource apps on the
current board. It does not claim visual quality: PNG decode correctness, glyph coverage, image scale,
canvas appearance, control rendering, and animation smoothness still need direct screen observation or
photos.

### 2026-06-25 Input and app-manager regression sweep

Task 4 of the completion execution plan reran the machine-verifiable input and app-manager paths:

```text
npm run input:smoke -- --board http://192.168.1.32:8080 --app smoke_key --key LEFT:SHORT --expect-state running --delay-ms 500 --metrics-polls 14 --require-event UP:LONG_REPEAT --require-event UP:LONG_END
# input smoke ok: smoke_key 1 keys final=running metrics_count=8

curl -fsS -X POST http://192.168.1.32:8080/stop
# {"ok":true,"stopped":true}

npm run gamepad:smoke -- --board http://192.168.1.32:8080 --inject-gamepad --inject-disconnect --require-updates 2 --require-disconnects 1 --metrics-delay-ms 1000 --metrics-polls 20 --polls 12 --interval-ms 500
# gamepad smoke ok: smoke_gamepad state=running current_app=smoke_gamepad polls=2 connected=true updates=3 disconnects=1 connect_failed=0 xbox=true buttons=256

curl -fsS -X POST http://192.168.1.32:8080/stop
# {"ok":true,"stopped":true}

npm run app-manager:smoke -- --board http://192.168.1.32:8080 --polls 35 --interval-ms 500
# app-manager smoke ok: smoke_app_manager->smoke_key state=running current_app=smoke_key polls=5

curl -fsS -X POST http://192.168.1.32:8080/stop
# {"ok":true,"stopped":true}
```

Final status after the sweep:

```json
{"sd":true,"app_count":32,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":"","runtime_version":"0.1.0","lua_api_version":"0.1.0","lvgl_api_version":"0.1.0","package_schema":"vibeboard-runtime-app-package@2","native_abi_version":"vibeboard-native-module-abi@1","last_status":"ESP_ERR_INVALID_STATE","last_message":"stopped"}
```

This verifies the synthetic HTTP key queue, timer-backed key repeat metrics, synthetic gamepad
connect/update/disconnect metrics, and Lua app-manager handoff path. It still does not prove physical
BOOT-to-Lua HOME forwarding, real touch coordinate display, hardware-origin long repeat, or real
BLE/Xbox input.

### 2026-06-25 NES native host-audio stability sweep

Task 5 of the completion execution plan closed the current machine-verifiable NES stability slice and
found one additional `nesgame` lifecycle bug.

Fixes and diagnostics from this sweep:

- `tools/nes-rom-smoke` now generates a legal mapper-0 smoke ROM that writes NES APU pulse-channel
  registers before looping, so host audio can be measured from real APU output instead of silence.
- `smoke_nes` and the native adapter now expose APU task, sink, and host-write diagnostics:
  `audio_apu_task_present`, `audio_apu_task_started`, `audio_apu_ticks`, `audio_sink_calls`,
  `audio_sink_frames`, `audio_written_bytes`, and `audio_apu_task_ret`.
- The `nes_apu` task still needs a PSRAM-capable stack, but it must be created with
  `tskNO_AFFINITY`. Pinning it to the opposite core produced a handle with `ret=0` while the task
  never entered its entrypoint (`audio_apu_task_started=false`).
- Host I2S writes now tolerate short DMA backpressure and zero-byte write streaks before failing the
  backend, while still counting dropped bytes.
- The APU loop now throttles 256-sample batches by the configured sample-rate cadence; before that it
  could overproduce audio and starve the NES frame task.
- `smoke_nes` now reports host `audio_written_bytes` when host-backend `nes.read_audio()` returns an
  empty Lua fallback string.
- `apps/nesgame` now defers BLE/gamepad startup through a one-shot timer. The previous synchronous
  `gamepad.start()` path could write selector metrics while keeping Runtime `/status` stuck in
  `state=starting`; `/stop` then timed out.

Local checks:

```text
npm run test:firmware-static -- --test-name-pattern "NES core and APU|NES|native module|NES host audio|smoke_nes"
# pass 83/83

npm run test:nes-smoke
# pass 11/11

npm run test:nes-rom-smoke
# pass 3/3

npm run test:nesgame-smoke
# pass 4/4

npm run test:firmware-static -- --test-name-pattern "nesgame smokeable"
# pass 83/83

git diff --check
# clean

source /Users/wq/esp-idf/export.sh >/dev/null && idf.py build
# vibeboard_runtime.bin size 0x1b6650, 57% free

source /Users/wq/esp-idf/export.sh >/dev/null && idf.py -p /dev/cu.usbmodem111301 flash
# app/bootloader/partition hashes verified
```

Board checks:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_nes smoke_nes
# commit ok; confirmed smoke_nes in /apps

npm run nes:rom:smoke -- --board http://192.168.1.32:8080 --app smoke_nes --path roms/smoke.nes
# uploaded legal mapper-0 smoke ROM

npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 30 --metrics-polls 140 --interval-ms 500 --require-rom --require-frame-growth 1600 --require-audio-bytes 128 --require-audio-backend host
# nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=2 rom=true started=true frames=1632 frame_growth=1606 samples=114 frames=26->1632 audio=65024 backend=host host_gamepad=0 audio_error=

curl -fsS -X POST http://192.168.1.32:8080/stop
# {"ok":true,"stopped":true}

npm run i2s:smoke -- --board http://192.168.1.32:8080 --polls 40 --interval-ms 500 --require-write --require-tone-writes 8
# i2s smoke ok: smoke_i2s started=true reads=8 bytes=0 nonzero=0 writes=8 tx_bytes=2048 tone_hz=440 tone_writes=8 error= polls=17

npm run upload:app -- http://192.168.1.32:8080 dist/apps/nesgame nesgame
# commit ok; confirmed nesgame in /apps

curl -fsS -X POST http://192.168.1.32:8080/reboot
# used once to clear the old stuck synchronous nesgame instance

npm run nesgame:smoke -- --board http://192.168.1.32:8080 --require-frame-growth 120 --inject-gamepad
# nesgame smoke ok: nesgame state=running current_app=nesgame rom=/sdcard/apps/nesgame/roms/smoke.nes frames=26->148 frame_growth=122 audio=0 backend=host gamepad_mask=16

curl -fsS -X POST http://192.168.1.32:8080/stop && curl -fsS http://192.168.1.32:8080/status
# {"ok":true,"stopped":true}
# state=idle,current_app="",app_count=32
```

This proves the legal smoke ROM can sustain native NES frame growth with the host audio backend active,
and that stopping NES leaves I2S TX usable for the next app. The pass threshold was adjusted to
`frame_growth >= 1600` for the host-audio run; this is solid sustained execution evidence, but it is
not a claim of full 60fps performance. Remaining NES gaps are physical speaker output, real BLE/Xbox
input instead of HTTP injection, physical screen/UX observation, and longer real-game soaks.

### 2026-06-25 Voice AI and I2S command-provider sweep

Task 6 of the completion execution plan rechecked the audio and Voice AI path after the NES work.

Bridge availability:

```text
curl -fsS http://192.168.1.26:8790/health
# {"ok":true,"service":"vibeboard-voice-bridge","provider":"command"}
```

I2S TX tone smoke:

```text
npm run i2s:smoke -- --board http://192.168.1.32:8080 --polls 20 --interval-ms 500 --require-write --require-tone-writes 8
# i2s smoke ok: smoke_i2s started=true reads=13 bytes=0 nonzero=0 writes=13 tx_bytes=3328 tone_hz=440 tone_writes=13 error= polls=0
```

`tools/i2s-smoke` was hardened during this run. `smoke_i2s` can briefly expose fresh passing
`metrics.json` while `/status` is still `state=starting,current_app=smoke_i2s`; the tool now accepts
fresh satisfying metrics for the target app and uses a longer active wait. Local verification:

```text
npm run test:i2s-smoke
# pass 17/17
```

Voice AI had the same lifecycle pattern in a more serious form: old app code could write
`init_stage=ready`, `gif_visible=true`, and `font_loaded=true` metrics from top-level startup without
returning to the runner timer/input loop, so HTTP HOME injection never reached `key.on` and
`home_events` stayed zero. `apps/voice_ai` now schedules the heavy UI/timer/update/ready work through
a 50 ms one-shot boot timer after config/font/key setup, allowing the runner to mark the app running
and drain input. `tools/voice-ai-smoke` now treats `current_app=voice_ai` plus ready metrics as the
pre-HOME condition, which covers the brief `starting` window without lowering the app readiness gate.

Local checks:

```text
npm run test:voice-ai-smoke
# pass 14/14

npm run test:firmware-static -- --test-name-pattern "tracks migrated app runtime API gaps"
# pass 83/83

npm run package:app -- apps/voice_ai
# packaged voice_ai
```

Board verification:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/voice_ai voice_ai
# uploaded 19 files
# commit ok; confirmed voice_ai in /apps

npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1200 --ready-polls 60 --polls 30 --interval-ms 500 --require-gif --require-font --require-bridge-provider command --min-audio-bytes 1
# voice-ai smoke ok: audio=6144 chats=3->4 state=running current_app=voice_ai gif=idle font=loaded reply=

curl -fsS -X POST http://192.168.1.32:8080/stop && curl -fsS http://192.168.1.32:8080/status
# {"ok":true,"stopped":true}
# state=idle,current_app="",app_count=32
```

This proves the command-provider bridge boundary received fresh PCM from the board and that Voice AI
GIF/font readiness metrics are present before recording. It still does not prove audible ES8311
speaker playback, physical GIF animation quality, real spoken transcript/reply quality, or production
OpenAI credentials: this command-provider run returned an empty transcript/reply and should be treated
as a provider-wrapper completion gap, not a device recording failure.

### 2026-06-25 Deployment and config productization sweep

Task 7 of the completion execution plan verified the browser proxy, interrupted staged upload, and
runtime config write/reboot paths.

The first `device:web:smoke` attempt used `--base http://127.0.0.1:8790`, which was already occupied
by the Voice bridge and returned 404 for `/api/status`. After starting the device web proxy on a
separate port:

```text
npm run device:web -- --board http://192.168.1.32:8080 --host 127.0.0.1 --port 8791
# VibeBoard device UI: http://127.0.0.1:8791
```

the smoke exposed a real productization limit: the board had 32 visible apps, while
`VB_APP_REGISTRY_MAX_APPS` was 32. Uploading `web_ui_smoke` made `/rescan` report `app_count=33`, but
the temporary app was outside the stored `/apps` list, so uploader/web confirmation could not see it.
The registry cap is now 48 and remains heap/PSRAM-backed rather than stack/static DRAM.

Verification:

```text
npm run test:firmware-static -- --test-name-pattern "keeps expanded app registry buffers out of static DRAM|scans the board app directory"
# pass 83/83

source /Users/wq/esp-idf/export.sh >/dev/null && idf.py build
# vibeboard_runtime.bin size 0x1b6660, 57% free

source /Users/wq/esp-idf/export.sh >/dev/null && idf.py -p /dev/cu.usbmodem111301 flash
# app/bootloader/partition hashes verified

npm run device:web:smoke -- --board http://192.168.1.32:8080 --base http://127.0.0.1:8791
# device web smoke ok: launched and deleted web_ui_smoke
```

Staged interrupted upload smoke:

```text
npm run upload:interrupted-smoke -- http://192.168.1.32:8080 interrupted_upload_smoke
# interrupted upload smoke ok: interrupted_upload_smoke absent after abort at main.lua
```

Runtime config write + reboot smoke used inline non-secret I2S JSON because this checkout does not
contain `runtime/i2s.local.json`:

```text
npm run runtime:config:smoke -- --reboot --reboot-polls 45 --reboot-delay-ms 1000 --expect-app-count 32 http://192.168.1.32:8080 i2s '{"bclk_pin":1,"ws_pin":2,"din_pin":3,"dout_pin":4,"mclk_pin":-1,"sample_rate":16000,"bits":16,"channel":2}'
# runtime config smoke ok: i2s state=idle runtime=0.1.0 polls=2
```

Final status:

```json
{"sd":true,"app_count":32,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":"","runtime_version":"0.1.0","lua_api_version":"0.1.0","lvgl_api_version":"0.1.0","package_schema":"vibeboard-runtime-app-package@2","native_abi_version":"vibeboard-native-module-abi@1","last_status":"ESP_OK","last_message":""}
```

Real WiFi credential write/reboot smoke remains unverified only because no fresh local WiFi
credential JSON was provided. The repo contains `apps/smoke_network/wifi.example.json`, which is a
placeholder and was not used for a credential-changing smoke.

### 2026-06-25 Release readiness audit

Task 8 of the completion execution plan ran the release-readiness gate after the deployment/config
sweep and after the 48-entry registry firmware was flashed.

Local checks:

```text
npm run test:firmware-static
# pass 83/83

npm run test:validator
# pass 20/20

npm run test:packager
# pass 8/8

git diff --check
# clean
```

The validator initially failed because `apps/weather/app.info` correctly declares
`capabilities = lvgl,network,timer,input,file`, while the migrated-app capability drift test still
expected the older no-`file` list. The test expectation was updated to match current Weather static
API usage and the declared package metadata.

Firmware build and flash evidence from the final firmware-affecting change:

```text
source /Users/wq/esp-idf/export.sh >/dev/null && idf.py build
# vibeboard_runtime.bin size 0x1b6660, 57% free

source /Users/wq/esp-idf/export.sh >/dev/null && idf.py -p /dev/cu.usbmodem111301 flash
# app/bootloader/partition hashes verified
```

Release artifacts currently present in `firmware/vibeboard_runtime/build/`:

```text
bootloader/bootloader.bin                  20832 bytes
partition_table/partition-table.bin         3072 bytes
vibeboard_runtime.bin                    1795680 bytes
flash_args                                  155 bytes
```

`flash_args`:

```text
--flash_mode dio --flash_freq 80m --flash_size 16MB
0x0 bootloader/bootloader.bin
0x10000 vibeboard_runtime.bin
0x8000 partition_table/partition-table.bin
```

Board status at the end of the audit:

```json
{"sd":true,"app_count":32,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":"","runtime_version":"0.1.0","lua_api_version":"0.1.0","lvgl_api_version":"0.1.0","package_schema":"vibeboard-runtime-app-package@2","native_abi_version":"vibeboard-native-module-abi@1","last_status":"ESP_OK","last_message":""}
```

Complete with machine evidence:

- baseline board check and idle Runtime status on `http://192.168.1.32:8080`;
- Weather staged startup, font/resource/small-icon metrics, 320x240 BMP canvas background gate
  `background_ready=true,background_attempts=1,background_error=""`, and clean stop;
- display/resource app launch/stop lifecycle for `matrix_rain`, `nixie_clock`, `clock`,
  `conway_life`, `fluid_pendant`, and `smoke_controls`;
- synthetic HTTP key repeat metrics, synthetic gamepad connect/update/disconnect metrics, and
  Lua app-manager handoff;
- NES legal ROM upload, sustained native frame growth, APU-to-host-I2S byte counters, I2S reuse
  after NES stop, and `nesgame` selector-to-ROM with synthetic gamepad input;
- I2S sustained TX tone metrics and Voice AI command-provider PCM upload with GIF/font readiness
  and HOME input path;
- device web proxy smoke, interrupted staged upload abort, runtime config write/reboot smoke, and
  48-entry registry cap;
- firmware static guardrails, app validator, packager tests, whitespace check, ESP-IDF build, and
  flashed Runtime metadata.

Complete with physical evidence from earlier bring-up:

- ESP32-S3 boot, PSRAM, LCD/backlight/LVGL, SD mount, native launcher, touch launcher selection, and
  physical BOOT launcher navigation/long-press launch;
- earlier 2048/touch visual path and launcher stop/refresh/failure recovery flows, as recorded in
  the dated bring-up sections above.

Blocked on human observation, external hardware, or credentials:

- final visual QA for resource apps and Weather large background: glyph coverage, PNG/GIF/BMP decode
  quality, image scale, color depth, layout, and animation still need direct screen observation or
  photos;
- ES8311 codec, amplifier, and speaker output still need audible verification;
- real BLE/Xbox controller discovery/input still needs the physical controller path, not HTTP
  injection;
- real Voice AI provider success still needs production credentials/provider wrapper confirmation;
  the command-provider smoke proved PCM upload but returned an empty reply;
- WiFi credential write/reboot smoke needs a real local WiFi config file and was not run with the
  placeholder `wifi.example.json`.

Intentionally deferred scope:

- full dynamic ELF `.so` loading beyond the current static NES adapter and app-local `.vbn`
  manifest;
- complete upstream HoloCubic/Cubic Lua compatibility and full LVGL API coverage;
- longer real-game NES soak, full 60 fps performance claims, and broad third-party ROM
  compatibility;
- production release packaging/signing automation beyond the current ESP-IDF build artifacts and
  documented flash arguments.

### 2026-06-25 Voice AI real-provider local diagnostic

After the release-readiness audit, the local environment was checked without printing secrets:
`OPENAI_API_KEY` and `OPENAI_BASE_URL` were both present, and the configured OpenAI-compatible base
URL responded to `/models`. A short Chinese sample was generated with macOS `say`, converted to
16 kHz mono PCM with `ffmpeg`, and passed through the command-provider one-shot path:

```text
VOICE_BRIDGE_TRANSCRIBE_COMMAND="node desktop-bridge/openai-voice-commands.mjs transcribe" \
VOICE_BRIDGE_REPLY_COMMAND="node desktop-bridge/openai-voice-commands.mjs reply" \
node desktop-bridge/server.mjs --provider command --once-file <tmp>/voice.pcm --sample-rate 16000 --bits 16 --channels 1 --format pcm_s16le --reply-limit 80
```

The run failed before a transcript because the configured compatible service returned:

```text
OpenAI transcription returned non-JSON response: HTTP 404 text/plain: 404 page not found
```

The reply side was probed separately with a plain transcript payload:

```text
OpenAI reply returned non-JSON response: HTTP 502 text/html; charset=UTF-8: <!DOCTYPE html> ...
```

This narrows the real-provider blocker: the current provider/base URL can list models but does not
serve the `/audio/transcriptions` endpoint expected by `desktop-bridge/openai-voice-commands.mjs`,
and its `/responses` path is not currently usable as an OpenAI Responses API compatible endpoint.
The wrapper now reports non-JSON provider responses with HTTP status, content type, and response
preview; the bridge CLI no longer appends usage text to runtime provider failures.

A follow-up reply-only probe showed the same base URL does support `/chat/completions` when using
the model list exposed by that service. `desktop-bridge/openai-voice-commands.mjs` now supports
`OPENAI_REPLY_ENDPOINT=chat_completions`; with `OPENAI_REPLY_MODEL=gpt-5.4-mini`, this local command:

```sh
printf '%s\n' '{"transcript":"你好，请用一句话确认 VibeBoard 语音回复端点可用。","metadata":{"replyLimit":80}}' | \
  OPENAI_REPLY_ENDPOINT=chat_completions \
  OPENAI_REPLY_MODEL=gpt-5.4-mini \
  node desktop-bridge/openai-voice-commands.mjs reply
```

returned:

```json
{"reply":"VibeBoard 语音回复端点可用。","ui_code":""}
```

So the current cloud-provider blocker is now specifically STT/audio transcription: the selected
base URL still returns 404 for `/audio/transcriptions`, preventing a real recorded-audio transcript
plus reply board smoke.

Verification:

```text
npm run test:voice-bridge
# pass 19/19
```

### 2026-06-25 Weather large-background negative probe

After the timer scheduler fix, a narrower Weather experiment tried to make the large background
visible without rebuilding the full UI: `init_ui()` pre-created an empty 320x240 `lv_img`, and the
deferred background path only called `lv_img_set_src(APP.ui.bg_img, asset_path("bg", weather_kind()))`.

The updated package was uploaded and launched with the normal metrics gate. The smoke did not reach
`background_ready=true`; the last metrics were:

```json
{"ui_ready":true,"fonts_ready":true,"assets_ready":true,"visual_assets_ready":true,"visual_asset_attempts":1,"visual_asset_error":"","background_ready":false,"background_attempts":1,"background_error":"loading","boot_stage":3,"startup_visible":false,"valid":false,"last_error":"","forecast_error":""}
```

`POST /stop` then returned the Runtime to `state=idle`, so this did not leave the board wedged. The
failed app change was reverted, the safe Weather package was re-uploaded, and the metrics-only gate
passed again:

```text
lifecycle smoke ok: weather state=running current_app=weather polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"ui_ready":true,"fonts_ready":true,"assets_ready":true,"visual_assets_ready":true,"visual_asset_attempts":1,"visual_asset_error":"","background_ready":true,"background_attempts":1,"background_error":"","boot_stage":3,"startup_visible":false,"valid":false,"last_error":"","forecast_error":""}
```

Conclusion for this negative probe: the Weather background blocker was no longer timer scheduling.
Direct synchronous `lv_img_set_src` on a 320x240 PNG/BMP can block inside the LVGL image/file path.
The next section supersedes this by using a lighter BMP canvas path and increasing the LVGL task
stack.

### 2026-06-25 Weather visible BMP background closure

Follow-up diagnosis converted the Weather backgrounds to explicit 16-bit BMP files so the app could
avoid the blocking full PNG/image-object path. The generated files are:

```text
apps/weather/assets/bg/{cloudy,fog,night,partly,rain,snow,storm,sunny}.bmp
# 320 x 240 x 16, RGB565 little-endian payload, 153666 bytes each
```

The firmware also fixed LVGL's BMP decoder open-success check in
`managed_components/lvgl__lvgl/src/extra/libs/bmp/lv_bmp.c`. A control run with
`apps/smoke_visual` still passed lifecycle smoke, confirming small BMP image-object decoding was not
globally broken.

The first visible Weather implementation still used an image object and stayed at:

```json
{"background_ready":false,"background_attempts":1,"background_error":"loading"}
```

A custom `lv_canvas_load_bmp(canvas, path)` binding then loaded the 320x240 RGB565 BMP into the
static full-screen LVGL canvas buffer. Serial diagnostics showed the loader reached file open,
header read, format validation, and PSRAM allocation before the board reported:

```text
***ERROR*** A stack overflow in task LVGL task has been detected.
```

Root cause: deferred Weather loading runs from the LVGL timer/task context, and the default LVGL task
stack was too small for the file decode path. The landed fix keeps the BMP decode in PSRAM scratch,
takes the LVGL lock only for the final full-screen buffer copy/invalidate, and raises
`lvgl_cfg.task_stack` to 8192.

Firmware build and flash evidence:

```text
source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && idf.py build
# vibeboard_runtime.bin size 0x1b6ae0, 57% free

source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && idf.py -p /dev/cu.usbmodem111301 flash
# bootloader/app/partition table written; hashes verified
```

Hardware preflight and Weather upload:

```text
npm run device:check
# detected ESP32-S3 on /dev/cu.usbmodem111301 and Runtime HTTP at http://192.168.1.32:8080

npm run upload:app -- http://192.168.1.32:8080 apps/weather weather
# uploaded 43 files, including the 8 generated .bmp backgrounds; confirmed weather in /apps
```

Final board smoke:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --metrics-polls 60 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics fonts_ready=true --require-metrics assets_ready=true --require-metrics visual_assets_ready=true --require-metrics visual_asset_attempts=1 --require-metrics background_ready=true --require-metrics background_attempts=1 --require-metrics background_error= --require-metrics boot_stage=3 --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: weather state=running current_app=weather polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"ui_ready":true,"fonts_ready":true,"assets_ready":true,"visual_assets_ready":true,"visual_asset_attempts":1,"visual_asset_error":"","background_ready":true,"background_attempts":1,"background_error":"","boot_stage":3,"startup_visible":false,"valid":false,"last_error":"","forecast_error":""}
```

This closes the Weather large-background machine gate. It still needs direct screen/photo QA for
actual background color, scale, font rendering, and layout quality.

Package-size cleanup repeat:

The old 320x240 PNG backgrounds were no longer referenced after `background_asset_path(kind)` moved
to `.bmp`. They were removed from `apps/weather/assets/bg/`, leaving only the eight BMP backgrounds.
Local package/resource size changed from roughly `2.2M apps/weather/assets` to `1.2M`, and the board
upload dropped from 43 files to 37 files.

Verification after cleanup:

```text
npm run package:app -- apps/weather
# packaged weather

npm run test:validator
# pass 20/20

npm run test:firmware-static -- --test-name-pattern "Weather|BMP|LVGL task stack|tracks migrated app runtime API gaps"
# pass 85/85

npm run device:check
# VibeBoard Runtime reachable on http://192.168.1.32:8080

npm run upload:app -- http://192.168.1.32:8080 dist/apps/weather weather
# uploaded 37 files; confirmed weather in /apps

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --metrics-polls 60 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics fonts_ready=true --require-metrics assets_ready=true --require-metrics visual_assets_ready=true --require-metrics visual_asset_attempts=1 --require-metrics background_ready=true --require-metrics background_attempts=1 --require-metrics background_error= --require-metrics boot_stage=3 --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: weather state=running current_app=weather polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"ui_ready":true,"fonts_ready":true,"assets_ready":true,"visual_assets_ready":true,"visual_asset_attempts":1,"visual_asset_error":"","background_ready":true,"background_attempts":1,"background_error":"","boot_stage":3,"startup_visible":false,"valid":false,"last_error":"","forecast_error":""}
```

### 2026-06-25 development-plan status cleanup

After the Weather background gate closed, the development plan still contained stale backlog language
that treated several already verified slices as future work. The plan was updated to separate
machine-verified work from physical/external blockers:

- Phase 5B Launcher controls, stop/switch/error recovery, and Lua app-manager handoff are recorded as
  verified rather than future work.
- Local `device-web` status/list/launch/stop/rescan/delete and stop-first delete flow are recorded as
  implemented; browser-side local package upload and logs summary remain productization work.
- NES `require("nes")`, legal ROM smoke, app-local selector smoke, host audio bytes, and synthetic
  native gamepad host metrics are recorded as machine evidence; real BLE/Xbox input, speaker output,
  physical UX, and longer soak remain open.
- Voice AI command-provider upload and I2S RX/TX smoke are recorded as machine evidence; real STT,
  ES8311/amp/speaker output, and physical GIF/display checks remain open.

Verification for this documentation/status slice:

```text
npm run test:ai-contract
npm run test:device-web
npm run test:app-manager-smoke
npm run test:nes-smoke
npm run test:nesgame-smoke
git diff --check
```

### 2026-06-25 BTC minimal migration

The next upstream-app slice migrated `upstream/holocubic-apps/BTC` into a minimal Runtime app at
`apps/btc/`. This is intentionally not the full upstream K-line/candlestick UI yet. The first Runtime
slice proves the network/JSON/LVGL/metrics path with a compact BTC/USDT price panel:

- `apps/btc/app.info` declares `capabilities = lvgl,network,timer,file`.
- `apps/btc/main.lua` draws a 320x240 price panel, reads app-local `config.json`, requests
  `/api/v3/ticker/price?symbol=BTCUSDT`, decodes JSON, updates labels, and writes `metrics.json`.
- `tools/app-packager` now includes `apps/btc` in the curated demo/migrated package list.
- `tools/lifecycle-smoke` now accepts lower-bound metric checks such as
  `--require-metrics network_attempts>=1`, and numeric expected values can match numeric strings in
  app JSON metrics.

TDD/local verification:

```text
npm run test:validator
# pass 20/20

npm run test:packager
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "BTC|tracks migrated app runtime API gaps"
# pass 86/86

npm run test:lifecycle-smoke
# pass 12/12

npm run package:app -- apps/btc
# packaged btc; dist/apps/btc contains app.info, config.json, install-notes.txt, main.lua, manifest.json
```

Hardware preflight and upload:

```text
npm run device:check
# ESP32-S3 on /dev/cu.usbmodem111301; Runtime HTTP reachable at http://192.168.1.32:8080

npm run upload:app -- http://192.168.1.32:8080 dist/apps/btc btc
# uploaded 5 files; confirmed btc in /apps
```

The default app config points at Binance:

```json
{"base_url":"https://data-api.binance.vision","symbol":"BTCUSDT"}
```

Board smoke against that default path reached the UI but did not fetch a price:

```text
expected btc metrics ui_ready=true,network_attempts=1,price_ready=true; last metrics {"ui_ready":true,"network_attempts":2,"price_ready":false,"last_status":0,"last_error":"http 0","last_price":"","last_change":"","last_update":""}
```

That is recorded as a real external-network/HTTPS blocker, not an app/UI failure.

For deterministic board proof, a local HTTP mock served:

```json
{"symbol":"BTCUSDT","price":"65432.10"}
```

The app-local config in the uploaded package was temporarily pointed to
`http://192.168.1.26:8792`, then the board smoke passed:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app btc --polls 35 --interval-ms 500 --metrics-polls 40 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics 'network_attempts>=1' --require-metrics price_ready=true --require-metrics last_price=65432.1 --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: btc state=running current_app=btc polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"ui_ready":true,"network_attempts":1,"price_ready":true,"last_status":200,"last_error":"","last_price":"65432.1","last_change":"","last_update":"20:14:47"}
```

After the board smoke, source `apps/btc/config.json` was restored to the default Binance base URL and
`dist/apps/btc` was regenerated. The board may still have the temporary mock-config package until the
next upload. Remaining BTC work: full upstream chart/candlestick/interval UI, real Binance/external
network success on-device, physical screen/photo QA, and longer refresh soak.

### 2026-06-25 Settings minimal migration

The next upstream-app slice migrated a minimal `Settings` app into `apps/settings/`. This deliberately
keeps scope to the Runtime capabilities that are already supported and testable: LVGL labels, key
navigation, timer ticks, and app-local metrics. It does not claim real WiFi mode switching, gamepad
service control, hardware backlight writes, or WebUI route support.

RED checks before implementation:

```text
npm run test:validator
# failed: apps/settings: Missing app.info

npm run test:packager
# failed: App directory does not exist: /Users/wq/vibeboard-runtime-gpl/apps/settings

npm run test:firmware-static -- --test-name-pattern "Settings|BTC"
# failed: apps/settings/app.info should exist
```

Implementation:

- `apps/settings/app.info` declares `capabilities = lvgl,timer,input,file`.
- `apps/settings/main.lua` draws a simple 320x240 settings panel.
- UP/DOWN moves `selected_index`; LEFT/RIGHT adjusts the local `brightness` value when the Display
  row is selected.
- `metrics.json` records `settings_ready`, `ticks`, `selected_index`, `selection_changes`,
  `brightness`, `brightness_changes`, and `last_key`.
- `stop()` unregisters timers and calls `key.off()` so app switching and `/stop` cleanup stay
  explicit.
- `tools/app-packager` includes `apps/settings` in the curated demo/migrated package list.

Local verification:

```text
npm run test:validator
# pass 20/20

npm run test:packager
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "Settings|BTC"
# pass 87/87

npm run package:app -- apps/settings
# packaged settings; output dist/apps/settings; install /sd/apps/settings

npm run package:demos
# includes settings -> dist/apps/settings
```

Hardware preflight and upload:

```text
npm run device:check
# ESP32-S3 on /dev/cu.usbmodem111301; Runtime HTTP reachable at http://192.168.1.32:8080

npm run upload:app -- http://192.168.1.32:8080 dist/apps/settings settings
# uploaded 4 files; commit ok; confirmed settings in /apps
```

Board lifecycle smoke:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app settings --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics settings_ready=true --require-metrics 'ticks>=1' --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: settings state=running current_app=settings polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"settings_ready":true,"ticks":1,"selected_index":1,"selection_changes":0,"brightness":80,"brightness_changes":0,"last_key":""}
```

Board key-injection smoke:

```text
curl -fsS -X POST 'http://192.168.1.32:8080/launch?app=settings'
curl -fsS -X POST 'http://192.168.1.32:8080/input/key?code=DOWN&event=SHORT'
curl -fsS -X POST 'http://192.168.1.32:8080/input/key?code=UP&event=SHORT'
curl -fsS -X POST 'http://192.168.1.32:8080/input/key?code=RIGHT&event=SHORT'
curl -fsS 'http://192.168.1.32:8080/apps/file?app=settings&path=metrics.json'
# {"settings_ready":true,"ticks":1,"selected_index":1,"selection_changes":2,"brightness":85,"brightness_changes":1,"last_key":"RIGHT"}
curl -fsS -X POST 'http://192.168.1.32:8080/stop'
# {"ok":true,"stopped":true}
```

Remaining Settings work: real hardware backlight control, runtime-managed WiFi settings UX, real
gamepad/BLE service controls, any WebUI/settings routes, and physical screen/photo QA.

### 2026-06-25 HW Monitor minimal migration

The next upstream-app slice migrated `upstream/holocubic-apps/hwmon` into a minimal Runtime app at
`apps/hwmon/`. This first slice intentionally excludes the upstream `httpd`/WebUI route surface and
only proves the host metrics fetch path that can run on the current Runtime:

- `apps/hwmon/app.info` declares `capabilities = lvgl,network,timer,file`.
- `apps/hwmon/config.json` defaults to the upstream host monitor URL
  `http://192.168.0.80:8888/api/state`.
- `apps/hwmon/main.lua` draws a compact 320x240 CPU/GPU/MEM panel, reads app-local `config.json`,
  fetches JSON through `http.get`, accepts nested `cpu/gpu/mem` host-monitor fields or flat fields,
  updates labels, and writes `metrics.json`.
- `tools/app-packager` now includes `apps/hwmon` in the curated demo/migrated package list.

RED checks before implementation:

```text
npm run test:validator
# failed: apps/hwmon: Missing app.info

npm run test:packager
# failed: App directory does not exist: /Users/wq/vibeboard-runtime-gpl/apps/hwmon

npm run test:firmware-static -- --test-name-pattern "HW Monitor|Settings|BTC"
# failed: apps/hwmon/app.info should exist
```

Local verification:

```text
npm run test:validator
# pass 20/20

npm run test:packager
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "HW Monitor|Settings|BTC"
# pass 88/88

npm run package:app -- apps/hwmon
# packaged hwmon; output dist/apps/hwmon; install /sd/apps/hwmon

npm run package:demos
# includes hwmon -> dist/apps/hwmon
```

Hardware preflight note:

```text
npm run device:check
# ESP32-S3 was visible on /dev/cu.usbmodem111301, but the immediate HTTP status phase timed out
# after the esptool chip probe. This matches the known reset-window caveat.

for i in 1 2 3 4 5 6 7 8 9 10; do curl --max-time 3 http://192.168.1.32:8080/status; done
# attempt 2 returned Runtime JSON with state=idle, app_count=35
```

Board proof used a temporary local mock server at `http://192.168.1.26:8793/api/state` returning:

```json
{"host":"codex-mock","cpu":{"usage":42,"temp":61},"gpu":{"usage":73,"temp":68},"mem":{"usage":55}}
```

Because package manifests include file hashes, changing `dist/apps/hwmon/config.json` directly was
correctly rejected by the uploader with `Package integrity check failed: config.json sha256 mismatch`.
The board proof therefore temporarily changed source `apps/hwmon/config.json`, regenerated the
package, uploaded it, then restored the source config to the default upstream host URL and regenerated
`dist/apps/hwmon`.

Upload and board smoke:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/hwmon hwmon
# uploaded 5 files; commit ok; confirmed hwmon in /apps

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app hwmon --polls 35 --interval-ms 500 --metrics-polls 30 --metrics-interval-ms 500 --require-metrics hwmon_ready=true --require-metrics online=true --require-metrics 'fetch_attempts>=1' --require-metrics cpu_usage=42 --require-metrics gpu_usage=73 --require-metrics mem_usage=55 --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: hwmon state=running current_app=hwmon polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"hwmon_ready":true,"online":true,"fetch_attempts":1,"last_status":200,"last_error":"","last_host":"codex-mock","cpu_usage":42,"cpu_temp":61,"gpu_usage":73,"gpu_temp":68,"mem_usage":55,"ticks":0}
```

Cleanup:

```text
npm run package:app -- apps/hwmon
npm run package:demos
rg "192\.168\.1\.26:8793|codex-mock" apps/hwmon dist/apps/hwmon -n
# no matches after cleanup
```

Remaining HW Monitor work: run against the real `upstream/holocubic-apps/hwmon/host_monitor.py`
service, add upstream WebUI route/httpd support only if needed, physical screen/photo QA, and longer
refresh/offline recovery soak.

### 2026-06-25 Spectrum minimal synthetic migration

The next upstream-app slice migrated `upstream/holocubic-apps/Spectrum` into a minimal Runtime app at
`apps/spectrum/`. The upstream app wants a `spectrum` audio module plus `lv_canvas_draw_line` /
`lv_canvas_draw_polyline`, but the current Runtime only exposes the canvas rectangle/text/background
surface. This first slice therefore proves the screen/timer/input package path with synthetic bins
and records the real audio/FFT gap explicitly.

RED checks before implementation:

```text
npm run test:validator
# failed: apps/spectrum: Missing app.info

npm run test:packager
# failed: App directory does not exist: /Users/wq/vibeboard-runtime-gpl/apps/spectrum

npm run test:firmware-static -- --test-name-pattern "Spectrum|HW Monitor"
# failed: apps/spectrum/app.info should exist
```

Implementation:

- `apps/spectrum/app.info` declares `capabilities = lvgl,timer,input,file`.
- `apps/spectrum/main.lua` generates `synthetic_bins` on a 40 ms timer, draws bars using
  `lv_canvas_draw_rect`, supports `bars` and `pulse` modes, and writes `metrics.json`.
- LEFT/RIGHT `LONG_START` toggles mode through the existing `key.on` path.
- The static guardrail intentionally forbids `spectrum.*`, `lv_canvas_draw_line`, and
  `lv_canvas_draw_polyline` in this minimal app so it cannot be mistaken for the real audio
  spectrum implementation.
- `tools/app-packager` now includes `apps/spectrum` in the curated demo/migrated package list.

Local verification:

```text
npm run test:validator
# pass 20/20

npm run test:packager
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "Spectrum|HW Monitor"
# pass 89/89

npm run package:app -- apps/spectrum
# packaged spectrum; output dist/apps/spectrum; install /sd/apps/spectrum

npm run package:demos
# includes spectrum -> dist/apps/spectrum
```

Board upload and lifecycle smoke:

```text
curl -fsS --max-time 5 http://192.168.1.32:8080/status
# Runtime reachable, state=idle, app_count=36

npm run upload:app -- http://192.168.1.32:8080 dist/apps/spectrum spectrum
# uploaded 4 files; commit ok; confirmed spectrum in /apps

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app spectrum --allow-starting --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics audio_ready=true --require-metrics band_count=32 --require-metrics 'frames>=3' --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: spectrum state=starting current_app=spectrum polls=1 stop_state=idle stop_current_app= stop_polls=1 metrics={"audio_ready":true,"frames":7,"mode":"bars","mode_changes":0,"last_key":"","band_count":32,"bin_count":32,"audio_reads":6,"audio_bytes":1536,"peak_level":90,"peak_band":1,"peak_hz":90,"capture_error":""}
```

Board key-injection smoke:

```text
curl -fsS -X POST 'http://192.168.1.32:8080/launch?app=spectrum'
# wait until /status reports state=running,current_app=spectrum
curl -fsS -X POST 'http://192.168.1.32:8080/input/key?code=RIGHT&event=LONG_START'
curl -fsS 'http://192.168.1.32:8080/apps/file?app=spectrum&path=metrics.json'
# {"audio_ready":true,"frames":5,"mode":"pulse","mode_changes":1,"last_key":"RIGHT","band_count":32,"bin_count":32,"peak_level":90,"peak_band":1,"capture_error":""}
curl -fsS -X POST 'http://192.168.1.32:8080/stop'
# {"ok":true,"stopped":true}
```

Remaining Spectrum work: physical screen/photo QA, longer animation soak, and any upstream `spectrum`
module or line/polyline bindings only if the visual target still requires them.

### 2026-06-25 Spectrum real-audio follow-up

The Spectrum app now reads real PCM through the existing Lua `i2s` module and computes 32 Goertzel
bands in Lua. `apps/spectrum/app.info` now declares `audio`, the app reports `audio_ready`,
`audio_reads`, `audio_bytes`, `band_levels`, and `band_frequencies` in `metrics.json`, and the
firmware static guardrails now look for the real I2S audio path instead of synthetic bins.

Verification:

```text
npm run test:validator -- --test-name-pattern "Spectrum|audio capability"
npm run test:packager -- --test-name-pattern "curated demo and migrated apps|Spectrum"
npm run test:firmware-static -- --test-name-pattern "Spectrum|audio"
git diff --check
npm run package:app -- apps/spectrum
```

Initial board attempts found two runtime hazards before the final pass:

- `i2s.read(..., 20)` could block the Lua runner, so Spectrum now uses nonblocking
  `I2S_READ_TIMEOUT_MS = 0`.
- Full canvas redraws and later one-object-per-bar LVGL renderers made the app freeze in startup
  render or `tick_bars`, leaving `metrics.json` stuck at `frames=0/1` and `/stop` timing out.
  The verified app keeps the real I2S + Goertzel analyzer path but renders the 32 bands as a
  single LVGL label, avoiding per-frame canvas redraw and per-bar object churn.

Additional verification:

```text
npm run test:firmware-static -- --test-name-pattern "ships Spectrum as a minimal real-audio visualizer migration"
# pass 97/97

npm run package:app -- apps/spectrum
# packaged spectrum; output dist/apps/spectrum; install /sd/apps/spectrum

npm run upload:app -- http://192.168.1.32:8080 dist/apps/spectrum spectrum
# uploaded 4 files; commit ok; confirmed spectrum in /apps

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app spectrum --allow-starting --polls 80 --interval-ms 500 --metrics-polls 60 --metrics-interval-ms 500 --require-metrics audio_ready=true --require-metrics band_count=32 --require-metrics 'frames>=3' --require-metrics 'audio_reads>=1' --require-metrics 'audio_bytes>=1' --stop --stop-polls 80 --stop-interval-ms 500
# lifecycle smoke ok: spectrum state=running current_app=spectrum polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"audio_ready":true,"frames":3,"mode":"bars","mode_changes":0,"last_key":"","band_count":32,"bin_count":32,"audio_reads":4,"audio_bytes":1024,"read_attempts":4,"last_pcm_bytes":256,"peak_level":80,"peak_band":1,"peak_hz":90,"capture_error":"","timer_error":"","tick_phase":"tick_render","tick_count":3}
```

This closes Spectrum's machine-verifiable real-audio analyzer slice: the app launches, opens I2S RX,
reads PCM, computes 32 Goertzel bands, publishes audio metrics, and stops cleanly. Remaining Spectrum
work is physical screen/photo QA, real microphone-response observation, longer visual soak, and any
upstream `spectrum` module or richer FFT/line renderer only if the visual target still requires them.

### 2026-06-25 Videos minimal GIF playlist migration

The next upstream-app slice migrated `upstream/holocubic-apps/videos` into a minimal Runtime app at
`apps/videos/`. The upstream app is a GIF playlist rather than a general video decoder, so this first
slice keeps the scope to app-local GIF discovery, LVGL GIF playback, key navigation, and metrics.

RED checks before implementation:

```text
npm run test:validator
# failed: apps/videos: Missing app.info

npm run test:packager
# failed: App directory does not exist: /Users/wq/vibeboard-runtime-gpl/apps/videos

npm run test:firmware-static -- --test-name-pattern "Videos|Spectrum"
# failed: apps/videos/app.info should exist
```

Implementation:

- `apps/videos/app.info` declares `capabilities = lvgl,timer,input,file`.
- `apps/videos/main.lua` scans app-local `videos/`, filters `.gif` files, plays the selected GIF
  with `lv_gif_create` / `lv_gif_set_src`, and writes `metrics.json`.
- The app handles both current Runtime `file.listdir()` string entries and upstream-style table
  entries with `name` / `is_dir`.
- LEFT/RIGHT update selection metrics through `key.on`; HOME/EXIT delegates to `app.exit()`.
- `apps/videos/videos/idle_0.gif` is copied from the existing Voice AI buddy assets as a small
  app-local smoke GIF, avoiding a new asset source.
- `tools/app-packager` now includes `apps/videos` in the curated demo/migrated package list.

Local verification:

```text
npm run test:validator
# pass 20/20

npm run test:packager
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "Videos|Spectrum"
# pass 90/90

npm run package:app -- apps/videos
# packaged videos; output dist/apps/videos; install /sd/apps/videos

npm run package:demos
# includes videos -> dist/apps/videos

git diff --check
# no output
```

Board upload and lifecycle smoke:

```text
npm run device:check
# Runtime reachable at http://192.168.1.32:8080/status, ESP32-S3 on /dev/cu.usbmodem111301

npm run upload:app -- http://192.168.1.32:8080 dist/apps/videos videos
# uploaded 5 files; commit ok; confirmed videos in /apps

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app videos --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics videos_ready=true --require-metrics 'gif_count>=1' --require-metrics selected_index=1 --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: videos state=running current_app=videos polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"videos_ready":true,"gif_count":1,"selected_index":1,"selection_changes":0,"ticks":0,"last_key":"","current_name":"idle_0.gif","current_src":"S:/apps/videos/videos/idle_0.gif","last_error":""}
```

Board key-injection smoke:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app videos --polls 35 --interval-ms 500 --metrics-polls 10 --metrics-interval-ms 500 --require-metrics videos_ready=true --require-metrics 'gif_count>=1'
# lifecycle smoke ok: videos state=running current_app=videos polls=2

curl -sS -X POST 'http://192.168.1.32:8080/input/key?code=RIGHT&event=SHORT'
# {"ok":true,"injected":{"code":"RIGHT","event":"SHORT"}}

curl -sS 'http://192.168.1.32:8080/apps/file?app=videos&path=metrics.json'
# {"videos_ready":true,"gif_count":1,"selected_index":1,"selection_changes":1,"ticks":7,"last_key":"RIGHT","current_name":"idle_0.gif","current_src":"S:/apps/videos/videos/idle_0.gif","last_error":""}

curl -sS -X POST http://192.168.1.32:8080/stop
# {"ok":true,"stopped":true}

curl -sS http://192.168.1.32:8080/status
# state=idle, app_count=38
```

Remaining Videos work: physical screen/photo QA, multiple user-provided GIFs, media management UX,
and any future true video/transcoding path if the product requires formats beyond LVGL GIF playback.

### 2026-06-25 Photos minimal image playlist migration

The next upstream-app slice migrated `upstream/holocubic-apps/photos` into a minimal Runtime app at
`apps/photos/`. The upstream app uses three canvases and `lv_canvas_draw_img` for a sliding photo
show, but that draw-image binding is not part of the verified Runtime surface and Weather has a
recorded negative path around large deferred image-object loading. This first slice therefore keeps
the scope to app-local PNG/BMP discovery, `lv_img_create` / `lv_img_set_src`, key navigation, and
machine-readable metrics.

RED checks before implementation:

```text
npm run test:validator
# failed: apps/photos: Missing app.info

npm run test:packager
# failed: curated package list expected apps/photos

npm run test:firmware-static -- --test-name-pattern "Photos|Videos"
# failed: apps/photos/app.info should exist
```

Implementation:

- `apps/photos/app.info` declares `capabilities = lvgl,timer,input,file`.
- `apps/photos/main.lua` scans app-local `photos/`, filters `.png` and `.bmp` files, displays the
  selected image with `lv_img_create` / `lv_img_set_src`, and writes `metrics.json`.
- The app handles both current Runtime `file.listdir()` string entries and upstream-style table
  entries with `name` / `is_dir`.
- LEFT/RIGHT update selection metrics through `key.on`; HOME/EXIT delegates to `app.exit()`.
- `apps/photos/photos/sample.png` is copied from `upstream/holocubic-apps/photos/main.png` as a
  small app-local smoke image.
- `tools/app-packager` now includes `apps/photos` in the curated demo/migrated package list.
- Static guardrails require the image-widget path and explicitly reject `lv_canvas_draw_img` in this
  minimal app, so the unimplemented upstream slideshow path is not accidentally claimed.

Local verification:

```text
npm run test:validator
# pass 20/20

npm run test:packager
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "Photos|Videos"
# pass 91/91

npm run package:app -- apps/photos
# packaged photos; output dist/apps/photos; install /sd/apps/photos

npm run package:demos
# includes photos -> dist/apps/photos

git diff --check -- apps/photos tools/app-packager/index.mjs tools/app-packager/test.mjs tools/app-validator/test.mjs tools/firmware-static-check/test.mjs
# no output
```

Board upload and lifecycle smoke:

```text
npm run device:check
# ESP32-S3 detected on /dev/cu.usbmodem111301; initial HTTP /status timed out after probe

curl -sS --max-time 8 http://192.168.1.32:8080/status
# recovered with Runtime state=idle, app_count=38

npm run upload:app -- http://192.168.1.32:8080 dist/apps/photos photos
# uploaded 5 files; commit ok; confirmed photos in /apps

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app photos --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics photos_ready=true --require-metrics 'image_count>=1' --require-metrics selected_index=1 --require-metrics current_name=sample.png --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: photos state=running current_app=photos polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"photos_ready":true,"image_count":1,"selected_index":1,"selection_changes":0,"ticks":0,"last_key":"","current_name":"sample.png","current_src":"S:/apps/photos/photos/sample.png","last_error":""}
```

Board key-injection smoke:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app photos --polls 35 --interval-ms 500 --metrics-polls 10 --metrics-interval-ms 500 --require-metrics photos_ready=true --require-metrics 'image_count>=1'
# lifecycle smoke ok: photos state=running current_app=photos polls=1

curl -sS --max-time 8 -X POST 'http://192.168.1.32:8080/input/key?code=RIGHT&event=SHORT'
# {"ok":true,"injected":{"code":"RIGHT","event":"SHORT"}}

curl -sS --max-time 8 'http://192.168.1.32:8080/apps/file?app=photos&path=metrics.json'
# {"photos_ready":true,"image_count":1,"selected_index":1,"selection_changes":1,"ticks":16,"last_key":"RIGHT","current_name":"sample.png","current_src":"S:/apps/photos/photos/sample.png","last_error":""}

curl -sS --max-time 8 -X POST 'http://192.168.1.32:8080/stop'
# {"ok":true,"stopped":true}

curl -sS --max-time 8 'http://192.168.1.32:8080/status'
# state=idle, app_count=39
```

Remaining Photos work: physical screen/photo QA, user-provided multi-image sets, image sizing/layout
polish, optional JPG/WebP support if the decoders are enabled and verified, and the upstream-style
canvas slide animation only after `lv_canvas_draw_img` has a tested Runtime binding.

### 2026-06-25 Plane minimal sprite game migration

The next upstream-app slice migrated `upstream/holocubic-apps/plane` into a minimal Runtime app at
`apps/plane/`. The upstream Plane War app includes more gameplay systems than the current verified
Runtime surface needs for a first pass, so this slice keeps the scope to app-local BMP sprites,
key-controlled movement/shooting, a timer-driven game loop, and machine-readable metrics.

RED checks before implementation:

```text
npm run test:validator
# failed: apps/plane: Missing app.info

npm run test:packager
# failed: curated package list expected apps/plane

npm run test:firmware-static -- --test-name-pattern "Plane|Photos"
# failed: apps/plane/app.info should exist
```

Implementation:

- `apps/plane/app.info` declares `capabilities = lvgl,timer,input,file`.
- `apps/plane/main.lua` creates a minimal plane game with a player sprite, enemy sprites, bullets,
  HUD text, and `metrics.json`.
- `apps/plane/assets/m.bmp` and `apps/plane/assets/e1.bmp` are copied from the upstream Plane War
  assets as small app-local BMP smoke resources.
- LEFT/RIGHT move the player, UP fires a bullet, DOWN moves the player down, and HOME/EXIT delegates
  to `app.exit()`.
- The timer loop advances frames, spawns enemies, moves bullets/enemies, updates score on simple
  collision, and writes metrics.
- Static guardrails require the sprite/timer/input path and reject `app.on("imu")`, canvas draw-image,
  HTTP/WebUI route calls, and other unverified upstream surfaces for this minimal app.

Local verification:

```text
npm run test:validator
# pass 20/20

npm run test:packager
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "Plane|Photos"
# pass 92/92

npm run package:app -- apps/plane
# packaged plane; output dist/apps/plane; install /sd/apps/plane

npm run package:demos
# includes plane -> dist/apps/plane

git diff --check
# no output
```

Board upload and lifecycle smoke:

```text
npm run device:check
# Runtime reachable at http://192.168.1.32:8080/status, ESP32-S3 on /dev/cu.usbmodem111301

npm run upload:app -- http://192.168.1.32:8080 dist/apps/plane plane
# uploaded 6 files; commit ok; confirmed plane in /apps

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app plane --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics plane_ready=true --require-metrics 'frames>=1' --require-metrics 'enemies_spawned>=1' --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: plane state=running current_app=plane polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"plane_ready":true,"frames":4,"shots":0,"enemies_spawned":1,"score":0,"player_x":142,"player_y":194,"last_key":"","last_error":""}
```

Board key-injection smoke:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app plane --polls 35 --interval-ms 500 --metrics-polls 10 --metrics-interval-ms 500 --require-metrics plane_ready=true --require-metrics 'frames>=1'
# lifecycle smoke ok: plane state=running current_app=plane polls=2

curl -sS --max-time 8 -X POST 'http://192.168.1.32:8080/input/key?code=RIGHT&event=SHORT'
# {"ok":true,"injected":{"code":"RIGHT","event":"SHORT"}}

curl -sS --max-time 8 -X POST 'http://192.168.1.32:8080/input/key?code=UP&event=SHORT'
# {"ok":true,"injected":{"code":"UP","event":"SHORT"}}

curl -sS --max-time 8 'http://192.168.1.32:8080/apps/file?app=plane&path=metrics.json'
# {"plane_ready":true,"frames":149,"shots":1,"enemies_spawned":5,"score":0,"player_x":156,"player_y":194,"last_key":"UP","last_error":""}

curl -sS --max-time 8 -X POST 'http://192.168.1.32:8080/stop'
# {"ok":true,"stopped":true}

curl -sS --max-time 8 'http://192.168.1.32:8080/status'
# state=idle, app_count=40
```

Remaining Plane work: physical screen/photo QA, real gameplay tuning, upstream Plane War level and
powerup systems, boss/enemy variety, optional IMU tilt control, and longer soak.

### 2026-06-25 LV Benchmark minimal runtime benchmark migration

The next upstream-app slice migrated `upstream/holocubic-apps/lv-benchmark` into a minimal Runtime
app at `apps/lv-benchmark/`. The full upstream benchmark wants line, table, flex layout, LVGL
monitor, and broader scene/result handling. This first slice keeps the scope to a board-smokeable
runtime benchmark panel using already exposed LVGL APIs: object rectangles, labels, arc value
updates, image transform calls, timer-driven frame updates, and machine-readable metrics.

RED checks before implementation:

```text
npm run test:validator
# failed: apps/lv-benchmark: Missing app.info

npm run test:packager
# failed: curated package list expected apps/lv-benchmark

npm run test:firmware-static -- --test-name-pattern "LV Benchmark|Plane"
# failed: apps/lv-benchmark/app.info should exist
```

Implementation:

- `apps/lv-benchmark/app.info` declares `capabilities = lvgl,timer,file`.
- `apps/lv-benchmark/main.lua` builds a compact LVGL benchmark screen with 12 rectangles, 4 labels,
  1 arc, and 1 image transform probe, then writes `metrics.json`.
- `apps/lv-benchmark/assets/cog.bmp` is copied from the already board-smoked Plane asset set as a
  small app-local BMP image-transform probe.
- The timer loop increments `frames`, updates the arc value, rotates the image with
  `lv_img_set_angle`, refreshes labels, and writes metrics.
- Static guardrails require the minimal benchmark path and explicitly reject `lv_line_create`,
  `lv_table_create`, `lv_obj_set_flex_flow`, and `lv_lvgl_monitor_*`, so this slice does not claim
  the full upstream benchmark surface.
- `tools/app-packager` now includes `apps/lv-benchmark` in the curated demo/migrated package list.

Local verification:

```text
npm run test:validator
# pass 20/20

npm run test:packager
# pass 8/8

npm run test:firmware-static -- --test-name-pattern "LV Benchmark|Plane"
# pass 93/93

npm run package:app -- apps/lv-benchmark
# packaged lv-benchmark; output dist/apps/lv-benchmark; install /sd/apps/lv-benchmark

npm run package:demos
# includes lv-benchmark -> dist/apps/lv-benchmark

git diff --check -- apps/lv-benchmark tools/app-packager/index.mjs tools/app-packager/test.mjs tools/app-validator/test.mjs tools/firmware-static-check/test.mjs
# no output
```

Board upload and lifecycle smoke:

```text
npm run device:check
# ESP32-S3 detected on /dev/cu.usbmodem111301; initial HTTP /status timed out after probe

curl -sS --max-time 8 http://192.168.1.32:8080/status
# recovered with Runtime state=idle, app_count=40

npm run upload:app -- http://192.168.1.32:8080 dist/apps/lv-benchmark lv-benchmark
# uploaded 5 files; commit ok; confirmed lv-benchmark in /apps

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app lv-benchmark --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics benchmark_ready=true --require-metrics 'frames>=2' --require-metrics scene_count=3 --require-metrics 'rects>=12' --require-metrics 'labels>=4' --require-metrics 'arcs>=1' --require-metrics 'images>=1' --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: lv-benchmark state=running current_app=lv-benchmark polls=2 stop_state=idle stop_current_app= stop_polls=1 metrics={"benchmark_ready":true,"frames":2,"scene_count":3,"rects":12,"labels":4,"arcs":1,"images":1,"scene":"running","last_error":""}
```

Board sustained-frame smoke:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app lv-benchmark --polls 35 --interval-ms 500 --metrics-polls 10 --metrics-interval-ms 500 --require-metrics benchmark_ready=true --require-metrics 'frames>=2'
# lifecycle smoke ok: lv-benchmark state=running current_app=lv-benchmark polls=2 metrics={"benchmark_ready":true,"frames":4,"scene_count":3,"rects":12,"labels":4,"arcs":1,"images":1,"scene":"running","last_error":""}

curl -sS --max-time 8 'http://192.168.1.32:8080/apps/file?app=lv-benchmark&path=metrics.json'
# {"benchmark_ready":true,"frames":12,"scene_count":3,"rects":12,"labels":4,"arcs":1,"images":1,"scene":"running","last_error":""}

curl -sS --max-time 8 -X POST 'http://192.168.1.32:8080/stop'
# {"ok":true,"stopped":true}

curl -sS --max-time 8 'http://192.168.1.32:8080/status'
# state=idle, app_count=41
```

Remaining LV Benchmark work: physical screen/photo QA, true FPS/monitor collection, the upstream
line/table/flex scenes, complete official scene weights/results, and longer display stress soak.

### 2026-06-25 WebUI route bridge completion

After the `lv-benchmark` board smoke, the next automatable slice completed a minimal upstream
WebUI/httpd compatibility bridge. The immediate target was a Runtime bridge for active Lua apps, not a full
`mini_claw` migration:

```text
app.route_base() -> "/app"
app.set_webui(true|false)
app.route("/api/ping", callback)
HTTP GET /app/* -> active Lua app route callback
```

Implementation:

- Validator tests were updated so `app.route_base`, `app.set_webui`, and `app.route` require a
  declared `webui` capability.
- Firmware static tests were added for the Lua app API, app-runner dispatch function, `/app/*`
  HTTP handler, and `smoke_app_manager` route smoke shape.
- `lua_app.c/h` exposes `app.route_base()`, `app.set_webui(bool)`, and `app.route(path, callback)`,
  stores one active route callback ref, and dispatches a request table with `path`, `query`, and
  `method="GET"`.
- `app_runner.c/h` exposes `vb_app_runner_dispatch_webui(...)`; `app_runner.h` includes `stddef.h`
  for the `size_t` prototype.
- `install_service.c` registers `GET /app/*`, strips the `/app` prefix, and returns callback
  status/type/body through HTTP.
- `apps/smoke_app_manager` now declares `capabilities = lvgl,timer,input,file,webui`, registers
  `/api/ping`, writes WebUI request metrics through `file.write`, and delays its automatic software
  HOME handoff to 4000 ms so the route smoke has time to run.

Local verification:

```text
npm run test:validator
# pass 21/21

npm run test:firmware-static -- --test-name-pattern "WebUI route|Lua app manager smoke|tracks migrated app runtime API gaps"
# pass 94/94

source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && idf.py build
# Project build complete; vibeboard_runtime.bin size 0x1b7170, 57% free

npm run test:packager
# pass 8/8

npm run package:app -- apps/smoke_app_manager
# packaged smoke_app_manager

npm run package:demos
# includes smoke_app_manager

git diff --check
# no output
```

Board verification:

```text
npm run device:check
# Runtime reachable at http://192.168.1.32:8080, ESP32-S3 on /dev/cu.usbmodem111301

source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && idf.py -p /dev/cu.usbmodem111301 flash
# flashed bootloader/app/partition table; MAC 10:51:db:80:e2:e8; hashes verified

curl -sS --max-time 8 'http://192.168.1.32:8080/status'
# {"sd":true,"app_count":41,...,"state":"idle",...}

npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_app_manager smoke_app_manager
# uploaded 4 files; commit ok; confirmed smoke_app_manager in /apps

curl -sS --max-time 8 -X POST 'http://192.168.1.32:8080/launch?app=smoke_app_manager'
# {"ok":true,"launched":"smoke_app_manager"}

curl -sS --max-time 8 'http://192.168.1.32:8080/app/api/ping'
# {"ok":true,"route":"ping","app":"smoke_app_manager"}

curl -sS --max-time 8 'http://192.168.1.32:8080/apps/file?app=smoke_app_manager&path=metrics.json'
# {"webui_enabled":true,"webui_registered":true,"webui_requests":1,"last_webui_path":"/api/ping","route_base":"/app"}

npm run app-manager:smoke -- --board http://192.168.1.32:8080 --polls 12 --interval-ms 500
# app-manager smoke ok: smoke_app_manager->smoke_key state=running current_app=smoke_key polls=10

curl -sS --max-time 8 -X POST 'http://192.168.1.32:8080/stop'
# {"ok":true,"stopped":true}

curl -sS --max-time 8 'http://192.168.1.32:8080/status'
# state=idle, app_count=41
```

Result: the minimal WebUI route bridge is board-verified for an active-app callback. The first smoke
covered `smoke_app_manager` GET routing; a later `mini_claw` board smoke also covered POST body
dispatch and the `sys.setbrightness` bridge:

```text
npm run package:app -- apps/mini_claw
# packaged mini_claw

npm run upload:app -- http://192.168.1.32:8080 dist/apps/mini_claw mini_claw
# uploaded 6 files; commit ok; confirmed mini_claw in /apps

node --test tools/firmware-static-check/test.mjs --test-name-pattern "ships Mini Claw"
# pass 97/97

curl -sS --max-time 5 'http://192.168.1.32:8080/status'
# state=running,current_app=mini_claw after launch and delayed polling

curl -i --max-time 8 'http://192.168.1.32:8080/app/api'
# HTTP/1.1 200 OK
# {"ok":true,"route":"api","method":"GET"}

curl -i --max-time 8 -X POST 'http://192.168.1.32:8080/app/api' \
  -H 'Content-Type: application/json' \
  --data '{"action":"brightness","level":30}'
# HTTP/1.1 200 OK
# {"ok":true,"level":30}

curl -sS --max-time 5 -X POST 'http://192.168.1.32:8080/stop'
# {"ok":true,"stopped":true}

curl -sS --max-time 5 'http://192.168.1.32:8080/status'
# state=idle, app_count=42
```

This follow-up fixed `mini_claw`'s refresh timer from numeric mode `1` to `tmr.ALARM_AUTO`; the
numeric mode was `tmr.ALARM_SEMI` on this Runtime and let the app fall out of the event loop after a
single callback. The bridge still does not cover static WebUI assets, auth, CORS, long responses, or
a complete production `mini_claw` agent workflow.

## 2026-06-25 Voice AI SD open-file budget recovery

After the command-provider Voice AI smoke began failing at readiness with `last metrics=null`, direct
HTTP probes showed `/apps/file` returning `404 file not found` for `voice_ai/main.lua`,
`voice_ai/app.info`, and `voice_ai/metrics.json` while `voice_ai` was running. Stopping the app made
those files readable again, which pointed to SD VFS open-file pressure rather than a bad app upload.

Fix:

- Added `VB_SD_MAX_OPEN_FILES 16` in `board_lckfb_szpi_s3.h`.
- Changed the SD mount config to use `.max_files = VB_SD_MAX_OPEN_FILES`.
- Added a firmware-static guardrail named `keeps enough SD open files for runtime apps with live assets`.

Verification:

```text
node --test tools/firmware-static-check/test.mjs --test-name-pattern "keeps enough SD open files for runtime apps with live assets"
# pass 97/97

git diff --check
# no output

source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && idf.py build
# vibeboard_runtime.bin binary size 0x1b7580 bytes; 57% free in the 4 MB app partition

source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && idf.py -p /dev/cu.usbmodem111301 flash
# ESP32-S3 MAC 10:51:db:80:e2:e8; bootloader/app/partition hashes verified

npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://127.0.0.1:8790 --record-ms 1800 --ready-polls 120 --polls 35 --interval-ms 500 --min-audio-bytes 1024 --require-gif --require-bridge-provider command
# voice-ai smoke ok: audio=1536 chats=0->1 state=running current_app=voice_ai gif=idle font=loaded reply=reply:transcript:2048

curl -sS --max-time 8 'http://192.168.1.32:8080/apps/file?app=voice_ai&path=metrics.json' | wc -c
# 514

curl -sS --max-time 8 'http://192.168.1.32:8080/apps/file?app=voice_ai&path=main.lua' | wc -c
# 37230

curl -sS --max-time 8 'http://192.168.1.32:8080/apps/file?app=voice_ai&path=app.info' | wc -c
# 141

curl -sS --max-time 8 -X POST 'http://192.168.1.32:8080/stop'
# {"ok":true,"stopped":true}

curl -sS --max-time 8 'http://192.168.1.32:8080/status'
# state=idle, app_count=41
```

Result: `voice_ai` can now keep GIF/font assets live while the install service still reads app files
and metrics. The command-provider path is board-verified through transcript/reply with
`pcm_s16le/16000/16/1` metadata. Remaining Voice AI gaps are production STT endpoint support, physical
GIF visual confirmation, and real speaker/codec output.

## 2026-06-25 Codex Buddy bridge migration

The next upstream-app slice migrated `upstream/holocubic-apps/codex_buddy` into `apps/codex_buddy`.
This first Runtime version keeps the upstream local bridge shape (`GET /state`, `POST /permission`),
copies the `assets/bufo` GIF state pack, reads `config.json` for `bridge_url`, and writes
`metrics.json` for bridge, GIF, prompt, quota, and permission state.

Two board-only issues were found and fixed during cold smoke:

- `lv_gif_create(root)` was originally unguarded before `buddy_ready`; a cold launch could leave the
  app in `state=starting` with metrics stuck at `draw_phase=boot`. The app now writes staged
  `draw_phase` metrics and wraps GIF object creation in `pcall`.
- HOME was originally intercepted by the runner default HOME/EXIT stop handling, and the first per-key
  callback used the wrong argument shape. `codex_buddy` now calls `app.set_home_exit(false)` while
  active and registers per-key wrappers such as `function(evt_type) handle_key(key.HOME, evt_type) end`.

Local/static verification:

```text
npm run test:firmware-static -- --test-name-pattern "ships Codex Buddy as a deterministic desktop bridge migration"
# pass 98/98

npm run package:app -- apps/codex_buddy
# packaged codex_buddy
```

Board verification used the upstream bridge with a deterministic state override:

```text
python3 upstream/holocubic-apps/tools/codex_buddy_bridge/server.py \
  --host 0.0.0.0 --port 8788 --state-file tmp/codex-buddy-state.json

npm run upload:app -- http://192.168.1.32:8080 dist/apps/codex_buddy codex_buddy
# uploaded 14 files; commit ok; confirmed codex_buddy in /apps

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app codex_buddy \
  --polls 80 --interval-ms 500 --metrics-polls 80 --metrics-interval-ms 500 \
  --require-metrics buddy_ready=true --require-metrics online=true \
  --require-metrics pet_state=attention --require-metrics prompt_seen=true \
  --require-metrics gif_visible=true --require-metrics gif_state=attention \
  --require-metrics 'polls>=1' --stop --stop-polls 80 --stop-interval-ms 500
# lifecycle smoke ok: codex_buddy state=running current_app=codex_buddy polls=3 stop_state=idle ...
# metrics: online=true, pet_state=attention, gif_state=attention, prompt_seen=true, draw_phase=ready

curl -sS -X POST 'http://192.168.1.32:8080/launch?app=codex_buddy'
curl -sS -X POST 'http://192.168.1.32:8080/input/key?code=HOME&event=SHORT'
curl -sS 'http://192.168.1.32:8080/apps/file?app=codex_buddy&path=metrics.json'
# permission_posts=1,last_permission_decision="once",last_permission_status=200,last_key="HOME"

curl -sS -X POST 'http://192.168.1.32:8080/stop'
# {"ok":true,"stopped":true}
```

Result: Codex Buddy is machine-verified for package/upload/launch/bridge polling/GIF state metrics,
HOME permission POST, and clean stop. Remaining work is a real Codex-session soak using live session
JSONL changes, physical/camera confirmation that the GIF is visibly animating, and any future bridge
integration that can actually apply IDE approval decisions instead of only recording them.

## 2026-06-25 NES host-audio baseline recheck after staged rollback flash

After flashing the staged rollback hardening firmware, the board was idle at:

```text
curl -sS --max-time 5 http://192.168.1.32:8080/status
# sd=true, app_count=45, state=idle, last_status=ESP_OK
```

The first extended NES soak attempt used the legal mapper-0 ROM and a longer metrics window:

```text
npm run nes:rom:smoke -- --board http://192.168.1.32:8080 --app smoke_nes --path roms/smoke.nes
# nes smoke rom uploaded: app=smoke_nes path=roms/smoke.nes bytes=24592

npm run nes:smoke -- --board http://192.168.1.32:8080 \
  --polls 30 --metrics-polls 260 --interval-ms 500 \
  --require-rom --require-frame-growth 3200 \
  --require-audio-bytes 128 --require-audio-backend host
# failed: expected smoke_nes ROM-backed metrics; last metrics null
```

Diagnosis showed the board was running `smoke_nes`, but the app package on SD did not expose the
current metrics file:

```text
curl -sS --max-time 5 http://192.168.1.32:8080/status
# state=running,current_app=smoke_nes

curl -sS --max-time 5 -w '\nHTTP %{http_code}\n' \
  'http://192.168.1.32:8080/apps/file?app=smoke_nes&path=metrics.json'
# file not found
# HTTP 404
```

I stopped the app, rebuilt and uploaded the current `apps/smoke_nes` package, then re-uploaded the ROM:

```text
npm run package:app -- apps/smoke_nes
# packaged smoke_nes

npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_nes smoke_nes
# uploaded 5 files; commit ok; confirmed smoke_nes in /apps

npm run nes:rom:smoke -- --board http://192.168.1.32:8080 --app smoke_nes --path roms/smoke.nes
# nes smoke rom uploaded: app=smoke_nes path=roms/smoke.nes bytes=24592
```

The previous `1600` frame-growth gate still did not pass on this recheck:

```text
npm run nes:smoke -- --board http://192.168.1.32:8080 \
  --polls 30 --metrics-polls 140 --interval-ms 500 \
  --require-rom --require-frame-growth 1600 \
  --require-audio-bytes 128 --require-audio-backend host
# failed: expected smoke_nes rendered frame growth >= 1600; observed 1394
# last metrics: rendered_frames=1412,audio_backend=host,audio_error="",audio_bytes=19840,
# audio_written_bytes=19840,audio_dropped_bytes=59008
```

A lower current-state probe also did not produce a clean baseline because the metrics HTTP read reset:

```text
npm run nes:smoke -- --board http://192.168.1.32:8080 \
  --polls 30 --metrics-polls 140 --interval-ms 500 \
  --require-rom --require-frame-growth 1200 \
  --require-audio-bytes 128 --require-audio-backend host
# failed: read ECONNRESET while GET /apps/file?app=smoke_nes&path=metrics.json
```

The board recovered to idle:

```text
curl -sS --max-time 5 http://192.168.1.32:8080/status
# state=idle, app_count=45
```

Conclusion: current firmware/package still proves legal ROM startup and host-audio metric production, but
the latest board state does not reproduce the earlier `frame_growth=1606` baseline. Next NES work should
diagnose host-audio drop/backpressure, APU/core scheduling, and `/apps/file` metrics read reliability
before claiming long NES performance restored.

## 2026-06-29 Runtime performance first-slice flash and metrics smoke

The post-v0.1 performance first slice was merged into `main` as:

```text
6b648d1 fix: protect lua http callbacks
3157628 feat: add migrated app performance metrics
```

Local verification before flashing:

```text
npm run test:firmware-static -- --test-name-pattern "performance metrics|Lua HTTP callback"
# 105 tests, 105 pass

npm run package:app -- apps/weather
npm run package:app -- apps/photos
npm run package:app -- apps/voice_ai
# all three packages built under dist/apps/
```

Firmware build and flash:

```text
source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && \
  export PATH="/Users/wq/.espressif/tools/xtensa-esp-elf/esp-14.2.0_20260121/xtensa-esp-elf/bin:$PATH" && \
  idf.py build
# vibeboard_runtime.bin binary size 0x1b8bd0; 4 MB app partition 57% free

source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && \
  export PATH="/Users/wq/.espressif/tools/xtensa-esp-elf/esp-14.2.0_20260121/xtensa-esp-elf/bin:$PATH" && \
  idf.py -p /dev/cu.usbmodem112301 flash
# ESP32-S3 MAC 10:51:db:80:e2:e8; bootloader/app/partition hashes verified; hard reset completed
```

Runtime recovery check:

```text
npm run device:check -- http://192.168.1.32:8080
# ESP32-S3 detected on /dev/cu.usbmodem112301
# HTTP /status reachable: yes (200)
# VibeBoard Runtime: yes
```

The updated app packages were uploaded after the firmware flash:

```text
npm run upload:app -- http://192.168.1.32:8080 dist/apps/weather weather
# uploaded 37 files; commit ok; confirmed weather in /apps

npm run upload:app -- http://192.168.1.32:8080 dist/apps/photos photos
# uploaded 5 files; commit ok; confirmed photos in /apps

npm run upload:app -- http://192.168.1.32:8080 dist/apps/voice_ai voice_ai
# uploaded 19 files; commit ok; confirmed voice_ai in /apps
```

Board metrics smoke passed for the three first-slice apps:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather \
  --polls 35 --interval-ms 500 --metrics-polls 60 --metrics-interval-ms 500 \
  --require-metrics ui_ready=true --require-metrics fonts_ready=true \
  --require-metrics assets_ready=true --require-metrics 'perf_ready_ms>=0' \
  --require-metrics 'perf_resource_ms>=0' --require-metrics perf_last_error= \
  --stop --stop-polls 35 --stop-interval-ms 500
# metrics included perf_first_paint_ms=320, perf_ready_ms=1310,
# perf_resource_ms=1010, perf_http_ms=0, perf_timer_max_ms=770, perf_last_error=""

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app photos \
  --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 \
  --require-metrics photos_ready=true --require-metrics 'perf_ready_ms>=0' \
  --require-metrics 'perf_resource_ms>=0' --require-metrics 'perf_timer_max_ms>=0' \
  --require-metrics perf_last_error= --stop --stop-polls 35 --stop-interval-ms 500
# metrics included perf_first_paint_ms=10, perf_ready_ms=20,
# perf_resource_ms=70, perf_http_ms=0, perf_timer_max_ms=0, perf_last_error=""

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app voice_ai \
  --allow-starting --polls 80 --interval-ms 500 --metrics-polls 80 \
  --metrics-interval-ms 500 --require-metrics init_stage=ready \
  --require-metrics 'perf_ready_ms>=0' --require-metrics 'perf_resource_ms>=0' \
  --require-metrics 'perf_timer_max_ms>=0' --require-metrics perf_last_error= \
  --stop --stop-polls 80 --stop-interval-ms 500
# metrics included perf_first_paint_ms=160, perf_ready_ms=180,
# perf_resource_ms=0, perf_http_ms=0, perf_timer_max_ms=0, perf_last_error=""
```

Final board state:

```text
curl -fsS http://192.168.1.32:8080/status
# sd=true, app_count=45, state=idle, runtime_version=0.1.0
```

Conclusion: the protected Lua HTTP callback path is flashed, and the first-slice `perf_*` metrics are
board-readable for `weather`, `photos`, and `voice_ai`. This is a measurement baseline only; async HTTP
execution, cancellation semantics, and broader resource scheduling remain follow-up performance work.

## 2026-07-01 GC2145 camera Runtime smoke

The camera Runtime slice added an Espressif `esp32-camera` backed Lua `camera` module and a
machine-readable `apps/smoke_camera` app. The board wiring came from the local LCKFB
`07-lcd_camera` example, but serial probe logs on the physical board identified the actual sensor as
GC2145 rather than the earlier GC0308 assumption:

```text
camera: Camera PID=0x2145 VER=0x00 MIDL=0x00 MIDH=0x00
camera: Detected GC2145 camera
```

Two board-level issues were fixed during bring-up:

- `esp32-camera` initially selected the new SCCB I2C driver, which conflicted with the existing
  legacy I2C stack; Runtime now sets `CONFIG_SCCB_HARDWARE_I2C_DRIVER_LEGACY=y`.
- RGB capture initially failed after WiFi/LVGL boot because the camera wanted a 7680-byte contiguous
  internal DMA buffer while the largest free DMA block was 6656 bytes. An intermediate smoke tried
  camera PSRAM DMA, but the final stable preview configuration keeps `CONFIG_CAMERA_PSRAM_DMA`
  disabled, reserves internal DMA memory, and moves the `esp32-camera` internal task stack to PSRAM.

Local and firmware verification:

```text
node --test tools/firmware-static-check/test.mjs --test-name-pattern "camera|GC2145|smoke_camera"
# 115 tests, 115 pass

node tools/app-validator/cli.mjs apps/smoke_camera
# ok apps/smoke_camera (smoke_camera)

idf.py build
# vibeboard_runtime.bin binary size 0x222d50; 47% free in the 4 MB app partition
```

Flash target was the intended board, not the second connected board:

```text
idf.py -p /dev/cu.usbmodem112301 flash
# Chip is ESP32-S3 (QFN56)
# MAC: 10:51:db:80:e2:e8
# Hash of data verified for bootloader, app, and partition table
```

Runtime recovered with HTTP install service available:

```text
curl -s --max-time 2 http://192.168.1.32:8080/status
# sd=true, app_count=48, install=ok, state=idle
```

`smoke_camera` was packaged, uploaded, and confirmed in `/apps`:

```text
npm run package:app -- apps/smoke_camera
# packaged smoke_camera

npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_camera smoke_camera
# uploaded 4 files; latest main.lua 4398 bytes after adding synchronous first-frame capture
# commit ok; confirmed smoke_camera in /apps
```

Final board smoke:

```text
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 \
  --app smoke_camera --allow-starting --polls 80 --interval-ms 500 \
  --metrics-polls 80 --metrics-interval-ms 500 \
  --require-metrics camera_ready=true --require-metrics 'captures>=1' \
  --stop --stop-polls 40 --stop-interval-ms 500

# lifecycle smoke ok: smoke_camera state=starting current_app=smoke_camera polls=2
# stop_state=idle stop_current_app= stop_polls=1
# metrics={"camera_ready":true,"captures":1,"width":160,"height":120,
# "format":"rgb565","frame_bytes":38400,"preview":false,
# "capture_error":"","preview_error":"draw failed","phase":"captured"}
```

A final recheck ran the same lifecycle smoke twice consecutively. Both runs passed with the same
`camera_ready=true,captures=1,width=160,height=120,frame_bytes=38400,phase=captured` metrics. The app
now captures its first frame synchronously after `camera.start` so fast smoke tooling cannot stop it
before the first useful metrics write.

Conclusion for the first slice: the board camera was driven enough for Runtime apps to start the
sensor, capture a GC2145 RGB565 frame, release it, stop cleanly, and report metrics. Full-screen
preview still needed a Runtime draw path because the verified capture size was 160x120 while the LCD
is 320x240.

Preview scaler follow-up on the same day:

```text
node --test tools/firmware-static-check/test.mjs --test-name-pattern camera
# 115 tests, 115 pass

node tools/app-validator/cli.mjs apps/smoke_camera
# ok apps/smoke_camera (smoke_camera)

idf.py build
# vibeboard_runtime.bin binary size 0x222e00 bytes; 47% free in the 4 MB app partition

idf.py -p /dev/cu.usbmodem112301 flash
# Serial port /dev/cu.usbmodem112301
# MAC: 10:51:db:80:e2:e8
# Hash of data verified for bootloader, app, and partition table

npm run lifecycle:smoke -- --board http://192.168.1.32:8080 \
  --app smoke_camera --allow-starting --polls 80 --interval-ms 500 \
  --metrics-polls 80 --metrics-interval-ms 500 \
  --require-metrics camera_ready=true --require-metrics 'captures>=1' \
  --require-metrics preview=true \
  --stop --stop-polls 40 --stop-interval-ms 500

# lifecycle smoke ok: smoke_camera state=starting current_app=smoke_camera polls=2
# stop_state=idle stop_current_app= stop_polls=1
# metrics={"camera_ready":true,"captures":2,"width":160,"height":120,
# "format":"rgb565","frame_bytes":38400,"preview":true,
# "capture_error":"","preview_error":"","phase":"captured"}
```

`camera.draw` now accepts the verified 160x120 RGB565 frame and scales it 2x in the board Runtime
layer before writing 320x240 RGB565 rows to the ST7789 panel. Lua still only calls
`camera.capture()` and `camera.draw(frame)`; per-pixel image work stays in C. A second no-stop
lifecycle run left `smoke_camera` running on the device with `preview=true` for physical screen
inspection.

## 2026-07-02 GC2145 camera live preview stabilization

The physical preview was later moved from a one-frame `camera.capture()` / `camera.draw(frame)` smoke
to a continuous Runtime-native preview task. The app remains a Lua app and uses the Runtime camera
module; it does not bypass the app architecture with the LCKFB demo.

The flower-screen/root-cause was not sensor orientation or RGB565 byte order. Under the full Runtime,
`esp32-camera` created its internal `cam_task` with an internal-RAM stack after WiFi, LVGL, HTTP, and
Lua were already running. That task creation returned failure (`result=-1 handle=0x0`), but the
driver did not fail fast. VSYNC/DMA events then had no consumer, producing `EV-VSYNC-OVF` and frame
timeouts. Runtime now applies a tracked CMake-time patch to the managed `esp32-camera` component so
clean builds preserve the fix:

- include `freertos/idf_additions.h` for the task-with-caps API;
- create `cam_task` with `xTaskCreatePinnedToCoreWithCaps(..., MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)`;
- check task creation with `CAM_CHECK_GOTO(task_created == pdPASS, ...)`;
- delete that task with `vTaskDeleteWithCaps`;
- keep the camera event queue at a minimum depth of 4.

The stable board settings are legacy SCCB I2C, GC2145 support, camera task affinity on core 1, 12 MHz
XCLK, `CONFIG_SPIRAM_MALLOC_RESERVE_INTERNAL=49152`, external task stacks enabled, and
`CONFIG_CAMERA_PSRAM_DMA` disabled. The preview path starts QQVGA RGB565 capture, takes over the LCD
from LVGL, scales 160x120 frames to 320x240 in C, and batches LCD writes into 8-row destination
stripes so each frame uses far fewer panel transfers than the earlier two-row loop.

Verification on `/dev/cu.usbmodem112301` (`MAC 10:51:db:80:e2:e8`) after flashing the runtime:

```text
I cam_hal: cam_task create core=1 stack=psram result=1 handle=...
I cam_hal: cam config ok
I board: GC2145 camera ready
I board: camera preview task started
```

The earlier `EV-VSYNC-OVF` and camera frame timeout logs were absent in the stabilization run. The
user confirmed on the physical display that the live camera image was now normal. Current stable
preview quality is 160x120 scaled to full screen; true QVGA preview clarity remains future work.
