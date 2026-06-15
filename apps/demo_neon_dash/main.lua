local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x080012)
lv_obj_set_style_text_color(root, 0xe9d5ff)

local NEON_CYAN = 0x00f5ff
local NEON_MAGENTA = 0xff2bd6
local NEON_YELLOW = 0xfaff00
local PANEL = 0x17002f

local function block(x, y, w, h, color)
    local obj = lv_obj_create(root)
    lv_obj_set_size(obj, w, h)
    lv_obj_set_pos(obj, x, y)
    lv_obj_set_style_bg_color(obj, color)
    lv_obj_set_style_radius(obj, 2)
    lv_obj_set_style_pad_all(obj, 0)
    lv_obj_set_style_border_width(obj, 0)
    return obj
end

block(14, 16, 292, 4, NEON_CYAN)
block(14, 220, 292, 4, NEON_MAGENTA)
block(14, 16, 4, 208, NEON_MAGENTA)
block(302, 16, 4, 208, NEON_CYAN)

local title = lv_label_create(root)
lv_label_set_text(title, "NEON CORE")
lv_obj_set_style_text_color(title, NEON_CYAN)
lv_obj_set_pos(title, 28, 30)

local mode = lv_label_create(root)
lv_label_set_text(mode, "SYNC / 88%")
lv_obj_set_style_text_color(mode, NEON_MAGENTA)
lv_obj_set_pos(mode, 196, 30)

local core = lv_obj_create(root)
lv_obj_set_size(core, 88, 88)
lv_obj_set_pos(core, 116, 64)
lv_obj_set_style_bg_color(core, PANEL)
lv_obj_set_style_border_width(core, 2)
lv_obj_set_style_border_color(core, NEON_CYAN)
lv_obj_set_style_radius(core, 8)
lv_obj_set_style_pad_all(core, 0)

local pulse = lv_obj_create(root)
lv_obj_set_size(pulse, 42, 42)
lv_obj_set_pos(pulse, 139, 87)
lv_obj_set_style_bg_color(pulse, NEON_MAGENTA)
lv_obj_set_style_radius(pulse, 6)
lv_obj_set_style_border_width(pulse, 0)
lv_obj_set_style_pad_all(pulse, 0)

local left_bar = lv_bar_create(root)
lv_obj_set_size(left_bar, 78, 12)
lv_obj_set_pos(left_bar, 28, 82)
lv_bar_set_range(left_bar, 0, 100)
lv_bar_set_value(left_bar, 40, LV_ANIM_OFF)

local right_bar = lv_bar_create(root)
lv_obj_set_size(right_bar, 78, 12)
lv_obj_set_pos(right_bar, 214, 82)
lv_bar_set_range(right_bar, 0, 100)
lv_bar_set_value(right_bar, 70, LV_ANIM_OFF)

local readout = lv_label_create(root)
lv_label_set_text(readout, "grid 40 / flow 70")
lv_obj_set_style_text_color(readout, NEON_YELLOW)
lv_obj_set_pos(readout, 70, 168)

local tick = 0
local grid = 40
local flow = 70
local neon_timer = tmr.create()
neon_timer:alarm(450, tmr.ALARM_AUTO, function()
    tick = tick + 1
    grid = grid + 17
    flow = flow - 11
    if grid > 100 then
        grid = 8
    end
    if flow < 10 then
        flow = 96
    end

    local pulse_size = 34 + ((tick % 4) * 5)
    lv_obj_set_size(pulse, pulse_size, pulse_size)
    lv_obj_set_pos(pulse, 160 - math.floor(pulse_size / 2), 108 - math.floor(pulse_size / 2))
    lv_bar_set_value(left_bar, grid, LV_ANIM_ON)
    lv_bar_set_value(right_bar, flow, LV_ANIM_ON)
    lv_label_set_text(mode, "SYNC / " .. tostring(flow) .. "%")
    lv_label_set_text(readout, "grid " .. tostring(grid) .. " / flow " .. tostring(flow))
end)

print("demo neon dash ready")
