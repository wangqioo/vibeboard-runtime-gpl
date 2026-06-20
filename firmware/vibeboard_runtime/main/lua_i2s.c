#include "lua_i2s.h"

#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "driver/i2s_std.h"
#include "esp_err.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "lauxlib.h"

#define VB_I2S_CONFIG_PATH "/sdcard/runtime/i2s.json"
#define VB_I2S_MAX_PORTS 2
#define VB_I2S_DEFAULT_READ_BYTES 4096
#define VB_I2S_MAX_READ_BYTES 16384

#define VB_LUA_I2S_MODE_MASTER (1 << 0)
#define VB_LUA_I2S_MODE_RX (1 << 1)
#define VB_LUA_I2S_MODE_TX (1 << 2)
#define VB_LUA_I2S_FORMAT_I2S 1
#define VB_LUA_I2S_CHANNEL_ONLY_LEFT 2
#define VB_LUA_I2S_CHANNEL_ONLY_RIGHT 3
#define VB_LUA_I2S_CHANNEL_STEREO 1

typedef struct {
    bool started;
    i2s_chan_handle_t rx;
    uint32_t rate;
    uint16_t bits;
    uint16_t channel;
    int bclk_pin;
    int ws_pin;
    int din_pin;
    int mclk_pin;
    char last_error[96];
} vb_lua_i2s_port_t;

typedef struct {
    int bclk_pin;
    int ws_pin;
    int din_pin;
    int mclk_pin;
} vb_lua_i2s_pins_t;

static const char *TAG = "lua_i2s";
static vb_lua_i2s_port_t s_i2s[VB_I2S_MAX_PORTS];

static void set_last_error(vb_lua_i2s_port_t *port, const char *text)
{
    if (port == NULL) {
        return;
    }
    strlcpy(port->last_error, text ? text : "", sizeof(port->last_error));
}

static bool read_text_file(const char *path, char *buffer, size_t buffer_size)
{
    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        return false;
    }
    size_t got = fread(buffer, 1, buffer_size - 1, file);
    fclose(file);
    buffer[got] = '\0';
    return got > 0;
}

static bool json_int(cJSON *root, const char *key, int *out)
{
    cJSON *item = cJSON_GetObjectItem(root, key);
    if (cJSON_IsNumber(item)) {
        *out = item->valueint;
        return true;
    }
    return false;
}

static esp_err_t load_i2s_pins(vb_lua_i2s_pins_t *pins)
{
    if (pins == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    pins->bclk_pin = -1;
    pins->ws_pin = -1;
    pins->din_pin = -1;
    pins->mclk_pin = -1;

    char json_text[512];
    if (!read_text_file(VB_I2S_CONFIG_PATH, json_text, sizeof(json_text))) {
        return ESP_ERR_NOT_FOUND;
    }

    cJSON *root = cJSON_Parse(json_text);
    if (root == NULL) {
        return ESP_ERR_INVALID_RESPONSE;
    }

    json_int(root, "bclk_pin", &pins->bclk_pin);
    json_int(root, "ws_pin", &pins->ws_pin);
    json_int(root, "din_pin", &pins->din_pin);
    json_int(root, "mclk_pin", &pins->mclk_pin);
    cJSON_Delete(root);

    if (pins->bclk_pin < 0 || pins->ws_pin < 0 || pins->din_pin < 0) {
        return ESP_ERR_INVALID_ARG;
    }
    return ESP_OK;
}

static vb_lua_i2s_port_t *check_port(lua_State *L, int index)
{
    int port_id = (int)luaL_checkinteger(L, index);
    if (port_id < 0 || port_id >= VB_I2S_MAX_PORTS) {
        luaL_error(L, "invalid i2s port");
        return NULL;
    }
    return &s_i2s[port_id];
}

static int table_int(lua_State *L, const char *key, int fallback)
{
    lua_getfield(L, 2, key);
    int value = lua_isnumber(L, -1) ? (int)lua_tointeger(L, -1) : fallback;
    lua_pop(L, 1);
    return value;
}

static i2s_data_bit_width_t data_width_from_bits(int bits)
{
    switch (bits) {
    case 16:
        return I2S_DATA_BIT_WIDTH_16BIT;
    case 24:
        return I2S_DATA_BIT_WIDTH_24BIT;
    case 32:
        return I2S_DATA_BIT_WIDTH_32BIT;
    default:
        return I2S_DATA_BIT_WIDTH_16BIT;
    }
}

static i2s_slot_mode_t slot_mode_from_channel(int channel)
{
    return channel == VB_LUA_I2S_CHANNEL_STEREO ? I2S_SLOT_MODE_STEREO : I2S_SLOT_MODE_MONO;
}

static int i2s_stop(lua_State *L)
{
    vb_lua_i2s_port_t *port = check_port(L, 1);
    if (port == NULL) {
        return 0;
    }

    if (port->rx != NULL) {
        (void)i2s_channel_disable(port->rx);
        (void)i2s_del_channel(port->rx);
        port->rx = NULL;
    }
    port->started = false;
    lua_pushboolean(L, true);
    return 1;
}

static int i2s_start(lua_State *L)
{
    vb_lua_i2s_port_t *port = check_port(L, 1);
    if (port == NULL) {
        return 0;
    }
    luaL_checktype(L, 2, LUA_TTABLE);

    if (port->started) {
        lua_pushboolean(L, true);
        return 1;
    }

    int mode = table_int(L, "mode", VB_LUA_I2S_MODE_MASTER | VB_LUA_I2S_MODE_RX);
    int rate = table_int(L, "rate", 16000);
    int bits = table_int(L, "bits", 16);
    int channel = table_int(L, "channel", VB_LUA_I2S_CHANNEL_ONLY_LEFT);
    int dma_count = table_int(L, "buffer_count", 4);
    int dma_len = table_int(L, "buffer_len", 256);

    if ((mode & VB_LUA_I2S_MODE_RX) == 0) {
        return luaL_error(L, "only i2s RX is supported");
    }

    vb_lua_i2s_pins_t pins;
    esp_err_t err = load_i2s_pins(&pins);
    if (err != ESP_OK) {
        set_last_error(port, esp_err_to_name(err));
        return luaL_error(L, "i2s config missing or invalid: %s", VB_I2S_CONFIG_PATH);
    }

    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_AUTO, I2S_ROLE_MASTER);
    chan_cfg.dma_desc_num = dma_count > 0 ? dma_count : 4;
    chan_cfg.dma_frame_num = dma_len > 0 ? dma_len : 256;
    i2s_chan_handle_t rx = NULL;
    err = i2s_new_channel(&chan_cfg, NULL, &rx);
    if (err != ESP_OK) {
        set_last_error(port, esp_err_to_name(err));
        return luaL_error(L, "i2s channel create failed: %s", esp_err_to_name(err));
    }

    i2s_std_config_t std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(rate),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(data_width_from_bits(bits), slot_mode_from_channel(channel)),
        .gpio_cfg = {
            .mclk = pins.mclk_pin,
            .bclk = pins.bclk_pin,
            .ws = pins.ws_pin,
            .dout = I2S_GPIO_UNUSED,
            .din = pins.din_pin,
            .invert_flags = {
                .mclk_inv = false,
                .bclk_inv = false,
                .ws_inv = false,
            },
        },
    };

    err = i2s_channel_init_std_mode(rx, &std_cfg);
    if (err == ESP_OK) {
        err = i2s_channel_enable(rx);
    }
    if (err != ESP_OK) {
        (void)i2s_del_channel(rx);
        set_last_error(port, esp_err_to_name(err));
        return luaL_error(L, "i2s start failed: %s", esp_err_to_name(err));
    }

    port->rx = rx;
    port->started = true;
    port->rate = rate;
    port->bits = bits;
    port->channel = channel;
    port->bclk_pin = pins.bclk_pin;
    port->ws_pin = pins.ws_pin;
    port->din_pin = pins.din_pin;
    port->mclk_pin = pins.mclk_pin;
    set_last_error(port, "");

    lua_pushboolean(L, true);
    return 1;
}

static int i2s_read(lua_State *L)
{
    vb_lua_i2s_port_t *port = check_port(L, 1);
    int bytes = (int)luaL_optinteger(L, 2, VB_I2S_DEFAULT_READ_BYTES);
    int timeout_ms = (int)luaL_optinteger(L, 3, 0);
    if (port == NULL) {
        return 0;
    }
    if (!port->started || port->rx == NULL) {
        lua_pushliteral(L, "");
        return 1;
    }
    if (bytes <= 0) {
        bytes = VB_I2S_DEFAULT_READ_BYTES;
    }
    if (bytes > VB_I2S_MAX_READ_BYTES) {
        bytes = VB_I2S_MAX_READ_BYTES;
    }

    uint8_t *buffer = heap_caps_malloc(bytes, MALLOC_CAP_8BIT);
    if (buffer == NULL) {
        return luaL_error(L, "i2s read buffer alloc failed");
    }

    size_t read = 0;
    esp_err_t err = i2s_channel_read(port->rx, buffer, bytes, &read, pdMS_TO_TICKS(timeout_ms));
    if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
        heap_caps_free(buffer);
        set_last_error(port, esp_err_to_name(err));
        return luaL_error(L, "i2s read failed: %s", esp_err_to_name(err));
    }
    lua_pushlstring(L, (const char *)buffer, read);
    heap_caps_free(buffer);
    return 1;
}

static int i2s_status(lua_State *L)
{
    vb_lua_i2s_port_t *port = check_port(L, 1);
    if (port == NULL) {
        return 0;
    }
    lua_newtable(L);
    lua_pushboolean(L, port->started);
    lua_setfield(L, -2, "started");
    lua_pushinteger(L, port->rate);
    lua_setfield(L, -2, "rate");
    lua_pushinteger(L, port->bits);
    lua_setfield(L, -2, "bits");
    lua_pushinteger(L, port->channel);
    lua_setfield(L, -2, "channel");
    lua_pushinteger(L, port->bclk_pin);
    lua_setfield(L, -2, "bclk_pin");
    lua_pushinteger(L, port->ws_pin);
    lua_setfield(L, -2, "ws_pin");
    lua_pushinteger(L, port->din_pin);
    lua_setfield(L, -2, "din_pin");
    lua_pushstring(L, port->last_error);
    lua_setfield(L, -2, "last_error");
    return 1;
}

void vb_lua_i2s_register(lua_State *L)
{
    static const luaL_Reg functions[] = {
        {"start", i2s_start},
        {"read", i2s_read},
        {"stop", i2s_stop},
        {"status", i2s_status},
        {NULL, NULL},
    };

    luaL_newlib(L, functions);
    lua_pushinteger(L, VB_LUA_I2S_MODE_MASTER);
    lua_setfield(L, -2, "MODE_MASTER");
    lua_pushinteger(L, VB_LUA_I2S_MODE_RX);
    lua_setfield(L, -2, "MODE_RX");
    lua_pushinteger(L, VB_LUA_I2S_MODE_TX);
    lua_setfield(L, -2, "MODE_TX");
    lua_pushinteger(L, VB_LUA_I2S_FORMAT_I2S);
    lua_setfield(L, -2, "FORMAT_I2S");
    lua_pushinteger(L, VB_LUA_I2S_CHANNEL_ONLY_LEFT);
    lua_setfield(L, -2, "CHANNEL_ONLY_LEFT");
    lua_pushinteger(L, VB_LUA_I2S_CHANNEL_ONLY_RIGHT);
    lua_setfield(L, -2, "CHANNEL_ONLY_RIGHT");
    lua_pushinteger(L, VB_LUA_I2S_CHANNEL_STEREO);
    lua_setfield(L, -2, "CHANNEL_STEREO");
    lua_setglobal(L, "i2s");

    ESP_LOGI(TAG, "Lua i2s module registered; RX pins come from %s", VB_I2S_CONFIG_PATH);
}
