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
local started = false
local last_error = ""

local function render()
  local state = i2s.status(0)
  local lines = {
    "started: " .. tostring(state.started),
    "rate: " .. tostring(state.rate),
    "bits: " .. tostring(state.bits),
    "bytes: " .. tostring(total),
    "reads: " .. tostring(reads),
    "error: " .. tostring(last_error ~= "" and last_error or state.last_error),
  }
  lv_label_set_text(status, table.concat(lines, "\n"))
  print("[smoke_i2s]", table.concat(lines, " | "))
end

local ok, err = pcall(function()
  return i2s.start(0, {
    mode = i2s.MODE_MASTER | i2s.MODE_RX,
    rate = 16000,
    bits = 32,
    channel = i2s.CHANNEL_ONLY_LEFT,
    format = i2s.FORMAT_I2S,
    buffer_count = 4,
    buffer_len = 256,
  })
end)

started = ok and err == true
if not started then
  last_error = tostring(err)
end
render()

tmr.create():alarm(250, tmr.ALARM_AUTO, function()
  if not started then
    render()
    return
  end

  local pcm = i2s.read(0, 2048, 0)
  reads = reads + 1
  if pcm then
    total = total + #pcm
  end
  render()

  if reads >= 40 then
    i2s.stop(0)
    started = false
    last_error = "stopped after smoke window"
    render()
  end
end)
