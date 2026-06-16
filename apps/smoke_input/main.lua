local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x101418)
lv_obj_set_style_bg_opa(root, 255)

local title = lv_label_create(root)
lv_label_set_text(title, "smoke input")
lv_obj_set_style_text_color(title, 0xe5e7eb)
lv_obj_set_pos(title, 18, 18)

local status = lv_label_create(root)
lv_label_set_text(status, "Press BOOT")
lv_obj_set_style_text_color(status, 0x93c5fd)
lv_obj_set_pos(status, 18, 54)

local detail = lv_label_create(root)
lv_label_set_text(detail, "HOME/START short + long")
lv_obj_set_style_text_color(detail, 0xb6c2d1)
lv_obj_set_pos(detail, 18, 86)

local counter = 0
local last_text = "waiting"

local function event_name(event_type)
    if event_type == key.SHORT then
        return "SHORT"
    end
    if event_type == key.LONG_START then
        return "LONG_START"
    end
    if event_type == key.LONG_REPEAT then
        return "LONG_REPEAT"
    end
    if event_type == key.LONG_END then
        return "LONG_END"
    end
    if event_type == key.START then
        return "START"
    end
    return tostring(event_type)
end

local function code_name(code)
    if code == key.HOME then
        return "HOME"
    end
    return tostring(code)
end

local function handle_key(code, event_type, ts_ms)
    counter = counter + 1
    last_text = code_name(code) .. " " .. event_name(event_type) .. " #" .. counter
    lv_label_set_text(status, last_text)
    lv_label_set_text(detail, "ts=" .. tostring(ts_ms))
    print("smoke input event", code_name(code), event_name(event_type), ts_ms)
end

key.on(handle_key)

local watchdog = tmr.create()
watchdog:alarm(1000, tmr.ALARM_AUTO, function()
    print("smoke input ready", last_text)
    if counter >= 3 then
        key.off()
        lv_label_set_text(detail, "key.off after 3 events")
    end
end)

print("smoke input ready")
