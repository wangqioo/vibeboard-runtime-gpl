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
- `audio`: required for `i2s.` usage.
- `file`: required for `file.` usage.
- `module`: required for `require(` usage.

Package validation rejects missing metadata, missing entry files, entry paths outside the app directory, and restricted API usage without the matching capability declaration.
