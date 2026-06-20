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

local function render()
  local lines = {}
  local apps, err = app.list()
  local current = app.current()
  local exiting = app.exiting()

  lines[#lines + 1] = "count: " .. tostring(type(apps) == "table" and #apps or 0)
  lines[#lines + 1] = "state: " .. tostring(current and current.state)
  lines[#lines + 1] = "id: " .. tostring(current and current.id)
  lines[#lines + 1] = "exiting: " .. tostring(exiting)
  if err then
    lines[#lines + 1] = "err: " .. tostring(err)
  end

  lv_label_set_text(status, table.concat(lines, "\n"))
  print("[smoke_app_manager]", table.concat(lines, " | "))
end

app.on("exit", function()
  print("[smoke_app_manager] exit callback")
end)

render()
tmr.create():alarm(1000, tmr.ALARM_AUTO, render)
