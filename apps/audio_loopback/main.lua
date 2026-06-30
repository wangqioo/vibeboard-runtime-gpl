print("[audio_loopback] start")

AUDIO_LOOPBACK_APP = {
  PLAYBACK_RATE = 16000,
  RECORD_SECONDS = 2,
  CAPTURE_PATH = "capture.raw",
  BITS = 16,
  CHANNELS = 2,
  I2S_ID = 0,
  CHUNK_BYTES = 4096,
  IO_TIMEOUT_MS = 1000,
  MAX_RECORD_BYTES = 384000,
  PLAYBACK_GAIN = 3,
}

local APP = AUDIO_LOOPBACK_APP
local MAIN_STYLE = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)
local ALIGN_CENTER = rawget(_G, "LV_TEXT_ALIGN_CENTER") or 1
local FONT_14 = rawget(_G, "LV_FONT_MONTSERRAT_14") or 14
local FONT_12 = rawget(_G, "LV_FONT_MONTSERRAT_12") or FONT_14
local C = {
  bg = 0x0b1220,
  panel = 0x162033,
  text = 0xf8fafc,
  dim = 0x94a3b8,
  cyan = 0x22d3ee,
  green = 0x4ade80,
  amber = 0xfbbf24,
  red = 0xfb7185,
}

local CAPTURE_MODES = {
  { name = "tdm48", rate = 48000, first_profile = 1, last_profile = 3 },
  { name = "tdm16", rate = 16000, first_profile = 4, last_profile = 6 },
}

local PLAYBACK_PROFILES = {
  { name = "tdm48-left", mode = 1, channel = "left", rate = APP.PLAYBACK_RATE },
  { name = "tdm48-right", mode = 1, channel = "right", rate = APP.PLAYBACK_RATE },
  { name = "tdm48-mix", mode = 1, channel = "mix", rate = APP.PLAYBACK_RATE },
  { name = "tdm16-left", mode = 2, channel = "left", rate = APP.PLAYBACK_RATE },
  { name = "tdm16-right", mode = 2, channel = "right", rate = APP.PLAYBACK_RATE },
  { name = "tdm16-mix", mode = 2, channel = "mix", rate = APP.PLAYBACK_RATE },
}

local S = {
  mode = "idle",
  record_bytes = 0,
  read_count = 0,
  write_count = 0,
  play_bytes = 0,
  peak_abs = 0,
  rms_abs = 0,
  silent_ratio = 0,
  clipped_ratio = 0,
  last_error = "",
  last_action = "ready",
  playback_profile = 1,
  playback_profile_name = "",
  record_started_ms = 0,
  record_elapsed_ms = 0,
  effective_sample_rate = 0,
  read_ms = 0,
  write_ms = 0,
  expected_record_bytes = 0,
  left_peak_abs = 0,
  left_rms_abs = 0,
  right_peak_abs = 0,
  right_rms_abs = 0,
  capture_saved = false,
  capture_bytes = 0,
  active_mode = 1,
}

local UI = {}

local function call(fn, ...)
  if fn then return fn(...) end
  return nil
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

local function json_escape(value)
  return tostring(value or ""):gsub("\\", "\\\\"):gsub("\"", "\\\""):gsub("\n", "\\n")
end

local function fmt_pct(value)
  return tostring(math.floor((value or 0) * 1000 + 0.5) / 10) .. "%"
end

local function capture_target_bytes(capture_mode)
  local target_bytes = capture_mode.rate * APP.CHANNELS * (APP.BITS / 8) * APP.RECORD_SECONDS
  if target_bytes > APP.MAX_RECORD_BYTES then target_bytes = APP.MAX_RECORD_BYTES end
  return target_bytes
end

local function write_metrics()
  local capture_mode = CAPTURE_MODES[S.active_mode] or CAPTURE_MODES[1]
  local metrics = "{"
    .. "\"mode\":\"" .. json_escape(S.mode) .. "\","
    .. "\"record_bytes\":" .. tostring(S.record_bytes or 0) .. ","
    .. "\"record_elapsed_ms\":" .. tostring(S.record_elapsed_ms or 0) .. ","
    .. "\"effective_sample_rate\":" .. tostring(S.effective_sample_rate or 0) .. ","
    .. "\"read_ms\":" .. tostring(S.read_ms or 0) .. ","
    .. "\"write_ms\":" .. tostring(S.write_ms or 0) .. ","
    .. "\"expected_record_bytes\":" .. tostring(S.expected_record_bytes or 0) .. ","
    .. "\"read_count\":" .. tostring(S.read_count or 0) .. ","
    .. "\"write_count\":" .. tostring(S.write_count or 0) .. ","
    .. "\"play_bytes\":" .. tostring(S.play_bytes or 0) .. ","
    .. "\"peak_abs\":" .. tostring(S.peak_abs or 0) .. ","
    .. "\"rms_abs\":" .. tostring(math.floor((S.rms_abs or 0) + 0.5)) .. ","
    .. "\"silent_ratio\":" .. tostring(S.silent_ratio or 0) .. ","
    .. "\"clipped_ratio\":" .. tostring(S.clipped_ratio or 0) .. ","
    .. "\"last_action\":\"" .. json_escape(S.last_action) .. "\","
    .. "\"playback_profile\":" .. tostring(S.playback_profile or 0) .. ","
    .. "\"playback_profile_name\":\"" .. json_escape(S.playback_profile_name) .. "\","
    .. "\"left_peak_abs\":" .. tostring(S.left_peak_abs or 0) .. ","
    .. "\"left_rms_abs\":" .. tostring(math.floor((S.left_rms_abs or 0) + 0.5)) .. ","
    .. "\"right_peak_abs\":" .. tostring(S.right_peak_abs or 0) .. ","
    .. "\"right_rms_abs\":" .. tostring(math.floor((S.right_rms_abs or 0) + 0.5)) .. ","
    .. "\"active_mode\":\"" .. json_escape(capture_mode.name) .. "\","
    .. "\"capture_saved\":" .. tostring(S.capture_saved and "true" or "false") .. ","
    .. "\"capture_bytes\":" .. tostring(S.capture_bytes or 0) .. ","
    .. "\"last_error\":\"" .. json_escape(S.last_error) .. "\""
    .. "}"
  if file and file.write then file.write("metrics.json", metrics) end
end

local function label(parent, text, x, y, w, h, color, font, align)
  local id = lv_label_create(parent)
  lv_label_set_text(id, text)
  call(lv_obj_set_style_text_color, id, color or C.text, MAIN_STYLE)
  call(lv_obj_set_style_text_font, id, font or FONT_12, MAIN_STYLE)
  call(lv_obj_set_style_text_align, id, align or ALIGN_CENTER, MAIN_STYLE)
  call(lv_obj_set_pos, id, x, y)
  call(lv_obj_set_size, id, w, h)
  return id
end

local function render()
  local capture_mode = CAPTURE_MODES[S.active_mode] or CAPTURE_MODES[1]
  local body = ""
  local color = C.cyan
  if S.mode == "recording" then
    color = C.red
    body = "Recording " .. capture_mode.name .. "\nfixed " .. tostring(APP.RECORD_SECONDS) .. "s"
  elseif S.mode == "playing" then
    color = C.green
    body = "Playing\n" .. tostring(S.playback_profile_name)
  elseif S.mode == "error" then
    color = C.red
    body = "Error\n" .. tostring(S.last_error)
  elseif S.record_bytes > 0 then
    body = "Idle " .. capture_mode.name .. "\nHOME plays next profile"
  else
    body = "Idle " .. capture_mode.name .. "\npress HOME to record"
  end

  local stats = "bytes " .. tostring(S.record_bytes) .. " / " .. tostring(S.expected_record_bytes)
    .. "\nrate " .. tostring(S.effective_sample_rate or 0) .. "Hz"
    .. "\nL " .. tostring(math.floor((S.left_rms_abs or 0) + 0.5))
    .. " R " .. tostring(math.floor((S.right_rms_abs or 0) + 0.5))
    .. "\nsilent " .. fmt_pct(S.silent_ratio)

  lv_label_set_text(UI.title, "Audio Loopback")
  lv_label_set_text(UI.action, "Short HOME: native record/play profile")
  lv_label_set_text(UI.body, body)
  lv_label_set_text(UI.stats, stats)
  lv_label_set_text(UI.footer, "Long HOME: exit")
  call(lv_obj_set_style_text_color, UI.body, color, MAIN_STYLE)
  write_metrics()
end

local function read_i16_le(data, index)
  local lo = string.byte(data, index) or 0
  local hi = string.byte(data, index + 1) or 0
  local sample = lo + hi * 256
  if sample >= 32768 then sample = sample - 65536 end
  return sample
end

local function analyze_capture_file()
  S.peak_abs = 0
  S.rms_abs = 0
  S.silent_ratio = 0
  S.clipped_ratio = 0
  S.left_peak_abs = 0
  S.left_rms_abs = 0
  S.right_peak_abs = 0
  S.right_rms_abs = 0
  if not file or not file.open then return end
  local handle = file.open(APP.CAPTURE_PATH, "r")
  if not handle then return end
  local samples = 0
  local sum_sq = 0
  local silent = 0
  local clipped = 0
  local left_samples = 0
  local left_sum_sq = 0
  local right_samples = 0
  local right_sum_sq = 0
  local silent_threshold = 256
  while true do
    local chunk = handle:read(APP.CHUNK_BYTES)
    if not chunk or #chunk <= 0 then break end
    local limit = #chunk - (#chunk % 4)
    local i = 1
    while i + 3 <= limit do
      local left = read_i16_le(chunk, i)
      local right = read_i16_le(chunk, i + 2)
      local left_abs = left
      if left_abs < 0 then left_abs = -left_abs end
      local right_abs = right
      if right_abs < 0 then right_abs = -right_abs end
      if left_abs > S.left_peak_abs then S.left_peak_abs = left_abs end
      if right_abs > S.right_peak_abs then S.right_peak_abs = right_abs end
      if left_abs > S.peak_abs then S.peak_abs = left_abs end
      if right_abs > S.peak_abs then S.peak_abs = right_abs end
      left_sum_sq = left_sum_sq + (left * 1.0) * left
      right_sum_sq = right_sum_sq + (right * 1.0) * right
      left_samples = left_samples + 1
      right_samples = right_samples + 1
      local mono = (left + right) / 2
      local mono_abs = mono
      if mono_abs < 0 then mono_abs = -mono_abs end
      sum_sq = sum_sq + mono * mono
      samples = samples + 1
      if mono_abs <= silent_threshold then silent = silent + 1 end
      if left_abs >= 32760 or right_abs >= 32760 then clipped = clipped + 1 end
      i = i + 4
    end
  end
  handle:close()
  if samples > 0 then
    S.rms_abs = math.sqrt(sum_sq / samples)
    S.silent_ratio = silent / samples
    S.clipped_ratio = clipped / samples
  end
  S.left_rms_abs = left_samples > 0 and math.sqrt(left_sum_sq / left_samples) or 0
  S.right_rms_abs = right_samples > 0 and math.sqrt(right_sum_sq / right_samples) or 0
end

local function stop_audio()
  if i2s and i2s.stop then pcall(function() i2s.stop(APP.I2S_ID) end) end
end

local function clear_capture_for_mode()
  S.record_bytes = 0
  S.read_count = 0
  S.write_count = 0
  S.play_bytes = 0
  S.peak_abs = 0
  S.rms_abs = 0
  S.silent_ratio = 0
  S.clipped_ratio = 0
  S.record_started_ms = 0
  S.record_elapsed_ms = 0
  S.effective_sample_rate = 0
  S.read_ms = 0
  S.write_ms = 0
  S.expected_record_bytes = 0
  S.left_peak_abs = 0
  S.left_rms_abs = 0
  S.right_peak_abs = 0
  S.right_rms_abs = 0
  S.capture_saved = false
  S.capture_bytes = 0
end

local function advance_profile()
  local capture_mode = CAPTURE_MODES[S.active_mode] or CAPTURE_MODES[1]
  local next_profile = S.playback_profile + 1
  local next = PLAYBACK_PROFILES[next_profile]
  if next and next.mode == S.active_mode then
    S.playback_profile = next_profile
    return
  end
  S.active_mode = S.active_mode + 1
  if S.active_mode > #CAPTURE_MODES then S.active_mode = 1 end
  capture_mode = CAPTURE_MODES[S.active_mode] or CAPTURE_MODES[1]
  S.playback_profile = capture_mode.first_profile
  clear_capture_for_mode()
end

local function play_current_profile()
  if not i2s or not i2s.play_file then
    S.mode = "error"
    S.last_error = "i2s play_file unavailable"
    render()
    return
  end
  local capture_mode = CAPTURE_MODES[S.active_mode] or CAPTURE_MODES[1]
  if S.playback_profile < capture_mode.first_profile or S.playback_profile > capture_mode.last_profile then
    S.playback_profile = capture_mode.first_profile
  end
  local profile = PLAYBACK_PROFILES[S.playback_profile] or PLAYBACK_PROFILES[capture_mode.first_profile]
  S.mode = "playing"
  S.last_action = "playing"
  S.last_error = ""
  S.playback_profile_name = profile.name
  S.write_count = 0
  S.play_bytes = 0
  render()
  local ok, result = pcall(function()
    return i2s.play_file(APP.I2S_ID, APP.CAPTURE_PATH, {
      source_rate = S.effective_sample_rate > 0 and S.effective_sample_rate or capture_mode.rate,
      rate = profile.rate or APP.PLAYBACK_RATE,
      bits = APP.BITS,
      channels = APP.CHANNELS,
      select = profile.channel,
      gain = APP.PLAYBACK_GAIN,
      chunk_bytes = APP.CHUNK_BYTES,
      timeout_ms = APP.IO_TIMEOUT_MS,
    })
  end)
  if not ok then
    S.mode = "error"
    S.last_error = tostring(result)
    stop_audio()
    render()
    return
  end
  S.write_count = result.ops or 0
  S.play_bytes = result.bytes or 0
  S.mode = "idle"
  S.last_action = "playback_done:" .. tostring(S.playback_profile_name)
  advance_profile()
  render()
end

local function record_current_mode()
  if not i2s or not i2s.record_file then
    S.mode = "error"
    S.last_error = "i2s record_file unavailable"
    render()
    return
  end
  stop_audio()
  clear_capture_for_mode()
  local capture_mode = CAPTURE_MODES[S.active_mode] or CAPTURE_MODES[1]
  local target_bytes = capture_target_bytes(capture_mode)
  S.expected_record_bytes = target_bytes
  S.mode = "recording"
  S.last_action = "recording"
  S.last_error = ""
  S.record_started_ms = now_ms()
  render()
  local ok, result = pcall(function()
    return i2s.record_file(APP.I2S_ID, APP.CAPTURE_PATH, {
      rate = capture_mode.rate,
      bits = APP.BITS,
      channel = i2s.CHANNEL_STEREO,
      tdm = true,
      buffer_count = 2,
      buffer_len = 128,
      target_bytes = capture_target_bytes(capture_mode),
      chunk_bytes = APP.CHUNK_BYTES,
      timeout_ms = APP.IO_TIMEOUT_MS,
    })
  end)
  S.record_elapsed_ms = now_ms() - (S.record_started_ms or now_ms())
  if S.record_elapsed_ms < 0 then S.record_elapsed_ms = 0 end
  if not ok then
    S.mode = "error"
    S.last_error = tostring(result)
    stop_audio()
    render()
    return
  end
  S.record_bytes = result.bytes or 0
  S.read_count = result.ops or 0
  S.record_elapsed_ms = result.elapsed_ms or S.record_elapsed_ms
  S.effective_sample_rate = result.effective_sample_rate or 0
  S.read_ms = result.read_ms or 0
  S.write_ms = result.write_ms or 0
  S.capture_saved = S.record_bytes > 0
  S.capture_bytes = S.record_bytes
  analyze_capture_file()
  S.last_action = "recorded"
  if S.record_bytes <= 0 then
    S.mode = "error"
    S.last_error = "no audio captured"
    render()
    return
  end
  play_current_profile()
end

local function exit_app()
  stop_audio()
  if key and key.off and key.HOME then pcall(function() key.off(key.HOME) end) end
  if app and app.set_home_exit then pcall(function() app.set_home_exit(true) end) end
  if app and app.exit then pcall(function() app.exit("audio_loopback exit") end) end
end

local function handle_home(evt_type)
  if evt_type == key.LONG_START or evt_type == key.EXIT then
    exit_app()
    return
  end
  if evt_type ~= key.SHORT then return end
  if S.mode == "recording" or S.mode == "playing" then return end
  if S.record_bytes > 0 then
    play_current_profile()
  else
    record_current_mode()
  end
end

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, C.bg)
local panel = lv_obj_create(root)
lv_obj_set_size(panel, 300, 200)
lv_obj_set_pos(panel, 10, 20)
lv_obj_set_style_bg_color(panel, C.panel)
lv_obj_set_style_radius(panel, 8)
lv_obj_set_style_border_width(panel, 0)
lv_obj_clear_flag(panel, LV_OBJ_FLAG_SCROLLABLE)

UI.title = label(panel, "Audio Loopback", 8, 10, 284, 22, C.text, FONT_14, ALIGN_CENTER)
UI.action = label(panel, "Short HOME: native record/play profile", 8, 42, 284, 20, C.amber, FONT_12, ALIGN_CENTER)
UI.body = label(panel, "Idle\npress HOME to record", 8, 72, 284, 48, C.cyan, FONT_14, ALIGN_CENTER)
UI.stats = label(panel, "bytes 0 / 0\nrate 0Hz\nL 0 R 0", 8, 130, 284, 48, C.dim, FONT_12, ALIGN_CENTER)
UI.footer = label(root, "Long HOME: exit", 10, 225, 300, 14, C.dim, FONT_12, ALIGN_CENTER)

if app and app.set_home_exit then pcall(function() app.set_home_exit(false) end) end
if key and key.on and key.HOME then key.on(key.HOME, handle_home) end
render()
print("[audio_loopback] ready")
