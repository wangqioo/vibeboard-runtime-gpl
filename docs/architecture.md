# Architecture

VibeBoard Runtime GPL has two layers.

The runtime layer is ESP-IDF firmware flashed onto the ESP32-S3 device. It owns hardware drivers, Lua, LVGL bindings, the launcher, storage, network services, and optional native-module ABI.

The app layer is file-based. AI or a developer produces an app directory with `app.info`, Lua entry files, and assets. The device launcher loads these files from storage without rebuilding or reflashing the whole firmware.

```text
runtime firmware
  -> launcher
  -> app.info
  -> Lua entry
  -> LVGL screen
  -> optional native module
```
