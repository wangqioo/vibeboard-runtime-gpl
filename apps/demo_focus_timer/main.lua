local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x0f172a)
lv_obj_set_style_text_color(root, 0xe2e8f0)

local title = lv_label_create(root)
lv_label_set_text(title, "Focus Sprint")
lv_obj_set_style_text_color(title, 0x67e8f9)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 16)

local minutes = lv_label_create(root)
lv_label_set_text(minutes, "02:00")
lv_obj_set_style_text_color(minutes, 0xffffff)
lv_obj_set_width(minutes, 160)
lv_obj_align(minutes, LV_ALIGN_CENTER, 0, -44)

local message = lv_label_create(root)
lv_label_set_text(message, "Deep work mode")
lv_obj_set_style_text_color(message, 0xcbd5e1)
lv_obj_align(message, LV_ALIGN_CENTER, 0, -4)

local bar = lv_bar_create(root)
lv_obj_set_size(bar, 246, 18)
lv_obj_align(bar, LV_ALIGN_CENTER, 0, 38)
lv_bar_set_range(bar, 0, 120)
lv_bar_set_value(bar, 0, LV_ANIM_OFF)

local foot = lv_label_create(root)
lv_label_set_text(foot, "2 minute demo cycle")
lv_obj_set_style_text_color(foot, 0x94a3b8)
lv_obj_align(foot, LV_ALIGN_BOTTOM_LEFT, 24, -18)

local total = 120
local left = total

local function draw_time()
    local min = math.floor(left / 60)
    local sec = left % 60
    local sec_text = tostring(sec)
    if sec < 10 then
        sec_text = "0" .. sec_text
    end
    lv_label_set_text(minutes, "0" .. min .. ":" .. sec_text)
    lv_bar_set_value(bar, total - left, LV_ANIM_ON)
end

local focus_timer = tmr.create()
focus_timer:alarm(1000, tmr.ALARM_AUTO, function()
    left = left - 1
    if left <= 0 then
        left = total
        lv_label_set_text(message, "Reset. breathe.")
        print("focus timer reset")
    elseif left == 90 then
        lv_label_set_text(message, "Keep the streak")
    elseif left == 60 then
        lv_label_set_text(message, "Halfway there")
    elseif left == 30 then
        lv_label_set_text(message, "Final push")
    end
    draw_time()
end)

draw_time()
print("demo focus timer ready")
