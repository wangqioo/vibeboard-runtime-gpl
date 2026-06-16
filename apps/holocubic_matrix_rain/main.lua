local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x000000)
lv_obj_set_style_bg_opa(root, 255)

local SCREEN_W = 320
local SCREEN_H = 240
local COLUMN_W = 24
local ROW_H = 16
local COL_COUNT = math.floor(SCREEN_W / COLUMN_W)
local ROW_COUNT = math.floor(SCREEN_H / ROW_H) + 2
local TRAIL = 6

local C = {
    bg = 0x000000,
    head = 0xf2fff4,
    hot = 0x9cffb1,
    body = 0x16e66a,
    mid = 0x0a8f3d,
    tail = 0x083018,
    glow = 0x00ff66
}

local glyphs = {
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "A", "B", "C", "D", "E", "F", "H", "K", "M", "N",
    "R", "S", "T", "V", "X", "Y", "Z", "#", "+", "/"
}

math.randomseed(tmr.now())
math.random()
math.random()
math.random()

local canvas = lv_canvas_create(root, SCREEN_W, SCREEN_H, LV_IMG_CF_TRUE_COLOR)
lv_obj_set_pos(canvas, 0, 0)

local label = lv_label_create(root)
lv_label_set_text(label, "Holocubic Matrix Rain")
lv_obj_set_style_text_color(label, 0x65ff91)
lv_obj_set_pos(label, 12, 10)

local columns = {}

local function reset_column(column, initial)
    column.head = initial and math.random(0, ROW_COUNT) or -math.random(1, ROW_COUNT)
    column.speed = math.random(1, 3)
    column.tick = 0
    column.length = math.random(5, TRAIL + 4)
    column.chars = {}
    for row = 1, ROW_COUNT do
        column.chars[row] = glyphs[math.random(1, #glyphs)]
    end
end

for i = 1, COL_COUNT do
    columns[i] = { x = (i - 1) * COLUMN_W }
    reset_column(columns[i], true)
end

local function color_for(offset)
    if offset == 0 then
        return C.head, 255
    end
    if offset == 1 then
        return C.hot, 230
    end
    if offset < 4 then
        return C.body, 190
    end
    if offset < 7 then
        return C.mid, 125
    end
    return C.tail, 72
end

local function update_column(column)
    column.tick = column.tick + 1
    if column.tick >= column.speed then
        column.tick = 0
        column.head = column.head + 1
        if column.head >= 0 and column.head < ROW_COUNT then
            column.chars[column.head + 1] = glyphs[math.random(1, #glyphs)]
        end
    end

    if math.random(1, 100) <= 28 then
        column.chars[math.random(1, ROW_COUNT)] = glyphs[math.random(1, #glyphs)]
    end

    if column.head - column.length > ROW_COUNT then
        reset_column(column, false)
    end
end

local function draw_column(column)
    for offset = column.length, 0, -1 do
        local row = column.head - offset
        if row >= 0 and row < ROW_COUNT then
            local y = row * ROW_H
            local color, opa = color_for(offset)
            if offset == 0 then
                lv_canvas_draw_rect(canvas, column.x + 3, y + 2, COLUMN_W - 6, ROW_H - 2, {
                    bg_color = C.glow,
                    bg_opa = 26,
                    radius = 3,
                    border_width = 0
                })
            end
            lv_canvas_draw_text(canvas, column.x, y, COLUMN_W, column.chars[row + 1], {
                color = color,
                opa = opa,
                align = LV_TEXT_ALIGN_CENTER
            })
        end
    end
end

local function redraw()
    lv_canvas_frame_begin(canvas)
    lv_canvas_fill_bg(canvas, C.bg, 255)
    for i = 1, COL_COUNT do
        update_column(columns[i])
        draw_column(columns[i])
    end
    lv_canvas_frame_end(canvas)
    lv_obj_invalidate(canvas)
end

redraw()

local rain_timer = tmr.create()
rain_timer:alarm(180, tmr.ALARM_AUTO, function()
    redraw()
end)
