if _G.MINI_CLAW_APP and _G.MINI_CLAW_APP.stop then
  pcall(function() _G.MINI_CLAW_APP.stop("reload") end)
end

MINI_CLAW_APP = {
  VERSION = "2026-06-25-mini-claw-runtime",
  APP_DIR = "/sd/apps/mini_claw",
  ROUTE_BASE = (app and app.route_base and app.route_base()) or "/mini_claw",
  MAX_BODY_BYTES = 24 * 1024,
  MAX_REPLY_CHARS = 320,
  DEFAULT_LLM_BASE_URL = "https://api.openai.com/v1",
  DEFAULT_WECHAT_BASE_URL = "https://ilinkai.weixin.qq.com",
  routes = {},
  timers = {},
  running = true,
  shutting_down = false,
}

local APP = MINI_CLAW_APP
APP.API_PREFIX = APP.ROUTE_BASE .. "/api"
local json = rawget(_G, "sjson") or rawget(_G, "json")

local MAIN_STYLE = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)
local ALIGN_LEFT = rawget(_G, "LV_TEXT_ALIGN_LEFT") or 0
local LABEL_LONG_CLIP = rawget(_G, "LV_LABEL_LONG_CLIP") or 0
local FONT_12 = rawget(_G, "LV_FONT_MONTSERRAT_12") or 12
local FONT_16 = rawget(_G, "LV_FONT_MONTSERRAT_16") or 16
local FONT_20 = rawget(_G, "LV_FONT_MONTSERRAT_20") or 20

APP.config = {
  llm_base_url = APP.DEFAULT_LLM_BASE_URL,
  llm_api_key = "",
  llm_model = "gpt-4o-mini",
  llm_timeout_ms = 45000,
  max_tool_rounds = 4,
  history_limit = 10,
  wechat_enabled = false,
  wechat_token = "",
  wechat_base_url = APP.DEFAULT_WECHAT_BASE_URL,
  wechat_poll_ms = 3500,
}

APP.state = {
  online = false,
  busy = false,
  request_count = 0,
  tool_count = 0,
  last_error = "",
  last_user = "",
  last_reply = "Open WebUI",
  screen_note = "",
  brightness = 80,
  last_channel = "web",
  last_chat_id = "",
  started_ms = 0,
  logs = {},
  seen = {},
  wechat_context = {},
  wechat_qr = {
    active = false,
    completed = false,
    status = "idle",
    message = "QR idle",
    qrcode = "",
    qr_data_url = "",
    token = "",
    user_id = "",
    base_url = "",
    current_api_base_url = "",
    started_ms = 0,
  },
}

APP.history = {}
APP.ui = {}

local S = APP.state
local UI = APP.ui

local function text_or(value, fallback)
  if value == nil then return fallback or "" end
  local text = tostring(value)
  if text == "" then return fallback or "" end
  return text
end

local function trim(text)
  text = text_or(text, "")
  return text:match("^%s*(.-)%s*$") or ""
end

local function clamp(n, low, high)
  n = tonumber(n) or low
  if n < low then return low end
  if n > high then return high end
  return n
end

local function json_escape(value)
  value = tostring(value or "")
  value = value:gsub("\\", "\\\\")
  value = value:gsub('"', '\\"')
  value = value:gsub("\n", "\\n")
  return value
end

local function safe_json_encode(value)
  if json and json.encode then
    local ok, raw = pcall(json.encode, value)
    if ok and raw then
      return raw
    end
  end
  return nil
end

local function safe_json_decode(raw)
  if not json or not json.decode then
    return nil, "json.decode missing"
  end
  local ok, doc = pcall(json.decode, raw)
  if not ok then
    return nil, doc
  end
  if type(doc) ~= "table" then
    return nil, "bad json"
  end
  return doc
end

local function read_config_text()
  if not file then return nil end
  if file.read and file.exists and file.exists("config.json") then
    local raw = file.read("config.json")
    if raw and raw ~= "" then return raw end
  end
  if file.getcontents then
    local raw = file.getcontents("config.json")
    if raw and raw ~= "" then return raw end
  end
  return nil
end

local function load_config()
  local raw = read_config_text()
  if not raw then return end
  local cfg, err = safe_json_decode(raw)
  if type(cfg) ~= "table" then
    S.last_error = "config parse failed: " .. text_or(err, "unknown")
    return
  end
  for key, value in pairs(cfg) do
    APP.config[key] = value
  end
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

local function create_label(root, text, x, y, width, color, font)
  local label = lv_label_create(root)
  lv_label_set_text(label, text)
  lv_obj_set_pos(label, x, y)
  lv_obj_set_width(label, width)
  lv_obj_set_style_text_color(label, color, MAIN_STYLE)
  if font and lv_obj_set_style_text_font then
    pcall(function() lv_obj_set_style_text_font(label, font, MAIN_STYLE) end)
  end
  if lv_label_set_long_mode then
    pcall(function() lv_label_set_long_mode(label, LABEL_LONG_CLIP) end)
  end
  return label
end

local function draw_ui()
  if not lv_scr_act or not lv_obj_clean then
    return
  end
  local root = lv_scr_act()
  lv_obj_clean(root)
  if lv_obj_set_style_bg_color then
    pcall(function() lv_obj_set_style_bg_color(root, 0x06111c, MAIN_STYLE) end)
  end

  UI.title = create_label(root, "Mini Claw", 14, 10, 160, 0xf4f7fa, FONT_20)
  UI.status = create_label(root, "ready", 236, 12, 70, 0x62e493, FONT_12)
  UI.route = create_label(root, APP.ROUTE_BASE, 14, 40, 120, 0x9ba8b7, FONT_12)
  UI.reply = create_label(root, "Open WebUI", 14, 74, 292, 0xf4b860, FONT_16)
  UI.note = create_label(root, "Set llm_api_key in config.json", 14, 114, 292, 0xaab4c2, FONT_12)
  UI.footer = create_label(root, "POST " .. APP.API_PREFIX, 14, 210, 292, 0x66717d, FONT_12)
  if app and app.set_webui then
    pcall(function() app.set_webui(true) end)
  end
end

local function update_ui()
  set_text(UI.status, S.online and "online" or "ready")
  set_color(UI.status, S.online and 0x62e493 or 0xf4b860)
  set_text(UI.reply, text_or(S.last_reply, "Open WebUI"))
  set_text(UI.note, text_or(S.screen_note, "Set llm_api_key in config.json"))
  set_text(UI.footer, "brightness " .. tostring(S.brightness) .. "%")
end

local function call_webui(enabled)
  if not app or not app.set_webui then
    return false, "app.set_webui not supported"
  end
  return pcall(function() return app.set_webui(enabled) end)
end

local function route_index(req)
  S.request_count = S.request_count + 1
  local path = req and req.path or "/"
  local body = [[<html><body><h1>Mini Claw</h1><p>]] .. path .. [[</p></body></html>]]
  return {
    status = 200,
    type = "text/html; charset=utf-8",
    body = body,
  }
end

local function tool_set_brightness(args)
  local level = clamp(type(args) == "table" and args.level or 80, 1, 100)
  S.brightness = level
  if sys and sys.setbrightness then
    local ok, err = pcall(sys.setbrightness, level)
    if not ok then
      return string.format("{\"ok\":false,\"error\":%q}", tostring(err))
    end
  end
  update_ui()
  return string.format("{\"ok\":true,\"level\":%d}", level)
end

local function llm_configured()
  return text_or(APP.config.llm_api_key, "") ~= "" and text_or(APP.config.llm_model, "") ~= ""
end

local function call_llm(prompt)
  if not http or not http.post then
    return nil, "http.post missing"
  end
  local body = {
    model = APP.config.llm_model,
    input = prompt,
  }
  local raw = safe_json_encode(body)
  if not raw then
    return nil, "encode failed"
  end
  local code, resp = http.post(APP.config.llm_base_url .. "/responses", {
    headers = {
      ["Content-Type"] = "application/json",
      ["Accept"] = "application/json",
      ["Authorization"] = "Bearer " .. text_or(APP.config.llm_api_key, ""),
    },
    timeout = APP.config.llm_timeout_ms,
    bufsz = 4096,
  }, raw)
  if code ~= 200 then
    return nil, "llm http " .. tostring(code) .. ": " .. text_or(resp, "")
  end
  return resp, nil
end

local function refresh_remote_hint()
  if not http or not http.get then
    return
  end
  local base = text_or(APP.config.llm_base_url, "")
  if base == "" then
    return
  end
  pcall(function()
    http.get(base .. "/models", {
      timeout = 1500,
      bufsz = 256,
    }, function(code)
      if tonumber(code) == 200 then
        S.online = true
      end
    end)
  end)
end

local function route_api(req)
  S.request_count = S.request_count + 1
  local method = text_or(req and req.method, "GET")
  local body = text_or(req and req.body, "")
  if method ~= "POST" then
    return {
      status = 200,
      type = "application/json",
      body = '{"ok":true,"route":"api","method":"' .. method .. '"}\n',
    }
  end
  local payload = body ~= "" and safe_json_decode(body) or {}
  if type(payload) ~= "table" then
    payload = {}
  end
  if payload.action == "brightness" then
    return {
      status = 200,
      type = "application/json",
      body = tool_set_brightness({ level = payload.level }),
    }
  end
  if payload.action == "chat" then
    if not llm_configured() then
      return {
        status = 200,
        type = "application/json",
        body = '{"ok":false,"error":"LLM is not configured. Set base URL, API key, and model in WebUI."}\n',
      }
    end
    local resp, err = call_llm(text_or(payload.input, ""))
    if not resp then
      return {
        status = 500,
        type = "application/json",
        body = '{"ok":false,"error":"' .. json_escape(err) .. '"}\n',
      }
    end
    S.last_reply = text_or(resp, "")
    update_ui()
    return {
      status = 200,
      type = "application/json",
      body = '{"ok":true,"reply":"' .. json_escape(S.last_reply) .. '"}\n',
    }
  end
  return {
    status = 200,
    type = "application/json",
    body = '{"ok":true,"route":"api","method":"POST"}\n',
  }
end

local function dispatch_route(req)
  local path = text_or(req and req.path, "/")
  local handler = APP.routes[path] or route_index
  return handler(req)
end

local function register_routes()
  APP.routes["/"] = route_index
  APP.routes["/api"] = route_api
  if app and app.route then
    pcall(function() app.route("/", dispatch_route) end)
    pcall(function() app.route("/api", dispatch_route) end)
  end
end

function APP.stop(reason)
  APP.running = false
  APP.shutting_down = true
  S.last_error = text_or(reason, "")
  if app and app.set_webui then
    pcall(function() app.set_webui(false) end)
  end
end

function APP.handle(req)
  local path = text_or(req and req.path, "/")
  local handler = APP.routes[path] or route_index
  return handler(req)
end

load_config()
refresh_remote_hint()
draw_ui()
register_routes()
update_ui()
call_webui(true)

if tmr and tmr.create then
  local timer = tmr.create()
  if timer and timer.alarm then
    timer:alarm(APP.config.wechat_poll_ms or 3500, tmr.ALARM_AUTO, function()
      if not APP.running then
        return
      end
      update_ui()
    end)
    APP.timers.refresh = timer
  end
end

if call_webui(true) then
  print("[mini_claw] ready", APP.VERSION, APP.ROUTE_BASE)
end
