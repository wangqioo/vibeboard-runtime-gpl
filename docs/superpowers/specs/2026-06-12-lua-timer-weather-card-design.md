# Lua Timer Weather Card Design

## Goal

Make the SD-card weather card visibly dynamic without repeated firmware flashes or repeated SD-card copy cycles.

## Scope

This slice adds a small Lua timer runtime:

- `set_interval(ms, callback)`

The demo app changes the weather card location from `Shenzhen` to `Shanghai` and updates an `Updated 00s` label once per second.

This does not add Wi-Fi, real weather APIs, NTP time, images, fonts, or touch. It proves the runtime can keep a Lua app alive and repeatedly call Lua code after the initial UI draw.

## Runtime Behavior

The Lua app draws the card once, registers a one-second interval, prints `weather card dynamic ok`, then remains alive inside the Lua runner timer loop. Each interval updates one LVGL label and prints the first few ticks to serial for verification.

## Acceptance

- Static tests require `set_interval`, Lua callback refs, `lua_pcall`, and the updated Shanghai card script.
- `npm test` passes.
- `idf.py build` passes.
- Firmware is flashed once.
- SD card is written once at the end.
- On board, serial logs show `Lua app start: smoke_ui`, `weather card dynamic ok`, at least one `weather card tick`, and no Lua crash.
