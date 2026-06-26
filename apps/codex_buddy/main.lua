if _G.CODEX_BUDDY_APP and _G.CODEX_BUDDY_APP.stop then
  pcall(function() _G.CODEX_BUDDY_APP.stop("reload") end)
end

CODEX_BUDDY_APP = {
  VERSION = "2026-06-25-runtime-codex-buddy",
  APP_DIR = "/sd/apps/codex_buddy",
  CONFIG_PATH = "config.json",
  METRICS_PATH = "metrics.json",
  DEFAULT_BRIDGE_URL = "http://192.168.0.80:8788",
  POLL_MS = 1800,
  SCREEN_W = 320,
  SCREEN_H = 240,
  config = {
    bridge_url = "http://192.168.0.80:8788",
    character = "bufo",
    use_gif = true
  },
  state = {
    buddy_ready = false,
    online = false,
    polls = 0,
    ticks = 0,
    last_http_code = 0,
    last_error = "",
    last_message = "starting",
    event = "",
    pet_state = "sleep",
    pet_text = "no codex",
    gif_visible = false,
    gif_state = "",
    gif_src = "",
    prompt_seen = false,
    prompt_id = "",
    prompt_hint = "",
    permission_posts = 0,
    last_permission_decision = "",
    last_permission_status = 0,
    last_key = "",
    draw_phase = "boot",
    quota_5h_pct = -1,
    quota_7d_pct = -1,
    tokens = -1
  },
  ui = {},
  timers = {}
}

local APP = CODEX_BUDDY_APP
_G.CODEX_BUDDY_APP = APP

local json = rawget(_G, "json") or rawget(_G, "sjson")
local MAIN = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)
local LABEL_LONG_CLIP = rawget(_G, "LV_LABEL_LONG_CLIP") or rawget(_G, "LABEL_LONG_CLIP")

local KEY_NAMES = {}
if key then
  KEY_NAMES[key.LEFT] = "LEFT"
  KEY_NAMES[key.RIGHT] = "RIGHT"
  KEY_NAMES[key.HOME] = "HOME"
  KEY_NAMES[key.EXIT] = "EXIT"
end

local GIFS = {
  sleep = "sleep.gif",
  idle = "idle_0.gif",
  busy = "busy.gif",
  attention = "attention.gif",
  celebrate = "celebrate.gif",
  dizzy = "dizzy.gif",
  heart = "heart.gif"
}

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
    .. '"buddy_ready":' .. tostring(s.buddy_ready)
    .. ',"online":' .. tostring(s.online)
    .. ',"polls":' .. tostring(s.polls or 0)
    .. ',"ticks":' .. tostring(s.ticks or 0)
    .. ',"last_http_code":' .. tostring(s.last_http_code or 0)
    .. ',"last_error":"' .. json_escape(s.last_error) .. '"'
    .. ',"last_message":"' .. json_escape(s.last_message) .. '"'
    .. ',"event":"' .. json_escape(s.event) .. '"'
    .. ',"pet_state":"' .. json_escape(s.pet_state) .. '"'
    .. ',"pet_text":"' .. json_escape(s.pet_text) .. '"'
    .. ',"gif_visible":' .. tostring(s.gif_visible)
    .. ',"gif_state":"' .. json_escape(s.gif_state) .. '"'
    .. ',"gif_src":"' .. json_escape(s.gif_src) .. '"'
    .. ',"prompt_seen":' .. tostring(s.prompt_seen)
    .. ',"prompt_id":"' .. json_escape(s.prompt_id) .. '"'
    .. ',"prompt_hint":"' .. json_escape(s.prompt_hint) .. '"'
    .. ',"permission_posts":' .. tostring(s.permission_posts or 0)
    .. ',"last_permission_decision":"' .. json_escape(s.last_permission_decision) .. '"'
    .. ',"last_permission_status":' .. tostring(s.last_permission_status or 0)
    .. ',"last_key":"' .. json_escape(s.last_key) .. '"'
    .. ',"draw_phase":"' .. json_escape(s.draw_phase) .. '"'
    .. ',"quota_5h_pct":' .. tostring(s.quota_5h_pct or -1)
    .. ',"quota_7d_pct":' .. tostring(s.quota_7d_pct or -1)
    .. ',"tokens":' .. tostring(s.tokens or -1)
    .. ',"bridge_url":"' .. json_escape(APP.config.bridge_url) .. '"'
    .. "}"
  pcall(function() file.write(APP.METRICS_PATH, body) end)
end

local function set_text(obj, text)
  if obj and lv_label_set_text then
    pcall(function() lv_label_set_text(obj, tostring(text or "")) end)
  end
end

local function style_text(obj, color)
  if obj and lv_obj_set_style_text_color then
    pcall(function() lv_obj_set_style_text_color(obj, color, MAIN) end)
  end
end

local function text_or(value, fallback)
  if value == nil then return fallback or "" end
  local text = tostring(value)
  if text == "" then return fallback or "" end
  return text
end

local function clamp_pct(value)
  local n = tonumber(value)
  if not n then return -1 end
  if n < 0 then return 0 end
  if n > 100 then return 100 end
  return math.floor(n + 0.5)
end

local function read_config_text()
  if not file then return nil end
  if file.exists and file.read and file.exists(APP.CONFIG_PATH) then
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
  if type(cfg.bridge_url) == "string" and cfg.bridge_url ~= "" then
    APP.config.bridge_url = cfg.bridge_url
  end
  if type(cfg.character) == "string" and cfg.character ~= "" then
    APP.config.character = cfg.character
  end
  if cfg.use_gif ~= nil then
    APP.config.use_gif = cfg.use_gif == true
  end
end

local function bridge_url(path)
  local base = tostring(APP.config.bridge_url or APP.DEFAULT_BRIDGE_URL)
  base = string.gsub(base, "/+$", "")
  return base .. path
end

local function state_url()
  return bridge_url("/state")
end

local function permission_url()
  return bridge_url("/permission")
end

local function sd_to_lv(path)
  if type(path) == "string" and path:sub(1, 4) == "/sd/" then
    return "S:/" .. path:sub(5)
  end
  return path
end

local function gif_src_for(state)
  local name = GIFS[state] or GIFS.idle
  return sd_to_lv(APP.APP_DIR .. "/assets/bufo/" .. name)
end

local function show_gif(state)
  local s = APP.state
  if not APP.config.use_gif then
    s.gif_visible = false
    s.gif_state = ""
    s.gif_src = ""
    if APP.ui.gif and lv_gif_set_src then
      pcall(function() lv_gif_set_src(APP.ui.gif, nil) end)
    end
    return
  end
  state = GIFS[state] and state or "idle"
  local src = gif_src_for(state)
  s.gif_visible = APP.ui.gif ~= nil
  s.gif_state = state
  s.gif_src = src
  if APP.ui.gif and lv_gif_set_src then
    pcall(function() lv_gif_set_src(APP.ui.gif, src) end)
  end
end

local function update_ui()
  local s = APP.state
  local status = s.online and text_or(s.event, "online") or "offline"
  set_text(APP.ui.status, status)
  style_text(APP.ui.status, s.online and 0x55e39a or 0xffc857)
  set_text(APP.ui.message, text_or(s.last_message, "waiting for bridge"))
  set_text(APP.ui.pet, "pet: " .. text_or(s.pet_state, "idle") .. "  " .. text_or(s.pet_text, ""))
  set_text(APP.ui.prompt, s.prompt_seen and ("approval: " .. text_or(s.prompt_hint, s.prompt_id)) or "approval: none")
  local quota = "quota 5h "
    .. (s.quota_5h_pct >= 0 and (tostring(s.quota_5h_pct) .. "%") or "--")
    .. "  7d "
    .. (s.quota_7d_pct >= 0 and (tostring(s.quota_7d_pct) .. "%") or "--")
  set_text(APP.ui.quota, quota)
  set_text(APP.ui.footer, s.last_error ~= "" and s.last_error or ("polls " .. tostring(s.polls or 0)))
  style_text(APP.ui.footer, s.last_error ~= "" and 0xff7b4a or 0x788493)
  show_gif(s.pet_state)
  write_metrics()
end

local function create_label(parent, text, x, y, width, color)
  local label = lv_label_create(parent)
  lv_label_set_text(label, text or "")
  lv_obj_set_pos(label, x, y)
  lv_obj_set_width(label, width)
  style_text(label, color or 0xffffff)
  if lv_label_set_long_mode then
    pcall(function() lv_label_set_long_mode(label, LABEL_LONG_CLIP) end)
  end
  return label
end

local function draw_ui()
  APP.state.draw_phase = "screen"
  write_metrics()
  local root = lv_scr_act()
  lv_obj_clean(root)
  lv_obj_set_style_bg_color(root, 0x080b10, MAIN)
  lv_obj_set_style_bg_opa(root, 255, MAIN)

  APP.state.draw_phase = "labels"
  write_metrics()
  APP.ui.title = create_label(root, "Codex Buddy", 12, 10, 180, 0xf8fafc)
  APP.ui.status = create_label(root, "starting", 220, 10, 88, 0xffc857)
  APP.ui.message = create_label(root, "waiting for bridge", 120, 48, 188, 0xf8fafc)
  APP.ui.pet = create_label(root, "pet: sleep", 120, 78, 188, 0xaab4c2)
  APP.ui.prompt = create_label(root, "approval: none", 120, 108, 188, 0xffc857)
  APP.ui.quota = create_label(root, "quota 5h --  7d --", 120, 138, 188, 0x7dd3fc)
  APP.ui.bridge = create_label(root, APP.config.bridge_url, 12, 182, 296, 0x788493)
  APP.ui.footer = create_label(root, "polls 0", 12, 212, 296, 0x788493)

  APP.state.draw_phase = "gif"
  write_metrics()
  if APP.config.use_gif and lv_gif_create then
    local ok, gif = pcall(function() return lv_gif_create(root) end)
    if ok and gif then
      APP.ui.gif = gif
      pcall(function() lv_obj_set_pos(APP.ui.gif, 12, 42) end)
      if lv_obj_set_size then
        pcall(function() lv_obj_set_size(APP.ui.gif, 96, 96) end)
      end
    else
      APP.state.last_error = "lv_gif_create failed"
    end
  elseif APP.config.use_gif then
    APP.state.last_error = "lv_gif_create missing"
  end

  APP.state.draw_phase = "ready"
  APP.state.buddy_ready = true
  update_ui()
end

local function safe_decode(raw)
  if not json or not json.decode then return nil, "json.decode missing" end
  local doc, err = json.decode(raw or "")
  if type(doc) ~= "table" then return nil, tostring(err or "invalid json") end
  return doc, nil
end

local function apply_bridge_state(doc)
  local s = APP.state
  local pet = type(doc.pet) == "table" and doc.pet or {}
  local prompt = type(doc.prompt) == "table" and doc.prompt or nil

  s.online = true
  s.last_error = ""
  s.event = text_or(doc.event, doc.running == 1 and "running" or "idle")
  s.last_message = text_or(doc.msg, s.event)
  s.pet_state = text_or(pet.state, doc.waiting == 1 and "attention" or "idle")
  s.pet_text = text_or(pet.text, "")
  s.prompt_seen = prompt ~= nil
  s.prompt_id = prompt and text_or(prompt.id, "") or ""
  s.prompt_hint = prompt and text_or(prompt.hint, "") or ""
  s.quota_5h_pct = clamp_pct(doc.quota_5h_pct or doc.quota_pct)
  s.quota_7d_pct = clamp_pct(doc.quota_7d_pct)
  s.tokens = tonumber(doc.tokens or doc.tokens_today) or -1
  update_ui()
end

local function handle_state_response(code, body)
  local s = APP.state
  s.last_http_code = tonumber(code) or 0
  if tonumber(code) ~= 200 then
    s.online = false
    s.last_error = "bridge http " .. tostring(code)
    s.pet_state = "dizzy"
    s.last_message = "bridge unavailable"
    update_ui()
    return
  end
  local doc, err = safe_decode(body)
  if not doc then
    s.online = false
    s.last_error = err
    s.pet_state = "dizzy"
    update_ui()
    return
  end
  apply_bridge_state(doc)
end

local function poll_bridge()
  if APP.inflight then return end
  if not http or not http.get then
    APP.state.last_error = "http.get missing"
    update_ui()
    return
  end
  APP.inflight = true
  APP.state.polls = APP.state.polls + 1
  write_metrics()
  http.get(state_url(), { timeout_ms = 3000 }, function(code, body)
    APP.inflight = false
    handle_state_response(code, body)
  end)
end

local function post_permission(decision)
  local s = APP.state
  if not s.prompt_seen or s.prompt_id == "" then
    s.last_error = "no prompt"
    s.last_key = decision
    update_ui()
    return
  end
  if not http or not http.post then
    s.last_error = "http.post missing"
    update_ui()
    return
  end
  local raw = '{"id":"' .. json_escape(s.prompt_id) .. '","decision":"' .. json_escape(decision) .. '"}'
  s.permission_posts = s.permission_posts + 1
  s.last_permission_decision = decision
  s.last_permission_status = 0
  s.last_error = ""
  write_metrics()
  http.post(permission_url(), {
    headers = {
      ["Content-Type"] = "application/json",
      ["Accept"] = "application/json"
    },
    timeout_ms = 3000
  }, raw, function(code, _body)
    s.last_permission_status = tonumber(code) or 0
    if tonumber(code) ~= 200 then
      s.last_error = "permission http " .. tostring(code)
    else
      s.last_error = ""
      s.prompt_seen = false
    end
    update_ui()
  end)
end

local function handle_key(code, event)
  if event and key and event ~= key.SHORT then return end
  local name = KEY_NAMES[code] or tostring(code)
  APP.state.last_key = name
  if key and code == key.LEFT then
    post_permission("deny")
  elseif key and code == key.RIGHT then
    post_permission("approve")
  elseif key and code == key.HOME then
    post_permission("once")
  elseif key and code == key.EXIT then
    APP.stop("exit")
    if app and app.exit then
      pcall(function() app.exit() end)
    end
  else
    poll_bridge()
  end
  update_ui()
end

local function bind_input()
  if app and app.set_home_exit then
    pcall(function() app.set_home_exit(false) end)
  end
  if not key or not key.on then return end
  if key.LEFT then pcall(function() key.on(key.LEFT, function(evt_type) handle_key(key.LEFT, evt_type) end) end) end
  if key.RIGHT then pcall(function() key.on(key.RIGHT, function(evt_type) handle_key(key.RIGHT, evt_type) end) end) end
  if key.HOME then pcall(function() key.on(key.HOME, function(evt_type) handle_key(key.HOME, evt_type) end) end) end
  if key.EXIT then pcall(function() key.on(key.EXIT, function(evt_type) handle_key(key.EXIT, evt_type) end) end) end
end

local function unbind_input()
  if app and app.set_home_exit then
    pcall(function() app.set_home_exit(true) end)
  end
  if not key or not key.off then return end
  if key.LEFT then pcall(function() key.off(key.LEFT) end) end
  if key.RIGHT then pcall(function() key.off(key.RIGHT) end) end
  if key.HOME then pcall(function() key.off(key.HOME) end) end
  if key.EXIT then pcall(function() key.off(key.EXIT) end) end
end

local function start_timers()
  if not tmr or not tmr.create then return end
  local timer = tmr.create()
  APP.timers.poll = timer
  timer:alarm(APP.POLL_MS, tmr.ALARM_AUTO, function()
    if APP.running == false or (app and app.exiting and app.exiting()) then return end
    APP.state.ticks = APP.state.ticks + 1
    poll_bridge()
  end)
end

function APP.stop(_reason)
  APP.running = false
  for _, timer in pairs(APP.timers or {}) do
    pcall(function() timer:stop() end)
    pcall(function() timer:unregister() end)
  end
  APP.timers = {}
  unbind_input()
  write_metrics()
end

load_config()
write_metrics()
draw_ui()
bind_input()
start_timers()
poll_bridge()
