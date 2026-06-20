#include "nes_native_adapter.h"

#include <string.h>

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

static uint32_t runtime_mask_to_nes_mask(uint8_t mask)
{
    uint32_t nes_mask = 0;
    if ((mask & (1 << 0)) != 0) {
        nes_mask |= (1 << 4);
    }
    if ((mask & (1 << 1)) != 0) {
        nes_mask |= (1 << 5);
    }
    if ((mask & (1 << 2)) != 0) {
        nes_mask |= (1 << 6);
    }
    if ((mask & (1 << 3)) != 0) {
        nes_mask |= (1 << 7);
    }
    if ((mask & (1 << 4)) != 0) {
        nes_mask |= (1 << 0);
    }
    if ((mask & (1 << 5)) != 0) {
        nes_mask |= (1 << 1);
    }
    if ((mask & (1 << 6)) != 0) {
        nes_mask |= (1 << 2);
    }
    if ((mask & (1 << 7)) != 0) {
        nes_mask |= (1 << 3);
    }
    return nes_mask;
}

static void set_last_error(vb_nes_native_module_t *nes, const char *message)
{
    if (nes == NULL) {
        return;
    }
    snprintf(nes->last_error, sizeof(nes->last_error), "%s", message ? message : "");
}

static const char *core_state_name(int32_t state)
{
    switch (state) {
    case 0:
        return "empty";
    case 1:
        return "loaded";
    case 2:
        return "running";
    case 3:
        return "paused";
    case 4:
        return "stopping";
    case 5:
        return "error";
    default:
        return "unknown";
    }
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

static uint32_t table_u32(lua_State *L, const char *key, uint32_t fallback)
{
    uint32_t value = fallback;
    lua_getfield(L, -1, key);
    if (lua_isnumber(L, -1)) {
        lua_Integer integer = lua_tointeger(L, -1);
        if (integer >= 0) {
            value = (uint32_t)integer;
        }
    }
    lua_pop(L, 1);
    return value;
}

static uint16_t table_u16(lua_State *L, const char *key, uint16_t fallback)
{
    uint32_t value = table_u32(L, key, fallback);
    return value > UINT16_MAX ? UINT16_MAX : (uint16_t)value;
}

static int32_t table_i32(lua_State *L, const char *key, int32_t fallback)
{
    int32_t value = fallback;
    lua_getfield(L, -1, key);
    if (lua_isnumber(L, -1)) {
        lua_Integer integer = lua_tointeger(L, -1);
        if (integer < INT32_MIN) {
            value = INT32_MIN;
        } else if (integer > INT32_MAX) {
            value = INT32_MAX;
        } else {
            value = (int32_t)integer;
        }
    }
    lua_pop(L, 1);
    return value;
}

static bool table_bool(lua_State *L, const char *key, bool fallback)
{
    bool value = fallback;
    lua_getfield(L, -1, key);
    if (!lua_isnil(L, -1)) {
        value = lua_toboolean(L, -1);
    }
    lua_pop(L, 1);
    return value;
}

static void clamp_start_options(nes_core_options_t *options)
{
    if (options->width == 0 || options->width > 320) {
        options->width = 256;
    }
    if (options->height == 0 || options->height > 240) {
        options->height = 240;
    }
    if (options->x > 320 || options->x + options->width > 320) {
        options->x = (uint16_t)((320 - options->width) / 2);
    }
    if (options->y > 240 || options->y + options->height > 240) {
        options->y = 0;
    }
    if (options->transfer_rows == 0 || options->transfer_rows > options->height) {
        options->transfer_rows = 8;
    }
    if (options->target_fps == 0 || options->target_fps > 120) {
        options->target_fps = 60;
    }
    if (options->task_stack_bytes < 8192) {
        options->task_stack_bytes = 16 * 1024;
    }
    if (options->audio_sample_rate == 0) {
        options->audio_sample_rate = 22050;
    }
    if (options->audio_bits_per_sample == 0) {
        options->audio_bits_per_sample = 16;
    }
    if (options->audio_channels == 0) {
        options->audio_channels = 1;
    }
    if (options->audio_volume_percent > 100) {
        options->audio_volume_percent = 100;
    }
    if (options->audio_queue_bytes == 0) {
        options->audio_queue_bytes = 32768;
    }
}

static void apply_start_options(lua_State *L, int index, nes_core_options_t *options)
{
    if (lua_isnoneornil(L, index) || options == NULL) {
        return;
    }

    luaL_checktype(L, index, LUA_TTABLE);
    lua_pushvalue(L, index);
    options->x = table_u16(L, "x", options->x);
    options->y = table_u16(L, "y", options->y);
    options->width = table_u16(L, "width", options->width);
    options->height = table_u16(L, "height", options->height);
    options->transfer_rows = table_u16(L, "transfer_rows", options->transfer_rows);
    options->target_fps = table_u32(L, "target_fps", options->target_fps);
    options->task_stack_bytes = table_u32(L, "task_stack_bytes", options->task_stack_bytes);
    options->task_priority = table_u32(L, "task_priority", options->task_priority);
    options->task_core = table_i32(L, "task_core", options->task_core);
    options->autorun = table_bool(L, "autorun", options->autorun != 0) ? 1 : 0;
    options->audio_enabled = table_bool(L, "audio_enabled", options->audio_enabled != 0) ? 1 : 0;
    options->audio_lua_fallback = table_bool(L, "audio_lua_fallback", options->audio_lua_fallback != 0) ? 1 : 0;
    options->audio_channels = table_u16(L, "audio_channels", options->audio_channels);
    options->audio_bits_per_sample = table_u16(L, "audio_bits_per_sample", options->audio_bits_per_sample);
    options->audio_volume_percent = (uint8_t)table_u32(L, "audio_volume_percent", options->audio_volume_percent);
    options->audio_sample_rate = table_u32(L, "audio_sample_rate", options->audio_sample_rate);
    options->audio_queue_bytes = table_u32(L, "audio_queue_bytes", options->audio_queue_bytes);
    lua_pop(L, 1);
    clamp_start_options(options);
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

    if (nes->core_runtime != NULL) {
        nes_core_status(nes->core_runtime, &nes->core_status);
        nes->running = nes->core_status.running != 0;
        nes->frames = nes->core_status.frames;
        if (nes->core_status.mapper != 0) {
            nes->mapper = nes->core_status.mapper;
        }
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
    lua_pushinteger(L, nes->mapper);
    lua_setfield(L, -2, "mapper");
    lua_pushstring(L, nes->last_error);
    lua_setfield(L, -2, "last_error");
    lua_pushinteger(L, nes->core_status.state);
    lua_setfield(L, -2, "core_state");
    lua_pushboolean(L, nes->core_status.running != 0);
    lua_setfield(L, -2, "core_running");
    lua_pushboolean(L, nes->core_status.paused != 0);
    lua_setfield(L, -2, "core_paused");
    lua_pushboolean(L, nes->core_status.loaded != 0);
    lua_setfield(L, -2, "core_loaded");
    lua_pushinteger(L, nes->core_status.frames);
    lua_setfield(L, -2, "core_frames");
    lua_pushinteger(L, nes->core_status.started_ms);
    lua_setfield(L, -2, "started_ms");
    lua_pushinteger(L, nes->core_status.stopped_ms);
    lua_setfield(L, -2, "stopped_ms");
    lua_pushinteger(L, nes->core_status.last_gamepad_mask);
    lua_setfield(L, -2, "last_gamepad_mask");
    lua_pushinteger(L, nes->core_status.last_nes_mask);
    lua_setfield(L, -2, "last_nes_mask");
    lua_pushinteger(L, nes->core_status.step_pending);
    lua_setfield(L, -2, "step_pending");
    lua_pushinteger(L, nes->core_status.stage);
    lua_setfield(L, -2, "stage");
    lua_pushinteger(L, nes->core_status.transfer_rows);
    lua_setfield(L, -2, "transfer_rows");
    lua_pushboolean(L, nes->core_status.display_stream_supported != 0);
    lua_setfield(L, -2, "display_stream_supported");
    lua_pushboolean(L, nes->core_status.display_stream_active != 0);
    lua_setfield(L, -2, "display_stream_active");
    lua_pushinteger(L, nes->core_status.display_stream_slots);
    lua_setfield(L, -2, "display_stream_slots");
    lua_pushinteger(L, nes->core_status.display_stream_queued);
    lua_setfield(L, -2, "display_stream_queued");
    lua_pushboolean(L, nes->core_status.display_async_supported != 0);
    lua_setfield(L, -2, "display_async_supported");
    lua_pushboolean(L, nes->core_status.display_async_active != 0);
    lua_setfield(L, -2, "display_async_active");
    lua_pushinteger(L, nes->core_status.display_async_slots);
    lua_setfield(L, -2, "display_async_slots");
    lua_pushboolean(L, nes->core_status.task_stack_psram != 0);
    lua_setfield(L, -2, "task_stack_psram");
    lua_pushboolean(L, nes->core_status.autorun != 0);
    lua_setfield(L, -2, "autorun");
    lua_pushboolean(L, nes->core_status.audio_requested != 0);
    lua_setfield(L, -2, "audio_requested");
    lua_pushboolean(L, nes->core_status.audio_active != 0);
    lua_setfield(L, -2, "audio_active");
    lua_pushinteger(L, nes->core_status.audio_queued_bytes);
    lua_setfield(L, -2, "audio_queued_bytes");
    lua_pushinteger(L, nes->core_status.audio_dropped_bytes);
    lua_setfield(L, -2, "audio_dropped_bytes");
    lua_pushstring(L, nes->core_status.audio_backend);
    lua_setfield(L, -2, "audio_backend");
    lua_pushstring(L, nes->core_status.audio_error);
    lua_setfield(L, -2, "audio_error");
    lua_pushstring(L, nes->core_status.last_error);
    lua_setfield(L, -2, "core_last_error");
    lua_pushstring(L, core_state_name(nes->core_status.state));
    lua_setfield(L, -2, "status");
    return 1;
}

int vb_nes_native_module_start(lua_State *L, void *module)
{
    vb_nes_native_module_t *nes = (vb_nes_native_module_t *)module;
    nes_core_options_t options;
    char err[96];
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
    memset(&options, 0, sizeof(options));
    options.x = 32;
    options.y = 0;
    options.width = 256;
    options.height = 240;
    options.transfer_rows = 8;
    options.target_fps = 60;
    options.task_stack_bytes = 16 * 1024;
    options.task_priority = 3;
    options.task_core = -1;
    options.autorun = 1;
    options.audio_enabled = 0;
    options.audio_lua_fallback = 1;
    options.audio_channels = 1;
    options.audio_bits_per_sample = 16;
    options.audio_volume_percent = 100;
    options.audio_sample_rate = 22050;
    options.audio_queue_bytes = 32768;
    apply_start_options(L, 2, &options);
    err[0] = '\0';

    nes_core_set_input_mask(nes->core_runtime, runtime_mask_to_nes_mask(nes->player_1_mask));
    if (!nes_core_start(nes->core_runtime, rom_path, &options, err, sizeof(err))) {
        set_last_error(nes, err[0] ? err : "start nes core failed");
        lua_pushboolean(L, false);
        lua_pushstring(L, nes->last_error);
        return 2;
    }

    nes->running = true;
    set_last_error(nes, "");
    lua_pushboolean(L, true);
    return 1;
}

int vb_nes_native_module_stop(lua_State *L, void *module)
{
    vb_nes_native_module_t *nes = (vb_nes_native_module_t *)module;
    char err[96];
    if (nes != NULL) {
        err[0] = '\0';
        if (nes->core_runtime != NULL &&
            !nes_core_stop(nes->core_runtime, 3000, 1, err, sizeof(err))) {
            set_last_error(nes, err[0] ? err : "nes stop failed");
        }
        nes->running = false;
    }
    return 0;
}

int vb_nes_native_module_read_audio(lua_State *L, void *module)
{
    vb_nes_native_module_t *nes = (vb_nes_native_module_t *)module;
    lua_Integer requested = luaL_optinteger(L, 1, 4096);
    size_t max_bytes;
    uint8_t *buf;
    size_t got;

    if (nes == NULL) {
        return luaL_error(L, "native executor missing");
    }
    if (requested < 256) {
        requested = 256;
    } else if (requested > 8192) {
        requested = 8192;
    }

    max_bytes = (size_t)requested;
    max_bytes = (max_bytes / 2) * 2;
    if (nes->core_runtime == NULL || max_bytes == 0) {
        lua_pushliteral(L, "");
        return 1;
    }

    buf = (uint8_t *)nes->host_api.heap.malloc(max_bytes);
    if (buf == NULL) {
        return luaL_error(L, "nes.read_audio: alloc buffer failed");
    }
    got = nes_core_read_audio(nes->core_runtime, buf, max_bytes);
    lua_pushlstring(L, (const char *)buf, got);
    nes->host_api.heap.free(buf);
    nes_core_status(nes->core_runtime, &nes->core_status);
    return 1;
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
        if (nes->core_runtime != NULL) {
            nes_core_set_input_mask(nes->core_runtime, runtime_mask_to_nes_mask(nes->player_1_mask));
        }
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
        if (nes->core_runtime != NULL) {
            nes_core_set_input_mask(nes->core_runtime, runtime_mask_to_nes_mask(nes->player_1_mask));
        }
    }
    lua_pushboolean(L, true);
    return 1;
}
