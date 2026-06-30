print("smoke imu start")

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x0f172a)

local title = lv_label_create(root)
lv_label_set_text(title, "IMU Smoke")
lv_obj_set_style_text_color(title, 0xf8fafc)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 12)

local state_label = lv_label_create(root)
lv_label_set_text(state_label, "state: init")
lv_obj_set_style_text_color(state_label, 0x7dd3fc)
lv_obj_set_width(state_label, 300)
lv_obj_align(state_label, LV_ALIGN_CENTER, 0, -18)

local sample_label = lv_label_create(root)
lv_label_set_text(sample_label, "sample: none")
lv_obj_set_style_text_color(sample_label, 0xfacc15)
lv_obj_set_width(sample_label, 300)
lv_obj_align(sample_label, LV_ALIGN_CENTER, 0, 24)

local count = 0
local available = false
local last_roll = 0
local last_pitch = 0
local last_error = ""

local function write_metrics()
  local body = "{"
    .. '"available":' .. tostring(available) .. ","
    .. '"count":' .. tostring(count) .. ","
    .. '"roll":' .. tostring(last_roll) .. ","
    .. '"pitch":' .. tostring(last_pitch) .. ","
    .. '"last_error":"' .. tostring(last_error):gsub('"', '\\"') .. '"'
    .. "}\n"
  file.putcontents("metrics.json", body)
end

if not imu or not imu.on then
  last_error = "imu module missing"
  lv_label_set_text(state_label, "state: missing")
  write_metrics()
  return
end

local state = imu.state()
available = state and state.available or false
lv_label_set_text(state_label, "available: " .. tostring(available))
write_metrics()

imu.on(function(sample)
  count = count + 1
  last_roll = math.floor((tonumber(sample.roll) or 0) * 10 + 0.5) / 10
  last_pitch = math.floor((tonumber(sample.pitch) or 0) * 10 + 0.5) / 10
  lv_label_set_text(sample_label, "roll=" .. tostring(last_roll) .. " pitch=" .. tostring(last_pitch))
  write_metrics()
  print("smoke imu sample roll=" .. tostring(last_roll) .. " pitch=" .. tostring(last_pitch))
end, 40)

local timer = tmr.create()
timer:alarm(1200, tmr.ALARM_AUTO, function()
  local sample, err = imu.read()
  if sample then
    count = count + 1
    last_roll = math.floor((tonumber(sample.roll) or 0) * 10 + 0.5) / 10
    last_pitch = math.floor((tonumber(sample.pitch) or 0) * 10 + 0.5) / 10
    lv_label_set_text(sample_label, "read roll=" .. tostring(last_roll) .. " pitch=" .. tostring(last_pitch))
  elseif err then
    last_error = tostring(err)
  end
  write_metrics()
end)

print("smoke imu ok")
