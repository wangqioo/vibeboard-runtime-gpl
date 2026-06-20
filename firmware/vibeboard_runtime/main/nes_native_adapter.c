#include "nes_native_adapter.h"

#include "runtime/nes_core_bridge.h"

typedef struct {
    char magic[4];
    uint8_t prg_rom_chunks;
    uint8_t chr_rom_chunks;
    uint8_t mapper1;
    uint8_t mapper2;
    uint8_t prg_ram_size;
    uint8_t tv_system;
    uint8_t tv_system2;
    char unused[5];
} vb_nes_ines_header_t;

typedef struct {
    vb_module_host_api_t host_api;
    module_host_api_v1 host_v1;
    nes_core_status_t core_status;
    void *core_runtime;
    uint16_t display_width;
    uint16_t display_height;
    uint32_t frames;
    uint8_t player_1_mask;
    uint8_t mapper;
    bool running;
    char last_error[96];
} vb_nes_native_module_t;

static vb_nes_native_module_t s_nes_module;

static void set_last_error(vb_nes_native_module_t *nes, const char *message)
{
    if (nes == NULL) {
        return;
    }
    snprintf(nes->last_error, sizeof(nes->last_error), "%s", message ? message : "");
}

static bool read_ines_header(vb_nes_native_module_t *nes, const char *rom_path, vb_nes_ines_header_t *header)
{
    if (nes == NULL || rom_path == NULL || rom_path[0] == '\0' || header == NULL) {
        set_last_error(nes, "rom path missing");
        return false;
    }

    FILE *rom = nes->host_api.file.open(rom_path, "rb");
    if (rom == NULL) {
        set_last_error(nes, "open rom failed");
        return false;
    }

    size_t read = nes->host_api.file.read(header, sizeof(*header), rom);
    nes->host_api.file.close(rom);
    if (read != sizeof(*header)) {
        set_last_error(nes, "read rom header failed");
        return false;
    }

    if (header->magic[0] != 'N' || header->magic[1] != 'E' || header->magic[2] != 'S' ||
        (uint8_t)header->magic[3] != 0x1A) {
        set_last_error(nes, "invalid iNES header");
        return false;
    }

    if ((header->mapper2 & 0x0C) == 0x08) {
        set_last_error(nes, "NES 2.0 rom is not supported yet");
        return false;
    }

    return true;
}

esp_err_t vb_nes_native_module_init(vb_module_host_api_t *host_api, void **module)
{
    if (host_api == NULL || module == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (host_api->version == 0 || host_api->display.width == NULL || host_api->display.height == NULL ||
        host_api->heap.malloc == NULL) {
        return ESP_ERR_NOT_SUPPORTED;
    }

    if (s_nes_module.core_runtime != NULL) {
        nes_core_destroy(s_nes_module.core_runtime);
        s_nes_module.core_runtime = NULL;
    }

    s_nes_module.host_api = *host_api;
    vb_nes_host_v1_shim_init(&s_nes_module.host_v1, &s_nes_module.host_api);
    s_nes_module.core_runtime = nes_core_create(&s_nes_module.host_v1);
    if (s_nes_module.core_runtime == NULL) {
        return ESP_ERR_NO_MEM;
    }
    nes_core_status(s_nes_module.core_runtime, &s_nes_module.core_status);
    s_nes_module.display_width = host_api->display.width();
    s_nes_module.display_height = host_api->display.height();
    s_nes_module.frames = 0;
    s_nes_module.player_1_mask = 0;
    s_nes_module.mapper = 0;
    s_nes_module.running = false;
    s_nes_module.last_error[0] = '\0';
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
    if (nes->core_runtime != NULL) {
        nes_core_status(nes->core_runtime, &nes->core_status);
    }
    lua_pushinteger(L, nes->display_width);
    lua_setfield(L, -2, "display_width");
    lua_pushinteger(L, nes->display_height);
    lua_setfield(L, -2, "display_height");
    lua_pushinteger(L, nes->player_1_mask);
    lua_setfield(L, -2, "player_1_mask");
    lua_pushinteger(L, nes->mapper);
    lua_setfield(L, -2, "mapper");
    lua_pushstring(L, nes->last_error);
    lua_setfield(L, -2, "last_error");
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

    const char *rom_path = luaL_checkstring(L, 1);
    if (!lua_isnoneornil(L, 2)) {
        luaL_checktype(L, 2, LUA_TTABLE);
    }

    vb_nes_ines_header_t header;
    if (!read_ines_header(nes, rom_path, &header)) {
        lua_pushboolean(L, false);
        lua_pushstring(L, nes->last_error);
        return 2;
    }

    nes->mapper = (header.mapper2 & 0xF0) | (header.mapper1 >> 4);
    nes->running = false;
    set_last_error(nes, "native executor pending");
    lua_pushboolean(L, false);
    lua_pushstring(L, nes->last_error);
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
