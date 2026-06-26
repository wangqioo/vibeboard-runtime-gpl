if _G.HWMON_APP and _G.HWMON_APP.stop then
  pcall(function() _G.HWMON_APP.stop("reload") end)
end

HWMON_APP = {
  VERSION = "2026-06-25-minimal-hwmon-migration",
  DEFAULT_STATE_URL = "http://192.168.0.80:8888/api/state",
  CONFIG_PATH = "config.json",
  METRICS_PATH = "metrics.json",
  FETCH_MS = 2000,
  state = {
    hwmon_ready = false,
    online = false,
    fetch_attempts = 0,
    last_status = 0,
    last_error = "",
    last_host = "",
    cpu_usage = 0,
    cpu_temp = 0,
    gpu_usage = 0,
    gpu_temp = 0,
    mem_usage = 0,
    ticks = 0
  },
  config = {},
  ui = {},
  timers = {}
}

local APP = HWMON_APP
_G.HWMON_APP = APP

local json = rawget(_G, "json") or rawget(_G, "sjson")
local MAIN = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)

APP.config.state_url = APP.DEFAULT_STATE_URL

local function json_escape(value)
  value = tostring(value or "")
  value = string.gsub(value, "\\", "\\\\")
  value = string.gsub(value, '"', '\\"')
  value = string.gsub(value, "\n", "\\n")
  return value
end

local function write_metrics()
  if not file or not file.write then return end
  local s = APP.state
  local body = "{"
    .. '"hwmon_ready":' .. tostring(s.hwmon_ready)
    .. ',"online":' .. tostring(s.online)
    .. ',"fetch_attempts":' .. tostring(s.fetch_attempts)
    .. ',"last_status":' .. tostring(s.last_status or 0)
    .. ',"last_error":"' .. json_escape(s.last_error) .. '"'
    .. ',"last_host":"' .. json_escape(s.last_host) .. '"'
    .. ',"cpu_usage":' .. tostring(s.cpu_usage or 0)
    .. ',"cpu_temp":' .. tostring(s.cpu_temp or 0)
    .. ',"gpu_usage":' .. tostring(s.gpu_usage or 0)
    .. ',"gpu_temp":' .. tostring(s.gpu_temp or 0)
    .. ',"mem_usage":' .. tostring(s.mem_usage or 0)
    .. ',"ticks":' .. tostring(s.ticks or 0)
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
    pcall(function() lv_obj_set_style_text_color(obj, color, MAIN) end)
  end
end

local function pct(value)
  value = tonumber(value)
  if not value then return 0 end
  if value < 0 then return 0 end
  if value > 100 then return 100 end
  return math.floor(value + 0.5)
end

local function temp(value)
  value = tonumber(value)
  if not value then return 0 end
  return math.floor(value + 0.5)
end

local function pick(...)
  for i = 1, select("#", ...) do
    local value = select(i, ...)
    if value ~= nil and value ~= "" then return value end
  end
  return nil
end

local function read_config_text()
  if not file then return nil end
  if file.read and file.exists and file.exists(APP.CONFIG_PATH) then
    local raw = file.read(APP.CONFIG_PATH)
    if raw and raw ~= "" then return raw end
  end
  if file.getcontents then
    local raw = file.getcontents(APP.CONFIG_PATH)
    if raw and raw ~= "" then return raw end
  end
  return nil
end

local function load_config()
  local raw = read_config_text()
  if not raw then return end
  if not json or not json.decode then
    APP.state.last_error = "json.decode missing"
    return
  end
  local cfg, err = json.decode(raw)
  if type(cfg) ~= "table" then
    APP.state.last_error = "config parse failed: " .. tostring(err)
    return
  end
  if type(cfg.state_url) == "string" and cfg.state_url ~= "" then
    APP.config.state_url = cfg.state_url
  elseif type(cfg.server_url) == "string" and cfg.server_url ~= "" then
    APP.config.state_url = cfg.server_url
  end
end

local function update_ui()
  local s = APP.state
  set_text(APP.ui.status, s.online and "online" or "waiting")
  set_color(APP.ui.status, s.online and 0x62e493 or 0xf2b84b)
  set_text(APP.ui.host, s.last_host ~= "" and s.last_host or APP.config.state_url)
  set_text(APP.ui.cpu, "CPU  " .. tostring(s.cpu_usage) .. "%  " .. tostring(s.cpu_temp) .. "C")
  set_text(APP.ui.gpu, "GPU  " .. tostring(s.gpu_usage) .. "%  " .. tostring(s.gpu_temp) .. "C")
  set_text(APP.ui.mem, "MEM  " .. tostring(s.mem_usage) .. "%")
  if s.last_error ~= "" then
    set_text(APP.ui.footer, s.last_error)
    set_color(APP.ui.footer, 0xff7b4a)
  else
    set_text(APP.ui.footer, "attempts " .. tostring(s.fetch_attempts) .. "  ticks " .. tostring(s.ticks))
    set_color(APP.ui.footer, 0x66717d)
  end
  write_metrics()
end

local function create_label(root, text, x, y, width, color)
  local label = lv_label_create(root)
  lv_label_set_text(label, text)
  lv_obj_set_pos(label, x, y)
  lv_obj_set_width(label, width)
  lv_obj_set_style_text_color(label, color, MAIN)
  if lv_label_set_long_mode then
    pcall(function() lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP) end)
  end
  return label
end

local function draw_ui()
  local root = lv_scr_act()
  lv_obj_clean(root)
  lv_obj_set_style_bg_color(root, 0x06111c, MAIN)

  APP.ui.title = create_label(root, "HW Monitor", 14, 12, 174, 0xf4f7fb)
  APP.ui.status = create_label(root, "starting", 220, 14, 82, 0xf2b84b)
  APP.ui.host = create_label(root, APP.config.state_url, 14, 42, 292, 0x9ba8b7)
  APP.ui.cpu = create_label(root, "CPU  --%  --C", 24, 82, 260, 0x46c7ff)
  APP.ui.gpu = create_label(root, "GPU  --%  --C", 24, 118, 260, 0x62e493)
  APP.ui.mem = create_label(root, "MEM  --%", 24, 154, 260, 0xf2b84b)
  APP.ui.footer = create_label(root, "waiting for host metrics", 14, 210, 292, 0x66717d)

  APP.state.hwmon_ready = true
  update_ui()
end

local function nested_metric(doc, section_name, flat_name, nested_names)
  local flat = doc[flat_name]
  if flat ~= nil then return flat end
  local section = doc[section_name]
  if type(section) == "table" then
    for _, name in ipairs(nested_names) do
      if section[name] ~= nil then return section[name] end
    end
  end
  return nil
end

local function apply_state(doc)
  if type(doc) ~= "table" then
    APP.state.last_error = "invalid state"
    APP.state.online = false
    update_ui()
    return
  end

  APP.state.online = true
  APP.state.last_error = ""
  APP.state.last_host = tostring(pick(doc.host, doc.hostname, doc.name, "host"))
  APP.state.cpu_usage = pct(nested_metric(doc, "cpu", "cpu_usage", { "usage", "load", "percent" }))
  APP.state.cpu_temp = temp(nested_metric(doc, "cpu", "cpu_temp", { "temp", "temperature" }))
  APP.state.gpu_usage = pct(nested_metric(doc, "gpu", "gpu_usage", { "usage", "load", "percent" }))
  APP.state.gpu_temp = temp(nested_metric(doc, "gpu", "gpu_temp", { "temp", "temperature" }))
  APP.state.mem_usage = pct(nested_metric(doc, "mem", "mem_usage", { "usage", "percent" }) or nested_metric(doc, "memory", "memory_usage", { "usage", "percent" }))
  update_ui()
end

local function fetch_state()
  if APP.request_inflight then return end
  if not http or not http.get then
    APP.state.last_error = "http.get missing"
    update_ui()
    return
  end
  APP.request_inflight = true
  APP.state.fetch_attempts = APP.state.fetch_attempts + 1
  update_ui()

  http.get(APP.config.state_url, { timeout_ms = 3000 }, function(code, body)
    APP.request_inflight = false
    APP.state.last_status = tonumber(code) or 0
    if tonumber(code) ~= 200 then
      APP.state.online = false
      APP.state.last_error = "http " .. tostring(code)
      update_ui()
      return
    end
    if not json or not json.decode then
      APP.state.last_error = "json.decode missing"
      update_ui()
      return
    end
    local doc, err = json.decode(body or "")
    if type(doc) ~= "table" then
      APP.state.online = false
      APP.state.last_error = "json parse failed: " .. tostring(err)
      update_ui()
      return
    end
    apply_state(doc)
  end)
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
  APP.state.last_error = "stopped"
  write_metrics()
  if _G.HWMON_APP == APP then
    _G.HWMON_APP = nil
  end
end

load_config()
print("HW Monitor minimal migration start " .. APP.VERSION)
draw_ui()

if tmr and tmr.create then
  APP.timers.boot = tmr.create()
  APP.timers.boot:alarm(200, tmr.ALARM_SINGLE, fetch_state)
  APP.timers.tick = tmr.create()
  APP.timers.tick:alarm(APP.FETCH_MS, tmr.ALARM_AUTO, function()
    if app and app.exiting and app.exiting() then
      APP.stop("exiting")
      return
    end
    APP.state.ticks = APP.state.ticks + 1
    fetch_state()
  end)
else
  APP.state.last_error = "tmr.create missing"
  update_ui()
end
