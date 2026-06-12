local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_set_style_bg_color(root, 0x101418)
lv_obj_set_style_text_color(root, 0xf4f7fb)

local title = lv_label_create(root)
lv_label_set_text(title, "VibeBoard Timer")
lv_obj_align(title, LV_ALIGN_TOP_LEFT, 18, 18)

local status = lv_label_create(root)
lv_label_set_text(status, "Waiting")
lv_obj_align(status, LV_ALIGN_TOP_LEFT, 18, 52)

local ticks = 0
local timer = tmr.create()
timer:alarm(1000, tmr.ALARM_AUTO, function()
    ticks = ticks + 1
    lv_label_set_text(status, "Tick " .. ticks)
    print("smoke timer tick", ticks)
    if ticks >= 5 then
        local active, mode = timer:state()
        print("smoke timer state", active, mode)
        timer:unregister()
    end
end)

local single = tmr.create()
single:alarm(2500, tmr.ALARM_SINGLE, function()
    print("smoke timer single", tmr.time(), tmr.now())
end)

print("smoke timer start")
