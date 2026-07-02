# Camera App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real Camera app with live preview, shutter, BMP save to SD, and Web download links.

**Architecture:** Keep low-level capture and RGB565 conversion in the Runtime `camera` module. Put product behavior in `apps/camera`: HOME/touch shutter, app-local `photos/`, metrics, and active-app WebUI routes linking to `/apps/file`.

**Tech Stack:** Lua app package, Runtime camera module, LVGL labels for startup/fallback state, WebUI route bridge, `/apps/file` download endpoint, Node static guardrails, ESP-IDF build.

---

### Task 1: Static Tests

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] Add failing tests for `apps/camera/app.info` and `apps/camera/main.lua`.
- [ ] Assert the app declares `capabilities = lvgl,timer,input,file,camera,webui`.
- [ ] Assert the app calls `camera.preview_start`, `camera.preview_stop`, `camera.capture`, `camera.save`, `camera.release`, and `camera.stop`.
- [ ] Assert the app registers WebUI routes and links to `/apps/file?app=camera&path=photos/`.
- [ ] Assert `lua_camera.c` can save `.bmp` via a BMP writer.

### Task 2: BMP Save Support

**Files:**
- Modify: `firmware/vibeboard_runtime/main/lua_camera.c`

- [ ] Add a small BMP writer for RGB565 frames.
- [ ] Use BMP output when `camera.save(..., "name.bmp")` receives a `.bmp` path.
- [ ] Keep existing raw RGB565 save behavior for non-BMP paths.

### Task 3: Camera App

**Files:**
- Create: `apps/camera/app.info`
- Create: `apps/camera/main.lua`

- [ ] Create `photos/` on startup.
- [ ] Start preview.
- [ ] Register HOME short, touch-up, and Web `/capture` shutter requests.
- [ ] Queue shutter requests and run the blocking camera capture from a timer, not inside the HTTP route callback.
- [ ] Save photos as `photos/capture_<n>.bmp`.
- [ ] Write `metrics.json`.
- [ ] Register `/` and `/api` WebUI routes.

### Task 4: Verification

**Commands:**

```bash
node --test tools/firmware-static-check/test.mjs --test-name-pattern "camera"
node tools/app-validator/cli.mjs apps/camera
node tools/app-validator/cli.mjs apps/smoke_camera
git diff --check
source /Users/wq/esp-idf/export.sh >/dev/null && idf.py build
```

Board verification after build:

```bash
idf.py -p /dev/cu.usbmodem112301 flash
npm run package:app -- apps/camera
npm run upload:app -- http://192.168.1.32:8080 dist/apps/camera camera
curl -s -X POST 'http://192.168.1.32:8080/launch?app=camera'
```

Then trigger `/app/capture`, press HOME, or touch the screen to take a photo, and download the BMP from `/apps/file`.
