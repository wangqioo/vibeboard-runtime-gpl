local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x101418)
lv_obj_set_style_bg_opa(root, 255)

local canvas = lv_canvas_create(root, 200, 120, LV_IMG_CF_TRUE_COLOR)
lv_obj_set_pos(canvas, 60, 58)
lv_canvas_fill_bg(canvas, 0x000000, 255)

local title = lv_label_create(root)
lv_label_set_text(title, "smoke canvas")
lv_obj_set_style_text_color(title, 0xe5e7eb)
lv_obj_set_pos(title, 20, 20)

local colors = { 0x39ff14, 0x00f5ff, 0xffd166, 0xff2bd6 }
local tick = 0

local function redraw()
    tick = tick + 1
    local color = colors[(tick % #colors) + 1]
    local bar = 24 + ((tick * 17) % 130)

    lv_canvas_fill_bg(canvas, 0x000000, 255)
    lv_canvas_draw_rect(canvas, 10, 18, 180, 84, {
        bg_color = 0x061014,
        bg_opa = 255,
        border_color = color,
        border_opa = 255,
        border_width = 2,
        radius = 6
    })
    lv_canvas_draw_rect(canvas, 24, 76, bar, 8, color, 210)
    lv_canvas_draw_text(canvas, 22, 32, 156, "CANVAS OK", {
        color = 0xffffff,
        opa = 255,
        align = LV_TEXT_ALIGN_CENTER
    })
    lv_obj_invalidate(canvas)
end

redraw()

local canvas_timer = tmr.create()
canvas_timer:alarm(500, tmr.ALARM_AUTO, function()
    redraw()
    print("smoke canvas ok", tick)
end)
