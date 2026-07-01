# Camera Runtime Smoke Design

## Decision

Add the first Runtime camera capability for the LCKFB-SZPI-ESP32-S3-VA board.

This slice proves the board camera chain end to end: GC0308 power-up, DVP capture through `esp32-camera`, Lua access through a small `camera` module, and a `smoke_camera` app that can be launched, measured, and stopped on real hardware.

## Goal

Create the smallest useful camera path:

```text
GC0308 camera
  -> board camera driver
  -> Runtime-owned camera module
  -> Lua camera API
  -> apps/smoke_camera
  -> metrics.json + optional LCD preview
```

The first proof must answer these questions:

- Can the board initialize GC0308 without breaking LCD, touch, SD, WiFi, IMU, or audio?
- Can Runtime capture at least one frame?
- Can a Lua app observe frame metadata and keep the app lifecycle responsive?
- Can the app stop and return to the launcher cleanly?

## Hardware Reference

Use the local LCKFB examples as the board-support reference:

```text
/Users/wq/Downloads/szpi-s3-esp/07-lcd_camera
/Users/wq/Downloads/szpi-s3-esp/13-human_face_detection
/Users/wq/Downloads/szpi-s3-esp/14-handheld
```

The camera slice uses the pins from `07-lcd_camera/main/esp32_s3_szp.h`:

```text
XCLK:  GPIO5
SIOD:  GPIO1
SIOC:  GPIO2
D7:    GPIO9
D6:    GPIO4
D5:    GPIO6
D4:    GPIO15
D3:    GPIO17
D2:    GPIO8
D1:    GPIO18
D0:    GPIO16
VSYNC: GPIO3
HREF:  GPIO46
PCLK:  GPIO7
XCLK frequency: 24 MHz
```

The camera power-down line is routed through PCA9557:

```text
DVP_PWDN: PCA9557 bit 2
```

Runtime already owns PCA9557 for LCD chip-select and speaker amplifier enable. Camera support must reuse the existing board PCA9557 state helper instead of resetting the expander independently.

## Non-Goals

This first slice does not implement:

- photo gallery integration;
- persistent JPEG/photo saving as a user feature;
- HTTP camera streaming;
- QR scan;
- face detection;
- OpenCV-style image processing;
- production camera UI;
- full upstream `13-human_face_detection` migration;
- broad camera sensor abstraction beyond this GC0308 board.

These can be built after single-frame capture and lifecycle cleanup are stable.

## Runtime API

Register a Lua `camera` module.

Minimal target API:

```lua
local camera = require("camera")

local ok, err = camera.start({
  width = 320,
  height = 240,
  format = "rgb565",
})

local frame, err = camera.capture()

camera.release(frame)
camera.stop()

local status = camera.status()
```

`camera.start(opts)` initializes the board camera if needed. Unsupported width, height, or format values return `nil, "message"` instead of aborting Lua.

`camera.capture()` captures one frame and returns a Lua table:

```lua
{
  width = 320,
  height = 240,
  format = "rgb565",
  len = 153600,
  ptr = <opaque integer handle>
}
```

The opaque handle is only valid until `camera.release(frame)` or `camera.stop()`.

`camera.release(frame)` returns the frame buffer to the camera driver. The module must tolerate duplicate release attempts without crashing.

`camera.stop()` deinitializes the camera and releases any held frame.

`camera.status()` returns:

```lua
{
  ready = true|false,
  captures = 0,
  last_error = "",
  width = 320,
  height = 240,
  format = "rgb565"
}
```

## Display Preview

First implementation should prefer RGB565 capture and use the existing board display rectangle path for an optional full-screen preview:

```text
camera frame RGB565 -> vb_board_draw_rgb565(0, 0, 320, 240, frame->buf)
```

If RGB565 capture is unstable on GC0308, the smoke app may still pass the first machine-verifiable slice by capturing a smaller JPEG/RGB frame and writing metadata, but that fallback must be documented in metrics as `preview=false` with `preview_error`.

## App

Add `apps/smoke_camera`.

The app should:

- clear the screen and show a simple camera status UI;
- call `camera.start`;
- capture at least one frame;
- attempt a preview when the frame is RGB565 and 320x240;
- write `metrics.json`;
- keep a timer running so `/status` remains `state=running`;
- stop cleanly when Runtime requests exit.

Metrics shape:

```json
{
  "camera_ready": true,
  "captures": 1,
  "width": 320,
  "height": 240,
  "format": "rgb565",
  "frame_bytes": 153600,
  "preview": true,
  "capture_error": "",
  "preview_error": ""
}
```

## Firmware Integration

Add the Espressif camera component to the Runtime firmware using the existing ESP-IDF component workflow.

Board layer responsibilities:

- expose `vb_board_camera_start(...)`;
- expose `vb_board_camera_capture(...)`;
- expose `vb_board_camera_return(...)`;
- expose `vb_board_camera_stop()`;
- control `DVP_PWDN` through existing PCA9557 state;
- avoid resetting I2C, LCD, or PCA9557 ownership that other board systems rely on.

Lua layer responsibilities:

- register `require("camera")`;
- validate Lua options;
- convert board errors into Lua `nil, err` returns;
- make frame lifetime explicit;
- release any held frame during Lua runtime cleanup.

## Testing

Static tests first:

- firmware CMake includes camera component and Lua camera source;
- board camera pins match the LCKFB reference;
- `DVP_PWDN` is controlled through PCA9557 bit 2;
- `lua_camera.c` registers `camera.start`, `camera.capture`, `camera.release`, `camera.stop`, and `camera.status`;
- `smoke_camera` declares camera/display/file capabilities and writes required metrics.

Validator tests:

- `camera` is an accepted app capability;
- `smoke_camera` validates.

Board verification:

```bash
source /Users/wq/esp-idf/export.sh
idf.py build
idf.py -p /dev/cu.usbmodem112301 flash
npm run package:app -- apps/smoke_camera
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_camera smoke_camera
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app smoke_camera --allow-starting --require-metrics camera_ready=true --require-metrics 'captures>=1' --stop
```

Manual verification:

- user confirms whether the physical screen shows a live or single-frame camera preview;
- if preview is not visible but metrics pass, treat the driver as captured-only and open preview rendering as a follow-up.

## Risks

Camera and LCD share the small-screen visual pipeline. Direct camera preview must use display takeover carefully so it does not corrupt LVGL state after stop.

Camera buffers can be large. RGB565 320x240 is 153600 bytes per frame, so allocation must use PSRAM-capable camera buffers and must release frames promptly.

GC0308 sensor support may require the exact `esp32-camera` sensor path bundled with the LCKFB examples. If the managed component lacks GC0308 support in the installed version, use the local component as a reference but do not copy source without confirming license compatibility.

## Success Criteria

This slice is complete when:

- `smoke_camera` validates and packages;
- firmware static tests pass;
- ESP-IDF firmware builds;
- firmware flashes to `/dev/cu.usbmodem112301`;
- board launches `smoke_camera`;
- board metrics show `camera_ready=true` and `captures>=1`;
- `/stop` returns the board to idle;
- docs record whether physical preview was visible.
