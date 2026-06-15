local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x000000)

local SEGMENT_COLOR = 0xffffff
local OFF_COLOR = 0x000000
local DIGIT_W = 46
local DIGIT_H = 92
local SEG_THICK = 9
local DIGIT_GAP = 10
local START_X = 16
local START_Y = 58

local function segment(parent, x, y, w, h)
    local obj = lv_obj_create(parent)
    lv_obj_set_size(obj, w, h)
    lv_obj_set_pos(obj, x, y)
    lv_obj_set_style_bg_color(obj, SEGMENT_COLOR)
    lv_obj_set_style_radius(obj, 2)
    lv_obj_set_style_pad_all(obj, 0)
    lv_obj_set_style_border_width(obj, 0)
    return obj
end

local function make_digit(x, y)
    return {
        segment(root, x + SEG_THICK, y, DIGIT_W - (SEG_THICK * 2), SEG_THICK),
        segment(root, x + DIGIT_W - SEG_THICK, y + SEG_THICK, SEG_THICK, 32),
        segment(root, x + DIGIT_W - SEG_THICK, y + 50, SEG_THICK, 32),
        segment(root, x + SEG_THICK, y + DIGIT_H - SEG_THICK, DIGIT_W - (SEG_THICK * 2), SEG_THICK),
        segment(root, x, y + 50, SEG_THICK, 32),
        segment(root, x, y + SEG_THICK, SEG_THICK, 32),
        segment(root, x + SEG_THICK, y + 42, DIGIT_W - (SEG_THICK * 2), SEG_THICK)
    }
end

local function draw_digit(parts, value)
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
    local map = maps[value]
    for i = 1, 7 do
        if map[i] == 1 then
            lv_obj_set_style_bg_color(parts[i], SEGMENT_COLOR)
        else
            lv_obj_set_style_bg_color(parts[i], OFF_COLOR)
        end
    end
end

local function dot(x, y)
    local obj = lv_obj_create(root)
    lv_obj_set_size(obj, 9, 9)
    lv_obj_set_pos(obj, x, y)
    lv_obj_set_style_bg_color(obj, SEGMENT_COLOR)
    lv_obj_set_style_radius(obj, 2)
    lv_obj_set_style_pad_all(obj, 0)
    lv_obj_set_style_border_width(obj, 0)
    return obj
end

local colon_x = START_X + (DIGIT_W * 2) + (DIGIT_GAP * 2) + 2
local colon_top = dot(colon_x, START_Y + 26)
local colon_bottom = dot(colon_x, START_Y + 58)

local digit1 = make_digit(START_X, START_Y)
local digit2 = make_digit(START_X + DIGIT_W + DIGIT_GAP, START_Y)
local digit3 = make_digit(START_X + (DIGIT_W * 2) + (DIGIT_GAP * 3) + 18, START_Y)
local digit4 = make_digit(START_X + (DIGIT_W * 3) + (DIGIT_GAP * 4) + 18, START_Y)

local hour = 10
local minute = 8
local second = 42
local blink = true

local function draw_colon(visible)
    local color = OFF_COLOR
    if visible then
        color = SEGMENT_COLOR
    end
    lv_obj_set_style_bg_color(colon_top, color)
    lv_obj_set_style_bg_color(colon_bottom, color)
end

local function draw_clock()
    draw_digit(digit1, math.floor(hour / 10))
    draw_digit(digit2, hour % 10)
    draw_digit(digit3, math.floor(minute / 10))
    draw_digit(digit4, minute % 10)
    draw_colon(blink)
end

local clock_timer = tmr.create()
clock_timer:alarm(1000, tmr.ALARM_AUTO, function()
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
        print("simple digital clock minute")
    end
    draw_clock()
end)

draw_clock()
print("demo digital clock simple ready")
