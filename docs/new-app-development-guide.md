# New App Development Guide

This guide is the default starting point for new VibeBoard Runtime apps. It
describes the app layer that runs from SD card and the Runtime native
interfaces that should be used for hardware-sensitive work.

## App Shape

Create one directory under `apps/<app_id>/`.

Required files:

- `app.info`: metadata, entrypoint, and capability declarations.
- `main.lua`: the Lua app entrypoint.

Typical `app.info`:

```ini
name = Example
entry = main.lua
description = Short app description
capabilities = lvgl,timer,input,file
```

Declare only the capabilities the app actually uses:

- `lvgl`: display objects, labels, images, canvas, widgets.
- `timer`: `tmr.create()` timers.
- `input`: `key`, `touch`, or `gamepad`.
- `network`: HTTP, WiFi, NTP, or bridge calls.
- `file`: app-local files, metrics, config, captured media.
- `audio`: microphone, speaker, I2S capture/playback.
- `webui`: active-app HTTP routes.
- `module` / `native`: native modules such as NES.

Apps should publish a small `metrics.json` whenever they have state worth
testing. The smoke tools and web console use this file to verify behavior
without relying only on physical observation.

## Lua App Pattern

Keep the Lua app responsible for product behavior:

- create and update the LVGL screen;
- bind keys/touch/gamepad;
- load app-local config;
- call Runtime modules;
- write `metrics.json`;
- stop timers and release loaded resources on exit.

Use `app.set_home_exit(false)` when the app needs HOME for its own action.
Handle long HOME or `key.EXIT` to exit cleanly, then restore the default
launcher behavior before calling `app.exit(...)`.

Avoid blocking network or long file work during first paint. For heavier apps,
paint a small shell first, then stage fonts, images, network fetches, or audio
setup through timers so stop/switch requests remain responsive.

## Image Assets

Put images under the app directory, usually `assets/`.

### Resource Layering

Use the Runtime resource layering model for visual apps:

- large static backgrounds and other full-screen images: ship a compatible
  RGB565 BMP source and let the packager generate a `vbimg` file. Prefetch the
  `vbimg` while a loading shell is visible, then call
  `lv_canvas_load_vbimg(...)` when the canvas can be updated.
- small transparent icons, badges, and overlays: use `32-bit BMP alpha` assets
  through `lv_img_set_src(...)`. The Runtime LVGL BMP decoder converts BGRA to
  the screen's RGB565 color plus alpha byte, so edges stay transparent without
  Lua-side masking.
- text, cards, buttons, dividers, bars, and simple shapes: use LVGL native widgets
  and styles. Keep them in the LVGL object tree above the background
  canvas instead of baking UI chrome into one large image.
- camera previews, game frames, and animated streams: use Runtime native
  interfaces or a framebuffer/canvas path that writes batches of pixels. Do not
  model these as repeatedly loaded image files from SD.

For a startup path, paint a lightweight shell first, then stage fonts, small
icons, large `vbimg` prefetch, and network requests. Only hide the loading
shell after the visible background load has returned.

Preferred formats:

- `vbimg` for large static images that must appear quickly from SD.
- `32-bit BMP alpha` for small transparent images.
- 16-bit RGB565 BMP as the source/fallback for packager-generated `vbimg`.
- PNG or GIF only when the firmware feature is enabled and the app has a static
  guard or smoke test covering it.

Load assets lazily when they are large. Weather is the current reference for
staged background loading, `vbimg` prefetch/cache, alpha BMP icons, and keeping
stale data visible while assets refresh.

## Fonts

Use the built-in common CJK fonts first:

- `LV_FONT_COMMON_CN_13`
- `LV_FONT_VOICE_AI_13`
- `LV_FONT_SIMSUN_16_CJK`

Do not assume LVGL can display Chinese or special symbols without a font that
contains those glyphs. Common Chinese, punctuation, and measurement symbols
must be included in the chosen font. If an app needs a different size, generate
that size explicitly and document why the built-in sizes are insufficient.

For new apps, prefer the common built-in font set before adding app-local
`font/*.bin` files.

## Runtime Native Interfaces

Use native Runtime modules for hardware and platform boundaries instead of
reimplementing them in Lua:

- `i2s.record_file(...)`: microphone capture to an app-local raw file.
- `i2s.play_file(...)`: speaker playback from an app-local raw file.
- `i2s.write(...)`: short generated TX buffers such as tones.
- `http.get/post(...)`: direct HTTP.
- `http.cubicserver.get(...)`: HoloCubic-compatible backend calls through
  `/sd/runtime/cubicserver.json`.
- `file.*`: app-local config, metrics, and media files.
- `key`, `touch`, `gamepad`: input.
- `app.route(...)`: active-app WebUI routes.

If a feature depends on display drivers, codecs, SD, WiFi, native module ABI,
or memory layout, treat it as Runtime work, not app-only work.

## Audio And Voice

For microphone and speaker apps, start from the shared helper and native I2S
path instead of hand-writing PCM conversion in each app.

Add this to `app.info`:

```ini
capabilities = lvgl,network,audio,file,timer,input
shared.libs = voice_audio
```

Load it from the packaged app with the filesystem path used by Lua `dofile`.
The `/sd/...` prefix is for LVGL image/font resources; Lua files should use
`/sdcard/apps/<app_id>/...`:

```lua
local APP_FILE_DIR = "/sdcard/apps/<app_id>"
local voice_audio = dofile(APP_FILE_DIR .. "/lib/voice_audio.lua")
```

Record a bridge-ready 16 kHz mono PCM clip:

```lua
local pcm, info = voice_audio.record_bridge_pcm({
  i2s_id = 0,
  capture_path = "capture.raw",
  capture_rate = 48000,
  capture_bits = 16,
  capture_channels = 2,
  bridge_sample_rate = 16000,
  bridge_bits = 16,
  max_record_ms = 10000,
  max_record_bytes = 98304,
  downsample_frames = 3,
  chunk_bytes = 4096,
  timeout_ms = 1000,
})
```

`record_bridge_pcm` uses `i2s.record_file(...)`, saves the raw capture, converts
the app-local file to bridge PCM, and returns metrics such as raw bytes,
output bytes, elapsed time, effective sample rate, read time, and write time.

Post the audio to a desktop bridge:

```lua
voice_audio.post_bridge_chat(bridge_url, pcm, {
  sample_rate = 16000,
  bits = 16,
  channels = 1,
  reply_limit = 100,
  timeout_ms = 35000,
}, function(code, body)
  -- decode bridge JSON and update the UI
end)
```

Use `i2s.play_file(...)` for local playback diagnostics or recorder apps. The
`audio_loopback` app is the reference for capture, analysis, and speaker
playback.

## Backend Bridge Calls

Desktop bridge apps should keep the board protocol narrow:

- the device uploads raw media or simple JSON;
- the desktop bridge owns cloud credentials, local engines, and large models;
- the device receives small JSON replies and optional UI snippets;
- `/debug/stats` exposes the last request for smoke tests.

Voice AI uses `desktop-bridge/` with `/api/chat`, `/api/result`, `/health`, and
`/debug/stats`. Weather uses `tools/weather-bridge/` to serve
QWeather-shaped JSON for the migrated Weather app.

## Package, Upload, Launch

Validate and package an app:

```bash
npm run validate:apps
npm run package:app -- apps/<app_id>
```

Upload and launch on a board:

```bash
npm run upload:app -- http://192.168.1.32:8080 dist/apps/<app_id> <app_id>
npm run launch:app -- http://192.168.1.32:8080 <app_id>
```

For curated apps:

```bash
npm run package:demos
```

Shared libraries declared through `shared.libs` are copied from `apps/lib/`
into the packaged app under `lib/`, so uploaded apps remain self-contained.

## Verification Checklist

Before calling an app ready:

- `npm test`
- `npm run test:validator`
- `npm run test:packager`
- `npm run test:firmware-static`
- app-specific smoke test when available
- `idf.py build` after firmware or native binding changes
- package, upload, launch, and read `/status`
- read the app's `metrics.json` through `/apps/file`
- physically verify display, input, microphone, speaker, or network behavior
  when the feature depends on real hardware

For audio or backend apps, also verify:

- local `audio_loopback` capture/playback when changing microphone or speaker
  assumptions;
- bridge `/health`;
- bridge `/debug/stats`;
- saved `.pcm`/`.wav` artifacts when diagnosing recognition or audio quality.
