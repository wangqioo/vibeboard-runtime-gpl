if _G.LV_BENCHMARK_APP and _G.LV_BENCHMARK_APP.stop then
  pcall(function() _G.LV_BENCHMARK_APP.stop("reload") end)
end

LV_BENCHMARK_APP = {
  VERSION = "2026-06-25-minimal-lvgl-benchmark",
  APP_DIR = "/sd/apps/lv-benchmark",
  ASSET_DIR = "assets",
  METRICS_PATH = "metrics.json",
  SCREEN_W = 320,
  SCREEN_H = 240,
  TICK_MS = 100,
  benchmark_ready = false,
  frames = 0,
  scene_count = 3,
  rects = 0,
  labels = 0,
  arcs = 0,
  images = 0,
  scene = "startup",
  last_error = "",
  timers = {},
  ui = {}
}

local APP = LV_BENCHMARK_APP
_G.LV_BENCHMARK_APP = APP

local MAIN = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)
local LABEL_LONG_CLIP = rawget(_G, "LV_LABEL_LONG_CLIP") or 3

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
    .. '"benchmark_ready":' .. tostring(APP.benchmark_ready)
    .. ',"frames":' .. tostring(APP.frames)
    .. ',"scene_count":' .. tostring(APP.scene_count)
    .. ',"rects":' .. tostring(APP.rects)
    .. ',"labels":' .. tostring(APP.labels)
    .. ',"arcs":' .. tostring(APP.arcs)
    .. ',"images":' .. tostring(APP.images)
    .. ',"scene":"' .. json_escape(APP.scene) .. '"'
    .. ',"last_error":"' .. json_escape(APP.last_error) .. '"'
    .. "}"
  pcall(function() file.write(APP.METRICS_PATH, body) end)
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

local function call(fn, ...)
  if fn then return pcall(fn, ...) end
  return false
end

local function style_box(obj, color, border, radius)
  if not obj then return end
  call(lv_obj_set_style_bg_color, obj, color or 0x202833, MAIN)
  call(lv_obj_set_style_bg_opa, obj, 255, MAIN)
  call(lv_obj_set_style_border_width, obj, border and 1 or 0, MAIN)
  if border then call(lv_obj_set_style_border_color, obj, border, MAIN) end
  call(lv_obj_set_style_radius, obj, radius or 0, MAIN)
  call(lv_obj_set_style_pad_all, obj, 0, MAIN)
end

local function style_label(obj, color)
  if not obj then return end
  call(lv_obj_set_style_text_color, obj, color or 0xffffff, MAIN)
  call(lv_obj_set_style_text_opa, obj, 255, MAIN)
  call(lv_obj_set_style_text_letter_space, obj, 0, MAIN)
  call(lv_label_set_long_mode, obj, LABEL_LONG_CLIP)
end

local function create_label(parent, text, x, y, width, color)
  local label = lv_label_create(parent)
  lv_label_set_text(label, text or "")
  lv_obj_set_pos(label, x, y)
  lv_obj_set_width(label, width)
  style_label(label, color or 0xffffff)
  APP.labels = APP.labels + 1
  return label
end

local function create_rect(parent, x, y, w, h, color, radius)
  local obj = lv_obj_create(parent)
  lv_obj_set_pos(obj, x, y)
  lv_obj_set_size(obj, w, h)
  style_box(obj, color, nil, radius or 0)
  APP.rects = APP.rects + 1
  return obj
end

local function create_arc(parent, x, y, size, value)
  local arc = lv_arc_create(parent)
  lv_obj_set_pos(arc, x, y)
  lv_obj_set_size(arc, size, size)
  lv_arc_set_range(arc, 0, 100)
  lv_arc_set_value(arc, value or 0)
  APP.arcs = APP.arcs + 1
  return arc
end

local function create_image_probe(parent)
  local image = lv_img_create(parent)
  lv_obj_set_pos(image, 257, 64)
  lv_obj_set_size(image, 40, 40)
  lv_img_set_src(image, asset_path("cog.bmp"))
  lv_img_set_pivot(image, 20, 20)
  lv_img_set_zoom(image, 210)
  lv_img_set_angle(image, 0)
  APP.images = APP.images + 1
  return image
end

local function clear_root()
  if not lv_scr_act or not lv_obj_clean then return nil end
  local ok, root = pcall(function() return lv_scr_act() end)
  if not ok or not root then return nil end
  pcall(function() lv_obj_clean(root) end)
  return root
end

local function build_ui()
  local root = clear_root()
  if not root then
    APP.last_error = "lv root unavailable"
    write_metrics()
    return
  end

  style_box(root, 0x05070a, nil, 0)
  APP.ui.title = create_label(root, "LV Benchmark", 12, 8, 180, 0xf4f7fa)
  APP.ui.status = create_label(root, "warming up", 190, 9, 118, 0xaab4c2)
  APP.ui.footer = create_label(root, "rect label arc image timer", 12, 214, 296, 0x6e7b8a)

  local colors = { 0x31425a, 0x4d6d8a, 0x58a67a, 0xc59f53, 0xb85d5d, 0x7857a8 }
  for row = 0, 2 do
    for col = 0, 3 do
      local index = row * 4 + col + 1
      local x = 14 + col * 54
      local y = 38 + row * 45
      create_rect(root, x, y, 44, 34, colors[((index - 1) % #colors) + 1], 4)
    end
  end

  APP.ui.arc = create_arc(root, 240, 118, 64, 0)
  APP.ui.image = create_image_probe(root)
  APP.ui.metric = create_label(root, "frames 0", 198, 184, 110, 0x4dd88a)
  APP.benchmark_ready = true
  APP.scene = "running"
  write_metrics()
end

local function update_ui()
  APP.frames = APP.frames + 1
  local value = (APP.frames * 7) % 101
  if APP.ui.arc then
    pcall(function() lv_arc_set_value(APP.ui.arc, value) end)
  end
  if APP.ui.image then
    pcall(function() lv_img_set_angle(APP.ui.image, (APP.frames * 120) % 3600) end)
  end
  if APP.ui.status then
    pcall(function() lv_label_set_text(APP.ui.status, "scene " .. APP.scene) end)
  end
  if APP.ui.metric then
    pcall(function()
      lv_label_set_text(APP.ui.metric, "frames " .. tostring(APP.frames) .. " arc " .. tostring(value))
    end)
  end
  write_metrics()
end

function APP.stop(reason)
  APP.scene = reason or "stopped"
  for _, timer in pairs(APP.timers) do
    if timer then pcall(function() timer:stop() end) end
  end
  APP.timers = {}
  write_metrics()
end

build_ui()

if tmr and tmr.create then
  APP.timers.frame = tmr.create()
  APP.timers.frame:alarm(APP.TICK_MS, tmr.ALARM_AUTO, function()
    if app and app.exiting and app.exiting() then
      APP.stop("exiting")
      return
    end
    update_ui()
  end)
else
  APP.last_error = "tmr missing"
  write_metrics()
end
