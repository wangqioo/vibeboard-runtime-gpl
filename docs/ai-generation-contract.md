# AI Generation Contract

The AI generator must output a package plan before files.

JSON is an intermediate generation plan used by VibeBoard tooling, not the
on-device package format. The on-disk package is app.info + Lua/assets directory,
as documented in [App Package Format](app-package-format.md).

```json
{
  "app": {
    "name": "Timer",
    "entry": "main.lua",
    "description": "Simple countdown timer",
    "capabilities": ["lvgl", "timer"]
  },
  "files": [
    {
      "path": "app.info",
      "type": "text",
      "content": "name = Timer\nentry = main.lua\ndescription = Simple countdown timer\ncapabilities = lvgl,timer\n"
    },
    {
      "path": "main.lua",
      "type": "lua",
      "content": "print(\"timer\")\n"
    }
  ]
}
```

The package plan maps to the on-disk app package as follows:

- `app` metadata becomes `app.info` fields.
- `files[]` becomes files written inside the app directory.
- `app.entry` must name the Lua entry file written by `files[]`.
- Generated asset paths must stay inside the app directory.

Write a package plan to disk:

```bash
npm run write:app-plan -- plan.json
```

Write and package it for device-storage deployment:

```bash
npm run write:app-plan -- plan.json --package
```

The writer generates `app.info` from `app` metadata. If `files[]` also contains `app.info`, the generated metadata wins so the plan has one authoritative metadata source.

Default output:

```text
generated/apps/<app-id>/
```

With `--package`, the existing packager also writes:

```text
dist/apps/<app-id>/
```

Prefer Lua/LVGL app generation when the request is for:

- small-screen UI;
- dashboard or status card;
- simple tool;
- simple game;
- AI widget;
- network card using existing runtime APIs.

## Allowed Runtime Lua APIs

Generated apps must stay inside the Runtime Lua API surface below. If a request needs any other runtime module call, return `Runtime update required` instead of inventing a function.

This list is checked against `tools/app-validator/index.mjs` by `npm run test:ai-contract` so the generator contract and package validator do not drift apart.

Allowed module calls:

- `app.list()`, `app.rescan()`, `app.current()`, `app.exiting()`, `app.exit([reason])`, `app.launch(id)`, `app.set_home_exit(enabled)`, `app.set_webui(enabled)`, `app.route(path, callback)`, `app.route_base()`, `app.on("exit"|"launch"|"stop", callback)`
- `file.exists(path)`, `file.open(path, mode)`, `file.read(path)`, `file.getcontents(path)`, `file.write(path, text)`, `file.putcontents(path, text)`, `file.stat(path)`, `file.mkdir(path)`, `file.remove(path)`, `file.rename(from, to)`, `file.rmdir(path)`, `file.list(path)`, `file.listdir(path)`
- `gamepad.state()`, `gamepad.start(opts)`, `gamepad.stop()`, `gamepad.on(event, callback)`, `gamepad.off([event])`, `gamepad.rescan()`, `gamepad.push_state(state)`
- `http.get(url[, opts], callback)`, `http.post(url[, opts], body, callback)`, `http.cubicserver.get(path, headers, callback)`
- `i2s.start(id, opts)`, `i2s.read(id, max_bytes[, timeout_ms])`, `i2s.write(id, data[, timeout_ms])`, `i2s.stop(id)`, `i2s.status(id)`
- `json.decode(text)`, `json.encode(value)`, `sjson.decode(text)`, `sjson.encode(value)`
- `key.on(callback)`, `key.off()`, `key.push(code, event)`, `key.repeat_start(code[, delay_ms, interval_ms])`, `key.repeat_stop(code)`
- `sys()`, `sys.setbrightness(percent)`
- `time.get()`, `time.getlocal()`, `time.settimezone(tz)`, `time.initntp(host)`
- `tmr.create()`, `tmr.now()`, `tmr.time()`, plus timer object `alarm/start/stop/unregister/state/interval`
- `touch.on(callback)`, `touch.off()`, `touch.push(event, x, y[, ts_ms])`
- `wifi.mode(mode)`, `wifi.start()`, `wifi.sta.config(opts)`, `wifi.sta.connect()`, `wifi.sta.getip()`

## Allowed LVGL UI Symbols

Generated UI code may use only the LVGL symbols below. If the app needs another `lv_*`, `LV_*`, or `ANIM_*` symbol, return `Runtime update required`.

- `ANIM_H`, `ANIM_OPA`, `ANIM_PATH_EASE_OUT`, `ANIM_W`, `ANIM_X`, `ANIM_Y`
- `LV_ALIGN_BOTTOM_LEFT`, `LV_ALIGN_CENTER`, `LV_ALIGN_TOP_LEFT`, `LV_ALIGN_TOP_MID`
- `LV_ANIM_OFF`, `LV_ANIM_ON`
- `LV_GRAD_DIR_VER`, `LV_IMG_CF_TRUE_COLOR`
- `LV_LABEL_LONG_CLIP`, `LV_LABEL_LONG_SCROLL_CIRCULAR`, `LV_LABEL_LONG_WRAP`
- `LV_OBJ_FLAG_HIDDEN`, `LV_OBJ_FLAG_SCROLLABLE`
- `LV_OPA_COVER`, `LV_OPA_TRANSP`, `LV_PART_MAIN`, `LV_ROLLER_MODE_NORMAL`, `LV_STATE_DEFAULT`, `LV_TEXT_ALIGN_CENTER`
- `lv_anim_del`, `lv_anim_delete`, `lv_anim_start`
- `lv_arc_create`, `lv_arc_get_value`, `lv_arc_set_range`, `lv_arc_set_value`
- `lv_asset_exists`, `lv_resolve_asset_path`
- `lv_bar_create`, `lv_bar_set_range`, `lv_bar_set_value`
- `lv_btn_create`
- `lv_canvas_begin`, `lv_canvas_create`, `lv_canvas_draw_rect`, `lv_canvas_draw_text`, `lv_canvas_end`, `lv_canvas_fill_bg`, `lv_canvas_frame_begin`, `lv_canvas_frame_end`, `lv_canvas_load_bmp`
- `lv_dropdown_create`, `lv_dropdown_get_selected`, `lv_dropdown_set_options`, `lv_dropdown_set_selected`
- `lv_font_free`, `lv_font_load`
- `lv_gif_create`, `lv_gif_set_src`
- `lv_img_create`, `lv_img_set_angle`, `lv_img_set_antialias`, `lv_img_set_pivot`, `lv_img_set_src`, `lv_img_set_zoom`
- `lv_label_create`, `lv_label_set_long_mode`, `lv_label_set_text`
- `lv_list_add_btn`, `lv_list_add_text`, `lv_list_create`
- `lv_obj_add_flag`, `lv_obj_align`, `lv_obj_clean`, `lv_obj_clear_flag`, `lv_obj_create`, `lv_obj_del`, `lv_obj_invalidate`, `lv_obj_move_foreground`, `lv_obj_remove_style_all`
- `lv_obj_set_height`, `lv_obj_set_pos`, `lv_obj_set_size`, `lv_obj_set_width`, `lv_obj_set_x`, `lv_obj_set_y`
- `lv_obj_set_style_bg_color`, `lv_obj_set_style_bg_grad_color`, `lv_obj_set_style_bg_grad_dir`, `lv_obj_set_style_bg_grad_stop`, `lv_obj_set_style_bg_main_stop`, `lv_obj_set_style_bg_opa`
- `lv_obj_set_style_border_color`, `lv_obj_set_style_border_opa`, `lv_obj_set_style_border_width`, `lv_obj_set_style_clip_corner`
- `lv_obj_set_style_opa`, `lv_obj_set_style_pad_all`, `lv_obj_set_style_radius`
- `lv_obj_set_style_shadow_color`, `lv_obj_set_style_shadow_ofs_x`, `lv_obj_set_style_shadow_ofs_y`, `lv_obj_set_style_shadow_opa`, `lv_obj_set_style_shadow_spread`, `lv_obj_set_style_shadow_width`
- `lv_obj_set_style_text_align`, `lv_obj_set_style_text_color`, `lv_obj_set_style_text_font`, `lv_obj_set_style_text_letter_space`, `lv_obj_set_style_text_opa`
- `lv_roller_create`, `lv_roller_get_selected`, `lv_roller_set_options`, `lv_roller_set_selected`
- `lv_scr_act`
- `lv_slider_create`, `lv_slider_get_value`, `lv_slider_set_range`, `lv_slider_set_value`
- `lv_switch_create`
- `lv_textarea_add_text`, `lv_textarea_create`, `lv_textarea_get_text`, `lv_textarea_set_text`

Examples that must return `Runtime update required`: `app.set_status_text(...)`, `gamepad.connect(...)`, `tmr.delay(...)`, unsupported `lv_*` bindings, native ABI changes, or hardware driver work.

Return or report `Runtime update required` when the request needs:

- driver changes;
- pin-map changes;
- BLE service changes;
- partition or sdkconfig changes;
- LVGL bindings not exposed by the runtime;
- native module ABI changes.

Requests that return `Runtime update required` must route to firmware/runtime
work instead of pretending the app package can provide the missing driver,
binding, partition, or ABI support.
