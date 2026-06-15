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

The board firmware was rebuilt and flashed after increasing the app registry capacity from 12 to 32 entries. `/apps` has been verified with 13 app entries.

## What Is Done

- Base VibeBoard runtime firmware is restored and running from factory app offset `0x10000`.
- Runtime WiFi autoconnect uses `/sdcard/runtime/wifi.json` on the current board.
- HTTP install service is reachable on port `8080`.
- Browser Web Console delivery and app management remain in place.
- `require("lvgl")` now registers a minimal `lvgl` module table and common short aliases such as `obj_create`, `label_create`, `ALIGN_CENTER`, and `ANIM_ON`.
- App registry capacity is now `VB_APP_REGISTRY_MAX_APPS 32`, so the demo library can grow beyond 12 entries.
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
```

Final board status from the last verification:

```json
{"sd":true,"app_count":13,"first_app":"smoke_network","install":"ok","state":"running","running":true,"current_app":"demo_night_light"}
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
- app registry capacity increase to 32;
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
