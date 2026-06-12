print("smoke assets start")

if not file or not file.exists then
    error("file module missing")
end
if not lv_resolve_asset_path or not lv_asset_exists or not lv_img_create or not lv_img_set_src then
    error("asset lvgl api missing")
end
if not file.exists("assets/icon.bin") then
    error("asset missing")
end

local resolved = lv_resolve_asset_path("assets/icon.bin")
print("asset path", resolved)
if resolved ~= "S:/apps/smoke_assets/assets/icon.bin" then
    error("unexpected asset path: " .. tostring(resolved))
end

local from_sd = lv_resolve_asset_path("/sd/apps/smoke_assets/assets/icon.bin")
if from_sd ~= resolved then
    error("unexpected /sd asset path: " .. tostring(from_sd))
end

local from_drive = lv_resolve_asset_path("S:/apps/smoke_assets/assets/icon.bin")
if from_drive ~= resolved then
    error("unexpected S drive asset path: " .. tostring(from_drive))
end

local asset_ok, asset_result = lv_asset_exists(resolved)
if not asset_ok then
    error("lv asset missing: " .. tostring(asset_result))
end
print("asset fs ok", asset_result)

local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_set_style_bg_color(root, 0x0f172a)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)

local title = lv_label_create(root)
lv_label_set_text(title, "Asset Path")
lv_obj_set_style_text_color(title, 0xffffff)
lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 28)

local image = lv_img_create(root)
local image_src = lv_img_set_src(image, resolved)
lv_obj_set_pos(image, 128, 96)

local status = lv_label_create(root)
lv_label_set_text(status, image_src)
lv_label_set_long_mode(status, LV_LABEL_LONG_CLIP)
lv_obj_set_style_text_color(status, 0x38bdf8)
lv_obj_set_width(status, 292)
lv_obj_set_x(status, 12)
lv_obj_set_y(status, 210)

local hidden = lv_label_create(root)
lv_label_set_text(hidden, "hidden")
lv_obj_add_flag(hidden, LV_OBJ_FLAG_HIDDEN)

print("smoke assets ok", image_src)
