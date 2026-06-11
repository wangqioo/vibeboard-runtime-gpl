# Weather Card LVGL Lua Design

## Goal

Upgrade the SD-card `smoke_ui` app from a centered label into a static weather card, proving that Lua apps can compose a small real UI without reflashing for layout/text changes.

## Scope

This slice expands the existing Lua LVGL bridge just enough for card-style layouts:

- `lv_obj_create(parent)`
- `lv_obj_set_size(obj, width, height)`
- `lv_obj_set_width(obj, width)`
- `lv_obj_set_height(obj, height)`
- `lv_obj_set_style_bg_color(obj, hex_color)`
- `lv_obj_set_style_text_color(obj, hex_color)`
- `lv_obj_set_style_radius(obj, radius)`
- `lv_obj_set_style_pad_all(obj, pad)`
- `lv_obj_set_style_border_width(obj, width)`
- `lv_obj_set_style_border_color(obj, hex_color)`
- `LV_ALIGN_TOP_LEFT`
- `LV_ALIGN_TOP_MID`
- `LV_ALIGN_BOTTOM_LEFT`

The demo remains static. It does not fetch weather, load custom fonts, draw images, or handle touch events.

## Runtime Behavior

`apps/smoke_ui/main.lua` clears the active screen, paints a dark background, creates one card container, and places several labels for location, temperature, condition, humidity, and wind. It prints `weather card ok` when the UI script finishes.

## Acceptance

- Static tests require the new Lua API surface and the updated weather-card script.
- `npm test` passes.
- `idf.py build` passes.
- On board, serial logs show `Lua app start: smoke_ui`, `weather card ok`, and `Lua app ok`.
- The screen shows a card-style weather UI instead of the old single Hello label.
