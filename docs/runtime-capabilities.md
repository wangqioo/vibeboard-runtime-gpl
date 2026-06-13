# Runtime Capabilities

更新时间：2026-06-13

This document separates implemented API, build verification, and board verification. An API is not treated as fully done until it has a real device log in `docs/device-bringup.md`.

## Status Legend

| Status | Meaning |
| --- | --- |
| `board-verified` | Ran on the LCKFB ESP32-S3 board with serial evidence. |
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
| Positioning and flags | `lv_obj_set_pos`, `lv_obj_set_x`, `lv_obj_set_y`, `lv_obj_add_flag`, `lv_obj_clear_flag`, `LV_OBJ_FLAG_SCROLLABLE`, `LV_OBJ_FLAG_HIDDEN` | `board-verified` | `apps/smoke_assets` ran on board and returned `Lua app ok`. |
| Label long modes | `lv_label_set_long_mode`, `LV_LABEL_LONG_CLIP`, `LV_LABEL_LONG_WRAP`, `LV_LABEL_LONG_SCROLL_CIRCULAR` | `board-verified` | `apps/smoke_assets` ran on board and returned `Lua app ok`. |
| Asset paths and image object basics | `lv_resolve_asset_path`, `lv_asset_exists`, `lv_img_create`, `lv_img_set_src`, LVGL `S:` filesystem drive | `board-verified` | `apps/smoke_assets` verified `S:/apps/smoke_assets/assets/icon.bin`, `asset fs ok`, and `Lua app ok` on board. |
| BMP image decoder | `CONFIG_LV_USE_BMP=y`, `lv_extra_init`, BMP through `lv_img_set_src` | `board-verified` | `apps/smoke_visual` started on board, resolved `S:/apps/smoke_visual/assets/icon.bmp`, and kept running without Lua/runtime errors. Visual correctness still needs human screen confirmation. |
| Common widgets | `lv_btn_create`, `lv_bar_create`, `lv_bar_set_range`, `lv_bar_set_value`, `LV_ANIM_OFF`, `LV_ANIM_ON` | `board-verified` | `apps/smoke_visual` ran on board and logged timer-driven progress updates from 0 to 100 repeatedly. |

## Network, JSON, And Time

| Capability | APIs | Status | Evidence |
| --- | --- | --- | --- |
| WiFi STA | `wifi.mode`, `wifi.start`, `wifi.sta.config`, `wifi.sta.connect`, `wifi.sta.getip` | `board-verified` | `apps/smoke_network` connected to `1-306`, logged `sta got ip 192.168.1.32`, and Lua read the IP. |
| HTTP client | `http.get`, `http.post` | `board-verified` | `apps/smoke_network` called `http.get("http://httpbin.org/get")`, logged `http status 200`, and read 243 body bytes. |
| JSON | `sjson.decode`, `sjson.encode` | `board-verified` | `apps/smoke_network` decoded `wifi.json` and encoded `{"app":"smoke_network","city":"Shanghai"}` on board. |
| Time/NTP | `time.get`, `time.settimezone`, `time.initntp` | `board-verified` | `apps/smoke_network` ran no-credentials and WiFi-credentials paths without `Invalid mbox` and logged `time now ...`. |

## Device Install Service

| Capability | APIs | Status | Evidence |
| --- | --- | --- | --- |
| SD app file upload | `POST /install?app=<id>&path=<relative>` | `board-verified` | Runtime boot logged `install_service: install service listening on port 8080`; raw HTTP POST returned `200 OK` and `ok`; next boot logged `app_registry: found 2 apps`. |
| Device status | `GET /status` | `board-verified` | Raw HTTP GET returned `{"sd":true,"app_count":2,"first_app":"smoke_network","install":"ok"}`. |
| App listing | `GET /apps` | `board-verified` | Raw HTTP GET returned `smoke_network` and `raw_upload` entries from the live SD registry. |
| App rescan | `POST /rescan` | `board-verified` | Raw HTTP POST returned `{"ok":true,"app_count":2}` after re-running `vb_app_registry_scan`. |
| Mac uploader tool | `npm run upload:app -- http://<ip>:8080 dist/apps/<app-id> <app-id>` | `board-verified` | CLI uses an `nc` transport for the current Mac/router path, uploaded `smoke_visual_remote` to the board, called `/rescan`, and confirmed the app through `/apps`. |
| App launch | `POST /launch?app=<id>` | `board-verified` | Raw HTTP POST returned `{"ok":true,"launched":"smoke_visual_remote"}`; serial logs showed `Lua async launch: smoke_visual`, app-local SD asset resolution, and repeated progress updates. |
| Mac launch tool | `npm run launch:app -- http://<ip>:8080 <app-id>` | `board-verified` | CLI reached the board; after `smoke_visual_remote` was already running, the board returned `500 app already running`, proving the launch endpoint and single-runner guard path. |
| App stop | `POST /stop`, `vb_app_runner_stop`, `vb_app_runner_wait_stopped` | `board-verified` | Switching away from `smoke_visual_remote` logged `Lua stop requested`, `Lua tmr loop stop requested`, and `message=stopped`; idle `POST /stop` returned `{"ok":true,"stopped":false}`. |
| App switch | `POST /launch?app=<new-id>` while another app is running | `board-verified` | `POST /launch?app=smoke_network` while `smoke_visual_remote` was running returned `200 OK`; serial logs showed visual stopped, then `smoke_network` launched and completed with `ESP_OK`. |
| Device Launcher | native LVGL app list, tap-to-launch, BOOT short-select/long-launch via `vb_launcher_ui_show` | `board-verified` | Board booted `vibeboard_runtime` from `factory 0x10000`, skipped missing `raw_upload/main.lua`, reported `VibeBoard Runtime ready: sd=ok apps=2 launcher=ok`; touch tap-to-launch works on the device screen, and BOOT short/long press provides a hardware fallback. |

## Planned Runtime Modules

| Capability | Target APIs | Status | Notes |
| --- | --- | --- | --- |
| Lua App manager | `app.list`, `app.current`, `app.launch`, `app.rescan`, `app.exiting`, `app.on` | `planned` | Deferred to Phase 5B. Phase 5A uses the native launcher plus HTTP lifecycle endpoints instead of exposing app management to Lua. |
| Input | `touch.on`, `key.on` | `planned` | Hardware touch is usable by the native launcher; Lua input event APIs are a later phase. |
| Native modules | `require("/sd/modules/<module>.so")` | `planned` | Deferred until launcher lifecycle and API versioning are stable. |
