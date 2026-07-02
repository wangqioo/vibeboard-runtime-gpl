# Camera App Design

## Goal

Add the first product-style camera app on top of the Runtime camera capability.

## Scope

The first version provides:

- live QVGA viewfinder through `camera.preview_start()`;
- shutter by physical HOME short press, screen touch, or Web `/capture`;
- BMP photo saving under the app sandbox in `photos/`;
- a small active-app WebUI route that lists recent photos and links to existing `/apps/file` downloads.

QR/barcode recognition and AI upload are intentionally out of scope for this slice.

## Architecture

The app is `apps/camera`. Lua owns UI state, input behavior, filename generation, metrics, and WebUI HTML. The Runtime `camera` module owns camera start/capture/save/preview lifecycle and converts RGB565 frames to BMP when the save path ends in `.bmp`.

The shutter path queues the request first, then pauses preview from the app timer before capturing so the app does not race the preview task for camera frame buffers or block inside the Web route callback:

```text
HOME/touch/Web -> pending_capture -> timer -> camera.preview_stop
               -> camera.capture -> camera.save(...bmp)
               -> camera.release -> camera.preview_start
```

`camera.stop()` is reserved for app exit. Keeping the camera driver initialized between captures avoids repeated DMA allocation churn on ESP32-S3.

## Download Path

The app WebUI does not stream binary data through `app.route`, because the current active-app route bridge is designed for short text responses. Instead, WebUI links point at:

```text
/apps/file?app=camera&path=photos/<filename>.bmp
```

That reuses the firmware's existing sandboxed app-file download endpoint.

## Verification

Static tests should pin the app package, BMP save path, WebUI route, queued capture behavior, and download links. Board verification requires launching `camera`, taking a photo, confirming the app returns to preview, and downloading the BMP through `/apps/file`.
