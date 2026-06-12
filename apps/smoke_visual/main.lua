print("smoke visual start")

local icon_path = lv_resolve_asset_path("assets/icon.bmp")
local asset_ok, asset_detail = lv_asset_exists(icon_path)
if not asset_ok then
    error("visual asset missing: " .. tostring(asset_detail))
end

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x101820)

local title = lv_label_create(root)
lv_label_set_text(title, "VibeBoard Visual")
lv_obj_set_style_text_color(title, 0xf6f7f9)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 10)

local image = lv_img_create(root)
lv_img_set_src(image, icon_path)
lv_obj_set_pos(image, 18, 46)

local button = lv_btn_create(root)
lv_obj_set_size(button, 128, 46)
lv_obj_set_pos(button, 168, 52)
lv_obj_set_style_bg_color(button, 0x2f80ed)
lv_obj_set_style_radius(button, 8)

local button_label = lv_label_create(button)
lv_label_set_text(button_label, "READY")
lv_obj_set_style_text_color(button_label, 0xffffff)
lv_obj_align(button_label, LV_ALIGN_CENTER, 0, 0)

local bar = lv_bar_create(root)
lv_obj_set_size(bar, 274, 18)
lv_obj_set_pos(bar, 22, 156)
lv_bar_set_range(bar, 0, 100)
lv_bar_set_value(bar, 12, LV_ANIM_OFF)

local status = lv_label_create(root)
lv_label_set_text(status, "BMP + button + bar")
lv_label_set_long_mode(status, LV_LABEL_LONG_CLIP)
lv_obj_set_style_text_color(status, 0xa9c7ff)
lv_obj_set_width(status, 280)
lv_obj_set_pos(status, 20, 196)

local progress = 12
local timer = tmr.create()
timer:alarm(500, tmr.ALARM_AUTO, function()
    progress = progress + 11
    if progress > 100 then
        progress = 0
    end
    lv_bar_set_value(bar, progress, LV_ANIM_ON)
    lv_label_set_text(status, "BMP asset ok " .. progress .. "%")
    print("smoke visual progress " .. progress)
end)

print("smoke visual ok " .. icon_path)
