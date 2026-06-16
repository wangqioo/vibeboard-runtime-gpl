# App Package Format

Each app is a directory containing `app.info` and an entry Lua file.

Minimal `app.info`:

```ini
name = Timer
entry = main.lua
description = Simple countdown timer
capabilities = lvgl,timer
```

Required fields:

- `name`: launcher display name.
- `entry`: Lua file inside the app directory.
- `description`: short summary.

Optional fields:

- `capabilities`: comma-separated runtime capabilities such as `lvgl`, `timer`, `network`, `audio`, `file`, `module`, or `service`.
- `kind`: app kind. `service` is reserved for background service-style apps.

Apps must declare special capabilities before using restricted runtime APIs in their entry Lua file:

- `network`: required for `http.`, `net.`, `mqtt.`, `websocket`, or `wifi.` usage.
- `timer`: required for `tmr.` or `set_interval(...)` usage.
- `audio`: required for `i2s.` usage.
- `file`: required for `file.` usage.
- `module`: required for `require(` usage.

Package validation rejects missing metadata, missing entry files, entry paths outside the app directory, and restricted API usage without the matching capability declaration.

## Package Manifest

`tools/app-packager` writes `manifest.json` beside the packaged app files. The
current schema is:

```json
{
  "schema": "vibeboard-runtime-app-package@2",
  "app": {
    "id": "weather",
    "name": "weather",
    "version": "0.0.0",
    "kind": "app"
  },
  "requires": {
    "runtime": ">=0.1.0",
    "luaApi": ">=0.1.0",
    "lvglApi": ">=0.1.0",
    "packageSchema": "vibeboard-runtime-app-package@2",
    "nativeAbi": null,
    "capabilities": ["network"]
  },
  "provides": {
    "services": []
  }
}
```

Optional `app.info` fields can override compatibility metadata:

```ini
version = 1.2.3
kind = service
requires.runtime = >=0.2.0
requires.luaApi = >=0.3.0
requires.lvglApi = >=0.4.0
requires.nativeAbi = >=2.0.2
provides.services = devtools,httpd
```

The current firmware still launches apps from `app.info`; device-side
manifest compatibility checks are a later productization step. The v2 manifest
is the toolchain contract for that runtime work.

## File Paths

Apps that declare `capabilities = file` can use the runtime `file` module.

Current path rules:

- relative paths resolve inside the current app directory;
- `.` resolves to the current app directory;
- `/sd/...` resolves to `/sdcard/...` for read/list operations;
- paths containing `..` are rejected;
- write operations are currently limited to app-local relative paths.

Supported build-verified APIs:

```lua
file.exists(path)
file.read(path)
file.getcontents(path)
file.write(path, data)
file.list(path)
file.listdir(path)
file.open(path, mode)
```

## LVGL Asset Paths

Build-verified LVGL asset helpers:

```lua
local path = lv_resolve_asset_path("assets/icon.bmp")
local ok = lv_asset_exists(path)
local image = lv_img_create(root)
lv_img_set_src(image, path)
```

Path conversion:

- `assets/icon.bmp` from `apps/weather` becomes `S:/apps/weather/assets/icon.bmp`;
- `/sd/apps/weather/assets/icon.bmp` also becomes `S:/apps/weather/assets/icon.bmp`;
- `S:/...` is passed through unchanged.

The `S:` LVGL filesystem drive is registered by the runtime and maps to `/sdcard`.
BMP decoding is enabled with `CONFIG_LV_USE_BMP=y` and `apps/smoke_visual`. The app is board-verified through serial/runtime progress logs and successful asset path resolution; BMP visual correctness still needs human screen confirmation. PNG/SJPG and LVGL binary image decoding are not enabled yet.

## Network App Config

Apps that declare `capabilities = network,file,timer` can keep local network smoke config in the app directory. The current `apps/smoke_network` convention is:

```text
apps/smoke_network/
  app.info
  main.lua
  wifi.example.json
  wifi.json          # local only, not committed with real credentials
```

Example `wifi.json`:

```json
{
  "ssid": "YOUR_WIFI_SSID",
  "password": "YOUR_WIFI_PASSWORD",
  "url": "http://worldtimeapi.org/api/timezone/Asia/Shanghai"
}
```

Build-verified network APIs:

```lua
wifi.mode("sta")
wifi.start()
wifi.sta.config({ ssid = config.ssid, password = config.password })
wifi.sta.connect()
local ip = wifi.sta.getip()

local response = http.get(config.url)
local data = sjson.decode(response.body)

time.settimezone("CST-8")
time.initntp("pool.ntp.org")
local now = time.get()
```

Without `wifi.json`, `apps/smoke_network` still runs its JSON/time smoke path and prints a clear missing-credentials message. With local credentials deployed on SD, WiFi, HTTP, JSON, and time/NTP are board-verified.

## Runtime WiFi Config

The runtime can also join WiFi during boot so the HTTP install service is reachable before any Lua app is launched.

Runtime-owned local config path:

```text
/sdcard/runtime/wifi.json
```

Example:

```json
{
  "ssid": "YOUR_WIFI_SSID",
  "password": "YOUR_WIFI_PASSWORD"
}
```

The runtime treats this file as optional. If it is absent or malformed, boot continues to the native launcher and the install service still starts. The current firmware also reads the existing local `/sdcard/apps/smoke_network/wifi.json` as a compatibility fallback for board bring-up; new setups should prefer `/sdcard/runtime/wifi.json`.
