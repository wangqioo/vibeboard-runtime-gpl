#include "lua_gamepad.h"

#include <stdbool.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "lauxlib.h"

#define VB_GAMEPAD_EVT_CONNECTING 1
#define VB_GAMEPAD_EVT_CONNECT_FAILED 2
#define VB_GAMEPAD_EVT_CONNECTED 3
#define VB_GAMEPAD_EVT_DISCONNECTED 4
#define VB_GAMEPAD_EVT_UPDATE 5
#define VB_GAMEPAD_EVT_MAX VB_GAMEPAD_EVT_UPDATE

#define VB_GAMEPAD_BTN_A (1 << 0)
#define VB_GAMEPAD_BTN_B (1 << 1)
#define VB_GAMEPAD_BTN_X (1 << 2)
#define VB_GAMEPAD_BTN_Y (1 << 3)
#define VB_GAMEPAD_BTN_LB (1 << 4)
#define VB_GAMEPAD_BTN_RB (1 << 5)
#define VB_GAMEPAD_BTN_VIEW (1 << 6)
#define VB_GAMEPAD_BTN_MENU (1 << 7)
#define VB_GAMEPAD_BTN_XBOX (1 << 8)

typedef struct {
    bool started;
    bool connected;
    bool connecting;
    int buttons_mask;
    double lx;
    double ly;
    bool dpad_up;
    bool dpad_down;
    bool dpad_left;
    bool dpad_right;
    bool a;
    bool b;
    bool x;
    bool y;
    bool lb;
    bool rb;
    bool view;
    bool menu;
    bool xbox;
    char address[32];
    char last_address[32];
    int refs[VB_GAMEPAD_EVT_MAX + 1];
} vb_gamepad_runtime_state_t;

static vb_gamepad_runtime_state_t s_gamepad;

static void clear_refs(lua_State *L)
{
    for (int i = 0; i <= VB_GAMEPAD_EVT_MAX; i++) {
        if (s_gamepad.refs[i] != LUA_NOREF) {
            luaL_unref(L, LUA_REGISTRYINDEX, s_gamepad.refs[i]);
            s_gamepad.refs[i] = LUA_NOREF;
        }
    }
}

static void update_buttons_from_mask(void)
{
    s_gamepad.a = (s_gamepad.buttons_mask & VB_GAMEPAD_BTN_A) != 0;
    s_gamepad.b = (s_gamepad.buttons_mask & VB_GAMEPAD_BTN_B) != 0;
    s_gamepad.x = (s_gamepad.buttons_mask & VB_GAMEPAD_BTN_X) != 0;
    s_gamepad.y = (s_gamepad.buttons_mask & VB_GAMEPAD_BTN_Y) != 0;
    s_gamepad.lb = (s_gamepad.buttons_mask & VB_GAMEPAD_BTN_LB) != 0;
    s_gamepad.rb = (s_gamepad.buttons_mask & VB_GAMEPAD_BTN_RB) != 0;
    s_gamepad.view = (s_gamepad.buttons_mask & VB_GAMEPAD_BTN_VIEW) != 0;
    s_gamepad.menu = (s_gamepad.buttons_mask & VB_GAMEPAD_BTN_MENU) != 0;
    s_gamepad.xbox = (s_gamepad.buttons_mask & VB_GAMEPAD_BTN_XBOX) != 0;
}

static void reset_runtime_state(void)
{
    int refs[VB_GAMEPAD_EVT_MAX + 1];
    memcpy(refs, s_gamepad.refs, sizeof(refs));
    memset(&s_gamepad, 0, sizeof(s_gamepad));
    memcpy(s_gamepad.refs, refs, sizeof(refs));
}

static int dispatch_event(lua_State *L, int event)
{
    if (event < 1 || event > VB_GAMEPAD_EVT_MAX || s_gamepad.refs[event] == LUA_NOREF) {
        return 0;
    }

    lua_rawgeti(L, LUA_REGISTRYINDEX, s_gamepad.refs[event]);
    if (lua_pcall(L, 0, 0, 0) != LUA_OK) {
        return lua_error(L);
    }
    return 0;
}

static void set_boolean_field(lua_State *L, const char *name, bool value)
{
    lua_pushboolean(L, value);
    lua_setfield(L, -2, name);
}

static void set_number_field(lua_State *L, const char *name, lua_Number value)
{
    lua_pushnumber(L, value);
    lua_setfield(L, -2, name);
}

static void set_string_field(lua_State *L, const char *name, const char *value)
{
    if (value != NULL && value[0] != '\0') {
        lua_pushstring(L, value);
    } else {
        lua_pushnil(L);
    }
    lua_setfield(L, -2, name);
}

static int gamepad_state(lua_State *L)
{
    lua_newtable(L);
    set_boolean_field(L, "started", s_gamepad.started);
    set_boolean_field(L, "connected", s_gamepad.connected);
    set_boolean_field(L, "connecting", s_gamepad.connecting);
    lua_pushinteger(L, s_gamepad.buttons_mask);
    lua_setfield(L, -2, "buttons_mask");
    set_number_field(L, "lx", s_gamepad.lx);
    set_number_field(L, "ly", s_gamepad.ly);
    set_boolean_field(L, "dpad_up", s_gamepad.dpad_up);
    set_boolean_field(L, "dpad_down", s_gamepad.dpad_down);
    set_boolean_field(L, "dpad_left", s_gamepad.dpad_left);
    set_boolean_field(L, "dpad_right", s_gamepad.dpad_right);
    set_boolean_field(L, "a", s_gamepad.a);
    set_boolean_field(L, "b", s_gamepad.b);
    set_boolean_field(L, "x", s_gamepad.x);
    set_boolean_field(L, "y", s_gamepad.y);
    set_boolean_field(L, "lb", s_gamepad.lb);
    set_boolean_field(L, "rb", s_gamepad.rb);
    set_boolean_field(L, "view", s_gamepad.view);
    set_boolean_field(L, "menu", s_gamepad.menu);
    set_boolean_field(L, "xbox", s_gamepad.xbox);
    set_string_field(L, "address", s_gamepad.address);
    set_string_field(L, "last_address", s_gamepad.last_address);
    return 1;
}

static int gamepad_start(lua_State *L)
{
    s_gamepad.started = true;
    s_gamepad.connecting = !s_gamepad.connected;
    if (s_gamepad.connecting) {
        dispatch_event(L, VB_GAMEPAD_EVT_CONNECTING);
    }
    lua_pushboolean(L, 1);
    return 1;
}

static int gamepad_stop(lua_State *L)
{
    s_gamepad.started = false;
    s_gamepad.connected = false;
    s_gamepad.connecting = false;
    s_gamepad.buttons_mask = 0;
    update_buttons_from_mask();
    return dispatch_event(L, VB_GAMEPAD_EVT_DISCONNECTED);
}

static int gamepad_on(lua_State *L)
{
    int event = (int)luaL_checkinteger(L, 1);
    luaL_checktype(L, 2, LUA_TFUNCTION);
    if (event < 1 || event > VB_GAMEPAD_EVT_MAX) {
        return luaL_error(L, "invalid gamepad event");
    }
    if (s_gamepad.refs[event] != LUA_NOREF) {
        luaL_unref(L, LUA_REGISTRYINDEX, s_gamepad.refs[event]);
    }
    lua_pushvalue(L, 2);
    s_gamepad.refs[event] = luaL_ref(L, LUA_REGISTRYINDEX);
    lua_pushboolean(L, 1);
    return 1;
}

static int gamepad_off(lua_State *L)
{
    if (lua_gettop(L) == 0 || lua_isnil(L, 1)) {
        clear_refs(L);
        return 0;
    }

    int event = (int)luaL_checkinteger(L, 1);
    if (event < 1 || event > VB_GAMEPAD_EVT_MAX) {
        return luaL_error(L, "invalid gamepad event");
    }
    if (s_gamepad.refs[event] != LUA_NOREF) {
        luaL_unref(L, LUA_REGISTRYINDEX, s_gamepad.refs[event]);
        s_gamepad.refs[event] = LUA_NOREF;
    }
    return 0;
}

static int gamepad_rescan(lua_State *L)
{
    s_gamepad.started = true;
    s_gamepad.connecting = !s_gamepad.connected;
    if (s_gamepad.connecting) {
        dispatch_event(L, VB_GAMEPAD_EVT_CONNECTING);
    }
    lua_pushboolean(L, 1);
    return 1;
}

static bool table_bool(lua_State *L, const char *name, bool fallback)
{
    lua_getfield(L, 1, name);
    bool value = lua_isnil(L, -1) ? fallback : lua_toboolean(L, -1);
    lua_pop(L, 1);
    return value;
}

static double table_number(lua_State *L, const char *name, double fallback)
{
    lua_getfield(L, 1, name);
    double value = lua_isnumber(L, -1) ? lua_tonumber(L, -1) : fallback;
    lua_pop(L, 1);
    return value;
}

static int table_integer(lua_State *L, const char *name, int fallback)
{
    lua_getfield(L, 1, name);
    int value = lua_isnumber(L, -1) ? (int)lua_tointeger(L, -1) : fallback;
    lua_pop(L, 1);
    return value;
}

static void table_string(lua_State *L, const char *name, char *dest, size_t dest_size)
{
    lua_getfield(L, 1, name);
    const char *value = lua_tostring(L, -1);
    if (value != NULL) {
        strlcpy(dest, value, dest_size);
    }
    lua_pop(L, 1);
}

static void apply_pending_state(lua_State *L, const vb_lua_gamepad_pending_state_t *pending)
{
    bool was_connected = s_gamepad.connected;
    bool was_connecting = s_gamepad.connecting;

    s_gamepad.started = pending->started;
    s_gamepad.connected = pending->connected;
    s_gamepad.connecting = pending->connecting;
    s_gamepad.buttons_mask = pending->buttons_mask;
    s_gamepad.lx = pending->lx;
    s_gamepad.ly = pending->ly;
    s_gamepad.dpad_up = pending->dpad_up;
    s_gamepad.dpad_down = pending->dpad_down;
    s_gamepad.dpad_left = pending->dpad_left;
    s_gamepad.dpad_right = pending->dpad_right;
    if (pending->address[0] != '\0') {
        strlcpy(s_gamepad.address, pending->address, sizeof(s_gamepad.address));
    }
    if (s_gamepad.address[0] != '\0') {
        strlcpy(s_gamepad.last_address, s_gamepad.address, sizeof(s_gamepad.last_address));
    }
    update_buttons_from_mask();

    if (!was_connected && s_gamepad.connected) {
        dispatch_event(L, VB_GAMEPAD_EVT_CONNECTED);
    } else if (was_connecting && !s_gamepad.connected && !s_gamepad.connecting) {
        dispatch_event(L, VB_GAMEPAD_EVT_CONNECT_FAILED);
    } else if (was_connected && !s_gamepad.connected) {
        dispatch_event(L, VB_GAMEPAD_EVT_DISCONNECTED);
    }
    dispatch_event(L, VB_GAMEPAD_EVT_UPDATE);
}

static int gamepad_push_state(lua_State *L)
{
    luaL_checktype(L, 1, LUA_TTABLE);

    vb_lua_gamepad_pending_state_t pending = {
        .started = table_bool(L, "started", true),
        .connected = table_bool(L, "connected", s_gamepad.connected),
        .connecting = table_bool(L, "connecting", false),
        .buttons_mask = table_integer(L, "buttons_mask", s_gamepad.buttons_mask),
        .lx = table_number(L, "lx", s_gamepad.lx),
        .ly = table_number(L, "ly", s_gamepad.ly),
        .dpad_up = table_bool(L, "dpad_up", s_gamepad.dpad_up),
        .dpad_down = table_bool(L, "dpad_down", s_gamepad.dpad_down),
        .dpad_left = table_bool(L, "dpad_left", s_gamepad.dpad_left),
        .dpad_right = table_bool(L, "dpad_right", s_gamepad.dpad_right),
    };
    table_string(L, "address", pending.address, sizeof(pending.address));
    apply_pending_state(L, &pending);
    lua_pushboolean(L, 1);
    return 1;
}

void vb_lua_gamepad_init(vb_lua_gamepad_state_t *state)
{
    if (state == NULL) {
        return;
    }
    memset(state, 0, sizeof(*state));
    state->queue = xQueueCreate(VB_LUA_GAMEPAD_QUEUE_DEPTH, sizeof(vb_lua_gamepad_pending_state_t));
}

esp_err_t vb_lua_gamepad_enqueue(vb_lua_gamepad_state_t *state, const vb_lua_gamepad_pending_state_t *pending)
{
    if (state == NULL || state->queue == NULL || pending == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    QueueHandle_t queue = (QueueHandle_t)state->queue;
    vb_lua_gamepad_pending_state_t queued = *pending;
    return xQueueSend(queue, &queued, 0) == pdTRUE ? ESP_OK : ESP_ERR_NO_MEM;
}

bool vb_lua_gamepad_snapshot(vb_lua_gamepad_snapshot_t *out)
{
    if (out == NULL) {
        return false;
    }

    memset(out, 0, sizeof(*out));
    out->started = s_gamepad.started;
    out->connected = s_gamepad.connected;
    out->connecting = s_gamepad.connecting;
    out->buttons_mask = s_gamepad.buttons_mask;
    out->lx = s_gamepad.lx;
    out->ly = s_gamepad.ly;
    out->dpad_up = s_gamepad.dpad_up;
    out->dpad_down = s_gamepad.dpad_down;
    out->dpad_left = s_gamepad.dpad_left;
    out->dpad_right = s_gamepad.dpad_right;
    strlcpy(out->address, s_gamepad.address, sizeof(out->address));
    strlcpy(out->last_address, s_gamepad.last_address, sizeof(out->last_address));
    return true;
}

static void push_state_table(lua_State *L, const vb_lua_gamepad_pending_state_t *pending)
{
    lua_newtable(L);
    lua_pushboolean(L, pending->started);
    lua_setfield(L, -2, "started");
    lua_pushboolean(L, pending->connected);
    lua_setfield(L, -2, "connected");
    lua_pushboolean(L, pending->connecting);
    lua_setfield(L, -2, "connecting");
    lua_pushinteger(L, pending->buttons_mask);
    lua_setfield(L, -2, "buttons_mask");
    lua_pushnumber(L, pending->lx);
    lua_setfield(L, -2, "lx");
    lua_pushnumber(L, pending->ly);
    lua_setfield(L, -2, "ly");
    lua_pushboolean(L, pending->dpad_up);
    lua_setfield(L, -2, "dpad_up");
    lua_pushboolean(L, pending->dpad_down);
    lua_setfield(L, -2, "dpad_down");
    lua_pushboolean(L, pending->dpad_left);
    lua_setfield(L, -2, "dpad_left");
    lua_pushboolean(L, pending->dpad_right);
    lua_setfield(L, -2, "dpad_right");
    if (pending->address[0] != '\0') {
        lua_pushstring(L, pending->address);
        lua_setfield(L, -2, "address");
    }
}

int vb_lua_gamepad_process_pending(lua_State *L, vb_lua_gamepad_state_t *state)
{
    if (L == NULL || state == NULL || state->queue == NULL) {
        return 0;
    }

    QueueHandle_t queue = (QueueHandle_t)state->queue;
    vb_lua_gamepad_pending_state_t pending;
    while (xQueueReceive(queue, &pending, 0) == pdTRUE) {
        int top = lua_gettop(L);
        push_state_table(L, &pending);
        apply_pending_state(L, &pending);
        lua_settop(L, top);
    }
    return 0;
}

void vb_lua_gamepad_cleanup(lua_State *L, vb_lua_gamepad_state_t *state)
{
    (void)L;
    if (state == NULL) {
        return;
    }
    if (state->queue != NULL) {
        vQueueDelete((QueueHandle_t)state->queue);
        state->queue = NULL;
    }
}

void vb_lua_gamepad_register(lua_State *L, vb_lua_gamepad_state_t *state)
{
    for (int i = 0; i <= VB_GAMEPAD_EVT_MAX; i++) {
        s_gamepad.refs[i] = LUA_NOREF;
    }
    reset_runtime_state();
    if (state != NULL) {
        if (state->queue == NULL) {
            vb_lua_gamepad_init(state);
        } else {
            xQueueReset((QueueHandle_t)state->queue);
        }
    }

    static const luaL_Reg functions[] = {
        {"state", gamepad_state},
        {"start", gamepad_start},
        {"stop", gamepad_stop},
        {"on", gamepad_on},
        {"off", gamepad_off},
        {"rescan", gamepad_rescan},
        {"push_state", gamepad_push_state},
        {NULL, NULL},
    };

    luaL_newlib(L, functions);
    lua_pushinteger(L, VB_GAMEPAD_EVT_CONNECTING);
    lua_setfield(L, -2, "EVT_CONNECTING");
    lua_pushinteger(L, VB_GAMEPAD_EVT_CONNECT_FAILED);
    lua_setfield(L, -2, "EVT_CONNECT_FAILED");
    lua_pushinteger(L, VB_GAMEPAD_EVT_CONNECTED);
    lua_setfield(L, -2, "EVT_CONNECTED");
    lua_pushinteger(L, VB_GAMEPAD_EVT_DISCONNECTED);
    lua_setfield(L, -2, "EVT_DISCONNECTED");
    lua_pushinteger(L, VB_GAMEPAD_EVT_UPDATE);
    lua_setfield(L, -2, "EVT_UPDATE");

    lua_pushinteger(L, VB_GAMEPAD_BTN_A);
    lua_setfield(L, -2, "BTN_A");
    lua_pushinteger(L, VB_GAMEPAD_BTN_B);
    lua_setfield(L, -2, "BTN_B");
    lua_pushinteger(L, VB_GAMEPAD_BTN_X);
    lua_setfield(L, -2, "BTN_X");
    lua_pushinteger(L, VB_GAMEPAD_BTN_Y);
    lua_setfield(L, -2, "BTN_Y");
    lua_pushinteger(L, VB_GAMEPAD_BTN_LB);
    lua_setfield(L, -2, "BTN_LB");
    lua_pushinteger(L, VB_GAMEPAD_BTN_RB);
    lua_setfield(L, -2, "BTN_RB");
    lua_pushinteger(L, VB_GAMEPAD_BTN_VIEW);
    lua_setfield(L, -2, "BTN_VIEW");
    lua_pushinteger(L, VB_GAMEPAD_BTN_MENU);
    lua_setfield(L, -2, "BTN_MENU");
    lua_pushinteger(L, VB_GAMEPAD_BTN_XBOX);
    lua_setfield(L, -2, "BTN_XBOX");

    lua_setglobal(L, "gamepad");
}
