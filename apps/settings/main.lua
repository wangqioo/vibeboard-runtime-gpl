if _G.SETTINGS_APP and _G.SETTINGS_APP.stop then
  pcall(function() _G.SETTINGS_APP.stop("reload") end)
end

SETTINGS_APP = {
  VERSION = "0.1.0",
  METRICS_PATH = "metrics.json",
  selected_index = 1,
  brightness = 80,
  ticks = 0,
  selection_changes = 0,
  brightness_changes = 0,
  settings_ready = false,
  last_key = "",
  timers = {},
  ui = {},
  rows = {
    { name = "Display", value = function(app) return "Brightness " .. tostring(app.brightness) .. "%" end },
    { name = "Network", value = function() return "Runtime managed" end },
    { name = "Input", value = function() return "Keys ready" end },
    { name = "Audio", value = function() return "Voice app managed" end },
  },
}

local APP = SETTINGS_APP
_G.SETTINGS_APP = APP

local MAIN_STYLE = 0
local KEY_NAMES = {}
if key then
  KEY_NAMES[key.LEFT] = "LEFT"
  KEY_NAMES[key.RIGHT] = "RIGHT"
  KEY_NAMES[key.UP] = "UP"
  KEY_NAMES[key.DOWN] = "DOWN"
  KEY_NAMES[key.HOME] = "HOME"
  KEY_NAMES[key.EXIT] = "EXIT"
end

local function json_escape(value)
  value = tostring(value or "")
  value = string.gsub(value, "\\", "\\\\")
  value = string.gsub(value, '"', '\\"')
  value = string.gsub(value, "\n", "\\n")
  return value
end

local function write_metrics()
  if not file or not file.write then return end
  local body = "{"
      .. '"settings_ready":' .. tostring(APP.settings_ready)
      .. ',"ticks":' .. tostring(APP.ticks)
      .. ',"selected_index":' .. tostring(APP.selected_index)
      .. ',"selection_changes":' .. tostring(APP.selection_changes)
      .. ',"brightness":' .. tostring(APP.brightness)
      .. ',"brightness_changes":' .. tostring(APP.brightness_changes)
      .. ',"last_key":"' .. json_escape(APP.last_key) .. '"'
      .. "}"
  pcall(function() file.write(APP.METRICS_PATH, body) end)
end

local function set_text(obj, text)
  if obj and lv_label_set_text then
    pcall(function() lv_label_set_text(obj, tostring(text or "")) end)
  end
end

local function set_color(obj, color)
  if obj and lv_obj_set_style_text_color then
    pcall(function() lv_obj_set_style_text_color(obj, color, MAIN_STYLE) end)
  end
end

local function render()
  set_text(APP.ui.title, "Settings")
  set_text(APP.ui.status, "tick " .. tostring(APP.ticks) .. "  key " .. tostring(APP.last_key or ""))

  for index, row in ipairs(APP.rows) do
    local prefix = "  "
    local color = 0xb6c2d1
    if index == APP.selected_index then
      prefix = "> "
      color = 0xffffff
    end
    local value = row.value(APP)
    local label = APP.ui.rows[index]
    set_text(label, prefix .. row.name .. ": " .. value)
    set_color(label, color)
  end

  write_metrics()
end

local function create_label(parent, text, x, y, width, color)
  local label = lv_label_create(parent)
  lv_label_set_text(label, text)
  lv_obj_set_pos(label, x, y)
  lv_obj_set_width(label, width)
  lv_obj_set_style_text_color(label, color, MAIN_STYLE)
  if lv_label_set_long_mode then
    pcall(function() lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP) end)
  end
  return label
end

local function draw_ui()
  local root = lv_scr_act()
  lv_obj_clean(root)
  lv_obj_set_style_bg_color(root, 0x101418, MAIN_STYLE)

  APP.ui.title = create_label(root, "Settings", 14, 12, 160, 0xf8fafc)
  APP.ui.status = create_label(root, "starting", 184, 14, 122, 0x7dd3fc)
  APP.ui.rows = {}
  local y = 52
  for index, _ in ipairs(APP.rows) do
    APP.ui.rows[index] = create_label(root, "", 18, y, 286, 0xb6c2d1)
    y = y + 34
  end
  APP.ui.hint = create_label(root, "UP/DOWN select  LEFT/RIGHT adjust", 18, 208, 286, 0x64748b)
  APP.settings_ready = true
  render()
end

local function clamp_brightness()
  if APP.brightness < 0 then APP.brightness = 0 end
  if APP.brightness > 100 then APP.brightness = 100 end
end

local function accepts_event(evt_type)
  return evt_type == key.SHORT or evt_type == key.LONG_START or evt_type == key.LONG_REPEAT
end

local function on_key(evt_code, evt_type, _ts_ms)
  if not accepts_event(evt_type) then return end

  APP.last_key = KEY_NAMES[evt_code] or tostring(evt_code)
  if evt_code == key.UP then
    APP.selected_index = APP.selected_index - 1
    if APP.selected_index < 1 then APP.selected_index = #APP.rows end
    APP.selection_changes = APP.selection_changes + 1
  elseif evt_code == key.DOWN then
    APP.selected_index = APP.selected_index + 1
    if APP.selected_index > #APP.rows then APP.selected_index = 1 end
    APP.selection_changes = APP.selection_changes + 1
  elseif evt_code == key.LEFT and APP.selected_index == 1 then
    APP.brightness = APP.brightness - 5
    clamp_brightness()
    APP.brightness_changes = APP.brightness_changes + 1
  elseif evt_code == key.RIGHT and APP.selected_index == 1 then
    APP.brightness = APP.brightness + 5
    clamp_brightness()
    APP.brightness_changes = APP.brightness_changes + 1
  elseif evt_code == key.HOME or evt_code == key.EXIT then
    if app and app.exit then pcall(function() app.exit() end) end
  end

  render()
end

function APP.stop(_reason)
  if APP.stopped then return end
  APP.stopped = true
  for _, timer in pairs(APP.timers) do
    if timer then
      pcall(function() timer:stop() end)
      pcall(function() timer:unregister() end)
    end
  end
  APP.timers = {}
  if key and key.off then
    pcall(function() key.off() end)
  end
  write_metrics()
  if _G.SETTINGS_APP == APP then
    _G.SETTINGS_APP = nil
  end
end

print("Settings minimal migration start " .. APP.VERSION)

if not lv_scr_act or not lv_obj_clean or not lv_label_create then
  error("Settings requires LVGL labels")
end

draw_ui()

if key and key.on then
  key.on(on_key)
end

if tmr and tmr.create then
  APP.timers.metrics = tmr.create()
  APP.timers.metrics:alarm(1000, tmr.ALARM_AUTO, function()
    if app and app.exiting and app.exiting() then
      APP.stop("exiting")
      return
    end
    APP.ticks = APP.ticks + 1
    render()
  end)
else
  write_metrics()
end
