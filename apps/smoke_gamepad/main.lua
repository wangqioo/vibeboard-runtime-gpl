print("[smoke_gamepad] start")

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x101820)

local title = lv_label_create(root)
lv_label_set_text(title, "Gamepad Smoke")
lv_obj_set_style_text_color(title, 0xf3f4f6)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 12)

local status = lv_label_create(root)
lv_obj_set_width(status, 292)
lv_obj_set_style_text_color(status, 0xd1d5db)
lv_obj_align(status, LV_ALIGN_CENTER, 0, 0)

local updates = 0
local connects = 0
local disconnects = 0
local pair_events = 0
local injected = false

local function render(tag)
  local state = gamepad.state()
  local lines = {
    "tag: " .. tostring(tag or "-"),
    "started: " .. tostring(state.started),
    "connected: " .. tostring(state.connected),
    "buttons: " .. tostring(state.buttons_mask),
    "dpad: " .. tostring(state.dpad_left) .. "/" .. tostring(state.dpad_right),
    "xbox: " .. tostring(state.xbox),
    "updates: " .. tostring(updates),
    "connects: " .. tostring(connects),
    "disconnects: " .. tostring(disconnects),
    "pair: " .. tostring(pair_events),
  }
  lv_label_set_text(status, table.concat(lines, "\n"))
  print("[smoke_gamepad]", table.concat(lines, " | "))
end

gamepad.off()
gamepad.on(gamepad.EVT_CONNECTING, function()
  pair_events = pair_events + 1
  render("connecting")
end)
gamepad.on(gamepad.EVT_CONNECTED, function()
  connects = connects + 1
  render("connected")
end)
gamepad.on(gamepad.EVT_DISCONNECTED, function()
  disconnects = disconnects + 1
  render("disconnected")
end)
gamepad.on(gamepad.EVT_UPDATE, function()
  updates = updates + 1
  render("update")
end)

local ok = gamepad.start({
  clear_bonds = false,
  debug = false,
})
if not ok then
  error("gamepad start failed")
end

render("start")

tmr.create():alarm(700, tmr.ALARM_AUTO, function()
  if injected then
    gamepad.push_state({
      connected = true,
      buttons_mask = 0,
      dpad_left = false,
      dpad_right = true,
      lx = 0.75,
      ly = 0,
      address = "smoke",
    })
  else
    gamepad.push_state({
      connected = true,
      buttons_mask = gamepad.BTN_XBOX,
      dpad_left = true,
      dpad_right = false,
      lx = -0.75,
      ly = 0,
      address = "smoke",
    })
  end
  injected = not injected
end)
