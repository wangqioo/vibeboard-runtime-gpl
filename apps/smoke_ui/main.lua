local root = lv_scr_act()
lv_obj_clean(root)

local label = lv_label_create(root)
lv_label_set_text(label, "Hello LVGL Lua")
lv_obj_align(label, LV_ALIGN_CENTER, 0, 0)

print("lvgl smoke ok")
