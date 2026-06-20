# AI Generation Contract

The AI generator must output a package plan before files.

JSON is an intermediate generation plan used by VibeBoard tooling, not the
on-device package format. The on-disk package is app.info + Lua/assets directory,
as documented in [App Package Format](app-package-format.md).

```json
{
  "app": {
    "name": "Timer",
    "entry": "main.lua",
    "description": "Simple countdown timer",
    "capabilities": ["lvgl", "timer"]
  },
  "files": [
    {
      "path": "app.info",
      "type": "text",
      "content": "name = Timer\nentry = main.lua\ndescription = Simple countdown timer\ncapabilities = lvgl,timer\n"
    },
    {
      "path": "main.lua",
      "type": "lua",
      "content": "print(\"timer\")\n"
    }
  ]
}
```

The package plan maps to the on-disk app package as follows:

- `app` metadata becomes `app.info` fields.
- `files[]` becomes files written inside the app directory.
- `app.entry` must name the Lua entry file written by `files[]`.
- Generated asset paths must stay inside the app directory.

Write a package plan to disk:

```bash
npm run write:app-plan -- plan.json
```

Write and package it for device-storage deployment:

```bash
npm run write:app-plan -- plan.json --package
```

The writer generates `app.info` from `app` metadata. If `files[]` also contains `app.info`, the generated metadata wins so the plan has one authoritative metadata source.

Default output:

```text
generated/apps/<app-id>/
```

With `--package`, the existing packager also writes:

```text
dist/apps/<app-id>/
```

Prefer Lua/LVGL app generation when the request is for:

- small-screen UI;
- dashboard or status card;
- simple tool;
- simple game;
- AI widget;
- network card using existing runtime APIs.

## Allowed Runtime Lua APIs

Generated apps must stay inside the Runtime Lua API surface below. If a request needs any other runtime module call, return `Runtime update required` instead of inventing a function.

Allowed module calls:

- `app.list()`, `app.rescan()`, `app.current()`, `app.exiting()`, `app.exit()`, `app.launch(id)`, `app.set_home_exit(enabled)`, `app.on("exit", callback)`
- `file.exists(path)`, `file.open(path, mode)`, `file.read(path)`, `file.getcontents(path)`, `file.write(path, text)`, `file.list(path)`, `file.listdir(path)`
- `gamepad.state()`, `gamepad.start(opts)`, `gamepad.stop()`, `gamepad.on(event, callback)`, `gamepad.off([event])`, `gamepad.rescan()`, `gamepad.push_state(state)`
- `http.get(url[, opts], callback)`, `http.post(url[, opts], body, callback)`, `http.cubicserver.get(path, headers, callback)`
- `i2s.start(id, opts)`, `i2s.read(id, max_bytes[, timeout_ms])`, `i2s.stop(id)`, `i2s.status(id)`
- `json.decode(text)`, `json.encode(value)`, `sjson.decode(text)`, `sjson.encode(value)`
- `key.on(callback)`, `key.off()`, `key.push(code, event)`
- `time.get()`, `time.getlocal()`, `time.settimezone(tz)`, `time.initntp(host)`
- `tmr.create()`, `tmr.now()`, `tmr.time()`, plus timer object `alarm/start/stop/unregister/state/interval`
- `touch.on(callback)`, `touch.off()`, `touch.push(event, x, y[, ts_ms])`
- `wifi.mode(mode)`, `wifi.start()`, `wifi.sta.config(opts)`, `wifi.sta.connect()`, `wifi.sta.getip()`

Examples that must return `Runtime update required`: `app.set_status_text(...)`, `gamepad.connect(...)`, `i2s.write(...)`, `tmr.delay(...)`, unsupported `lv_*` bindings, native ABI changes, or hardware driver work.

Return or report `Runtime update required` when the request needs:

- driver changes;
- pin-map changes;
- BLE service changes;
- partition or sdkconfig changes;
- LVGL bindings not exposed by the runtime;
- native module ABI changes.

Requests that return `Runtime update required` must route to firmware/runtime
work instead of pretending the app package can provide the missing driver,
binding, partition, or ABI support.
