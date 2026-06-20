# Native Module ABI Notes

Date: 2026-06-20

## Scope

This note documents what the imported NES path needs before VibeBoard Runtime implements full native module loading. The first loader slice is now implemented, but it is intentionally only a contract and failure-boundary checkpoint, not a playable NES patch.

Relevant source:

- `apps/nesgame/main.lua`
- `upstream/holocubic-nes-esp32/README.md`
- `upstream/holocubic-nes-esp32/docs/module_host_api_v1.md`
- `upstream/holocubic-nes-esp32/include/module_abi.h`

## Why NES Is Not Lua-Only

The NES slice is an emulator, not a normal LVGL app. It needs CPU, PPU, APU, cartridge mapper, ROM IO, frame timing, RGB565 frame generation, and high-frequency input updates. Upstream reports about 50 FPS on device through a native `nes.so` module. Rewriting that path in Lua would put the 6502/PPU/framebuffer loop on the same interpreter/timer path used by UI apps, which is not viable for predictable frame timing or display throughput.

Lua should remain the orchestration layer:

- ROM selector UI;
- gamepad state mapping;
- lifecycle start/stop;
- status and error display.

The emulator core, ROM mapper, frame loop, DMA line buffering, and optional audio path must stay native.

## Current App-Level Requirements

`apps/nesgame/main.lua` expects these Lua modules and constants:

```text
nes.PLAYER_1
nes.BTN_UP / BTN_DOWN / BTN_LEFT / BTN_RIGHT
nes.BTN_A / BTN_B / BTN_SELECT / BTN_START
nes.state()
nes.start(path, options)
nes.stop()
nes.input.set_mask(player, mask)
nes.input.clear(player)
gamepad.state()
gamepad.start(options)
gamepad.stop()
gamepad.on(event, callback)
gamepad.off()
gamepad.rescan()
gamepad.BTN_XBOX
gamepad.EVT_CONNECTING / EVT_CONNECT_FAILED / EVT_CONNECTED / EVT_DISCONNECTED / EVT_UPDATE
```

The local app currently starts NES through `nes.start(rom.path, build_runtime_options())` rather than the upstream object-style `nes.create(...):start()` API. The Runtime can support the local API first as long as the compatibility contract is documented.

Runtime options used by the local app:

```text
direct_render = true
target_fps = 60
frame_width = 256
frame_height = 240
transfer_rows = 48
center_on_screen = true
audio_enabled = false
audio_sample_rate = 22050
audio_ringbuf_samples = 2048
```

## Host ABI Required By Upstream NES

Upstream `nes.so` uses `module_host_api_v1` and exports:

```text
module_query_v1
module_create_v1
module_luaopen_v1
module_destroy_v1
```

The imported ABI version is:

```text
MODULE_ABI_VERSION = 0x00020002
MODULE_MANIFEST_MAGIC = "AMOD"
```

Minimum host groups needed for NES:

```text
serial: write / print / println / flush
sd: begin / mounted / open
file: read / seek / position / size_bytes / available / close
display: width / height / acquire / start_write / push_image_dma / end_write / release
time: millis / micros / delay / yield
heap: malloc / calloc / free / free_size / largest_free_block
task: create / remove / yield / delay
lua: Lua C API transfer table used by module_luaopen_v1
```

Optional or later:

```text
audio: required only after audio_enabled=true
gamepad host API: not required for the first local app because Lua maps gamepad state into nes.input.set_mask
```

## Display And Framebuffer Path

NES outputs 256x240 RGB565 frames. The VibeBoard screen is 320x240, so the first target can center the NES frame horizontally with a 32 px margin.

The native module expects a display surface with exclusive acquire/release semantics. During direct render, the emulator should own the display and the LVGL UI should not draw over it. Returning to the ROM selector must release the display and rebuild LVGL UI.

Minimum display contract:

- `display.acquire("nes", desc, out_surface)` rejects if another native renderer owns the display;
- `display.start_write(surface)` starts an RGB565 stream;
- `display.push_image_dma(surface, x, y, w, h, chunk)` submits contiguous RGB565 rows;
- `display.end_write(surface)` waits for pending DMA and closes the stream;
- `display.release(surface)` returns control to LVGL.

Memory assumptions from the local app:

- `transfer_rows=48`;
- one 256x48 RGB565 chunk is 24576 bytes;
- double buffering costs about 49152 bytes before emulator core allocations;
- chunk buffers must be DMA-capable internal memory unless the display driver can safely stage from PSRAM.

## File And ROM Requirements

The app scans ROMs from the SD card and the module reads `.nes` data through host file APIs. Required behavior:

- paths must resolve under SD, normally `/sd/nes`;
- reads must support seek and size queries;
- errors must distinguish missing file, unsupported mapper, bad header, and IO failure where possible.

Supported upstream mappers:

```text
0, 1, 2, 3, 4, 7, 15, 69, 226
```

NES 2.0 ROMs are explicitly not supported by upstream.

## Input Requirements

First pass:

- keep `gamepad.*` as a Lua module concern;
- Lua reads Xbox BLE/gamepad state;
- Lua maps state to NES 8-bit mask;
- Lua calls `nes.input.set_mask(nes.PLAYER_1, mask)`.

This keeps native NES loading independent from the full gamepad ABI. A later native gamepad host API can reduce latency, but it is not required for the first board milestone.

The local app also uses the board `key` module for selector navigation and app exit fallback. That path already exists from the 2048 migration.

## Loader Requirements

Firmware work should be split into separate vertical slices:

1. Add `module` and `native` capabilities and route `nesgame` through `local nes = require("nes")`. **Done as the first Runtime slice.**
2. Add static ABI headers under firmware source and expose `native_abi_version = vibeboard-native-module-abi@1` through `/status`. **Done as the first Runtime slice.**
3. Add a native module searcher and loader failure surface that reports precise errors before the NES core is ported. **Done as the first Runtime slice.**
4. Add manifest checks. **Done as a manifest-first Runtime slice for the app-local `native/nes.vbn` payload descriptor:**
   - magic equals `MODULE_MANIFEST_MAGIC`;
   - `abi_version == MODULE_ABI_VERSION`;
   - `min_host_version` is supported.
5. Add an ESP-ELFLoader-backed loader that can open `/sd/modules/nes.so` or an app-local native payload and resolve the required symbol.
6. Add host API stubs group-by-group, starting with serial/time/heap/file, then display/task/Lua table.
7. Only after the loader works, build/import `nes.so`.

Failure messages must be explicit:

```text
Native module load failed
Native module symbol missing: module_create_v1
Native module ABI mismatch
Native module host API unsupported: display.push_image_dma
```

Current first-slice implementation:

```text
module_abi.h
native_module_loader.c/.h
lua_native_module.c/.h
app_runner installs vb_lua_native_module_register(L, app) before loading main.lua
install_service /status reports native_abi_version = vibeboard-native-module-abi@1
apps/nesgame declares capabilities = lvgl,file,timer,input,module,native
```

Current manifest descriptor format:

```text
magic = VBNM
abi = vibeboard-native-module-abi@1
symbol = vb_native_module_init
min_host = vibeboard-native-host@1
```

The current loader validates this descriptor and reports `Native module load failed`, `Native module ABI mismatch`, `Native module symbol missing`, or `Native module host API unsupported` before any native code is exposed to Lua. If the descriptor is valid, `require("nes")` returns a minimal NES Lua stub table:

```text
PLAYER_1
BTN_UP / BTN_DOWN / BTN_LEFT / BTN_RIGHT
BTN_A / BTN_B / BTN_SELECT / BTN_START
state()
start(path, options)
stop()
input.set_mask(player, mask)
input.clear(player)
```

The stub keeps `nesgame` bound to the final API shape, but `start(path, options)` still returns `false, "native executor pending"`. This keeps failure behavior explicit while the real ELF/static native executor and NES host API are still pending.

## First Board Milestone

The first useful board milestone is not full game performance. It is:

```text
/sd/modules/nes.so exists
/sd/apps/nesgame exists
/sd/nes contains at least one supported test ROM
nesgame launches
ROM selector renders
nes module status is visible
starting a ROM either renders frames or reports a precise missing host API
app stop returns to Launcher without wedging display ownership
```

## Open Decisions

- Whether to preserve the upstream object-style API (`nes.create`) in addition to the local flat API (`nes.start`, `nes.state`, `nes.input.*`).
- Whether display ownership should be a generic native-renderer service or NES-specific in the first slice.
- Whether native task stacks must be forced into internal RAM or can use SPIRAM with measured frame-time impact.
- Whether audio should stay disabled until video/input are board-verified.
- Whether to import ESP-ELFLoader as an IDF component in the Runtime firmware or build `nes.so` as a separately versioned artifact first.
