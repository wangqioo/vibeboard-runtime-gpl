#include "nes_native_adapter.h"

typedef struct {
    vb_module_host_api_t host_api;
    uint16_t display_width;
    uint16_t display_height;
    uint32_t frames;
    uint8_t player_1_mask;
    bool running;
} vb_nes_native_module_t;

static vb_nes_native_module_t s_nes_module;

esp_err_t vb_nes_native_module_init(vb_module_host_api_t *host_api, void **module)
{
    if (host_api == NULL || module == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (host_api->version == 0 || host_api->display.width == NULL || host_api->display.height == NULL ||
        host_api->heap.malloc == NULL) {
        return ESP_ERR_NOT_SUPPORTED;
    }

    s_nes_module.host_api = *host_api;
    s_nes_module.display_width = host_api->display.width();
    s_nes_module.display_height = host_api->display.height();
    s_nes_module.frames = 0;
    s_nes_module.player_1_mask = 0;
    s_nes_module.running = false;
    *module = &s_nes_module;
    return ESP_OK;
}

int vb_nes_native_module_state(lua_State *L, void *module)
{
    vb_nes_native_module_t *nes = (vb_nes_native_module_t *)module;
    if (nes == NULL) {
        return luaL_error(L, "native executor missing");
    }

    lua_newtable(L);
    lua_pushboolean(L, nes->running);
    lua_setfield(L, -2, "running");
    lua_pushinteger(L, nes->frames);
    lua_setfield(L, -2, "frames");
    lua_pushinteger(L, nes->display_width);
    lua_setfield(L, -2, "display_width");
    lua_pushinteger(L, nes->display_height);
    lua_setfield(L, -2, "display_height");
    lua_pushinteger(L, nes->player_1_mask);
    lua_setfield(L, -2, "player_1_mask");
    lua_pushstring(L, "native executor pending");
    lua_setfield(L, -2, "status");
    return 1;
}

int vb_nes_native_module_start(lua_State *L, void *module)
{
    vb_nes_native_module_t *nes = (vb_nes_native_module_t *)module;
    if (nes == NULL) {
        return luaL_error(L, "native executor missing");
    }

    luaL_checkstring(L, 1);
    if (!lua_isnoneornil(L, 2)) {
        luaL_checktype(L, 2, LUA_TTABLE);
    }

    nes->running = false;
    lua_pushboolean(L, false);
    lua_pushstring(L, "native executor pending");
    return 2;
}

int vb_nes_native_module_stop(lua_State *L, void *module)
{
    vb_nes_native_module_t *nes = (vb_nes_native_module_t *)module;
    if (nes != NULL) {
        nes->running = false;
    }
    return 0;
}

int vb_nes_native_module_input_set_mask(lua_State *L, void *module)
{
    vb_nes_native_module_t *nes = (vb_nes_native_module_t *)module;
    if (nes == NULL) {
        return luaL_error(L, "native executor missing");
    }

    lua_Integer player = luaL_checkinteger(L, 1);
    lua_Integer mask = luaL_checkinteger(L, 2);
    if (player == 1) {
        nes->player_1_mask = (uint8_t)mask;
    }
    lua_pushboolean(L, true);
    return 1;
}

int vb_nes_native_module_input_clear(lua_State *L, void *module)
{
    vb_nes_native_module_t *nes = (vb_nes_native_module_t *)module;
    if (nes == NULL) {
        return luaL_error(L, "native executor missing");
    }

    lua_Integer player = luaL_checkinteger(L, 1);
    if (player == 1) {
        nes->player_1_mask = 0;
    }
    lua_pushboolean(L, true);
    return 1;
}
