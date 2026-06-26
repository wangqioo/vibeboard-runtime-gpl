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
#define VB_I2S_TX_STREAM_DMA_COUNT 2
#define VB_I2S_TX_STREAM_DMA_LEN 64
#define VB_I2S_TX_STREAM_ERR_NEW_CHANNEL 10000
#define VB_I2S_TX_STREAM_ERR_INIT_STD 20000
#define VB_I2S_TX_STREAM_ERR_ENABLE 30000

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
    i2s_chan_handle_t tx;
    uint32_t rate;
    uint16_t bits;
    uint16_t channel;
    int bclk_pin;
    int ws_pin;
    int din_pin;
    int dout_pin;
    int mclk_pin;
    uint32_t reads;
    uint32_t writes;
    size_t rx_bytes;
    size_t tx_bytes;
    char last_error[96];
} vb_lua_i2s_port_t;

typedef struct {
    uint8_t port_id;
    bool in_use;
} vb_i2s_tx_stream_t;

typedef struct {
    int bclk_pin;
    int ws_pin;
    int din_pin;
    int dout_pin;
    int mclk_pin;
} vb_lua_i2s_pins_t;

static const char *TAG = "lua_i2s";
static vb_lua_i2s_port_t s_i2s[VB_I2S_MAX_PORTS];
static vb_i2s_tx_stream_t s_tx_streams[VB_I2S_MAX_PORTS];

static void set_last_error(vb_lua_i2s_port_t *port, const char *text)
{
    if (port == NULL) {
        return;
    }
    strlcpy(port->last_error, text ? text : "", sizeof(port->last_error));
}

static esp_err_t encode_tx_stream_error(esp_err_t err, int stage)
{
    return err == ESP_OK ? ESP_OK : (esp_err_t)(stage + (int)err);
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
    pins->dout_pin = -1;
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
    json_int(root, "dout_pin", &pins->dout_pin);
    json_int(root, "mclk_pin", &pins->mclk_pin);
    cJSON_Delete(root);

    if (pins->bclk_pin < 0 || pins->ws_pin < 0) {
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

static int channel_from_count(uint16_t channels)
{
    return channels > 1 ? VB_LUA_I2S_CHANNEL_STEREO : VB_LUA_I2S_CHANNEL_ONLY_LEFT;
}

static void stop_port(vb_lua_i2s_port_t *port)
{
    if (port == NULL) {
        return;
    }

    if (port->rx != NULL) {
        (void)i2s_channel_disable(port->rx);
        (void)i2s_del_channel(port->rx);
        port->rx = NULL;
    }
    if (port->tx != NULL) {
        (void)i2s_channel_disable(port->tx);
        (void)i2s_del_channel(port->tx);
        port->tx = NULL;
    }
    port->started = false;
}

static int i2s_stop(lua_State *L)
{
    vb_lua_i2s_port_t *port = check_port(L, 1);
    if (port == NULL) {
        return 0;
    }

    stop_port(port);
    lua_pushboolean(L, true);
    return 1;
}

static esp_err_t start_port(vb_lua_i2s_port_t *port,
                            bool want_rx,
                            bool want_tx,
                            uint32_t rate,
                            uint16_t bits,
                            uint16_t channel,
                            int dma_count,
                            int dma_len,
                            bool encode_tx_stream_diagnostics)
{
    if (port == NULL || (!want_rx && !want_tx)) {
        return ESP_ERR_INVALID_ARG;
    }
    if (port->started) {
        bool has_rx = port->rx != NULL;
        bool has_tx = port->tx != NULL;
        if (has_rx == want_rx && has_tx == want_tx && port->rate == rate && port->bits == bits && port->channel == channel) {
            return ESP_OK;
        }
        stop_port(port);
    }

    vb_lua_i2s_pins_t pins;
    esp_err_t err = load_i2s_pins(&pins);
    if (err != ESP_OK) {
        set_last_error(port, esp_err_to_name(err));
        return err;
    }
    if (want_rx && pins.din_pin < 0) {
        set_last_error(port, "missing din_pin");
        return ESP_ERR_INVALID_ARG;
    }
    if (want_tx && pins.dout_pin < 0) {
        set_last_error(port, "missing dout_pin");
        return ESP_ERR_INVALID_ARG;
    }

    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_AUTO, I2S_ROLE_MASTER);
    chan_cfg.dma_desc_num = dma_count > 0 ? dma_count : 4;
    chan_cfg.dma_frame_num = dma_len > 0 ? dma_len : 256;
    i2s_chan_handle_t rx = NULL;
    i2s_chan_handle_t tx = NULL;
    err = i2s_new_channel(&chan_cfg, want_tx ? &tx : NULL, want_rx ? &rx : NULL);
    if (err != ESP_OK) {
        set_last_error(port, esp_err_to_name(err));
        return encode_tx_stream_diagnostics ? encode_tx_stream_error(err, VB_I2S_TX_STREAM_ERR_NEW_CHANNEL) : err;
    }

    i2s_std_config_t std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(rate),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(data_width_from_bits(bits), slot_mode_from_channel(channel)),
        .gpio_cfg = {
            .mclk = pins.mclk_pin,
            .bclk = pins.bclk_pin,
            .ws = pins.ws_pin,
            .dout = want_tx ? pins.dout_pin : I2S_GPIO_UNUSED,
            .din = want_rx ? pins.din_pin : I2S_GPIO_UNUSED,
            .invert_flags = {
                .mclk_inv = false,
                .bclk_inv = false,
                .ws_inv = false,
            },
        },
    };

    if (rx != NULL) {
        err = i2s_channel_init_std_mode(rx, &std_cfg);
    }
    if (err == ESP_OK && tx != NULL) {
        err = i2s_channel_init_std_mode(tx, &std_cfg);
    }
    int failure_stage = VB_I2S_TX_STREAM_ERR_INIT_STD;
    if (err == ESP_OK && rx != NULL) {
        err = i2s_channel_enable(rx);
        failure_stage = VB_I2S_TX_STREAM_ERR_ENABLE;
    }
    if (err == ESP_OK && tx != NULL) {
        err = i2s_channel_enable(tx);
        failure_stage = VB_I2S_TX_STREAM_ERR_ENABLE;
    }
    if (err != ESP_OK) {
        if (rx != NULL) {
            (void)i2s_del_channel(rx);
        }
        if (tx != NULL) {
            (void)i2s_del_channel(tx);
        }
        set_last_error(port, esp_err_to_name(err));
        return encode_tx_stream_diagnostics ? encode_tx_stream_error(err, failure_stage) : err;
    }

    port->rx = rx;
    port->tx = tx;
    port->started = true;
    port->rate = rate;
    port->bits = bits;
    port->channel = channel;
    port->bclk_pin = pins.bclk_pin;
    port->ws_pin = pins.ws_pin;
    port->din_pin = pins.din_pin;
    port->dout_pin = pins.dout_pin;
    port->mclk_pin = pins.mclk_pin;
    port->reads = 0;
    port->writes = 0;
    port->rx_bytes = 0;
    port->tx_bytes = 0;
    set_last_error(port, "");
    return ESP_OK;
}

static int i2s_start(lua_State *L)
{
    vb_lua_i2s_port_t *port = check_port(L, 1);
    if (port == NULL) {
        return 0;
    }
    luaL_checktype(L, 2, LUA_TTABLE);

    int mode = table_int(L, "mode", VB_LUA_I2S_MODE_MASTER | VB_LUA_I2S_MODE_RX);
    int rate = table_int(L, "rate", 16000);
    int bits = table_int(L, "bits", 16);
    int channel = table_int(L, "channel", VB_LUA_I2S_CHANNEL_ONLY_LEFT);
    int dma_count = table_int(L, "buffer_count", 4);
    int dma_len = table_int(L, "buffer_len", 256);

    bool want_rx = (mode & VB_LUA_I2S_MODE_RX) != 0;
    bool want_tx = (mode & VB_LUA_I2S_MODE_TX) != 0;
    if (!want_rx && !want_tx) {
        return luaL_error(L, "i2s mode must include RX or TX");
    }
    esp_err_t err = start_port(port,
                               want_rx,
                               want_tx,
                               (uint32_t)rate,
                               (uint16_t)bits,
                               (uint16_t)channel,
                               dma_count,
                               dma_len,
                               false);
    if (err != ESP_OK) {
        if (strcmp(port->last_error, "missing din_pin") == 0 && want_rx) {
            return luaL_error(L, "i2s config missing din_pin for RX");
        }
        if (strcmp(port->last_error, "missing dout_pin") == 0 && want_tx) {
            return luaL_error(L, "i2s config missing dout_pin for TX");
        }
        if (err == ESP_ERR_NOT_FOUND || err == ESP_ERR_INVALID_RESPONSE || err == ESP_ERR_INVALID_ARG) {
            return luaL_error(L, "i2s config missing or invalid: %s", VB_I2S_CONFIG_PATH);
        }
        return luaL_error(L, "i2s start failed: %s", esp_err_to_name(err));
    }

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
    port->reads++;
    port->rx_bytes += read;
    lua_pushlstring(L, (const char *)buffer, read);
    heap_caps_free(buffer);
    return 1;
}

static int i2s_write(lua_State *L)
{
    vb_lua_i2s_port_t *port = check_port(L, 1);
    size_t len = 0;
    const char *data = luaL_checklstring(L, 2, &len);
    int timeout_ms = (int)luaL_optinteger(L, 3, 0);
    if (port == NULL) {
        return 0;
    }
    if (!port->started || port->tx == NULL || len == 0) {
        lua_pushinteger(L, 0);
        return 1;
    }

    size_t written = 0;
    int err = vb_i2s_tx_stream_write(&(vb_i2s_tx_stream_t){ .port_id = (uint8_t)(port - s_i2s) },
                                     data,
                                     len,
                                     &written,
                                     (uint32_t)timeout_ms);
    if (err != 0) {
        set_last_error(port, esp_err_to_name(err));
        return luaL_error(L, "i2s write failed: %s", esp_err_to_name(err));
    }
    lua_pushinteger(L, (lua_Integer)written);
    return 1;
}

int vb_i2s_tx_stream_begin(uint8_t port_id, uint32_t sample_rate, uint16_t bits, uint16_t channels, void **out_stream)
{
    if (out_stream == NULL || port_id >= VB_I2S_MAX_PORTS || sample_rate == 0 || bits == 0) {
        return ESP_ERR_INVALID_ARG;
    }
    *out_stream = NULL;

    vb_lua_i2s_port_t *port = &s_i2s[port_id];
    esp_err_t err = start_port(port,
                               false,
                               true,
                               sample_rate,
                               bits,
                               (uint16_t)channel_from_count(channels),
                               VB_I2S_TX_STREAM_DMA_COUNT,
                               VB_I2S_TX_STREAM_DMA_LEN,
                               true);
    if (err != ESP_OK) {
        return err;
    }

    vb_i2s_tx_stream_t *stream = &s_tx_streams[port_id];
    if (stream->in_use) {
        stop_port(port);
        return ESP_ERR_INVALID_STATE;
    }
    stream->port_id = port_id;
    stream->in_use = true;
    *out_stream = stream;
    return ESP_OK;
}

int vb_i2s_tx_stream_write(void *stream, const void *data, size_t bytes, size_t *out_written, uint32_t timeout_ms)
{
    if (out_written != NULL) {
        *out_written = 0;
    }
    if (stream == NULL || data == NULL || bytes == 0) {
        return ESP_ERR_INVALID_ARG;
    }
    vb_i2s_tx_stream_t *tx_stream = (vb_i2s_tx_stream_t *)stream;
    if (tx_stream->port_id >= VB_I2S_MAX_PORTS) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!tx_stream->in_use) {
        return ESP_ERR_INVALID_STATE;
    }
    vb_lua_i2s_port_t *port = &s_i2s[tx_stream->port_id];
    if (!port->started || port->tx == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    size_t written = 0;
    esp_err_t err = i2s_channel_write(port->tx, data, bytes, &written, pdMS_TO_TICKS(timeout_ms));
    if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
        set_last_error(port, esp_err_to_name(err));
        return err;
    }
    port->writes++;
    port->tx_bytes += written;
    if (out_written != NULL) {
        *out_written = written;
    }
    return ESP_OK;
}

int vb_i2s_tx_stream_end(void *stream)
{
    if (stream == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    vb_i2s_tx_stream_t *tx_stream = (vb_i2s_tx_stream_t *)stream;
    if (tx_stream->port_id < VB_I2S_MAX_PORTS) {
        stop_port(&s_i2s[tx_stream->port_id]);
        tx_stream->in_use = false;
    }
    return ESP_OK;
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
    lua_pushboolean(L, port->rx != NULL);
    lua_setfield(L, -2, "rx_started");
    lua_pushboolean(L, port->tx != NULL);
    lua_setfield(L, -2, "tx_started");
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
    lua_pushinteger(L, port->dout_pin);
    lua_setfield(L, -2, "dout_pin");
    lua_pushinteger(L, port->reads);
    lua_setfield(L, -2, "reads");
    lua_pushinteger(L, (lua_Integer)port->rx_bytes);
    lua_setfield(L, -2, "rx_bytes");
    lua_pushinteger(L, port->writes);
    lua_setfield(L, -2, "writes");
    lua_pushinteger(L, (lua_Integer)port->tx_bytes);
    lua_setfield(L, -2, "tx_bytes");
    lua_pushstring(L, port->last_error);
    lua_setfield(L, -2, "last_error");
    return 1;
}

void vb_lua_i2s_register(lua_State *L)
{
    static const luaL_Reg functions[] = {
        {"start", i2s_start},
        {"read", i2s_read},
        {"write", i2s_write},
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
