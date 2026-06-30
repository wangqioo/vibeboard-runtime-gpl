#include "lua_i2s.h"

#include <errno.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "app_registry.h"
#include "board_lckfb_szpi_s3.h"
#include "cJSON.h"
#include "driver/i2s_std.h"
#include "driver/i2s_tdm.h"
#include "esp_err.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
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
#define VB_LUA_FILE_APP_DIR_REGISTRY_KEY "vb_file_app_dir"
#define VB_LUA_I2S_FILE_CHUNK_BYTES 4096
#define VB_LUA_I2S_FILE_MAX_CHUNK_BYTES 16384

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
    bool rx_uses_tdm;
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

static int table_int_at(lua_State *L, int index, const char *key, int fallback)
{
    lua_getfield(L, index, key);
    int value = lua_isnumber(L, -1) ? (int)lua_tointeger(L, -1) : fallback;
    lua_pop(L, 1);
    return value;
}

static int table_int(lua_State *L, const char *key, int fallback)
{
    return table_int_at(L, 2, key, fallback);
}

static int table_bool_tristate_at(lua_State *L, int index, const char *key)
{
    lua_getfield(L, index, key);
    int value = lua_isnil(L, -1) ? -1 : (lua_toboolean(L, -1) ? 1 : 0);
    lua_pop(L, 1);
    return value;
}

static int table_bool_tristate(lua_State *L, const char *key)
{
    return table_bool_tristate_at(L, 2, key);
}

static const char *table_string_at(lua_State *L, int index, const char *key, const char *fallback)
{
    lua_getfield(L, index, key);
    const char *value = lua_isstring(L, -1) ? lua_tostring(L, -1) : fallback;
    lua_pop(L, 1);
    return value;
}

static bool has_traversal(const char *path)
{
    if (path == NULL) {
        return true;
    }
    size_t len = strlen(path);
    if (strcmp(path, "..") == 0 || strncmp(path, "../", 3) == 0) {
        return true;
    }
    return strstr(path, "/../") != NULL || (len >= 3 && strcmp(path + len - 3, "/..") == 0);
}

static bool build_joined_path(char *dest, size_t dest_size, const char *parent, const char *child)
{
    size_t parent_len = strlen(parent);
    size_t child_len = strlen(child);
    bool parent_has_slash = parent_len > 0 && parent[parent_len - 1] == '/';
    size_t needed = parent_len + (parent_has_slash ? 0 : 1) + child_len + 1;
    if (needed > dest_size) {
        return false;
    }

    memcpy(dest, parent, parent_len);
    size_t pos = parent_len;
    if (!parent_has_slash) {
        dest[pos++] = '/';
    }
    memcpy(dest + pos, child, child_len);
    dest[pos + child_len] = '\0';
    return true;
}

static bool resolve_app_file_path(lua_State *L, int arg, char *resolved, size_t resolved_size)
{
    const char *path = luaL_checkstring(L, arg);
    lua_getfield(L, LUA_REGISTRYINDEX, VB_LUA_FILE_APP_DIR_REGISTRY_KEY);
    const char *app_dir = lua_tostring(L, -1);
    if (app_dir == NULL || app_dir[0] == '\0') {
        lua_pop(L, 1);
        return luaL_error(L, "i2s file app dir unavailable");
    }
    if (path[0] == '\0' || path[0] == '/' || has_traversal(path)) {
        lua_pop(L, 1);
        return luaL_error(L, "i2s file path must be app-relative");
    }
    bool ok = build_joined_path(resolved, resolved_size, app_dir, path);
    lua_pop(L, 1);
    if (!ok) {
        return luaL_error(L, "i2s file path too long");
    }
    return true;
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

static esp_err_t init_rx_tdm(i2s_chan_handle_t rx, const vb_lua_i2s_pins_t *pins, uint32_t rate, uint16_t bits)
{
    if (rx == NULL || pins == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    i2s_tdm_config_t tdm_cfg = {
        .slot_cfg = I2S_TDM_PHILIPS_SLOT_DEFAULT_CONFIG(data_width_from_bits(bits), I2S_SLOT_MODE_STEREO, I2S_TDM_SLOT0 | I2S_TDM_SLOT1),
        .clk_cfg = {
            .clk_src = I2S_CLK_SRC_DEFAULT,
            .sample_rate_hz = rate,
            .mclk_multiple = I2S_MCLK_MULTIPLE_256,
        },
        .gpio_cfg = {
            .mclk = pins->mclk_pin,
            .bclk = pins->bclk_pin,
            .ws = pins->ws_pin,
            .dout = I2S_GPIO_UNUSED,
            .din = pins->din_pin,
            .invert_flags = {
                .mclk_inv = false,
                .bclk_inv = false,
                .ws_inv = false,
            },
        },
    };

    return i2s_channel_init_tdm_mode(rx, &tdm_cfg);
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

    ptrdiff_t port_id = port - s_i2s;
    if (port_id >= 0 && port_id < VB_I2S_MAX_PORTS) {
        s_tx_streams[port_id].in_use = false;
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
                            int rx_tdm_mode,
                            bool encode_tx_stream_diagnostics)
{
    if (port == NULL || (!want_rx && !want_tx)) {
        return ESP_ERR_INVALID_ARG;
    }
    bool next_rx_uses_tdm = want_rx && !want_tx && channel == VB_LUA_I2S_CHANNEL_STEREO && rx_tdm_mode != 0;
    if (port->started) {
        bool has_rx = port->rx != NULL;
        bool has_tx = port->tx != NULL;
        if (has_rx == want_rx && has_tx == want_tx && port->rate == rate && port->bits == bits && port->channel == channel && port->rx_uses_tdm == next_rx_uses_tdm) {
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

    err = vb_board_audio_prepare(want_rx, want_tx, rate, bits, channel == VB_LUA_I2S_CHANNEL_STEREO ? 2 : 1, next_rx_uses_tdm);
    if (err != ESP_OK) {
        set_last_error(port, esp_err_to_name(err));
        return err;
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

    if (rx != NULL) {
        if (next_rx_uses_tdm) {
            err = init_rx_tdm(rx, &pins, rate, bits);
        } else {
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
        }
    }
    if (err == ESP_OK && tx != NULL) {
        i2s_std_config_t std_cfg = {
            .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(rate),
            .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(data_width_from_bits(bits), slot_mode_from_channel(channel)),
            .gpio_cfg = {
                .mclk = pins.mclk_pin,
                .bclk = pins.bclk_pin,
                .ws = pins.ws_pin,
                .dout = pins.dout_pin,
                .din = want_rx ? pins.din_pin : I2S_GPIO_UNUSED,
                .invert_flags = {
                    .mclk_inv = false,
                    .bclk_inv = false,
                    .ws_inv = false,
                },
            },
        };
        std_cfg.clk_cfg.mclk_multiple = I2S_MCLK_MULTIPLE_384;
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
    port->rx_uses_tdm = next_rx_uses_tdm;
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
    int rx_tdm_mode = table_bool_tristate(L, "tdm");

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
                               rx_tdm_mode,
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
    esp_err_t err = i2s_channel_write(port->tx, data, len, &written, pdMS_TO_TICKS(timeout_ms));
    if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
        set_last_error(port, esp_err_to_name(err));
        return luaL_error(L, "i2s write failed: %s", esp_err_to_name(err));
    }
    port->writes++;
    port->tx_bytes += written;
    set_last_error(port, "");
    lua_pushinteger(L, (lua_Integer)written);
    return 1;
}

static void push_file_io_result(lua_State *L,
                                size_t bytes,
                                uint32_t ops,
                                uint32_t rate,
                                uint16_t bits,
                                uint16_t channels,
                                bool rx_tdm,
                                int64_t elapsed_us,
                                int64_t read_us,
                                int64_t write_us)
{
    lua_newtable(L);
    lua_pushinteger(L, (lua_Integer)bytes);
    lua_setfield(L, -2, "bytes");
    lua_pushinteger(L, ops);
    lua_setfield(L, -2, "ops");
    lua_pushinteger(L, rate);
    lua_setfield(L, -2, "rate");
    lua_pushinteger(L, bits);
    lua_setfield(L, -2, "bits");
    lua_pushinteger(L, channels);
    lua_setfield(L, -2, "channels");
    lua_pushboolean(L, rx_tdm);
    lua_setfield(L, -2, "rx_tdm");
    lua_pushinteger(L, (lua_Integer)(elapsed_us / 1000));
    lua_setfield(L, -2, "elapsed_ms");
    lua_pushinteger(L, (lua_Integer)(read_us / 1000));
    lua_setfield(L, -2, "read_ms");
    lua_pushinteger(L, (lua_Integer)(write_us / 1000));
    lua_setfield(L, -2, "write_ms");
    int bytes_per_frame = ((int)channels * (int)bits) / 8;
    int effective_rate = (elapsed_us > 0 && bytes_per_frame > 0)
        ? (int)((bytes * 1000000ULL) / ((uint64_t)elapsed_us * (uint64_t)bytes_per_frame))
        : 0;
    lua_pushinteger(L, effective_rate);
    lua_setfield(L, -2, "effective_sample_rate");
}

static int i2s_record_file(lua_State *L)
{
    vb_lua_i2s_port_t *port = check_port(L, 1);
    char path[VB_APP_PATH_MAX];
    if (port == NULL || !resolve_app_file_path(L, 2, path, sizeof(path))) {
        return 0;
    }
    luaL_checktype(L, 3, LUA_TTABLE);

    int rate = table_int_at(L, 3, "rate", 48000);
    int bits = table_int_at(L, 3, "bits", 16);
    int channel = table_int_at(L, 3, "channel", VB_LUA_I2S_CHANNEL_STEREO);
    int dma_count = table_int_at(L, 3, "buffer_count", 4);
    int dma_len = table_int_at(L, 3, "buffer_len", 512);
    int timeout_ms = table_int_at(L, 3, "timeout_ms", 1000);
    int target_bytes = table_int_at(L, 3, "target_bytes", 0);
    int chunk_bytes = table_int_at(L, 3, "chunk_bytes", VB_LUA_I2S_FILE_CHUNK_BYTES);
    int max_empty_reads = table_int_at(L, 3, "max_empty_reads", 8);
    int rx_tdm_mode = table_bool_tristate_at(L, 3, "tdm");
    if (rate <= 0 || bits != 16 || channel != VB_LUA_I2S_CHANNEL_STEREO || target_bytes <= 0) {
        return luaL_error(L, "i2s record_file expects positive rate, 16-bit stereo, and target_bytes");
    }
    if (chunk_bytes <= 0) {
        chunk_bytes = VB_LUA_I2S_FILE_CHUNK_BYTES;
    }
    if (chunk_bytes > VB_LUA_I2S_FILE_MAX_CHUNK_BYTES) {
        chunk_bytes = VB_LUA_I2S_FILE_MAX_CHUNK_BYTES;
    }
    chunk_bytes &= ~3;
    if (chunk_bytes <= 0) {
        chunk_bytes = 4;
    }
    target_bytes &= ~3;

    esp_err_t err = start_port(port,
                               true,
                               false,
                               (uint32_t)rate,
                               (uint16_t)bits,
                               (uint16_t)channel,
                               dma_count,
                               dma_len,
                               rx_tdm_mode,
                               false);
    if (err != ESP_OK) {
        return luaL_error(L, "i2s record_file start failed: %s", esp_err_to_name(err));
    }

    FILE *file = fopen(path, "wb");
    if (file == NULL) {
        stop_port(port);
        return luaL_error(L, "i2s record_file open failed: %s", strerror(errno));
    }

    uint8_t *buffer = heap_caps_malloc((size_t)chunk_bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    if (buffer == NULL) {
        fclose(file);
        stop_port(port);
        return luaL_error(L, "i2s record_file buffer alloc failed");
    }

    size_t total = 0;
    uint32_t reads = 0;
    int empty_reads = 0;
    int64_t started_us = esp_timer_get_time();
    int64_t read_us = 0;
    int64_t write_us = 0;
    while (total < (size_t)target_bytes) {
        size_t want = (size_t)chunk_bytes;
        if (want > (size_t)target_bytes - total) {
            want = (size_t)target_bytes - total;
        }
        size_t got = 0;
        int64_t read_started_us = esp_timer_get_time();
        err = i2s_channel_read(port->rx, buffer, want, &got, pdMS_TO_TICKS(timeout_ms));
        read_us += esp_timer_get_time() - read_started_us;
        if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
            heap_caps_free(buffer);
            fclose(file);
            stop_port(port);
            set_last_error(port, esp_err_to_name(err));
            return luaL_error(L, "i2s record_file read failed: %s", esp_err_to_name(err));
        }
        if (got == 0) {
            empty_reads++;
            if (empty_reads >= max_empty_reads) {
                heap_caps_free(buffer);
                fclose(file);
                stop_port(port);
                set_last_error(port, "record timeout");
                return luaL_error(L, "i2s record_file timeout");
            }
            continue;
        }
        empty_reads = 0;
        int64_t write_started_us = esp_timer_get_time();
        size_t written = fwrite(buffer, 1, got, file);
        write_us += esp_timer_get_time() - write_started_us;
        if (written != got) {
            int write_errno = errno;
            int file_error = ferror(file);
            heap_caps_free(buffer);
            fclose(file);
            stop_port(port);
            set_last_error(port, "file write failed");
            return luaL_error(L,
                              "i2s record_file write failed: got=%u written=%u ferror=%d errno=%d",
                              (unsigned)got,
                              (unsigned)written,
                              file_error,
                              write_errno);
        }
        reads++;
        port->reads++;
        port->rx_bytes += got;
        total += got;
    }

    heap_caps_free(buffer);
    fclose(file);
    bool used_tdm = port->rx_uses_tdm;
    int64_t elapsed_us = esp_timer_get_time() - started_us;
    stop_port(port);
    set_last_error(port, "");
    push_file_io_result(L, total, reads, (uint32_t)rate, (uint16_t)bits, 2, used_tdm, elapsed_us, read_us, write_us);
    return 1;
}

static int16_t read_i16_le_c(const uint8_t *data)
{
    return (int16_t)((uint16_t)data[0] | ((uint16_t)data[1] << 8));
}

static void write_i16_le_c(uint8_t *data, int16_t sample)
{
    uint16_t value = (uint16_t)sample;
    data[0] = (uint8_t)(value & 0xff);
    data[1] = (uint8_t)((value >> 8) & 0xff);
}

static int16_t clamp_i16_c(int32_t sample)
{
    if (sample > 32767) {
        return 32767;
    }
    if (sample < -32768) {
        return -32768;
    }
    return (int16_t)sample;
}

static int i2s_play_file(lua_State *L)
{
    vb_lua_i2s_port_t *port = check_port(L, 1);
    char path[VB_APP_PATH_MAX];
    if (port == NULL || !resolve_app_file_path(L, 2, path, sizeof(path))) {
        return 0;
    }
    luaL_checktype(L, 3, LUA_TTABLE);

    int in_rate = table_int_at(L, 3, "source_rate", 48000);
    int out_rate = table_int_at(L, 3, "rate", 16000);
    int bits = table_int_at(L, 3, "bits", 16);
    int channels = table_int_at(L, 3, "channels", 2);
    int timeout_ms = table_int_at(L, 3, "timeout_ms", 1000);
    int chunk_bytes = table_int_at(L, 3, "chunk_bytes", VB_LUA_I2S_FILE_CHUNK_BYTES);
    int gain = table_int_at(L, 3, "gain", 1);
    const char *select = table_string_at(L, 3, "select", "left");
    if (in_rate <= 0 || out_rate <= 0 || bits != 16 || channels != 2) {
        return luaL_error(L, "i2s play_file expects positive rates and 16-bit stereo source");
    }
    if (chunk_bytes <= 0) {
        chunk_bytes = VB_LUA_I2S_FILE_CHUNK_BYTES;
    }
    if (chunk_bytes > VB_LUA_I2S_FILE_MAX_CHUNK_BYTES) {
        chunk_bytes = VB_LUA_I2S_FILE_MAX_CHUNK_BYTES;
    }
    chunk_bytes &= ~3;
    if (chunk_bytes <= 0) {
        chunk_bytes = 4;
    }
    uint64_t resample_step_q32 = (((uint64_t)in_rate) << 32) / (uint64_t)out_rate;
    uint64_t next_source_frame_q32 = 0;

    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        return luaL_error(L, "i2s play_file open failed: %s", strerror(errno));
    }

    esp_err_t err = start_port(port,
                               false,
                               true,
                               (uint32_t)out_rate,
                               (uint16_t)bits,
                               VB_LUA_I2S_CHANNEL_STEREO,
                               2,
                               128,
                               -1,
                               false);
    if (err != ESP_OK) {
        fclose(file);
        return luaL_error(L, "i2s play_file start failed: %s", esp_err_to_name(err));
    }

    uint8_t *in = heap_caps_malloc((size_t)chunk_bytes, MALLOC_CAP_8BIT);
    uint8_t *out = heap_caps_malloc((size_t)chunk_bytes, MALLOC_CAP_8BIT);
    if (in == NULL || out == NULL) {
        if (in != NULL) {
            heap_caps_free(in);
        }
        if (out != NULL) {
            heap_caps_free(out);
        }
        fclose(file);
        stop_port(port);
        return luaL_error(L, "i2s play_file buffer alloc failed");
    }

    size_t source_bytes = 0;
    size_t played_bytes = 0;
    uint32_t writes = 0;
    while (true) {
        size_t got = fread(in, 1, (size_t)chunk_bytes, file);
        got &= ~3;
        if (got == 0) {
            break;
        }
        source_bytes += got;
        size_t frames = got / 4;
        size_t out_pos = 0;
        while ((next_source_frame_q32 >> 32) < frames) {
            size_t frame = (size_t)(next_source_frame_q32 >> 32);
            const uint8_t *src = in + (frame * 4);
            int16_t left = read_i16_le_c(src);
            int16_t right = read_i16_le_c(src + 2);
            int32_t sample = left;
            if (strcmp(select, "right") == 0) {
                sample = right;
            } else if (strcmp(select, "mix") == 0) {
                sample = ((int32_t)left + (int32_t)right) / 2;
            }
            sample *= gain;
            int16_t out_sample = clamp_i16_c(sample);
            write_i16_le_c(out + out_pos, out_sample);
            write_i16_le_c(out + out_pos + 2, out_sample);
            out_pos += 4;
            next_source_frame_q32 += resample_step_q32;
            if (out_pos + 4 > (size_t)chunk_bytes) {
                size_t written = 0;
                err = i2s_channel_write(port->tx, out, out_pos, &written, pdMS_TO_TICKS(timeout_ms));
                if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
                    heap_caps_free(in);
                    heap_caps_free(out);
                    fclose(file);
                    stop_port(port);
                    set_last_error(port, esp_err_to_name(err));
                    return luaL_error(L, "i2s play_file write failed: %s", esp_err_to_name(err));
                }
                writes++;
                port->writes++;
                port->tx_bytes += written;
                played_bytes += written;
                out_pos = 0;
            }
        }
        next_source_frame_q32 -= ((uint64_t)frames << 32);
        if (out_pos > 0) {
            size_t written = 0;
            err = i2s_channel_write(port->tx, out, out_pos, &written, pdMS_TO_TICKS(timeout_ms));
            if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
                heap_caps_free(in);
                heap_caps_free(out);
                fclose(file);
                stop_port(port);
                set_last_error(port, esp_err_to_name(err));
                return luaL_error(L, "i2s play_file write failed: %s", esp_err_to_name(err));
            }
            writes++;
            port->writes++;
            port->tx_bytes += written;
            played_bytes += written;
        }
    }

    heap_caps_free(in);
    heap_caps_free(out);
    fclose(file);
    stop_port(port);
    set_last_error(port, "");

    lua_newtable(L);
    lua_pushinteger(L, (lua_Integer)played_bytes);
    lua_setfield(L, -2, "bytes");
    lua_pushinteger(L, (lua_Integer)source_bytes);
    lua_setfield(L, -2, "source_bytes");
    lua_pushinteger(L, writes);
    lua_setfield(L, -2, "ops");
    lua_pushinteger(L, out_rate);
    lua_setfield(L, -2, "rate");
    lua_pushinteger(L, bits);
    lua_setfield(L, -2, "bits");
    lua_pushinteger(L, 2);
    lua_setfield(L, -2, "channels");
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
                               -1,
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
    lua_pushboolean(L, port->rx_uses_tdm);
    lua_setfield(L, -2, "rx_tdm");
    lua_pushinteger(L, port->bclk_pin);
    lua_setfield(L, -2, "bclk_pin");
    lua_pushinteger(L, port->ws_pin);
    lua_setfield(L, -2, "ws_pin");
    lua_pushinteger(L, port->din_pin);
    lua_setfield(L, -2, "din_pin");
    lua_pushinteger(L, port->dout_pin);
    lua_setfield(L, -2, "dout_pin");
    lua_pushinteger(L, port->mclk_pin);
    lua_setfield(L, -2, "mclk_pin");
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
        {"record_file", i2s_record_file},
        {"play_file", i2s_play_file},
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
