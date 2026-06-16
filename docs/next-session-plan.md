# Next Session Plan

Date: 2026-06-16

## Current Baseline

Branch: `app-delete-uninstall`

Current hardware baseline:

```text
runtime WiFi
  -> board-served Web Console on :8080
  -> staged app upload/commit
  -> launch/stop/delete
  -> Lua/LVGL timer-driven demo apps
  -> style sample library installed on SD
```

Latest board IP used during verification:

```text
http://192.168.1.32:8080
```

The repo baseline now raises app registry capacity from 32 to 64 entries so the full Holocubic catalog, style demos, and smoke apps can coexist. Board verification confirmed `/apps` parses correctly with the expanded registry and representative app launches no longer fail with `ESP_ERR_NO_MEM`.

## What Is Done

- Base VibeBoard runtime firmware is restored and running from factory app offset `0x10000`.
- Runtime WiFi autoconnect uses `/sdcard/runtime/wifi.json` on the current board.
- HTTP install service is reachable on port `8080`.
- Browser Web Console delivery and app management remain in place.
- `require("lvgl")` now registers a minimal `lvgl` module table and common short aliases such as `obj_create`, `label_create`, `ALIGN_CENTER`, and `ANIM_ON`.
- App registry capacity is now `VB_APP_REGISTRY_MAX_APPS 64`, so the full local catalog can grow beyond the earlier 32-entry ceiling.
- `/apps` now streams chunked JSON instead of using a fixed 1024-byte response buffer.
- Lua app tasks use a PSRAM-backed stack and a slim app execution context, fixing the expanded-registry `ESP_ERR_NO_MEM` and `vb_lua_launch` stack overflow failure.
- The Holocubic catalog has local packages for all 20 upstream app targets. `NixieClock`, `clock`, and `MatrixRain` are compatibility ports; unported targets launch explicit `Runtime update required` placeholders.
- Style demo apps are package-validated, packaged by `package:demos`, uploaded to the board, and launch-verified:

```text
demo_digital_clock    black background, large white 7-segment digits
demo_terminal_status  retro green terminal status screen
demo_neon_dash        neon cyber dashboard
demo_pixel_pet        blocky pixel pet
demo_night_light      warm bedside night light
demo_focus_timer      focus countdown
demo_lucky_card       rotating inspiration card
demo_space_dash       spaceship dashboard
demo_auto_snake       self-playing snake demo
```

## Last Verified Commands

```text
npm run test:validator
npm run validate:apps
npm run test:packager
npm run package:demos
npm test
git diff --check
idf.py -p /dev/cu.usbmodem111301 build flash
curl -s http://192.168.1.32:8080/status
curl -s http://192.168.1.32:8080/apps
npm run upload:app -- http://192.168.1.32:8080 dist/apps/<app-id> <app-id>
npm run launch:app -- http://192.168.1.32:8080 <app-id>
npm run launch:app -- http://192.168.1.32:8080 demo_digital_clock
npm run launch:app -- http://192.168.1.32:8080 holocubic_2048
curl -s -X POST http://192.168.1.32:8080/stop
```

Final board status from the last verification:

```json
{"sd":true,"app_count":16,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}
```

## Important Lesson

Free-form AI-generated Lua is not reliable enough as the default app creation path.

Observed failures:

```text
module 'lvgl' not found
attempt to call a nil value (field 'obj_center')
```

The `require("lvgl")` compatibility patch helps with one class of failures, but it does not solve the deeper problem: the model can invent unsupported LVGL APIs. The default AI path should become template/DSL based.

## Immediate Next Work

### 1. Commit And Push The Current Baseline

Before starting new feature work, commit the current verified baseline:

- style demo apps;
- package/validator updates;
- `require("lvgl")` compatibility;
- app registry capacity increase to 64;
- full Holocubic local catalog placeholders;
- development plan updates.

Recommended verification before commit:

```bash
npm test
npm run validate:apps
npm run package:demos
git diff --check
```

### 2. Build Safe AI Generation Mode v1

Goal: make browser AI create reliable apps by having AI output structured JSON, not arbitrary Lua.

Default templates for v1:

```text
info_card
timer_card
digital_clock
status_screen
```

Supported styles for `status_screen`:

```text
terminal_green
neon_dash
pixel_pet
night_light
space_dash
```

Implementation outline:

- define a browser-side JSON schema for safe app specs;
- update the AI prompt to request only that JSON;
- add deterministic template generators that produce `app.info` and `main.lua`;
- run client-side validation before staged upload;
- keep free-form Lua generation only as an Advanced/Experimental option.

Success criteria:

- generated Lua uses only known `lvgl,timer` APIs;
- invalid schema fails before upload;
- generated app can be uploaded with `/discard -> /stage -> /commit`;
- generated app launches without unsupported LVGL API errors;
- Web Console shows the reason when generation or deployment fails.

### 3. Board-Verify Formal WiFi Configuration

Current state: the formal Mac CLI writes `/sdcard/runtime/wifi.json`.

Next slice:

- mount the SD card on the Mac;
- run `npm run configure:wifi`;
- boot the board;
- confirm the log uses `/sdcard/runtime/wifi.json`;
- confirm `http://<board-ip>:8080/` loads without launching `smoke_network`;
- then remove, gate, or clearly document the `smoke_network/wifi.json` fallback.

### 4. Real Safe AI Smoke

After Safe AI v1 exists:

- open the Web Console;
- enter a temporary API key;
- ask for a terminal status screen, clock, or night light;
- confirm AI returns safe JSON;
- confirm staged upload and launch;
- record prompt, generated spec, `/apps`, `/status`, and known limitations in `docs/device-bringup.md`.

### 5. Lua Input Events

Do this after Safe AI v1:

```lua
touch.on("tap", function(event)
  print(event.x, event.y)
end)

key.on("boot", function(event)
  print(event.action)
end)
```

Expected deliverable:

- `apps/smoke_touch`;
- handler cleanup on app stop/switch;
- validator and docs updated.

## Deferred

- Do not expand free-form AI Lua as the main path.
- Do not implement Lua `app.*` APIs until there is a concrete Lua-side workflow.
- Do not start native module/NES work until input events and compatibility contracts are stable.
