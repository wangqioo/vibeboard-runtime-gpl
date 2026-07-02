print("[camera] start")

local ok, loaded_camera = pcall(require, "camera")
if ok and type(loaded_camera) == "table" then
  camera = loaded_camera
end

APP = {
  PHOTO_DIR = "photos",
  METRICS_PATH = "metrics.json",
  MAX_WEB_PHOTOS = 3,
  captures = 0,
  next_index = 1,
  running = true,
  capturing = false,
  preview = false,
  preview_mode = "",
  preview_width = 0,
  preview_height = 0,
  last_photo = "",
  last_bytes = 0,
  last_error = "",
  last_trigger = "",
  routes = {},
  ui = {},
  key_events = 0,
  touch_events = 0,
  pending_capture = "",
}
APP.PHOTO_DIR = "photos"

local function text(value)
  if value == nil then return "" end
  return tostring(value)
end

local function json_escape(value)
  return text(value):gsub("\\", "\\\\"):gsub("\"", "\\\""):gsub("\n", "\\n")
end

local function html_escape(value)
  return text(value)
    :gsub("&", "&amp;")
    :gsub("<", "&lt;")
    :gsub(">", "&gt;")
    :gsub("\"", "&quot;")
end

local function write_metrics()
  if not file or not file.putcontents then
    return
  end
  if APP.preview then
    return
  end
  local body = "{"
    .. "\"captures\":" .. tostring(APP.captures) .. ","
    .. "\"preview\":" .. tostring(APP.preview) .. ","
    .. "\"preview_mode\":\"" .. json_escape(APP.preview_mode) .. "\","
    .. "\"preview_width\":" .. tostring(APP.preview_width) .. ","
    .. "\"preview_height\":" .. tostring(APP.preview_height) .. ","
    .. "\"last_photo\":\"" .. json_escape(APP.last_photo) .. "\","
    .. "\"last_bytes\":" .. tostring(APP.last_bytes) .. ","
    .. "\"last_trigger\":\"" .. json_escape(APP.last_trigger) .. "\","
    .. "\"key_events\":" .. tostring(APP.key_events) .. ","
    .. "\"touch_events\":" .. tostring(APP.touch_events) .. ","
    .. "\"pending_capture\":\"" .. json_escape(APP.pending_capture) .. "\","
    .. "\"last_error\":\"" .. json_escape(APP.last_error) .. "\""
    .. "}\n"
  pcall(function() file.putcontents(APP.METRICS_PATH, body) end)
end

local function set_status(message)
  print("[camera] " .. text(message))
  if APP.ui.status and lv_label_set_text then
    pcall(function() lv_label_set_text(APP.ui.status, text(message)) end)
  end
  write_metrics()
end

local function refresh_preview_status()
  if not camera or not camera.status then
    return
  end
  local ok_status, status = pcall(function() return camera.status() end)
  if not ok_status or type(status) ~= "table" then
    return
  end
  APP.preview_mode = text(status.preview_mode)
  APP.preview_width = tonumber(status.preview_width or status.width) or 0
  APP.preview_height = tonumber(status.preview_height or status.height) or 0
end

local function set_overlay(enabled)
  if camera and type(camera.overlay) == "function" then
    pcall(function() camera.overlay(enabled) end)
  end
end

local function build_ui()
  if not lv_scr_act or not lv_label_create then
    return
  end
  local root = lv_scr_act()
  lv_obj_clean(root)
  lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
  lv_obj_set_style_bg_color(root, 0x07111f)

  APP.ui.title = lv_label_create(root)
  lv_label_set_text(APP.ui.title, "Camera")
  lv_obj_set_style_text_color(APP.ui.title, 0xf8fafc)
  lv_obj_align(APP.ui.title, LV_ALIGN_TOP_MID, 0, 10)

  APP.ui.status = lv_label_create(root)
  lv_label_set_text(APP.ui.status, "starting preview")
  lv_obj_set_width(APP.ui.status, 300)
  lv_obj_set_style_text_color(APP.ui.status, 0x7dd3fc)
  lv_obj_align(APP.ui.status, LV_ALIGN_CENTER, 0, 0)

  APP.ui.footer = lv_label_create(root)
  lv_label_set_text(APP.ui.footer, "short HOME/touch: capture  long HOME: exit")
  lv_obj_set_width(APP.ui.footer, 310)
  lv_obj_set_style_text_color(APP.ui.footer, 0xcbd5e1)
  lv_obj_align(APP.ui.footer, LV_ALIGN_BOTTOM_LEFT, 5, -10)
end

local function list_photos()
  local result = {}
  if not file or not file.listdir then
    return result
  end
  local ok_list, entries = pcall(function() return file.listdir(APP.PHOTO_DIR) end)
  if not ok_list or type(entries) ~= "table" then
    return result
  end
  for _, entry in ipairs(entries) do
    local name = text(entry.name)
    if entry.is_file and name:match("^capture_%d+%.bmp$") then
      local index = tonumber(name:match("^capture_(%d+)%.bmp$")) or 0
      if index >= APP.next_index then
        APP.next_index = index + 1
      end
      result[#result + 1] = {
        name = name,
        size = tonumber(entry.size) or 0,
        index = index,
      }
    end
  end
  table.sort(result, function(a, b) return (a.index or 0) > (b.index or 0) end)
  return result
end

local function photo_url(name)
  return "/apps/file?app=camera&path=photos/" .. name
end

local function start_preview()
  local previous_error = APP.last_error
  local start_fn = camera and (camera.preview_start_low or camera.preview_start)
  if not camera or type(start_fn) ~= "function" then
    APP.preview = false
    APP.last_error = "camera.preview_start unavailable"
    set_overlay(false)
    build_ui()
    set_status(APP.last_error)
    return false
  end
  local ok_preview, preview_result, preview_err = pcall(function() return start_fn() end)
  if ok_preview and preview_result then
    APP.preview = true
    APP.last_error = previous_error
    refresh_preview_status()
    if camera and type(camera.overlay) == "function" then
      pcall(function() camera.overlay(true) end)
    end
    set_status("preview " .. APP.preview_mode)
    return true
  end
  APP.preview = false
  APP.last_error = text(preview_err or preview_result or "preview failed")
  set_overlay(false)
  build_ui()
  set_status(APP.last_error)
  return false
end

local function stop_camera()
  APP.preview = false
  if camera and type(camera.overlay) == "function" then
    pcall(function() camera.overlay(false) end)
  end
  if camera and camera.stop then
    pcall(function() camera.stop() end)
  end
  refresh_preview_status()
  write_metrics()
end

local function capture_photo(trigger)
  if APP.capturing or not APP.running then
    return false
  end
  if not camera or type(camera.capture) ~= "function" or type(camera.save) ~= "function" then
    APP.last_error = "camera.capture/save unavailable"
    set_status(APP.last_error)
    return false
  end

  APP.capturing = true
  APP.last_trigger = text(trigger)
  APP.last_error = ""
  set_status("capturing")

  local frame, capture_err = camera.capture()
  if not frame then
    APP.last_error = text(capture_err or "capture failed")
    start_preview()
    APP.capturing = false
    set_status(APP.last_error)
    return false
  end

  local cloned = frame
  if camera.clone then
    local clone_result, clone_err = camera.clone(frame)
    if not clone_result then
      camera.release(frame)
      APP.last_error = text(clone_err or "clone failed")
      start_preview()
      APP.capturing = false
      set_status(APP.last_error)
      return false
    end
    cloned = clone_result
  end
  camera.release(frame)

  local paused_preview = APP.preview
  if paused_preview and camera.stop then
    set_overlay(false)
    print("[camera] stopping preview for save")
    pcall(function() camera.stop() end)
    print("[camera] stopped preview for save")
    APP.preview = false
  end

  local filename = string.format("capture_%06d.bmp", APP.next_index)
  local path = APP.PHOTO_DIR .. "/" .. filename
  print("[camera] saving " .. path)
  local save_ok, save_result, save_detail = pcall(function()
    return camera.save(cloned, path)
  end)
  print("[camera] save returned")

  if save_ok and save_result then
    APP.captures = APP.captures + 1
    APP.next_index = APP.next_index + 1
    APP.last_photo = filename
    APP.last_bytes = tonumber(save_detail) or 0
    APP.last_error = ""
    set_status("saved " .. filename)
  else
    APP.last_error = text(save_detail or save_result or "save failed")
    set_status(APP.last_error)
  end

  if paused_preview or not APP.preview then
    print("[camera] restarting preview")
    start_preview()
    print("[camera] restarted preview")
  end
  APP.capturing = false
  write_metrics()
  return save_ok and save_result and true or false
end

local function request_capture(trigger)
  if APP.capturing then
    return false, "busy"
  end
  APP.pending_capture = text(trigger)
  set_status("queued capture")
  return true
end

local function route_index(_req)
  local photos = list_photos()
  local latest = APP.last_photo
  if latest == "" and photos[1] then
    latest = photos[1].name
  end
  local link = latest ~= "" and ('<a href="' .. photo_url(latest) .. '">' .. html_escape(latest) .. '</a>') or "none"
  local body = "<html><body><h3>Camera</h3><p>last:" .. link .. "</p><p>captures:"
    .. tostring(APP.captures) .. "</p><p><a href=\"/app/api\">api</a></p></body></html>"
  return {
    status = 200,
    type = "text/html; charset=utf-8",
    body = body,
  }
end

local function route_api(_req)
  return {
    status = 200,
    type = "application/json",
    body = "{"
      .. "\"ok\":true,"
      .. "\"captures\":" .. tostring(APP.captures) .. ","
      .. "\"preview\":" .. tostring(APP.preview) .. ","
      .. "\"mode\":\"" .. json_escape(APP.preview_mode) .. "\","
      .. "\"last\":\"" .. json_escape(APP.last_photo) .. "\","
      .. "\"bytes\":" .. tostring(APP.last_bytes) .. ","
      .. "\"key_events\":" .. tostring(APP.key_events) .. ","
      .. "\"touch_events\":" .. tostring(APP.touch_events) .. ","
      .. "\"pending\":\"" .. json_escape(APP.pending_capture) .. "\","
      .. "\"error\":\"" .. json_escape(APP.last_error) .. "\""
      .. "}\n",
  }
end

local function route_capture(_req)
  local ok_capture, capture_err = request_capture("web")
  return {
    status = ok_capture and 202 or 409,
    type = "application/json",
    body = "{"
      .. "\"ok\":" .. tostring(ok_capture) .. ","
      .. "\"captures\":" .. tostring(APP.captures) .. ","
      .. "\"last\":\"" .. json_escape(APP.last_photo) .. "\","
      .. "\"bytes\":" .. tostring(APP.last_bytes) .. ","
      .. "\"pending\":\"" .. json_escape(APP.pending_capture) .. "\","
      .. "\"error\":\"" .. json_escape(capture_err or APP.last_error) .. "\""
      .. "}\n",
  }
end

local function dispatch_route(req)
  local path = text(req and req.path)
  local handler = APP.routes[path] or route_index
  return handler(req)
end

local function register_webui()
  APP.routes["/"] = route_index
  APP.routes["/api"] = route_api
  APP.routes["/capture"] = route_capture
  if app and app.set_webui then
    pcall(function() app.set_webui(true) end)
  end
  if app and app.route then
    pcall(function() app.route("/", dispatch_route) end)
    pcall(function() app.route("/api", dispatch_route) end)
    pcall(function() app.route("/capture", dispatch_route) end)
  end
end

local function exit_app()
  APP.running = false
  stop_camera()
  if key and key.off then
    pcall(function() key.off(key.HOME) end)
  end
  if app and app.set_home_exit then
    pcall(function() app.set_home_exit(true) end)
  end
  if app and app.set_webui then
    pcall(function() app.set_webui(false) end)
  end
  if app and app.exit then
    pcall(function() app.exit("camera exit") end)
  end
end

local function register_input()
  if app and app.set_home_exit then
    pcall(function() app.set_home_exit(false) end)
  end
  if key and key.on and key.HOME then
    key.on(function(evt_code, evt_type, _ts_ms)
      APP.key_events = APP.key_events + 1
      print("[camera] key code=" .. tostring(evt_code) .. " event=" .. tostring(evt_type))
      write_metrics()
      if evt_code ~= key.HOME then
        return
      end
      if evt_type == key.LONG_START or evt_type == key.EXIT then
        exit_app()
      else
        request_capture("home")
      end
    end)
  end
  if touch and touch.on then
    touch.on(function(evt, _x, _y, _ts_ms)
      APP.touch_events = APP.touch_events + 1
      write_metrics()
      if evt == touch.UP then
        request_capture("touch")
      end
    end)
  end
end

if file and file.mkdir then
  pcall(function() file.mkdir(APP.PHOTO_DIR) end)
end
list_photos()
register_webui()
register_input()
write_metrics()
start_preview()

local watchdog = tmr.create()
watchdog:alarm(500, tmr.ALARM_AUTO, function()
  if app and app.exiting and app.exiting() then
    watchdog:stop()
    exit_app()
    return
  end

  if APP.pending_capture ~= "" and not APP.capturing then
    local trigger = APP.pending_capture
    APP.pending_capture = ""
    capture_photo(trigger)
  end
end)

print("[camera] ready")
