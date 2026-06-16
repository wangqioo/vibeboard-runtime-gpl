# Runtime Capabilities

更新时间：2026-06-16

This document separates implemented API, build verification, and board verification. An API is not treated as fully done until it has a real device log in `docs/device-bringup.md`.

## Status Legend

| Status | Meaning |
| --- | --- |
| `board-verified` | Ran on the LCKFB ESP32-S3 board with serial, HTTP, or manual screen evidence. |
| `build-verified` | Compiles in ESP-IDF and has static/package tests, but has not been smoke-tested on board yet. |
| `planned` | Documented target, not implemented yet. |

## Lua Runtime

| Capability | APIs | Status | Evidence |
| --- | --- | --- | --- |
| Lua app execution | `luaL_newstate`, `luaL_openlibs`, `luaL_dofile` | `board-verified` | `apps/smoke_ui` ran from SD. |
| Logging | `print(...)` | `board-verified` | Serial logs show Lua app messages. |
| Timer compatibility | `set_interval(ms, callback)` | `board-verified` | Earlier `smoke_ui` ran with interval callback logs. |
| NodeMCU timers | `tmr.create`, `timer:alarm`, `timer:start`, `timer:stop`, `timer:unregister`, `timer:state`, `timer:interval`, `tmr.now`, `tmr.time` | `board-verified` | `apps/smoke_timer` verified auto timer, single timer, state, unregister, loop idle, and `Lua app ok` on board. |
| File access | `file.exists`, `file.open`, `file.read`, `file.getcontents`, `file.write`, `file.list`, `file.listdir` | `board-verified` | `apps/smoke_file` verified config read, file handle read, directory listing, app-local write, loop idle, and `Lua app ok` on board. |

## LVGL Lua Surface

| Capability | APIs | Status | Evidence |
| --- | --- | --- | --- |
| Screen and object basics | `lv_scr_act`, `lv_obj_clean`, `lv_obj_create`, `lv_label_create` | `board-verified` | `apps/smoke_ui` displayed weather card. |
| Sizing and alignment | `lv_obj_set_size`, `lv_obj_set_width`, `lv_obj_set_height`, `lv_obj_align` | `board-verified` | `apps/smoke_ui` layout displayed. |
| Basic styles | `lv_obj_set_style_bg_color`, `lv_obj_set_style_text_color`, `lv_obj_set_style_radius`, `lv_obj_set_style_pad_all`, `lv_obj_set_style_border_width`, `lv_obj_set_style_border_color` | `board-verified` | `apps/smoke_ui` card displayed. |
| Constants | `LV_ALIGN_CENTER`, `LV_ALIGN_TOP_LEFT`, `LV_ALIGN_TOP_MID`, `LV_ALIGN_BOTTOM_LEFT` | `board-verified` | `apps/smoke_ui` layout displayed. |
| LVGL module compatibility | `require("lvgl")`, global `lvgl`, aliases such as `obj_create`, `label_create`, `ALIGN_CENTER`, `ANIM_ON` | `board-verified` | Firmware with the compatibility table was flashed and used during style demo verification; the change fixes `module 'lvgl' not found` but does not make arbitrary LVGL APIs available. |
| Positioning and flags | `lv_obj_set_pos`, `lv_obj_set_x`, `lv_obj_set_y`, `lv_obj_add_flag`, `lv_obj_clear_flag`, `LV_OBJ_FLAG_SCROLLABLE`, `LV_OBJ_FLAG_HIDDEN` | `board-verified` | `apps/smoke_assets` ran on board and returned `Lua app ok`. |
| Label long modes | `lv_label_set_long_mode`, `LV_LABEL_LONG_CLIP`, `LV_LABEL_LONG_WRAP`, `LV_LABEL_LONG_SCROLL_CIRCULAR` | `board-verified` | `apps/smoke_assets` ran on board and returned `Lua app ok`. |
| Asset paths and image object basics | `lv_resolve_asset_path`, `lv_asset_exists`, `lv_img_create`, `lv_img_set_src`, LVGL `S:` filesystem drive | `board-verified` | `apps/smoke_assets` verified `S:/apps/smoke_assets/assets/icon.bin`, `asset fs ok`, and `Lua app ok` on board. |
| BMP image decoder | `CONFIG_LV_USE_BMP=y`, `lv_extra_init`, BMP through `lv_img_set_src` | `board-verified` | `apps/smoke_visual` started on board, resolved `S:/apps/smoke_visual/assets/icon.bmp`, kept running without Lua/runtime errors, and the physical screen smoke showed the visual app image/progress UI. |
| Common widgets | `lv_btn_create`, `lv_bar_create`, `lv_bar_set_range`, `lv_bar_set_value`, `LV_ANIM_OFF`, `LV_ANIM_ON` | `board-verified` | `apps/smoke_visual` ran on board and logged timer-driven progress updates from 0 to 100 repeatedly. |
| Canvas drawing | `lv_canvas_create`, `lv_canvas_fill_bg`, `lv_canvas_draw_rect`, `lv_canvas_draw_text`, `lv_canvas_frame_begin`, `lv_canvas_frame_end`, `lv_obj_invalidate`, `LV_IMG_CF_TRUE_COLOR`, `LV_TEXT_ALIGN_CENTER` | `board-verified` | `apps/smoke_canvas` and `apps/holocubic_matrix_rain` were packaged, staged-uploaded, launched, stopped, and switched back to `demo_digital_clock` on the board. |

## Network, JSON, And Time

| Capability | APIs | Status | Evidence |
| --- | --- | --- | --- |
| WiFi STA | `wifi.mode`, `wifi.start`, `wifi.sta.config`, `wifi.sta.connect`, `wifi.sta.getip` | `board-verified` | `apps/smoke_network` connected to `1-306`, logged `sta got ip 192.168.1.32`, and Lua read the IP. |
| Runtime WiFi autoconnect | `vb_runtime_wifi_start_from_sd`, `/sdcard/runtime/wifi.json`, compatibility read from `/sdcard/apps/smoke_network/wifi.json` | `board-verified` | Boot logged `runtime WiFi autoconnect using /sdcard/apps/smoke_network/wifi.json`, joined `1-306`, and logged `runtime sta got ip 192.168.1.32` before any app was manually launched. |
| Runtime WiFi config writer | `npm run configure:wifi -- <sd-root> --ssid <ssid> [--password <password>]` | `build-verified` | Tool tests verify CLI parsing, SSID/password validation, and writing `runtime/wifi.json` under the mounted SD root. Fresh board evidence for the runtime-owned path is pending. |
| HTTP client | `http.get`, `http.post` | `board-verified` | `apps/smoke_network` called `http.get("http://httpbin.org/get")`, logged `http status 200`, and read 243 body bytes. |
| JSON | `sjson.decode`, `sjson.encode` | `board-verified` | `apps/smoke_network` decoded `wifi.json` and encoded `{"app":"smoke_network","city":"Shanghai"}` on board. |
| Time/NTP | `time.get`, `time.settimezone`, `time.initntp` | `board-verified` | `apps/smoke_network` ran no-credentials and WiFi-credentials paths without `Invalid mbox` and logged `time now ...`. |

## Device Install Service

| Capability | APIs | Status | Evidence |
| --- | --- | --- | --- |
| SD app file upload | `POST /install?app=<id>&path=<relative>` | `board-verified` | Runtime boot logged `install_service: install service listening on port 8080`; raw HTTP POST returned `200 OK` and `ok`; next boot logged `app_registry: found 2 apps`. |
| Device status | `GET /status` | `board-verified` | Raw HTTP GET returned `{"sd":true,"app_count":2,"first_app":"smoke_network","install":"ok"}`. |
| App lifecycle status | `GET /status` field `state` with `idle`, `starting`, `running`, `stopping`, `failed`; compatibility fields `running` and `current_app` remain | `board-verified` | Board HTTP checks verified idle, running with `current_app=smoke_visual_remote`, controlled stop back to idle, intentional Lua failure as `failed`, and recovery from failed through `smoke_network`. |
| App listing | `GET /apps` | `board-verified` | The expanded app list is streamed as chunked JSON. Board HTTP parse verified 16 live entries including `holocubic_2048` and `holocubic_btc` without truncation. |
| App registry capacity | `VB_APP_REGISTRY_MAX_APPS 64` | `board-verified` | Static guardrails require 64 entries. After flashing the 64-entry firmware, `/apps` parsed successfully with 16 entries, and `demo_digital_clock` plus `holocubic_2048` launched without `ESP_ERR_NO_MEM`. |
| App rescan | `POST /rescan` | `board-verified` | Raw HTTP POST returned `{"ok":true,"app_count":2}` after re-running `vb_app_registry_scan`. |
| Browser Web Console | `GET /` | `board-verified` | Board HTTP GET returned the self-contained console HTML containing `VibeBoard Runtime`, `AI Create App`, and `OpenAI API Key`; the console uses the same `/status`, `/apps`, `/stage`, `/commit`, `/launch`, `/stop`, and `/delete` API surface. |
| Browser AI app creator | Direct browser call to OpenAI Responses API, strict JSON schema, client package validation, staged upload | `build-verified` | Static tests cover the console markup, OpenAI request shape, strict schema, path validation, localStorage opt-in, and discard-after-failure behavior. Board verification confirmed the page is served from the ESP32; a real API-key prompt-to-running-app smoke is still pending. |
| Staged app upload | `POST /stage?app=<id>&path=<relative>`, `POST /commit?app=<id>`, `POST /discard?app=<id>` | `board-verified` | Board staged upload smoke confirmed `smoke_stage_probe` appeared in `/apps`, launched successfully, stopped, and deleted cleanly. Running-app commit protection returned `409 app is running` for `smoke_stage_running`. |
| Mac uploader tool | `npm run upload:app -- http://<ip>:8080 dist/apps/<app-id> <app-id>` | `board-verified` | Default Node native HTTP uploaded `smoke_visual_native` to the board, uploaded 5 files, called `/rescan`, and confirmed the app through `/apps` without `--transport nc`. |
| Mac staged uploader default | `upload:app` default staged mode, `--mode direct` compatibility mode | `board-verified` | Default uploader staged 5 files, committed `smoke_stage_probe`, confirmed it through `/apps`, and preserved direct mode in tests. Firmware also raises HTTPD `max_uri_handlers` so `/stop` and `/delete` stay registered after adding staged endpoints. |
| App launch | `POST /launch?app=<id>` | `board-verified` | Raw HTTP POST returned `{"ok":true,"launched":"smoke_visual_remote"}`; serial logs showed `Lua async launch: smoke_visual`, app-local SD asset resolution, and repeated progress updates. |
| Mac launch tool | `npm run launch:app -- http://<ip>:8080 <app-id>` | `board-verified` | Default Node native HTTP launched `smoke_visual_native`, `smoke_fail`, `smoke_network`, `demo_digital_clock`, and `holocubic_2048` without `--transport nc`; the latest launch check exposed and then verified the Lua runner memory fix by moving the task stack to PSRAM and keeping only a slim app context on the Lua task stack. |
| App delete | `POST /delete?app=<id>` | `board-verified` | Board upload/delete smoke removed `smoke_delete_probe` and `/apps` no longer listed it. Running-app delete protection returned `409 app is running` for `smoke_visual_native`. |
| Mac delete tool | `npm run delete:app -- http://<ip>:8080 <app-id>` | `board-verified` | Default Node native HTTP deleted `smoke_delete_probe` and reported `deleted smoke_delete_probe; app_count=4`; deleting a running app returned `409 app is running`. |
| App stop | `POST /stop`, `vb_app_runner_stop`, `vb_app_runner_wait_stopped` | `board-verified` | Switching away from `smoke_visual_remote` logged `Lua stop requested`, `Lua tmr loop stop requested`, and `message=stopped`; idle `POST /stop` returned `{"ok":true,"stopped":false}`. |
| App switch | `POST /launch?app=<new-id>` while another app is running | `board-verified` | `POST /launch?app=smoke_network` while `smoke_visual_remote` was running returned `200 OK`; serial logs showed visual stopped, then `smoke_network` launched and completed with `ESP_OK`. |
| Device Launcher | native LVGL app list, tap-to-launch, BOOT short-select/long-launch via `vb_launcher_ui_show` | `board-verified` | Board booted `vibeboard_runtime` from `factory 0x10000`, skipped missing `raw_upload/main.lua`, reported `VibeBoard Runtime ready: sd=ok apps=2 launcher=ok`; touch tap-to-launch works on the device screen, and BOOT short/long press provides a hardware fallback. |
| Phase 5B launcher lifecycle controls | native launcher stop control, refresh/rescan control, return-to-launcher after stop or async failure, BOOT long-press stop while launcher is inactive, screen failure feedback from `vb_app_runner_last_message` | `board-verified` | HTTP and serial board checks verified stop, rescan, return to idle after stop, failed state from `smoke_fail`, and recovery through `smoke_network`. Manual physical screen smoke confirmed native Stop, Refresh, return-to-launcher, readable failure feedback, and BOOT long-press stop. |
| Style demo app library | `demo_digital_clock`, `demo_terminal_status`, `demo_neon_dash`, `demo_pixel_pet`, `demo_night_light`, `demo_focus_timer`, `demo_lucky_card`, `demo_space_dash`, `demo_auto_snake` | `board-verified` | `npm run validate:apps`, `npm run package:demos`, full `npm test`, staged upload, and HTTP launch/status checks verified the style demos; final board status reported `current_app=demo_digital_clock` after the MatrixRain slice. |
| Holocubic full local catalog | 20 target packages from `docs/holocubic-app-migration.json` | `build-verified` | `npm run validate:apps`, `npm run package:demos`, and migration tests require every upstream target to have a local package. `NixieClock`, `clock`, and `MatrixRain` are compat ports; unported targets launch explicit `Runtime update required` placeholders. Representative board smoke launched `holocubic_2048` successfully after the 64-entry registry fix. |

## Planned Runtime Modules

| Capability | Target APIs | Status | Notes |
| --- | --- | --- | --- |
| Lua App manager | `app.list`, `app.current`, `app.launch`, `app.rescan`, `app.exiting`, `app.on` | `planned` | Deferred until a Lua-side workflow needs it. The native launcher, Web Console, host CLI, and HTTP lifecycle endpoints currently cover app management. |
| Input | `touch.on`, `key.on` | `planned` | Hardware touch is usable by the native launcher; Lua input event APIs are a later phase. |
| Native modules | `require("/sd/modules/<module>.so")` | `planned` | Deferred until launcher lifecycle and API versioning are stable. |
