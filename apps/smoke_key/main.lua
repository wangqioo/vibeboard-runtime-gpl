print("smoke key start")

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x111827)

local title = lv_label_create(root)
lv_label_set_text(title, "Key Smoke")
lv_obj_set_style_text_color(title, 0xf9fafb)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 12)

local hint = lv_label_create(root)
lv_label_set_text(hint, "Swipe or wait for key.push/repeat")
lv_obj_set_style_text_color(hint, 0x93c5fd)
lv_obj_align(hint, LV_ALIGN_TOP_MID, 0, 46)

local event_label = lv_label_create(root)
lv_label_set_text(event_label, "last: none")
lv_obj_set_style_text_color(event_label, 0xfbbf24)
lv_obj_set_width(event_label, 280)
lv_obj_align(event_label, LV_ALIGN_CENTER, 0, -10)

local count_label = lv_label_create(root)
lv_label_set_text(count_label, "count: 0")
lv_obj_set_style_text_color(count_label, 0xd1d5db)
lv_obj_align(count_label, LV_ALIGN_CENTER, 0, 30)

local names = {
  [key.LEFT] = "LEFT",
  [key.RIGHT] = "RIGHT",
  [key.UP] = "UP",
  [key.DOWN] = "DOWN",
  [key.HOME] = "HOME",
  [key.EXIT] = "EXIT",
}

local event_names = {
  [key.SHORT] = "SHORT",
  [key.LONG_START] = "LONG_START",
  [key.LONG_REPEAT] = "LONG_REPEAT",
  [key.LONG_END] = "LONG_END",
}

local count = 0
local event_counts = {}
local last_line = "none"
local repeat_checked = false
local repeat_stop_pending = false
local injected_count = 0
local runtime_app = app

local function key_name(code)
  return names[code] or tostring(code)
end

local function event_name(evt_type)
  return event_names[evt_type] or tostring(evt_type)
end

local function json_escape(value)
  return tostring(value):gsub("\\", "\\\\"):gsub('"', '\\"')
end

local function write_metrics()
  local keys = {
    "LEFT:SHORT",
    "RIGHT:SHORT",
    "UP:LONG_START",
    "UP:LONG_REPEAT",
    "UP:LONG_END",
    "HOME:SHORT",
    "HOME:LONG_START",
    "HOME:LONG_REPEAT",
    "HOME:LONG_END",
    "EXIT:SHORT",
  }
  local parts = {
    '{"ok":true',
    ',"count":' .. tostring(count),
    ',"injected_count":' .. tostring(injected_count),
    ',"repeat_checked":' .. tostring(repeat_checked),
    ',"repeat_stop_pending":' .. tostring(repeat_stop_pending),
    ',"last":"' .. json_escape(last_line) .. '"',
    ',"events":{',
  }
  local first = true
  for _, name in ipairs(keys) do
    local value = event_counts[name]
    if value and value > 0 then
      if not first then
        table.insert(parts, ",")
      end
      first = false
      table.insert(parts, '"' .. name .. '":' .. tostring(value))
    end
  end
  table.insert(parts, "}}")
  file.write("metrics.json", table.concat(parts))
end

key.on(function(evt_code, evt_type, ts_ms)
  count = count + 1
  local line = key_name(evt_code) .. " type=" .. event_name(evt_type) .. " t=" .. tostring(ts_ms)
  local metric = key_name(evt_code) .. ":" .. event_name(evt_type)
  event_counts[metric] = (event_counts[metric] or 0) + 1
  last_line = line
  lv_label_set_text(event_label, "last: " .. line)
  lv_label_set_text(count_label, "count: " .. tostring(count))
  write_metrics()
  print("smoke key event " .. line)
end)

local inject_left = true
local timer = tmr.create()
write_metrics()
timer:alarm(2500, tmr.ALARM_AUTO, function()
  if runtime_app and runtime_app.exiting and runtime_app.exiting() then
    timer:stop()
    return
  end
  if repeat_stop_pending then
    repeat_stop_pending = false
    local ok, err = pcall(key.repeat_stop, key.UP)
    if not ok then
      lv_label_set_text(event_label, "repeat stop degraded: " .. tostring(err))
      key.push(key.UP, key.LONG_END)
    end
  elseif not repeat_checked and key.repeat_start and key.repeat_stop then
    repeat_checked = true
    local ok, err = pcall(key.repeat_start, key.UP, 250, 500)
    if ok then
      repeat_stop_pending = true
    else
      lv_label_set_text(event_label, "repeat degraded: " .. tostring(err))
      key.push(key.UP, key.LONG_START)
      key.push(key.UP, key.LONG_REPEAT)
      key.push(key.UP, key.LONG_END)
    end
  elseif injected_count >= 4 then
    timer:stop()
    lv_label_set_text(hint, "Auto smoke complete; swipe keys still work")
    write_metrics()
  elseif inject_left then
    key.push(key.LEFT, key.SHORT)
    injected_count = injected_count + 1
  else
    key.push(key.RIGHT, key.SHORT)
    injected_count = injected_count + 1
  end
  inject_left = not inject_left
end)

print("smoke key ok")
