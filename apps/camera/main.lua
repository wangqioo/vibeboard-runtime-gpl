print("[camera] start")

local ok, loaded_camera = pcall(require, "camera")
if ok and type(loaded_camera) == "table" then
  camera = loaded_camera
end

APP = {
  PHOTO_DIR = "/sd/data/camera/photos",
  METRICS_PATH = "metrics.json",
  SHUTTER_HIT_X = 108,
  SHUTTER_HIT_Y = 192,
  SHUTTER_HIT_W = 104,
  SHUTTER_HIT_H = 48,
  GALLERY_THUMB_HIT_X = 0,
  GALLERY_THUMB_HIT_Y = 192,
  GALLERY_THUMB_HIT_W = 78,
  GALLERY_THUMB_HIT_H = 48,
  GALLERY_BACK_HIT_X = 108,
  GALLERY_BACK_HIT_Y = 192,
  GALLERY_BACK_HIT_W = 104,
  GALLERY_BACK_HIT_H = 48,
  GALLERY_DELETE_HIT_X = 242,
  GALLERY_DELETE_HIT_Y = 192,
  GALLERY_DELETE_HIT_W = 78,
  GALLERY_DELETE_HIT_H = 48,
  CAMERA_PHOTO_W = 160,
  CAMERA_PHOTO_H = 120,
  MAX_WEB_PHOTOS = 1,
  mode = "camera",
  gallery_index = 1,
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
  photos = {},
  key_events = 0,
  touch_events = 0,
  pending_capture = "",
  pending_delete = "",
}
APP.PHOTO_DIR = "/sd/data/camera/photos"

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

local function url_decode(value)
  local raw = text(value):gsub("+", " ")
  raw = raw:gsub("%%(%x%x)", function(hex)
    return string.char(tonumber(hex, 16) or 0)
  end)
  return raw
end

local function parse_query(query)
  local result = {}
  for pair in text(query):gmatch("[^&]+") do
    local key, value = pair:match("^([^=]*)=?(.*)$")
    if key and key ~= "" then
      result[url_decode(key)] = url_decode(value or "")
    end
  end
  return result
end

local function is_photo_name(name)
  return type(name) == "string" and name:match("^capture_%d+%.bmp$") ~= nil
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
    .. "\"pending_delete\":\"" .. json_escape(APP.pending_delete) .. "\","
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

local function set_label(obj, value)
  if obj and lv_label_set_text then
    pcall(function() lv_label_set_text(obj, text(value)) end)
  end
end

local function style_text(obj, color)
  if not obj then return end
  if lv_obj_set_style_text_color then
    pcall(function() lv_obj_set_style_text_color(obj, color, 0) end)
  end
end

local function style_panel(obj, color)
  if not obj then return end
  if lv_obj_set_style_bg_color then pcall(function() lv_obj_set_style_bg_color(obj, color, 0) end) end
  if lv_obj_set_style_bg_opa then pcall(function() lv_obj_set_style_bg_opa(obj, 255, 0) end) end
  if lv_obj_set_style_border_width then pcall(function() lv_obj_set_style_border_width(obj, 0, 0) end) end
  if lv_obj_set_style_pad_all then pcall(function() lv_obj_set_style_pad_all(obj, 0, 0) end) end
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

local function clear_lvgl_for_camera_preview()
  if not lv_scr_act or not lv_obj_clean then
    return
  end
  local root = lv_scr_act()
  lv_obj_clean(root)
  if lv_obj_clear_flag and LV_OBJ_FLAG_SCROLLABLE then
    lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
  end
  APP.ui = {}
end

local function list_photos()
  local result = {}
  if APP.preview then
    return APP.photos
  end
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
  APP.photos = result
  return result
end

local function refresh_photos_for_gallery()
  local was_preview = APP.preview
  APP.preview = false
  local photos = list_photos()
  APP.preview = was_preview
  return photos
end

local function remember_photo(name, size)
  if not is_photo_name(name) then
    return
  end
  local index = tonumber(name:match("^capture_(%d+)%.bmp$")) or 0
  for _, photo in ipairs(APP.photos) do
    if photo.name == name then
      photo.size = tonumber(size) or photo.size or 0
      photo.index = index
      return
    end
  end
  APP.photos[#APP.photos + 1] = {
    name = name,
    size = tonumber(size) or 0,
    index = index,
  }
  table.sort(APP.photos, function(a, b) return (a.index or 0) > (b.index or 0) end)
end

local function forget_photo(name)
  for index = #APP.photos, 1, -1 do
    if APP.photos[index].name == name then
      table.remove(APP.photos, index)
    end
  end
end

local function photo_url(name)
  return "/sd/file?path=data/camera/photos/" .. name
end

local function download_url(name)
  return photo_url(name)
end

local function delete_url(name)
  return "/app/delete?name=" .. name
end

local function gallery_photo_src(name)
  return "S:/data/camera/photos/" .. name
end

local function try_start_preview()
  local start_fn = camera and (camera.preview_start_low or camera.preview_start)
  if not camera or type(start_fn) ~= "function" then
    return false, nil, "camera.preview_start unavailable"
  end
  return pcall(function() return start_fn() end)
end

local function wrap_gallery_index(index)
  local count = #APP.photos
  if count <= 0 then return 0 end
  while index < 1 do index = index + count end
  while index > count do index = index - count end
  return index
end

local function photos_json(photos, limit)
  local parts = {}
  local max_items = tonumber(limit) or #photos
  for index, photo in ipairs(photos) do
    if index > max_items then
      break
    end
    parts[#parts + 1] = "{"
      .. "\"name\":\"" .. json_escape(photo.name) .. "\","
      .. "\"size\":" .. tostring(photo.size or 0) .. ","
      .. "\"url\":\"" .. json_escape(photo_url(photo.name)) .. "\","
      .. "\"download_url\":\"" .. json_escape(download_url(photo.name)) .. "\","
      .. "\"delete_url\":\"" .. json_escape(delete_url(photo.name)) .. "\""
      .. "}"
  end
  return "[" .. table.concat(parts, ",") .. "]"
end

local function start_preview()
  local previous_error = APP.last_error
  local ok_preview, preview_result, preview_err = try_start_preview()
  if ok_preview and preview_result then
    APP.preview = true
    APP.last_error = previous_error
    clear_lvgl_for_camera_preview()
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
  set_overlay(false)
  if camera and camera.stop then
    pcall(function() camera.stop() end)
  end
  refresh_preview_status()
  write_metrics()
end

local function standby_for_runtime_stop()
  stop_camera()
end

local function delete_photo_by_name(name)
  if not is_photo_name(name) then
    return false, "invalid photo name"
  end
  if not file or type(file.remove) ~= "function" then
    return false, "file.remove unavailable"
  end
  local was_preview = APP.preview
  if was_preview and camera and camera.stop then
    set_overlay(false)
    pcall(function() camera.stop() end)
    APP.preview = false
  end
  local removed, remove_err = file.remove(APP.PHOTO_DIR .. "/" .. name)
  local remove_ok = removed == true
  if remove_ok and name == APP.last_photo then
    APP.last_photo = ""
    APP.last_bytes = 0
  end
  if remove_ok then
    forget_photo(name)
    APP.gallery_index = wrap_gallery_index(APP.gallery_index)
    APP.last_error = ""
  else
    APP.last_error = text(remove_err or removed or "delete failed")
  end
  write_metrics()
  if was_preview then
    start_preview()
  end
  return remove_ok, APP.last_error
end

local function current_gallery_photo()
  if #APP.photos == 0 then return nil end
  APP.gallery_index = wrap_gallery_index(APP.gallery_index)
  return APP.photos[APP.gallery_index]
end

local function draw_gallery_current()
  local photo = current_gallery_photo()
  if not photo then
    set_label(APP.ui.gallery_title, "No photos")
    set_label(APP.ui.gallery_info, "Take a photo first")
    set_label(APP.ui.gallery_delete, "")
    if APP.ui.gallery_image and lv_img_set_src then
      pcall(function() lv_img_set_src(APP.ui.gallery_image, "") end)
    end
    return
  end

  local name = photo.name
  set_label(APP.ui.gallery_title, tostring(APP.gallery_index) .. "/" .. tostring(#APP.photos))
  set_label(APP.ui.gallery_info, name)
  set_label(APP.ui.gallery_delete, "Delete")
  if APP.ui.gallery_image and lv_img_set_src then
    pcall(function() lv_img_set_src(APP.ui.gallery_image, gallery_photo_src(name)) end)
  end
end

local function center_gallery_image()
  if not APP.ui.gallery_image then return end
  local x = math.floor((320 - APP.CAMERA_PHOTO_W) / 2)
  local y = math.floor((192 - APP.CAMERA_PHOTO_H) / 2)
  lv_obj_set_pos(APP.ui.gallery_image, x, y)
  lv_obj_set_size(APP.ui.gallery_image, APP.CAMERA_PHOTO_W, APP.CAMERA_PHOTO_H)
end

local function show_gallery()
  if APP.mode == "gallery" then
    return
  end
  APP.mode = "gallery"
  stop_camera()
  local photos = refresh_photos_for_gallery()
  if APP.last_photo ~= "" then
    for index, photo in ipairs(photos) do
      if photo.name == APP.last_photo then
        APP.gallery_index = index
        break
      end
    end
  else
    APP.gallery_index = 1
  end

  local root = lv_scr_act()
  lv_obj_clean(root)
  lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
  style_panel(root, 0x030712)

  APP.ui.gallery_image = lv_img_create(root)
  if APP.ui.gallery_image and APP.ui.gallery_image ~= 0 then
    center_gallery_image()
    if lv_img_set_antialias then
      pcall(function() lv_img_set_antialias(APP.ui.gallery_image, false) end)
    end
  end

  APP.ui.gallery_bar = lv_obj_create(root)
  lv_obj_set_pos(APP.ui.gallery_bar, 0, 192)
  lv_obj_set_size(APP.ui.gallery_bar, 320, 48)
  style_panel(APP.ui.gallery_bar, 0x000000)

  APP.ui.gallery_title = lv_label_create(root)
  lv_obj_set_pos(APP.ui.gallery_title, 12, 198)
  lv_obj_set_width(APP.ui.gallery_title, 96)
  style_text(APP.ui.gallery_title, 0xf8fafc)

  APP.ui.gallery_info = lv_label_create(root)
  lv_obj_set_pos(APP.ui.gallery_info, 108, 198)
  lv_obj_set_width(APP.ui.gallery_info, 128)
  style_text(APP.ui.gallery_info, 0xcbd5e1)

  APP.ui.gallery_delete = lv_label_create(root)
  lv_obj_set_pos(APP.ui.gallery_delete, 246, 198)
  lv_obj_set_width(APP.ui.gallery_delete, 70)
  style_text(APP.ui.gallery_delete, 0xfca5a5)

  APP.ui.gallery_help = lv_label_create(root)
  lv_label_set_text(APP.ui.gallery_help, "<  sides  >   center back   right delete")
  lv_obj_set_pos(APP.ui.gallery_help, 12, 220)
  lv_obj_set_width(APP.ui.gallery_help, 296)
  style_text(APP.ui.gallery_help, 0x7dd3fc)

  draw_gallery_current()
  write_metrics()
end

local function leave_gallery()
  if APP.mode ~= "gallery" then
    return
  end
  APP.mode = "camera"
  APP.ui = {}
  start_preview()
end

local function move_gallery(delta)
  if APP.mode ~= "gallery" then
    return
  end
  if #APP.photos == 0 then
    draw_gallery_current()
    return
  end
  APP.gallery_index = wrap_gallery_index(APP.gallery_index + delta)
  draw_gallery_current()
  write_metrics()
end

local function delete_current_gallery_photo()
  if APP.mode ~= "gallery" then
    return
  end
  local photo = current_gallery_photo()
  if not photo then
    draw_gallery_current()
    return
  end
  local remove_ok, remove_err = delete_photo_by_name(photo.name)
  if not remove_ok then
    set_label(APP.ui.gallery_info, remove_err or "delete failed")
  end
  draw_gallery_current()
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
  if camera.release_clone then
    pcall(function() camera.release_clone(cloned) end)
  end

  if save_ok and save_result then
    APP.captures = APP.captures + 1
    APP.next_index = APP.next_index + 1
    APP.last_photo = filename
    APP.last_bytes = tonumber(save_detail) or 0
    APP.last_error = ""
    remember_photo(filename, APP.last_bytes)
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
  if APP.pending_capture ~= "" then
    return false, "capture queued"
  end
  APP.pending_capture = text(trigger)
  set_status("queued capture")
  return true
end

local function request_delete(name)
  if APP.pending_delete ~= "" then
    return false, "delete busy"
  end
  if not is_photo_name(name) then
    return false, "invalid photo name"
  end
  APP.pending_delete = name
  set_status("queued delete")
  return true
end

local function touch_hits_shutter(x, y)
  local px = tonumber(x) or -1
  local py = tonumber(y) or -1
  return px >= APP.SHUTTER_HIT_X
    and px < APP.SHUTTER_HIT_X + APP.SHUTTER_HIT_W
    and py >= APP.SHUTTER_HIT_Y
    and py < APP.SHUTTER_HIT_Y + APP.SHUTTER_HIT_H
end

local function touch_hits_gallery_thumb(x, y)
  local px = tonumber(x) or -1
  local py = tonumber(y) or -1
  return px >= APP.GALLERY_THUMB_HIT_X
    and px < APP.GALLERY_THUMB_HIT_X + APP.GALLERY_THUMB_HIT_W
    and py >= APP.GALLERY_THUMB_HIT_Y
    and py < APP.GALLERY_THUMB_HIT_Y + APP.GALLERY_THUMB_HIT_H
end

local function touch_hits_gallery_back(x, y)
  local px = tonumber(x) or -1
  local py = tonumber(y) or -1
  return px >= APP.GALLERY_BACK_HIT_X
    and px < APP.GALLERY_BACK_HIT_X + APP.GALLERY_BACK_HIT_W
    and py >= APP.GALLERY_BACK_HIT_Y
    and py < APP.GALLERY_BACK_HIT_Y + APP.GALLERY_BACK_HIT_H
end

local function touch_hits_gallery_delete(x, y)
  local px = tonumber(x) or -1
  local py = tonumber(y) or -1
  return px >= APP.GALLERY_DELETE_HIT_X
    and px < APP.GALLERY_DELETE_HIT_X + APP.GALLERY_DELETE_HIT_W
    and py >= APP.GALLERY_DELETE_HIT_Y
    and py < APP.GALLERY_DELETE_HIT_Y + APP.GALLERY_DELETE_HIT_H
end

local function route_index(_req)
  local photos = list_photos()
  local actions = "<p>No photos</p>"
  if #photos > 0 then
    local first = photos[1]
    local name = html_escape(first.name)
    actions = "<p>" .. name .. " (" .. tostring(first.size or 0) .. "B)</p>"
      .. "<p><a href=\"" .. download_url(first.name) .. "\">Download</a></p>"
      .. "<form method=\"post\" action=\"" .. delete_url(first.name) .. "\"><button>Delete</button></form>"
  end
  local body = "<html><body><h3>Camera</h3><p>" .. tostring(#photos)
    .. " photos, last " .. html_escape(APP.last_photo ~= "" and APP.last_photo or "none") .. "</p>"
    .. "<form method=\"post\" action=\"/app/capture\"><button>Capture</button></form>"
    .. actions
    .. "<p><a href=\"/app/photos\">JSON</a> <a href=\"/app/api\">API</a></p></body></html>"
  return {
    status = 200,
    type = "text/html; charset=utf-8",
    body = body,
  }
end

local function route_photos(_req)
  local photos = list_photos()
  local shown = math.min(#photos, APP.MAX_WEB_PHOTOS)
  return {
    status = 200,
    type = "application/json",
    body = "{"
      .. "\"ok\":true,"
      .. "\"count\":" .. tostring(#photos) .. ","
      .. "\"shown\":" .. tostring(shown) .. ","
      .. "\"last\":\"" .. json_escape(APP.last_photo) .. "\","
      .. "\"photos\":" .. photos_json(photos, shown)
      .. "}\n",
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
      .. "\"pending_delete\":\"" .. json_escape(APP.pending_delete) .. "\","
      .. "\"error\":\"" .. json_escape(APP.last_error) .. "\""
      .. "}\n",
  }
end

local function route_capture(_req)
  local before_photo = APP.last_photo
  local queued, queue_err = request_capture("web")
  return {
    status = queued and 202 or 409,
    type = "application/json",
    body = "{"
      .. "\"ok\":" .. tostring(queued) .. ","
      .. "\"queued\":" .. tostring(queued) .. ","
      .. "\"saved\":false,"
      .. "\"captures\":" .. tostring(APP.captures) .. ","
      .. "\"last\":\"" .. json_escape(APP.last_photo) .. "\","
      .. "\"before\":\"" .. json_escape(before_photo) .. "\","
      .. "\"bytes\":" .. tostring(APP.last_bytes) .. ","
      .. "\"pending\":\"" .. json_escape(APP.pending_capture) .. "\","
      .. "\"error\":\"" .. json_escape(queue_err or APP.last_error) .. "\""
      .. "}\n",
  }
end

local function route_delete(req)
  local params = parse_query(req and req.query)
  local name = text(params.name)
  if not is_photo_name(name) then
    return {
      status = 400,
      type = "application/json",
      body = "{\"ok\":false,\"error\":\"invalid photo name\"}\n",
    }
  end
  if not file or type(file.remove) ~= "function" then
    return {
      status = 500,
      type = "application/json",
      body = "{\"ok\":false,\"error\":\"file.remove unavailable\"}\n",
    }
  end
  local queued, queue_err = request_delete(name)
  return {
    status = queued and 202 or 409,
    type = "application/json",
    body = "{"
      .. "\"ok\":" .. tostring(queued) .. ","
      .. "\"queued\":" .. tostring(queued) .. ","
      .. "\"deleted\":\"\","
      .. "\"pending_delete\":\"" .. json_escape(APP.pending_delete) .. "\","
      .. "\"error\":\"" .. json_escape(queued and "" or queue_err) .. "\""
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
  APP.routes["/photos"] = route_photos
  APP.routes["/capture"] = route_capture
  APP.routes["/delete"] = route_delete
  if app and app.set_webui then
    pcall(function() app.set_webui(true) end)
  end
  if app and app.route then
    pcall(function() app.route("/", dispatch_route) end)
    pcall(function() app.route("/api", dispatch_route) end)
    pcall(function() app.route("/photos", dispatch_route) end)
    pcall(function() app.route("/capture", dispatch_route) end)
    pcall(function() app.route("/delete", dispatch_route) end)
  end
end

local function exit_app()
  APP.running = false
  standby_for_runtime_stop()
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

local function handle_runtime_stop()
  APP.running = false
  standby_for_runtime_stop()
  if key and key.off then
    pcall(function() key.off(key.HOME) end)
  end
  if app and app.set_home_exit then
    pcall(function() app.set_home_exit(true) end)
  end
  if app and app.set_webui then
    pcall(function() app.set_webui(false) end)
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
      if APP.capturing or APP.pending_capture ~= "" then
        return
      end
      if evt_code ~= key.HOME then
        if APP.mode == "gallery" and evt_type == key.SHORT and evt_code == key.LEFT then
          move_gallery(-1)
        elseif APP.mode == "gallery" and evt_type == key.SHORT and evt_code == key.RIGHT then
          move_gallery(1)
        end
        return
      end
      if evt_type == key.LONG_START or evt_type == key.EXIT then
        exit_app()
      elseif APP.mode == "gallery" then
        leave_gallery()
      else
        request_capture("home")
      end
    end)
  end
  if touch and touch.on then
    touch.on(function(evt, x, y, _ts_ms)
      APP.touch_events = APP.touch_events + 1
      write_metrics()
      if APP.capturing or APP.pending_capture ~= "" then
        return
      end
      if evt == touch.UP and APP.mode == "gallery" then
        local px = tonumber(x) or 0
        if touch_hits_gallery_delete(x, y) then
          delete_current_gallery_photo()
        elseif touch_hits_gallery_back(x, y) then
          leave_gallery()
        elseif px < 106 then
          move_gallery(-1)
        elseif px > 214 then
          move_gallery(1)
        end
        return
      end
      if evt == touch.UP and touch_hits_gallery_thumb(x, y) then
        show_gallery()
        return
      end
      if evt == touch.UP and touch_hits_shutter(x, y) then
        request_capture("touch")
      end
    end)
  end
end

if file and file.mkdir then
  pcall(function() file.mkdir("/sd/data") end)
  pcall(function() file.mkdir("/sd/data/camera") end)
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
    handle_runtime_stop()
    return
  end

  if APP.pending_capture ~= "" and not APP.capturing then
    local trigger = APP.pending_capture
    APP.pending_capture = ""
    capture_photo(trigger)
  end

  if APP.pending_delete ~= "" and not APP.capturing then
    local name = APP.pending_delete
    APP.pending_delete = ""
    delete_photo_by_name(name)
  end
end)

print("[camera] ready")
