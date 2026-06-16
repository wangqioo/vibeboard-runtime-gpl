local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x0b0714)
lv_obj_set_style_text_color(root, 0xf8fafc)

local APP_NAME = "Holocubic Codex Buddy"
local PHASE = "Phase 5 bridge app"
local MISSING_A = "Missing runtime:"
local MISSING_B = "http-callback, key-input, gif, bridge-config"
local NOTE = "Catalog placeholder; full port queued."

local function label(text, x, y, color)
    local obj = lv_label_create(root)
    lv_obj_set_width(obj, 288)
    lv_label_set_long_mode(obj, LV_LABEL_LONG_WRAP)
    lv_label_set_text(obj, text)
    lv_obj_set_style_text_color(obj, color)
    lv_obj_set_pos(obj, x, y)
    return obj
end

label(APP_NAME, 16, 18, 0xa78bfa)
label("Runtime update required", 16, 52, 0xfbbf24)
label(PHASE, 16, 82, 0x94a3b8)
label(MISSING_A, 16, 110, 0xe5e7eb)
label(MISSING_B, 16, 134, 0xe5e7eb)
local footer = label(NOTE, 16, 178, 0x64748b)

local tick = 0
local timer = tmr.create()
timer:alarm(1000, tmr.ALARM_AUTO, function()
    tick = tick + 1
    lv_label_set_text(footer, NOTE .. " tick " .. tostring(tick))
end)

print(APP_NAME .. " placeholder ready")
