# Next Session Plan

Date: 2026-06-19

## Current Baseline

```text
local main with 2048 migration, board-memory fixes, expanded app registry, six schema v2 apps uploaded, migrated app HTTP lifecycle re-verified, independent key smoke software path board-verified, uploader delete orchestration implemented, pending physical visual QA and commit/push
```

The local work after the previous baseline migrates the upstream `2048` app and adds the minimum runtime API surface it needs. It also includes hardware-driven fixes from the 2026-06-19 temporary Runtime flash, a non-destructive `device:check` preflight, the first board-verified touch-swipe-to-`key.on` bridge, and an app-local double-confirm guard for `2048` exit events. `2048` now launches from SD, remains running on the board, and has user-confirmed physical swipe plus double-exit behavior. The board currently lists 23 SD apps: seven compatible schema v2 apps and sixteen legacy schema v1 apps that remain on SD but are intentionally hidden from the native Launcher. HTTP launch/status checks have re-verified `matrix_rain`, `nixie_clock`, `clock`, `conway_life`, `fluid_pendant`, and `2048`, including the `conway_life -> fluid_pendant` switch path after increasing the shared stop wait to 5000 ms. The worktree is intentionally dirty until the user asks to commit/push; do not reset it.

## What Is Done

- Phase 5A native launcher MVP is board-verified.
- The device boots to `VibeBoard Apps` instead of auto-running the first app.
- Touch tap-to-launch works on the device screen.
- BOOT short press selects; BOOT long press launches.
- HTTP install, app listing, rescan, launch, stop, and switch are implemented.
- Missing app entry files are filtered before they enter the launchable app list.
- Phase 5B lifecycle-state foundation is board-verified:
  - `/status` includes `state`.
  - states are `idle`, `starting`, `running`, `stopping`, `failed`.
  - compatibility fields `running` and `current_app` remain.
- A real launcher/Lua screen ownership crash was reproduced and fixed:
  - launching `smoke_visual_remote`, then short-pressing BOOT used stale launcher LVGL pointers;
  - `launcher_ui.c` now deactivates launcher controls after handing the screen to a Lua app;
  - static tests and firmware build pass;
  - fixed firmware was flashed to the board and board-verified.
- `apps/smoke_fail` exists as an intentional Lua failure sample for lifecycle checks.
- Phase 5B launcher lifecycle controls are implemented and build-verified:
  - native Stop control requests runner stop and waits for completion;
  - native Refresh control rescans the SD app registry and rebuilds the launcher list;
  - stopping an app or observing an async app failure returns to the native launcher;
  - launcher failure feedback uses the runner last-result message;
  - BOOT long press can stop a running app while the launcher is inactive.
- Runtime WiFi autoconnect is implemented and board-verified:
  - boot reads `/sdcard/runtime/wifi.json`;
  - the current test board also accepts the existing local `/sdcard/apps/smoke_network/wifi.json`;
  - boot logs `runtime sta got ip 192.168.1.32` without manually launching `smoke_network`.
- Uploader reliability cleanup is implemented and board-verified:
  - `upload:app` and `launch:app` default to Node native HTTP;
  - `nc` remains available as an explicit `--transport nc` fallback.
- Native HTTP upload/launch board check passed without `--transport nc`:
  - uploaded `smoke_visual_native`;
  - `/rescan` and `/apps` confirmed it;
  - launched `smoke_visual_native`, `smoke_fail`, and `smoke_network`.
- Launch verification exposed a board-side HTTPD stack overflow in `/launch`; the install service now sets `config.stack_size = 8192`, and the post-fix board launch check passed.
- App package manifest v2 is implemented:
  - `tools/app-packager` emits `schema = vibeboard-runtime-app-package@2`;
  - manifests include structured `app`, `requires`, and `provides` sections while preserving existing top-level fields;
  - app registry exposes manifest-derived schema/version/kind/capabilities/compatible metadata through `/apps`.
- Runtime version metadata is exposed through `/status`:
  - runtime version;
  - Lua API version;
  - LVGL API version;
  - package schema;
  - native ABI version;
  - last status/message.
- Deployment productization first slice is implemented:
  - staged file upload using `/sdcard/.vibeboard-staging/<stage>`;
  - `/install/commit`;
  - `/install/abort`;
  - `/apps/delete`;
  - uploader defaults to staged upload + commit;
  - `--legacy-direct` keeps the old direct install flow available.
- Deployment productization follow-up slice is implemented:
  - `tools/app-uploader` exposes `getStatus`, `listApps`, `stopApp`, and `deleteApp`;
  - `npm run delete:app -- <board-url> <app-id>` stops the target app first when it is currently running, calls `/apps/delete`, and confirms absence through `/apps`;
  - `--no-stop` is available for callers that want raw delete semantics.
- Weather migration API gap first slices are build-verified:
  - Runtime now exposes `json.decode` and `json.encode` as aliases of existing `sjson.decode` and `sjson.encode`;
  - Runtime now exposes `http.cubicserver.get(path, headers, callback)` for migrated `weather` compatibility;
  - the Cubic facade maps relative paths through a default base URL and calls the Lua callback with `status_code`, `body`, and a headers table;
  - static tests keep the alias visible for migrated `weather` and `voice_ai` compatibility;
  - ESP-IDF build passes with `vibeboard_runtime.bin` size `0x177a70`, still 63% free in the app partition.
- Upstream display apps migrated so far:
  - `apps/matrix_rain` from upstream `MatrixRain`;
  - `apps/nixie_clock` from upstream `NixieClock`;
  - `apps/clock` from upstream `clock`.
  - `apps/conway_life` from upstream `ConwayLife`.
  - `apps/fluid_pendant` from upstream `FluidPendant`.
  - `apps/2048` from upstream `2048`.
- Runtime compatibility added during these app migrations:
  - minimal LVGL canvas binding;
  - PNG decoder enabled;
  - `time.getlocal()`;
  - image antialias, angle, pivot, zoom helpers;
  - `lv_font_load`/`lv_font_free` fallback compatibility;
  - common text style helpers and LVGL constants.
  - `millis()` global compatibility.
  - Lua `key` module with `key.on`, `key.off`, `key.push`, direction constants, and `SHORT`/`EXIT` compatibility aliases.
  - board-verified touch-swipe input bridge: hardware task enqueues key events, Lua runner drains them on the Lua/timer loop, and app stop cleans up the queue/callbacks.
  - LVGL object delete/foreground, opacity, gradients, shadows, and property animation helpers needed by `2048`.
  - `apps/smoke_key` input smoke app: shows the latest key event on screen and injects alternating LEFT/RIGHT events through `key.push()` for software-triggered input verification.
  - `apps/smoke_key` was packaged, uploaded, launched, and board-verified through serial logs showing alternating `LEFT`/`RIGHT` callbacks from `key.push()`.
  - smoke-app key labeling regression fixed: `key.START` is an event type, not a key-code label, and static tests now prevent reintroducing `[key.START] = "START"` in the smoke app name table.
- Firmware bring-up fixes from the 2026-06-17 board reflash:
  - main task stack increased to 8192 so SD app scanning no longer overflows `main`;
  - install service `max_uri_handlers` raised to 12 so all current HTTP endpoints can register;
  - LVGL display driver now yields in `wait_cb` while waiting for flush completion, avoiding task watchdog starvation in the observed refresh path.
- Firmware bring-up fixes from the 2026-06-19 temporary Runtime flash:
  - LCD draw buffer moved to internal DMA memory with a smaller 5-row buffer so SPI flushes do not depend on temporary internal TX-buffer allocation under WiFi pressure;
  - HTTPD stack allocation moved to SPIRAM-capable memory so the install service can start with the 8192-byte stack;
  - `/apps` now streams chunked JSON, avoiding fixed-buffer truncation when many apps are installed;
  - app registry capacity is now 32 and the large registry/rendered-app buffers are allocated from PSRAM so `/apps` and uploader confirmation can see later schema v2 uploads when many legacy apps remain on SD;
  - shared app stop/switch wait is now `VB_APP_RUNNER_STOP_TIMEOUT_MS = 5000` after `conway_life` exposed a clean-but-slower stop path that exceeded the previous 1500 ms window;
  - Lua runner tasks now use SPIRAM-capable stacks, addressing the observed `ESP_ERR_NO_MEM` when launching `2048`;
  - FATFS/SDMMC memory policy now reserves more internal DMA memory, disables FATFS external-RAM preference, enables `SDMMC_HOST_FLAG_ALLOC_ALIGNED_BUF`, and loads Lua scripts through an internal DMA-capable 512-byte reader;
  - LVGL Lua object handles now reuse freed slots, clear registered child handles before `lv_obj_clean`/`lv_obj_del`, and allow up to 128 live handles after `2048` exposed `lvgl object table full`.
- 2048 gameplay safety:
  - exit events handled inside `apps/2048` now require the same `HOME`/`EXIT` event twice within 1.2 seconds before stopping the app;
  - normal directional movement remains immediate;
  - physical swipe gameplay and double-exit behavior were confirmed by the user on the device.
- 2026-06-19 temporary board verification:
  - `/dev/cu.usbmodem112301` identified as Espressif ESP32-S3, MAC `10:51:db:80:e2:e8`;
  - VibeBoard Runtime booted after erase+flash and served `/status` at `192.168.1.32:8080`;
  - `/apps` returned complete chunked JSON with `2048` marked compatible;
  - Launcher and HTTP launch now reject old incompatible schema v1 packages instead of attempting to launch them;
  - `npm run upload:app -- http://192.168.1.32:8080 dist/apps/2048 2048` uploaded 5 files, committed, and confirmed `2048` in `/apps`.
  - `POST /launch?app=2048` succeeded and repeated `/status` polls stayed `state=running,current_app=2048,last_status=ESP_OK`.
  - `2048` now avoids unsupported no-arg frame batch calls and unsupported small canvas blur; game-over overlay uses ordinary LVGL objects until arbitrary-size canvas support exists.
  - after the LVGL object-handle tree cleanup and 128-handle limit, a rebuilt/flashed Runtime kept `2048` running for about 90 seconds of repeated `/status` polling with `last_status=ESP_OK` and no `lvgl object table full`.
  - after expanding the registry and moving large buffers to PSRAM, `npm run upload:app` confirmed `matrix_rain`, `nixie_clock`, `clock`, `conway_life`, and `fluid_pendant` through `/apps`.
  - latest `/status` returned `app_count=22,state=idle,last_status=ESP_OK`; latest `/apps` showed compatible v2 apps `2048`, `matrix_rain`, `nixie_clock`, `clock`, `conway_life`, and `fluid_pendant`.
  - full shared-board recovery must use `idf.py -p /dev/cu.usbmodem112301 erase-flash flash`; a normal flash can leave the board booting the user's other project partition layout.
  - after full erase+flash, HTTP lifecycle checks verified `nixie_clock`, `matrix_rain`, `clock`, `conway_life`, and `fluid_pendant` as `state=running,current_app=<id>,last_status=ESP_OK`.
  - `conway_life -> fluid_pendant` initially returned `500 app stop timeout`; after replacing hard-coded 1500 ms waits with `VB_APP_RUNNER_STOP_TIMEOUT_MS = 5000`, the same switch returned `launched fluid_pendant` and `/status` showed `current_app=fluid_pendant,last_status=ESP_OK`.
  - follow-up HTTP lifecycle regression re-verified `matrix_rain`, `nixie_clock`, `clock`, `conway_life`, `fluid_pendant`, and `2048` as `state=running,current_app=<id>,last_status=ESP_OK`; `conway_life -> fluid_pendant` still switched cleanly without stop timeout.
- Shared board warning:
  - the ESP32-S3 board is also used for the user's other ESP32 firmware;
  - do not assume VibeBoard Runtime remains flashed between sessions;
  - before hardware verification, identify the port and current firmware, then temporarily flash VibeBoard Runtime if needed.
- Tooling guardrails:
  - `npm run device:check` performs the non-destructive shared-board preflight;
  - validator tests keep migrated App capabilities aligned with static API usage;
  - firmware static tests now track migrated-App Runtime API gaps before board runs.

## Last Verified Commands

```text
npm run test:firmware-static
npm run test:packager
npm run test:device-check
npm test
git diff --check
idf.py build
```

The latest full verification for migration work passed through package/static/test/build layers. The latest ESP-IDF build generated `vibeboard_runtime.bin` size `0x1777c0`, with 63% free in the 4 MB app partition. Build warning: `esp_lcd_touch_get_coordinates` is deprecated and should later move to `esp_lcd_touch_get_data`.

On 2026-06-18, `/dev/cu.usbmodem11301` identified as:

```text
USB Product Name = CDC ACM serial backend
USB Vendor Name = Zephyr Project
idVendor = 12259
idProduct = 4
```

That was not the ESP32-S3 Runtime board used earlier, whose MAC was `10:51:db:80:e2:e8`. On 2026-06-19, the correct ESP32-S3 board was reconnected as `/dev/cu.usbmodem112301` and temporarily flashed for VibeBoard verification. Because this board shares flash with the user's other ESP32 project, use `erase-flash flash` for VibeBoard verification when serial logs show `Project name: esp32s3_device` or the partition table has factory app offset `0x20000`. At the end of this session it is running VibeBoard Runtime with `fluid_pendant`, but next session must still start by checking current firmware because the shared board may be reflashed back to the user's other project.

## Immediate Next Work

### 1. Confirm or temporarily flash the ESP32-S3 Runtime board

Before uploading apps, confirm the connected USB device is the ESP32-S3 board and check which firmware is currently on it. This physical board may be running the user's other ESP32 project firmware.

Suggested checks:

```text
npm run device:check
```

Expected result:

- the check lists candidate `/dev/cu.usbmodem*` ports;
- the check reports whether `chip_id` looks like ESP32-S3;
- the check reports whether `http://192.168.1.32:8080/status` is reachable and looks like VibeBoard Runtime;
- serial boot logs show `Project name: vibeboard_runtime`; if they show the user's other firmware, temporarily flash VibeBoard Runtime before testing;
- runtime WiFi autoconnect runs;
- `/status` returns JSON from the install service;
- no `stack overflow in task main`;
- no repeated `task_wdt` report from `LVGL task`;
- no `ESP_ERR_HTTPD_HANDLERS_FULL`.

If `/status` is still unreachable but serial shows the board is alive, inspect runtime WiFi state and whether an existing SD app is interfering with the launcher/install-service path.

### 2. Board verification for migrated apps

After temporarily flashing Runtime if needed, these apps are already uploaded as compatible schema v2 packages and have HTTP launch/status evidence. Next pass should focus on physical screen observations and any visual defects:

- `matrix_rain`;
- `nixie_clock`;
- `clock`;
- `conway_life`;
- `fluid_pendant`;
- `2048`.

Suggested ownership:

```text
docs/device-bringup.md
tools/app-uploader/
dist/apps/
```

Expected result: each app has screen observations recorded. `2048` already has upload/list/launch HTTP verification plus user-confirmed physical swipe and two-swipe exit behavior from 2026-06-19; next session only needs a quick regression check if the firmware or app changes again. If an app appears in `/apps` as `compatible:false`, it is an old schema v1 package still present on SD; re-upload the current schema v2 package before expecting it to appear in the Launcher.

### 3. Extend real input coverage beyond 2048

The first real touch-swipe path is board-verified through `2048`. Next, broaden coverage so input is not only proven by one game.

Expected result:

- `smoke_key` upload/launch is done and serial logs verify injected LEFT/RIGHT events through `key.push()` and `key.on`;
- still confirm on the physical screen that the event label updates for the injected LEFT/RIGHT events;
- still swipe left, right, up, and down on the device screen and record whether those physical gestures update the same `smoke_key` label;
- add `smoke_touch` later if raw coordinates are needed beyond key-style swipe events;
- keep `2048` as a regression check for directional gameplay and double-exit behavior;
- `key.push(...)` remains available for software-triggered tests;
- event cleanup is tied to Lua VM/app shutdown.

### 4. Choose the next upstream migration slice

After input work, choose one. Current recommendation is `weather`, in this order:

- `weather` to harden network UI compatibility:
  - `json.decode/encode` alias to existing `sjson` is board-verified through the weather response decode path;
  - `http.cubicserver.get` compatibility facade is board-verified;
  - gzip strategy is chosen: `weather` no longer requests gzip and no longer depends on `zlib.gunzip`/`zlib.isgzip`;
  - Cubic server base URL is configurable through `/sdcard/runtime/cubicserver.json` and writable through `POST /runtime/config?name=cubicserver`;
  - `weather` canvas image/blur glass effects are downgraded to ordinary LVGL panels for current Runtime canvas limits;
  - `weather` was packaged, uploaded as a 37-file slim package, launched on the board, and stayed `state=running,current_app=weather,last_status=ESP_OK`;
  - board test passed with local Cubicserver mock `base_url=http://192.168.1.26:8791`; the mock received `GET /v1/weather/now?location=101210401&unit=m`;
  - later decide whether to restore richer image/blur visuals through Runtime canvas expansion or keep the lighter LVGL panel style;
- another light interactive app if input still needs shaping;
- a smaller non-interactive display app if board verification exposes LVGL stability issues.

Use the same TDD migration slice: API inventory, RED static test, minimal Runtime binding, local app package, package/static/test/build verification.

### 5. Remaining deployment productization

Deployment now has staged upload/delete and the first local browser UI. Still remaining:

- persistent runtime WiFi config location outside compatibility fallback.

Implemented 2026-06-20:

- `npm run device:web -- --board http://192.168.1.32:8080 --port 8790`;
- local proxy endpoints for `/api/status`, `/api/apps`, `/api/launch`, `/api/stop`, `/api/rescan`, and `/api/delete`;
- page separates compatible apps, legacy apps, current running app, `last_status`, and `last_message`;
- board smoke through `http://127.0.0.1:8790/api/status` and `/api/apps` saw `current_app=weather`, 24 SD apps, and a valid HTML page.
- `npm run device:web:smoke -- --board http://192.168.1.32:8080 --base http://127.0.0.1:8790` uploaded a temporary `web_ui_smoke` app, exercised launch, stop, rescan, and delete through the local Web UI proxy, then confirmed `/apps` had 24 apps and `has_web_ui_smoke=false`.
- `npm run upload:interrupted-smoke -- http://192.168.1.32:8080 interrupted_upload_smoke` created a temporary staged app package, intentionally failed at `main.lua`, verified `/install/abort`, and confirmed the temporary app was absent from `/apps`; board remained idle with 24 apps.

Suggested commit split from the parallel worktree audit:

1. `runtime: harden memory layout for larger SD app sets`
2. `runtime: bridge touch swipes into Lua key events`
3. `runtime: add LVGL object lifecycle, style, and animation bindings`
4. `apps: add 2048 runtime migration`
5. `runtime: add Cubicserver config and weather compatibility`
6. `tools: add shared-board checks and device web UI`
7. `tools: validate lvgl input capabilities for migrated apps`
8. `docs: document NES native module ABI requirements`

### 6. NES native module checkpoint

`docs/native-module-abi-notes.md` now captures the required NES native-module shape and the first Runtime loader slice:

- `nes.so` must stay native; Lua-only is not viable for emulator timing, mapper logic, and RGB565 frame throughput;
- first loader target is `module_host_api_v1` with manifest/symbol checks;
- required host groups are serial, SD/file, display, time, heap, task, and Lua transfer table;
- first display path is exclusive native ownership plus RGB565 DMA chunks centered in the 320x240 display;
- gamepad can remain Lua-side for the first milestone by mapping controller state to `nes.input.set_mask`;
- first loader slice is implemented: `module_abi.h`, `native_module_loader.*`, `lua_native_module.*`, `/status.native_abi_version = vibeboard-native-module-abi@1`, and `apps/nesgame` now uses `local nes = require("nes")`;
- manifest-first loader validation is implemented for app-local `native/nes.vbn` descriptors with `magic = VBNM`, `abi = vibeboard-native-module-abi@1`, `symbol = vb_native_module_init`, and `min_host = vibeboard-native-host@1`;
- `apps/smoke_nes` is implemented as an independent native-module smoke app and demo package entry, validating `require("nes")`, `nes.state()`, `nes.input.set_mask`, and the expected `native executor pending` result without depending on the full `nesgame` UI;
- after manifest validation, the Runtime now routes native modules through `native_module_static_adapter.*`, giving the NES port a concrete static `vb_native_module_init` adapter seam before a real ELF loader or emulator core is wired in;
- `module_host_api.*` now defines and initializes the first native host API groups: serial output, time/yield/delay, heap allocation, and SD-rooted file open/read/seek/position/size/available/close;
- current loader intentionally returns precise missing payload/symbol/ABI/host API errors and, after a valid descriptor, exposes a minimal NES Lua stub table whose `start(...)` returns `false, "native executor pending"`; it does not include the NES emulator core.

The next NES implementation slice should be ELF/static native payload execution and the first host API group, not full emulation:

- replace the static adapter placeholder with a real linked NES adapter entrypoint or add ELFLoader/import resolution behind the same `vb_native_module_init` contract;
- extend host APIs with display/task/Lua transfer table after the linked adapter can consume the first host API group;
- leave display DMA, audio, and native gamepad host API for later slices.

## Parallelization Guidance

Safe parallel tracks now:

- Board verification of already migrated display apps.
- Next app API inventory and RED static tests.
- Browser UI design for deployment management.
- Lua input-event design and implementation: real touch/button to `key.on` or `touch.on`.

## Deferred

Do not implement Lua `app.*` APIs yet. Keep them deferred until there is a concrete Lua-side workflow such as a Lua desktop, in-app navigation, or app-to-app handoff.
