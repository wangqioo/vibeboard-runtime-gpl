if _G.SPECTRUM_APP and _G.SPECTRUM_APP.stop then
  pcall(function() _G.SPECTRUM_APP.stop("reload") end)
end

SPECTRUM_APP = {
  VERSION = "2026-06-25-real-i2s-spectrum",
  METRICS_PATH = "metrics.json",
  SCREEN_W = 320,
  SCREEN_H = 240,
  BAR_COUNT = 32,
  SAMPLE_RATE = 16000,
  SAMPLE_BITS = 16,
  FRAME_BYTES = 512,
  WINDOW_SAMPLES = 128,
  RENDER_EVERY_FRAMES = 2,
  mode = "bars",
  frames = 0,
  mode_changes = 0,
  audio_started = false,
  audio_reads = 0,
  audio_bytes = 0,
  capture_error = "",
  timer_error = "",
  tick_phase = "boot",
  tick_count = 0,
  read_attempts = 0,
  last_pcm_bytes = 0,
  last_key = "",
  band_levels = {},
  band_powers = {},
  band_frequencies = {},
  ui = {},
  timers = {},
  startup_complete = false
}

local APP = SPECTRUM_APP
_G.SPECTRUM_APP = APP

local MAIN = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)
local TICK_MS = 500
local I2S_READ_TIMEOUT_MS = 0
local MIN_FREQ = 90
local MAX_FREQ = 7600
local I2S_START_OPTIONS = {
  { buffer_count = 2, buffer_len = 128 },
  { buffer_count = 2, buffer_len = 96 },
  { buffer_count = 1, buffer_len = 128 },
}

local function json_escape(value)
  value = tostring(value or "")
  value = string.gsub(value, "\\", "\\\\")
  value = string.gsub(value, '"', '\\"')
  value = string.gsub(value, "\n", "\\n")
  return value
end

local function clamp(value, min_value, max_value)
  if value < min_value then return min_value end
  if value > max_value then return max_value end
  return value
end

local function write_metrics()
  if not file or not file.write then return end
  local peak_level = 0
  local peak_band = 0
  local peak_hz = 0
  for i = 1, #APP.band_levels do
    local level = tonumber(APP.band_levels[i]) or 0
    if level > peak_level then
      peak_level = level
      peak_band = i
      peak_hz = tonumber(APP.band_frequencies[i]) or 0
    end
  end
  local body = "{"
    .. '"audio_ready":' .. tostring(APP.audio_started)
    .. ',"frames":' .. tostring(APP.frames)
    .. ',"mode":"' .. json_escape(APP.mode) .. '"'
    .. ',"mode_changes":' .. tostring(APP.mode_changes)
    .. ',"last_key":"' .. json_escape(APP.last_key) .. '"'
    .. ',"band_count":' .. tostring(#APP.band_levels)
    .. ',"bin_count":' .. tostring(#APP.band_levels)
    .. ',"audio_reads":' .. tostring(APP.audio_reads)
    .. ',"audio_bytes":' .. tostring(APP.audio_bytes)
    .. ',"read_attempts":' .. tostring(APP.read_attempts)
    .. ',"last_pcm_bytes":' .. tostring(APP.last_pcm_bytes)
    .. ',"peak_level":' .. tostring(peak_level)
    .. ',"peak_band":' .. tostring(peak_band)
    .. ',"peak_hz":' .. tostring(peak_hz)
    .. ',"capture_error":"' .. json_escape(APP.capture_error) .. '"'
    .. ',"timer_error":"' .. json_escape(APP.timer_error) .. '"'
    .. ',"tick_phase":"' .. json_escape(APP.tick_phase) .. '"'
    .. ',"tick_count":' .. tostring(APP.tick_count)
    .. "}"
  pcall(function() file.write(APP.METRICS_PATH, body) end)
end

local function set_phase(phase, flush)
  APP.tick_phase = phase
  if flush then
    write_metrics()
  end
end

local function set_text(obj, text)
  if obj and lv_label_set_text then
    pcall(function() lv_label_set_text(obj, tostring(text or "")) end)
  end
end

local function build_band_frequencies()
  for i = 1, APP.BAR_COUNT do
    local ratio = (i - 1) / math.max(1, APP.BAR_COUNT - 1)
    local freq = MIN_FREQ * ((MAX_FREQ / MIN_FREQ) ^ ratio)
    APP.band_frequencies[i] = freq
  end
end

local function color_for(value, index)
  if APP.mode == "pulse" then
    if index % 3 == 0 then return 0xff5d8f end
    if index % 3 == 1 then return 0x4dd7ff end
    return 0xf8d66d
  end
  if value >= 75 then return 0xff7b4a end
  if value >= 48 then return 0xf2b84b end
  return 0x46c7ff
end

local function parse_pcm16le(pcm, samples, limit)
  local count = 0
  local len = math.min(#pcm - (#pcm % 2), limit * 2)
  local index = 1
  while index <= len and count < limit do
    local lo = string.byte(pcm, index) or 0
    local hi = string.byte(pcm, index + 1) or 0
    local value = hi * 256 + lo
    if value >= 32768 then
      value = value - 65536
    end
    count = count + 1
    samples[count] = value
    index = index + 2
  end
  return count
end

local function goertzel_power(samples, count, sample_rate, freq)
  if count <= 0 or sample_rate <= 0 or freq <= 0 then
    return 0
  end
  local k = math.floor(0.5 + (count * freq / sample_rate))
  if k < 1 then
    k = 1
  elseif k > math.floor(count / 2) then
    k = math.floor(count / 2)
  end
  local omega = (2 * math.pi * k) / count
  local coeff = 2 * math.cos(omega)
  local s_prev = 0
  local s_prev2 = 0
  for i = 1, count do
    local s = samples[i] or 0
    local s_curr = s + coeff * s_prev - s_prev2
    s_prev2 = s_prev
    s_prev = s_curr
  end
  local power = s_prev2 * s_prev2 + s_prev * s_prev - coeff * s_prev * s_prev2
  if power < 0 then
    power = 0
  end
  return power
end

local function update_levels(samples, count)
  local peak_power = 0
  for i = 1, APP.BAR_COUNT do
    local freq = APP.band_frequencies[i] or MIN_FREQ
    local power = goertzel_power(samples, count, APP.SAMPLE_RATE, freq)
    APP.band_powers[i] = power
    if power > peak_power then
      peak_power = power
    end
  end

  local peak_band = 0
  local peak_level = 0
  local peak_hz = 0
  for i = 1, APP.BAR_COUNT do
    local power = APP.band_powers[i] or 0
    local normalized = 0
    if peak_power > 0 and power > 0 then
      normalized = math.floor((power / peak_power) ^ 0.82 * 100 + 0.5)
    end
    if normalized < 4 and power > 0 then
      normalized = 4
    end
    if normalized > 100 then
      normalized = 100
    end
    local previous = tonumber(APP.band_levels[i]) or 0
    local smoothed = math.floor((previous * 2 + normalized) / 3)
    if smoothed < 2 and normalized > 0 then
      smoothed = 2
    end
    APP.band_levels[i] = smoothed
    if smoothed > peak_level then
      peak_level = smoothed
      peak_band = i
      peak_hz = tonumber(APP.band_frequencies[i]) or 0
    end
  end

  return peak_band, peak_level, peak_hz, peak_power
end

local function decay_levels()
  for i = 1, APP.BAR_COUNT do
    local previous = tonumber(APP.band_levels[i]) or 0
    if previous > 0 then
      local faded = math.floor(previous * 0.86)
      if faded < 1 then
        faded = 1
      end
      APP.band_levels[i] = faded
    end
  end
end

local function bar_text()
  local shades = { ".", ":", "-", "=", "+", "*", "#", "@" }
  local rows = {}
  for row = 0, 3 do
    local parts = {}
    for col = 1, 8 do
      local index = row * 8 + col
      local value = tonumber(APP.band_levels[index]) or 0
      local shade = math.floor(clamp(value, 0, 99) / 13) + 1
      if shade < 1 then shade = 1 end
      if shade > #shades then shade = #shades end
      parts[#parts + 1] = shades[shade]
      parts[#parts + 1] = shades[shade]
    end
    rows[#rows + 1] = table.concat(parts)
  end
  return table.concat(rows, "\n")
end

local function render_bars()
  set_text(APP.ui.spectrum, bar_text())
end

local function render()
  set_text(APP.ui.title, "Spectrum")
  local status_text = APP.audio_started and ("mic " .. tostring(APP.audio_reads) .. " frames " .. tostring(APP.frames)) or ("mic pending " .. tostring(APP.capture_error))
  set_text(APP.ui.status, APP.mode .. "  " .. status_text)
  set_text(APP.ui.footer, APP.audio_started and "Real I2S microphone capture with Goertzel bands" or "Waiting for I2S microphone config")
  render_bars()
  write_metrics()
end

local function start_audio()
  if APP.audio_started then
    return true
  end
  if not i2s or not i2s.start or not i2s.read or not i2s.stop then
    APP.capture_error = "I2S unavailable"
    return false
  end

  local last_error = ""
  for _, option in ipairs(I2S_START_OPTIONS) do
    local ok, err = pcall(function()
      return i2s.start(0, {
        mode = i2s.MODE_MASTER | i2s.MODE_RX,
        rate = APP.SAMPLE_RATE,
        bits = APP.SAMPLE_BITS,
        channel = i2s.CHANNEL_ONLY_LEFT,
        format = i2s.FORMAT_I2S,
        buffer_count = option.buffer_count,
        buffer_len = option.buffer_len,
      })
    end)

    if ok and err == true then
      APP.audio_started = true
      APP.capture_error = ""
      return true
    end
    last_error = tostring(err or "i2s start failed")
  end

  APP.capture_error = last_error
  return true
end

local function sample_audio()
  if not APP.audio_started then
    return false
  end
  if app and app.exiting and app.exiting() then
    return false
  end
  APP.read_attempts = APP.read_attempts + 1
  APP.last_pcm_bytes = 0
  set_phase("before_read", true)
  local ok, pcm_or_err = pcall(function()
    return i2s.read(0, APP.FRAME_BYTES, I2S_READ_TIMEOUT_MS)
  end)
  if not ok then
    APP.capture_error = tostring(pcm_or_err or "i2s read failed")
    set_phase("read_error", true)
    return false
  end

  local pcm = pcm_or_err
  APP.last_pcm_bytes = pcm and #pcm or 0
  set_phase("after_read", true)
  if not pcm or #pcm == 0 then
    decay_levels()
    set_phase("read_empty", false)
    return true
  end

  APP.audio_reads = APP.audio_reads + 1
  APP.audio_bytes = APP.audio_bytes + #pcm

  set_phase("before_parse", false)
  local samples = {}
  local count = parse_pcm16le(pcm, samples, APP.WINDOW_SAMPLES)
  if count <= 0 then
    decay_levels()
    set_phase("parse_empty", false)
    return true
  end

  if count < APP.WINDOW_SAMPLES then
    for i = count + 1, APP.WINDOW_SAMPLES do
      samples[i] = 0
    end
    count = APP.WINDOW_SAMPLES
  end

  set_phase("before_bands", true)
  update_levels(samples, count)
  set_phase("after_bands", true)
  return true
end

local function draw_ui()
  local root = lv_scr_act()
  lv_obj_clean(root)
  lv_obj_set_style_bg_color(root, 0x020712, MAIN)
  APP.ui.root = root
  APP.ui.bg = lv_obj_create(root)
  lv_obj_set_pos(APP.ui.bg, 0, 0)
  lv_obj_set_size(APP.ui.bg, APP.SCREEN_W, APP.SCREEN_H)
  lv_obj_set_style_bg_color(APP.ui.bg, 0x020712, MAIN)
  lv_obj_set_style_bg_opa(APP.ui.bg, 255, MAIN)
  lv_obj_set_style_border_width(APP.ui.bg, 0, MAIN)
  lv_obj_set_style_radius(APP.ui.bg, 0, MAIN)

  APP.ui.header = lv_obj_create(root)
  lv_obj_set_pos(APP.ui.header, 0, 0)
  lv_obj_set_size(APP.ui.header, APP.SCREEN_W, 28)
  lv_obj_set_style_bg_color(APP.ui.header, 0x07111f, MAIN)
  lv_obj_set_style_bg_opa(APP.ui.header, 255, MAIN)
  lv_obj_set_style_border_width(APP.ui.header, 0, MAIN)
  lv_obj_set_style_radius(APP.ui.header, 0, MAIN)

  APP.ui.footer_rule = lv_obj_create(root)
  lv_obj_set_pos(APP.ui.footer_rule, 0, 196)
  lv_obj_set_size(APP.ui.footer_rule, APP.SCREEN_W, 1)
  lv_obj_set_style_bg_color(APP.ui.footer_rule, 0x19324d, MAIN)
  lv_obj_set_style_bg_opa(APP.ui.footer_rule, 180, MAIN)
  lv_obj_set_style_border_width(APP.ui.footer_rule, 0, MAIN)
  lv_obj_set_style_radius(APP.ui.footer_rule, 0, MAIN)

  APP.ui.title = lv_label_create(root)
  lv_label_set_text(APP.ui.title, "Spectrum")
  lv_obj_set_pos(APP.ui.title, 12, 8)
  lv_obj_set_style_text_color(APP.ui.title, 0xf4f7fb, MAIN)

  APP.ui.status = lv_label_create(root)
  lv_label_set_text(APP.ui.status, "starting")
  lv_obj_set_pos(APP.ui.status, 166, 9)
  lv_obj_set_width(APP.ui.status, 142)
  lv_obj_set_style_text_color(APP.ui.status, 0x9bdcff, MAIN)

  APP.ui.spectrum = lv_label_create(root)
  lv_label_set_text(APP.ui.spectrum, "................\n................\n................\n................")
  lv_obj_set_pos(APP.ui.spectrum, 12, 48)
  lv_obj_set_width(APP.ui.spectrum, 296)
  lv_obj_set_style_text_color(APP.ui.spectrum, 0x46c7ff, MAIN)
  if lv_label_set_long_mode then
    pcall(function() lv_label_set_long_mode(APP.ui.spectrum, LV_LABEL_LONG_CLIP) end)
  end

  APP.ui.footer = lv_label_create(root)
  lv_label_set_text(APP.ui.footer, "")
  lv_obj_set_pos(APP.ui.footer, 12, 214)
  lv_obj_set_width(APP.ui.footer, 296)
  lv_obj_set_style_text_color(APP.ui.footer, 0x66717d, MAIN)
  if lv_label_set_long_mode then
    pcall(function() lv_label_set_long_mode(APP.ui.footer, LV_LABEL_LONG_CLIP) end)
  end

  build_band_frequencies()
  for i = 1, APP.BAR_COUNT do
    APP.band_levels[i] = 0
    APP.band_powers[i] = 0
  end
  write_metrics()
end

local function complete_startup()
  if APP.startup_complete then
    return
  end
  APP.startup_complete = true
  set_phase("startup_audio", true)
  start_audio()
  sample_audio()
  set_phase("startup_done", true)
end

local function toggle_mode()
  if APP.mode == "bars" then
    APP.mode = "pulse"
  else
    APP.mode = "bars"
  end
  APP.mode_changes = APP.mode_changes + 1
end

local function on_key(evt_code, evt_type, _ts_ms)
  if evt_type ~= key.SHORT and evt_type ~= key.LONG_START then return end
  if evt_code == key.LEFT or evt_code == key.RIGHT then
    APP.last_key = evt_code == key.LEFT and "LEFT" or "RIGHT"
    toggle_mode()
    render()
  elseif evt_code == key.HOME or evt_code == key.EXIT then
    if app and app.exit then pcall(function() app.exit() end) end
  end
end

local function tick_frame()
  APP.tick_count = APP.tick_count + 1
  set_phase("tick_start", true)
  if app and app.exiting and app.exiting() then
    APP.stop("exiting")
    return
  end
  APP.frames = APP.frames + 1
  set_phase("tick_after_frame", true)
  if not APP.startup_complete then
    if APP.frames % 5 == 0 then
      complete_startup()
    end
  elseif not APP.audio_started then
    set_phase("tick_no_audio", false)
    if APP.capture_error ~= "I2S unavailable" and (APP.frames % 25 == 0) then
      start_audio()
    end
    decay_levels()
  else
    set_phase("tick_sample", true)
    sample_audio()
  end
  set_phase("tick_render", true)
  if APP.frames % APP.RENDER_EVERY_FRAMES == 0 or not APP.audio_started then
    render()
  else
    set_text(APP.ui.title, "Spectrum")
    local status_text = APP.audio_started and ("mic " .. tostring(APP.audio_reads) .. " frames " .. tostring(APP.frames)) or ("mic pending " .. tostring(APP.capture_error))
    set_text(APP.ui.status, APP.mode .. "  " .. status_text)
    set_text(APP.ui.footer, APP.audio_started and "Real I2S microphone capture with Goertzel bands" or "Waiting for I2S microphone config")
    write_metrics()
  end
  set_phase("tick_done", true)
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
  if APP.audio_started and i2s and i2s.stop then
    pcall(function() i2s.stop(0) end)
  end
  if key and key.off then
    pcall(function() key.off() end)
  end
  APP.audio_started = false
  write_metrics()
  if _G.SPECTRUM_APP == APP then
    _G.SPECTRUM_APP = nil
  end
end

print("Spectrum real-audio migration start " .. APP.VERSION)
draw_ui()

if key and key.on then
  key.on(on_key)
end

if tmr and tmr.create then
  APP.timers.startup = tmr.create()
  APP.timers.startup:alarm(50, tmr.ALARM_SINGLE or 0, function()
    complete_startup()
  end)
  APP.timers.frame = tmr.create()
  APP.timers.frame:alarm(TICK_MS, tmr.ALARM_AUTO, function()
    local ok, err = pcall(tick_frame)
    if not ok then
      APP.timer_error = tostring(err or "frame timer failed")
      write_metrics()
      APP.stop("timer_error")
    end
  end)
else
  write_metrics()
end
