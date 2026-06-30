if _G.VOICE_AI_APP and _G.VOICE_AI_APP.stop then
  pcall(function() _G.VOICE_AI_APP.stop("reload") end)
end

VOICE_AI_APP = {
  VERSION = "2026-05-14-voice-ai-v3",
  SCREEN_W = 320,
  SCREEN_H = 240,
  APP_DIR = "/sd/apps/voice_ai",
  DEFAULT_BRIDGE_URL = "http://192.168.1.26:8790",
  I2S_ID = 0,
  CAPTURE_RATE = 48000,
  CAPTURE_CHANNELS = 2,
  CAPTURE_PATH = "capture.raw",
  DOWNSAMPLE_FRAMES = 3,
  CHUNK_BYTES = 4096,
  IO_TIMEOUT_MS = 1000,
  MAX_RECORD_BYTES = 98304,
  USE_GIF = false,
  USE_CUSTOM_FONT = false,
}

local APP = VOICE_AI_APP
local MAIN_STYLE = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)
local ALIGN_LEFT = rawget(_G, "LV_TEXT_ALIGN_LEFT") or 0
local ALIGN_CENTER = rawget(_G, "LV_TEXT_ALIGN_CENTER") or 1
local FONT_14 = rawget(_G, "LV_FONT_MONTSERRAT_14") or 14
local FONT_10 = rawget(_G, "LV_FONT_MONTSERRAT_10") or FONT_14
local FONT_12 = rawget(_G, "LV_FONT_MONTSERRAT_12") or FONT_14
local FONT_COMMON_CN = rawget(_G, "LV_FONT_COMMON_CN_13")
local FONT_CJK = FONT_COMMON_CN
if type(FONT_CJK) ~= "number" or FONT_CJK == 0 then
  FONT_CJK = rawget(_G, "LV_FONT_VOICE_AI_13")
end
if type(FONT_CJK) ~= "number" or FONT_CJK == 0 then
  FONT_CJK = rawget(_G, "LV_FONT_SIMSUN_16_CJK")
end
if type(FONT_CJK) ~= "number" or FONT_CJK == 0 then
  FONT_CJK = FONT_12
end
local LABEL_LONG_CLIP = rawget(_G, "LV_LABEL_LONG_CLIP") or rawget(_G, "LABEL_LONG_CLIP")
local LABEL_LONG_WRAP = rawget(_G, "LV_LABEL_LONG_WRAP") or LABEL_LONG_CLIP

local C = {
  bg = 0x06162C,
  line = 0x242B33,
  text = 0xF4F7FA,
  sub = 0xAAB4C2,
  dim = 0x66717F,
  cyan = 0x55D6FF,
  green = 0x55E39A,
  yellow = 0xF5C65B,
  red = 0xFF6B5F,
}

APP.running = true
APP.ui = {}
APP.timers = {}
APP.boot_timer = nil
APP.font_handles = {}
APP.ai_ui = nil
APP.main_screen = nil
APP.config = {
  bridge_url = APP.DEFAULT_BRIDGE_URL,
  sample_rate = 16000,
  sample_bits = 16,
  max_record_ms = 10000,
  reply_limit = 100,
  use_gif = APP.USE_GIF,
}
APP.state = {
  mode = "idle",
  font_loaded = false,
  font_handle = 0,
  font_src = "",
  font_error = "",
  shown_gif_state = nil,
  shown_gif_src = "",
  gif_visible = false,
  ai_ui_active = false,
  record_started_ms = 0,
  record_bytes = 0,
  raw_record_bytes = 0,
  record_elapsed_ms = 0,
  effective_sample_rate = 0,
  read_ms = 0,
  write_ms = 0,
  record_stopping = false,
  rx_events = 0,
  chunks = {},
  last_error = "",
  transcript = "",
  reply = "短按开始",
  pending_reply = "",
  pending_ui_code = "",
  pending_id = "",
  result_polls = 0,
  submit_count = 0,
  last_http_code = 0,
  last_audio_bytes = 0,
  last_i2s_error = "",
  ignore_record_until_ms = 0,
  home_events = 0,
  last_key_event = 0,
  init_stage = "boot",
  metrics_error = "",
}
APP.perf = {
  started_ms = 0,
  first_paint_ms = 0,
  ready_ms = 0,
  resource_ms = 0,
  http_ms = 0,
  timer_max_ms = 0,
  stop_requested = false,
  last_error = "",
}

local UI = APP.ui
local S = APP.state

local function call(fn, ...)
  if fn then
    return pcall(fn, ...)
  end
  return false
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

local function text_or(value, fallback)
  if value == nil then return fallback or "" end
  local text = tostring(value)
  if text == "" then return fallback or "" end
  return text
end

local function json_escape(value)
  return tostring(value or ""):gsub("\\", "\\\\"):gsub("\"", "\\\""):gsub("\n", "\\n")
end

local function write_metrics()
  if not file or not file.write then return end
  local metrics = "{"
    .. "\"mode\":\"" .. json_escape(S.mode) .. "\","
    .. "\"init_stage\":\"" .. json_escape(S.init_stage) .. "\","
    .. "\"record_bytes\":" .. tostring(S.record_bytes or 0) .. ","
    .. "\"raw_record_bytes\":" .. tostring(S.raw_record_bytes or 0) .. ","
    .. "\"record_elapsed_ms\":" .. tostring(S.record_elapsed_ms or 0) .. ","
    .. "\"effective_sample_rate\":" .. tostring(S.effective_sample_rate or 0) .. ","
    .. "\"read_ms\":" .. tostring(S.read_ms or 0) .. ","
    .. "\"write_ms\":" .. tostring(S.write_ms or 0) .. ","
    .. "\"rx_events\":" .. tostring(S.rx_events or 0) .. ","
    .. "\"submit_count\":" .. tostring(S.submit_count or 0) .. ","
    .. "\"home_events\":" .. tostring(S.home_events or 0) .. ","
    .. "\"last_key_event\":" .. tostring(S.last_key_event or 0) .. ","
    .. "\"last_audio_bytes\":" .. tostring(S.last_audio_bytes or 0) .. ","
    .. "\"last_i2s_error\":\"" .. json_escape(S.last_i2s_error) .. "\","
    .. "\"last_http_code\":" .. tostring(S.last_http_code or 0) .. ","
    .. "\"bridge_url\":\"" .. json_escape(APP.config.bridge_url) .. "\","
    .. "\"font_loaded\":" .. tostring(S.font_loaded == true) .. ","
    .. "\"font_handle\":" .. tostring(S.font_handle or 0) .. ","
    .. "\"font_src\":\"" .. json_escape(S.font_src) .. "\","
    .. "\"font_error\":\"" .. json_escape(S.font_error) .. "\","
    .. "\"use_gif\":" .. tostring(APP.config.use_gif == true) .. ","
    .. "\"gif_visible\":" .. tostring(S.gif_visible == true) .. ","
    .. "\"gif_state\":\"" .. json_escape(S.shown_gif_state or "") .. "\","
    .. "\"gif_src\":\"" .. json_escape(S.shown_gif_src or "") .. "\","
    .. "\"ai_ui_active\":" .. tostring(S.ai_ui_active == true) .. ","
    .. "\"pending_id\":\"" .. json_escape(S.pending_id) .. "\","
    .. "\"last_error\":\"" .. json_escape(S.last_error) .. "\","
    .. "\"metrics_error\":\"" .. json_escape(S.metrics_error) .. "\","
    .. "\"perf_first_paint_ms\":" .. tostring(APP.perf.first_paint_ms or 0) .. ","
    .. "\"perf_ready_ms\":" .. tostring(APP.perf.ready_ms or 0) .. ","
    .. "\"perf_resource_ms\":" .. tostring(APP.perf.resource_ms or 0) .. ","
    .. "\"perf_http_ms\":" .. tostring(APP.perf.http_ms or 0) .. ","
    .. "\"perf_timer_max_ms\":" .. tostring(APP.perf.timer_max_ms or 0) .. ","
    .. "\"perf_stop_requested\":" .. tostring(APP.perf.stop_requested == true) .. ","
    .. "\"perf_last_error\":\"" .. json_escape(APP.perf.last_error or "") .. "\""
    .. "}"
  local ok, err = file.write("metrics.json", metrics)
  if not ok then
    S.metrics_error = tostring(err or "write failed")
  else
    S.metrics_error = ""
  end
end

local function set_init_stage(stage, persist)
  S.init_stage = stage
  if persist then
    write_metrics()
  end
end

local function clamp(n, low, high)
  n = tonumber(n) or 0
  if n < low then return low end
  if n > high then return high end
  return n
end

local function sd_to_lv(path)
  if type(path) == "string" and path:sub(1, 4) == "/sd/" then
    return "/" .. path:sub(5)
  end
  return path
end

local function safe_json_decode(raw)
  if not raw or raw == "" or not json or not json.decode then
    return nil, "json missing"
  end
  local ok, doc, err = pcall(function()
    local value, decode_err = json.decode(raw)
    return value, decode_err
  end)
  if not ok then return nil, tostring(doc) end
  if not doc then return nil, tostring(err or "decode failed") end
  return doc, nil
end

local function config_string(raw, key)
  local pattern = '"' .. key .. '"%s*:%s*"([^"]*)"'
  return raw:match(pattern)
end

local function config_number(raw, key)
  local pattern = '"' .. key .. '"%s*:%s*([%-%d%.]+)'
  return tonumber(raw:match(pattern))
end

local function config_bool(raw, key)
  local pattern = '"' .. key .. '"%s*:%s*(true)'
  if raw:match(pattern) then return true end
  pattern = '"' .. key .. '"%s*:%s*(false)'
  if raw:match(pattern) then return false end
  return nil
end

local function load_config()
  return true, "default"
end

local function style_obj(id, bg, opa, border)
  if not id then return end
  call(lv_obj_remove_style_all, id)
  call(lv_obj_set_style_bg_color, id, bg or C.bg, MAIN_STYLE)
  call(lv_obj_set_style_bg_opa, id, opa or 255, MAIN_STYLE)
  call(lv_obj_set_style_text_font, id, FONT_14, MAIN_STYLE)
  call(lv_obj_set_style_text_color, id, C.text, MAIN_STYLE)
  call(lv_obj_set_style_text_opa, id, 255, MAIN_STYLE)
  call(lv_obj_set_style_border_width, id, border and 1 or 0, MAIN_STYLE)
  if border then
    call(lv_obj_set_style_border_color, id, border, MAIN_STYLE)
    call(lv_obj_set_style_border_opa, id, 255, MAIN_STYLE)
  end
  call(lv_obj_set_style_radius, id, 0, MAIN_STYLE)
  call(lv_obj_set_style_pad_all, id, 0, MAIN_STYLE)
  if lv_obj_clear_flag and rawget(_G, "LV_OBJ_FLAG_SCROLLABLE") then
    call(lv_obj_clear_flag, id, rawget(_G, "LV_OBJ_FLAG_SCROLLABLE"))
  end
end

local function set_label_style(id, font, color, align)
  if not id then return end
  if font ~= false then
    call(lv_obj_set_style_text_font, id, font or FONT_12, MAIN_STYLE)
  end
  call(lv_obj_set_style_text_color, id, color or C.text, MAIN_STYLE)
  call(lv_obj_set_style_text_opa, id, 255, MAIN_STYLE)
  call(lv_obj_set_style_text_letter_space, id, 0, MAIN_STYLE)
  call(lv_obj_set_style_text_line_space, id, 2, MAIN_STYLE)
  if align and lv_obj_set_style_text_align then
    call(lv_obj_set_style_text_align, id, align, MAIN_STYLE)
  end
end

local function label(parent, x, y, w, h, text, font, color, align, long_mode)
  local id = lv_label_create(parent)
  call(lv_label_set_text, id, text_or(text, ""))
  call(lv_obj_set_pos, id, x, y)
  call(lv_obj_set_width, id, w)
  if h and lv_obj_set_height then call(lv_obj_set_height, id, h) end
  if lv_label_set_long_mode then
    call(lv_label_set_long_mode, id, long_mode or LABEL_LONG_CLIP)
  end
  set_label_style(id, font, color, align or ALIGN_LEFT)
  return id
end

local function set_text(id, text)
  if id then call(lv_label_set_text, id, text_or(text, "")) end
end

local function set_text_color(id, color)
  if id and lv_obj_set_style_text_color then
    call(lv_obj_set_style_text_color, id, color, MAIN_STYLE)
  end
end

local function set_opa(id, opa)
  if id and lv_obj_set_style_opa then
    call(lv_obj_set_style_opa, id, opa, MAIN_STYLE)
  end
end

local function serial_dump(name, text)
  text = text_or(text, "")
  name = text_or(name, "dump")
  local chunk_size = 384
  local total = #text
  local parts = math.floor((total + chunk_size - 1) / chunk_size)
  if parts < 1 then parts = 1 end

  local function write_text(payload)
    if uart and uart.write then
      pcall(uart.write, 0, payload)
    else
      print(payload)
    end
  end

  write_text("\r\n[voice_ai] " .. name .. "_begin len=" .. tostring(total) .. " parts=" .. tostring(parts) .. "\r\n")
  local part = 1
  local pos = 1
  while pos <= total do
    local chunk = text:sub(pos, pos + chunk_size - 1)
    write_text("[voice_ai] " .. name .. "_part " .. tostring(part) .. "/" .. tostring(parts) .. "=" .. chunk .. "\r\n")
    pos = pos + chunk_size
    part = part + 1
  end
  if total == 0 then
    write_text("[voice_ai] " .. name .. "_part 1/1=\r\n")
  end
  write_text("[voice_ai] " .. name .. "_end\r\n")
end

local function serial_line(name, text)
  text = text_or(text, "")
  name = text_or(name, "line")
  local payload = "[voice_ai] " .. name .. "=" .. text
  if payload:sub(-1) ~= "\n" then
    payload = payload .. "\r\n"
  end
  if uart and uart.write then
    pcall(uart.write, 0, payload)
  else
    print(payload)
  end
end

local function load_font_ref(path, fallback)
  S.font_src = path or ""
  S.font_loaded = false
  S.font_handle = 0
  S.font_error = ""
  if not lv_font_load then
    S.font_error = "lv_font_load missing"
    return fallback
  end
  local ok, handle = pcall(function() return lv_font_load(path) end)
  if ok and type(handle) == "number" and handle > 0 then
    APP.font_handles[#APP.font_handles + 1] = handle
    S.font_loaded = true
    S.font_handle = handle
    return handle
  end
  S.font_error = ok and ("invalid handle " .. tostring(handle)) or tostring(handle)
  return fallback
end

local function load_font_chain(paths, fallback)
  local last = fallback
  for _, path in ipairs(paths or {}) do
    local handle = load_font_ref(path, last)
    if S.font_loaded then
      return handle
    end
    last = handle
  end
  return last
end

local function release_fonts()
  if lv_font_free then
    for _, handle in ipairs(APP.font_handles or {}) do
      pcall(function() lv_font_free(handle) end)
    end
  end
  APP.font_handles = {}
  S.font_loaded = false
  S.font_handle = 0
end

local function next_utf8_char(text, index)
  local b = text:byte(index)
  if not b then return nil, index end
  local len = 1
  if b >= 240 then len = 4
  elseif b >= 224 then len = 3
  elseif b >= 192 then len = 2 end
  return text:sub(index, index + len - 1), index + len
end

local function wrap_for_screen(text, max_units, max_lines)
  text = text_or(text, "")
  local lines = {}
  local line = ""
  local units = 0
  local i = 1
  while i <= #text and #lines < max_lines do
    local ch, ni = next_utf8_char(text, i)
    i = ni
    if not ch then break end
    if ch == "\r" then
      -- skip
    elseif ch == "\n" then
      lines[#lines + 1] = line
      line = ""
      units = 0
    else
      local b = ch:byte(1) or 0
      local add = (b < 128) and 0.55 or 1
      if units + add > max_units and line ~= "" then
        lines[#lines + 1] = line
        line = ch
        units = add
      else
        line = line .. ch
        units = units + add
      end
    end
  end
  if #lines < max_lines and line ~= "" then
    lines[#lines + 1] = line
  end
  return table.concat(lines, "\n")
end

local function bridge_url(path)
  local base = text_or(APP.config.bridge_url, APP.DEFAULT_BRIDGE_URL)
  if base:sub(-1) == "/" then base = base:sub(1, -2) end
  return base .. path
end

local function status_text()
  if S.mode == "recording" then return "录音中" end
  if S.mode == "sending" then return "思考中" end
  if S.mode == "error" then return "失败" end
  if S.mode == "reply" then return "回复" end
  return "按下说话"
end

local function status_color()
  if S.mode == "recording" then return C.red end
  if S.mode == "sending" then return C.yellow end
  if S.mode == "error" then return C.red end
  if S.mode == "reply" then return C.green end
  return C.cyan
end

local function gif_state()
  if S.mode == "recording" then return "attention" end
  if S.mode == "sending" then return "busy" end
  if S.mode == "error" then return "dizzy" end
  if S.mode == "reply" then return "celebrate" end
  return "idle"
end

local function gif_path_for_state(state)
  local map = {
    idle = "idle_0.gif",
    attention = "attention.gif",
    busy = "busy.gif",
    celebrate = "celebrate.gif",
    dizzy = "dizzy.gif",
    sleep = "sleep.gif",
  }
  local path = APP.APP_DIR .. "/assets/buddy/" .. (map[state] or map.idle)
  if file and file.exists and file.exists(path) then
    return sd_to_lv(path)
  end
  return nil
end

local function update_gif()
  if not UI.gif or not lv_gif_set_src then return end
  if not APP.config.use_gif then
    if S.shown_gif_state ~= nil then
      call(lv_gif_set_src, UI.gif, nil)
      S.shown_gif_state = nil
    end
    S.shown_gif_src = ""
    S.gif_visible = false
    set_opa(UI.gif, 0)
    return
  end

  local state = gif_state()
  local src = gif_path_for_state(state)
  if not src then
    S.shown_gif_src = ""
    S.gif_visible = false
    set_opa(UI.gif, 0)
    return
  end
  set_opa(UI.gif, 255)
  S.gif_visible = true
  if S.shown_gif_state ~= state then
    S.shown_gif_state = state
    S.shown_gif_src = src
    call(lv_gif_set_src, UI.gif, src)
  end
end

local function dialog_text(transcript, reply, transcript_lines, reply_lines)
  transcript = text_or(transcript, "")
  reply = text_or(reply, "")
  if transcript ~= "" and reply ~= "" then
    local user_text = wrap_for_screen("我：" .. transcript, 13, transcript_lines or 2)
    local reply_text = wrap_for_screen("AI：" .. reply, 13, reply_lines or 4)
    if reply_text ~= "" then return user_text .. "\n\n" .. reply_text end
    return user_text
  end
  if transcript ~= "" then
    return wrap_for_screen("我：" .. transcript, 13, (transcript_lines or 6) + (reply_lines or 0))
  end
  return wrap_for_screen(reply, 13, reply_lines or 6)
end

local function update_ui()
  set_text(UI.status, status_text())
  set_text_color(UI.status, status_color())

  local body = S.reply
  local body_wrapped = false
  if S.mode == "recording" then
    local elapsed = now_ms() - (S.record_started_ms or now_ms())
    local sec = math.floor(math.max(elapsed, 0) / 1000)
    body = "正在听\n" .. tostring(sec) .. "s\n" .. tostring(S.record_bytes or 0) .. " B"
  elseif S.mode == "sending" then
    if S.transcript ~= "" then
      body = dialog_text(S.transcript, "思考中", 2, 3)
      body_wrapped = true
    else
      body = "请稍等"
    end
  elseif S.mode == "error" then
    body = dialog_text(S.transcript, S.last_error ~= "" and S.last_error or "服务不可用", 2, 4)
    body_wrapped = true
  elseif S.mode == "reply" then
    body = dialog_text(S.transcript, S.reply, 2, 4)
    body_wrapped = true
  end

  if body_wrapped then
    set_text(UI.reply, body)
  else
    set_text(UI.reply, wrap_for_screen(body, 13, 6))
  end
  update_gif()
end

local function set_mode(mode, message)
  S.mode = mode
  if message then S.reply = message end
  update_ui()
end

local function clear_recording()
  S.chunks = {}
  S.record_bytes = 0
  S.raw_record_bytes = 0
  S.record_elapsed_ms = 0
  S.effective_sample_rate = 0
  S.read_ms = 0
  S.write_ms = 0
  S.record_stopping = false
  S.rx_events = 0
  S.record_started_ms = 0
end

local function stop_i2s()
  if i2s and i2s.stop then
    pcall(function() i2s.stop(APP.I2S_ID) end)
  end
end

local function read_i16_le(data, index)
  local lo = string.byte(data, index) or 0
  local hi = string.byte(data, index + 1) or 0
  local sample = lo + hi * 256
  if sample >= 32768 then sample = sample - 65536 end
  return sample
end

local function clamp_i16(sample)
  if sample > 32767 then return 32767 end
  if sample < -32768 then return -32768 end
  return math.floor(sample)
end

local function i16_to_bytes(sample)
  sample = clamp_i16(sample)
  if sample < 0 then sample = sample + 65536 end
  return string.char(sample % 256, math.floor(sample / 256) % 256)
end

local max_record_bytes

local function downsample_capture_chunk_to_16k_mono(input)
  if not input or #input == 0 then return "" end
  local out = {}
  local frames = APP.DOWNSAMPLE_FRAMES or 3
  local bytes_per_sample = math.floor((APP.config.sample_bits or 16) / 8)
  local bytes_per_capture_frame = (APP.CAPTURE_CHANNELS or 2) * bytes_per_sample
  local bytes_per_output = frames * bytes_per_capture_frame
  local pos = 1
  while pos + bytes_per_output - 1 <= #input do
    local sum = 0
    for frame = 0, frames - 1 do
      sum = sum + read_i16_le(input, pos + (frame * bytes_per_capture_frame))
    end
    out[#out + 1] = i16_to_bytes(sum / frames)
    pos = pos + bytes_per_output
  end
  return table.concat(out)
end

local function downsample_capture_file_to_16k_mono(path)
  if not file or not file.open then
    return nil, "file.open missing"
  end
  local handle = file.open(path, "r")
  if not handle then
    return nil, "capture open failed"
  end
  local chunks = {}
  local total = 0
  local tail = ""
  while true do
    local chunk = handle:read(APP.CHUNK_BYTES)
    if not chunk or #chunk <= 0 then break end
    S.raw_record_bytes = (S.raw_record_bytes or 0) + #chunk
    local input = tail .. chunk
    local frames = APP.DOWNSAMPLE_FRAMES or 3
    local bytes_per_sample = math.floor((APP.config.sample_bits or 16) / 8)
    local bytes_per_capture_frame = (APP.CAPTURE_CHANNELS or 2) * bytes_per_sample
    local bytes_per_output = frames * bytes_per_capture_frame
    local usable = #input - (#input % bytes_per_output)
    if usable > 0 then
      local pcm = downsample_capture_chunk_to_16k_mono(input:sub(1, usable))
      if pcm and #pcm > 0 then
        chunks[#chunks + 1] = pcm
        total = total + #pcm
        if total >= max_record_bytes() then
          break
        end
      end
    end
    if usable < #input then
      tail = input:sub(usable + 1)
    else
      tail = ""
    end
  end
  handle:close()
  if total == 0 then
    return nil, "empty capture"
  end
  local ok, raw_or_err = pcall(table.concat, chunks)
  for i = 1, #chunks do
    chunks[i] = nil
  end
  if not ok then
    return nil, tostring(raw_or_err or "audio concat failed")
  end
  local raw = raw_or_err
  local limit = max_record_bytes()
  if #raw > limit then
    raw = raw:sub(1, limit)
  end
  return raw, nil
end

local function read_voice_capture_file()
  return downsample_capture_file_to_16k_mono(APP.CAPTURE_PATH)
end

local function stop_timer(timer)
  if not timer then return end
  pcall(function()
    timer:stop()
    timer:unregister()
  end)
end

local function cleanup_ai_ui(load_main)
  local current = APP.ai_ui
  APP.ai_ui = nil
  S.ai_ui_active = false

  if current then
    current.active = false
    for _, timer in ipairs(current.timers or {}) do
      stop_timer(timer)
    end
  end

  if current then
    if type(current.cleanup) == "function" then
      pcall(current.cleanup)
    end
    if current.screen and current.screen ~= 0 and current.screen ~= APP.main_screen and lv_obj_del then
      if lv_obj_del_async then
        pcall(function() lv_obj_del_async(current.screen) end)
      else
        pcall(function() lv_obj_del(current.screen) end)
      end
    end
  end
  if load_main then update_ui() end
end

local function compile_ai_code(code, env)
  if type(code) ~= "string" or code == "" then
    return nil, "empty code"
  end

  if type(load) == "function" then
    local ok, fn_or_err, load_err = pcall(load, code, "voice_ai_ui", "t", env)
    if ok and type(fn_or_err) == "function" then
      return fn_or_err, nil
    end
    if ok then
      return nil, tostring(load_err or fn_or_err or "compile failed")
    end
  end

  if type(loadstring) == "function" then
    local fn, err = loadstring(code, "voice_ai_ui")
    if not fn then return nil, tostring(err or "compile failed") end
    if type(setfenv) == "function" then
      pcall(setfenv, fn, env)
    end
    return fn, nil
  end
  return nil, "load unavailable"
end

local function ai_style_obj(id, bg)
  if not id then return end
  call(lv_obj_remove_style_all, id)
  call(lv_obj_set_style_bg_color, id, bg or C.bg, MAIN_STYLE)
  call(lv_obj_set_style_bg_opa, id, 255, MAIN_STYLE)
  call(lv_obj_set_style_text_font, id, FONT_14, MAIN_STYLE)
  call(lv_obj_set_style_text_color, id, C.text, MAIN_STYLE)
  call(lv_obj_set_style_text_opa, id, 255, MAIN_STYLE)
  call(lv_obj_set_style_border_width, id, 0, MAIN_STYLE)
  call(lv_obj_set_style_radius, id, 0, MAIN_STYLE)
  call(lv_obj_set_style_pad_all, id, 0, MAIN_STYLE)
  if lv_obj_clear_flag and rawget(_G, "LV_OBJ_FLAG_SCROLLABLE") then
    call(lv_obj_clear_flag, id, rawget(_G, "LV_OBJ_FLAG_SCROLLABLE"))
  end
end

local function ai_label(parent, x, y, w, h, text, color, align)
  local id = lv_label_create(parent)
  call(lv_obj_set_pos, id, x, y)
  call(lv_obj_set_width, id, w)
  if h and lv_obj_set_height then call(lv_obj_set_height, id, h) end
  if lv_label_set_long_mode then
    call(lv_label_set_long_mode, id, LABEL_LONG_WRAP)
  end
  call(lv_label_set_text, id, text_or(text, ""))
  set_label_style(id, FONT_CJK, color or C.text, align or ALIGN_LEFT)
  return id
end

local AI_BLOCKED_LV = {
  lv_scr_act = true,
  lv_begin = true,
  lv_end = true,
  lv_get_root = true,

  lv_obj_del = true,
  lv_obj_del_async = true,
  lv_obj_clean = true,
  lv_obj_set_parent = true,
  lv_obj_get_parent = true,
  lv_obj_get_child = true,
  lv_obj_get_child_cnt = true,

  lv_font_load = true,
  lv_font_free = true,
  lv_img_load_bmp565 = true,
  lv_img_free_handle = true,
  lv_snapshot_take = true,
  lv_snapshot_free = true,
  lv_snapshot_buf_size_needed = true,

  lv_anim_del_all = true,
  lv_anim_delete_all = true,
  lv_avi_canvas_start = true,
  lv_avi_canvas_stop = true,
  lv_avi_canvas_poll = true,
}

local function expose_ai_lv_globals(env)
  for name, value in pairs(_G) do
    if type(name) == "string" and not AI_BLOCKED_LV[name] then
      local is_lv_api = name:sub(1, 3) == "lv_"
      local is_lv_const = name:sub(1, 3) == "LV_"
      local is_label_const = name:sub(1, 11) == "LABEL_LONG_"
      if is_lv_api or is_lv_const or is_label_const then
        env[name] = value
      end
    end
  end
end

local function build_ai_env(ctx)
  local env = {
    ctx = ctx,
    math = math,
    string = string,
    table = table,
    ipairs = ipairs,
    pairs = pairs,
    next = next,
    tonumber = tonumber,
    tostring = tostring,
    type = type,
    pcall = pcall,
    select = select,

    lv_obj_create = lv_obj_create,
    lv_obj_set_pos = lv_obj_set_pos,
    lv_obj_set_size = lv_obj_set_size,
    lv_obj_set_x = lv_obj_set_x,
    lv_obj_set_y = lv_obj_set_y,
    lv_obj_set_width = lv_obj_set_width,
    lv_obj_set_height = lv_obj_set_height,
    lv_obj_center = lv_obj_center,
    lv_obj_align = lv_obj_align,
    lv_obj_remove_style_all = lv_obj_remove_style_all,
    lv_obj_clear_flag = lv_obj_clear_flag,
    lv_obj_set_style_bg_color = lv_obj_set_style_bg_color,
    lv_obj_set_style_bg_opa = lv_obj_set_style_bg_opa,
    lv_obj_set_style_border_width = lv_obj_set_style_border_width,
    lv_obj_set_style_border_color = lv_obj_set_style_border_color,
    lv_obj_set_style_border_opa = lv_obj_set_style_border_opa,
    lv_obj_set_style_radius = lv_obj_set_style_radius,
    lv_obj_set_style_pad_all = lv_obj_set_style_pad_all,
    lv_obj_set_style_opa = lv_obj_set_style_opa,
    lv_obj_set_style_text_font = lv_obj_set_style_text_font,
    lv_obj_set_style_text_color = lv_obj_set_style_text_color,
    lv_obj_set_style_text_opa = lv_obj_set_style_text_opa,
    lv_obj_set_style_text_align = lv_obj_set_style_text_align,
    lv_obj_set_style_text_line_space = lv_obj_set_style_text_line_space,
    lv_obj_set_style_text_letter_space = lv_obj_set_style_text_letter_space,
    lv_obj_set_style_line_width = lv_obj_set_style_line_width,
    lv_obj_set_style_line_color = lv_obj_set_style_line_color,
    lv_obj_set_style_line_opa = lv_obj_set_style_line_opa,

    lv_label_create = lv_label_create,
    lv_label_set_text = lv_label_set_text,
    lv_label_set_long_mode = lv_label_set_long_mode,
    lv_line_create = lv_line_create,
    lv_line_set_points = lv_line_set_points,
    lv_canvas_create = lv_canvas_create,
    lv_canvas_fill_bg = lv_canvas_fill_bg,
    lv_canvas_frame_begin = lv_canvas_frame_begin,
    lv_canvas_frame_end = lv_canvas_frame_end,
    lv_canvas_draw_rect = lv_canvas_draw_rect,
    lv_canvas_draw_line = lv_canvas_draw_line,
    lv_canvas_draw_arc = lv_canvas_draw_arc,
    lv_canvas_draw_text = lv_canvas_draw_text,
    lv_canvas_set_px_color = lv_canvas_set_px_color,
    lv_canvas_set_px_opa = lv_canvas_set_px_opa,

    LV_PART_MAIN = rawget(_G, "LV_PART_MAIN") or 0,
    LV_STATE_DEFAULT = rawget(_G, "LV_STATE_DEFAULT") or 0,
    LV_TEXT_ALIGN_LEFT = ALIGN_LEFT,
    LV_TEXT_ALIGN_CENTER = ALIGN_CENTER,
    LV_LABEL_LONG_CLIP = LABEL_LONG_CLIP,
    LV_LABEL_LONG_WRAP = LABEL_LONG_WRAP,
    LV_OBJ_FLAG_SCROLLABLE = rawget(_G, "LV_OBJ_FLAG_SCROLLABLE"),
    LV_IMG_CF_TRUE_COLOR = rawget(_G, "LV_IMG_CF_TRUE_COLOR"),
    LV_IMG_CF_TRUE_COLOR_CHROMA_KEYED = rawget(_G, "LV_IMG_CF_TRUE_COLOR_CHROMA_KEYED"),
  }
  expose_ai_lv_globals(env)
  env._ENV = env
  return env
end

local function show_ai_ui(code)
  cleanup_ai_ui(true)
  local timers = {}
  local state = { active = true, timers = timers }

  local function fail(message)
    state.active = false
    for _, timer in ipairs(timers) do
      stop_timer(timer)
    end
    if state.created_screen and state.created_screen ~= 0 and state.created_screen ~= APP.main_screen and lv_obj_del then
      pcall(function() lv_obj_del(state.created_screen) end)
    end
    S.last_error = message
    set_mode("error")
    return false
  end

  local ctx = {
    SCREEN_W = APP.SCREEN_W,
    SCREEN_H = APP.SCREEN_H,
    ALIGN_LEFT = ALIGN_LEFT,
    ALIGN_CENTER = ALIGN_CENTER,
    MAIN_STYLE = MAIN_STYLE,
    FONT = APP.font_cn or FONT_12,
    C = {
      bg = C.bg,
      line = C.line,
      text = C.text,
      sub = C.sub,
      dim = C.dim,
      cyan = C.cyan,
      green = C.green,
      yellow = C.yellow,
      red = C.red,
    },
    new_screen = function()
      local screen = lv_obj_create(APP.main_screen)
      state.created_screen = screen
      call(lv_obj_set_pos, screen, 0, 0)
      call(lv_obj_set_size, screen, APP.SCREEN_W, APP.SCREEN_H)
      ai_style_obj(screen, C.bg)
      return screen
    end,
    style_obj = ai_style_obj,
    label = ai_label,
    every = function(ms, fn)
      if not tmr or not tmr.create or type(fn) ~= "function" then return nil end
      local timer = tmr.create()
      timers[#timers + 1] = timer
      timer:alarm(clamp(ms, 50, 5000), tmr.ALARM_AUTO, function()
        if APP.running and state.active then
          pcall(fn)
        end
      end)
      return timer
    end,
  }

  local fn, err = compile_ai_code(code, build_ai_env(ctx))
  if not fn then
    return fail("代码错误 " .. tostring(err or ""))
  end

  local ok, factory_or_result = pcall(fn)
  if not ok then
    return fail("运行错误 " .. tostring(factory_or_result))
  end

  local ok2, result
  if type(factory_or_result) == "function" then
    ok2, result = pcall(factory_or_result, ctx)
  else
    ok2, result = true, factory_or_result
  end
  if not ok2 then
    return fail("界面错误 " .. tostring(result))
  end

  if type(result) == "number" then
    result = { screen = result }
  end
  if type(result) ~= "table" or type(result.screen) ~= "number" then
    return fail("没有返回 screen")
  end
  if result.screen == 0 or result.screen == APP.main_screen then
    return fail("不能占用主屏幕")
  end

  state.screen = result.screen
  state.cleanup = result.cleanup
  APP.ai_ui = state
  S.ai_ui_active = true
  write_metrics()
  return true
end

local schedule_reply
local start_result_poll

local function handle_bridge_response(code, body)
  S.last_http_code = tonumber(code) or 0
  write_metrics()
  serial_dump("bridge_json", body or "")
  if code ~= 200 then
    local doc = nil
    if body and body ~= "" then
      doc = safe_json_decode(body)
    end
    if type(doc) == "table" and doc.transcript then
      S.transcript = text_or(doc.transcript, "")
    end
    if type(doc) == "table" and doc.reply then
      S.last_error = text_or(doc.reply, "HTTP " .. tostring(code))
    elseif type(doc) == "table" and doc.error then
      S.last_error = text_or(doc.error, "HTTP " .. tostring(code))
    else
      S.last_error = "HTTP " .. tostring(code)
    end
    set_mode("error")
    return
  end

  local doc, err = safe_json_decode(body)
  if type(doc) ~= "table" then
    S.last_error = tostring(err or "响应错误")
    set_mode("error")
    return
  end

  if doc.ok == false then
    S.transcript = text_or(doc.transcript, "")
    S.last_error = text_or(doc.error, "请求失败")
    set_mode("error")
    return
  end

  S.transcript = text_or(doc.transcript, "")
  if doc.pending == true and doc.id then
    S.pending_id = text_or(doc.id, "")
    S.pending_reply = ""
    S.pending_ui_code = ""
    S.result_polls = 0
    set_mode("sending")
    start_result_poll()
    return
  end

  S.pending_reply = text_or(doc.reply, "没有回复")
  S.pending_ui_code = type(doc.ui_code) == "string" and doc.ui_code or ""
  set_mode("sending")
  schedule_reply()
end

local function submit_audio(raw)
  if not raw or #raw == 0 then
    S.last_error = "没有录到声音"
    set_mode("error")
    write_metrics()
    return
  end
  if not http or not http.post then
    S.last_error = "HTTP 不可用"
    set_mode("error")
    write_metrics()
    return
  end

  S.submit_count = (S.submit_count or 0) + 1
  S.last_audio_bytes = #raw
  S.last_http_code = 0
  S.pending_reply = ""
  S.pending_ui_code = ""
  S.pending_id = ""
  S.result_polls = 0
  set_mode("sending")
  write_metrics()
  local headers = {
    ["Content-Type"] = "application/octet-stream",
    ["X-Audio-Format"] = "pcm_s16le",
    ["X-Sample-Rate"] = tostring(APP.config.sample_rate),
    ["X-Bits"] = tostring(APP.config.sample_bits),
    ["X-Channels"] = "1",
    ["X-Reply-Limit"] = tostring(APP.config.reply_limit),
  }
  local http_start = now_ms()
  http.post(bridge_url("/api/chat"), { headers = headers, timeout = 35000 }, raw, function(code, body)
    APP.perf.http_ms = now_ms() - http_start
    handle_bridge_response(code, body)
  end)
end

local stop_recording_and_send
max_record_bytes = function()
  local configured = math.floor(APP.config.sample_rate * (APP.config.sample_bits / 8) * APP.config.max_record_ms / 1000)
  local hard_limit = tonumber(APP.MAX_RECORD_BYTES) or configured
  if configured < hard_limit then return configured end
  return hard_limit
end

stop_recording_and_send = function()
  if S.mode ~= "recording" then return end
  if S.record_stopping then return end
  S.record_stopping = true
  stop_i2s()
  local raw, read_err = read_voice_capture_file()
  if type(collectgarbage) == "function" then collectgarbage("collect") end
  if not raw or #raw == 0 then
    S.last_error = tostring(read_err or "未录到声音")
    APP.perf.last_error = S.last_error
    S.record_stopping = false
    set_mode("error")
    write_metrics()
    return
  end
  S.record_bytes = #raw
  S.last_i2s_error = ""
  S.ignore_record_until_ms = now_ms() + 5000
  write_metrics()
  submit_audio(raw)
  raw = nil
  if type(collectgarbage) == "function" then collectgarbage("collect") end
end

local function stop_result_poll()
  local timer = APP.timers.result_poll
  if timer then
    pcall(function()
      timer:stop()
      timer:unregister()
    end)
    APP.timers.result_poll = nil
  end
end

local function stop_reply_delay()
  local timer = APP.timers.reply_delay
  if timer then
    pcall(function()
      timer:stop()
      timer:unregister()
    end)
    APP.timers.reply_delay = nil
  end
end

local function show_pending_reply()
  stop_reply_delay()
  stop_result_poll()
  S.reply = text_or(S.pending_reply, "没有回复")
  serial_line("ai_reply", S.reply)
  local ui_code = text_or(S.pending_ui_code, "")
  if ui_code ~= "" then
    serial_dump("ai_ui_code", ui_code)
  end
  S.pending_reply = ""
  S.pending_ui_code = ""
  S.pending_id = ""
  S.result_polls = 0
  set_mode("reply")
  write_metrics()
  if ui_code ~= "" then
    show_ai_ui(ui_code)
  end
end

local function handle_result_response(code, body)
  if S.pending_id == "" then
    stop_result_poll()
    return
  end
  if code ~= 200 then
    S.result_polls = (S.result_polls or 0) + 1
    if S.result_polls > 160 then
      stop_result_poll()
      S.last_error = "AI 回复超时"
      set_mode("error")
    end
    return
  end

  local doc, err = safe_json_decode(body)
  if type(doc) ~= "table" then
    stop_result_poll()
    S.last_error = tostring(err or "响应错误")
    set_mode("error")
    return
  end

  if doc.pending == true then
    return
  end

  stop_result_poll()
  if doc.ok == false then
    S.last_error = text_or(doc.error, "AI 回复失败")
    set_mode("error")
    return
  end

  S.pending_reply = text_or(doc.reply, "没有回复")
  S.pending_ui_code = type(doc.ui_code) == "string" and doc.ui_code or ""
  show_pending_reply()
end

start_result_poll = function()
  stop_result_poll()
  if S.pending_id == "" then return end
  if not http or not http.get then
    S.last_error = "HTTP 不可用"
    set_mode("error")
    return
  end
  if not tmr or not tmr.create then
    local http_start = now_ms()
    http.get(bridge_url("/api/result?id=" .. S.pending_id), { timeout = 5000 }, function(code, body)
      APP.perf.http_ms = now_ms() - http_start
      handle_result_response(code, body)
    end)
    return
  end

  local timer = tmr.create()
  APP.timers.result_poll = timer
  local in_flight = false
  timer:alarm(500, tmr.ALARM_AUTO, function()
    if not APP.running or S.mode ~= "sending" or S.pending_id == "" then
      stop_result_poll()
      return
    end
    if in_flight then return end
    in_flight = true
    local http_start = now_ms()
    http.get(bridge_url("/api/result?id=" .. S.pending_id), { timeout = 5000 }, function(code, body)
      APP.perf.http_ms = now_ms() - http_start
      in_flight = false
      handle_result_response(code, body)
    end)
  end)
end

schedule_reply = function()
  stop_reply_delay()
  if not tmr or not tmr.create then
    show_pending_reply()
    return
  end
  local timer = tmr.create()
  APP.timers.reply_delay = timer
  timer:alarm(350, tmr.ALARM_SINGLE or 0, function()
    local tick_start = now_ms()
    show_pending_reply()
    mark_perf_timer(tick_start)
  end)
end

local function start_recording()
  if S.mode == "recording" or S.mode == "sending" then return end
  cleanup_ai_ui(true)
  stop_reply_delay()
  stop_result_poll()
  if not i2s or not i2s.record_file then
    S.last_error = "I2S 不可用"
    set_mode("error")
    return
  end

  clear_recording()
  S.record_started_ms = now_ms()
  S.last_error = ""
  S.transcript = ""
  S.reply = ""
  S.pending_reply = ""
  S.pending_ui_code = ""
  S.pending_id = ""
  S.result_polls = 0
  S.submit_count = 0
  S.last_http_code = 0
  S.last_audio_bytes = 0
  set_mode("recording")
  write_metrics()

  local target_bytes = APP.CAPTURE_RATE * APP.CAPTURE_CHANNELS * (APP.config.sample_bits / 8)
  local capture_ms = APP.config.max_record_ms or 3000
  target_bytes = math.floor(target_bytes * capture_ms / 1000)
  local max_raw_bytes = math.floor(max_record_bytes() * APP.DOWNSAMPLE_FRAMES * APP.CAPTURE_CHANNELS)
  if target_bytes > max_raw_bytes then target_bytes = max_raw_bytes end

  local ok, result_or_err = pcall(function()
    return i2s.record_file(APP.I2S_ID, APP.CAPTURE_PATH, {
      rate = APP.CAPTURE_RATE,
      bits = APP.config.sample_bits,
      channel = i2s.CHANNEL_STEREO,
      target_bytes = target_bytes,
      chunk_bytes = APP.CHUNK_BYTES,
      timeout_ms = APP.IO_TIMEOUT_MS,
      buffer_count = 2,
      buffer_len = 128,
      tdm = true,
    })
  end)
  if not ok then
    clear_recording()
    S.last_i2s_error = tostring(result_or_err or "录音失败")
    S.last_error = S.last_i2s_error
    set_mode("error")
    write_metrics()
  else
    local result = result_or_err or {}
    S.raw_record_bytes = tonumber(result.bytes) or target_bytes
    S.record_elapsed_ms = tonumber(result.elapsed_ms) or 0
    S.effective_sample_rate = tonumber(result.effective_sample_rate) or 0
    S.read_ms = tonumber(result.read_ms) or 0
    S.write_ms = tonumber(result.write_ms) or 0
    write_metrics()
    stop_recording_and_send()
  end
end

local function on_short_press()
  local now = now_ms()
  if S.mode == "recording" then
    return
  elseif S.mode ~= "sending" then
    if now < (S.ignore_record_until_ms or 0) then
      return
    end
    start_recording()
  end
end

local function exit_app()
  APP.stop("exit")
  if app and app.exit then
    pcall(function() app.exit() end)
  end
end

local function bind_keys()
  if app and app.set_home_exit then
    pcall(function() app.set_home_exit(false) end)
  end
  if not key or not key.on then return end
  key.on(key.HOME, function(evt_type)
    S.home_events = (S.home_events or 0) + 1
    S.last_key_event = tonumber(evt_type) or 0
    write_metrics()
    if evt_type == key.SHORT then
      on_short_press()
    elseif evt_type == key.LONG_START or evt_type == key.EXIT then
      exit_app()
    end
  end)
end

local function build_ui()
  local resource_start = now_ms()
  set_init_stage("build_ui:start")
  for key_name in pairs(UI) do
    UI[key_name] = nil
  end

  set_init_stage("build_ui:screen")
  local root = lv_scr_act()
  if lv_obj_clean and root then
    pcall(function()
      lv_obj_clean(root)
    end)
  end
  APP.main_screen = root

  call(lv_obj_set_style_bg_color, root, C.bg, MAIN_STYLE)
  call(lv_obj_set_style_bg_opa, root, 255, MAIN_STYLE)

  set_init_stage("build_ui:gif")
  if APP.config.use_gif and lv_gif_create then
    pcall(function()
      UI.gif = lv_gif_create(root)
      call(lv_obj_set_pos, UI.gif, 0, 58)
      call(lv_obj_set_size, UI.gif, 120, 120)
    end)
  end

  set_init_stage("build_ui:labels")
  pcall(function()
    local ui_font = APP.USE_CUSTOM_FONT and APP.font_cn or FONT_CJK
    UI.action_key = label(root, 18, 82, 90, 28, "[HOME]", FONT_14, C.green, ALIGN_CENTER)
    UI.action_text = label(root, 10, 116, 106, 22, "短按录音", ui_font, C.text, ALIGN_CENTER)
    UI.status = label(root, 134, 32, 174, 22, "按下说话", ui_font, C.cyan, ALIGN_LEFT)
    UI.reply = label(root, 134, 68, 174, 118, "短按开始", ui_font, C.text, ALIGN_LEFT, LABEL_LONG_WRAP)
    UI.hint = label(root, 134, 207, 174, 18, "短按发送  长按退出", ui_font, C.dim, ALIGN_LEFT)
    call(lv_obj_move_foreground, UI.action_key)
    call(lv_obj_move_foreground, UI.action_text)
    call(lv_obj_move_foreground, UI.status)
    call(lv_obj_move_foreground, UI.reply)
    call(lv_obj_move_foreground, UI.hint)
  end)

  set_init_stage("build_ui:done")
  mark_first_paint()
  mark_resource(resource_start)
end

local function start_timers()
  local tick = tmr and tmr.create and tmr.create() or nil
  if tick then
    APP.timers.tick = tick
    tick:alarm(250, tmr.ALARM_AUTO, function()
      local tick_start = now_ms()
      if APP.running then update_ui() end
      mark_perf_timer(tick_start)
    end)
  end
end

local function finish_boot()
  set_init_stage("build_ui")
  build_ui()
  set_init_stage("start_timers")
  start_timers()
  set_init_stage("update_ui")
  update_ui()
  APP.perf.ready_ms = perf_elapsed()
  set_init_stage("ready")
  write_metrics()
end

local function schedule_boot()
  if not tmr or not tmr.create then
    finish_boot()
    return
  end
  APP.boot_timer = tmr.create()
  APP.boot_timer:alarm(50, tmr.ALARM_SINGLE or 0, function()
    local tick_start = now_ms()
    APP.boot_timer = nil
    if APP.running then
      finish_boot()
    end
    mark_perf_timer(tick_start)
  end)
end

function APP.stop()
  APP.running = false
  APP.perf.stop_requested = true
  APP.boot_timer = stop_timer(APP.boot_timer)
  cleanup_ai_ui(true)
  stop_i2s()
  for _, timer in pairs(APP.timers or {}) do
    stop_timer(timer)
  end
  APP.timers = {}
  if key and key.off then
    pcall(key.off, key.HOME)
  end
  if app and app.set_home_exit then
    pcall(function() app.set_home_exit(true) end)
  end
  if UI.gif and lv_gif_set_src then
    pcall(lv_gif_set_src, UI.gif, nil)
  end
  release_fonts()
  S.ai_ui_active = false
  write_metrics()
end

set_init_stage("load_config")
local config_ok, config_err = pcall(load_config)
if not config_ok then
  S.last_error = "config: " .. tostring(config_err or "load failed")
end
set_init_stage("load_font")
APP.font_cn = FONT_CJK
S.font_loaded = true
S.font_handle = FONT_CJK
S.font_src = (FONT_CJK == FONT_COMMON_CN) and "builtin:LV_FONT_COMMON_CN_13" or "builtin:LV_FONT_VOICE_AI_13"
S.font_error = ""
set_init_stage("bind_keys")
bind_keys()
set_init_stage("scheduled_boot", true)
schedule_boot()
