local M = {}

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

local function read_i16_le(data, index)
  local lo = string.byte(data, index) or 0
  local hi = string.byte(data, index + 1) or 0
  local sample = lo + hi * 256
  if sample >= 32768 then sample = sample - 65536 end
  return sample
end

local function table_concat_and_clear(chunks)
  local ok, raw_or_err = pcall(table.concat, chunks)
  for i = 1, #chunks do
    chunks[i] = nil
  end
  if not ok then
    return nil, tostring(raw_or_err or "audio concat failed")
  end
  return raw_or_err, nil
end

function M.max_bridge_pcm_bytes(options)
  options = options or {}
  local sample_rate = tonumber(options.bridge_sample_rate or options.sample_rate) or 16000
  local bits = tonumber(options.bridge_bits or options.bits) or 16
  local max_record_ms = tonumber(options.max_record_ms) or 10000
  local configured = math.floor(sample_rate * (bits / 8) * max_record_ms / 1000)
  local hard_limit = tonumber(options.max_bridge_bytes or options.max_record_bytes) or configured
  if configured < hard_limit then return configured end
  return hard_limit
end

function M.downsample_capture_chunk_to_16k_mono(input, options)
  options = options or {}
  if not input or #input == 0 then return "" end
  local out = {}
  local frames = tonumber(options.downsample_frames) or 3
  local capture_channels = tonumber(options.capture_channels) or 2
  local bits = tonumber(options.capture_bits or options.bits) or 16
  local bytes_per_sample = math.floor(bits / 8)
  local bytes_per_capture_frame = capture_channels * bytes_per_sample
  local bytes_per_output = frames * bytes_per_capture_frame
  local source_channel = tonumber(options.source_channel) or 0
  if source_channel < 0 then source_channel = 0 end
  if source_channel >= capture_channels then source_channel = 0 end
  local channel_offset = source_channel * bytes_per_sample
  local pos = 1
  while pos + bytes_per_output - 1 <= #input do
    local sum = 0
    for frame = 0, frames - 1 do
      sum = sum + read_i16_le(input, pos + (frame * bytes_per_capture_frame) + channel_offset)
    end
    out[#out + 1] = i16_to_bytes(sum / frames)
    pos = pos + bytes_per_output
  end
  return table.concat(out)
end

function M.downsample_capture_file_to_16k_mono(path, options)
  options = options or {}
  if not file or not file.open then
    return nil, { error = "file.open missing", raw_bytes = 0, output_bytes = 0 }
  end
  local handle = file.open(path, "r")
  if not handle then
    return nil, { error = "capture open failed", raw_bytes = 0, output_bytes = 0 }
  end

  local chunks = {}
  local total = 0
  local raw_bytes = 0
  local tail = ""
  local limit = M.max_bridge_pcm_bytes(options)
  local chunk_bytes = tonumber(options.chunk_bytes) or 4096
  local frames = tonumber(options.downsample_frames) or 3
  local capture_channels = tonumber(options.capture_channels) or 2
  local bits = tonumber(options.capture_bits or options.bits) or 16
  local bytes_per_sample = math.floor(bits / 8)
  local bytes_per_capture_frame = capture_channels * bytes_per_sample
  local bytes_per_output = frames * bytes_per_capture_frame

  while true do
    local chunk = handle:read(chunk_bytes)
    if not chunk or #chunk <= 0 then break end
    raw_bytes = raw_bytes + #chunk
    local input = tail .. chunk
    local usable = #input - (#input % bytes_per_output)
    if usable > 0 then
      local pcm = M.downsample_capture_chunk_to_16k_mono(input:sub(1, usable), options)
      if pcm and #pcm > 0 then
        chunks[#chunks + 1] = pcm
        total = total + #pcm
        if total >= limit then
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
    return nil, { error = "empty capture", raw_bytes = raw_bytes, output_bytes = 0 }
  end
  local raw, concat_err = table_concat_and_clear(chunks)
  if not raw then
    return nil, { error = concat_err, raw_bytes = raw_bytes, output_bytes = 0 }
  end
  if #raw > limit then
    raw = raw:sub(1, limit)
  end
  return raw, {
    raw_bytes = raw_bytes,
    output_bytes = #raw,
    bridge_sample_rate = tonumber(options.bridge_sample_rate or options.sample_rate) or 16000,
    bridge_bits = tonumber(options.bridge_bits or options.bits) or 16,
    bridge_channels = 1,
  }
end

function M.record_bridge_pcm(options)
  options = options or {}
  if not i2s or not i2s.record_file then
    return nil, { error = "i2s record_file unavailable" }
  end

  local i2s_id = tonumber(options.i2s_id) or 0
  local capture_path = options.capture_path or "capture.raw"
  local capture_rate = tonumber(options.capture_rate) or 48000
  local capture_bits = tonumber(options.capture_bits or options.bits) or 16
  local capture_channels = tonumber(options.capture_channels) or 2
  local downsample_frames = tonumber(options.downsample_frames) or 3
  local bridge_limit = M.max_bridge_pcm_bytes(options)
  local target_bytes = tonumber(options.target_bytes)
  if not target_bytes then
    target_bytes = math.floor(bridge_limit * downsample_frames * capture_channels)
  end

  if i2s.stop then
    pcall(function() i2s.stop(i2s_id) end)
  end

  local started_ms = now_ms()
  local ok, result = pcall(function()
    return i2s.record_file(i2s_id, capture_path, {
      rate = capture_rate,
      bits = capture_bits,
      channel = i2s.CHANNEL_STEREO,
      tdm = options.tdm ~= false,
      buffer_count = tonumber(options.buffer_count) or 2,
      buffer_len = tonumber(options.buffer_len) or 128,
      target_bytes = target_bytes,
      chunk_bytes = tonumber(options.chunk_bytes) or 4096,
      timeout_ms = tonumber(options.timeout_ms) or 1000,
    })
  end)
  local elapsed_ms = now_ms() - started_ms
  if elapsed_ms < 0 then elapsed_ms = 0 end
  if not ok then
    if i2s.stop then pcall(function() i2s.stop(i2s_id) end) end
    return nil, { error = tostring(result), record_elapsed_ms = elapsed_ms }
  end

  local raw, convert = M.downsample_capture_file_to_16k_mono(capture_path, {
    capture_channels = capture_channels,
    capture_bits = capture_bits,
    bridge_sample_rate = tonumber(options.bridge_sample_rate or options.sample_rate) or 16000,
    bridge_bits = tonumber(options.bridge_bits) or 16,
    max_record_ms = options.max_record_ms,
    max_bridge_bytes = options.max_bridge_bytes or options.max_record_bytes,
    chunk_bytes = options.chunk_bytes,
    downsample_frames = downsample_frames,
    source_channel = options.source_channel,
  })
  convert = convert or {}
  if not raw then
    return nil, {
      error = convert.error or "capture conversion failed",
      raw_bytes = tonumber(result.bytes) or convert.raw_bytes or 0,
      output_bytes = 0,
      record_elapsed_ms = tonumber(result.elapsed_ms) or elapsed_ms,
      effective_sample_rate = tonumber(result.effective_sample_rate) or 0,
      read_ms = tonumber(result.read_ms) or 0,
      write_ms = tonumber(result.write_ms) or 0,
      ops = tonumber(result.ops) or 0,
    }
  end

  return raw, {
    raw_bytes = tonumber(result.bytes) or convert.raw_bytes or 0,
    output_bytes = #raw,
    record_elapsed_ms = tonumber(result.elapsed_ms) or elapsed_ms,
    effective_sample_rate = tonumber(result.effective_sample_rate) or 0,
    read_ms = tonumber(result.read_ms) or 0,
    write_ms = tonumber(result.write_ms) or 0,
    ops = tonumber(result.ops) or 0,
    bridge_sample_rate = tonumber(options.bridge_sample_rate or options.sample_rate) or 16000,
    bridge_bits = tonumber(options.bridge_bits) or 16,
    bridge_channels = 1,
  }
end

function M.post_bridge_chat(base_url, raw, options, callback)
  options = options or {}
  if not http or not http.post then
    return false, "http.post missing"
  end
  local base = tostring(base_url or "")
  if base == "" then
    return false, "bridge url missing"
  end
  if base:sub(-1) == "/" then base = base:sub(1, -2) end
  local headers = {
    ["Content-Type"] = "application/octet-stream",
    ["X-Audio-Format"] = "pcm_s16le",
    ["X-Sample-Rate"] = tostring(tonumber(options.sample_rate or options.bridge_sample_rate) or 16000),
    ["X-Audio-Bits"] = tostring(tonumber(options.bits or options.bridge_bits) or 16),
    ["X-Audio-Channels"] = tostring(tonumber(options.channels or options.bridge_channels) or 1),
    ["X-Reply-Limit"] = tostring(tonumber(options.reply_limit) or 100),
  }
  http.post(base .. "/api/chat", {
    headers = headers,
    timeout = tonumber(options.timeout_ms) or 35000,
  }, raw or "", callback)
  return true, nil
end

return M
