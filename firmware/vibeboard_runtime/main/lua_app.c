#include "lua_app.h"

#include <string.h>

#include "app_registry.h"
#include "app_runner.h"
#include "esp_log.h"
#include "lauxlib.h"
#include "lualib.h"

static const char *TAG = "lua_app";

typedef enum {
    VB_LUA_APP_EVENT_EXIT = 0,
    VB_LUA_APP_EVENT_LAUNCH = 1,
    VB_LUA_APP_EVENT_STOP = 2,
    VB_LUA_APP_EVENT_COUNT = 3,
} vb_lua_app_event_t;

static vb_lua_app_state_t *check_app_state(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, "vb_lua_app_state");
    vb_lua_app_state_t *state = (vb_lua_app_state_t *)lua_touserdata(L, -1);
    lua_pop(L, 1);
    if (state == NULL) {
        luaL_error(L, "app state missing");
    }
    return state;
}

static void set_string_field(lua_State *L, const char *key, const char *value)
{
    lua_pushstring(L, value ? value : "");
    lua_setfield(L, -2, key);
}

static int event_index_for_name(const char *event)
{
    if (strcmp(event, "exit") == 0) {
        return VB_LUA_APP_EVENT_EXIT;
    }
    if (strcmp(event, "launch") == 0) {
        return VB_LUA_APP_EVENT_LAUNCH;
    }
    if (strcmp(event, "stop") == 0) {
        return VB_LUA_APP_EVENT_STOP;
    }
    return -1;
}

static void vb_lua_app_dispatch_event(lua_State *L,
                                      vb_lua_app_state_t *state,
                                      vb_lua_app_event_t event,
                                      const char *arg)
{
    if (L == NULL || state == NULL || event < 0 || event >= VB_LUA_APP_EVENT_COUNT) {
        return;
    }

    int ref = state->event_callback_refs[event];
    if (ref == LUA_NOREF) {
        return;
    }

    lua_rawgeti(L, LUA_REGISTRYINDEX, ref);
    int args = 0;
    if (arg != NULL) {
        lua_pushstring(L, arg);
        args = 1;
    }
    if (lua_pcall(L, args, 0, 0) != LUA_OK) {
        const char *err = lua_tostring(L, -1);
        ESP_LOGW(TAG, "app event callback failed: %s", err ? err : "unknown");
        lua_pop(L, 1);
    }
}

static void push_app_entry(lua_State *L, const vb_app_registry_entry_t *entry)
{
    lua_newtable(L);
    set_string_field(L, "id", entry->id);
    set_string_field(L, "name", entry->name);
    set_string_field(L, "entry", entry->entry);
    set_string_field(L, "dir", entry->dir);
    set_string_field(L, "path", entry->path);
    set_string_field(L, "schema", entry->manifest_schema);
    set_string_field(L, "version", entry->version);
    set_string_field(L, "kind", entry->kind);
    set_string_field(L, "capabilities", entry->capabilities);
    lua_pushboolean(L, entry->compatible);
    lua_setfield(L, -2, "compatible");
}

static int push_scanned_apps(lua_State *L)
{
    vb_app_registry_result_t result;
    esp_err_t err = vb_app_registry_scan(&result);
    if (err != ESP_OK) {
        lua_pushnil(L);
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }

    lua_newtable(L);
    for (int i = 0; i < result.stored_app_count; i++) {
        push_app_entry(L, &result.apps[i]);
        lua_rawseti(L, -2, i + 1);
    }
    return 1;
}

static int lua_app_list(lua_State *L)
{
    return push_scanned_apps(L);
}

static int lua_app_rescan(lua_State *L)
{
    return push_scanned_apps(L);
}

static int lua_app_current(lua_State *L)
{
    lua_newtable(L);
    set_string_field(L, "id", vb_app_runner_current_id());
    set_string_field(L, "state", vb_app_runner_current_state_name());
    set_string_field(L, "last_message", vb_app_runner_last_message());
    lua_pushinteger(L, vb_app_runner_last_status());
    lua_setfield(L, -2, "last_status");
    lua_pushboolean(L, vb_app_runner_is_running());
    lua_setfield(L, -2, "running");
    return 1;
}

static int lua_app_exiting(lua_State *L)
{
    vb_lua_app_state_t *state = check_app_state(L);
    lua_pushboolean(L, state->stop_requested != NULL && *state->stop_requested);
    return 1;
}

static int lua_app_exit(lua_State *L)
{
    vb_lua_app_state_t *state = check_app_state(L);
    const char *reason = luaL_optstring(L, 1, "app.exit");
    if (state->stop_requested == NULL) {
        lua_pushboolean(L, false);
        lua_pushliteral(L, "stop flag missing");
        return 2;
    }

    vb_lua_app_dispatch_event(L, state, VB_LUA_APP_EVENT_STOP, reason);
    *state->stop_requested = true;
    lua_pushboolean(L, true);
    return 1;
}

static int lua_app_set_home_exit(lua_State *L)
{
    vb_lua_app_state_t *state = check_app_state(L);
    state->home_exit_enabled = lua_toboolean(L, 1);
    lua_pushboolean(L, true);
    return 1;
}

static int lua_app_launch(lua_State *L)
{
    vb_lua_app_state_t *state = check_app_state(L);
    const char *id = luaL_checkstring(L, 1);
    if (state->stop_requested == NULL) {
        lua_pushboolean(L, false);
        lua_pushliteral(L, "stop flag missing");
        return 2;
    }
    if (strcmp(id, vb_app_runner_current_id()) == 0) {
        lua_pushboolean(L, false);
        lua_pushliteral(L, "app already running");
        return 2;
    }

    vb_app_registry_result_t result;
    esp_err_t err = vb_app_registry_scan(&result);
    if (err != ESP_OK) {
        lua_pushboolean(L, false);
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }

    const vb_app_registry_entry_t *entry = NULL;
    for (int i = 0; i < result.stored_app_count; i++) {
        if (strcmp(result.apps[i].id, id) == 0) {
            entry = &result.apps[i];
            break;
        }
    }
    if (entry == NULL) {
        lua_pushboolean(L, false);
        lua_pushliteral(L, "app not found");
        return 2;
    }
    if (!entry->compatible) {
        lua_pushboolean(L, false);
        lua_pushliteral(L, "app incompatible");
        return 2;
    }

    state->pending_launch = *entry;
    state->has_pending_launch = true;
    vb_lua_app_dispatch_event(L, state, VB_LUA_APP_EVENT_LAUNCH, entry->id);
    *state->stop_requested = true;
    lua_pushboolean(L, true);
    return 1;
}

static int lua_app_on(lua_State *L)
{
    vb_lua_app_state_t *state = check_app_state(L);
    const char *event = luaL_checkstring(L, 1);
    luaL_checktype(L, 2, LUA_TFUNCTION);
    int event_index = event_index_for_name(event);
    if (event_index < 0) {
        return luaL_error(L, "unsupported app event: %s", event);
    }

    lua_pushvalue(L, 2);
    int ref = luaL_ref(L, LUA_REGISTRYINDEX);
    if (state->event_callback_refs[event_index] != LUA_NOREF) {
        luaL_unref(L, LUA_REGISTRYINDEX, state->event_callback_refs[event_index]);
    }
    state->event_callback_refs[event_index] = ref;
    lua_pushboolean(L, true);
    return 1;
}

void vb_lua_app_init(vb_lua_app_state_t *state)
{
    if (state == NULL) {
        return;
    }
    state->stop_requested = NULL;
    state->home_exit_enabled = true;
    for (int i = 0; i < VB_LUA_APP_EVENT_COUNT; i++) {
        state->event_callback_refs[i] = LUA_NOREF;
    }
    state->has_pending_launch = false;
    memset(&state->pending_launch, 0, sizeof(state->pending_launch));
}

void vb_lua_app_set_stop_flag(vb_lua_app_state_t *state, volatile bool *stop_requested)
{
    if (state != NULL) {
        state->stop_requested = stop_requested;
    }
}

void vb_lua_app_cleanup(lua_State *L, vb_lua_app_state_t *state)
{
    if (L == NULL || state == NULL) {
        return;
    }
    for (int i = 0; i < VB_LUA_APP_EVENT_COUNT; i++) {
        if (state->event_callback_refs[i] != LUA_NOREF) {
            luaL_unref(L, LUA_REGISTRYINDEX, state->event_callback_refs[i]);
            state->event_callback_refs[i] = LUA_NOREF;
        }
    }
}

void vb_lua_app_register(lua_State *L, vb_lua_app_state_t *state)
{
    static const luaL_Reg functions[] = {
        {"list", lua_app_list},
        {"rescan", lua_app_rescan},
        {"current", lua_app_current},
        {"exiting", lua_app_exiting},
        {"exit", lua_app_exit},
        {"set_home_exit", lua_app_set_home_exit},
        {"launch", lua_app_launch},
        {"on", lua_app_on},
        {NULL, NULL},
    };

    lua_pushlightuserdata(L, state);
    lua_setfield(L, LUA_REGISTRYINDEX, "vb_lua_app_state");
    luaL_newlib(L, functions);
    lua_setglobal(L, "app");
}

bool vb_lua_app_should_handle_home_exit(const vb_lua_app_state_t *state)
{
    return state == NULL || state->home_exit_enabled;
}

bool vb_lua_app_take_pending_launch(vb_lua_app_state_t *state, vb_app_registry_entry_t *entry)
{
    if (state == NULL || entry == NULL || !state->has_pending_launch) {
        return false;
    }

    *entry = state->pending_launch;
    state->has_pending_launch = false;
    memset(&state->pending_launch, 0, sizeof(state->pending_launch));
    return true;
}

void vb_lua_app_dispatch_exit(lua_State *L, vb_lua_app_state_t *state)
{
    vb_lua_app_dispatch_event(L, state, VB_LUA_APP_EVENT_EXIT, NULL);
}
