local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x050816)
lv_obj_set_style_text_color(root, 0xe5e7eb)

local title = lv_label_create(root)
lv_label_set_text(title, "Space Dash")
lv_obj_set_style_text_color(title, 0xa7f3d0)
lv_obj_align(title, LV_ALIGN_TOP_LEFT, 18, 14)

local ship = lv_label_create(root)
lv_label_set_text(ship, "<|===>")
lv_obj_set_style_text_color(ship, 0xfef3c7)
lv_obj_align(ship, LV_ALIGN_TOP_LEFT, 124, 46)

local mission = lv_label_create(root)
lv_label_set_text(mission, "Mission: orbit")
lv_obj_set_style_text_color(mission, 0xc4b5fd)
lv_obj_align(mission, LV_ALIGN_TOP_LEFT, 18, 48)

local fuel_label = lv_label_create(root)
lv_label_set_text(fuel_label, "Fuel")
lv_obj_set_style_text_color(fuel_label, 0x93c5fd)
lv_obj_align(fuel_label, LV_ALIGN_TOP_LEFT, 24, 96)

local fuel_bar = lv_bar_create(root)
lv_obj_set_size(fuel_bar, 198, 14)
lv_obj_align(fuel_bar, LV_ALIGN_TOP_LEFT, 86, 98)
lv_bar_set_range(fuel_bar, 0, 100)
lv_bar_set_value(fuel_bar, 82, LV_ANIM_OFF)

local speed_label = lv_label_create(root)
lv_label_set_text(speed_label, "Speed")
lv_obj_set_style_text_color(speed_label, 0x93c5fd)
lv_obj_align(speed_label, LV_ALIGN_TOP_LEFT, 24, 130)

local speed_bar = lv_bar_create(root)
lv_obj_set_size(speed_bar, 198, 14)
lv_obj_align(speed_bar, LV_ALIGN_TOP_LEFT, 86, 132)
lv_bar_set_range(speed_bar, 0, 100)
lv_bar_set_value(speed_bar, 34, LV_ANIM_OFF)

local status = lv_label_create(root)
lv_label_set_text(status, "Telemetry nominal")
lv_obj_set_style_text_color(status, 0x9ca3af)
lv_obj_align(status, LV_ALIGN_BOTTOM_LEFT, 22, -20)

local missions = { "orbit", "scan", "dock", "boost", "coast", "return" }
local tick = 0
local fuel = 82
local speed = 34
local dx = 0

local dash_timer = tmr.create()
dash_timer:alarm(650, tmr.ALARM_AUTO, function()
    tick = tick + 1
    fuel = fuel - 5
    speed = speed + 13
    if fuel < 15 then
        fuel = 96
    end
    if speed > 100 then
        speed = 22
    end
    dx = (tick % 5) * 6

    local mission_index = (tick % #missions) + 1
    lv_label_set_text(mission, "Mission: " .. missions[mission_index])
    lv_obj_set_x(ship, 124 + dx)
    lv_bar_set_value(fuel_bar, fuel, LV_ANIM_ON)
    lv_bar_set_value(speed_bar, speed, LV_ANIM_ON)
    lv_label_set_text(status, "fuel " .. fuel .. "% / speed " .. speed .. "%")

    if tick <= 8 then
        print("space dash tick " .. tick)
    end
end)

print("demo space dash ready")
