local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x0b1020)
lv_obj_set_style_text_color(root, 0xf8fafc)

local PIXEL_SIZE = 12
local PET_GREEN = 0x95ff5c
local PET_DARK = 0x16271a
local PET_EYE = 0x050816
local PET_BLUSH = 0xff7aa8

local pixels = {}

local function px(x, y, color)
    local obj = lv_obj_create(root)
    lv_obj_set_size(obj, PIXEL_SIZE, PIXEL_SIZE)
    lv_obj_set_pos(obj, 64 + (x * PIXEL_SIZE), 34 + (y * PIXEL_SIZE))
    lv_obj_set_style_bg_color(obj, color)
    lv_obj_set_style_radius(obj, 0)
    lv_obj_set_style_border_width(obj, 0)
    lv_obj_set_style_pad_all(obj, 0)
    pixels[#pixels + 1] = obj
    return obj
end

local function clear_pet()
    for i = 1, #pixels do
        lv_obj_set_style_bg_color(pixels[i], 0x0b1020)
    end
end

local body = {
    { 3, 0 }, { 4, 0 }, { 5, 0 }, { 6, 0 },
    { 2, 1 }, { 3, 1 }, { 4, 1 }, { 5, 1 }, { 6, 1 }, { 7, 1 },
    { 1, 2 }, { 2, 2 }, { 3, 2 }, { 4, 2 }, { 5, 2 }, { 6, 2 }, { 7, 2 }, { 8, 2 },
    { 1, 3 }, { 2, 3 }, { 3, 3 }, { 4, 3 }, { 5, 3 }, { 6, 3 }, { 7, 3 }, { 8, 3 },
    { 1, 4 }, { 2, 4 }, { 3, 4 }, { 4, 4 }, { 5, 4 }, { 6, 4 }, { 7, 4 }, { 8, 4 },
    { 2, 5 }, { 3, 5 }, { 4, 5 }, { 5, 5 }, { 6, 5 }, { 7, 5 },
    { 3, 6 }, { 4, 6 }, { 6, 6 }, { 7, 6 }
}

for i = 1, #body do
    px(body[i][1], body[i][2], PET_GREEN)
end

local left_eye = px(3, 2, PET_EYE)
local right_eye = px(6, 2, PET_EYE)
local mouth = px(4, 4, PET_DARK)
local blush_l = px(2, 3, PET_BLUSH)
local blush_r = px(7, 3, PET_BLUSH)

local label = lv_label_create(root)
lv_label_set_text(label, "PIXEL PET")
lv_obj_set_style_text_color(label, PET_GREEN)
lv_obj_set_pos(label, 104, 140)

local mood = lv_label_create(root)
lv_label_set_text(mood, "mood: blink")
lv_obj_set_style_text_color(mood, 0xb7f7a1)
lv_obj_set_pos(mood, 96, 168)

local energy_bar = lv_bar_create(root)
lv_obj_set_size(energy_bar, 176, 12)
lv_obj_set_pos(energy_bar, 72, 198)
lv_bar_set_range(energy_bar, 0, 100)
lv_bar_set_value(energy_bar, 74, LV_ANIM_OFF)

local tick = 0
local energy = 74

local function draw_pet(mode)
    if mode == "blink" then
        lv_obj_set_style_bg_color(left_eye, PET_GREEN)
        lv_obj_set_style_bg_color(right_eye, PET_GREEN)
        lv_obj_set_style_bg_color(mouth, PET_DARK)
        lv_label_set_text(mood, "mood: blink")
    elseif mode == "happy" then
        lv_obj_set_style_bg_color(left_eye, PET_EYE)
        lv_obj_set_style_bg_color(right_eye, PET_EYE)
        lv_obj_set_style_bg_color(mouth, PET_BLUSH)
        lv_label_set_text(mood, "mood: snack")
    else
        lv_obj_set_style_bg_color(left_eye, PET_EYE)
        lv_obj_set_style_bg_color(right_eye, PET_EYE)
        lv_obj_set_style_bg_color(mouth, PET_DARK)
        lv_label_set_text(mood, "mood: idle")
    end
end

local pet_timer = tmr.create()
pet_timer:alarm(650, tmr.ALARM_AUTO, function()
    tick = tick + 1
    energy = energy - 6
    if energy < 20 then
        energy = 96
    end

    if tick % 5 == 0 then
        draw_pet("happy")
    elseif tick % 2 == 0 then
        draw_pet("blink")
    else
        draw_pet("idle")
    end
    lv_bar_set_value(energy_bar, energy, LV_ANIM_ON)
end)

clear_pet()
for i = 1, #body do
    lv_obj_set_style_bg_color(pixels[i], PET_GREEN)
end
draw_pet("idle")
print("demo pixel pet ready")
