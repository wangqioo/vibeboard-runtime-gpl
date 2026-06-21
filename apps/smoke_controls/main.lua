print("smoke controls start")

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x111827)

local title = lv_label_create(root)
lv_label_set_text(title, "LVGL controls")
lv_obj_set_style_text_color(title, 0xf8fafc)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 4)

local slider = lv_slider_create(root)
lv_obj_set_size(slider, 126, 12)
lv_obj_set_pos(slider, 10, 34)
lv_slider_set_range(slider, 0, 100)
lv_slider_set_value(slider, 35, LV_ANIM_OFF)

local arc = lv_arc_create(root)
lv_obj_set_size(arc, 58, 58)
lv_obj_set_pos(arc, 244, 26)
lv_arc_set_range(arc, 0, 100)
lv_arc_set_value(arc, 35)

local switch = lv_switch_create(root)
lv_obj_set_size(switch, 46, 24)
lv_obj_set_pos(switch, 154, 30)

local dropdown = lv_dropdown_create(root)
lv_obj_set_size(dropdown, 112, 34)
lv_obj_set_pos(dropdown, 10, 62)
lv_dropdown_set_options(dropdown, "matrix\nclock\nvoice")
lv_dropdown_set_selected(dropdown, 1)

local roller = lv_roller_create(root)
lv_obj_set_size(roller, 92, 58)
lv_obj_set_pos(roller, 132, 58)
lv_roller_set_options(roller, "one\ntwo\nthree", LV_ROLLER_MODE_NORMAL)
lv_roller_set_selected(roller, 1, LV_ANIM_OFF)

local list = lv_list_create(root)
lv_obj_set_size(list, 136, 76)
lv_obj_set_pos(list, 10, 112)
lv_list_add_text(list, "apps")
lv_list_add_btn(list, nil, "2048")
lv_list_add_btn(list, nil, "weather")

local textarea = lv_textarea_create(root)
lv_obj_set_size(textarea, 142, 64)
lv_obj_set_pos(textarea, 164, 128)
lv_textarea_set_text(textarea, "ready")
lv_textarea_add_text(textarea, " + edit")

local status = lv_label_create(root)
lv_obj_set_width(status, 300)
lv_obj_set_pos(status, 10, 210)
lv_obj_set_style_text_color(status, 0x93c5fd)
lv_label_set_long_mode(status, LV_LABEL_LONG_CLIP)

local value = 35
local timer = tmr.create()
timer:alarm(700, tmr.ALARM_AUTO, function()
    value = value + 13
    if value > 100 then
        value = 0
    end

    lv_slider_set_value(slider, value, LV_ANIM_ON)
    lv_arc_set_value(arc, value)
    lv_dropdown_set_selected(dropdown, math.floor(value / 34))
    lv_roller_set_selected(roller, math.floor(value / 34), LV_ANIM_ON)

    local slider_value = lv_slider_get_value(slider)
    local arc_value = lv_arc_get_value(arc)
    local dropdown_index = lv_dropdown_get_selected(dropdown)
    local roller_index = lv_roller_get_selected(roller)
    local text = lv_textarea_get_text(textarea)
    lv_label_set_text(status, "s=" .. slider_value .. " a=" .. arc_value .. " d=" .. dropdown_index .. " r=" .. roller_index .. " text=" .. text)
    print("smoke controls value " .. slider_value .. " arc " .. arc_value)
end)

print("smoke controls ok")
