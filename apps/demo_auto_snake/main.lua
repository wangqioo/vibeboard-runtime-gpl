local root = lv_scr_act()
lv_obj_clean(root)
lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE)
lv_obj_set_style_bg_color(root, 0x020617)
lv_obj_set_style_text_color(root, 0xe2e8f0)

local GRID_W = 16
local GRID_H = 10
local CELL = 12
local BOARD_X = 64
local BOARD_Y = 56
local MAX_SNAKE = 28
local SNAKE_COLOR = 0x22c55e
local HEAD_COLOR = 0xa3e635
local FOOD_COLOR = 0xef4444
local EMPTY_X = -40
local EMPTY_Y = -40

local title = lv_label_create(root)
lv_label_set_text(title, "AUTO SNAKE")
lv_obj_set_style_text_color(title, 0xa3e635)
lv_obj_set_pos(title, 20, 18)

local score_label = lv_label_create(root)
lv_label_set_text(score_label, "score 0")
lv_obj_set_style_text_color(score_label, 0xf8fafc)
lv_obj_set_pos(score_label, 222, 18)

local board = lv_obj_create(root)
lv_obj_set_size(board, GRID_W * CELL + 8, GRID_H * CELL + 8)
lv_obj_set_pos(board, BOARD_X - 4, BOARD_Y - 4)
lv_obj_set_style_bg_color(board, 0x07111f)
lv_obj_set_style_border_width(board, 1)
lv_obj_set_style_border_color(board, 0x14532d)
lv_obj_set_style_radius(board, 4)
lv_obj_set_style_pad_all(board, 0)

local blocks = {}
for i = 1, MAX_SNAKE do
    local obj = lv_obj_create(root)
    lv_obj_set_size(obj, CELL - 2, CELL - 2)
    lv_obj_set_pos(obj, EMPTY_X, EMPTY_Y)
    lv_obj_set_style_bg_color(obj, SNAKE_COLOR)
    lv_obj_set_style_border_width(obj, 0)
    lv_obj_set_style_radius(obj, 1)
    lv_obj_set_style_pad_all(obj, 0)
    blocks[i] = obj
end

local food_obj = lv_obj_create(root)
lv_obj_set_size(food_obj, CELL - 2, CELL - 2)
lv_obj_set_style_bg_color(food_obj, FOOD_COLOR)
lv_obj_set_style_border_width(food_obj, 0)
lv_obj_set_style_radius(food_obj, 2)
lv_obj_set_style_pad_all(food_obj, 0)

local snake = {}
local dx = 1
local dy = 0
local food = { x = 12, y = 5 }
local score = 0
local food_seed = 0

local function cell_x(x)
    return BOARD_X + ((x - 1) * CELL)
end

local function cell_y(y)
    return BOARD_Y + ((y - 1) * CELL)
end

local function same_cell(a, b)
    return a.x == b.x and a.y == b.y
end

local function snake_contains(x, y, skip_tail)
    local last = #snake
    if skip_tail then
        last = last - 1
    end
    for i = 1, last do
        if snake[i].x == x and snake[i].y == y then
            return true
        end
    end
    return false
end

local function place_food()
    for attempt = 1, GRID_W * GRID_H do
        food_seed = food_seed + 5
        local x = ((food_seed * 7) % GRID_W) + 1
        local y = ((food_seed * 11) % GRID_H) + 1
        if not snake_contains(x, y, false) then
            food.x = x
            food.y = y
            lv_obj_set_pos(food_obj, cell_x(food.x), cell_y(food.y))
            return
        end
    end
    food.x = 1
    food.y = 1
    lv_obj_set_pos(food_obj, cell_x(food.x), cell_y(food.y))
end

local function reset_game()
    snake = {
        { x = 8, y = 5 },
        { x = 7, y = 5 },
        { x = 6, y = 5 }
    }
    dx = 1
    dy = 0
    score = 0
    food_seed = food_seed + 3
    lv_label_set_text(score_label, "score 0")
    place_food()
end

local function is_safe(nx, ny)
    if nx < 1 or nx > GRID_W or ny < 1 or ny > GRID_H then
        return false
    end
    return not snake_contains(nx, ny, true)
end

local function direction_score(candidate)
    local head = snake[1]
    local nx = head.x + candidate.x
    local ny = head.y + candidate.y
    if not is_safe(nx, ny) then
        return -10000
    end
    local dist = math.abs(food.x - nx) + math.abs(food.y - ny)
    return 100 - dist
end

local function choose_direction()
    local candidates = {
        { x = dx, y = dy },
        { x = 1, y = 0 },
        { x = -1, y = 0 },
        { x = 0, y = 1 },
        { x = 0, y = -1 }
    }
    local best = candidates[1]
    local best_score = -10000
    for i = 1, #candidates do
        local candidate = candidates[i]
        if not (candidate.x == -dx and candidate.y == -dy) then
            local score_value = direction_score(candidate)
            if score_value > best_score then
                best_score = score_value
                best = candidate
            end
        end
    end
    dx = best.x
    dy = best.y
end

local function draw_snake()
    for i = 1, MAX_SNAKE do
        local block = blocks[i]
        if i <= #snake then
            lv_obj_set_pos(block, cell_x(snake[i].x), cell_y(snake[i].y))
            if i == 1 then
                lv_obj_set_style_bg_color(block, HEAD_COLOR)
            else
                lv_obj_set_style_bg_color(block, SNAKE_COLOR)
            end
        else
            lv_obj_set_pos(block, EMPTY_X, EMPTY_Y)
        end
    end
end

local function move_snake()
    choose_direction()
    local head = snake[1]
    local next_head = { x = head.x + dx, y = head.y + dy }
    if not is_safe(next_head.x, next_head.y) then
        reset_game()
        draw_snake()
        return
    end

    local ate = same_cell(next_head, food)
    table.insert(snake, 1, next_head)
    if ate then
        score = score + 1
        lv_label_set_text(score_label, "score " .. tostring(score))
        if #snake > MAX_SNAKE then
            while #snake > 8 do
                table.remove(snake)
            end
        end
        place_food()
    else
        table.remove(snake)
    end
    draw_snake()
end

reset_game()
draw_snake()

local snake_timer = tmr.create()
snake_timer:alarm(250, tmr.ALARM_AUTO, function()
    move_snake()
end)

print("demo auto snake ready")
