local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x111827)
lv_obj_set_style_text_color(root, 0xf9fafb)

local card = lv_obj_create(root)
lv_obj_set_size(card, 284, 194)
lv_obj_set_style_bg_color(card, 0x1f2937)
lv_obj_set_style_radius(card, 8)
lv_obj_set_style_pad_all(card, 0)
lv_obj_set_style_border_width(card, 1)
lv_obj_set_style_border_color(card, 0xf59e0b)
lv_obj_align(card, LV_ALIGN_CENTER, 0, 0)

local title = lv_label_create(card)
lv_label_set_text(title, "Lucky Card")
lv_obj_set_style_text_color(title, 0xfbbf24)
lv_obj_align(title, LV_ALIGN_TOP_LEFT, 18, 14)

local number = lv_label_create(card)
lv_label_set_text(number, "#01")
lv_obj_set_style_text_color(number, 0x93c5fd)
lv_obj_align(number, LV_ALIGN_TOP_LEFT, 224, 16)

local line = lv_label_create(card)
lv_label_set_text(line, "Ship the smallest thing.")
lv_obj_set_style_text_color(line, 0xf8fafc)
lv_obj_set_width(line, 236)
lv_label_set_long_mode(line, LV_LABEL_LONG_WRAP)
lv_obj_align(line, LV_ALIGN_TOP_LEFT, 24, 70)

local hint = lv_label_create(card)
lv_label_set_text(hint, "next card in 4s")
lv_obj_set_style_text_color(hint, 0x9ca3af)
lv_obj_align(hint, LV_ALIGN_BOTTOM_LEFT, 24, -22)

local cards = {
    "Ship the smallest thing.",
    "Make it visible.",
    "One clean loop beats ten ideas.",
    "Trust the boring path.",
    "Delete one risky feature.",
    "Name the thing clearly.",
    "Test the happy path.",
    "Leave room for wonder."
}

local tick = 0
local lucky_timer = tmr.create()
lucky_timer:alarm(4000, tmr.ALARM_AUTO, function()
    tick = tick + 1
    local index = (tick % #cards) + 1
    local prefix = "#"
    if index < 10 then
        prefix = "#0"
    end
    lv_label_set_text(number, prefix .. index)
    lv_label_set_text(line, cards[index])
    lv_label_set_text(hint, "card " .. index .. " of " .. #cards)
    print("lucky card " .. index)
end)

print("demo lucky card ready")
