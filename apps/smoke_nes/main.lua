print("[smoke_nes] start")

local nes = require("nes")

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x101820)

local title = lv_label_create(root)
lv_label_set_text(title, "NES Smoke")
lv_obj_set_style_text_color(title, 0xf9fafb)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 12)

local status_label = lv_label_create(root)
lv_label_set_text(status_label, "checking native module")
lv_obj_set_style_text_color(status_label, 0xd1d5db)
lv_obj_set_width(status_label, 292)
lv_obj_align(status_label, LV_ALIGN_CENTER, 0, 0)

local metrics_timer = nil
local retry_start_timer = nil
local rom_path = "/sdcard/apps/smoke_nes/roms/smoke.nes"

local function append(lines, label, value)
  lines[#lines + 1] = label .. ": " .. tostring(value)
end

local function json_escape(value)
  return tostring(value or ""):gsub("\\", "\\\\"):gsub("\"", "\\\""):gsub("\n", "\\n")
end

local function write_metrics(fields)
  if not file or not file.write then return end
  fields = fields or {}
  local metrics = "{"
    .. "\"ok\":" .. tostring(fields.ok ~= false) .. ","
    .. "\"rom_path\":\"" .. json_escape(fields.rom_path or "/sdcard/apps/smoke_nes/roms/smoke.nes") .. "\","
    .. "\"rom_present\":" .. tostring(fields.rom_present == true) .. ","
    .. "\"started\":" .. tostring(fields.started == true) .. ","
    .. "\"running\":" .. tostring(fields.running == true) .. ","
    .. "\"status\":\"" .. json_escape(fields.status or "") .. "\","
    .. "\"frames\":" .. tostring(fields.frames or 0) .. ","
    .. "\"rendered_frames\":" .. tostring(fields.rendered_frames or fields.frames or 0) .. ","
    .. "\"display_stream_supported\":" .. tostring(fields.display_stream_supported == true) .. ","
    .. "\"host_gamepad_active\":" .. tostring(fields.host_gamepad_active == true) .. ","
    .. "\"host_gamepad_mask\":" .. tostring(fields.host_gamepad_mask or 0) .. ","
    .. "\"audio_requested\":" .. tostring(fields.audio_requested == true) .. ","
    .. "\"audio_active\":" .. tostring(fields.audio_active == true) .. ","
    .. "\"audio_backend\":\"" .. json_escape(fields.audio_backend or "") .. "\","
    .. "\"audio_error\":\"" .. json_escape(fields.audio_error or "") .. "\","
    .. "\"audio_apu_task_present\":" .. tostring(fields.audio_apu_task_present == true) .. ","
    .. "\"audio_apu_task_started\":" .. tostring(fields.audio_apu_task_started == true) .. ","
    .. "\"audio_apu_task_exited\":" .. tostring(fields.audio_apu_task_exited == true) .. ","
    .. "\"audio_apu_task_ret\":" .. tostring(fields.audio_apu_task_ret or -1) .. ","
    .. "\"audio_apu_ticks\":" .. tostring(fields.audio_apu_ticks or 0) .. ","
    .. "\"audio_sink_calls\":" .. tostring(fields.audio_sink_calls or 0) .. ","
    .. "\"audio_sink_frames\":" .. tostring(fields.audio_sink_frames or 0) .. ","
    .. "\"audio_written_bytes\":" .. tostring(fields.audio_written_bytes or 0) .. ","
    .. "\"audio_queued_bytes\":" .. tostring(fields.audio_queued_bytes or 0) .. ","
    .. "\"audio_dropped_bytes\":" .. tostring(fields.audio_dropped_bytes or 0) .. ","
    .. "\"audio_bytes\":" .. tostring(fields.audio_bytes or 0) .. ","
    .. "\"last_error\":\"" .. json_escape(fields.last_error or "") .. "\""
    .. "}"
  file.write("metrics.json", metrics)
end

local function compact_metrics_json(fields)
  fields = fields or {}
  local status = fields.status or ""
  local audio_backend = fields.audio_backend or ""
  local audio_error = fields.audio_error or ""
  local last_error = fields.last_error or ""
  return "{"
    .. "\"ok\":" .. tostring(fields.ok ~= false) .. ","
    .. "\"rom_present\":" .. tostring(fields.rom_present == true) .. ","
    .. "\"started\":" .. tostring(fields.started == true) .. ","
    .. "\"running\":" .. tostring(fields.running == true) .. ","
    .. "\"status\":\"" .. json_escape(status) .. "\","
    .. "\"frames\":" .. tostring(fields.frames or 0) .. ","
    .. "\"rendered_frames\":" .. tostring(fields.rendered_frames or fields.frames or 0) .. ","
    .. "\"audio_bytes\":" .. tostring(fields.audio_bytes or 0) .. ","
    .. "\"audio_backend\":\"" .. json_escape(audio_backend) .. "\","
    .. "\"audio_error\":\"" .. json_escape(audio_error) .. "\","
    .. "\"host_gamepad_active\":" .. tostring(fields.host_gamepad_active == true) .. ","
    .. "\"host_gamepad_mask\":" .. tostring(fields.host_gamepad_mask or 0) .. ","
    .. "\"last_error\":\"" .. json_escape(last_error) .. "\""
    .. "}"
end

local function state_metrics()
  local ok, state = pcall(function()
    return nes.state()
  end)
  if not ok or type(state) ~= "table" then
    return {
      ok = false,
      rom_present = false,
      started = false,
      running = false,
      status = "state_error",
      last_error = tostring(state or "nes.state failed"),
    }
  end

  local frames = state.rendered_frames or state.core_rendered_frames or state.core_frames or state.frames or 0
  local audio_written_bytes = state.audio_written_bytes or 0
  local audio_queued_bytes = state.audio_queued_bytes or 0
  local audio_bytes = audio_written_bytes > 0 and audio_written_bytes or audio_queued_bytes or 0
  return {
    ok = true,
    rom_present = true,
    started = state.status ~= "idle",
    running = state.running == true,
    status = state.status,
    frames = frames,
    rendered_frames = frames,
    audio_bytes = audio_bytes,
    audio_backend = state.audio_backend,
    audio_error = state.audio_error,
    host_gamepad_active = state.host_gamepad_active,
    host_gamepad_mask = state.host_gamepad_mask,
    last_error = state.core_last_error or state.last_error or "",
  }
end

local function update_running_metrics(rom_path)
  local running_state = nes.state()
  local running_lines = {}
  append(running_lines, "rom", rom_path)
  append(running_lines, "status", running_state and running_state.status)
  append(running_lines, "running", running_state and running_state.running)
  append(running_lines, "frames", running_state and (running_state.core_frames or running_state.frames))
  append(running_lines, "display", running_state and running_state.display_stream_supported)
  append(running_lines, "host_gamepad", running_state and running_state.host_gamepad_mask)
  append(running_lines, "audio", running_state and running_state.audio_active)
  append(running_lines, "audio_backend", running_state and running_state.audio_backend)
  append(running_lines, "audio_error", running_state and running_state.audio_error)
  local pcm = nil
  local audio_ok, audio_result = pcall(function()
    return nes.read_audio(1024)
  end)
  if audio_ok then
    pcm = audio_result
  end
  local frames = running_state and (running_state.rendered_frames or running_state.core_rendered_frames or running_state.core_frames or running_state.frames) or 0
  local audio_apu_task_started = running_state and running_state.audio_apu_task_started
  local audio_apu_task_exited = running_state and running_state.audio_apu_task_exited
  local audio_apu_task_present = running_state and running_state.audio_apu_task_present
  local audio_apu_task_ret = running_state and running_state.audio_apu_task_ret
  local audio_apu_ticks = running_state and running_state.audio_apu_ticks or 0
  local audio_sink_calls = running_state and running_state.audio_sink_calls or 0
  local audio_sink_frames = running_state and running_state.audio_sink_frames or 0
  local audio_written_bytes = running_state and running_state.audio_written_bytes or 0
  local audio_queued_bytes = running_state and running_state.audio_queued_bytes or 0
  local audio_dropped_bytes = running_state and running_state.audio_dropped_bytes or 0
  local pcm_bytes = pcm and #pcm or 0
  local audio_bytes = pcm_bytes > 0 and pcm_bytes or audio_written_bytes or audio_queued_bytes or 0
  write_metrics({
    ok = true,
    rom_path = rom_path,
    rom_present = true,
    started = true,
    running = running_state and running_state.running == true,
    status = running_state and running_state.status,
    frames = frames,
    rendered_frames = frames,
    display_stream_supported = running_state and running_state.display_stream_supported,
    host_gamepad_active = running_state and running_state.host_gamepad_active,
    host_gamepad_mask = running_state and running_state.host_gamepad_mask,
    audio_requested = running_state and running_state.audio_requested,
    audio_active = running_state and running_state.audio_active,
    audio_backend = running_state and running_state.audio_backend,
    audio_error = running_state and running_state.audio_error,
    audio_apu_task_present = audio_apu_task_present,
    audio_apu_task_started = audio_apu_task_started,
    audio_apu_task_exited = audio_apu_task_exited,
    audio_apu_task_ret = audio_apu_task_ret,
    audio_apu_ticks = audio_apu_ticks,
    audio_sink_calls = audio_sink_calls,
    audio_sink_frames = audio_sink_frames,
    audio_written_bytes = audio_written_bytes,
    audio_queued_bytes = audio_queued_bytes,
    audio_dropped_bytes = audio_dropped_bytes,
    audio_bytes = audio_bytes,
    last_error = running_state and (running_state.core_last_error or running_state.last_error) or "",
  })
  append(running_lines, "audio_bytes", audio_bytes)
  append(running_lines, "audio_task", tostring(audio_apu_task_present) .. "/" .. tostring(audio_apu_task_started) .. "/" .. tostring(audio_apu_task_exited))
  append(running_lines, "audio_task_ret", audio_apu_task_ret)
  append(running_lines, "audio_ticks", audio_apu_ticks)
  append(running_lines, "audio_sink", audio_sink_calls)
  append(running_lines, "audio_written", audio_written_bytes)
  append(running_lines, "audio_queued", audio_queued_bytes)
  append(running_lines, "error", running_state and (running_state.core_last_error or running_state.last_error))
  lv_label_set_text(status_label, "OK\n" .. table.concat(running_lines, "\n"))
  print(
    "[smoke_nes] running",
    running_state and running_state.status,
    running_state and running_state.core_frames,
    "audio_bytes",
    pcm and #pcm or 0
  )
end

local function start_nes()
  return nes.start(rom_path, {
    fps = 60,
    task_stack = 12288,
    task_priority = 3,
    task_core = -1,
    transfer_rows = 16,
    audio = {
      enabled = true,
      lua_fallback = false,
      sample_rate = 22050,
      channels = 1,
      bits_per_sample = 16,
      queue_bytes = 32768,
    },
  })
end

local function finish_failed_start(ok, lines, start_err)
  local err_text = tostring(start_err or "")
  if err_text:find("open rom failed", 1, true) then
    append(lines, "rom", "copy test ROM to " .. rom_path)
  else
    ok = false
  end
  write_metrics({
    ok = ok,
    rom_path = rom_path,
    rom_present = false,
    started = false,
    running = false,
    status = "no_rom",
    last_error = err_text,
  })

  lv_label_set_text(status_label, (ok and "OK\n" or "FAIL\n") .. table.concat(lines, "\n"))
  print("[smoke_nes]", ok and "ok" or "fail", tostring(start_err))
end

local function finish_started()
  write_metrics({ ok = true, rom_path = rom_path, rom_present = true, started = true, status = "started" })
  metrics_timer = tmr.create()
  metrics_timer:alarm(1000, tmr.ALARM_AUTO, function()
    update_running_metrics(rom_path)
  end)
end

local function try_start(attempt)
  local ok = true
  local lines = {}
  write_metrics({ ok = true, rom_path = rom_path, status = "checking" })

  local state = nes.state()
  append(lines, "state", state and state.status)
  if type(state) ~= "table" or state.running ~= false then
    ok = false
  end

  local mask = nes.BTN_A | nes.BTN_START
  local input_ok = nes.input and nes.input.set_mask and nes.input.set_mask(nes.PLAYER_1, mask)
  local clear_ok = nes.input and nes.input.clear and nes.input.clear(nes.PLAYER_1)
  append(lines, "input", input_ok and clear_ok)
  if not input_ok or not clear_ok then
    ok = false
  end

  local start_ok, start_err = start_nes()
  append(lines, "start", tostring(start_ok) .. " " .. tostring(start_err))
  if start_ok then
    finish_started()
    return
  end

  local err_text = tostring(start_err or "")
  if attempt < 1 and err_text:find("open rom failed", 1, true) then
    append(lines, "retry", "open rom failed")
    write_metrics({
      ok = true,
      rom_path = rom_path,
      rom_present = false,
      started = false,
      running = false,
      status = "retry_open_rom",
      last_error = err_text,
    })
    lv_label_set_text(status_label, "OK\n" .. table.concat(lines, "\n"))
    retry_start_timer = tmr.create()
    retry_start_timer:alarm(500, tmr.ALARM_SINGLE, function()
      try_start(1)
    end)
    return
  end

  finish_failed_start(ok, lines, start_err)
end

try_start(0)
