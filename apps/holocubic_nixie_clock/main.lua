local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x050506)
lv_obj_set_style_text_color(root, 0xfff2d0)

local TUBE_BG = 0x120805
local TUBE_BORDER = 0x6f2a12
local GLOW = 0xff8a2a
local DIM = 0x30130b
local DIGIT = 0xffd08a
local LABEL = 0xf5b56b
local OFF = 0x160806

local DIGIT_W = 42
local DIGIT_H = 76
local SEG = 7
local START_X = 22
local START_Y = 76
local GAP = 11

local function box(parent, x, y, w, h, color, radius)
    local obj = lv_obj_create(parent)
    lv_obj_set_size(obj, w, h)
    lv_obj_set_pos(obj, x, y)
    lv_obj_set_style_bg_color(obj, color)
    lv_obj_set_style_radius(obj, radius or 3)
    lv_obj_set_style_pad_all(obj, 0)
    lv_obj_set_style_border_width(obj, 0)
    return obj
end

local function tube(x)
    local back = box(root, x - 7, START_Y - 12, DIGIT_W + 14, DIGIT_H + 24, TUBE_BG, 8)
    lv_obj_set_style_border_width(back, 1)
    lv_obj_set_style_border_color(back, TUBE_BORDER)
    box(root, x - 2, START_Y - 7, DIGIT_W + 4, DIGIT_H + 14, DIM, 6)
    return back
end

local function segment(x, y, w, h)
    return box(root, x, y, w, h, DIGIT, 2)
end

local function make_digit(x)
    tube(x)
    return {
        segment(x + SEG, START_Y, DIGIT_W - SEG * 2, SEG),
        segment(x + DIGIT_W - SEG, START_Y + SEG, SEG, 25),
        segment(x + DIGIT_W - SEG, START_Y + 44, SEG, 25),
        segment(x + SEG, START_Y + DIGIT_H - SEG, DIGIT_W - SEG * 2, SEG),
        segment(x, START_Y + 44, SEG, 25),
        segment(x, START_Y + SEG, SEG, 25),
        segment(x + SEG, START_Y + 35, DIGIT_W - SEG * 2, SEG)
    }
end

local maps = {
    [0] = { 1, 1, 1, 1, 1, 1, 0 },
    [1] = { 0, 1, 1, 0, 0, 0, 0 },
    [2] = { 1, 1, 0, 1, 1, 0, 1 },
    [3] = { 1, 1, 1, 1, 0, 0, 1 },
    [4] = { 0, 1, 1, 0, 0, 1, 1 },
    [5] = { 1, 0, 1, 1, 0, 1, 1 },
    [6] = { 1, 0, 1, 1, 1, 1, 1 },
    [7] = { 1, 1, 1, 0, 0, 0, 0 },
    [8] = { 1, 1, 1, 1, 1, 1, 1 },
    [9] = { 1, 1, 1, 1, 0, 1, 1 }
}

local function draw_digit(parts, value)
    local map = maps[value]
    for i = 1, 7 do
        if map[i] == 1 then
            lv_obj_set_style_bg_color(parts[i], DIGIT)
        else
            lv_obj_set_style_bg_color(parts[i], OFF)
        end
    end
end

local title = lv_label_create(root)
lv_label_set_text(title, "Holocubic Nixie")
lv_obj_set_style_text_color(title, LABEL)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 16)

local subtitle = lv_label_create(root)
lv_label_set_text(subtitle, "safe LVGL port")
lv_obj_set_style_text_color(subtitle, 0x9f6b42)
lv_obj_align(subtitle, LV_ALIGN_TOP_MID, 0, 38)

local x1 = START_X
local x2 = START_X + DIGIT_W + GAP
local x3 = START_X + DIGIT_W * 2 + GAP * 3 + 14
local x4 = START_X + DIGIT_W * 3 + GAP * 4 + 14

local digits = {
    make_digit(x1),
    make_digit(x2),
    make_digit(x3),
    make_digit(x4)
}

local colon_x = START_X + DIGIT_W * 2 + GAP * 2 + 2
local colon_top = box(root, colon_x, START_Y + 24, 8, 8, GLOW, 4)
local colon_bottom = box(root, colon_x, START_Y + 48, 8, 8, GLOW, 4)

local foot = lv_label_create(root)
lv_label_set_text(foot, "from upstream NixieClock")
lv_obj_set_style_text_color(foot, 0x7c4a2b)
lv_obj_align(foot, LV_ALIGN_BOTTOM_LEFT, 18, -16)

local hour = 12
local minute = 58
local second = 0
local blink = true

local function draw()
    draw_digit(digits[1], math.floor(hour / 10))
    draw_digit(digits[2], hour % 10)
    draw_digit(digits[3], math.floor(minute / 10))
    draw_digit(digits[4], minute % 10)
    local color = GLOW
    if not blink then
        color = OFF
    end
    lv_obj_set_style_bg_color(colon_top, color)
    lv_obj_set_style_bg_color(colon_bottom, color)
end

local timer = tmr.create()
timer:alarm(1000, tmr.ALARM_AUTO, function()
    second = second + 1
    blink = not blink
    if second >= 60 then
        second = 0
        minute = minute + 1
        if minute >= 60 then
            minute = 0
            hour = hour + 1
            if hour >= 24 then
                hour = 0
            end
        end
        print("Holocubic Nixie minute")
    end
    draw()
end)

draw()
print("Holocubic Nixie clock ready")
