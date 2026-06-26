# Next Session Plan

Date: 2026-06-25

## Current Baseline

```text
local main with Weather/Web UI/deployment productization, Weather 320x240 BMP canvas background metrics, Lua app manager lifecycle APIs, BOOT-to-Lua HOME forwarding, HTTP key/gamepad smoke hooks, smoke_key repeat metrics, Voice AI mock record/upload/reply with GIF metrics, I2S RX nonzero PCM plus sustained TX-only 440Hz tone-write smoke, NES host-audio backend board smoke, NES legal-ROM frame/audio smoke, nesgame selector/gamepad injection board evidence, smoke_nes native host gamepad synthetic board evidence, BTC minimal network price-panel board smoke through a local mock, Settings minimal key-driven panel board smoke, hwmon minimal host metrics board smoke through a local mock, Spectrum real-audio visualizer board smoke, videos GIF playlist board smoke, photos PNG image playlist board smoke, plane sprite game board smoke, lv-benchmark minimal runtime benchmark board smoke, and Codex Buddy bridge/GIF/HOME permission board smoke; board-only physical visual/audio/input checks and real external provider/network checks remain
```


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
  - 2026-06-21 regression recovery disables WiFi NVS and PHY calibration storage, uses full PHY calibration, and verifies `wifi:config NVS flash: disabled`, `WiFi/LWIP prefer SPIRAM`, and `runtime sta got ip 192.168.1.32`.
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
- `/status` now emits valid JSON for `native_abi_version`; `npm run device:check` recognizes the board as VibeBoard Runtime through status metadata.
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
- Runtime-owned config writes are implemented and build-verified:
  - `POST /runtime/config?name=cubicserver` still writes `/sdcard/runtime/cubicserver.json`;
  - `POST /runtime/config?name=wifi` now writes `/sdcard/runtime/wifi.json`;
  - `POST /runtime/config?name=i2s` writes `/sdcard/runtime/i2s.json`;
  - `npm run runtime:config -- <board-url> <wifi|cubicserver|i2s> <json-file|-|json>` provides the local tool wrapper;
  - `npm run runtime:config:smoke -- <board-url> <wifi|cubicserver|i2s> <json-file|-|json>` writes a config and verifies `/status` still looks like VibeBoard Runtime;
  - `POST /reboot` is now implemented, and `npm run runtime:config:smoke -- --reboot --reboot-polls 45 --reboot-delay-ms 1000 ... i2s ...` was board-verified after flashing the updated Runtime, returning `runtime config smoke ok: i2s state=idle runtime=0.1.0 polls=2`;
  - board verification of writing WiFi credentials, rebooting, and joining WiFi from `/sdcard/runtime/wifi.json` without the legacy smoke-network fallback remains pending only because no real local WiFi credentials file is present in the repo; I2S config write/reboot and nonzero PCM through `apps/smoke_i2s` are now board-smoked.
  - I2S TX driver-write smoke is board-verified with `i2s.write`, `dout_pin`, `writes`, and `tx_bytes`; 2026-06-24 added sustained low-DMA TX-only 440Hz tone metrics with `tone_writes=18,tx_bytes=4608`. Physical ES8311/amp/speaker playback is still pending.
  - NES `module_audio_api_t.begin/write/end` is now wired to `vb_i2s_tx_stream_begin/write/end`; after adding `audio_backend/audio_error` metrics and moving the `nes_apu` task stack to SPIRAM in the v1 shim, board smoke passed with `--require-audio-backend host`.
  - `runtime:config:smoke` now accepts `--expect-app-count <n>` and `--expect-ip <ip>`, so the eventual real WiFi credential smoke can require the board to come back as the expected Runtime instance after reboot.
- Weather migration API gap first slices are build-verified:
  - Runtime now exposes `json.decode` and `json.encode` as aliases of existing `sjson.decode` and `sjson.encode`;
  - Runtime now exposes `http.cubicserver.get(path, opts, callback)` for migrated `weather` compatibility;
  - the Cubic facade maps relative paths through `/sdcard/runtime/cubicserver.json` `base_url`, accepts `timeout_ms`, calls the Lua callback with `status_code`, `body`, and a headers table, and now fails fast when the config is missing instead of falling back to `http://cubicserver.local`;
  - `apps/weather` declares `file`, checks `/sd/runtime/cubicserver.json` before requesting weather, and defers its first network fetch until after startup so missing config does not trigger a blocking `.local` lookup;
  - `apps/weather` now starts through a lightweight text shell, then uses one `stage_boot` timer to serially build the main UI, load fonts, and publish a lightweight assets-ready gate without exceeding the Runtime timer limit;
  - `apps/weather` now avoids synchronous large resource teardown after image/font assets are active, so `/stop` can return promptly instead of waiting on LVGL screen/font cleanup;
  - board verification passed both immediate `npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500` and manual delayed stop after 3 seconds of running;
  - `apps/weather` now writes `apps/weather/metrics.json` with `ui_ready`, `fonts_ready`, `assets_ready`, `visual_assets_ready`, `visual_asset_attempts`, `visual_asset_error`, `background_ready`, `background_attempts`, `background_error`, `boot_stage`, `startup_visible`, `last_error`, and `forecast_error`;
  - `tools/lifecycle-smoke` now supports `--metrics-polls`, `--metrics-interval-ms`, and repeated `--require-metrics key=value` checks against `/apps/file?app=<app>&path=metrics.json`;
  - metrics-gated board verification now passes after uploading the updated package: `npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --metrics-polls 30 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics fonts_ready=true --require-metrics assets_ready=true --require-metrics boot_stage=3 --stop --stop-polls 35 --stop-interval-ms 500` returned `metrics={"ui_ready":true,"fonts_ready":true,"assets_ready":true,"boot_stage":3,"startup_visible":false,...}` and `stop_state=idle`;
  - a follow-up board smoke also requires `visual_assets_ready=true` and `visual_asset_attempts=1`, proving the app can lazily create the main weather icon plus the precip/humidity/wind small icons without re-entering a blocking full-UI rebuild;
  - an intermediate board run proved that synchronously rebuilding the full PNG image UI inside the assets stage can wedge the app in `assets loading` and leave Runtime in `state=stopping`; the landed guardrail keeps `stage_assets()` lightweight, forbids `init_ui()` in that stage, and only permits small-icon lazy loading there.
  - 2026-06-25 follow-up fixed `firmware/vibeboard_runtime/main/lua_tmr.c` so timer slots have generation-checked handles, timers created from callbacks defer to the next scheduler pass, and one-shot timers release their slots after callbacks. After flashing that firmware and uploading Weather, the metrics-only background probe passed board smoke with `background_ready=true`, `background_attempts=1`, `background_error=""`, and stop returned to idle. A later negative board probe pre-created a background `lv_img` object and set the 320x240 PNG/BMP source from the deferred background path; metrics reached `background_attempts=1` but stayed at `background_ready=false, background_error="loading"`. The final fix uses generated 320x240 RGB565 BMP backgrounds plus `lv_canvas_load_bmp`, decodes into PSRAM scratch, copies to the full-screen canvas under a short LVGL lock, and raises `lvgl_cfg.task_stack` to 8192 after serial logs proved the default `LVGL task` stack overflowed. Final board smoke passed with `background_ready=true`, `background_attempts=1`, `background_error=""`, and stop returned to idle. The unused PNG backgrounds were then removed; the Weather upload dropped from 43 to 37 files, and the same background metrics smoke still passed. Next Weather work is physical/photo visual QA, not timer/decode blocker work.
- 2026-06-25 NES follow-up made the legal smoke ROM drive APU pulse output, added APU/sink/host-write diagnostics, moved the `nes_apu` PSRAM-stack task to `tskNO_AFFINITY`, made host I2S writes tolerate transient DMA backpressure, throttled APU batches by sample-rate cadence, and fixed `smoke_nes` host-audio byte accounting. Earlier board verification passed with `npm run nes:smoke -- --require-frame-growth 1600 --require-audio-bytes 128 --require-audio-backend host`, returning `frames=26->1632,frame_growth=1606,audio=65024,backend=host,audio_error=`, followed by `i2s:smoke --require-tone-writes 8` without reboot. Later the same day, after reflashing the staged rollback firmware, that 1600-frame host-audio baseline did not reproduce: an extended run first failed because the board had an older/missing `smoke_nes` metrics package; after re-uploading current `smoke_nes` and the legal ROM, the 140-sample run reached `audio_backend=host,audio_error=`, but only grew `1394` frames and reported many dropped audio bytes. A lower-threshold retry hit `ECONNRESET` while reading `metrics.json`, then the board recovered to idle. Next NES work should diagnose current host-audio throughput and metrics-read reliability before treating long NES performance as restored. `apps/nesgame` still has machine evidence for selector-to-ROM and synthetic gamepad path (`--require-frame-growth 120 --inject-gamepad` previously returned `frames=26->148,frame_growth=122,backend=host,gamepad_mask=16`), but this is not physical speaker, real BLE/Xbox, visual UX, or full 60fps proof.
  - static tests keep the alias visible for migrated `weather` and `voice_ai` compatibility;
  - ESP-IDF build passes with `vibeboard_runtime.bin` size `0x177a70`, still 63% free in the app partition.
- Voice AI and runtime lifecycle slices are board-verified for the mock path:
  - Runtime exposes Lua `app.list`, `app.rescan`, `app.current`, `app.exiting`, `app.exit([reason])`, `app.launch`, `app.set_home_exit`, and `app.on("exit"|"launch"|"stop", cb)`;
  - `apps/smoke_app_manager` exercises those APIs, disables default HOME exit through `app.set_home_exit(false)`, maps HOME short press to `app.launch("smoke_key")`, self-injects one software HOME short event through `key.push(key.HOME, key.SHORT)` so handoff can be smoke-tested without precise button timing, and displays stop/launch/exit lifecycle event counters; it is included in demo packaging;
  - Lua HTTP now supports the `voice_ai` bridge call shape `http.post(url, opts, raw_body, callback)` and `http.get(url, opts, callback)`, including `opts.headers` passthrough for `Content-Type: application/octet-stream`, `X-Audio-Format`, sample-rate, bit-depth, channel count, and reply limit;
  - LVGL GIF support is enabled with `CONFIG_LV_USE_GIF=y`, `lv_gif_create`, and `lv_gif_set_src`;
  - `apps/voice_ai` now uses the Runtime-supported active screen (`lv_scr_act()`) for its main UI and a full-screen overlay for AI-generated UI snippets instead of calling unsupported `lv_obj_create(nil)` or `lv_scr_load`;
  - `desktop-bridge/server.mjs` provides a provider-neutral local bridge for `POST /api/chat`, async pending jobs, `GET /api/result`, and `GET /health`;
  - current board-verified bridge responses are mock/default provider output until real STT/LLM credentials and provider code are configured;
  - `--provider command` can run local STT/reply wrapper commands through JSON stdin/stdout, keeping credentials and cloud SDK choices outside the device protocol;
  - command provider privacy is test-covered: STT/transcribe commands receive `audio_base64`, while LLM/reply commands receive only transcript/metadata unless `VOICE_BRIDGE_REPLY_INCLUDE_AUDIO=1` is explicitly set.
  - `apps/voice_ai` now writes GIF state metrics (`use_gif`, `gif_visible`, `gif_state`, `gif_src`) so smoke tests can require enabled GIF selection before recording;
  - `npm run voice-ai:smoke -- --require-gif` board-verified mock recording/upload/reply and GIF metrics after the deferred launch task was moved to a SPIRAM-capable stack.
- Lua app-manager handoff is board-verified:
  - HTTP `/launch?app=smoke_app_manager` now passes a full registry snapshot plus selected app index into the async Lua runner;
  - `app.list()` and `app.rescan()` read that cached registry instead of scanning SD from inside the Lua task;
  - `smoke_app_manager` saw `count: 25` and `rescan: 25`, then `app.launch("smoke_key") true`;
  - the runner handed off non-reentrantly to `smoke_key`;
  - after handoff, `/status` returned `state=running,current_app=smoke_key,last_status=ESP_OK`;
  - `/stop` returned `{"ok":true,"stopped":true}`;
  - `npm run app-manager:smoke` now repeats this handoff path automatically by launching `smoke_app_manager` and polling until `current_app=smoke_key`;
  - Lua app script preload and `lua_newstate(lua_psram_alloc, NULL, 0)` keep Lua execution off the fragile runtime SD path and reduce internal RAM pressure while HTTPD/LwIP remain active.
- Runtime `sys` bridge is build/static-verified:
  - `runtime_version.h` now owns `VB_RUNTIME_VERSION`, Lua/LVGL API versions, and the package schema used by `/status`;
  - `lua_sys.c/h` registers `sys.version`, `sys.getbrightness`, and `sys.setbrightness`;
  - the brightness APIs call board-level backlight helpers in `board_lckfb_szpi_s3.c`;
  - `npm run test:firmware-static -- --test-name-pattern "sys Lua module"` covers registration/order, shared version constants, CMake inclusion, and board helper wiring;
  - no live board smoke has been claimed yet for visible brightness adjustment from Lua.
- HTTP key injection smoke hook is board-verified:
  - `POST /input/key?code=<LEFT|RIGHT|UP|DOWN|HOME|EXIT|START>&event=<SHORT|LONG_START|LONG_REPEAT|LONG_END>` accepts only named key codes/events;
  - the handler calls `vb_app_runner_enqueue_key(code, event)` and does not call Lua from the HTTPD task;
  - `npm run input:smoke -- --app <id> --key CODE:EVENT [--key CODE:EVENT ...] --expect-state <state>` now wraps `/launch`, `/input/key`, and final `/status` checks for repeatable board smoke;
  - after rebuilding and flashing `/dev/cu.usbmodem112301`, idle injection returned `400 no active app`;
  - with `smoke_key` running, `LEFT/SHORT` and `HOME/SHORT` returned `{"ok":true,"injected":...}`;
  - the HOME injection returned `smoke_key` to `state=idle` through the normal Lua default HOME stop path;
  - with `voice_ai` running and the mock desktop bridge listening, `HOME/SHORT` injection returned `ok` and `/status` stayed `state=running,current_app=voice_ai,last_status=ESP_OK`; the bridge did not receive an audio upload in this smoke, so real I2S/record/upload remains open.
- Upstream display apps migrated so far:
  - `apps/matrix_rain` from upstream `MatrixRain`;
  - `apps/nixie_clock` from upstream `NixieClock`;
  - `apps/clock` from upstream `clock`.
  - `apps/conway_life` from upstream `ConwayLife`.
  - `apps/fluid_pendant` from upstream `FluidPendant`.
  - `apps/2048` from upstream `2048`.
- Runtime compatibility added during these app migrations:
  - minimal LVGL canvas binding;
  - PNG decoder enabled in both defaults and actual `sdkconfig`;
  - default SimSun CJK font enabled in both defaults and actual `sdkconfig`;
  - `time.getlocal()`;
  - image antialias, angle, pivot, zoom helpers;
  - `lv_font_load`/`lv_font_free` fallback compatibility;
  - common text style helpers and LVGL constants.
  - `millis()` global compatibility.
  - Lua `key` module with `key.on`, `key.off`, `key.push`, direction constants, and `SHORT`/`EXIT` compatibility aliases.
  - Lua `key.repeat_start(code[, delay_ms, interval_ms])` and `key.repeat_stop(code)` now generate queued LONG_START/LONG_REPEAT/LONG_END events through runtime timers for App-side repeat semantics.
  - board-verified touch-swipe input bridge: hardware task enqueues key events, Lua runner drains them on the Lua/timer loop, and app stop cleans up the queue/callbacks.
  - LVGL object delete/foreground, opacity, gradients, shadows, and property animation helpers needed by `2048`.
  - LVGL common-control slice is board lifecycle-verified for slider/list/switch/dropdown/textarea/roller/arc through `apps/smoke_controls`; physical screen observation of each control is still pending.
  - `apps/smoke_key` input smoke app: shows the latest key event on screen and injects alternating LEFT/RIGHT events through `key.push()` for software-triggered input verification.
  - `apps/smoke_key` was packaged, uploaded, launched, and board-verified through serial logs showing alternating `LEFT`/`RIGHT` callbacks from `key.push()`.
  - `apps/smoke_touch` is now included in demo packaging and board lifecycle-verified; it displays raw touch down/move/up coordinates and can self-inject `touch.push(...)` events for software smoke. Physical coordinate label observation is still pending.
  - Runtime now registers a Lua `touch` module and drains physical board touch coordinate events on the same Lua runner input timer as `key`.
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
- HTTP deferred launch tasks now also use SPIRAM-capable stacks and `heap_caps_free` cleanup for their heap-caps jobs, addressing the observed `ESP_ERR_NO_MEM` when launching the larger `voice_ai` package after upload.
  - FATFS/SDMMC memory policy now reserves more internal DMA memory, disables FATFS external-RAM preference, enables `SDMMC_HOST_FLAG_ALLOC_ALIGNED_BUF`, and loads Lua scripts through an internal DMA-capable 512-byte reader;
  - LVGL Lua object handles now reuse freed slots, clear registered child handles before `lv_obj_clean`/`lv_obj_del`, and allow up to 128 live handles after `2048` exposed `lvgl object table full`.
- 2048 gameplay safety:
  - exit events handled inside `apps/2048` now require the same `HOME`/`EXIT` event twice within 1.2 seconds before stopping the app;
  - normal directional movement remains immediate;
  - physical swipe gameplay and double-exit behavior were confirmed by the user on the device.
- BOOT-to-Lua HOME forwarding is build-verified:
  - when the Launcher is inactive, physical BOOT short press now forwards `key.HOME` + `key.SHORT` to the active Lua app;
  - physical BOOT long press now forwards `key.HOME` + `key.LONG_START` before falling back to old stop behavior if there is no active Lua runtime;
  - default HOME/EXIT stop semantics still request app stop, while apps using `app.set_home_exit(false)` can handle the HOME event themselves;
  - board verification of physical BOOT forwarding remains pending.
- Lua key repeat helper is build-verified:
  - `key.repeat_start(...)` dispatches LONG_START immediately, then LONG_REPEAT through the same queued Lua runner path after the configured delay/interval;
  - `key.repeat_stop(...)` dispatches LONG_END and frees the timer slot;
  - `apps/smoke_key` now self-triggers an `UP` repeat sequence so board smoke can observe repeat events without needing hardware long-press support first.
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
  - at the end of the 2026-06-21 pass, `/dev/cu.usbmodem112301` was running VibeBoard Runtime and `http://192.168.1.32:8080/status` returned `app_count=24,state=idle,last_status=ESP_OK`.
- Tooling guardrails:
  - `npm run device:check` performs the non-destructive shared-board preflight;
  - validator tests keep migrated App capabilities aligned with static API usage;
  - validator now treats `key.*`, `touch.*`, and `gamepad.*` as input API usage that requires `capabilities = input`;
  - validator now rejects unsupported direct Runtime Lua module API calls in all ordinary package Lua files for `app`, `file`, `gamepad`, `http`, `i2s`, `json`, `key`, `sjson`, `time`, `tmr`, `touch`, and `wifi`, while allowing optional compatibility probes;
  - firmware static tests now track migrated-App Runtime API gaps before board runs.

## Last Verified Commands

```text
npm run test:firmware-static
npm run test:packager
npm run test:device-check
npm run test:lifecycle-smoke
npm run test:firmware-static -- --test-name-pattern "defers weather network startup"
npm test
git diff --check
idf.py build
```

The latest full verification for migration work passed through package/static/test/build layers. On 2026-06-21, `npm test`, `npm run validate:apps`, `git diff --check`, and `idf.py build` passed. The latest ESP-IDF build generated `vibeboard_runtime.bin` size `0x18fd10`, with 61% free in the 4 MB app partition. The board input poller has been moved from deprecated `esp_lcd_touch_get_coordinates` to `esp_lcd_touch_get_data`, and the NES `.mod_iram` sections are now mapped through `main/linker.lf` instead of relying on linker orphan placement.

Later on 2026-06-21, the Runtime WiFi/NVS recovery slice passed `npm run test:firmware-static`, `idf.py build`, `idf.py -p /dev/cu.usbmodem112301 flash`, `curl -s http://192.168.1.32:8080/status`, and `npm run device:check`. The final build generated `vibeboard_runtime.bin` size `0x186010`, with 62% free in the 4 MB app partition. Board logs showed WiFi NVS disabled, full PHY calibration, WiFi/LwIP preferring SPIRAM, DHCP IP `192.168.1.32`, and valid `/status` JSON with `native_abi_version:"vibeboard-native-module-abi@1"`.

The final 2026-06-21 app-manager stabilization pass passed `npm run test:firmware-static`, `git diff --check`, `idf.py build`, `idf.py -p /dev/cu.usbmodem112301 -b 115200 flash`, HTTP `/launch?app=smoke_app_manager`, `/status` after handoff, and `/stop`. The final ESP-IDF build generated `vibeboard_runtime.bin` size `0x186040`, with 62% free in the 4 MB app partition. The board ended idle on VibeBoard Runtime at `192.168.1.32:8080` with `app_count=25,last_message=stopped`.

The follow-up Voice AI HTTP compatibility slice passed `npm run test:firmware-static`, `git diff --check`, and `idf.py build`. The ESP-IDF build generated `vibeboard_runtime.bin` size `0x186270`, with 62% free in the 4 MB app partition. This is build evidence only; the real microphone, bridge upload, GIF screen, and provider response path still need board smoke.

The follow-up Voice AI board-launch slice used the existing Runtime at `192.168.1.32:8080`, packaged `apps/voice_ai`, wrote `dist/apps/voice_ai/config.json` with `bridge_url=http://192.168.1.26:8790`, started `node desktop-bridge/server.mjs --host 0.0.0.0 --port 8790 --provider mock`, uploaded the app package, and launched `voice_ai`. The first launch failed with `/sdcard/apps/voice_ai/main.lua:1102: bad argument #1 to 'lv_obj_create' (number expected, got nil)`. The app was then changed to build its main UI on `lv_scr_act()` and to render AI-generated UI as a full-screen overlay object under the main screen, with static guardrails preventing `lv_obj_create(nil)` and `lv_scr_load` regressions. After repackaging and re-uploading, `npm run launch:app -- http://192.168.1.32:8080 voice_ai` returned `launched voice_ai`; `/status` reported `state=running,current_app=voice_ai,last_status=ESP_OK`; `POST /stop` returned `{"ok":true,"stopped":true}`. Verification also passed `node tools/app-validator/validate-demo-apps.mjs`, `npm run test:voice-bridge`, `npm run test:firmware-static`, `git diff --check`, and `idf.py build` with `vibeboard_runtime.bin` size `0x186410`, 62% free. This proves launch stability, not full voice completion: physical/software HOME short press, I2S microphone config, nonzero PCM capture, bridge upload, reply rendering, and GIF animation still need board smoke.

The follow-up NES compatibility slice passed `npm run test:firmware-static`, `git diff --check`, and `idf.py build`. The ESP-IDF build generated `vibeboard_runtime.bin` size `0x186410`, with 62% free in the 4 MB app partition. This slice keeps `nes.start(path, opts)` compatible with the migrated `nesgame` option names (`frame_width`, `frame_height`, `center_on_screen`, `audio_ringbuf_bytes`, `audio_ringbuf_samples`) and exposes `module_backend`, `rendered_frames`, and `core_rendered_frames` in `nes.state()`. This is build evidence only; the legal-ROM board smoke, display ownership stress, hardware audio output, and gamepad-native path remain pending.

The 2026-06-22 HTTP key injection smoke slice followed TDD: the new firmware static guardrail first failed because `install_service.c` lacked `lua_key.h`, `input_key_handler`, parser helpers, and `/input/key` registration. After implementation, `npm run test:firmware-static` passed 70/70. `idf.py build` passed and generated `vibeboard_runtime.bin` size `0x1867c0`, with 62% free in the 4 MB app partition. The board was flashed through `/dev/cu.usbmodem112301`; the first non-escalated flash failed with macOS `Operation not permitted`, then the escalated `idf.py -p /dev/cu.usbmodem112301 build flash` succeeded and verified hashes. Board checks at `192.168.1.32:8080` verified idle `/input/key` rejection, `smoke_key` LEFT/HOME injection, `smoke_key` returning to idle through HOME, `voice_ai` launch, `voice_ai` HOME/SHORT injection, and `voice_ai` remaining `state=running,current_app=voice_ai,last_status=ESP_OK`. The local mock bridge was stopped and the app was stopped at the end of the smoke.

The follow-up NES smoke tooling slice passed `npm run test:nes-smoke` and added `npm run nes:smoke` to launch `smoke_nes` and poll `/status`. The first board run correctly exposed that `smoke_nes` was not installed (`404 app not found`). After `npm run package:app -- apps/smoke_nes` and `npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_nes smoke_nes`, the uploader sent 5 files and confirmed `smoke_nes` in `/apps`. `npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --interval-ms 300` then returned `nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=1`, and `POST /stop` returned `{"ok":true,"stopped":true}`. A later NES smoke upgrade made `apps/smoke_nes` write `metrics.json` and made `npm run nes:smoke` read that artifact. Local `npm run test:nes-smoke` and `npm run test:firmware-static` passed. On board, `npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 8 --interval-ms 500` returned `nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=1 rom=false started=false frames=0 audio=0`; reading `/apps/file?app=smoke_nes&path=metrics.json` returned `rom_present:false,last_error:"open rom failed"`. This proves the app/native loader smoke launches, stays alive, and exposes machine-readable no-ROM diagnostics. It does not prove legal-ROM execution, display output, audio, or gamepad-native completion; the tool now has `--require-rom` and `--require-audio-bytes <n>` for that next pass.

The 2026-06-22 legal-ROM NES follow-up added `npm run nes:rom:smoke`, which generates a legal mapper-0 iNES smoke ROM and uploads it to `/sdcard/apps/smoke_nes/roms/smoke.nes`. Hardware diagnosis showed the board was not continuously rebooting; failures were staged NES runtime errors. The fixes landed in several steps: `nes_host_v1_shim.c` now implements TFT-style `setAddrWindow/pushPixelsDMA` by tracking the current stream window and forwarding rows through `push_image_dma`; `nes_native_adapter.c` no longer clamps small task stacks up to 16 KB and allows the upstream-supported 4096-byte lower bound, while `smoke_nes` uses `task_stack_bytes=6144`; `smoke_nes` now writes periodic `metrics.json`; and native display acquire/release now pauses/resumes LVGL with `vb_board_display_takeover()` / `vb_board_display_release_takeover()` so NES can own the panel while it streams frames. The failed intermediate board run was useful: `--require-frame-growth 120` exposed `push display pixels failed`, and serial showed `display push failed owner=nes x=32 y=227 w=256 h=1 err=ESP_ERR_TIMEOUT`, proving LVGL lock contention rather than a bad ROM. Because full-width multi-row writes still pressure internal DMA memory, `smoke_nes` currently uses `transfer_rows=1` for the reliable smoke path. Verification passed: `npm run test:firmware-static`, `npm run test:nes-smoke`, `npm run test:nes-rom-smoke`, `npm run package:app -- apps/smoke_nes`, ESP-IDF build/flash, `npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_nes smoke_nes`, `npm run nes:rom:smoke -- --board http://192.168.1.32:8080`, and `npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 30 --interval-ms 500 --require-rom --require-frame-growth 120`, which returned `nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=1 rom=true started=true frames=138 frame_growth=126 audio=0`. A 2026-06-23 follow-up enabled `audio_enabled=true` and `audio_lua_fallback=true` in `apps/smoke_nes`, re-uploaded the app and legal ROM, and verified `npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 30 --interval-ms 500 --require-rom --require-frame-growth 1800 --require-audio-bytes 128 --metrics-polls 120 --interval-ms 500`, which returned `nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=1 rom=true started=true frames=152 frame_growth=142 audio=1024`. This upgrades NES audio from API-only to board-verified Lua fallback PCM extraction. A later 2026-06-23 soak used the same legal ROM and returned `nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=2 rom=true started=true frames=1835 frame_growth=1809 samples=113 frames=26->1835 audio=1024` with `--metrics-polls 120 --interval-ms 500`; `/stop` then returned the board to idle. The subsequent user-reported restart loop was traced through serial `task_wdt` logs to `nes_core`/`nes_apu` starving `IDLE0`; `nes_port_yield()` now routes to the host task yield API and is called from both `NesCoreRuntime::taskLoop()` and `NesCoreRuntime::apuTaskLoop()`, with a static guardrail named `keeps NES core and APU tasks watchdog-friendly during long soaks`. After flashing the fix, `npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 120 --interval-ms 500 --require-rom --require-frame-growth 1800 --require-audio-bytes 128` returned `nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=2 rom=true started=true frames=1816 frame_growth=1804 samples=118 frames=12->1816 audio=1024`; `/stop` then returned the board to `state=idle,app_count=31`. A follow-up `apps/nesgame` smoke added app-local `roms/` fallback, machine-readable metrics, LVGL alignment fallbacks, fixed Lua local function ordering for `update_metrics`, and adapted `file.listdir()` string entries to absolute NES ROM paths. After uploading `nesgame` and `roms/smoke.nes`, selector metrics returned `rom_count=1,selected_index=1`, and `UP/LONG_START` moved to `screen_mode=running` with frames growing from `433` to `722`; `/stop` then stopped the app cleanly. Another 2026-06-23 follow-up exposed `last_gamepad_buttons` and `last_gamepad_mask` from `apps/nesgame/metrics.json` and extended `npm run nesgame:smoke` with `--inject-gamepad`. Local `npm run test:nesgame-smoke`, `npm run test:firmware-static -- --test-name-pattern "nesgame smokeable"`, and `node tools/app-validator/validate-demo-apps.mjs` passed. After packaging and uploading `nesgame`, board verification returned `nesgame smoke ok: nesgame state=running current_app=nesgame rom=/sdcard/apps/nesgame/roms/smoke.nes frames=12->138 frame_growth=126 audio=0 backend=none gamepad_mask=24`; `/stop` returned `{"ok":true,"stopped":true}`. This proves HTTP gamepad injection can drive the migrated `nesgame` selector and produce a running NES input mask. Remaining NES work is hardware audio output, real BLE/Xbox/native gamepad host input, physical UX observation, and longer real-game frame-rate/display soak.

The follow-up gamepad smoke tooling slice added a shared `tools/lifecycle-smoke` helper, refactored `nes:smoke` onto it, and added `npm run gamepad:smoke`. Local tests passed for `tools/lifecycle-smoke`, `tools/nes-smoke`, and `tools/gamepad-smoke`. On board, `npm run package:app -- apps/smoke_gamepad` and `npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_gamepad smoke_gamepad` uploaded 4 files and confirmed `smoke_gamepad` in `/apps`. `npm run gamepad:smoke -- --board http://192.168.1.32:8080 --polls 8 --interval-ms 300` returned `gamepad smoke ok: smoke_gamepad state=running current_app=smoke_gamepad polls=1`; `POST /stop` returned `{"ok":true,"stopped":true}` and final `/status` was idle with `app_count=28`. A later metrics upgrade made `apps/smoke_gamepad` write `metrics.json` and made the tool support `--metrics-delay-ms`, `--metrics-polls`, `--require-updates`, `--require-connected`, and `--require-xbox`. Local `npm run test:gamepad-smoke`, `npm run test:firmware-static`, and `npm run package:app -- apps/smoke_gamepad` passed. During board verification the app registry briefly returned `app_count=0` and upload commit failed; reflashing VibeBoard Runtime through `/dev/cu.usbmodem111301` restored `/apps` to 31 entries. Root cause was later identified in `vb_app_registry_scan()`: it cleared the cached result before confirming `opendir("/sdcard/apps")` succeeded. The fix builds a PSRAM/heap temporary registry and only copies it into the live cache after a successful scan; the first stack-local attempt caused a boot loop because the registry is large, so the landed fix is heap-backed and guarded by `npm run test:firmware-static`. The repaired firmware was flashed at 115200 baud after the crash loop made the port unstable. Board verification after repair: `/status` returned `app_count=31,state=idle`, `/apps` listed 31 apps, `/rescan` returned `{"ok":true,"app_count":31}`, `smoke_gamepad` launched and wrote metrics even though the `/launch` HTTP request timed out, and after `/stop` both `/status` and `/rescan` still reported `app_count=31`. The `/launch` timeout root cause was then fixed by deferring the heavy Lua preload/task startup to a short-delay background task after the HTTP handler queues the launch. After rebuilding and flashing through `/dev/cu.usbmodem111301`, the same metrics command returned `gamepad smoke ok: smoke_gamepad state=running current_app=smoke_gamepad polls=1 connected=true updates=5 xbox=true buttons=256` without a launch timeout, and `/stop` returned the board to `state=idle,app_count=31`. This proves the Lua gamepad compatibility smoke app can expose software event metrics, the registry no longer empties after this stop/rescan path, and `/launch` now remains responsive for this heavy smoke path; it does not prove real BLE/Xbox discovery or native gamepad host integration.

The 2026-06-23 HTTP gamepad injection follow-up added `/input/gamepad`, which queues a small `vb_lua_gamepad_pending_state_t` into the active Lua runner and lets the runner input poll dispatch the state on the Lua thread. This mirrors `/input/key` as a smoke hook, not as a user-facing API. `npm run gamepad:smoke` now supports `--inject-gamepad`, `--inject-address`, `--inject-buttons`, `--inject-lx`, `--inject-ly`, and `--inject-dpad-up`. The TDD RED was `npm run test:gamepad-smoke` failing on unknown `--inject-gamepad` and missing `/input/gamepad` call; after implementation, `npm run test:gamepad-smoke`, `npm run test:firmware-static -- --test-name-pattern "gamepad"`, and ESP-IDF `idf.py build` passed. The board was not actually stuck in a Runtime reboot loop after reflashing the current firmware: `curl -s --max-time 5 http://192.168.1.32:8080/status` returned `app_count=32,state=idle`. Board verification then passed with `npm run gamepad:smoke -- --board http://192.168.1.32:8080 --inject-gamepad --require-updates 1 --require-connected --require-xbox --metrics-polls 12 --polls 12 --interval-ms 500`, returning `gamepad smoke ok: smoke_gamepad state=running current_app=smoke_gamepad polls=2 connected=true updates=2 xbox=true buttons=256`; final `/status` returned idle. Caveat for next session: `npm run device:check` uses esptool chip detection and may reset the USB/JTAG serial port, so its immediate HTTP phase can timeout even when standalone `curl /status` works after the reset window.

The follow-up generic lifecycle smoke slice added `npm run lifecycle:smoke` on top of the shared `tools/lifecycle-smoke` helper. `npm run test:lifecycle-smoke` passed 4/4. On board, `apps/smoke_controls` and `apps/smoke_touch` were packaged, uploaded, confirmed in `/apps`, launched through `npm run lifecycle:smoke`, observed as `state=running,current_app=<app>`, and stopped back to idle. This upgrades both apps from build-only evidence to board lifecycle evidence, but it still does not replace manual screen/touch observation.

The follow-up runtime config smoke slice added `runRuntimeConfigSmoke` and `npm run runtime:config:smoke`. It follows the existing config writer with a `/status` read and rejects responses that do not look like VibeBoard Runtime. `npm run test:uploader` passed with 37 tests. On board, `npm run runtime:config:smoke -- http://192.168.1.32:8080 i2s '{"bclk_pin":1,"ws_pin":2,"din_pin":3,"mclk_pin":-1,"sample_rate":16000,"bits":16,"channel":2}'` returned `runtime config smoke ok: i2s state=idle runtime=0.1.0`. This proves the runtime-owned I2S config write path is board-smoked.

The follow-up I2S artifact smoke slice added a read-only `GET /apps/file?app=<id>&path=<relative>` endpoint, made `apps/smoke_i2s` write `metrics.json`, and added `npm run i2s:smoke`. Local `npm run test:i2s-smoke` passed 8/8. After rebuilding/flashing firmware on `/dev/cu.usbmodem111301`, uploading `smoke_i2s`, and running `npm run i2s:smoke -- --board http://192.168.1.32:8080 --polls 20 --interval-ms 500 --require-reads --require-nonzero`, the board returned `i2s smoke ok: smoke_i2s started=true reads=1 bytes=2048 nonzero=2048 error= polls=11`; `POST /stop` then returned `{"ok":true,"stopped":true}`. This proves nonzero Lua I2S RX and app-local metrics serving.

The follow-up Voice AI end-to-end smoke slice added bridge `/debug/stats`, `npm run voice-ai:smoke`, app-local `metrics.json` diagnostics, app-relative config loading via `file.open("config.json", "r")`, guarded config loading, HOME event metrics, and synchronous I2S drain before submit. Local `npm run test:voice-bridge`, `npm run test:voice-ai-smoke`, and `npm run test:firmware-static` passed. On board, after uploading `voice_ai` with `bridge_url=http://192.168.1.26:8790` and `use_gif=false`, `npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1800 --ready-polls 60 --polls 30 --interval-ms 500 --min-audio-bytes 1024` returned `voice-ai smoke ok: audio=2048 chats=0->1 state=running current_app=voice_ai reply=我已收到录音：收到 2048 字节音频，约 0.0 秒`. A later 2026-06-23 pass added `--require-gif`, fixed deferred launch OOM for the larger GIF-enabled package, and returned `voice-ai smoke ok: audio=4096 chats=0->1 state=running current_app=voice_ai gif=idle ...`. The same day the command provider gained a test-covered privacy boundary: reply wrappers are transcript-only by default and require `VOICE_BRIDGE_REPLY_INCLUDE_AUDIO=1` before raw audio is forwarded beyond the STT step. This proves the mock bridge record/upload/reply loop, GIF state metrics, and local provider boundary. It still does not prove production STT/LLM wrappers with real credentials or physical GIF rendering.

The follow-up app-manager smoke tooling slice added `npm run app-manager:smoke`. Local `npm run test:app-manager-smoke` passed 2/2. On board, `npm run app-manager:smoke -- --board http://192.168.1.32:8080 --polls 12 --interval-ms 500` launched `smoke_app_manager`, waited for its software HOME handoff, and returned `app-manager smoke ok: smoke_app_manager->smoke_key state=running current_app=smoke_key polls=5`; `POST /stop` then returned `{"ok":true,"stopped":true}`. This makes app-manager handoff regression repeatable without timing manual key input.

On 2026-06-18, `/dev/cu.usbmodem11301` identified as:

```text
USB Product Name = CDC ACM serial backend
USB Vendor Name = Zephyr Project
idVendor = 12259
idProduct = 4
```

That was not the ESP32-S3 Runtime board used earlier, whose MAC was `10:51:db:80:e2:e8`. On 2026-06-19, the correct ESP32-S3 board was reconnected as `/dev/cu.usbmodem112301` and temporarily flashed for VibeBoard verification. Because this board shares flash with the user's other ESP32 project, use `erase-flash flash` for VibeBoard verification when serial logs show `Project name: esp32s3_device` or the partition table has factory app offset `0x20000`. At the end of this session it is running VibeBoard Runtime with `fluid_pendant`, but next session must still start by checking current firmware because the shared board may be reflashed back to the user's other project.

## Immediate Next Work

### 0K. Migrated app performance parity checkpoint

2026-06-26 记录：迁移 App 的体感慢/卡顿是后续优化重点。不要把它简单归因于“架构不同”，因为上游 Cubic/HoloCubic 也支持 Runtime + SD/Lua App + WebUI/HTTP 替换；真正需要排查的是 Runtime 兼容层、API 覆盖、资源加载、调度和热点路径的差异。

Next session should pick 3 representative apps, preferably `weather`, `photos`, and either `nesgame` or `voice_ai`, then add before/after metrics for:

- first paint / first usable time;
- image/font/GIF decode and SD read duration;
- Lua timer callback duration and frequency;
- LVGL object count and display tick/frame progress;
- metrics write frequency;
- stop/switch latency under load.

Likely hypotheses to test first:

- ported apps are compensating for missing upstream APIs with extra Lua work, polling, staged boot, or simplified UI paths;
- upstream has broader `httpd`/`websocket`/app event/LVGL coverage and `viper` hot-path support that we do not yet match;
- resource-heavy apps are hitting SD read amplification, decode overhead, PSRAM/DMA pressure, or LVGL lock contention;
- HTTPD/WiFi/SD/metrics/native tasks may be stealing time from Lua/LVGL during animation or startup.

### 0J. WebUI route bridge completed checkpoint

2026-06-25 在 `lv-benchmark` 最小迁移完成后，下一条自动化切片收口了 `mini_claw`、`hwmon`、`Settings` 类上游 WebUI/httpd surface 需要的最小 Runtime bridge。这个切片的目标不是完整迁移 `mini_claw`，而是先提供 active Lua App 的 route callback 底座；当前实现已经把 request method/body 一并透传给 Lua：

```text
Lua app: app.route_base() -> "/app"
Lua app: app.set_webui(true|false)
Lua app: app.route("/api/ping", callback)
Runtime: HTTP /app/* dispatches to the active Lua app route callback
Smoke: smoke_app_manager registers /api/ping, board GET /app/api/ping returns Lua callback JSON, metrics count the request
```

Implemented:

- Validator capability detection now treats `app.route_base`, `app.set_webui`, and `app.route` as requiring `capabilities = webui`.
- `lua_app.c/h` stores a single route callback ref, exposes `app.route_base()`, `app.set_webui(bool)`, and `app.route(path, callback)`, and dispatches request tables with `path`, `query`, and `method="GET"`.
- `app_runner.c/h` exposes `vb_app_runner_dispatch_webui(...)` for the install service to reach the active Lua runtime.
- `install_service.c` registers `/app/*`, strips the `/app` prefix, reads POST request bodies when present, and maps the active Lua callback response to HTTP type/status/body.
- `apps/smoke_app_manager` declares `lvgl,timer,input,file,webui`, registers `/api/ping`, writes `metrics.json`, and delays its automatic handoff to `smoke_key` to leave a route-smoke window.

Verification:

npm run test:validator
npm run test:firmware-static -- --test-name-pattern "WebUI route|Lua app manager smoke|tracks migrated app runtime API gaps"
npm run test:packager
source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && idf.py build
npm run package:app -- apps/smoke_app_manager
npm run package:demos
git diff --check
```

Board verification after flashing `/dev/cu.usbmodem111301`:

```text
npm run device:check
source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && idf.py -p /dev/cu.usbmodem111301 flash
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_app_manager smoke_app_manager
curl -sS --max-time 8 -X POST 'http://192.168.1.32:8080/launch?app=smoke_app_manager'
curl -sS --max-time 8 'http://192.168.1.32:8080/app/api/ping'
# {"ok":true,"route":"ping","app":"smoke_app_manager"}

curl -sS --max-time 8 'http://192.168.1.32:8080/apps/file?app=smoke_app_manager&path=metrics.json'
# {"webui_enabled":true,"webui_registered":true,"webui_requests":1,"last_webui_path":"/api/ping","route_base":"/app"}

npm run app-manager:smoke -- --board http://192.168.1.32:8080 --polls 12 --interval-ms 500
# app-manager smoke ok: smoke_app_manager->smoke_key state=running current_app=smoke_key polls=10

curl -sS --max-time 8 -X POST 'http://192.168.1.32:8080/stop'
curl -sS --max-time 8 'http://192.168.1.32:8080/status'
# state=idle, app_count=41
```

Scope boundary: this slice is a single active app route callback with short response bodies; it does not yet implement static WebUI assets, multiple route registration, auth, CORS, or full `mini_claw`.

### 0. Current plan status cleanup

2026-06-25 已把 `docs/development-plan.md` 中过期的 “Phase 5B 未完成 / 没有浏览器 UI / NES 仅 build-verified / native gamepad 板端 metrics 缺失” 等说法收敛为当前真实状态：

- Phase 5B Launcher、stop/switch/error recovery 已验收；
- 本地 `device-web` 管理页和 stop-first delete flow 已有本地/板端 smoke；
- synthetic HTTP/Lua gamepad 到 native host mask 已有 `smoke_nes` 板端 metrics；
- `Weather` 大背景 BMP、`voice_ai` mock/command provider、`nesgame` selector/ROM/frame-growth 都已有机器证据；
- 剩余未声明完成的项目集中在人工/外设/凭证/长 soak：照片视觉 QA、ES8311/扬声器可听输出、真实 BLE/Xbox、真实 STT provider、真实 WiFi credential reboot、长时间真实 NES 游戏和更多上游 App 迁移。

本次文档清理已验证：

```text
npm run test:ai-contract
npm run test:device-web
npm run test:app-manager-smoke
npm run test:nes-smoke
npm run test:nesgame-smoke
git diff --check
```

### 0B. BTC minimal migration status

2026-06-25 已完成 `apps/btc` 最小迁移：本地 App 使用 LVGL 画 BTC/USDT 价格面板，读取 app-local `config.json`，通过 `http.get` + `json.decode` 解析 ticker，并写 `metrics.json`。`tools/app-packager` 已把 `apps/btc` 纳入 curated demo/migrated package 列表；`tools/lifecycle-smoke` 支持 `network_attempts>=1` 这类下限 metrics 断言，并可把数字期望匹配到 app JSON 里的数字字符串。

验证：

```text
npm run test:validator
npm run test:packager
npm run test:firmware-static -- --test-name-pattern "BTC|tracks migrated app runtime API gaps"
npm run test:lifecycle-smoke
npm run package:app -- apps/btc
npm run device:check
npm run upload:app -- http://192.168.1.32:8080 dist/apps/btc btc
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app btc --polls 35 --interval-ms 500 --metrics-polls 40 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics 'network_attempts>=1' --require-metrics price_ready=true --require-metrics last_price=65432.1 --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok with local mock base_url=http://192.168.1.26:8792
```

Important scope note: the source `apps/btc/config.json` and regenerated `dist/apps/btc` default back to Binance. The board may still have the temporary mock-config upload until the next BTC upload. Real Binance HTTPS from the board returned `last_status=0,last_error="http 0"`, so real external-market-data success is not yet claimed. Full upstream K-line/candlestick/canvas UI and physical photo QA are also still open.

### 0C. Settings minimal migration status

2026-06-25 已完成 `apps/settings` 最小迁移：本地 App 使用 LVGL 画设备设置面板，支持 UP/DOWN 选择、LEFT/RIGHT 调整本地 brightness 数值，并写 `metrics.json`。后续 Runtime 切片已经补上 build/static-verified `sys.getbrightness` / `sys.setbrightness` 背光桥，但 Settings App 尚未接入真实背光硬件调光，也不声称已经实现真实 WiFi 模式切换、gamepad 管理或 WebUI route；这些仍是后续 App/API 工作。

验证：

```text
npm run test:validator
npm run test:packager
npm run test:firmware-static -- --test-name-pattern "Settings|BTC"
npm run package:app -- apps/settings
npm run package:demos
npm run device:check
npm run upload:app -- http://192.168.1.32:8080 dist/apps/settings settings
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app settings --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics settings_ready=true --require-metrics 'ticks>=1' --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: settings ... metrics={"settings_ready":true,"ticks":1,"selected_index":1,"selection_changes":0,"brightness":80,"brightness_changes":0,"last_key":""}
```

额外板端按键注入验证：

```text
POST /launch?app=settings
POST /input/key?code=DOWN&event=SHORT
POST /input/key?code=UP&event=SHORT
POST /input/key?code=RIGHT&event=SHORT
GET /apps/file?app=settings&path=metrics.json
# {"settings_ready":true,"ticks":1,"selected_index":1,"selection_changes":2,"brightness":85,"brightness_changes":1,"last_key":"RIGHT"}
POST /stop
```

### 0D. hwmon minimal migration status

2026-06-25 已完成 `apps/hwmon` 最小迁移：本地 App 使用 LVGL 画 CPU/GPU/MEM 面板，读取 app-local `config.json` 的 `state_url`，通过 `http.get` 拉取 host metrics，支持 upstream `cpu/gpu/mem` 嵌套字段和平铺字段，并写 `metrics.json`。这个切片不声称已经实现 upstream 的 `httpd`/WebUI route，也不声称已经接入真实 Windows/Linux host monitor。

验证：

```text
npm run test:validator
npm run test:packager
npm run test:firmware-static -- --test-name-pattern "HW Monitor|Settings|BTC"
npm run package:app -- apps/hwmon
npm run package:demos
```

板端验证用本机临时 mock `http://192.168.1.26:8793/api/state` 返回：

```json
{"host":"codex-mock","cpu":{"usage":42,"temp":61},"gpu":{"usage":73,"temp":68},"mem":{"usage":55}}
```

流程：

```text
npm run device:check
# first HTTP phase timed out after esptool chip probe reset; standalone curl /status recovered on attempt 2 and confirmed Runtime idle
npm run upload:app -- http://192.168.1.32:8080 dist/apps/hwmon hwmon
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app hwmon --polls 35 --interval-ms 500 --metrics-polls 30 --metrics-interval-ms 500 --require-metrics hwmon_ready=true --require-metrics online=true --require-metrics 'fetch_attempts>=1' --require-metrics cpu_usage=42 --require-metrics gpu_usage=73 --require-metrics mem_usage=55 --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: hwmon ... metrics={"hwmon_ready":true,"online":true,"fetch_attempts":1,"last_status":200,"last_error":"","last_host":"codex-mock","cpu_usage":42,"cpu_temp":61,"gpu_usage":73,"gpu_temp":68,"mem_usage":55,"ticks":0}
```

Important scope note: after the board smoke, source `apps/hwmon/config.json` and regenerated `dist/apps/hwmon/config.json` were restored to the default upstream host URL `http://192.168.0.80:8888/api/state`. The board may still have the temporary mock-config package until the next hwmon upload.

### 0E. Spectrum minimal migration status

2026-06-25 已完成 `apps/spectrum` 实真 I2S 迁移：本地 App 通过 Lua `i2s` 读取 PCM，做 32 路 Goertzel 分析，用当前 Runtime 已支持的 `lv_canvas_draw_rect` 绘制柱状/脉冲两种模式，并写 `metrics.json`。板端 smoke 现在要用 `--allow-starting` 接受 `state=starting` 的启动窗口，因为 Spectrum 在 `current_app=spectrum` 时会先进入 `starting` 再切到 `running`。

验证：

```text
npm run test:validator
npm run test:packager
npm run test:firmware-static -- --test-name-pattern "Spectrum|HW Monitor"
npm run package:app -- apps/spectrum
npm run package:demos
npm run upload:app -- http://192.168.1.32:8080 dist/apps/spectrum spectrum
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app spectrum --allow-starting --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics audio_ready=true --require-metrics band_count=32 --require-metrics 'frames>=3' --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: spectrum state=starting current_app=spectrum polls=1 stop_state=idle stop_current_app= stop_polls=1 metrics={"audio_ready":true,"frames":7,"mode":"bars","mode_changes":0,"last_key":"","band_count":32,"bin_count":32,"audio_reads":6,"audio_bytes":1536,"peak_level":90,"peak_band":1,"peak_hz":90,"capture_error":""}
```

额外板端按键注入验证：

```text
POST /launch?app=spectrum
wait until /status reports state=running,current_app=spectrum
POST /input/key?code=RIGHT&event=LONG_START
GET /apps/file?app=spectrum&path=metrics.json
# {"audio_ready":true,"frames":5,"mode":"pulse","mode_changes":1,"last_key":"RIGHT","band_count":32,"bin_count":32,"peak_level":90,"peak_band":1,"capture_error":""}
POST /stop
```

### 0F. Videos minimal migration status

2026-06-25 已完成 `apps/videos` 最小迁移：本地 App 扫描 app-local `videos/`
目录中的 GIF，用 `lv_gif_create` / `lv_gif_set_src` 播放当前条目，支持 LEFT/RIGHT
按键切换，并写 `metrics.json`。这个切片不声称已经实现通用视频解码、外部媒体库、
转码流程或人工视觉质量确认。

验证：

```text
npm run test:validator
npm run test:packager
npm run test:firmware-static -- --test-name-pattern "Videos|Spectrum"
npm run package:app -- apps/videos
npm run package:demos
npm run device:check
npm run upload:app -- http://192.168.1.32:8080 dist/apps/videos videos
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app videos --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics videos_ready=true --require-metrics 'gif_count>=1' --require-metrics selected_index=1 --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: videos ... metrics={"videos_ready":true,"gif_count":1,"selected_index":1,"selection_changes":0,"ticks":0,"last_key":"","current_name":"idle_0.gif","current_src":"S:/apps/videos/videos/idle_0.gif","last_error":""}
```

额外板端按键注入验证：

```text
POST /launch?app=videos
POST /input/key?code=RIGHT&event=SHORT
GET /apps/file?app=videos&path=metrics.json
# {"videos_ready":true,"gif_count":1,"selected_index":1,"selection_changes":1,"ticks":7,"last_key":"RIGHT","current_name":"idle_0.gif","current_src":"S:/apps/videos/videos/idle_0.gif","last_error":""}
POST /stop
# {"ok":true,"stopped":true}
GET /status
# state=idle, app_count=38
```

### 0G. Photos minimal migration status

2026-06-25 已完成 `apps/photos` 最小迁移：本地 App 扫描 app-local `photos/`
目录中的 PNG/BMP，用当前 Runtime 已支持的 `lv_img_create` / `lv_img_set_src`
显示当前图片，支持 LEFT/RIGHT 按键切换，并写 `metrics.json`。这个切片不声称
已经实现上游 `lv_canvas_draw_img` 三槽滑动相册、JPG/WebP、外部媒体库、相册管理
或人工视觉质量确认。

验证：

```text
npm run test:validator
npm run test:packager
npm run test:firmware-static -- --test-name-pattern "Photos|Videos"
npm run package:app -- apps/photos
npm run package:demos
npm run upload:app -- http://192.168.1.32:8080 dist/apps/photos photos
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app photos --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics photos_ready=true --require-metrics 'image_count>=1' --require-metrics selected_index=1 --require-metrics current_name=sample.png --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: photos ... metrics={"photos_ready":true,"image_count":1,"selected_index":1,"selection_changes":0,"ticks":0,"last_key":"","current_name":"sample.png","current_src":"S:/apps/photos/photos/sample.png","last_error":""}
```

额外板端按键注入验证：

```text
POST /launch?app=photos
POST /input/key?code=RIGHT&event=SHORT
GET /apps/file?app=photos&path=metrics.json
# {"photos_ready":true,"image_count":1,"selected_index":1,"selection_changes":1,"ticks":16,"last_key":"RIGHT","current_name":"sample.png","current_src":"S:/apps/photos/photos/sample.png","last_error":""}
POST /stop
# {"ok":true,"stopped":true}
GET /status
# state=idle, app_count=39
```

### 0H. Plane minimal migration status

2026-06-25 已完成 `apps/plane` 最小迁移：本地 App 使用 app-local BMP
精灵资源，通过 `lv_img_create` / `lv_img_set_src` 显示玩家飞机和敌机，
用 timer 推进简化游戏循环，LEFT/RIGHT 移动，UP 发射，并写
`metrics.json`。这个切片不声称已经实现上游 Plane War 的关卡、道具、boss、
IMU 倾斜控制、完整碰撞/难度曲线或人工游戏手感确认。

验证：

```text
npm run test:validator
npm run test:packager
npm run test:firmware-static -- --test-name-pattern "Plane|Photos"
npm run package:app -- apps/plane
npm run package:demos
npm run upload:app -- http://192.168.1.32:8080 dist/apps/plane plane
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app plane --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics plane_ready=true --require-metrics 'frames>=1' --require-metrics 'enemies_spawned>=1' --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: plane ... metrics={"plane_ready":true,"frames":4,"shots":0,"enemies_spawned":1,"score":0,"player_x":142,"player_y":194,"last_key":"","last_error":""}
```

额外板端按键注入验证：

```text
POST /launch?app=plane
POST /input/key?code=RIGHT&event=SHORT
POST /input/key?code=UP&event=SHORT
GET /apps/file?app=plane&path=metrics.json
# {"plane_ready":true,"frames":149,"shots":1,"enemies_spawned":5,"score":0,"player_x":156,"player_y":194,"last_key":"UP","last_error":""}
POST /stop
# {"ok":true,"stopped":true}
GET /status
# state=idle, app_count=40
```

### 0I. LV Benchmark minimal migration status

2026-06-25 已完成 `apps/lv-benchmark` 最小迁移：本地 App 用当前 Runtime
已验证的 LVGL surface 构建轻量 benchmark 面板，覆盖 object/label/arc/image transform、
timer 帧推进和 `metrics.json`。这个切片不声称已经实现完整上游 LVGL benchmark 的
line/table/flex scene、真实 monitor/FPS 统计、完整官方权重或人工视觉确认。

验证：

```text
npm run test:validator
npm run test:packager
npm run test:firmware-static -- --test-name-pattern "LV Benchmark|Plane"
npm run package:app -- apps/lv-benchmark
npm run package:demos
npm run upload:app -- http://192.168.1.32:8080 dist/apps/lv-benchmark lv-benchmark
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app lv-benchmark --polls 35 --interval-ms 500 --metrics-polls 20 --metrics-interval-ms 500 --require-metrics benchmark_ready=true --require-metrics 'frames>=2' --require-metrics scene_count=3 --require-metrics 'rects>=12' --require-metrics 'labels>=4' --require-metrics 'arcs>=1' --require-metrics 'images>=1' --require-metrics last_error= --stop --stop-polls 35 --stop-interval-ms 500
# lifecycle smoke ok: lv-benchmark ... metrics={"benchmark_ready":true,"frames":2,"scene_count":3,"rects":12,"labels":4,"arcs":1,"images":1,"scene":"running","last_error":""}
```

额外板端持续帧验证：

```text
POST /launch?app=lv-benchmark
GET /apps/file?app=lv-benchmark&path=metrics.json
# {"benchmark_ready":true,"frames":12,"scene_count":3,"rects":12,"labels":4,"arcs":1,"images":1,"scene":"running","last_error":""}
POST /stop
# {"ok":true,"stopped":true}
GET /status
# state=idle, app_count=41
```

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

If serial shows `ensure_nvs failed: ESP_ERR_NO_MEM`, the firmware is older than the 2026-06-21 WiFi recovery slice or was built with WiFi/PHY NVS storage re-enabled. Rebuild with the current `sdkconfig.defaults` before debugging app-layer networking.

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
- HTTP `/input/key` has already verified the active Lua key queue path for `smoke_key` and `voice_ai`; use `npm run input:smoke -- --app smoke_key --key LEFT:SHORT --key HOME:SHORT --expect-state idle` or the equivalent `voice_ai` run for automation, but do not count it as a substitute for physical BOOT, real touch, or real gamepad evidence;
- still confirm on the physical screen that the event label updates for the injected LEFT/RIGHT events;
- record the `smoke_key` self-triggered `UP` LONG_START/LONG_REPEAT/LONG_END sequence on screen and serial;
- still swipe left, right, up, and down on the device screen and record whether those physical gestures update the same `smoke_key` label;
- record physical down/move/up coordinate labels in already-uploaded `smoke_touch` on the board;
- `smoke_gamepad` upload/launch/status is now board-verified through `npm run gamepad:smoke`; next pass should physically observe the software-injected `connecting`, `connected`, `update`, and `disconnected` labels before wiring a real BLE/Xbox backend;
- record that already-uploaded `smoke_controls` renders slider/list/switch/dropdown/textarea/roller/arc correctly on the physical display and keeps updating without LVGL object-table or timer errors;
- upload/launch an `app.set_home_exit(false)` app, press physical BOOT short and long while it is running, and record that Lua receives `key.HOME` short/long-start instead of the native Launcher immediately stopping the app;
- in `smoke_app_manager`, the software HOME handoff to `smoke_key` is now repeatable through `npm run app-manager:smoke`; next pass should focus on physical BOOT HOME forwarding and `app.exit([reason])` stop/exit counter evidence;
- also launch a default-home-exit app and confirm physical BOOT HOME still requests a clean stop/return path;
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

Deployment now has staged upload/delete, runtime-owned config writes, and the first local browser UI. Still remaining:

- board-smoke the `name=wifi` config writer by posting real credentials, rebooting, and confirming the Runtime returns from `/sdcard/runtime/wifi.json`; 2026-06-21 verified boot uses `/sdcard/runtime/wifi.json` on the current SD card, and the smoke tool now supports `--expect-app-count` / `--expect-ip`, but the write-then-reboot workflow still needs a deliberate smoke from a fresh local credentials file.

Implemented 2026-06-20:

- `npm run device:web -- --board http://192.168.1.32:8080 --port 8790`;
- local proxy endpoints for `/api/status`, `/api/apps`, `/api/launch`, `/api/stop`, `/api/rescan`, and `/api/delete`;
- page separates compatible apps, legacy apps, current running app, `last_status`, and `last_message`;
- board smoke through `http://127.0.0.1:8790/api/status` and `/api/apps` saw `current_app=weather`, 24 SD apps, and a valid HTML page.
- `npm run device:web:smoke -- --board http://192.168.1.32:8080 --base http://127.0.0.1:8790` uploaded a temporary `web_ui_smoke` app, exercised launch, stop, rescan, and delete through the local Web UI proxy, then confirmed `/apps` had 24 apps and `has_web_ui_smoke=false`.
- `npm run upload:interrupted-smoke -- http://192.168.1.32:8080 interrupted_upload_smoke` created a temporary staged app package, intentionally failed at `main.lua`, verified `/install/abort`, and confirmed the temporary app was absent from `/apps`; board remained idle with 24 apps.

Implemented 2026-06-21:

- `POST /runtime/config?name=wifi` writes `/sdcard/runtime/wifi.json` through the same bounded install-service path used by Cubicserver config;
- `POST /runtime/config?name=i2s` writes `/sdcard/runtime/i2s.json` through the same bounded install-service path for Voice AI microphone pin bring-up, and `runtime:config:smoke` now board-verifies the write/status path;
- `npm run runtime:config -- http://192.168.1.32:8080 wifi runtime/wifi.local.json` can push runtime-owned WiFi config without editing the SD card by hand;
- `npm run runtime:config -- http://192.168.1.32:8080 cubicserver runtime/cubicserver.local.json` uses the same tool for weather/Cubicserver base URL changes;
- `npm run runtime:config -- http://192.168.1.32:8080 i2s runtime/i2s.local.json` uses the same tool for board-specific microphone pin changes.
- `npm run runtime:config:smoke -- http://192.168.1.32:8080 i2s runtime/i2s.local.json` should be used before `apps/smoke_i2s` when changing microphone pins, because it verifies config write and Runtime HTTP health without starting audio capture.

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
- `apps/smoke_nes` is implemented as an independent native-module smoke app and demo package entry, validating `require("nes")`, `nes.state()`, `nes.input.set_mask`, and `nes.read_audio(1024)` without depending on the full `nesgame` UI;
- after manifest validation, the Runtime now routes native modules through `native_module_static_adapter.*`, initializes the host API table, calls the linked `vb_nes_native_module_init` entrypoint through the `vb_native_module_init(&host_api, &module)` adapter seam, returns the native module handle in `vb_native_module_result_t.module`, and maps unsupported init results to precise host API errors before a real ELF loader or emulator core is wired in;
- `module_host_api.*` now defines and initializes native host API groups for serial output, time/yield/delay, heap allocation, SD-rooted file open/read/seek/position/size/available/close, task create/remove/yield/delay, display width/height/acquire/start_write/push_image_dma/end_write/release shape, and a minimal Lua transfer table for stack, push, setfield, check, and error functions; display ownership is exclusive, and `push_image_dma` now routes RGB565 rectangles through a board-level `esp_lcd_panel_draw_bitmap(...)` wrapper;
- `nes_host_v1_shim.*` now builds a `module_host_api_v1` table over the current Runtime `vb_module_host_api_t` so the linked upstream NES core can be created without replacing the existing firmware host ABI; the shim maps serial, SD/file reads, display acquire/pushImageDMA shape, time, heap, and task yield/delay, and leaves unsupported streaming display, file writes, audio, and advanced task operations explicit as `MODULE_ERR_UNSUPPORTED`;
- the upstream NES C++ core sources are now linked into the Runtime firmware, their headers use explicit relative ABI includes so they do not collide with the Runtime's local `module_abi.h`, and `nes_native_adapter.*` creates a `nes_core_bridge` runtime at native-module init time and refreshes `nes_core_status_t` in `nes.state()`;
- the v1 host shim now maps task create/remove, and `nes_native_adapter.*` calls `nes_core_start(...)`, `nes_core_stop(...)`, and `nes_core_set_input_mask(...)` with conservative default options, precise core errors, and a Runtime-mask-to-NES-pad-mask conversion;
- `nes.state()` now exposes core-backed status fields including state, running/loaded/paused flags, frame count, pending steps, input masks, display stream diagnostics, audio diagnostics, and core last error;
- `nes.start(path, opts)` now parses display/task/audio options including `target_fps`, task stack/priority/core, `audio_enabled`, `audio_lua_fallback`, sample rate, volume, and queue size; it also accepts the migrated `nesgame` option aliases `frame_width`, `frame_height`, `center_on_screen`, `audio_ringbuf_bytes`, and `audio_ringbuf_samples`;
- `nes.state()` now keeps the original `frames/core_frames` fields and adds `rendered_frames/core_rendered_frames` aliases so migrated FPS logging can read the same frame counter shape it used upstream;
- `nes.read_audio([max_bytes])` now exposes queued PCM bytes from `nes_core_read_audio(...)` as a Lua binary string, clamped to 256..8192 bytes and aligned to the current 16-bit mono fallback path; `apps/smoke_nes` reports `audio_bytes` on screen/serial when a legal ROM starts;
- `nes_native_adapter.*` copies the host API table into the module instance instead of keeping a pointer to the static adapter stack frame, so future native callbacks can safely use the host API after init returns;
- the Lua `nes` module now binds `state/start/stop/input` functions as closures over the native module handle and calls `nes_native_adapter.*` callbacks;
- `nes_native_adapter.*` now opens ROM paths through the host file API, reads the 16-byte iNES header, rejects missing/short/invalid/NES 2.0 ROMs with precise messages, records mapper id in native state, and then starts the linked core bridge;
- `main/linker.lf` explicitly maps upstream NES `.mod_iram` and `.mod_iram.literal` sections through the Runtime component linker fragment, removing the previous orphan-section linker warnings without disabling orphan checks;
- current loader intentionally returns precise missing payload/symbol/ABI/host API errors and, after a valid descriptor, exposes a minimal NES Lua table backed by the linked core bridge.

The next NES implementation slice is now mostly physical/hardware-bound:

- after reflashing Runtime, repeat `npm run nes:rom:smoke` and `npm run nes:smoke -- --require-rom --require-frame-growth 1600 --require-audio-bytes 128 --require-audio-backend host --metrics-polls 140 --interval-ms 500` to re-establish the host-audio baseline;
- use `npm run nesgame:smoke -- --board http://192.168.1.32:8080 --require-frame-growth 120 --inject-gamepad` for the board-verified `apps/nesgame` selector-to-ROM path;
- extend the current ~1 minute smoke into a longer real-game display stability soak and watch for LCD SPI bus/DMA or task watchdog errors;
- use the host I2S backend as the current machine baseline, then verify ES8311/amp/speaker audibly with a real board;
- extend the Lua transfer table only as real NES adapter calls require more Lua C API entries;
- native gamepad host API is now board-verified through `smoke_nes` synthetic input metrics: `host_gamepad_active=true,host_gamepad_mask=129`; next slice should connect a real BLE/Xbox source instead of treating HTTP injection as physical input.

## Parallelization Guidance

Safe parallel tracks now:

- Board verification of already migrated display apps.
- Photograph `nixie_clock`, `clock`, `weather`, and `voice_ai` on the flashed PNG/CJK build to confirm image decode and glyph coverage.
- Continue `weather` only as physical/photo visual QA: 2026-06-25 board smoke now proves the staged startup, stop path, resource metrics, and visible BMP canvas background gate with `background_ready=true`, `background_attempts=1`, and `background_error=""`. Direct deferred `lv_img_set_src` for 320x240 PNG/BMP is a recorded negative path; do not restart from that unless intentionally redesigning the image pipeline. Unused PNG backgrounds have already been removed from the package.
- For real Voice AI provider work, use a provider/base URL that exposes `/audio/transcriptions`, or adapt `desktop-bridge/openai-voice-commands.mjs` to the chosen STT service. The current environment's OpenAI-compatible base URL responds to `/models`; `/responses` returns `HTTP 502 text/html`, but reply now has a verified `OPENAI_REPLY_ENDPOINT=chat_completions` path using `gpt-5.4-mini` and `/chat/completions`. The remaining current provider blocker is `HTTP 404 text/plain` for `/audio/transcriptions`, which prevents a real recorded-audio transcript + reply board smoke.
- Next app API inventory and RED static tests. `BTC`, `Settings`, `hwmon`, `Spectrum` real audio, `videos`, `photos`, `plane`, `lv-benchmark`, `mini_claw`, `codex_buddy`, and the minimal WebUI route bridge are done. Next automatable candidates are `devtools` API/runtime gap decomposition or a physical/soak validation slice for the resource-heavy apps.
- Browser UI design for deployment management.
- Lua input-event design and implementation: real touch/button to `key.on` or `touch.on`.

## Deferred

- Do not claim physical BOOT-to-Lua HOME completion until an `app.set_home_exit(false)` app is running, physical BOOT short/long are pressed on the ESP32-S3 board, and Lua receives `key.HOME` short/long-start without the native Launcher immediately stopping the app.
- Do not wire real Voice AI providers until the target STT/LLM service and credential storage are decided. The bridge-side privacy default is now fixed: reply/LLM wrappers are transcript-only unless `VOICE_BRIDGE_REPLY_INCLUDE_AUDIO=1` is explicitly set.
- Do not claim NES board completion until a legal iNES ROM has been copied to SD and the display path is physically observed on the ESP32-S3 screen.
