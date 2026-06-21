print("[smoke_app_manager] start")

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x111827)

local title = lv_label_create(root)
lv_label_set_text(title, "App Manager")
lv_obj_set_style_text_color(title, 0xf9fafb)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 12)

local status = lv_label_create(root)
lv_obj_set_width(status, 292)
lv_obj_set_style_text_color(status, 0xd1d5db)
lv_obj_align(status, LV_ALIGN_CENTER, 0, 0)

local home_exit_available = type(app.set_home_exit) == "function"
local home_exit_disabled = false
local launch_target = "smoke_key"
local launch_requested = false
local software_home_injected = false

if home_exit_available then
  local ok, err = pcall(function()
    app.set_home_exit(false)
  end)
  home_exit_disabled = ok
  print("[smoke_app_manager] app.set_home_exit(false)", tostring(ok), tostring(err or ""))
end

local function render()
  local lines = {}
  local apps, err = app.list()
  local rescanned, rescan_err = app.rescan()
  local current = app.current()
  local exiting = app.exiting()
  local exit_available = type(app.exit) == "function"
  local launch_available = type(app.launch) == "function"
  local set_home_exit_available = type(app.set_home_exit) == "function"

  lines[#lines + 1] = "count: " .. tostring(type(apps) == "table" and #apps or 0)
  lines[#lines + 1] = "rescan: " .. tostring(type(rescanned) == "table" and #rescanned or 0)
  lines[#lines + 1] = "state: " .. tostring(current and current.state)
  lines[#lines + 1] = "id: " .. tostring(current and current.id)
  lines[#lines + 1] = "exiting: " .. tostring(exiting)
  lines[#lines + 1] = "exit fn: " .. tostring(exit_available)
  lines[#lines + 1] = "launch fn: " .. tostring(launch_available)
  lines[#lines + 1] = "home exit fn: " .. tostring(set_home_exit_available)
  lines[#lines + 1] = "home exit off: " .. tostring(home_exit_disabled)
  lines[#lines + 1] = "soft HOME: " .. tostring(software_home_injected)
  lines[#lines + 1] = "HOME -> launch " .. launch_target .. ": " .. tostring(launch_requested)
  if err then
    lines[#lines + 1] = "err: " .. tostring(err)
  end
  if rescan_err then
    lines[#lines + 1] = "rescan err: " .. tostring(rescan_err)
  end

  lv_label_set_text(status, table.concat(lines, "\n"))
  print("[smoke_app_manager]", table.concat(lines, " | "))
end

app.on("exit", function()
  if type(app.set_home_exit) == "function" then
    pcall(function()
      app.set_home_exit(true)
    end)
  end
  print("[smoke_app_manager] exit callback")
end)

if key and key.on then
  key.on(key.HOME, function(evt_type)
    print("[smoke_app_manager] HOME event", tostring(evt_type))
    if evt_type == key.SHORT and type(app.launch) == "function" then
      launch_requested = true
      render()
      local ok, err = app.launch("smoke_key")
      print("[smoke_app_manager] app.launch(\"smoke_key\")", tostring(ok), tostring(err or ""))
    elseif evt_type == key.LONG_START and type(app.exit) == "function" then
      app.exit()
    end
  end)
end

render()
tmr.create():alarm(1000, tmr.ALARM_AUTO, render)

tmr.create():alarm(1500, tmr.ALARM_SINGLE, function()
  if software_home_injected or launch_requested then
    return
  end
  if key and key.push and type(app.launch) == "function" then
    software_home_injected = true
    print("[smoke_app_manager] software HOME SHORT")
    key.push(key.HOME, key.SHORT)
  end
end)
