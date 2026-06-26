if _G.SMOKE_LVGL_WIDGETS_APP and _G.SMOKE_LVGL_WIDGETS_APP.stop then
  pcall(function() _G.SMOKE_LVGL_WIDGETS_APP.stop("reload") end)
end

SMOKE_LVGL_WIDGETS_APP = {
  VERSION = "2026-06-25-phase-3-lvgl-widgets",
  APP_DIR = "/sd/apps/smoke_lvgl_widgets",
  ASSET_DIR = "assets",
  METRICS_PATH = "metrics.json",
  ready = false,
  boot_error = "",
  progress = 20,
  boot_timer = nil,
  anim_timer = nil,
  ui = {},
}

local APP = SMOKE_LVGL_WIDGETS_APP
_G.SMOKE_LVGL_WIDGETS_APP = APP

local function json_escape(value)
  value = tostring(value or "")
  value = string.gsub(value, "\\", "\\\\")
  value = string.gsub(value, '"', '\\"')
  value = string.gsub(value, "\n", "\\n")
  return value
end

local function write_metrics()
  if not file or not file.write then
    return
  end
  local body = "{"
    .. '"ready":' .. tostring(APP.ready)
    .. ',"boot_error":"' .. json_escape(APP.boot_error or "") .. '"'
    .. ',"progress":' .. tostring(APP.progress)
    .. ',"icon_path":"' .. json_escape(APP.icon_path or "") .. '"'
    .. ',"bar_value":' .. tostring(APP.progress)
    .. "}"
  pcall(function() file.write(APP.METRICS_PATH, body) end)
end

local function call(fn, ...)
  if fn then
    return pcall(fn, ...)
  end
  return false
end

local function sd_to_lv(path)
  if type(path) == "string" and path:sub(1, 4) == "/sd/" then
    return "S:/" .. path:sub(5)
  end
  return path
end

local function asset_path(name)
  return sd_to_lv(APP.APP_DIR .. "/" .. APP.ASSET_DIR .. "/" .. name)
end

local function build_ui()
  if APP.ui.built then
    return
  end

  if not lv_resolve_asset_path or not lv_asset_exists then
    error("asset helpers missing")
  end

  APP.icon_path = lv_resolve_asset_path("assets/icon.bmp")
  local asset_ok, asset_detail = lv_asset_exists(APP.icon_path)
  if not asset_ok then
    error("widget icon missing: " .. tostring(asset_detail))
  end

  local root = lv_scr_act()
  lv_obj_clean(root)
  lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
  lv_obj_set_style_bg_color(root, 0x101820)

  local title = lv_label_create(root)
  lv_label_set_text(title, "LVGL Widgets")
  lv_obj_set_style_text_color(title, 0xffffff)
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 8)

  local image = lv_img_create(root)
  lv_img_set_src(image, APP.icon_path)
  lv_obj_set_pos(image, 18, 46)

  local button = lv_btn_create(root)
  lv_obj_set_size(button, 132, 48)
  lv_obj_set_pos(button, 166, 48)
  lv_obj_set_style_bg_color(button, 0x2563eb)
  lv_obj_set_style_radius(button, 8)

  local button_label = lv_label_create(button)
  lv_label_set_text(button_label, "BUTTON")
  lv_obj_set_style_text_color(button_label, 0xffffff)
  lv_obj_align(button_label, LV_ALIGN_CENTER, 0, 0)

  local bar = lv_bar_create(root)
  lv_obj_set_size(bar, 280, 18)
  lv_obj_set_pos(bar, 20, 150)
  lv_bar_set_range(bar, 0, 100)
  lv_bar_set_value(bar, APP.progress, LV_ANIM_OFF)

  local status = lv_label_create(root)
  lv_label_set_text(status, "label + button + bar + image")
  lv_obj_set_width(status, 286)
  lv_obj_set_pos(status, 16, 194)
  lv_obj_set_style_text_color(status, 0x93c5fd)
  lv_label_set_long_mode(status, LV_LABEL_LONG_CLIP)

  local hidden = lv_label_create(root)
  lv_label_set_text(hidden, "hidden")
  lv_obj_add_flag(hidden, LV_OBJ_FLAG_HIDDEN)

  APP.ui.root = root
  APP.ui.image = image
  APP.ui.button = button
  APP.ui.bar = bar
  APP.ui.status = status
  APP.ui.built = true
  APP.ready = true
  write_metrics()
end

local function start_animation()
  if APP.anim_timer then
    return
  end

  APP.anim_timer = tmr.create()
  APP.anim_timer:alarm(600, tmr.ALARM_AUTO, function()
    APP.progress = APP.progress + 17
    if APP.progress > 100 then
      APP.progress = 0
    end
    if APP.ui.bar then
      lv_bar_set_value(APP.ui.bar, APP.progress, LV_ANIM_ON)
    end
    if APP.ui.status then
      lv_label_set_text(APP.ui.status, "widgets ok " .. APP.progress .. "%")
    end
    write_metrics()
    print("smoke lvgl widgets progress " .. APP.progress)
  end)
end

local function boot()
  APP.boot_error = ""
  build_ui()
  start_animation()
  APP.boot_timer = nil
  print("smoke lvgl widgets ok")
end

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_set_style_bg_color(root, 0x101820)

local loading = lv_label_create(root)
lv_label_set_text(loading, "booting widgets")
lv_obj_align(loading, LV_ALIGN_CENTER, 0, 0)

APP.boot_timer = tmr.create()
APP.boot_timer:alarm(50, tmr.ALARM_SINGLE or 0, function()
  local ok, err = pcall(boot)
  if not ok then
    APP.boot_error = tostring(err or "boot failed")
    write_metrics()
    print("smoke lvgl widgets boot error " .. APP.boot_error)
  end
end)

write_metrics()
print("smoke lvgl widgets start")
