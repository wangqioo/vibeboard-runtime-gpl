local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x0b0f14)
lv_obj_set_style_text_color(root, 0xe5e7eb)

local FACE = 0x111827
local RING = 0x9ca3af
local TICK = 0xf9fafb
local ACCENT = 0x38bdf8
local HOUR = 0xf8fafc
local MINUTE = 0x93c5fd
local SECOND = 0xf97316
local DIM = 0x374151

local CX = 160
local CY = 124
local R = 88

local function box(parent, x, y, w, h, color, radius)
    local obj = lv_obj_create(parent)
    lv_obj_set_size(obj, w, h)
    lv_obj_set_pos(obj, x, y)
    lv_obj_set_style_bg_color(obj, color)
    lv_obj_set_style_radius(obj, radius or 2)
    lv_obj_set_style_pad_all(obj, 0)
    lv_obj_set_style_border_width(obj, 0)
    return obj
end

local face = box(root, CX - R, CY - R, R * 2, R * 2, FACE, 44)
lv_obj_set_style_border_width(face, 2)
lv_obj_set_style_border_color(face, RING)

local title = lv_label_create(root)
lv_label_set_text(title, "Holocubic Clock")
lv_obj_set_style_text_color(title, 0xd1d5db)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 12)

local subtitle = lv_label_create(root)
lv_label_set_text(subtitle, "object-drawn analog port")
lv_obj_set_style_text_color(subtitle, DIM)
lv_obj_align(subtitle, LV_ALIGN_TOP_MID, 0, 34)

local ticks = {
    box(root, CX - 2, CY - 78, 4, 18, TICK, 2),
    box(root, CX + 60, CY - 2, 18, 4, TICK, 2),
    box(root, CX - 2, CY + 60, 4, 18, TICK, 2),
    box(root, CX - 78, CY - 2, 18, 4, TICK, 2),
    box(root, CX + 39, CY - 66, 4, 10, DIM, 2),
    box(root, CX + 58, CY - 43, 10, 4, DIM, 2),
    box(root, CX + 58, CY + 39, 10, 4, DIM, 2),
    box(root, CX + 39, CY + 57, 4, 10, DIM, 2),
    box(root, CX - 43, CY + 57, 4, 10, DIM, 2),
    box(root, CX - 68, CY + 39, 10, 4, DIM, 2),
    box(root, CX - 68, CY - 43, 10, 4, DIM, 2),
    box(root, CX - 43, CY - 66, 4, 10, DIM, 2)
}

local hour_hand = box(root, CX - 5, CY - 8, 10, 48, HOUR, 4)
local minute_hand = box(root, CX - 3, CY - 58, 6, 62, MINUTE, 3)
local second_hand = box(root, CX - 1, CY - 66, 2, 72, SECOND, 1)
local hub = box(root, CX - 8, CY - 8, 16, 16, ACCENT, 8)

local readout = lv_label_create(root)
lv_label_set_text(readout, "10:08:42")
lv_obj_set_style_text_color(readout, 0xf8fafc)
lv_obj_align(readout, LV_ALIGN_BOTTOM_LEFT, 112, -14)

local hour = 10
local minute = 8
local second = 42

local positions = {
    { hx = -5, hy = -8, hw = 10, hh = 48, mx = -3, my = -58, mw = 6, mh = 62, sx = -1, sy = -66, sw = 2, sh = 72 },
    { hx = -8, hy = -44, hw = 12, hh = 42, mx = -3, my = -58, mw = 6, mh = 62, sx = -1, sy = -66, sw = 2, sh = 72 },
    { hx = -8, hy = -44, hw = 12, hh = 42, mx = 0, my = -3, mw = 62, mh = 6, sx = 0, sy = -1, sw = 72, sh = 2 },
    { hx = -4, hy = -44, hw = 12, hh = 42, mx = 0, my = -3, mw = 62, mh = 6, sx = 0, sy = -1, sw = 72, sh = 2 },
    { hx = -4, hy = -2, hw = 12, hh = 44, mx = -3, my = 0, mw = 6, mh = 62, sx = -1, sy = 0, sw = 2, sh = 72 },
    { hx = -5, hy = -8, hw = 10, hh = 48, mx = -3, my = 0, mw = 6, mh = 62, sx = -1, sy = 0, sw = 2, sh = 72 }
}

local function pad2(value)
    if value < 10 then
        return "0" .. value
    end
    return tostring(value)
end

local function set_hand(obj, x, y, w, h)
    lv_obj_set_pos(obj, CX + x, CY + y)
    lv_obj_set_size(obj, w, h)
end

local function draw()
    local index = (math.floor(second / 10) % #positions) + 1
    local p = positions[index]
    set_hand(hour_hand, p.hx, p.hy, p.hw, p.hh)
    set_hand(minute_hand, p.mx, p.my, p.mw, p.mh)
    set_hand(second_hand, p.sx, p.sy, p.sw, p.sh)
    lv_label_set_text(readout, pad2(hour) .. ":" .. pad2(minute) .. ":" .. pad2(second))
end

local timer = tmr.create()
timer:alarm(1000, tmr.ALARM_AUTO, function()
    second = second + 1
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
        print("Holocubic analog minute")
    end
    draw()
end)

draw()
print("Holocubic analog clock ready")
