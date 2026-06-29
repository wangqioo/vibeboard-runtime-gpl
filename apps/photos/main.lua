if _G.PHOTOS_APP and _G.PHOTOS_APP.stop then
  pcall(function() _G.PHOTOS_APP.stop("reload") end)
end

PHOTOS_APP = {
  VERSION = "2026-06-25-minimal-image-playlist",
  APP_DIR = "/sd/apps/photos",
  PHOTO_DIR = "photos",
  METRICS_PATH = "metrics.json",
  SCREEN_W = 320,
  SCREEN_H = 240,
  PLAY_MS = 10000,
  photos_ready = false,
  image_count = 0,
  selected_index = 1,
  selection_changes = 0,
  ticks = 0,
  last_key = "",
  last_error = "",
  current_name = "",
  current_src = "",
  images = {},
  timers = {},
  ui = {}
}

local APP = PHOTOS_APP
_G.PHOTOS_APP = APP
APP.perf = {
  started_ms = 0,
  first_paint_ms = 0,
  ready_ms = 0,
  resource_ms = 0,
  http_ms = 0,
  timer_max_ms = 0,
  stop_requested = false,
  last_error = ""
}

local MAIN = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)
local KEY_NAMES = {}
if key then
  KEY_NAMES[key.LEFT] = "LEFT"
  KEY_NAMES[key.RIGHT] = "RIGHT"
  KEY_NAMES[key.HOME] = "HOME"
  KEY_NAMES[key.EXIT] = "EXIT"
end

local function now_ms()
  if millis then
    local ok, value = pcall(millis)
    if ok and type(value) == "number" then return value end
  end
  if tmr and tmr.now then
    local ok, value = pcall(function() return tmr.now() end)
    if ok and type(value) == "number" then return math.floor(value / 1000) end
  end
  return 0
end

APP.perf.started_ms = now_ms()

local function perf_elapsed()
  local elapsed = now_ms() - (APP.perf.started_ms or 0)
  if elapsed < 0 then return 0 end
  return elapsed
end

local function mark_resource(start_ms)
  local elapsed = now_ms() - (start_ms or now_ms())
  if elapsed > 0 then
    APP.perf.resource_ms = (APP.perf.resource_ms or 0) + elapsed
  end
end

local function mark_first_paint()
  if (APP.perf.first_paint_ms or 0) == 0 then
    APP.perf.first_paint_ms = perf_elapsed()
  end
end

local function mark_perf_timer(start_ms)
  local elapsed = now_ms() - (start_ms or now_ms())
  if elapsed > (APP.perf.timer_max_ms or 0) then
    APP.perf.timer_max_ms = elapsed
  end
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
    .. '"photos_ready":' .. tostring(APP.photos_ready)
    .. ',"image_count":' .. tostring(APP.image_count)
    .. ',"selected_index":' .. tostring(APP.selected_index)
    .. ',"selection_changes":' .. tostring(APP.selection_changes)
    .. ',"ticks":' .. tostring(APP.ticks)
    .. ',"last_key":"' .. json_escape(APP.last_key) .. '"'
    .. ',"current_name":"' .. json_escape(APP.current_name) .. '"'
    .. ',"current_src":"' .. json_escape(APP.current_src) .. '"'
    .. ',"last_error":"' .. json_escape(APP.last_error) .. '"'
    .. ',"perf_first_paint_ms":' .. tostring(APP.perf.first_paint_ms or 0)
    .. ',"perf_ready_ms":' .. tostring(APP.perf.ready_ms or 0)
    .. ',"perf_resource_ms":' .. tostring(APP.perf.resource_ms or 0)
    .. ',"perf_http_ms":' .. tostring(APP.perf.http_ms or 0)
    .. ',"perf_timer_max_ms":' .. tostring(APP.perf.timer_max_ms or 0)
    .. ',"perf_stop_requested":' .. tostring(APP.perf.stop_requested == true)
    .. ',"perf_last_error":"' .. json_escape(APP.perf.last_error or "") .. '"'
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

local function is_image_name(name)
  name = tostring(name or ""):lower()
  return name:match("%.png$") ~= nil or name:match("%.bmp$") ~= nil
end

local function sd_to_lv(path)
  if type(path) == "string" and path:sub(1, 4) == "/sd/" then
    return "S:/" .. path:sub(5)
  end
  return path
end

local function scan_images()
  local images = {}
  if not file or not file.listdir then
    APP.last_error = "file.listdir missing"
    return images
  end

  local ok, entries = pcall(function() return file.listdir(APP.PHOTO_DIR) end)
  if not ok or type(entries) ~= "table" then
    APP.last_error = "no photos dir"
    return images
  end

  for _, entry in ipairs(entries) do
    local name = entry_name(entry)
    if name and not entry_is_dir(entry) and is_image_name(name) then
      images[#images + 1] = tostring(name)
    end
  end

  table.sort(images, function(a, b) return a:lower() < b:lower() end)
  APP.last_error = ""
  return images
end

local function wrap_index(index)
  local count = #APP.images
  if count <= 0 then return 0 end
  while index < 1 do index = index + count end
  while index > count do index = index - count end
  return index
end

local function current_image_name()
  if #APP.images == 0 then return "" end
  APP.selected_index = wrap_index(APP.selected_index)
  return APP.images[APP.selected_index] or ""
end

local function show_current()
  APP.image_count = #APP.images
  local name = current_image_name()
  local resource_start = now_ms()

  if name == "" then
    APP.current_name = ""
    APP.current_src = ""
    set_text(APP.ui.title, "Photos")
    set_text(APP.ui.info, "No PNG/BMP images in /sd/apps/photos/photos")
    if APP.ui.image and lv_img_set_src then
      pcall(function() lv_img_set_src(APP.ui.image, "") end)
    end
    mark_resource(resource_start)
    write_metrics()
    return
  end

  APP.current_name = name
  APP.current_src = sd_to_lv(APP.APP_DIR .. "/" .. APP.PHOTO_DIR .. "/" .. name)
  set_text(APP.ui.title, "Photos")
  set_text(APP.ui.info, tostring(APP.selected_index) .. "/" .. tostring(APP.image_count) .. "  " .. name)
  if APP.ui.image and lv_img_set_src then
    pcall(function() lv_img_set_src(APP.ui.image, APP.current_src) end)
  end
  mark_resource(resource_start)
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
  local resource_start = now_ms()
  local root = lv_scr_act()
  lv_obj_clean(root)
  style_panel(root, 0x05070a)

  APP.ui.title = create_label(root, "Photos", 12, 10, 120, 0xf8fafc)
  APP.ui.info = create_label(root, "scanning", 12, 212, 296, 0x9fb3c8)

  if lv_obj_create then
    APP.ui.panel = lv_obj_create(root)
    lv_obj_set_pos(APP.ui.panel, 0, 36)
    lv_obj_set_size(APP.ui.panel, APP.SCREEN_W, 164)
    style_panel(APP.ui.panel, 0x000000)
  end

  APP.ui.image = lv_img_create(root)
  if APP.ui.image and APP.ui.image ~= 0 then
    lv_obj_set_pos(APP.ui.image, 96, 54)
    lv_obj_set_size(APP.ui.image, 128, 128)
    if lv_img_set_antialias then
      pcall(function() lv_img_set_antialias(APP.ui.image, true) end)
    end
  end
  mark_first_paint()
  mark_resource(resource_start)

  resource_start = now_ms()
  APP.images = scan_images()
  mark_resource(resource_start)
  APP.image_count = #APP.images
  APP.photos_ready = true
  APP.perf.ready_ms = perf_elapsed()
  show_current()
end

local function move_selection(delta)
  if #APP.images == 0 then
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
  APP.perf.stop_requested = true
  for name, timer in pairs(APP.timers) do
    if timer then
      pcall(function() timer:stop() end)
      pcall(function() timer:unregister() end)
    end
    APP.timers[name] = nil
  end
  if key and key.off then pcall(function() key.off() end) end
  if APP.ui.image and lv_img_set_src then
    pcall(function() lv_img_set_src(APP.ui.image, "") end)
  end
  write_metrics()
  if _G.PHOTOS_APP == APP then
    _G.PHOTOS_APP = nil
  end
end

print("Photos minimal image playlist migration start " .. APP.VERSION)

if not lv_scr_act or not lv_label_create or not lv_img_create or not lv_img_set_src then
  error("Photos requires LVGL label and image bindings")
end

draw_ui()

if key and key.on then
  key.on(on_key)
end

if tmr and tmr.create then
  APP.timers.tick = tmr.create()
  APP.timers.tick:alarm(1000, tmr.ALARM_AUTO, function()
    local tick_start = now_ms()
    if app and app.exiting and app.exiting() then
      APP.perf.stop_requested = true
      mark_perf_timer(tick_start)
      APP.stop("exiting")
      return
    end
    APP.ticks = APP.ticks + 1
    if APP.image_count > 1 and APP.PLAY_MS > 0 and (APP.ticks * 1000) % APP.PLAY_MS == 0 then
      move_selection(1)
    end
    mark_perf_timer(tick_start)
    write_metrics()
  end)
else
  write_metrics()
end
