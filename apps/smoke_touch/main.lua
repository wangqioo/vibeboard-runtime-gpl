print("smoke touch start")

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x0f172a)

local title = lv_label_create(root)
lv_label_set_text(title, "Touch Smoke")
lv_obj_set_style_text_color(title, 0xf8fafc)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 12)

local hint = lv_label_create(root)
lv_label_set_text(hint, "Touch screen or wait for touch.push")
lv_obj_set_style_text_color(hint, 0x7dd3fc)
lv_obj_align(hint, LV_ALIGN_TOP_MID, 0, 46)

local coord_label = lv_label_create(root)
lv_label_set_text(coord_label, "event: none")
lv_obj_set_style_text_color(coord_label, 0xfacc15)
lv_obj_set_width(coord_label, 290)
lv_obj_align(coord_label, LV_ALIGN_CENTER, 0, -8)

local count_label = lv_label_create(root)
lv_label_set_text(count_label, "count: 0")
lv_obj_set_style_text_color(count_label, 0xcbd5e1)
lv_obj_align(count_label, LV_ALIGN_CENTER, 0, 32)

local event_names = {
  [touch.DOWN] = "DOWN",
  [touch.MOVE] = "MOVE",
  [touch.UP] = "UP",
}

local count = 0
local function event_name(evt)
  return event_names[evt] or tostring(evt)
end

touch.on(function(evt, x, y, ts_ms)
  count = count + 1
  local line = event_name(evt) .. " x=" .. tostring(x) .. " y=" .. tostring(y) .. " t=" .. tostring(ts_ms)
  lv_label_set_text(coord_label, "event: " .. line)
  lv_label_set_text(count_label, "count: " .. tostring(count))
  print("smoke touch event " .. line)
end)

local phase = 0
local timer = tmr.create()
timer:alarm(1800, tmr.ALARM_AUTO, function()
  phase = (phase + 1) % 3
  if phase == 0 then
    touch.push(touch.DOWN, 40, 40)
  elseif phase == 1 then
    touch.push(touch.MOVE, 180, 100)
  else
    touch.push(touch.UP, 260, 180)
  end
end)

print("smoke touch ok")
