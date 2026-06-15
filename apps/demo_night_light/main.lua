local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x1a0f08)
lv_obj_set_style_text_color(root, 0xffe8c7)

local WARM_AMBER = 0xffb45c
local SOFT_GOLD = 0xffd28a
local DEEP_WARM = 0x2a160a

local function panel(x, y, w, h, color, radius)
    local obj = lv_obj_create(root)
    lv_obj_set_size(obj, w, h)
    lv_obj_set_pos(obj, x, y)
    lv_obj_set_style_bg_color(obj, color)
    lv_obj_set_style_radius(obj, radius)
    lv_obj_set_style_border_width(obj, 0)
    lv_obj_set_style_pad_all(obj, 0)
    return obj
end

local glow = panel(60, 34, 200, 142, DEEP_WARM, 8)
local moon = panel(112, 54, 96, 96, WARM_AMBER, 8)
local shade = panel(142, 46, 80, 106, 0x1a0f08, 8)

local title = lv_label_create(root)
lv_label_set_text(title, "night light")
lv_obj_set_style_text_color(title, SOFT_GOLD)
lv_obj_set_pos(title, 110, 178)

local hint = lv_label_create(root)
lv_label_set_text(hint, "breath 01")
lv_obj_set_style_text_color(hint, 0xc58b52)
lv_obj_set_pos(hint, 122, 204)

local step = 0
local sizes = { 188, 196, 204, 212, 204, 196 }
local colors = { 0x2a160a, 0x331b0c, 0x3c210f, 0x472813, 0x3c210f, 0x331b0c }

local night_timer = tmr.create()
night_timer:alarm(900, tmr.ALARM_AUTO, function()
    step = step + 1
    local index = (step % #sizes) + 1
    local size = sizes[index]
    local x = 160 - math.floor(size / 2)
    lv_obj_set_size(glow, size, 142)
    lv_obj_set_pos(glow, x, 34)
    lv_obj_set_style_bg_color(glow, colors[index])
    lv_label_set_text(hint, "breath 0" .. tostring(index))
end)

print("demo night light ready")
