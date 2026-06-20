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

local function append(lines, label, value)
  lines[#lines + 1] = label .. ": " .. tostring(value)
end

local function run_check()
  local ok = true
  local lines = {}

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

  local start_ok, start_err = nes.start("/sd/nes/smoke.nes", { target_fps = 60 })
  append(lines, "start", tostring(start_ok) .. " " .. tostring(start_err))
  if start_ok ~= false or tostring(start_err):find("native executor pending", 1, true) == nil then
    ok = false
  end

  lv_label_set_text(status_label, (ok and "OK\n" or "FAIL\n") .. table.concat(lines, "\n"))
  print("[smoke_nes]", ok and "ok" or "fail", tostring(start_err))
end

run_check()
