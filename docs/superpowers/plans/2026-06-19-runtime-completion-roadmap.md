# Runtime Completion Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining VibeBoard Runtime work after the first six schema v2 app migrations by converting pending architecture items into board-verifiable slices.

**Architecture:** Keep the native Runtime as the system shell and continue exposing app capabilities through versioned package metadata, HTTP lifecycle endpoints, and small Lua compatibility modules. Every slice must end with static/package verification plus board evidence in `docs/device-bringup.md`; the shared ESP32-S3 board must be checked and, when needed, restored with `idf.py -p /dev/cu.usbmodem112301 erase-flash flash`.

**Tech Stack:** ESP-IDF 5.5, Lua, LVGL, SD-card app packages, Node.js app packager/uploader/validator, `npm run test:firmware-static`, `idf.py build`, board HTTP service at `http://192.168.1.32:8080`.

---

## File Map

- `docs/next-session-plan.md`: rolling operational plan and current baseline.
- `docs/device-bringup.md`: board evidence log for every hardware verification.
- `docs/runtime-capabilities.md`: status table for implemented, board-verified, and planned Runtime APIs.
- `tools/firmware-static-check/test.mjs`: RED/GREEN guardrails for firmware/API behavior.
- `tools/app-validator/`: capability declarations and unsupported API detection.
- `tools/app-packager/`: schema v2 package generation.
- `tools/app-uploader/`: upload, launch, stop, and future delete orchestration.
- `tools/device-check/`: non-destructive shared-board preflight.
- `firmware/vibeboard_runtime/main/`: Runtime firmware, Lua bindings, launcher, install service, board input bridge.
- `apps/smoke_key/`: first independent input smoke app.
- `apps/weather/`, `apps/voice_ai/`, `apps/nesgame/`: next upstream migration/API-gap drivers.

---

### Task 1: Verify Independent Input With `smoke_key`

**Files:**
- Modify: `docs/device-bringup.md`
- Modify: `docs/runtime-capabilities.md`
- Modify: `docs/next-session-plan.md`
- Use existing: `apps/smoke_key/app.info`
- Use existing: `apps/smoke_key/main.lua`

- [x] **Step 1: Confirm the shared ESP32-S3 board is running VibeBoard Runtime**

Run:

```bash
npm run device:check
```

Expected:

```text
/dev/cu.usbmodem112301
ESP32-S3: yes
HTTP /status reachable: yes
VibeBoard Runtime: yes
```

If serial or HTTP shows the user's other firmware, run:

```bash
cd firmware/vibeboard_runtime
idf.py -p /dev/cu.usbmodem112301 erase-flash flash
```

- [x] **Step 2: Package `smoke_key`**

Run:

```bash
npm run package:app -- apps/smoke_key
```

Expected:

```text
packaged smoke_key
output dist/apps/smoke_key
install /sd/apps/smoke_key
```

- [x] **Step 3: Upload `smoke_key` as a schema v2 app**

Run:

```bash
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_key smoke_key
```

Expected:

```text
commit ok; confirmed smoke_key in /apps
```

- [x] **Step 4: Launch and observe the software key injection path**

Run:

```bash
npm run launch:app -- http://192.168.1.32:8080 smoke_key
sleep 4
curl -s http://192.168.1.32:8080/status
```

Expected:

```json
{"state":"running","current_app":"smoke_key","last_status":"ESP_OK"}
```

Expected physical screen behavior:

```text
Title: Key Smoke
Event label alternates LEFT and RIGHT from key.push()
Count increases every 1.5 seconds
```

- [ ] **Step 5: Verify physical touch-swipe input updates the same label**

On the board screen, swipe left, right, up, and down.

Expected:

```text
last: LEFT ...
last: RIGHT ...
last: UP ...
last: DOWN ...
count increments for physical gestures
```

- [x] **Step 6: Record evidence**

Append to `docs/device-bringup.md`:

```markdown
### smoke_key input smoke verification

Commands:

```text
npm run package:app -- apps/smoke_key
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_key smoke_key
npm run launch:app -- http://192.168.1.32:8080 smoke_key
GET /status -> {"state":"running","current_app":"smoke_key","last_status":"ESP_OK"}
```

Result: software `key.push()` updates the same `key.on` event path on the board and is confirmed by serial logs. Physical touch swipes still need direct screen observation in this app.
```

- [x] **Step 7: Update capability status**

In `docs/runtime-capabilities.md`, change `Key input smoke app` from `build-verified` to `board-verified` and cite the new board evidence.

- [x] **Step 8: Run checks**

Run:

```bash
npm run test:firmware-static
git diff --check
```

Expected:

```text
# pass 47
no whitespace errors
```

---

### Task 2: Physical Visual QA For Migrated Display Apps

**Files:**
- Modify: `docs/device-bringup.md`
- Modify: `docs/next-session-plan.md`
- Use existing: `apps/matrix_rain/`
- Use existing: `apps/nixie_clock/`
- Use existing: `apps/clock/`
- Use existing: `apps/conway_life/`
- Use existing: `apps/fluid_pendant/`
- Use existing: `apps/2048/`

- [ ] **Step 1: Launch each app and record physical observations**

Run for each app:

```bash
npm run launch:app -- http://192.168.1.32:8080 matrix_rain
curl -s http://192.168.1.32:8080/status
npm run launch:app -- http://192.168.1.32:8080 nixie_clock
curl -s http://192.168.1.32:8080/status
npm run launch:app -- http://192.168.1.32:8080 clock
curl -s http://192.168.1.32:8080/status
npm run launch:app -- http://192.168.1.32:8080 conway_life
curl -s http://192.168.1.32:8080/status
npm run launch:app -- http://192.168.1.32:8080 fluid_pendant
curl -s http://192.168.1.32:8080/status
```

Expected for each:

```json
{"state":"running","current_app":"<app-id>","last_status":"ESP_OK"}
```

Record these physical checks:

```text
No black screen
No text overlap
Assets visible
Animation moves
Launcher can switch away from the app
```

HTTP lifecycle portion completed on 2026-06-19:

```text
matrix_rain -> state=running,current_app=matrix_rain,last_status=ESP_OK
nixie_clock -> state=running,current_app=nixie_clock,last_status=ESP_OK
clock -> state=running,current_app=clock,last_status=ESP_OK
conway_life -> state=running,current_app=conway_life,last_status=ESP_OK
fluid_pendant -> state=running,current_app=fluid_pendant,last_status=ESP_OK
2048 -> state=running,current_app=2048,last_status=ESP_OK
```

Physical screen observations remain open for this step.

- [ ] **Step 2: If a visual defect appears, add a focused failing static/package test before changing code**

Example for an unsupported LVGL function:

```javascript
it("tracks migrated app runtime API gaps before hardware runs", () => {
  const app = readRequired(join(repoRoot, "apps/<app>/main.lua"));
  const binding = readRequired(luaLvglWidgetsSourcePath);
  assert.match(app, /missing_api_name/);
  assert.doesNotMatch(binding, /"missing_api_name"/);
});
```

Run:

```bash
npm run test:firmware-static
```

Expected: FAIL for the missing API.

- [ ] **Step 3: Implement the smallest binding or app migration fix**

Follow the local pattern in:

```text
firmware/vibeboard_runtime/main/lua_lvgl_widgets.c
firmware/vibeboard_runtime/main/lua_lvgl_canvas.c
apps/<app>/main.lua
```

- [ ] **Step 4: Rebuild, flash, and re-verify the affected app**

Run:

```bash
npm run test:firmware-static
idf.py build
idf.py -p /dev/cu.usbmodem112301 erase-flash flash
npm run launch:app -- http://192.168.1.32:8080 <app-id>
curl -s http://192.168.1.32:8080/status
```

Expected:

```json
{"state":"running","current_app":"<app-id>","last_status":"ESP_OK"}
```

---

### Task 3: Weather Migration API Gap Slice

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`
- Modify: `firmware/vibeboard_runtime/main/lua_sjson.c`
- Modify: `firmware/vibeboard_runtime/main/lua_http.c`
- Modify: `apps/weather/main.lua`
- Modify: `apps/weather/app.info`
- Modify: `docs/runtime-capabilities.md`
- Modify: `docs/device-bringup.md`

- [ ] **Step 1: Keep the current API gaps visible**

Run:

```bash
npm run test:firmware-static
```

Expected: PASS while still containing explicit gap assertions for:

```text
http.cubicserver.get
json.decode
zlib.gunzip
lv_canvas_draw_img
lv_canvas_blur_hor
lv_canvas_blur_ver
```

- [x] **Step 2: Choose one weather gap and write a RED test**

Recommended first gap: `json.decode` alias to existing `sjson.decode`.

Add to `tools/firmware-static-check/test.mjs`:

```javascript
it("exposes json as an alias for sjson for migrated apps", () => {
  const source = readRequired(luaSjsonSourcePath);
  assert.match(source, /lua_setglobal\(L,\s*"json"\)/);
});
```

Run:

```bash
npm run test:firmware-static
```

Expected: FAIL because `json` is not exposed.

- [x] **Step 3: Implement the minimal alias**

In `firmware/vibeboard_runtime/main/lua_sjson.c`, after creating the `sjson` library, expose the same table as `json`.

Use this shape:

```c
luaL_newlib(L, sjson_functions);
lua_pushvalue(L, -1);
lua_setglobal(L, "json");
lua_setglobal(L, "sjson");
```

- [x] **Step 4: Run tests and build**

Run:

```bash
npm run test:firmware-static
idf.py build
```

Expected:

```text
# pass 48
Project build complete
```

2026-06-20 result:

```text
npm run test:firmware-static -> pass 47
idf.py build -> Project build complete
vibeboard_runtime.bin size 0x1777e0, 63% free in app partition
```

- [ ] **Step 5: Continue one weather gap per task**

Apply the same RED/GREEN loop for:

```text
http.cubicserver.get compatibility facade or app rewrite
gzip fallback strategy
canvas image draw or app downgrade
canvas blur fallback or app downgrade
```

2026-06-20 `http.cubicserver.get` result:

```text
tools/firmware-static-check/test.mjs now requires http_cubicserver_get,
VB_HTTP_CUBICSERVER_BASE_URL, and http.cubicserver registration.
firmware/vibeboard_runtime/main/lua_http.c exposes
http.cubicserver.get(path, headers, callback).
npm run test:firmware-static -> pass 47
idf.py build -> Project build complete
vibeboard_runtime.bin size 0x177a70, 63% free in app partition
```

2026-06-20 gzip strategy result:

```text
apps/weather/main.lua no longer requests gzip and no longer depends on
zlib.gunzip or zlib.isgzip.
npm run test:firmware-static -> pass 47
npm run package:app -- apps/weather -> packaged weather
```

2026-06-20 Cubic server base URL config result:

```text
firmware/vibeboard_runtime/main/lua_http.c now reads optional
/sdcard/runtime/cubicserver.json with a base_url field for relative
http.cubicserver.get paths, falling back to http://cubicserver.local.
firmware/vibeboard_runtime/main/install_service.c now exposes
POST /runtime/config?name=cubicserver to write that runtime-owned config.
npm run test:firmware-static -> pass 47
idf.py build -> Project build complete
vibeboard_runtime.bin size 0x177d80, 63% free in app partition
idf.py -p /dev/cu.usbmodem112301 erase-flash flash -> flashed Runtime
POST /runtime/config?name=cubicserver with
{"base_url":"http://192.168.1.26:8791"} -> {"ok":true,"config":"cubicserver"}
```

2026-06-20 weather board run result:

```text
tools/app-uploader native HTTP transport now times out stalled requests
after 8000 ms instead of hanging indefinitely.
apps/weather no longer creates small blur canvases and no longer calls
lv_canvas_draw_img/lv_canvas_blur_hor/lv_canvas_blur_ver.
apps/weather now uses generic local icon assets instead of the 62-file
assets/icons/set2 pack, reducing the packaged upload from 99 files to 37.
npm run test:uploader -> pass 23
npm run test:firmware-static -> pass 47
npm run package:app -- apps/weather -> packaged weather
npm run upload:app -- http://192.168.1.32:8080 dist/apps/weather weather
  -> uploaded 37 files; commit ok; confirmed weather in /apps
POST /launch?app=weather -> {"ok":true,"launched":"weather"}
Repeated /status polls stayed
state=running,current_app=weather,last_status=ESP_OK
Local Cubicserver mock received
GET /v1/weather/now?location=101210401&unit=m
Final /status stayed
state=running,current_app=weather,last_status=ESP_OK
```

Remaining weather gaps:

```text
decide whether richer image/blur visuals need Runtime canvas expansion later
```

---

### Task 4: Deployment Management Tool And Browser UI Slice

**Files:**
- Modify: `tools/app-uploader/index.mjs`
- Create: `tools/app-uploader/delete.mjs`
- Create or modify: `tools/device-web-ui/`
- Modify: `package.json`
- Modify: `docs/runtime-capabilities.md`
- Modify: `docs/device-bringup.md`

- [x] **Step 1: Add stop-then-delete orchestration to the uploader**

Add:

```text
tools/app-uploader/index.mjs getStatus/listApps/stopApp/deleteApp
tools/app-uploader/delete.mjs
package.json delete:app
```

Expected behavior:

```text
GET /status
if target app is current_app and state is running/starting/stopping: POST /stop
POST /apps/delete?app=<id>
GET /apps confirms app is absent
```

Verification:

```text
npm run test:uploader -> pass 22
```

- [x] **Step 2: Add a minimal local browser UI command**

Add a script to `package.json`:

```json
"device:web": "node tools/device-web-ui/server.mjs"
```

Create `tools/device-web-ui/server.mjs` with a tiny local HTTP server that serves a static page and proxies configured board URL requests.

- [x] **Step 3: Show app list and lifecycle controls**

The page must call:

```text
GET /status
GET /apps
POST /launch?app=<id>
POST /stop
POST /rescan
POST /apps/delete?app=<id>
```

It must visibly separate:

```text
compatible:true launchable apps
compatible:false legacy apps
current running app
last_status and last_message
```

- [x] **Step 4: Verify with Browser and board**

Run:

```bash
npm run device:web -- --board http://192.168.1.32:8080
```

Open the local URL and verify app list, launch, stop, rescan, and delete disabled state for running apps.

2026-06-20 device web UI result:

```text
tools/device-web-ui/server.mjs implemented a local static HTML UI plus a
narrow board proxy for /status, /apps, /launch, /stop, /rescan, and
/apps/delete. package.json now exposes test:device-web and device:web.
npm run test:device-web -> pass 4
npm run device:web -- --board http://192.168.1.32:8080 --port 8790
  -> VibeBoard device UI: http://127.0.0.1:8790
curl http://127.0.0.1:8790/api/status
  -> state=running,current_app=weather,last_status=ESP_OK
curl http://127.0.0.1:8790/api/apps
  -> 24 apps, including compatible weather/2048/matrix_rain/nixie_clock/
     clock/conway_life/fluid_pendant/smoke_key and legacy v1 apps as
     compatible:false
curl -i http://127.0.0.1:8790/
  -> HTTP 200, text/html, 7152 bytes
```

2026-06-20 device web UI lifecycle smoke result:

```text
tools/device-web-ui/smoke.mjs added a temporary app lifecycle smoke that
uploads web_ui_smoke, then uses only the local Web UI proxy for launch,
status polling, stop, rescan, and delete.
npm run test:device-web -> pass 6
npm run device:web:smoke -- --board http://192.168.1.32:8080 --base http://127.0.0.1:8790
  -> device web smoke ok: launched and deleted web_ui_smoke
GET /status after smoke:
  -> state=idle,running=false,current_app="",last_message=stopped
GET /apps after smoke:
  -> count=24,has_web_ui_smoke=false
  -> compatible apps remained 2048,matrix_rain,nixie_clock,clock,
     conway_life,fluid_pendant,smoke_key,weather
```

---

### Task 5: Native Module / NES Feasibility Spike

**Files:**
- Modify: `docs/development-plan.md`
- Modify: `docs/upstream-map.md`
- Create: `docs/native-module-abi-notes.md`

- [x] **Step 1: Document what NES actually needs**

Read:

```text
apps/nesgame/main.lua
upstream holocubic-nes-esp32 notes already copied into docs/upstream-map.md
```

Write `docs/native-module-abi-notes.md` with:

```text
Required APIs
Memory footprint assumptions
Display/framebuffer path
Input/gamepad requirements
Why Lua-only cannot satisfy this slice
Minimum native ABI proposal
```

2026-06-20 native ABI checkpoint result:

```text
docs/native-module-abi-notes.md created.
It documents why NES cannot be Lua-only, the app-facing nes/gamepad API,
module_host_api_v1 symbol and ABI requirements, display ownership and
RGB565 DMA chunking, heap/file/task/time/Lua host needs, first board
milestone, and open design decisions.
docs/upstream-map.md now tracks the NES native ABI checkpoint.
No firmware loader code was implemented in this task.
```

Parallel agent follow-up:

```text
The first NES implementation slice should be native module loader failure
surface only: module capability, frozen module_abi.h, native_module_loader
facade, lua_native_module require hook, CMake registration, and precise
failure strings. It should not import NES core or implement display DMA,
audio, or gamepad host API yet.
```

---

### Task 6: Interrupted Upload Board Smoke

**Files:**
- Create: `tools/app-uploader/interrupted-smoke.mjs`
- Modify: `tools/app-uploader/test.mjs`
- Modify: `package.json`
- Modify: `docs/runtime-capabilities.md`
- Modify: `docs/next-session-plan.md`

- [x] **Step 1: Add mock-tested interrupted upload smoke tool**

```text
npm run test:uploader -> pass 27
```

- [x] **Step 2: Verify on board**

```text
npm run upload:interrupted-smoke -- http://192.168.1.32:8080 interrupted_upload_smoke
  -> interrupted upload smoke ok: interrupted_upload_smoke absent after abort at main.lua
GET /status
  -> state=idle,running=false,current_app="",last_message=stopped
GET /apps
  -> 24 apps, no interrupted_upload_smoke
```

---

### Task 7: Commit Boundary Audit

Parallel agent read-only result:

```text
Suggested split:
1. runtime: harden memory layout for larger SD app sets
2. runtime: bridge touch swipes into Lua key events
3. runtime: add LVGL object lifecycle, style, and animation bindings
4. apps: add 2048 runtime migration
5. runtime: add Cubicserver config and weather compatibility
6. tools: add shared-board checks and device web UI
7. tools: validate lvgl input capabilities for migrated apps
8. docs: document NES native module ABI requirements
```

- [ ] **Step 2: Do not implement native loading until the ABI doc is reviewed**

Expected result: no firmware code change in this task.

---

## Self-Review

- Spec coverage: covers input smoke, physical visual QA, next upstream API gap driver, deployment UI, and native/NES deferral.
- Placeholder scan: no `TBD` or open-ended implementation placeholders remain; deferred native work is explicitly a documentation spike.
- Type consistency: paths and commands match existing project scripts and current board URL.
