local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x001000)
lv_obj_set_style_text_color(root, 0x39ff14)

local TERMINAL_GREEN = 0x39ff14
local DIM_GREEN = 0x0b5f16

local function make_label(text, x, y, color)
    local label = lv_label_create(root)
    lv_label_set_text(label, text)
    lv_obj_set_style_text_color(label, color)
    lv_obj_set_pos(label, x, y)
    return label
end

local scanline_top = lv_obj_create(root)
lv_obj_set_size(scanline_top, 292, 2)
lv_obj_set_pos(scanline_top, 14, 16)
lv_obj_set_style_bg_color(scanline_top, DIM_GREEN)
lv_obj_set_style_border_width(scanline_top, 0)
lv_obj_set_style_pad_all(scanline_top, 0)

local scanline_bottom = lv_obj_create(root)
lv_obj_set_size(scanline_bottom, 292, 2)
lv_obj_set_pos(scanline_bottom, 14, 222)
lv_obj_set_style_bg_color(scanline_bottom, DIM_GREEN)
lv_obj_set_style_border_width(scanline_bottom, 0)
lv_obj_set_style_pad_all(scanline_bottom, 0)

local header = make_label("> VIBEBOARD / TERMINAL", 18, 28, TERMINAL_GREEN)
local boot = make_label("BOOT LOG  00:00:00", 18, 58, TERMINAL_GREEN)
local sys = make_label("[SYS OK] runtime online", 18, 84, TERMINAL_GREEN)
local mem = make_label("[MEM OK] heap stable", 18, 110, TERMINAL_GREEN)
local net = make_label("[NET OK] install:8080", 18, 136, TERMINAL_GREEN)
local task = make_label("[APP OK] lua timers", 18, 162, TERMINAL_GREEN)
local cursor = make_label("_", 18, 194, TERMINAL_GREEN)

local meter = lv_bar_create(root)
lv_obj_set_size(meter, 124, 10)
lv_obj_set_pos(meter, 176, 196)
lv_bar_set_range(meter, 0, 100)
lv_bar_set_value(meter, 24, LV_ANIM_OFF)

local tick = 0
local load = 24
local terminal_timer = tmr.create()
terminal_timer:alarm(500, tmr.ALARM_AUTO, function()
    tick = tick + 1
    load = load + 9
    if load > 100 then
        load = 12
    end

    local blink = "_"
    if tick % 2 == 0 then
        blink = " "
    end

    lv_label_set_text(boot, "BOOT LOG  00:00:" .. tostring(tick))
    lv_label_set_text(cursor, "> scan packet " .. tostring(tick) .. blink)
    lv_bar_set_value(meter, load, LV_ANIM_ON)

    if tick % 6 == 0 then
        lv_label_set_text(task, "[APP OK] lua timers +" .. tostring(tick))
    end
end)

print("demo terminal status ready")
