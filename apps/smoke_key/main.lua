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
local function key_name(code)
  return names[code] or tostring(code)
end

local function event_name(evt_type)
  return event_names[evt_type] or tostring(evt_type)
end

key.on(function(evt_code, evt_type, ts_ms)
  count = count + 1
  local line = key_name(evt_code) .. " type=" .. event_name(evt_type) .. " t=" .. tostring(ts_ms)
  lv_label_set_text(event_label, "last: " .. line)
  lv_label_set_text(count_label, "count: " .. tostring(count))
  print("smoke key event " .. line)
end)

local inject_left = true
local inject_repeat = false
local timer = tmr.create()
timer:alarm(1500, tmr.ALARM_AUTO, function()
  if inject_repeat and key.repeat_stop then
    key.repeat_stop(key.UP)
    inject_repeat = false
  elseif not inject_left and key.repeat_start then
    key.repeat_start(key.UP, 250, 120)
    inject_repeat = true
  elseif inject_left then
    key.push(key.LEFT, key.SHORT)
  else
    key.push(key.RIGHT, key.SHORT)
  end
  inject_left = not inject_left
end)

print("smoke key ok")
