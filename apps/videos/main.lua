if _G.VIDEOS_APP and _G.VIDEOS_APP.stop then
  pcall(function() _G.VIDEOS_APP.stop("reload") end)
end

VIDEOS_APP = {
  VERSION = "2026-06-25-minimal-gif-playlist",
  APP_DIR = "/sd/apps/videos",
  VIDEO_DIR = "videos",
  METRICS_PATH = "metrics.json",
  SCREEN_W = 320,
  SCREEN_H = 240,
  PLAY_MS = 10000,
  videos_ready = false,
  gif_count = 0,
  selected_index = 1,
  selection_changes = 0,
  ticks = 0,
  last_key = "",
  last_error = "",
  current_name = "",
  current_src = "",
  gifs = {},
  timers = {},
  ui = {}
}

local APP = VIDEOS_APP
_G.VIDEOS_APP = APP

local MAIN = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)
local KEY_NAMES = {}
if key then
  KEY_NAMES[key.LEFT] = "LEFT"
  KEY_NAMES[key.RIGHT] = "RIGHT"
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
    .. '"videos_ready":' .. tostring(APP.videos_ready)
    .. ',"gif_count":' .. tostring(APP.gif_count)
    .. ',"selected_index":' .. tostring(APP.selected_index)
    .. ',"selection_changes":' .. tostring(APP.selection_changes)
    .. ',"ticks":' .. tostring(APP.ticks)
    .. ',"last_key":"' .. json_escape(APP.last_key) .. '"'
    .. ',"current_name":"' .. json_escape(APP.current_name) .. '"'
    .. ',"current_src":"' .. json_escape(APP.current_src) .. '"'
    .. ',"last_error":"' .. json_escape(APP.last_error) .. '"'
    .. "}"
  pcall(function() file.write(APP.METRICS_PATH, body) end)
end

local function set_text(obj, text)
  if obj and lv_label_set_text then
    pcall(function() lv_label_set_text(obj, tostring(text or "")) end)
  end
end

local function style_text(obj, color, opa)
  if not obj then return end
  if lv_obj_set_style_text_color then pcall(function() lv_obj_set_style_text_color(obj, color, MAIN) end) end
  if lv_obj_set_style_text_opa then pcall(function() lv_obj_set_style_text_opa(obj, opa or 255, MAIN) end) end
end

local function style_panel(obj, color)
  if not obj then return end
  if lv_obj_set_style_bg_color then pcall(function() lv_obj_set_style_bg_color(obj, color, MAIN) end) end
  if lv_obj_set_style_bg_opa then pcall(function() lv_obj_set_style_bg_opa(obj, 255, MAIN) end) end
  if lv_obj_set_style_border_width then pcall(function() lv_obj_set_style_border_width(obj, 0, MAIN) end) end
  if lv_obj_set_style_radius then pcall(function() lv_obj_set_style_radius(obj, 0, MAIN) end) end
  if lv_obj_set_style_pad_all then pcall(function() lv_obj_set_style_pad_all(obj, 0, MAIN) end) end
end

local function entry_name(entry)
  if type(entry) == "string" then return entry end
  if type(entry) == "table" then return entry.name end
  return nil
end

local function entry_is_dir(entry)
  return type(entry) == "table" and entry.is_dir == true
end

local function is_gif_name(name)
  name = tostring(name or "")
  return name:lower():match("%.gif$") ~= nil
end

local function sd_to_lv(path)
  if type(path) == "string" and path:sub(1, 4) == "/sd/" then
    return "S:/" .. path:sub(5)
  end
  return path
end

local function scan_gifs()
  local gifs = {}
  if not file or not file.listdir then
    APP.last_error = "file.listdir missing"
    return gifs
  end

  local ok, entries = pcall(function() return file.listdir(APP.VIDEO_DIR) end)
  if not ok or type(entries) ~= "table" then
    APP.last_error = "no videos dir"
    return gifs
  end

  for _, entry in ipairs(entries) do
    local name = entry_name(entry)
    if name and not entry_is_dir(entry) and is_gif_name(name) then
      gifs[#gifs + 1] = tostring(name)
    end
  end

  table.sort(gifs, function(a, b) return a:lower() < b:lower() end)
  APP.last_error = ""
  return gifs
end

local function wrap_index(index)
  local count = #APP.gifs
  if count <= 0 then return 0 end
  while index < 1 do index = index + count end
  while index > count do index = index - count end
  return index
end

local function current_gif_name()
  if #APP.gifs == 0 then return "" end
  APP.selected_index = wrap_index(APP.selected_index)
  return APP.gifs[APP.selected_index] or ""
end

local function show_current()
  APP.gif_count = #APP.gifs
  local name = current_gif_name()

  if name == "" then
    APP.current_name = ""
    APP.current_src = ""
    set_text(APP.ui.title, "Videos")
    set_text(APP.ui.info, "No GIFs in /sd/apps/videos/videos")
    if APP.ui.gif and lv_gif_set_src then
      pcall(function() lv_gif_set_src(APP.ui.gif, nil) end)
    end
    write_metrics()
    return
  end

  APP.current_name = name
  APP.current_src = sd_to_lv(APP.APP_DIR .. "/" .. APP.VIDEO_DIR .. "/" .. name)
  set_text(APP.ui.title, "Videos")
  set_text(APP.ui.info, tostring(APP.selected_index) .. "/" .. tostring(APP.gif_count) .. "  " .. name)
  if APP.ui.gif and lv_gif_set_src then
    pcall(function() lv_gif_set_src(APP.ui.gif, APP.current_src) end)
  end
  write_metrics()
end

local function create_label(parent, text, x, y, width, color)
  local label = lv_label_create(parent)
  lv_label_set_text(label, text or "")
  lv_obj_set_pos(label, x, y)
  lv_obj_set_width(label, width)
  style_text(label, color or 0xffffff, 255)
  if lv_label_set_long_mode then
    pcall(function() lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP) end)
  end
  return label
end

local function draw_ui()
  local root = lv_scr_act()
  lv_obj_clean(root)
  style_panel(root, 0x05070a)

  APP.ui.title = create_label(root, "Videos", 12, 10, 120, 0xf8fafc)
  APP.ui.info = create_label(root, "scanning", 12, 212, 296, 0x9fb3c8)

  if lv_obj_create then
    APP.ui.panel = lv_obj_create(root)
    lv_obj_set_pos(APP.ui.panel, 0, 36)
    lv_obj_set_size(APP.ui.panel, APP.SCREEN_W, 164)
    style_panel(APP.ui.panel, 0x000000)
  end

  if lv_gif_create then
    APP.ui.gif = lv_gif_create(root)
    if APP.ui.gif and APP.ui.gif ~= 0 then
      lv_obj_set_pos(APP.ui.gif, 80, 48)
      lv_obj_set_size(APP.ui.gif, 160, 140)
    end
  end

  APP.gifs = scan_gifs()
  APP.gif_count = #APP.gifs
  APP.videos_ready = true
  show_current()
end

local function move_selection(delta)
  if #APP.gifs == 0 then
    show_current()
    return
  end
  APP.selected_index = wrap_index(APP.selected_index + delta)
  APP.selection_changes = APP.selection_changes + 1
  show_current()
end

local function accepts_event(evt_type)
  return evt_type == key.SHORT or evt_type == key.LONG_START
end

local function on_key(evt_code, evt_type, _ts_ms)
  if not accepts_event(evt_type) then return end
  APP.last_key = KEY_NAMES[evt_code] or tostring(evt_code)
  if evt_code == key.LEFT then
    move_selection(-1)
  elseif evt_code == key.RIGHT then
    move_selection(1)
  elseif evt_code == key.HOME or evt_code == key.EXIT then
    if app and app.exit then pcall(function() app.exit() end) end
  end
end

function APP.stop(_reason)
  if APP.stopped then return end
  APP.stopped = true
  for name, timer in pairs(APP.timers) do
    if timer then
      pcall(function() timer:stop() end)
      pcall(function() timer:unregister() end)
    end
    APP.timers[name] = nil
  end
  if key and key.off then pcall(function() key.off() end) end
  if APP.ui.gif and lv_gif_set_src then
    pcall(function() lv_gif_set_src(APP.ui.gif, nil) end)
  end
  write_metrics()
  if _G.VIDEOS_APP == APP then
    _G.VIDEOS_APP = nil
  end
end

print("Videos minimal GIF playlist migration start " .. APP.VERSION)

if not lv_scr_act or not lv_label_create or not lv_gif_create then
  error("Videos requires LVGL label and GIF bindings")
end

draw_ui()

if key and key.on then
  key.on(on_key)
end

if tmr and tmr.create then
  APP.timers.tick = tmr.create()
  APP.timers.tick:alarm(1000, tmr.ALARM_AUTO, function()
    if app and app.exiting and app.exiting() then
      APP.stop("exiting")
      return
    end
    APP.ticks = APP.ticks + 1
    if APP.gif_count > 1 and APP.PLAY_MS > 0 and (APP.ticks * 1000) % APP.PLAY_MS == 0 then
      move_selection(1)
    else
      write_metrics()
    end
  end)
else
  write_metrics()
end
