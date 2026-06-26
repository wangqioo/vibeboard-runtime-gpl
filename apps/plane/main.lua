if _G.PLANE_APP and _G.PLANE_APP.stop then
  pcall(function() _G.PLANE_APP.stop("reload") end)
end

PLANE_APP = {
  VERSION = "2026-06-25-minimal-sprite-plane",
  APP_DIR = "/sd/apps/plane",
  ASSET_DIR = "assets",
  METRICS_PATH = "metrics.json",
  SCREEN_W = 320,
  SCREEN_H = 240,
  TICK_MS = 50,
  plane_ready = false,
  frames = 0,
  shots = 0,
  enemies_spawned = 0,
  score = 0,
  player_x = 142,
  player_y = 194,
  last_key = "",
  last_error = "",
  timers = {},
  ui = {},
  bullets = {},
  enemies = {}
}

local APP = PLANE_APP
_G.PLANE_APP = APP

local MAIN = (rawget(_G, "LV_PART_MAIN") or 0) | (rawget(_G, "LV_STATE_DEFAULT") or 0)
local KEY_NAMES = {}
if key then
  KEY_NAMES[key.LEFT] = "LEFT"
  KEY_NAMES[key.RIGHT] = "RIGHT"
  KEY_NAMES[key.UP] = "UP"
  KEY_NAMES[key.DOWN] = "DOWN"
  KEY_NAMES[key.HOME] = "HOME"
  KEY_NAMES[key.EXIT] = "EXIT"
end

local function json_escape(value)
  value = tostring(value or "")
  value = string.gsub(value, "\\", "\\\\")
  value = string.gsub(value, '"', '\\"')
  value = string.gsub(value, "\n", "\\n")
  return value
end

local function write_metrics()
  if not file or not file.write then return end
  local body = "{"
    .. '"plane_ready":' .. tostring(APP.plane_ready)
    .. ',"frames":' .. tostring(APP.frames)
    .. ',"shots":' .. tostring(APP.shots)
    .. ',"enemies_spawned":' .. tostring(APP.enemies_spawned)
    .. ',"score":' .. tostring(APP.score)
    .. ',"player_x":' .. tostring(APP.player_x)
    .. ',"player_y":' .. tostring(APP.player_y)
    .. ',"last_key":"' .. json_escape(APP.last_key) .. '"'
    .. ',"last_error":"' .. json_escape(APP.last_error) .. '"'
    .. "}"
  pcall(function() file.write(APP.METRICS_PATH, body) end)
end

local function sd_to_lv(path)
  if type(path) == "string" and path:sub(1, 4) == "/sd/" then
    return "S:/" .. path:sub(5)
  end
  return path
end

local function asset_path(name)
  return sd_to_lv(APP.APP_DIR .. "/" .. APP.ASSET_DIR .. "/" .. name)
end

local function set_text(obj, text)
  if obj and lv_label_set_text then
    pcall(function() lv_label_set_text(obj, tostring(text or "")) end)
  end
end

local function style_text(obj, color, opa)
  if not obj then return end
  if lv_obj_set_style_text_color then pcall(function() lv_obj_set_style_text_color(obj, color, MAIN) end) end
  if lv_obj_set_style_text_opa then pcall(function() lv_obj_set_style_text_opa(obj, opa or 255, MAIN) end) end
end

local function style_panel(obj, color, opa)
  if not obj then return end
  if lv_obj_set_style_bg_color then pcall(function() lv_obj_set_style_bg_color(obj, color, MAIN) end) end
  if lv_obj_set_style_bg_opa then pcall(function() lv_obj_set_style_bg_opa(obj, opa or 255, MAIN) end) end
  if lv_obj_set_style_border_width then pcall(function() lv_obj_set_style_border_width(obj, 0, MAIN) end) end
  if lv_obj_set_style_radius then pcall(function() lv_obj_set_style_radius(obj, 0, MAIN) end) end
  if lv_obj_set_style_pad_all then pcall(function() lv_obj_set_style_pad_all(obj, 0, MAIN) end) end
end

local function create_label(parent, text, x, y, width, color)
  local label = lv_label_create(parent)
  lv_label_set_text(label, text or "")
  lv_obj_set_pos(label, x, y)
  lv_obj_set_width(label, width)
  style_text(label, color or 0xffffff, 255)
  if lv_label_set_long_mode then
    pcall(function() lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP) end)
  end
  return label
end

local function create_rect(parent, x, y, w, h, color)
  local obj = lv_obj_create(parent)
  lv_obj_set_pos(obj, x, y)
  lv_obj_set_size(obj, w, h)
  style_panel(obj, color, 255)
  return obj
end

local function create_image(parent, src, x, y, w, h)
  local img = lv_img_create(parent)
  lv_obj_set_pos(img, x, y)
  lv_obj_set_size(img, w, h)
  if lv_img_set_antialias then pcall(function() lv_img_set_antialias(img, true) end) end
  if lv_img_set_src then pcall(function() lv_img_set_src(img, src) end) end
  return img
end

local function clamp(v, low, high)
  if v < low then return low end
  if v > high then return high end
  return v
end

local function update_hud()
  set_text(APP.ui.status, "Score " .. tostring(APP.score) .. "  Shots " .. tostring(APP.shots))
  write_metrics()
end

local function spawn_enemy()
  local lane = (APP.enemies_spawned % 5)
  local x = 24 + lane * 58
  local enemy = {
    x = x,
    y = 42,
    speed = 2 + (APP.enemies_spawned % 3),
    obj = create_image(APP.ui.root, asset_path("e1.bmp"), x, 42, 22, 22)
  }
  APP.enemies[#APP.enemies + 1] = enemy
  APP.enemies_spawned = APP.enemies_spawned + 1
end

local function fire()
  local bullet = {
    x = APP.player_x + 16,
    y = APP.player_y - 6,
    obj = create_rect(APP.ui.root, APP.player_x + 16, APP.player_y - 6, 3, 10, 0xffd166)
  }
  APP.bullets[#APP.bullets + 1] = bullet
  APP.shots = APP.shots + 1
end

local function move_player(dx, dy)
  APP.player_x = clamp(APP.player_x + dx, 8, APP.SCREEN_W - 43)
  APP.player_y = clamp(APP.player_y + dy, 62, APP.SCREEN_H - 42)
  if APP.ui.player then
    lv_obj_set_pos(APP.ui.player, APP.player_x, APP.player_y)
  end
end

local function cleanup_hidden(list)
  local keep = {}
  for _, item in ipairs(list) do
    if not item.dead then
      keep[#keep + 1] = item
    end
  end
  return keep
end

local function hit(a, b)
  return a.x < b.x + 22 and a.x + 3 > b.x and a.y < b.y + 22 and a.y + 10 > b.y
end

local function step_game()
  APP.frames = APP.frames + 1
  if APP.frames == 1 or APP.frames % 30 == 0 then
    spawn_enemy()
  end

  for _, bullet in ipairs(APP.bullets) do
    bullet.y = bullet.y - 7
    if bullet.y < 34 then
      bullet.dead = true
      if bullet.obj and lv_obj_add_flag then pcall(function() lv_obj_add_flag(bullet.obj, LV_OBJ_FLAG_HIDDEN) end) end
    elseif bullet.obj then
      lv_obj_set_pos(bullet.obj, bullet.x, bullet.y)
    end
  end

  for _, enemy in ipairs(APP.enemies) do
    enemy.y = enemy.y + enemy.speed
    if enemy.y > APP.SCREEN_H then
      enemy.dead = true
      if enemy.obj and lv_obj_add_flag then pcall(function() lv_obj_add_flag(enemy.obj, LV_OBJ_FLAG_HIDDEN) end) end
    elseif enemy.obj then
      lv_obj_set_pos(enemy.obj, enemy.x, enemy.y)
    end
  end

  for _, bullet in ipairs(APP.bullets) do
    if not bullet.dead then
      for _, enemy in ipairs(APP.enemies) do
        if not enemy.dead and hit(bullet, enemy) then
          bullet.dead = true
          enemy.dead = true
          APP.score = APP.score + 10
          if bullet.obj and lv_obj_add_flag then pcall(function() lv_obj_add_flag(bullet.obj, LV_OBJ_FLAG_HIDDEN) end) end
          if enemy.obj and lv_obj_add_flag then pcall(function() lv_obj_add_flag(enemy.obj, LV_OBJ_FLAG_HIDDEN) end) end
          break
        end
      end
    end
  end

  APP.bullets = cleanup_hidden(APP.bullets)
  APP.enemies = cleanup_hidden(APP.enemies)
  update_hud()
end

local function draw_ui()
  local root = lv_scr_act()
  lv_obj_clean(root)
  APP.ui.root = root
  style_panel(root, 0x061018, 255)
  create_rect(root, 0, 0, APP.SCREEN_W, 30, 0x102436)
  APP.ui.title = create_label(root, "Plane", 12, 8, 80, 0xf8fafc)
  APP.ui.status = create_label(root, "starting", 96, 8, 210, 0x9bdcff)
  APP.ui.hint = create_label(root, "LEFT/RIGHT move  UP shoot", 12, 218, 296, 0x70879a)
  APP.ui.player = create_image(root, asset_path("m.bmp"), APP.player_x, APP.player_y, 35, 35)
  APP.plane_ready = true
  APP.last_error = ""
  update_hud()
end

local function accepts_event(evt_type)
  return evt_type == key.SHORT or evt_type == key.LONG_START
end

local function on_key(evt_code, evt_type, _ts_ms)
  if not accepts_event(evt_type) then return end
  APP.last_key = KEY_NAMES[evt_code] or tostring(evt_code)
  if evt_code == key.LEFT then
    move_player(-14, 0)
  elseif evt_code == key.RIGHT then
    move_player(14, 0)
  elseif evt_code == key.UP then
    fire()
  elseif evt_code == key.DOWN then
    move_player(0, 12)
  elseif evt_code == key.HOME or evt_code == key.EXIT then
    if app and app.exit then pcall(function() app.exit() end) end
  end
  update_hud()
end

function APP.stop(_reason)
  if APP.stopped then return end
  APP.stopped = true
  for name, timer in pairs(APP.timers) do
    if timer then
      pcall(function() timer:stop() end)
      pcall(function() timer:unregister() end)
    end
    APP.timers[name] = nil
  end
  if key and key.off then pcall(function() key.off() end) end
  write_metrics()
  if _G.PLANE_APP == APP then
    _G.PLANE_APP = nil
  end
end

print("Plane minimal sprite migration start " .. APP.VERSION)

if not lv_scr_act or not lv_label_create or not lv_obj_create or not lv_img_create or not lv_img_set_src then
  error("Plane requires LVGL label, object, and image bindings")
end

draw_ui()

if key and key.on then
  key.on(on_key)
end

if tmr and tmr.create then
  APP.timers.frame = tmr.create()
  APP.timers.frame:alarm(APP.TICK_MS, tmr.ALARM_AUTO, function()
    if app and app.exiting and app.exiting() then
      APP.stop("exiting")
      return
    end
    step_game()
  end)
else
  write_metrics()
end
