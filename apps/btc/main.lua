if _G.BTC_APP and _G.BTC_APP.stop then
  pcall(function() _G.BTC_APP.stop() end)
end

BTC_APP = {
  VERSION = "2026-06-25-minimal-btc-migration",
  SYMBOL = "BTCUSDT",
  BASE_URL = "https://data-api.binance.vision",
  CONFIG_PATH = "config.json",
  METRICS_PATH = "metrics.json",
  REFRESH_MS = 15000,
  SCREEN_W = 320,
  SCREEN_H = 240,
  state = {
    ui_ready = false,
    network_attempts = 0,
    price_ready = false,
    last_status = 0,
    last_error = "",
    last_price = "",
    last_change = "",
    last_update = ""
  },
  ui = {},
  timers = {}
}

local APP = BTC_APP
local json = rawget(_G, "json") or rawget(_G, "sjson")
local MAIN = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)

local function write_metrics()
  if not file or not file.write then return end
  local s = APP.state
  local body = "{"
    .. "\"ui_ready\":" .. tostring(s.ui_ready) .. ","
    .. "\"network_attempts\":" .. tostring(s.network_attempts) .. ","
    .. "\"price_ready\":" .. tostring(s.price_ready) .. ","
    .. "\"last_status\":" .. tostring(s.last_status or 0) .. ","
    .. "\"last_error\":\"" .. tostring(s.last_error or "") .. "\","
    .. "\"last_price\":\"" .. tostring(s.last_price or "") .. "\","
    .. "\"last_change\":\"" .. tostring(s.last_change or "") .. "\","
    .. "\"last_update\":\"" .. tostring(s.last_update or "") .. "\""
    .. "}"
  pcall(function() file.write(APP.METRICS_PATH, body) end)
end

local function set_text(obj, text)
  if obj then pcall(function() lv_label_set_text(obj, tostring(text or "")) end) end
end

local function set_color(obj, color)
  if obj then pcall(function() lv_obj_set_style_text_color(obj, color, MAIN) end) end
end

local function now_text()
  if time and time.getlocal then
    local ok, t = pcall(function() return time.getlocal() end)
    if ok and type(t) == "table" and t.hour then
      return string.format("%02d:%02d:%02d", t.hour or 0, t.min or 0, t.sec or 0)
    end
  end
  if time and time.get then
    local ok, sec = pcall(function() return time.get() end)
    if ok and type(sec) == "number" then
      return tostring(sec)
    end
  end
  return ""
end

local function fmt_price(value)
  local n = tonumber(value)
  if not n then return "--" end
  if n >= 1000 then return string.format("%.1f", n) end
  return string.format("%.3f", n)
end

local function parse_price(body)
  if not json or not json.decode then
    return nil, "json.decode missing"
  end
  local doc, err = json.decode(body or "")
  if type(doc) ~= "table" then
    return nil, tostring(err or "invalid json")
  end
  return doc.price or doc.lastPrice, nil
end

local function load_config()
  if not file or not file.exists or not file.read then return end
  if not file.exists(APP.CONFIG_PATH) then return end
  local raw, read_err = file.read(APP.CONFIG_PATH)
  if not raw or raw == "" then
    APP.state.last_error = tostring(read_err or "config read failed")
    return
  end
  if not json or not json.decode then
    APP.state.last_error = "json.decode missing"
    return
  end
  local cfg, err = json.decode(raw)
  if type(cfg) ~= "table" then
    APP.state.last_error = "config parse failed: " .. tostring(err)
    return
  end
  if type(cfg.base_url) == "string" and cfg.base_url ~= "" then
    APP.BASE_URL = cfg.base_url
  end
  if type(cfg.symbol) == "string" and cfg.symbol ~= "" then
    APP.SYMBOL = cfg.symbol
  end
end

local function update_status(text, color)
  set_text(APP.ui.status, text)
  if color then set_color(APP.ui.status, color) end
end

local function draw_ui()
  local root = lv_scr_act()
  lv_obj_clean(root)
  lv_obj_set_style_bg_color(root, 0x05070a, MAIN)
  lv_obj_set_style_bg_opa(root, 255, MAIN)

  local card = lv_obj_create(root)
  lv_obj_set_pos(card, 10, 12)
  lv_obj_set_size(card, 300, 216)
  lv_obj_set_style_bg_color(card, 0x0c121a, MAIN)
  lv_obj_set_style_bg_opa(card, 255, MAIN)
  lv_obj_set_style_border_color(card, 0x233244, MAIN)
  lv_obj_set_style_border_width(card, 1, MAIN)
  lv_obj_set_style_radius(card, 7, MAIN)
  if lv_obj_clear_flag then
    pcall(function() lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE) end)
  end

  APP.ui.title = lv_label_create(root)
  lv_label_set_text(APP.ui.title, "BTC / USDT")
  lv_obj_set_pos(APP.ui.title, 22, 24)
  lv_obj_set_style_text_color(APP.ui.title, 0xf8fafc, MAIN)

  APP.ui.status = lv_label_create(root)
  lv_label_set_text(APP.ui.status, "starting")
  lv_obj_set_pos(APP.ui.status, 222, 24)
  lv_obj_set_style_text_color(APP.ui.status, 0x93c5fd, MAIN)

  APP.ui.price = lv_label_create(root)
  lv_label_set_text(APP.ui.price, "--")
  lv_obj_set_pos(APP.ui.price, 22, 62)
  lv_obj_set_width(APP.ui.price, 276)
  lv_obj_set_style_text_color(APP.ui.price, 0xffffff, MAIN)
  if lv_obj_set_style_text_font then
    pcall(function() lv_obj_set_style_text_font(APP.ui.price, rawget(_G, "LV_FONT_MONTSERRAT_28") or 28, MAIN) end)
  end

  APP.ui.detail = lv_label_create(root)
  lv_label_set_text(APP.ui.detail, "Waiting for Binance ticker")
  lv_obj_set_pos(APP.ui.detail, 22, 112)
  lv_obj_set_width(APP.ui.detail, 276)
  lv_obj_set_style_text_color(APP.ui.detail, 0xa9bed8, MAIN)
  if lv_label_set_long_mode then
    pcall(function() lv_label_set_long_mode(APP.ui.detail, LV_LABEL_LONG_WRAP) end)
  end

  APP.ui.footer = lv_label_create(root)
  lv_label_set_text(APP.ui.footer, "Network price panel")
  lv_obj_set_pos(APP.ui.footer, 22, 196)
  lv_obj_set_width(APP.ui.footer, 276)
  lv_obj_set_style_text_color(APP.ui.footer, 0x64748b, MAIN)

  APP.state.ui_ready = true
  write_metrics()
end

local function apply_price(price)
  local value = fmt_price(price)
  APP.state.price_ready = value ~= "--"
  APP.state.last_price = value
  APP.state.last_error = ""
  APP.state.last_update = now_text()
  set_text(APP.ui.price, "$" .. value)
  set_color(APP.ui.price, 0x16d39a)
  set_text(APP.ui.detail, "Latest Binance ticker price")
  set_text(APP.ui.footer, "Updated " .. (APP.state.last_update ~= "" and APP.state.last_update or "now"))
  update_status("live", 0x16d39a)
  write_metrics()
end

local function request_price()
  if not http or not http.get then
    APP.state.last_error = "http.get missing"
    update_status("no http", 0xffb347)
    write_metrics()
    return
  end

  APP.state.network_attempts = APP.state.network_attempts + 1
  APP.state.last_error = ""
  update_status("loading", 0x93c5fd)
  write_metrics()

  local url = APP.BASE_URL .. "/api/v3/ticker/price?symbol=" .. APP.SYMBOL
  http.get(url, { timeout_ms = 5000 }, function(code, body)
    APP.state.last_status = tonumber(code) or 0
    if tonumber(code) ~= 200 then
      APP.state.last_error = "http " .. tostring(code)
      update_status("error", 0xffb347)
      set_text(APP.ui.detail, APP.state.last_error)
      write_metrics()
      return
    end
    local price, err = parse_price(body)
    if not price then
      APP.state.last_error = err or "price missing"
      update_status("error", 0xffb347)
      set_text(APP.ui.detail, APP.state.last_error)
      write_metrics()
      return
    end
    apply_price(price)
  end)
end

function APP.stop()
  for name, timer in pairs(APP.timers) do
    if timer then pcall(function() timer:unregister() end) end
    APP.timers[name] = nil
  end
  APP.state.last_error = "stopped"
  write_metrics()
end

load_config()
print("BTC minimal migration start " .. APP.VERSION)
draw_ui()

if tmr and tmr.create then
  APP.timers.boot = tmr.create()
  APP.timers.boot:alarm(200, tmr.ALARM_SINGLE, function()
    request_price()
  end)
  APP.timers.refresh = tmr.create()
  APP.timers.refresh:alarm(APP.REFRESH_MS, tmr.ALARM_AUTO, function()
    if _G.app and _G.app.exiting and _G.app.exiting() then
      APP.stop()
      return
    end
    request_price()
  end)
else
  APP.state.last_error = "tmr.create missing"
  update_status("no timer", 0xffb347)
  write_metrics()
end
