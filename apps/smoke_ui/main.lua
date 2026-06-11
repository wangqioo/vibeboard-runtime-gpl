local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_set_style_bg_color(root, 0x101418)
lv_obj_set_style_text_color(root, 0xf4f7fb)

local card = lv_obj_create(root)
lv_obj_set_size(card, 288, 196)
lv_obj_set_style_bg_color(card, 0x18212b)
lv_obj_set_style_radius(card, 8)
lv_obj_set_style_pad_all(card, 0)
lv_obj_set_style_border_width(card, 1)
lv_obj_set_style_border_color(card, 0x334155)
lv_obj_align(card, LV_ALIGN_CENTER, 0, 0)

local title = lv_label_create(card)
lv_label_set_text(title, "VibeBoard Weather")
lv_obj_set_style_text_color(title, 0xe5edf6)
lv_obj_set_width(title, 240)
lv_obj_align(title, LV_ALIGN_TOP_LEFT, 16, 14)

local location = lv_label_create(card)
lv_label_set_text(location, "Shanghai")
lv_obj_set_style_text_color(location, 0x94a3b8)
lv_obj_align(location, LV_ALIGN_TOP_LEFT, 16, 40)

local temp = lv_label_create(card)
lv_label_set_text(temp, "26C")
lv_obj_set_style_text_color(temp, 0x7dd3fc)
lv_obj_align(temp, LV_ALIGN_TOP_LEFT, 16, 82)

local condition = lv_label_create(card)
lv_label_set_text(condition, "Cloudy")
lv_obj_set_style_text_color(condition, 0xfbbf24)
lv_obj_align(condition, LV_ALIGN_TOP_LEFT, 112, 92)

local humidity = lv_label_create(card)
lv_label_set_text(humidity, "Humidity 68%")
lv_obj_set_style_text_color(humidity, 0xcbd5e1)
lv_obj_align(humidity, LV_ALIGN_BOTTOM_LEFT, 16, -42)

local wind = lv_label_create(card)
lv_label_set_text(wind, "Wind 12 km/h")
lv_obj_set_style_text_color(wind, 0xcbd5e1)
lv_obj_align(wind, LV_ALIGN_BOTTOM_LEFT, 16, -20)

local updated = lv_label_create(card)
lv_label_set_text(updated, "Updated 00s")
lv_obj_set_style_text_color(updated, 0x64748b)
lv_obj_align(updated, LV_ALIGN_TOP_LEFT, 178, 40)

local ticks = 0
set_interval(1000, function()
    ticks = ticks + 1
    if ticks < 10 then
        lv_label_set_text(updated, "Updated 0" .. ticks .. "s")
    else
        lv_label_set_text(updated, "Updated " .. ticks .. "s")
    end
    if ticks <= 3 then
        print("weather card tick", ticks)
    end
end)

print("weather card dynamic ok")
