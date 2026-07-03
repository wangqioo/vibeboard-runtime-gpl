# Camera Gallery Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Camera photo management loop with on-device delete, Photos delete support for camera captures, and clearer Web download/delete actions.

**Architecture:** Keep photo ownership in `/sd/data/camera/photos`. Camera remains the capture owner and exposes WebUI JSON/HTML routes. Photos consumes the shared camera folder and can delete only camera-sourced entries, while app-local demo photos remain read-only.

**Tech Stack:** Lua Runtime apps, `file.remove`, LVGL labels/images, app WebUI routes, Node static guardrail tests, ESP-IDF build.

---

### Task 1: Add Static Guardrails

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] Add assertions that Camera has `delete_photo_by_name`, gallery delete hit zone, gallery delete label, Web download URL, and JSON delete URL.
- [ ] Add assertions that Photos has `delete_current_camera_photo`, only deletes `entry.source == "Camera"`, refreshes the image list after deletion, and disables default HOME handling while running.
- [ ] Run `node --test tools/firmware-static-check/test.mjs` and confirm the new assertions fail before implementation.

### Task 2: Implement Camera Delete Loop

**Files:**
- Modify: `apps/camera/main.lua`

- [ ] Add a reusable `delete_photo_by_name(name)` helper that validates names, calls `file.remove`, updates `APP.photos`, clears `last_photo` when needed, clamps `gallery_index`, and writes metrics.
- [ ] Add bottom-bar delete hit zone in gallery mode.
- [ ] Render a delete affordance in the Camera gallery footer.
- [ ] Make Web HTML expose explicit Download and Delete actions, and make `/app/photos` include `delete_url`.

### Task 3: Implement Photos Delete Loop

**Files:**
- Modify: `apps/photos/main.lua`

- [ ] Add a reusable `delete_current_camera_photo()` helper that deletes only camera-sourced entries.
- [ ] Use long HOME or long EXIT to delete the current camera photo; short HOME/EXIT still exits.
- [ ] Refresh the list and image after deletion, showing the empty state when no photos remain.
- [ ] Disable default HOME exit while Photos is active and restore it in `APP.stop`.

### Task 4: Verify and Deploy

**Commands:**
- `node --test tools/firmware-static-check/test.mjs`
- `git diff --check`
- `npm run package:app -- apps/camera`
- `npm run package:app -- apps/photos`
- `npm run upload:app -- http://192.168.1.32:8080 dist/apps/camera camera`
- `npm run upload:app -- http://192.168.1.32:8080 dist/apps/photos photos`
- `source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && idf.py build`

**Manual board check:**
- Launch Camera, take at least one photo, open built-in gallery, delete current photo, confirm the next/empty state.
- Launch Photos, confirm camera photos display, long-press delete path for a camera photo, confirm display refreshes.
- Open Camera WebUI, confirm photo rows expose direct download and delete actions.
