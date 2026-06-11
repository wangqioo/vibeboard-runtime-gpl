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

Package validation rejects missing metadata, missing entry files, and entry paths outside the app directory.
