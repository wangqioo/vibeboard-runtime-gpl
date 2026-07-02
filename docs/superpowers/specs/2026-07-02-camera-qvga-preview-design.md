# Camera QVGA Preview Design

## Goal

Improve camera preview clarity by attempting native 320x240 RGB565 preview first while preserving the already board-verified 160x120 scaled preview as an automatic fallback.

## Architecture

The Runtime remains the owner of camera capture and display takeover. Lua apps still call `camera.preview_start()`; the board layer decides whether the active preview is QVGA direct draw or QQVGA scaled draw. This keeps product Lua code independent from DMA, task, frame-size, and LCD transfer details.

## Preview Selection

`vb_board_camera_preview_start()` should try QVGA first:

1. Initialize GC2145 at 320x240 RGB565.
2. Take over the display.
3. Start the preview task.
4. Let the preview task draw QVGA frames directly in 8-row stripes.

If QVGA initialization fails, display takeover fails, task creation fails, or the preview task sees repeated frame/draw failures during startup, the board layer must stop the camera and retry QQVGA scaled preview.

## Status Reporting

The board layer should expose the current preview mode:

- `qvga-direct`: native 320x240 RGB565 frames drawn directly to the LCD.
- `qqvga-scaled`: 160x120 RGB565 frames scaled 2x to 320x240.
- `stopped`: no preview task is running.

The Lua `camera.status()` table and `smoke_camera` metrics should include this mode plus the active preview width and height, so hardware observations can be tied to machine-readable evidence.

## Guardrails

The current stable QQVGA path must remain intact. A failed QVGA attempt must not leave the camera powered, the display takeover stuck, or the app unable to stop.

## Verification

Use static firmware tests to pin the QVGA-first fallback path and smoke app metrics. Then build, flash `/dev/cu.usbmodem112301`, launch `smoke_camera`, and verify with the user that the physical preview is clearer and stable.
