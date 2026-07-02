print("[smoke_camera] start")

local ok, loaded_camera = pcall(require, "camera")
if ok and type(loaded_camera) == "table" then
  camera = loaded_camera
end

if type(camera) == "table" and type(camera.preview_start) == "function" then
  local started, preview_err = camera.preview_start()
  if started then
    local preview_timer = tmr.create()
    preview_timer:alarm(500, tmr.ALARM_AUTO, function()
      if app and app.exiting and app.exiting() then
        if camera.preview_stop then
          camera.preview_stop()
        end
        if camera.stop then
          camera.stop()
        end
        preview_timer:stop()
      end
    end)
    return
  end
  print("[smoke_camera] preview_start failed: " .. tostring(preview_err or "unknown"))
end

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x111827)

local title = lv_label_create(root)
lv_label_set_text(title, "Camera Smoke")
lv_obj_set_style_text_color(title, 0xf9fafb)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 12)

local status_label = lv_label_create(root)
lv_obj_set_width(status_label, 300)
lv_obj_set_style_text_color(status_label, 0xd1d5db)
lv_obj_align(status_label, LV_ALIGN_CENTER, 0, 8)

local metrics = {
  camera_ready = false,
  captures = 0,
  width = 0,
  height = 0,
  format = "",
  frame_bytes = 0,
  saved_frame = false,
  saved_bytes = 0,
  save_error = "",
  preview = false,
  preview_mode = "",
  preview_width = 0,
  preview_height = 0,
  capture_error = "",
  preview_error = "",
  phase = "boot",
}
local preview_active = false
local metrics_dirty = true
local WRITE_SD_METRICS = false

local function json_escape(value)
  return tostring(value or ""):gsub("\\", "\\\\"):gsub("\"", "\\\""):gsub("\n", "\\n")
end

local function write_metrics(force)
  if not WRITE_SD_METRICS then
    return
  end
  if not force and preview_active then
    return
  end
  if not force and not metrics_dirty then
    return
  end
  local body = "{"
    .. "\"camera_ready\":" .. tostring(metrics.camera_ready) .. ","
    .. "\"captures\":" .. tostring(metrics.captures) .. ","
    .. "\"width\":" .. tostring(metrics.width) .. ","
    .. "\"height\":" .. tostring(metrics.height) .. ","
    .. "\"format\":\"" .. json_escape(metrics.format) .. "\","
    .. "\"frame_bytes\":" .. tostring(metrics.frame_bytes) .. ","
    .. "\"saved_frame\":" .. tostring(metrics.saved_frame) .. ","
    .. "\"saved_bytes\":" .. tostring(metrics.saved_bytes) .. ","
    .. "\"save_error\":\"" .. json_escape(metrics.save_error) .. "\","
    .. "\"preview\":" .. tostring(metrics.preview) .. ","
    .. "\"preview_mode\":\"" .. json_escape(metrics.preview_mode) .. "\","
    .. "\"preview_width\":" .. tostring(metrics.preview_width) .. ","
    .. "\"preview_height\":" .. tostring(metrics.preview_height) .. ","
    .. "\"capture_error\":\"" .. json_escape(metrics.capture_error) .. "\","
    .. "\"preview_error\":\"" .. json_escape(metrics.preview_error) .. "\","
    .. "\"phase\":\"" .. json_escape(metrics.phase) .. "\""
    .. "}\n"
  if file and file.putcontents then
    file.putcontents("metrics.json", body)
  elseif file and file.write then
    file.write("metrics.json", body)
  end
  metrics_dirty = false
end

local function render()
  write_metrics()
  if preview_active then
    return
  end

  local lines = {
    "ready: " .. tostring(metrics.camera_ready),
    "captures: " .. tostring(metrics.captures),
    "size: " .. tostring(metrics.width) .. "x" .. tostring(metrics.height),
    "format: " .. tostring(metrics.format),
    "bytes: " .. tostring(metrics.frame_bytes),
    "saved: " .. tostring(metrics.saved_frame),
    "save error: " .. tostring(metrics.save_error),
    "preview: " .. tostring(metrics.preview),
    "preview mode: " .. tostring(metrics.preview_mode),
    "preview size: " .. tostring(metrics.preview_width) .. "x" .. tostring(metrics.preview_height),
    "phase: " .. tostring(metrics.phase),
    "capture error: " .. tostring(metrics.capture_error),
    "preview error: " .. tostring(metrics.preview_error),
  }
  lv_label_set_text(status_label, table.concat(lines, "\n"))
end

local function capture_once()
  if not metrics.camera_ready then
    render()
    return false
  end

  metrics.phase = "capture"
  metrics_dirty = true
  local frame, capture_err = camera.capture()
  if not frame then
    metrics.capture_error = tostring(capture_err or "capture failed")
    metrics_dirty = true
    render()
    return false
  end

  metrics.captures = metrics.captures + 1
  metrics.width = tonumber(frame.width) or 0
  metrics.height = tonumber(frame.height) or 0
  metrics.format = tostring(frame.format or "")
  metrics.frame_bytes = tonumber(frame.len) or 0
  metrics.capture_error = ""
  metrics_dirty = true

  if false and not metrics.saved_frame and type(camera.save) == "function" then
    local save_ok, save_result, save_bytes = pcall(function()
      return camera.save(frame, "frame.rgb565")
    end)
    if save_ok and save_result then
      metrics.saved_frame = true
      metrics.saved_bytes = tonumber(save_bytes) or metrics.frame_bytes
      metrics.save_error = ""
    else
      metrics.save_error = tostring(save_result or "save failed")
    end
  elseif not metrics.saved_frame then
    metrics.save_error = "camera.save unavailable"
  end

  if type(camera.draw) == "function" then
    local draw_ok, draw_result = pcall(function()
      return camera.draw(frame)
    end)
    if draw_ok and draw_result then
      preview_active = true
      metrics.preview = true
      metrics.preview_error = ""
    else
      metrics.preview = false
      metrics.preview_error = tostring(draw_result or "draw failed")
    end
  else
    metrics.preview = false
    metrics.preview_error = "camera.draw unavailable"
  end

  if camera.release then
    camera.release(frame)
  end
  metrics.phase = "captured"
  metrics_dirty = true
  render()
  return true
end

local function start_native_preview()
  metrics.phase = "preview_starting"
  metrics_dirty = true
  render()

  local preview_ok, preview_result = pcall(function()
    return camera.preview_start()
  end)
  if preview_ok and preview_result then
    local status = {}
    if camera.status then
      local status_ok, status_result = pcall(function()
        return camera.status()
      end)
      if status_ok and type(status_result) == "table" then
        status = status_result
      end
    end
    metrics.camera_ready = true
    metrics.width = tonumber(status.preview_width or status.width) or 320
    metrics.height = tonumber(status.preview_height or status.height) or 240
    metrics.format = "rgb565"
    metrics.preview = true
    metrics.preview_mode = tostring(status.preview_mode or "")
    metrics.preview_width = tonumber(status.preview_width) or metrics.width
    metrics.preview_height = tonumber(status.preview_height) or metrics.height
    metrics.preview_error = ""
    metrics.phase = "previewing"
    preview_active = true
  else
    metrics.preview = false
    metrics.preview_error = tostring(preview_result or "camera.preview_start failed")
    metrics.phase = "preview_failed"
  end
  metrics_dirty = true
  render()
  return preview_active
end

ok, loaded_camera = pcall(require, "camera")
if ok and type(loaded_camera) == "table" then
  camera = loaded_camera
end

if type(camera) ~= "table" or (type(camera.preview_start) ~= "function" and type(camera.start) ~= "function") then
  metrics.phase = "missing"
  metrics.capture_error = "camera module missing"
  metrics_dirty = true
  render()
  return
end

metrics.phase = "starting"
metrics_dirty = true
render()

if type(camera.preview_start) == "function" then
  start_native_preview()
else
  local started, start_err = camera.start({
    width = 320,
    height = 240,
    format = "rgb565",
  })
  if not started then
    metrics.phase = "start_failed"
    metrics.capture_error = tostring(start_err or "camera.start failed")
    metrics_dirty = true
    render()
  else
    metrics.camera_ready = true
    metrics.phase = "started"
    metrics_dirty = true
    render()
    capture_once()
  end
end

local timer = tmr.create()
timer:alarm(500, tmr.ALARM_AUTO, function()
  if app and app.exiting and app.exiting() then
    if camera and camera.preview_stop then
      camera.preview_stop()
    end
    if camera and camera.stop then
      camera.stop()
    end
    timer:stop()
    return
  end
  if not metrics.camera_ready then
    render()
    return
  end

  if preview_active then
    return
  end

  capture_once()
end)
