# Architecture

VibeBoard Runtime GPL splits small-screen development into a stable ESP32 runtime and file-based Lua apps.

```text
ESP32-S3 runtime firmware
  -> SD app registry
  -> native launcher and HTTP/Web Console service
  -> Lua runner
  -> Lua/LVGL/runtime API bindings
  -> app.info + main.lua + assets on SD
```

## Runtime Layer

The runtime layer is ESP-IDF firmware flashed onto the ESP32-S3 device. It owns:

- board initialization for LCD, touch, backlight, PSRAM, LVGL, and SD;
- runtime WiFi autoconnect;
- `/sdcard/apps` discovery and `app.info` parsing;
- the native `VibeBoard Apps` launcher;
- the Lua VM and lifetime management;
- LVGL, timer, file, network, JSON, and time bindings;
- the HTTP install/lifecycle service on port `8080`;
- the self-contained browser Web Console served at `GET /`;
- optional future native-module ABI.

The runtime is changed slowly and reflashed only when hardware support, Lua modules, LVGL bindings, lifecycle behavior, or service APIs change.

## App Layer

The app layer is file-based. AI or a developer produces:

```text
app.info
main.lua
assets/...
```

The app directory is installed under:

```text
/sdcard/apps/<app-id>/
```

The launcher and HTTP service load these files from SD. Updating a normal Lua app does not rebuild or reflash firmware as long as the app only uses APIs already exposed by the runtime.

## Deployment Layer

The primary deployment path is staged:

```text
client
  -> POST /discard?app=<id>
  -> POST /stage?app=<id>&path=<relative> for each file
  -> POST /commit?app=<id>
  -> GET /apps
```

`/stage` writes to `/sdcard/.staging/<app-id>/`. `/commit` validates `app.info` and the declared entry file before replacing `/sdcard/apps/<app-id>/`. This prevents interrupted uploads from leaving a half-written launchable app.

The old direct `/install` endpoint remains as an explicit recovery/compatibility path.

## Control Surfaces

The same installed app registry and runner are controlled by several surfaces:

- native screen launcher: touch list, Stop, Refresh, failure display, BOOT fallback;
- browser Web Console: app list, upload, AI create, launch, stop, delete, status;
- host CLI: `upload:app`, `launch:app`, `delete:app`;
- raw HTTP API for scripts.

Current HTTP surface:

```text
GET  /
GET  /status
GET  /apps
POST /stage?app=<id>&path=<relative>
POST /commit?app=<id>
POST /discard?app=<id>
POST /install?app=<id>&path=<relative>
POST /rescan
POST /launch?app=<id>
POST /stop
POST /delete?app=<id>
```

## Browser AI Path

The first AI bridge lives in the browser, not on the ESP32:

```text
user prompt + OpenAI API key in browser
  -> browser calls OpenAI Responses API over HTTPS
  -> model returns strict JSON app files
  -> browser validates app id, paths, file types, and required files
  -> browser uploads through staged deployment
  -> runtime launches the committed app
```

The board never receives the OpenAI API key and never proxies model traffic. This keeps firmware simple and avoids putting secret handling on the ESP32. The tradeoff is that the key is visible to the browser session and browser tooling, so this path is intended for trusted local development.

## Safety Boundaries

- App ids and file paths are validated before writing to SD.
- Relative paths containing absolute roots, `..`, or backslashes are rejected.
- `/commit` refuses to replace the currently running app.
- `/delete` refuses to remove the currently running app.
- Staging data can be discarded without touching the installed app.
- Browser AI output uses strict schema validation plus client-side package validation before upload.
- Runtime/API compatibility is still a planned hardening item; for now, the validator and docs define the supported API surface.
