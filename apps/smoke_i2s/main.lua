print("[smoke_i2s] start")

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x111111)

local title = lv_label_create(root)
lv_label_set_text(title, "I2S Smoke")
lv_obj_set_style_text_color(title, 0xf9fafb)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 12)

local status = lv_label_create(root)
lv_obj_set_width(status, 292)
lv_obj_set_style_text_color(status, 0xd1d5db)
lv_obj_align(status, LV_ALIGN_CENTER, 0, 0)

local total = 0
local reads = 0
local writes = 0
local tx_bytes = 0
local tone_writes = 0
local started = false
local tx_started = false
local last_error = ""
local nonzero = 0
local runtime_app = app
local tone_hz = 440
local tone_phase = 0
local tone_sample_rate = 16000
local tone_buffer = ""
local phase = "boot"

local function json_escape(value)
  return tostring(value):gsub("\\", "\\\\"):gsub("\"", "\\\""):gsub("\n", "\\n")
end

local function write_metrics()
  local state = i2s.status(0)
  local metrics = "{"
    .. "\"started\":" .. tostring(state.started) .. ","
    .. "\"rx_started\":" .. tostring(state.rx_started) .. ","
    .. "\"tx_started\":" .. tostring(state.tx_started) .. ","
    .. "\"rate\":" .. tostring(state.rate or 0) .. ","
    .. "\"bits\":" .. tostring(state.bits or 0) .. ","
    .. "\"bytes\":" .. tostring(total) .. ","
    .. "\"reads\":" .. tostring(reads) .. ","
    .. "\"nonzero\":" .. tostring(nonzero) .. ","
    .. "\"writes\":" .. tostring(state.writes or writes) .. ","
    .. "\"tx_bytes\":" .. tostring(state.tx_bytes or tx_bytes) .. ","
    .. "\"tone_hz\":" .. tostring(tone_hz) .. ","
    .. "\"tone_writes\":" .. tostring(tone_writes) .. ","
    .. "\"phase\":\"" .. json_escape(phase) .. "\","
    .. "\"last_error\":\"" .. json_escape(last_error ~= "" and last_error or state.last_error or "") .. "\""
    .. "}"
  if file and file.write then
    file.write("metrics.json", metrics)
  end
end

local function render()
  local state = i2s.status(0)
  local lines = {
    "started: " .. tostring(state.started),
    "rate: " .. tostring(state.rate),
    "bits: " .. tostring(state.bits),
    "bytes: " .. tostring(total),
    "reads: " .. tostring(reads),
    "nonzero: " .. tostring(nonzero),
    "tx: " .. tostring(state.tx_started) .. " writes=" .. tostring(state.writes or writes) .. " bytes=" .. tostring(state.tx_bytes or tx_bytes),
    "tone: " .. tostring(tone_hz) .. "Hz writes=" .. tostring(tone_writes),
    "phase: " .. tostring(phase),
    "error: " .. tostring(last_error ~= "" and last_error or state.last_error),
  }
  lv_label_set_text(status, table.concat(lines, "\n"))
  print("[smoke_i2s]", table.concat(lines, " | "))
  write_metrics()
end

phase = "before_i2s"
write_metrics()

local tx_ok, tx_err = pcall(function()
  return i2s.start(0, {
    mode = i2s.MODE_MASTER | i2s.MODE_TX,
    rate = 16000,
    bits = 16,
    channel = i2s.CHANNEL_ONLY_LEFT,
    format = i2s.FORMAT_I2S,
    buffer_count = 2,
    buffer_len = 128,
  })
end)

started = tx_ok and tx_err == true
tx_started = started and i2s.status(0).tx_started
phase = "after_i2s"
if not started then
  local first_error = tostring(tx_err)
  local rx_ok, rx_err = pcall(function()
    return i2s.start(0, {
      mode = i2s.MODE_MASTER | i2s.MODE_RX,
      rate = 16000,
      bits = 16,
      channel = i2s.CHANNEL_ONLY_LEFT,
      format = i2s.FORMAT_I2S,
      buffer_count = 2,
      buffer_len = 128,
    })
  end)
  started = rx_ok and rx_err == true
  tx_started = false
  last_error = started and ("tx disabled: " .. first_error) or tostring(rx_err)
end
render()

local function sample_to_bytes(sample)
  if sample < 0 then
    sample = sample + 65536
  end
  local lo = sample % 256
  local hi = math.floor(sample / 256) % 256
  return string.char(lo, hi)
end

local function make_tone(bytes)
  local samples = math.floor(bytes / 2)
  local parts = {}
  for _ = 1, samples do
    local phase = (tone_phase % tone_sample_rate) / tone_sample_rate
    local sample = phase < 0.5 and 12000 or -12000
    parts[#parts + 1] = sample_to_bytes(sample)
    tone_phase = tone_phase + tone_hz
  end
  return table.concat(parts)
end

tone_buffer = make_tone(2048)

local timer = tmr.create()
timer:alarm(250, tmr.ALARM_AUTO, function()
  if runtime_app and runtime_app.exiting and runtime_app.exiting() then
    i2s.stop(0)
    timer:stop()
    return
  end
  if not started then
    phase = "tick_not_started"
    render()
    return
  end
  phase = "tick"

  local read_ok, pcm = pcall(function()
    return i2s.read(0, 2048, 0)
  end)
  if read_ok then
    reads = reads + 1
  else
    pcm = nil
    last_error = tostring(pcm)
  end
  if pcm then
    total = total + #pcm
    for i = 1, #pcm do
      if string.byte(pcm, i) ~= 0 then
        nonzero = nonzero + 1
      end
    end
  end

  if tx_started then
    local write_ok, written = pcall(function()
      return i2s.write(0, tone_buffer, 0)
    end)
    if write_ok then
      writes = writes + 1
      tx_bytes = tx_bytes + (written or 0)
    else
      last_error = tostring(written)
      written = 0
    end
    if write_ok and (written or 0) > 0 then
      tone_writes = tone_writes + 1
    end
  end
  render()

  if reads >= 40 then
    i2s.stop(0)
    started = false
    last_error = "stopped after smoke window"
    render()
  end
end)
