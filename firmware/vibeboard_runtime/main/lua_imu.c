#include "lua_imu.h"

#include <string.h>

#include "board_lckfb_szpi_s3.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lauxlib.h"

#define VB_LUA_IMU_STATE_REGISTRY_KEY "vb_imu_state"
#define VB_LUA_IMU_DEFAULT_INTERVAL_MS 40
#define VB_LUA_IMU_MIN_INTERVAL_MS 10

static vb_lua_imu_state_t *get_state(lua_State *L)
{
    lua_getfield(L, LUA_REGISTRYINDEX, VB_LUA_IMU_STATE_REGISTRY_KEY);
    vb_lua_imu_state_t *state = (vb_lua_imu_state_t *)lua_touserdata(L, -1);
    lua_pop(L, 1);
    return state;
}

static int now_ms(void)
{
    return (int)(xTaskGetTickCount() * 1000 / configTICK_RATE_HZ);
}

static void unref_handler(lua_State *L, int *ref)
{
    if (ref != NULL && *ref != LUA_NOREF) {
        luaL_unref(L, LUA_REGISTRYINDEX, *ref);
        *ref = LUA_NOREF;
    }
}

static void push_sample(lua_State *L, const vb_board_imu_sample_t *sample)
{
    lua_newtable(L);
    lua_pushnumber(L, sample->roll);
    lua_setfield(L, -2, "roll");
    lua_pushnumber(L, sample->pitch);
    lua_setfield(L, -2, "pitch");
    lua_pushnumber(L, sample->angle_z);
    lua_setfield(L, -2, "angle_z");
    lua_pushinteger(L, sample->acc_x);
    lua_setfield(L, -2, "acc_x");
    lua_pushinteger(L, sample->acc_y);
    lua_setfield(L, -2, "acc_y");
    lua_pushinteger(L, sample->acc_z);
    lua_setfield(L, -2, "acc_z");
    lua_pushinteger(L, sample->gyr_x);
    lua_setfield(L, -2, "gyr_x");
    lua_pushinteger(L, sample->gyr_y);
    lua_setfield(L, -2, "gyr_y");
    lua_pushinteger(L, sample->gyr_z);
    lua_setfield(L, -2, "gyr_z");
    lua_pushinteger(L, sample->timestamp_ms);
    lua_setfield(L, -2, "timestamp_ms");
}

static int imu_on(lua_State *L)
{
    vb_lua_imu_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "imu state unavailable");
    }
    luaL_checktype(L, 1, LUA_TFUNCTION);
    int interval_ms = (int)luaL_optinteger(L, 2, VB_LUA_IMU_DEFAULT_INTERVAL_MS);
    if (interval_ms < VB_LUA_IMU_MIN_INTERVAL_MS) {
        interval_ms = VB_LUA_IMU_MIN_INTERVAL_MS;
    }

    unref_handler(L, &state->global_ref);
    lua_pushvalue(L, 1);
    state->global_ref = luaL_ref(L, LUA_REGISTRYINDEX);
    state->sample_interval_ms = interval_ms;
    state->last_sample_ms = 0;
    state->enabled = true;
    lua_pushboolean(L, state->available);
    return 1;
}

static int imu_off(lua_State *L)
{
    vb_lua_imu_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "imu state unavailable");
    }
    unref_handler(L, &state->global_ref);
    state->enabled = false;
    return 0;
}

static int imu_state(lua_State *L)
{
    vb_lua_imu_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "imu state unavailable");
    }
    lua_newtable(L);
    lua_pushboolean(L, state->available);
    lua_setfield(L, -2, "available");
    lua_pushboolean(L, state->enabled);
    lua_setfield(L, -2, "enabled");
    lua_pushinteger(L, state->sample_interval_ms);
    lua_setfield(L, -2, "sample_interval_ms");
    lua_pushinteger(L, state->sample_count);
    lua_setfield(L, -2, "sample_count");
    lua_pushinteger(L, state->error_count);
    lua_setfield(L, -2, "error_count");
    return 1;
}

static int imu_read(lua_State *L)
{
    vb_lua_imu_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "imu state unavailable");
    }
    if (!state->available) {
        lua_pushnil(L);
        lua_pushliteral(L, "imu unavailable");
        return 2;
    }

    vb_board_imu_sample_t sample = {0};
    esp_err_t err = vb_board_imu_read(&sample);
    if (err != ESP_OK) {
        state->error_count++;
        lua_pushnil(L);
        lua_pushstring(L, esp_err_to_name(err));
        return 2;
    }
    state->sample_count++;
    push_sample(L, &sample);
    return 1;
}

static int imu_push(lua_State *L)
{
    vb_lua_imu_state_t *state = get_state(L);
    if (state == NULL) {
        return luaL_error(L, "imu state unavailable");
    }
    vb_board_imu_sample_t sample = {
        .roll = (float)luaL_optnumber(L, 1, 0),
        .pitch = (float)luaL_optnumber(L, 2, 0),
        .gyr_x = (int16_t)luaL_optinteger(L, 3, 0),
        .gyr_y = (int16_t)luaL_optinteger(L, 4, 0),
        .gyr_z = (int16_t)luaL_optinteger(L, 5, 0),
        .timestamp_ms = (int)luaL_optinteger(L, 6, now_ms()),
    };
    if (state->global_ref != LUA_NOREF) {
        lua_rawgeti(L, LUA_REGISTRYINDEX, state->global_ref);
        push_sample(L, &sample);
        if (lua_pcall(L, 1, 0, 0) != LUA_OK) {
            return lua_error(L);
        }
    }
    state->sample_count++;
    lua_pushboolean(L, true);
    return 1;
}

void vb_lua_imu_init(vb_lua_imu_state_t *state)
{
    if (state == NULL) {
        return;
    }
    memset(state, 0, sizeof(*state));
    state->global_ref = LUA_NOREF;
    state->sample_interval_ms = VB_LUA_IMU_DEFAULT_INTERVAL_MS;
}

void vb_lua_imu_set_available(vb_lua_imu_state_t *state, bool available)
{
    if (state != NULL) {
        state->available = available;
    }
}

int vb_lua_imu_process_pending(lua_State *L, vb_lua_imu_state_t *state)
{
    if (L == NULL || state == NULL || !state->available || !state->enabled || state->global_ref == LUA_NOREF) {
        return 0;
    }

    int t = now_ms();
    if (state->last_sample_ms != 0 && t - state->last_sample_ms < state->sample_interval_ms) {
        return 0;
    }
    state->last_sample_ms = t;

    vb_board_imu_sample_t sample = {0};
    esp_err_t err = vb_board_imu_read(&sample);
    if (err != ESP_OK) {
        if (err != ESP_ERR_INVALID_STATE) {
            state->error_count++;
        }
        return 0;
    }
    state->sample_count++;

    lua_rawgeti(L, LUA_REGISTRYINDEX, state->global_ref);
    push_sample(L, &sample);
    if (lua_pcall(L, 1, 0, 0) != LUA_OK) {
        return lua_error(L);
    }
    return 0;
}

void vb_lua_imu_cleanup(lua_State *L, vb_lua_imu_state_t *state)
{
    if (state == NULL) {
        return;
    }
    unref_handler(L, &state->global_ref);
    state->enabled = false;
}

void vb_lua_imu_register(lua_State *L, vb_lua_imu_state_t *state)
{
    if (state == NULL) {
        return;
    }
    state->global_ref = LUA_NOREF;

    lua_pushlightuserdata(L, state);
    lua_setfield(L, LUA_REGISTRYINDEX, VB_LUA_IMU_STATE_REGISTRY_KEY);

    static const luaL_Reg imu_functions[] = {
        {"on", imu_on},
        {"off", imu_off},
        {"state", imu_state},
        {"read", imu_read},
        {"push", imu_push},
        {NULL, NULL},
    };
    luaL_newlib(L, imu_functions);
    lua_setglobal(L, "imu");
}
