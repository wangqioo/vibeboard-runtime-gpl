# LVGL Label Lua Binding Design

## Goal

Let the first SD-card Lua app draw a minimal LVGL label on the LCKFB ESP32-S3 display without reflashing for every UI text/layout change.

## Scope

This slice adds only the smallest LVGL bridge needed for a visible smoke UI:

- `lv_scr_act()`
- `lv_obj_clean(obj)`
- `lv_label_create(parent)`
- `lv_label_set_text(label, text)`
- `lv_obj_align(obj, align, x, y)`
- `LV_ALIGN_CENTER`

Lua sees LVGL objects as integer handles. Handle `0` is the active screen. Created objects are stored in a small firmware-side table for the lifetime of one Lua run.

## Runtime Behavior

The firmware still boots the board, mounts SD, scans `/sdcard/apps`, and runs the first app with `app.info`.

The boot status screen is drawn before Lua starts. If Lua draws UI and clears the root screen, its UI remains visible. If Lua fails, the firmware redraws the boot screen with the Lua error status.

## Safety Boundaries

All LVGL calls from Lua go through `lvgl_port_lock()` and `lvgl_port_unlock()`. Invalid object handles raise a Lua error instead of dereferencing a bad pointer.

This is not a full Cubic Lua compatibility layer. Weather, fonts, images, networking, timers, and event callbacks stay out of scope for this slice.

## Acceptance

- `apps/smoke_ui/main.lua` can call the LVGL APIs above.
- Static firmware tests guard the binding surface.
- `idf.py build` succeeds.
- On board, serial logs show `Lua app start: smoke_ui`, `lvgl smoke ok`, and `Lua app ok`.
- The display shows `Hello LVGL Lua`.
