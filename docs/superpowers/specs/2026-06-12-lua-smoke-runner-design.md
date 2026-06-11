# Lua Smoke Runner Design

## Goal

Prove that VibeBoard Runtime can execute a Lua file from the SD card.

## Scope

This slice runs a minimal smoke app from `/sdcard/apps/<app>/main.lua` and logs Lua `print()` output to ESP-IDF logging. It does not bind LVGL APIs, network APIs, timers, or the NodeMCU compatibility layer.

## Approach

The app registry will continue scanning `/sdcard/apps`, but it will also expose the first runnable app directory, display name, entry file, and absolute entry path. A new app runner will create a Lua state, register a minimal `print()` bridge, run the entry file, and return a status struct to the boot screen.

The first test app is `smoke`, not `weather`, because the current weather app depends on APIs that do not exist in the firmware yet. The success signal is a serial log line from Lua, followed by `Lua app ok`.

## Success Criteria

- Static tests prove the firmware has a Lua runner, uses the first discovered app entry path, and logs Lua success/failure.
- ESP-IDF build succeeds.
- SD card contains `/apps/smoke/app.info` and `/apps/smoke/main.lua`.
- Board serial log shows:

```text
Lua app start: smoke
hello from vibeboard lua
Lua app ok
```

## Follow-Up

After this slice works, the next slices are LVGL binding, timer binding, and then running a simple visual Lua app. Full weather app execution comes after those API bindings exist.
