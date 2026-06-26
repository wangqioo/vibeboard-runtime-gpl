if _G.SMOKE_LVGL_STYLE_APP and _G.SMOKE_LVGL_STYLE_APP.stop then
  pcall(function() _G.SMOKE_LVGL_STYLE_APP.stop("reload") end)
end

SMOKE_LVGL_STYLE_APP = {
  VERSION = "2026-06-25-phase-3-lvgl-style",
  METRICS_PATH = "metrics.json",
  ready = false,
  boot_error = "",
  pulse = 0,
  boot_timer = nil,
  anim_timer = nil,
  ui = {},
}

local APP = SMOKE_LVGL_STYLE_APP
_G.SMOKE_LVGL_STYLE_APP = APP

local MAIN = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)
local ALIGN_CENTER = rawget(_G, "LV_ALIGN_CENTER") or 0
local ALIGN_TOP_LEFT = rawget(_G, "LV_ALIGN_TOP_LEFT") or 1
local ALIGN_TOP_MID = rawget(_G, "LV_ALIGN_TOP_MID") or 2
local TEXT_CENTER = rawget(_G, "LV_TEXT_ALIGN_CENTER") or 1
local FONT_10 = rawget(_G, "LV_FONT_MONTSERRAT_10") or 10
local FONT_14 = rawget(_G, "LV_FONT_MONTSERRAT_14") or 14
local FONT_16 = rawget(_G, "LV_FONT_MONTSERRAT_16") or 16
local FONT_28 = rawget(_G, "LV_FONT_MONTSERRAT_28") or 28
local LONG_CLIP = rawget(_G, "LV_LABEL_LONG_CLIP") or 1
local LONG_WRAP = rawget(_G, "LV_LABEL_LONG_WRAP") or 0

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
    .. ',"pulse":' .. tostring(APP.pulse)
    .. ',"recolor_supported":' .. tostring(APP.recolor_supported == true)
    .. ',"title_font":' .. tostring(APP.title_font or 0)
    .. ',"metric_font":' .. tostring(APP.metric_font or 0)
    .. ',"badge_font":' .. tostring(APP.badge_font or 0)
    .. "}"
  pcall(function() file.write(APP.METRICS_PATH, body) end)
end

local function maybe(fn, ...)
  if fn then
    pcall(fn, ...)
  end
end

local function build_ui()
  if APP.ui.built then
    return
  end

  local root = lv_scr_act()
  lv_obj_clean(root)
  lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
  lv_obj_set_style_bg_color(root, 0x0f172a, MAIN)
  lv_obj_set_style_text_color(root, 0xe5eefb, MAIN)

  local card = lv_obj_create(root)
  lv_obj_set_size(card, 286, 174)
  lv_obj_align(card, ALIGN_CENTER, 0, -4)
  lv_obj_set_style_bg_color(card, 0x172033, MAIN)
  lv_obj_set_style_bg_opa(card, 235, MAIN)
  lv_obj_set_style_opa(card, 238, MAIN)
  lv_obj_set_style_radius(card, 8, MAIN)
  lv_obj_set_style_pad_all(card, 12, MAIN)
  lv_obj_set_style_border_width(card, 1, MAIN)
  lv_obj_set_style_border_color(card, 0x4f8cff, MAIN)
  lv_obj_set_style_border_opa(card, 160, MAIN)

  local title = lv_label_create(card)
  lv_label_set_text(title, "LVGL Style Smoke")
  lv_obj_set_width(title, 250)
  lv_obj_align(title, ALIGN_TOP_MID, 0, 2)
  lv_obj_set_style_text_font(title, FONT_16, MAIN)
  lv_obj_set_style_text_color(title, 0xffffff, MAIN)
  lv_obj_set_style_text_align(title, TEXT_CENTER, MAIN)

  local metric = lv_label_create(card)
  lv_label_set_text(metric, "opa 238 / font 28")
  lv_obj_set_width(metric, 250)
  lv_obj_align(metric, ALIGN_TOP_MID, 0, 34)
  lv_obj_set_style_text_font(metric, FONT_28, MAIN)
  lv_obj_set_style_text_color(metric, 0x7dd3fc, MAIN)
  lv_obj_set_style_text_align(metric, TEXT_CENTER, MAIN)
  lv_label_set_long_mode(metric, LONG_CLIP)

  local detail = lv_label_create(card)
  lv_label_set_text(detail, "#ffcf70 recolor# long text wraps through LV_LABEL_LONG_WRAP and stays inside the card.")
  lv_obj_set_width(detail, 250)
  lv_obj_align(detail, ALIGN_TOP_LEFT, 6, 86)
  lv_obj_set_style_text_font(detail, FONT_14, MAIN)
  lv_obj_set_style_text_color(detail, 0xcbd5e1, MAIN)
  lv_obj_set_style_text_align(detail, TEXT_CENTER, MAIN)
  lv_label_set_long_mode(detail, LONG_WRAP)
  maybe(rawget(_G, "lv_label_set_recolor"), detail, true)

  local badge = lv_obj_create(card)
  lv_obj_set_size(badge, 112, 26)
  lv_obj_align(badge, ALIGN_TOP_MID, 0, 128)
  lv_obj_set_style_bg_color(badge, 0x22c55e, MAIN)
  lv_obj_set_style_bg_opa(badge, 96, MAIN)
  lv_obj_set_style_opa(badge, 176, MAIN)
  lv_obj_set_style_radius(badge, 7, MAIN)
  lv_obj_set_style_border_width(badge, 0, MAIN)
  lv_obj_set_style_pad_all(badge, 0, MAIN)

  local badge_label = lv_label_create(badge)
  lv_label_set_text(badge_label, "STYLE OK")
  lv_obj_align(badge_label, ALIGN_CENTER, 0, 0)
  lv_obj_set_style_text_font(badge_label, FONT_10, MAIN)
  lv_obj_set_style_text_color(badge_label, 0xeafff1, MAIN)
  lv_label_set_long_mode(badge_label, LONG_CLIP)

  APP.ui.root = root
  APP.ui.card = card
  APP.ui.title = title
  APP.ui.metric = metric
  APP.ui.detail = detail
  APP.ui.badge = badge
  APP.ui.badge_label = badge_label
  APP.title_font = FONT_16
  APP.metric_font = FONT_28
  APP.badge_font = FONT_10
  APP.recolor_supported = rawget(_G, "lv_label_set_recolor") ~= nil
  APP.ui.built = true
  APP.ready = true
  write_metrics()
end

local function start_animation()
  if APP.anim_timer then
    return
  end

  APP.anim_timer = tmr.create()
  APP.anim_timer:alarm(700, tmr.ALARM_AUTO, function()
    APP.pulse = APP.pulse + 1
    if APP.ui.metric then
      lv_label_set_text(APP.ui.metric, "pulse " .. APP.pulse .. " / font " .. tostring(APP.metric_font))
    end
    if APP.ui.badge then
      local opa = (APP.pulse % 2 == 0) and 176 or 96
      lv_obj_set_style_opa(APP.ui.badge, opa, MAIN)
      lv_obj_set_style_bg_opa(APP.ui.badge, opa / 2, MAIN)
    end
    write_metrics()
    print("smoke lvgl style pulse " .. APP.pulse)
  end)
end

local function boot()
  APP.boot_error = ""
  build_ui()
  start_animation()
  APP.boot_timer = nil
  print("smoke lvgl style ok")
end

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_set_style_bg_color(root, 0x0f172a, MAIN)
local loading = lv_label_create(root)
lv_label_set_text(loading, "booting style")
lv_obj_align(loading, ALIGN_CENTER, 0, 0)

APP.boot_timer = tmr.create()
APP.boot_timer:alarm(50, tmr.ALARM_SINGLE or 0, function()
  local ok, err = pcall(boot)
  if not ok then
    APP.boot_error = tostring(err or "boot failed")
    write_metrics()
    print("smoke lvgl style boot error " .. APP.boot_error)
  end
end)

write_metrics()
print("smoke lvgl style start")
