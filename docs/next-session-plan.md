# Next Session Plan

Date: 2026-06-15

## Current Baseline

```text
b9da3dc feat: add browser AI web console
```

The current branch has the first end-to-end productization loop on real hardware:

```text
runtime WiFi
  -> board-served Web Console
  -> app list/status
  -> staged upload/commit
  -> launch/stop/delete
  -> browser-side AI app creation path
```

## What Is Done

- Phase 5A native launcher MVP is board-verified.
- Phase 5B lifecycle controls are board-verified:
  - native Stop control;
  - native Refresh control;
  - return to launcher after stop;
  - readable failure feedback;
  - BOOT long-press stop while a Lua app owns the screen.
- Runtime WiFi autoconnect is board-verified:
  - preferred config path is `/sdcard/runtime/wifi.json`;
  - the current board still accepts `/sdcard/apps/smoke_network/wifi.json` as a compatibility fallback.
- HTTP lifecycle service is board-verified:
  - `GET /status`;
  - `GET /apps`;
  - `POST /rescan`;
  - `POST /launch`;
  - `POST /stop`;
  - `POST /delete`.
- App delete/uninstall is board-verified:
  - recursive app directory deletion;
  - registry rescan after deletion;
  - `409 app is running` protection.
- Staged upload/commit is board-verified:
  - `/discard -> /stage -> /commit -> /apps`;
  - staged path validation;
  - `app.info` and entry-file validation during commit;
  - same-filesystem replacement of installed apps;
  - `409 app is running` protection.
- Browser Web Console is implemented and board-verified for delivery:
  - `GET /` returns the console HTML;
  - app list/status APIs are reachable from the same board service;
  - launch, stop, delete, and manual upload controls are wired to the HTTP API.
- Browser AI app creation is implemented:
  - direct browser call to OpenAI Responses API;
  - API key stays in the browser and is not sent to the ESP32;
  - strict JSON schema output;
  - client-side validation of app id, paths, file types, and required files;
  - staged upload and commit after generation.

## Last Verified Commands

```text
npm test
git diff --check
idf.py build
esptool write_flash
curl http://192.168.1.32:8080/
curl http://192.168.1.32:8080/status
curl http://192.168.1.32:8080/apps
open http://192.168.1.32:8080/
```

Board delivery evidence:

```text
GET / returned HTML containing:
VibeBoard Runtime
AI Create App
OpenAI API Key

GET /status returned:
{"sd":true,"app_count":4,"first_app":"smoke_network","install":"ok","state":"idle","running":false,"current_app":""}
```

## Immediate Next Work

### 1. Formal WiFi Configuration Entry

Current state: runtime WiFi can read `/sdcard/runtime/wifi.json`, but the board still has a compatibility fallback to `/sdcard/apps/smoke_network/wifi.json`.

Next slice:

- decide the official write path:
  - Mac CLI writes `/sdcard/runtime/wifi.json`;
  - or Web Console writes WiFi config;
  - or SD-file-only remains the documented setup flow;
- add validation and clear error messages;
- remove or explicitly mark the smoke-app fallback as temporary.

Expected result: a new user can put the board on WiFi without relying on a smoke app convention.

### 2. Real AI-Created App Smoke

Current state: the Web Console AI path is implemented and statically tested. The board serves the console, but a real prompt-to-running-app smoke with an API key has not been recorded in docs.

Next slice:

- open `http://192.168.1.32:8080/`;
- enter a temporary OpenAI API key;
- prompt for a simple timer/card app;
- confirm generated files upload through staged commit;
- launch the app;
- record `/apps`, `/status`, and any browser/network constraints.

Expected result: documented evidence that the browser AI workflow creates and runs a real SD Lua app.

### 3. Lua Input Events

Current state: touch works for the native launcher, but Lua apps do not have touch/key event APIs.

Next slice:

- design a small input API, likely `touch.on(...)` and `key.on(...)`;
- add `apps/smoke_touch`;
- verify quick taps and app switching clean up handlers.

Expected result: AI-generated apps can build real interactive screens instead of only timer-driven UI.

### 4. Runtime/API/App Compatibility

Current state: package validation and docs define the supported API surface, but the runtime does not expose a versioned compatibility contract.

Next slice:

- expose runtime API/schema version in `/status` or a new endpoint;
- add `requires_runtime` or equivalent package metadata;
- reject incompatible apps before launch or commit;
- make browser AI prompts include the current supported API list.

Expected result: generated apps can fail early with `Runtime update required` instead of failing at Lua runtime.

## Parallelization Guidance

Safe parallel tracks:

- WiFi config productization;
- real Web Console AI smoke and documentation;
- Lua input-event design;
- compatibility/version metadata.

Avoid starting native module/NES work until input events and compatibility contracts are stable.

## Deferred

Do not implement Lua `app.*` APIs yet. Keep them deferred until there is a concrete Lua-side workflow such as a Lua desktop, in-app navigation, or app-to-app handoff.
