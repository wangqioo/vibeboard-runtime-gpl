#include "board_lckfb_szpi_s3.h"

#include <inttypes.h>
#include <math.h>
#include <string.h>

#include "driver/i2c.h"
#include "driver/i2s_std.h"
#include "driver/ledc.h"
#include "driver/sdmmc_host.h"
#include "driver/spi_master.h"
#include "es7210.h"
#include "es8311.h"
#include "esp_attr.h"
#include "esp_check.h"
#include "esp_camera.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_lcd_touch_ft5x06.h"
#include "esp_log.h"
#include "esp_vfs_fat.h"
#include "esp_lvgl_port.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "lua_key.h"
#include "lvgl.h"
#include "sdmmc_cmd.h"

static const char *TAG = "board_lckfb";

static esp_lcd_panel_handle_t lcd_panel;
static esp_lcd_panel_io_handle_t lcd_io;
static esp_lcd_touch_handle_t touch;
static sdmmc_card_t *sd_card;
static TaskHandle_t input_task;
static volatile bool input_stop_requested;
static bool s_display_takeover_active;
static bool s_backlight_ready;
static bool s_es7210_ready;
static bool s_es8311_ready;
static uint32_t s_es7210_sample_rate;
static uint16_t s_es7210_bits;
static bool s_es7210_tdm;
static uint32_t s_es8311_sample_rate;
static uint8_t s_pca9557_output = VB_PCA9557_LCD_CS_BIT | VB_PCA9557_DVP_PWDN_BIT;
static int s_backlight_percent;
static bool s_imu_ready;
static bool s_camera_ready;
static bool s_camera_display_taken;
static bool s_camera_direct_draw_disabled;
static bool s_camera_overlay_enabled;
static bool s_camera_overlay_dirty;
static TaskHandle_t s_camera_preview_task;
static TaskHandle_t s_camera_preview_stop_waiter;
static volatile bool s_camera_preview_stop_requested;
static volatile bool s_camera_snapshot_requested;
static volatile bool s_camera_snapshot_ready;
static esp_err_t s_camera_snapshot_error;
static vb_board_camera_frame_t s_camera_snapshot_frame;
static SemaphoreHandle_t s_camera_latest_frame_lock;
static void *s_camera_latest_frame_buf;
static size_t s_camera_latest_frame_capacity;
static vb_board_camera_frame_t s_camera_latest_frame;
static bool s_camera_latest_frame_valid;
static uint32_t s_camera_preview_frame_count;
static void *s_camera_dma_reserve;
static size_t s_camera_dma_reserve_size;
static vb_board_camera_preview_mode_t s_camera_preview_mode = VB_CAMERA_PREVIEW_MODE_STOPPED;
static uint16_t s_camera_preview_width;
static uint16_t s_camera_preview_height;
static DMA_ATTR uint16_t s_camera_lcd_rows[VB_LCD_H_RES * VB_CAMERA_LCD_STRIPE_ROWS];
static vb_board_input_callback_t input_callback;
static void *input_user_data;

static int board_now_ms(void);
static esp_err_t vb_board_camera_take_display(void);
static void vb_board_camera_preview_task(void *arg);
static esp_err_t vb_board_camera_clone_latest_frame(vb_board_camera_frame_t *frame);
static esp_err_t vb_board_camera_store_latest_frame(const camera_fb_t *fb);
static void vb_board_camera_clear_latest_frame(void);

#define VB_BOARD_INPUT_POLL_MS 20
#define VB_BOARD_TOUCH_SWIPE_MIN_PX 28
#define VB_BOARD_TOUCH_EVENT_DOWN 101
#define VB_BOARD_TOUCH_EVENT_MOVE 102
#define VB_BOARD_TOUCH_EVENT_UP 103
#define VB_QMI8658_ADDR 0x6A
#define VB_QMI8658_WHO_AM_I 0x00
#define VB_QMI8658_CTRL1 0x02
#define VB_QMI8658_CTRL2 0x03
#define VB_QMI8658_CTRL3 0x04
#define VB_QMI8658_CTRL7 0x08
#define VB_QMI8658_STATUS0 0x2E
#define VB_QMI8658_AX_L 0x35
#define VB_QMI8658_RESET 0x60
#define VB_LCD_CMD_NOP 0x00
#define VB_CAMERA_OVERLAY_BAR_H 48
#define VB_CAMERA_OVERLAY_BUTTON_W 124
#define VB_CAMERA_OVERLAY_BUTTON_H 36
#define VB_CAMERA_OVERLAY_SHUTTER_LABEL "Shutter"

void vb_board_camera_reserve_internal_dma(size_t size)
{
    if (size == 0 || s_camera_dma_reserve != NULL) {
        return;
    }
    s_camera_dma_reserve = heap_caps_malloc(size, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    if (s_camera_dma_reserve == NULL) {
        ESP_LOGW(TAG, "camera DMA reserve %zu bytes failed; largest DMA block=%zu",
                 size,
                 heap_caps_get_largest_free_block(MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL));
        return;
    }
    s_camera_dma_reserve_size = size;
    ESP_LOGI(TAG, "camera reserved %zu bytes of internal DMA memory", size);
}

void vb_board_camera_release_internal_dma_reserve(void)
{
    if (s_camera_dma_reserve == NULL) {
        return;
    }
    heap_caps_free(s_camera_dma_reserve);
    ESP_LOGI(TAG, "camera released %zu bytes of internal DMA reserve", s_camera_dma_reserve_size);
    s_camera_dma_reserve = NULL;
    s_camera_dma_reserve_size = 0;
}

static const char *vb_board_camera_preview_mode_name(vb_board_camera_preview_mode_t mode)
{
    switch (mode) {
    case VB_CAMERA_PREVIEW_MODE_QVGA_DIRECT:
        return "qvga-direct";
    case VB_CAMERA_PREVIEW_MODE_QQVGA_SCALED:
        return "qqvga-scaled";
    case VB_CAMERA_PREVIEW_MODE_STOPPED:
    default:
        return "stopped";
    }
}

static esp_err_t i2c_init(void)
{
    const i2c_config_t i2c_conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = VB_I2C_SDA,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_io_num = VB_I2C_SCL,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = VB_I2C_FREQ_HZ,
    };

    ESP_RETURN_ON_ERROR(i2c_param_config(VB_I2C_PORT, &i2c_conf), TAG, "i2c param config failed");
    esp_err_t err = i2c_driver_install(VB_I2C_PORT, i2c_conf.mode, 0, 0, 0);
    if (err == ESP_ERR_INVALID_STATE) {
        return ESP_OK;
    }
    return err;
}

static esp_err_t pca9557_write(uint8_t reg_addr, uint8_t value)
{
    uint8_t write_buf[2] = { reg_addr, value };
    return i2c_master_write_to_device(
        VB_I2C_PORT,
        VB_PCA9557_ADDR,
        write_buf,
        sizeof(write_buf),
        pdMS_TO_TICKS(1000)
    );
}

static esp_err_t pca9557_init(void)
{
    s_pca9557_output = VB_PCA9557_LCD_CS_BIT | VB_PCA9557_DVP_PWDN_BIT;
    ESP_RETURN_ON_ERROR(pca9557_write(0x01, s_pca9557_output), TAG, "pca output failed");
    ESP_RETURN_ON_ERROR(pca9557_write(0x03, 0xf8), TAG, "pca config failed");
    return ESP_OK;
}

static esp_err_t qmi8658_read(uint8_t reg_addr, uint8_t *data, size_t len)
{
    return i2c_master_write_read_device(
        VB_I2C_PORT,
        VB_QMI8658_ADDR,
        &reg_addr,
        1,
        data,
        len,
        pdMS_TO_TICKS(100)
    );
}

static esp_err_t qmi8658_write(uint8_t reg_addr, uint8_t value)
{
    uint8_t write_buf[2] = { reg_addr, value };
    return i2c_master_write_to_device(
        VB_I2C_PORT,
        VB_QMI8658_ADDR,
        write_buf,
        sizeof(write_buf),
        pdMS_TO_TICKS(100)
    );
}

static esp_err_t qmi8658_init(void)
{
    uint8_t id = 0;
    ESP_RETURN_ON_ERROR(qmi8658_read(VB_QMI8658_WHO_AM_I, &id, 1), TAG, "qmi8658 whoami failed");
    ESP_RETURN_ON_FALSE(id == 0x05, ESP_ERR_NOT_FOUND, TAG, "qmi8658 unexpected id=0x%02x", id);

    ESP_RETURN_ON_ERROR(qmi8658_write(VB_QMI8658_RESET, 0xb0), TAG, "qmi8658 reset failed");
    vTaskDelay(pdMS_TO_TICKS(10));
    ESP_RETURN_ON_ERROR(qmi8658_write(VB_QMI8658_CTRL1, 0x40), TAG, "qmi8658 ctrl1 failed");
    ESP_RETURN_ON_ERROR(qmi8658_write(VB_QMI8658_CTRL7, 0x03), TAG, "qmi8658 ctrl7 failed");
    ESP_RETURN_ON_ERROR(qmi8658_write(VB_QMI8658_CTRL2, 0x95), TAG, "qmi8658 ctrl2 failed");
    ESP_RETURN_ON_ERROR(qmi8658_write(VB_QMI8658_CTRL3, 0xd5), TAG, "qmi8658 ctrl3 failed");
    s_imu_ready = true;
    ESP_LOGI(TAG, "QMI8658 ready");
    return ESP_OK;
}

esp_err_t vb_board_imu_read(vb_board_imu_sample_t *sample)
{
    if (sample == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!s_imu_ready) {
        return ESP_ERR_INVALID_STATE;
    }

    uint8_t status = 0;
    ESP_RETURN_ON_ERROR(qmi8658_read(VB_QMI8658_STATUS0, &status, 1), TAG, "qmi8658 status failed");
    if ((status & 0x03) == 0) {
        return ESP_ERR_INVALID_STATE;
    }

    uint8_t raw[12] = {0};
    ESP_RETURN_ON_ERROR(qmi8658_read(VB_QMI8658_AX_L, raw, sizeof(raw)), TAG, "qmi8658 sample failed");
    int16_t ax = (int16_t)((uint16_t)raw[0] | ((uint16_t)raw[1] << 8));
    int16_t ay = (int16_t)((uint16_t)raw[2] | ((uint16_t)raw[3] << 8));
    int16_t az = (int16_t)((uint16_t)raw[4] | ((uint16_t)raw[5] << 8));
    int16_t gx = (int16_t)((uint16_t)raw[6] | ((uint16_t)raw[7] << 8));
    int16_t gy = (int16_t)((uint16_t)raw[8] | ((uint16_t)raw[9] << 8));
    int16_t gz = (int16_t)((uint16_t)raw[10] | ((uint16_t)raw[11] << 8));

    float fax = (float)ax;
    float fay = (float)ay;
    float faz = (float)az;
    float roll_den = sqrtf(fax * fax + faz * faz);
    float pitch_den = sqrtf(fay * fay + faz * faz);
    float angle_z_den = faz == 0.0f ? (faz < 0 ? -1.0f : 1.0f) : faz;

    sample->acc_x = ax;
    sample->acc_y = ay;
    sample->acc_z = az;
    sample->gyr_x = gx;
    sample->gyr_y = gy;
    sample->gyr_z = gz;
    sample->roll = roll_den == 0.0f ? 0.0f : atanf(fay / roll_den) * 57.29578f;
    sample->pitch = pitch_den == 0.0f ? 0.0f : atanf(fax / pitch_den) * 57.29578f;
    sample->angle_z = atanf(sqrtf(fax * fax + fay * fay) / angle_z_den) * 57.29578f;
    sample->timestamp_ms = board_now_ms();
    return ESP_OK;
}

bool vb_board_imu_available(void)
{
    return s_imu_ready;
}

static esp_err_t pca9557_set_output(uint8_t bit, bool high)
{
    if (high) {
        s_pca9557_output |= bit;
    } else {
        s_pca9557_output &= (uint8_t)~bit;
    }
    return pca9557_write(0x01, s_pca9557_output);
}

static esp_err_t lcd_cs_set(bool high)
{
    return pca9557_set_output(VB_PCA9557_LCD_CS_BIT, high);
}

static esp_err_t audio_es8311_init(uint32_t sample_rate)
{
    if (sample_rate == 0) {
        sample_rate = 16000;
    }
    if (s_es8311_ready && s_es8311_sample_rate == sample_rate) {
        return ESP_OK;
    }

    es8311_handle_t handle = es8311_create(VB_I2C_PORT, ES8311_ADDRRES_0);
    ESP_RETURN_ON_FALSE(handle != NULL, ESP_FAIL, TAG, "es8311 create failed");

    const uint32_t mclk_multiple = 384;
    const es8311_clock_config_t clock_config = {
        .mclk_inverted = false,
        .sclk_inverted = false,
        .mclk_from_mclk_pin = true,
        .mclk_frequency = sample_rate * mclk_multiple,
        .sample_frequency = sample_rate,
    };

    ESP_RETURN_ON_ERROR(
        es8311_init(handle, &clock_config, ES8311_RESOLUTION_16, ES8311_RESOLUTION_16),
        TAG,
        "es8311 init failed"
    );
    ESP_RETURN_ON_ERROR(
        es8311_sample_frequency_config(handle, sample_rate * mclk_multiple, sample_rate),
        TAG,
        "es8311 sample frequency failed"
    );
    ESP_RETURN_ON_ERROR(es8311_voice_volume_set(handle, 70, NULL), TAG, "es8311 volume failed");
    ESP_RETURN_ON_ERROR(es8311_microphone_config(handle, false), TAG, "es8311 mic disable failed");
    ESP_RETURN_ON_ERROR(pca9557_set_output(VB_PCA9557_PA_EN_BIT, true), TAG, "pa enable failed");

    s_es8311_ready = true;
    s_es8311_sample_rate = sample_rate;
    ESP_LOGI(TAG, "ES8311 output codec ready at %" PRIu32 " Hz", sample_rate);
    return ESP_OK;
}

static es7210_i2s_bits_t es7210_bits_from_width(uint16_t bits)
{
    switch (bits) {
    case 16:
        return ES7210_I2S_BITS_16B;
    case 24:
        return ES7210_I2S_BITS_24B;
    case 32:
        return ES7210_I2S_BITS_32B;
    default:
        return ES7210_I2S_BITS_16B;
    }
}

static esp_err_t audio_es7210_init(uint32_t sample_rate, uint16_t bits, bool tdm_enable)
{
    if (sample_rate == 0) {
        sample_rate = 48000;
    }
    if (bits == 0) {
        bits = 16;
    }
    es7210_dev_handle_t handle = NULL;
    const es7210_i2c_config_t i2c_config = {
        .i2c_port = VB_I2C_PORT,
        .i2c_addr = 0x41,
    };
    ESP_RETURN_ON_ERROR(es7210_new_codec(&i2c_config, &handle), TAG, "es7210 create failed");

    const es7210_codec_config_t codec_config = {
        .i2s_format = ES7210_I2S_FMT_I2S,
        .mclk_ratio = I2S_MCLK_MULTIPLE_256,
        .sample_rate_hz = sample_rate,
        .bit_width = es7210_bits_from_width(bits),
        .mic_bias = ES7210_MIC_BIAS_2V87,
        .mic_gain = ES7210_MIC_GAIN_30DB,
        .flags.tdm_enable = tdm_enable,
    };
    ESP_RETURN_ON_ERROR(es7210_config_codec(handle, &codec_config), TAG, "es7210 config failed");
    ESP_RETURN_ON_ERROR(es7210_config_volume(handle, 0), TAG, "es7210 volume failed");

    s_es7210_ready = true;
    s_es7210_sample_rate = sample_rate;
    s_es7210_bits = bits;
    s_es7210_tdm = tdm_enable;
    ESP_LOGI(TAG, "ES7210 input codec ready at %" PRIu32 " Hz, %s", sample_rate, tdm_enable ? "tdm" : "std");
    return ESP_OK;
}

esp_err_t vb_board_audio_prepare(bool want_rx, bool want_tx, uint32_t sample_rate, uint16_t bits, uint16_t channels, bool rx_tdm)
{
    (void)channels;
    if (want_tx) {
        esp_err_t tx_err = audio_es8311_init(sample_rate);
        if (tx_err != ESP_OK) {
            ESP_LOGW(TAG, "audio TX codec prepare failed: %s", esp_err_to_name(tx_err));
            return tx_err;
        }
    }
    if (want_rx) {
        esp_err_t rx_err = audio_es7210_init(sample_rate, bits, rx_tdm);
        if (rx_err != ESP_OK) {
            ESP_LOGW(TAG, "audio RX codec prepare failed: %s", esp_err_to_name(rx_err));
            return rx_err;
        }
    }
    return ESP_OK;
}

esp_err_t vb_board_camera_start(uint16_t width, uint16_t height, const char *format)
{
    vb_board_camera_release_internal_dma_reserve();

    framesize_t frame_size = FRAMESIZE_QVGA;
    if (width == 160 && height == 120) {
        frame_size = FRAMESIZE_QQVGA;
    } else if (width != VB_LCD_H_RES || height != VB_LCD_V_RES) {
        return ESP_ERR_NOT_SUPPORTED;
    }
    if (format != NULL && strcmp(format, "rgb565") != 0) {
        return ESP_ERR_NOT_SUPPORTED;
    }
    if (s_camera_ready) {
        return ESP_OK;
    }

    esp_err_t err = pca9557_set_output(VB_PCA9557_DVP_PWDN_BIT, false);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "camera power failed: %s", esp_err_to_name(err));
        return err;
    }
    vTaskDelay(pdMS_TO_TICKS(20));

    const camera_config_t config = {
        .pin_pwdn = GPIO_NUM_NC,
        .pin_reset = GPIO_NUM_NC,
        .pin_xclk = VB_CAMERA_XCLK,
        .pin_sccb_sda = GPIO_NUM_NC,
        .pin_sccb_scl = VB_CAMERA_SIOC,
        .pin_d7 = VB_CAMERA_D7,
        .pin_d6 = VB_CAMERA_D6,
        .pin_d5 = VB_CAMERA_D5,
        .pin_d4 = VB_CAMERA_D4,
        .pin_d3 = VB_CAMERA_D3,
        .pin_d2 = VB_CAMERA_D2,
        .pin_d1 = VB_CAMERA_D1,
        .pin_d0 = VB_CAMERA_D0,
        .pin_vsync = VB_CAMERA_VSYNC,
        .pin_href = VB_CAMERA_HREF,
        .pin_pclk = VB_CAMERA_PCLK,
        .xclk_freq_hz = VB_CAMERA_XCLK_FREQ_HZ,
        .ledc_timer = LEDC_TIMER_1,
        .ledc_channel = LEDC_CHANNEL_1,
        .pixel_format = PIXFORMAT_RGB565,
        .frame_size = frame_size,
        .jpeg_quality = 12,
        .fb_count = 2,
        .fb_location = CAMERA_FB_IN_PSRAM,
        .grab_mode = CAMERA_GRAB_WHEN_EMPTY,
        .sccb_i2c_port = VB_I2C_PORT,
    };

    err = esp_camera_init(&config);
    if (err != ESP_OK) {
        (void)pca9557_set_output(VB_PCA9557_DVP_PWDN_BIT, true);
        ESP_LOGW(TAG, "camera init failed: %s", esp_err_to_name(err));
        return err;
    }

    sensor_t *sensor = esp_camera_sensor_get();
    if (sensor != NULL && sensor->id.PID == GC2145_PID) {
        (void)sensor->set_hmirror(sensor, 1);
    }

    s_camera_ready = true;
    ESP_LOGI(TAG, "GC2145 camera ready");
    return ESP_OK;
}

esp_err_t vb_board_camera_capture(vb_board_camera_frame_t *frame)
{
    if (frame == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(frame, 0, sizeof(*frame));
    if (!s_camera_ready) {
        return ESP_ERR_INVALID_STATE;
    }
    if (s_camera_preview_task != NULL) {
        esp_err_t latest_err = vb_board_camera_clone_latest_frame(frame);
        if (latest_err == ESP_OK) {
            return ESP_OK;
        }
        s_camera_snapshot_frame = (vb_board_camera_frame_t){0};
        s_camera_snapshot_error = ESP_ERR_TIMEOUT;
        s_camera_snapshot_ready = false;
        s_camera_snapshot_requested = true;
        for (int i = 0; i < 500 && s_camera_snapshot_requested; i++) {
            vTaskDelay(pdMS_TO_TICKS(10));
        }
        if (!s_camera_snapshot_ready) {
            s_camera_snapshot_requested = false;
            return s_camera_snapshot_error;
        }
        *frame = s_camera_snapshot_frame;
        s_camera_snapshot_frame = (vb_board_camera_frame_t){0};
        s_camera_snapshot_ready = false;
        return ESP_OK;
    }

    camera_fb_t *fb = esp_camera_fb_get();
    if (fb == NULL) {
        return ESP_FAIL;
    }

    frame->width = (uint16_t)fb->width;
    frame->height = (uint16_t)fb->height;
    frame->len = fb->len;
    frame->format = fb->format == PIXFORMAT_RGB565 ? "rgb565" : "unknown";
    frame->buf = fb->buf;
    frame->driver_frame = fb;
    frame->owns_buffer = false;
    return ESP_OK;
}

static esp_err_t vb_board_lcd_wait_for_queued_color(void)
{
    if (lcd_io == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    return esp_lcd_panel_io_tx_param(lcd_io, VB_LCD_CMD_NOP, NULL, 0);
}

static esp_err_t vb_board_camera_take_display(void)
{
    if (s_camera_display_taken) {
        return ESP_OK;
    }

    ESP_RETURN_ON_ERROR(vb_board_display_takeover(), TAG, "camera display takeover failed");
    s_camera_display_taken = true;
    return vb_board_lcd_wait_for_queued_color();
}

static esp_err_t vb_board_camera_clone_latest_frame(vb_board_camera_frame_t *frame)
{
    if (frame == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (s_camera_latest_frame_lock == NULL || s_camera_latest_frame_buf == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    if (xSemaphoreTake(s_camera_latest_frame_lock, pdMS_TO_TICKS(50)) != pdTRUE) {
        return ESP_ERR_TIMEOUT;
    }
    if (!s_camera_latest_frame_valid || s_camera_latest_frame.buf == NULL || s_camera_latest_frame.len == 0) {
        xSemaphoreGive(s_camera_latest_frame_lock);
        return ESP_ERR_INVALID_STATE;
    }

    const size_t len = s_camera_latest_frame.len;
    void *copy = heap_caps_malloc(len, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (copy == NULL) {
        copy = heap_caps_malloc(len, MALLOC_CAP_8BIT);
    }
    if (copy == NULL) {
        xSemaphoreGive(s_camera_latest_frame_lock);
        return ESP_ERR_NO_MEM;
    }

    memcpy(copy, s_camera_latest_frame.buf, len);
    *frame = (vb_board_camera_frame_t){
        .width = s_camera_latest_frame.width,
        .height = s_camera_latest_frame.height,
        .len = len,
        .format = s_camera_latest_frame.format,
        .buf = copy,
        .driver_frame = NULL,
        .owns_buffer = true,
    };
    xSemaphoreGive(s_camera_latest_frame_lock);
    return ESP_OK;
}

static esp_err_t vb_board_camera_store_latest_frame(const camera_fb_t *fb)
{
    if (fb == NULL || fb->buf == NULL || fb->len == 0) {
        return ESP_ERR_INVALID_ARG;
    }
    if (s_camera_latest_frame_lock == NULL) {
        s_camera_latest_frame_lock = xSemaphoreCreateMutex();
        if (s_camera_latest_frame_lock == NULL) {
            return ESP_ERR_NO_MEM;
        }
    }
    if (s_camera_latest_frame_capacity < fb->len) {
        void *new_buf = heap_caps_malloc(fb->len, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
        if (new_buf == NULL) {
            new_buf = heap_caps_malloc(fb->len, MALLOC_CAP_8BIT);
        }
        if (new_buf == NULL) {
            return ESP_ERR_NO_MEM;
        }
        if (xSemaphoreTake(s_camera_latest_frame_lock, pdMS_TO_TICKS(50)) != pdTRUE) {
            heap_caps_free(new_buf);
            return ESP_ERR_TIMEOUT;
        }
        if (s_camera_latest_frame_buf != NULL) {
            heap_caps_free(s_camera_latest_frame_buf);
        }
        s_camera_latest_frame_buf = new_buf;
        s_camera_latest_frame_capacity = fb->len;
        xSemaphoreGive(s_camera_latest_frame_lock);
    }

    if (xSemaphoreTake(s_camera_latest_frame_lock, pdMS_TO_TICKS(50)) != pdTRUE) {
        return ESP_ERR_TIMEOUT;
    }
    memcpy(s_camera_latest_frame_buf, fb->buf, fb->len);
    s_camera_latest_frame = (vb_board_camera_frame_t){
        .width = (uint16_t)fb->width,
        .height = (uint16_t)fb->height,
        .len = fb->len,
        .format = fb->format == PIXFORMAT_RGB565 ? "rgb565" : "unknown",
        .buf = s_camera_latest_frame_buf,
        .driver_frame = NULL,
        .owns_buffer = false,
    };
    s_camera_latest_frame_valid = true;
    xSemaphoreGive(s_camera_latest_frame_lock);
    return ESP_OK;
}

static void vb_board_camera_clear_latest_frame(void)
{
    if (s_camera_latest_frame_lock != NULL) {
        if (xSemaphoreTake(s_camera_latest_frame_lock, pdMS_TO_TICKS(100)) == pdTRUE) {
            if (s_camera_latest_frame_buf != NULL) {
                heap_caps_free(s_camera_latest_frame_buf);
            }
            s_camera_latest_frame_buf = NULL;
            s_camera_latest_frame_capacity = 0;
            s_camera_latest_frame = (vb_board_camera_frame_t){0};
            s_camera_latest_frame_valid = false;
            xSemaphoreGive(s_camera_latest_frame_lock);
        }
        return;
    }
    if (s_camera_latest_frame_buf != NULL) {
        heap_caps_free(s_camera_latest_frame_buf);
    }
    s_camera_latest_frame_buf = NULL;
    s_camera_latest_frame_capacity = 0;
    s_camera_latest_frame = (vb_board_camera_frame_t){0};
    s_camera_latest_frame_valid = false;
}

static esp_err_t vb_board_camera_draw_rgb565_scaled_2x(const vb_board_camera_frame_t *frame)
{
    const uint16_t src_width = frame->width;
    const uint16_t src_height = frame->height;
    const uint16_t draw_display_height = s_camera_overlay_enabled ? (VB_LCD_V_RES - VB_CAMERA_OVERLAY_BAR_H) : VB_LCD_V_RES;
    const uint16_t draw_src_height = (uint16_t)(draw_display_height / 2);

    const uint16_t *src = (const uint16_t *)frame->buf;
    uint16_t *rows = s_camera_lcd_rows;
    const uint16_t src_rows_per_batch = VB_CAMERA_LCD_STRIPE_ROWS / 2;

    for (uint16_t src_y = 0; src_y < src_height && src_y < draw_src_height; src_y += src_rows_per_batch) {
        if (src_y > 0) {
            esp_err_t wait_err = vb_board_lcd_wait_for_queued_color();
            if (wait_err != ESP_OK) {
                return wait_err;
            }
        }

        uint16_t batch_src_rows = src_rows_per_batch;
        if (src_y + batch_src_rows > src_height) {
            batch_src_rows = src_height - src_y;
        }
        if (src_y + batch_src_rows > draw_src_height) {
            batch_src_rows = draw_src_height - src_y;
        }

        for (uint16_t batch_y = 0; batch_y < batch_src_rows; batch_y++) {
            const uint16_t *src_row = src + ((src_y + batch_y) * src_width);
            uint16_t *row0 = rows + ((batch_y * 2) * VB_LCD_H_RES);
            uint16_t *row1 = row0 + VB_LCD_H_RES;
            for (uint16_t src_x = 0; src_x < src_width; src_x++) {
                const uint16_t pixel = src_row[src_x];
                const uint16_t dst_x = src_x * 2;
                row0[dst_x] = pixel;
                row0[dst_x + 1] = pixel;
                row1[dst_x] = pixel;
                row1[dst_x + 1] = pixel;
            }
        }

        esp_err_t err = vb_board_draw_rgb565(0, src_y * 2, VB_LCD_H_RES, batch_src_rows * 2, rows);
        if (err != ESP_OK) {
            return err;
        }
    }

    esp_err_t wait_err = vb_board_lcd_wait_for_queued_color();
    if (wait_err != ESP_OK) {
        return wait_err;
    }
    return ESP_OK;
}

static esp_err_t vb_board_camera_draw_rgb565_striped(const vb_board_camera_frame_t *frame)
{
    if (!s_camera_overlay_enabled && !s_camera_direct_draw_disabled && frame->width == VB_LCD_H_RES && frame->height == VB_LCD_V_RES) {
        esp_err_t direct_err = vb_board_draw_rgb565(0, 0, VB_LCD_H_RES, VB_LCD_V_RES, frame->buf);
        if (direct_err == ESP_OK) {
            return vb_board_lcd_wait_for_queued_color();
        }
        s_camera_direct_draw_disabled = true;
        ESP_LOGW(TAG, "camera direct LCD draw failed, falling back to stripes: %s", esp_err_to_name(direct_err));
    }

    const uint16_t stripe_rows = VB_CAMERA_LCD_STRIPE_ROWS;

    const uint8_t *src = (const uint8_t *)frame->buf;
    uint16_t *rows = s_camera_lcd_rows;
    const size_t line_bytes = (size_t)VB_LCD_H_RES * sizeof(uint16_t);
    const uint16_t draw_height = s_camera_overlay_enabled ? (VB_LCD_V_RES - VB_CAMERA_OVERLAY_BAR_H) : VB_LCD_V_RES;
    for (uint16_t y = 0; y < draw_height; y += stripe_rows) {
        if (y > 0) {
            esp_err_t wait_err = vb_board_lcd_wait_for_queued_color();
            if (wait_err != ESP_OK) {
                return wait_err;
            }
        }

        const uint16_t stripe_height = (uint16_t)((draw_height - y) < stripe_rows ? (draw_height - y) : stripe_rows);
        memcpy(rows, src + ((size_t)y * line_bytes), line_bytes * stripe_height);
        esp_err_t err = vb_board_draw_rgb565(0, y, VB_LCD_H_RES, stripe_height, rows);
        if (err != ESP_OK) {
            return err;
        }
    }

    esp_err_t wait_err = vb_board_lcd_wait_for_queued_color();
    if (wait_err != ESP_OK) {
        return wait_err;
    }
    return ESP_OK;
}

void vb_board_camera_overlay_set(bool enabled)
{
    if (enabled) {
        s_camera_overlay_dirty = true;
    } else {
        s_camera_overlay_dirty = false;
    }
    s_camera_overlay_enabled = enabled;
}

static esp_err_t vb_board_camera_draw_overlay_rect(uint16_t x, uint16_t y, uint16_t width, uint16_t height, uint16_t color)
{
    if (width == 0 || height == 0) {
        return ESP_OK;
    }
    if ((uint32_t)width * VB_CAMERA_LCD_STRIPE_ROWS > (uint32_t)(VB_LCD_H_RES * VB_CAMERA_LCD_STRIPE_ROWS)) {
        return ESP_ERR_INVALID_ARG;
    }

    uint16_t *rows = s_camera_lcd_rows;
    for (uint16_t row = 0; row < height; row += VB_CAMERA_LCD_STRIPE_ROWS) {
        const uint16_t stripe_height = (uint16_t)((height - row) < VB_CAMERA_LCD_STRIPE_ROWS ? (height - row) : VB_CAMERA_LCD_STRIPE_ROWS);
        for (size_t i = 0; i < (size_t)width * stripe_height; i++) {
            rows[i] = color;
        }
        if (row > 0) {
            ESP_RETURN_ON_ERROR(vb_board_lcd_wait_for_queued_color(), TAG, "camera overlay wait failed");
        }
        ESP_RETURN_ON_ERROR(vb_board_draw_rgb565(x, y + row, width, stripe_height, rows), TAG, "camera overlay draw failed");
    }
    return vb_board_lcd_wait_for_queued_color();
}

static esp_err_t vb_board_camera_draw_shutter_button(uint16_t x, uint16_t y)
{
    const uint16_t border = 0xffff;
    const uint16_t fill = 0x0861;
    const uint16_t accent = 0x07ff;
    const int center_x = VB_CAMERA_OVERLAY_BUTTON_W / 2;
    const int center_y = VB_CAMERA_OVERLAY_BUTTON_H / 2;
    const int outer_r = 12;
    const int inner_r = 7;
    uint16_t *rows = s_camera_lcd_rows;

    for (uint16_t row = 0; row < VB_CAMERA_OVERLAY_BUTTON_H; row += VB_CAMERA_LCD_STRIPE_ROWS) {
        const uint16_t stripe_height = (uint16_t)((VB_CAMERA_OVERLAY_BUTTON_H - row) < VB_CAMERA_LCD_STRIPE_ROWS
            ? (VB_CAMERA_OVERLAY_BUTTON_H - row)
            : VB_CAMERA_LCD_STRIPE_ROWS);
        for (uint16_t local_y = 0; local_y < stripe_height; local_y++) {
            const uint16_t button_y = row + local_y;
            for (uint16_t button_x = 0; button_x < VB_CAMERA_OVERLAY_BUTTON_W; button_x++) {
                uint16_t color = fill;
                if (button_x < 2 || button_y < 2 || button_x >= VB_CAMERA_OVERLAY_BUTTON_W - 2 || button_y >= VB_CAMERA_OVERLAY_BUTTON_H - 2) {
                    color = border;
                }

                int dx = (int)button_x - center_x;
                int dy = (int)button_y - center_y;
                int d2 = (dx * dx) + (dy * dy);
                if (d2 <= outer_r * outer_r && d2 >= inner_r * inner_r) {
                    color = border;
                } else if (d2 < inner_r * inner_r) {
                    color = accent;
                }
                rows[(local_y * VB_CAMERA_OVERLAY_BUTTON_W) + button_x] = color;
            }
        }
        if (row > 0) {
            ESP_RETURN_ON_ERROR(vb_board_lcd_wait_for_queued_color(), TAG, "camera shutter wait failed");
        }
        ESP_RETURN_ON_ERROR(vb_board_draw_rgb565(x, y + row, VB_CAMERA_OVERLAY_BUTTON_W, stripe_height, rows), TAG, "camera shutter draw failed");
    }
    return vb_board_lcd_wait_for_queued_color();
}

static esp_err_t vb_board_camera_draw_overlay(void)
{
    if (!s_camera_overlay_enabled) {
        return ESP_OK;
    }
    if (!s_camera_overlay_dirty) {
        return ESP_OK;
    }

    const char *label = VB_CAMERA_OVERLAY_SHUTTER_LABEL;
    (void)label;
    const uint16_t bar_y = VB_LCD_V_RES - VB_CAMERA_OVERLAY_BAR_H;
    const uint16_t button_x = (VB_LCD_H_RES - VB_CAMERA_OVERLAY_BUTTON_W) / 2;
    const uint16_t button_y = bar_y + ((VB_CAMERA_OVERLAY_BAR_H - VB_CAMERA_OVERLAY_BUTTON_H) / 2);

    ESP_RETURN_ON_ERROR(vb_board_camera_draw_overlay_rect(0, bar_y, VB_LCD_H_RES, VB_CAMERA_OVERLAY_BAR_H, 0x0020), TAG, "camera overlay bar failed");
    ESP_RETURN_ON_ERROR(vb_board_camera_draw_shutter_button(button_x, button_y), TAG, "camera shutter failed");
    s_camera_overlay_dirty = false;
    return ESP_OK;
}

esp_err_t vb_board_camera_draw(const vb_board_camera_frame_t *frame)
{
    if (frame == NULL || frame->buf == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (strcmp(frame->format, "rgb565") != 0) {
        return ESP_ERR_NOT_SUPPORTED;
    }

    ESP_RETURN_ON_ERROR(vb_board_camera_take_display(), TAG, "camera display takeover failed");

    esp_err_t err = ESP_ERR_NOT_SUPPORTED;
    if (frame->width == VB_LCD_H_RES / 2 && frame->height == VB_LCD_V_RES / 2) {
        err = vb_board_camera_draw_rgb565_scaled_2x(frame);
    } else if (frame->width == VB_LCD_H_RES && frame->height == VB_LCD_V_RES) {
        err = vb_board_camera_draw_rgb565_striped(frame);
    }
    if (err != ESP_OK) {
        return err;
    }
    return vb_board_camera_draw_overlay();
}

static esp_err_t vb_board_camera_preview_probe_frame(void)
{
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb == NULL) {
        return ESP_ERR_TIMEOUT;
    }

    vb_board_camera_frame_t frame = {
        .width = (uint16_t)fb->width,
        .height = (uint16_t)fb->height,
        .len = fb->len,
        .format = fb->format == PIXFORMAT_RGB565 ? "rgb565" : "unknown",
        .buf = fb->buf,
        .driver_frame = fb,
    };
    esp_err_t err = vb_board_camera_draw(&frame);
    esp_camera_fb_return(fb);
    return err;
}

static void vb_board_camera_preview_task(void *arg)
{
    (void)arg;
    ESP_LOGI(TAG, "camera preview task started");
    uint32_t failure_count = 0;

    while (!s_camera_preview_stop_requested) {
        camera_fb_t *fb = esp_camera_fb_get();
        if (fb == NULL) {
            if ((failure_count++ % 30) == 0) {
                ESP_LOGW(TAG, "camera preview frame timeout");
            }
            vTaskDelay(pdMS_TO_TICKS(5));
            continue;
        }
        if (s_camera_preview_stop_requested) {
            esp_camera_fb_return(fb);
            break;
        }

        vb_board_camera_frame_t frame = {
            .width = (uint16_t)fb->width,
            .height = (uint16_t)fb->height,
            .len = fb->len,
            .format = fb->format == PIXFORMAT_RGB565 ? "rgb565" : "unknown",
            .buf = fb->buf,
            .driver_frame = fb,
        };
        s_camera_preview_frame_count++;
        if (s_camera_snapshot_requested || !s_camera_latest_frame_valid || (s_camera_preview_frame_count % 5) == 0) {
            esp_err_t cache_err = vb_board_camera_store_latest_frame(fb);
            if (cache_err != ESP_OK && (failure_count++ % 30) == 0) {
                ESP_LOGW(TAG, "camera latest frame cache failed: %s", esp_err_to_name(cache_err));
            }
        }
        if (s_camera_snapshot_requested) {
            if (vb_board_camera_clone_latest_frame(&s_camera_snapshot_frame) == ESP_OK) {
                s_camera_snapshot_error = ESP_OK;
                s_camera_snapshot_ready = true;
            } else {
                s_camera_snapshot_error = ESP_ERR_INVALID_STATE;
                s_camera_snapshot_ready = false;
            }
            s_camera_snapshot_requested = false;
        }
        esp_err_t err = vb_board_camera_draw(&frame);
        esp_camera_fb_return(fb);

        if (err != ESP_OK) {
            if ((failure_count++ % 30) == 0) {
                ESP_LOGW(TAG, "camera preview draw failed: %s", esp_err_to_name(err));
            }
            vTaskDelay(pdMS_TO_TICKS(20));
        } else {
            failure_count = 0;
        }
    }

    ESP_LOGI(TAG, "camera preview task stopped");
    TaskHandle_t stop_waiter = s_camera_preview_stop_waiter;
    s_camera_preview_task = NULL;
    s_camera_preview_stop_requested = false;
    s_camera_preview_stop_waiter = NULL;
    s_camera_preview_mode = VB_CAMERA_PREVIEW_MODE_STOPPED;
    s_camera_preview_width = 0;
    s_camera_preview_height = 0;
    s_camera_snapshot_requested = false;
    s_camera_preview_frame_count = 0;
    if (stop_waiter != NULL) {
        xTaskNotifyGive(stop_waiter);
    }
    vTaskDelete(NULL);
}

static esp_err_t vb_board_camera_preview_start_mode(vb_board_camera_preview_mode_t mode)
{
    if (s_camera_preview_task != NULL) {
        return ESP_OK;
    }

    uint16_t width = VB_LCD_H_RES / 2;
    uint16_t height = VB_LCD_V_RES / 2;
    if (mode == VB_CAMERA_PREVIEW_MODE_QVGA_DIRECT) {
        width = VB_LCD_H_RES;
        height = VB_LCD_V_RES;
    } else if (mode != VB_CAMERA_PREVIEW_MODE_QQVGA_SCALED) {
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t err = vb_board_camera_start(width, height, "rgb565");
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "camera %s preview start failed: %s", vb_board_camera_preview_mode_name(mode), esp_err_to_name(err));
        return err;
    }
    s_camera_direct_draw_disabled = false;

    err = vb_board_camera_take_display();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "camera %s preview display takeover failed: %s", vb_board_camera_preview_mode_name(mode), esp_err_to_name(err));
        vb_board_camera_stop();
        return err;
    }

    err = vb_board_camera_preview_probe_frame();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "camera %s preview probe failed: %s", vb_board_camera_preview_mode_name(mode), esp_err_to_name(err));
        vb_board_camera_stop();
        return err;
    }

    s_camera_preview_stop_requested = false;
    BaseType_t created = xTaskCreatePinnedToCoreWithCaps(
        vb_board_camera_preview_task,
        "camera_preview",
        4096,
        NULL,
        6,
        &s_camera_preview_task,
        1,
        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT
    );
    if (created != pdPASS) {
        s_camera_preview_task = NULL;
        vb_board_camera_stop();
        return ESP_ERR_NO_MEM;
    }
    s_camera_preview_mode = mode;
    s_camera_preview_width = width;
    s_camera_preview_height = height;
    ESP_LOGI(TAG, "camera preview mode: %s %ux%u", vb_board_camera_preview_mode_name(mode), width, height);
    return ESP_OK;
}

esp_err_t vb_board_camera_preview_start(void)
{
    if (s_camera_preview_task != NULL) {
        return ESP_OK;
    }

    esp_err_t err = vb_board_camera_preview_start_mode(VB_CAMERA_PREVIEW_MODE_QVGA_DIRECT);
    if (err == ESP_OK) {
        return ESP_OK;
    }

    ESP_LOGW(TAG, "camera qvga-direct preview unavailable, falling back to qqvga-scaled: %s", esp_err_to_name(err));
    vb_board_camera_stop();
    return vb_board_camera_preview_start_mode(VB_CAMERA_PREVIEW_MODE_QQVGA_SCALED);
}

esp_err_t vb_board_camera_preview_start_low_memory(void)
{
    if (s_camera_preview_task != NULL) {
        return ESP_OK;
    }
    return vb_board_camera_preview_start_mode(VB_CAMERA_PREVIEW_MODE_QQVGA_SCALED);
}

void vb_board_camera_preview_stop(void)
{
    s_camera_overlay_enabled = false;
    s_camera_overlay_dirty = false;
    if (s_camera_preview_task == NULL) {
        s_camera_preview_mode = VB_CAMERA_PREVIEW_MODE_STOPPED;
        s_camera_preview_width = 0;
        s_camera_preview_height = 0;
        s_camera_direct_draw_disabled = false;
        return;
    }

    s_camera_preview_stop_waiter = xTaskGetCurrentTaskHandle();
    s_camera_preview_stop_requested = true;
    uint32_t notified = ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(1000));
    if (s_camera_preview_task != NULL) {
        ESP_LOGW(TAG, "camera preview task did not stop before timeout notified=%" PRIu32, notified);
        s_camera_preview_stop_waiter = NULL;
    }
}

const char *vb_board_camera_preview_mode(uint16_t *width, uint16_t *height)
{
    if (width != NULL) {
        *width = s_camera_preview_width;
    }
    if (height != NULL) {
        *height = s_camera_preview_height;
    }
    return vb_board_camera_preview_mode_name(s_camera_preview_mode);
}

void vb_board_camera_return(vb_board_camera_frame_t *frame)
{
    if (frame == NULL) {
        return;
    }
    if (frame->owns_buffer && frame->buf != NULL) {
        heap_caps_free((void *)frame->buf);
    } else if (frame->driver_frame != NULL) {
        esp_camera_fb_return((camera_fb_t *)frame->driver_frame);
    }
    memset(frame, 0, sizeof(*frame));
}

void vb_board_camera_stop(void)
{
    vb_board_camera_preview_stop();
    s_camera_overlay_enabled = false;
    s_camera_overlay_dirty = false;
    s_camera_snapshot_requested = false;
    s_camera_direct_draw_disabled = false;
    vb_board_camera_release_internal_dma_reserve();
    vb_board_camera_clear_latest_frame();

    if (s_camera_ready) {
        esp_camera_deinit();
        s_camera_ready = false;
        esp_err_t err = pca9557_set_output(VB_PCA9557_DVP_PWDN_BIT, true);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "camera power-down failed: %s", esp_err_to_name(err));
        }
    }

    if (s_camera_display_taken) {
        esp_err_t wait_err = vb_board_lcd_wait_for_queued_color();
        if (wait_err != ESP_OK) {
            ESP_LOGW(TAG, "camera display wait before release failed: %s", esp_err_to_name(wait_err));
        }
        vb_board_display_release_takeover();
        s_camera_display_taken = false;
    }
}

static esp_err_t backlight_init(void)
{
    const ledc_channel_config_t channel = {
        .gpio_num = VB_LCD_BACKLIGHT,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_0,
        .intr_type = LEDC_INTR_DISABLE,
        .timer_sel = LEDC_TIMER_0,
        .duty = 0,
        .hpoint = 0,
        .flags.output_invert = true,
    };
    const ledc_timer_config_t timer = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .duty_resolution = LEDC_TIMER_10_BIT,
        .timer_num = LEDC_TIMER_0,
        .freq_hz = 5000,
        .clk_cfg = LEDC_AUTO_CLK,
    };

    ESP_RETURN_ON_ERROR(ledc_timer_config(&timer), TAG, "backlight timer failed");
    ESP_RETURN_ON_ERROR(ledc_channel_config(&channel), TAG, "backlight channel failed");
    s_backlight_ready = true;
    s_backlight_percent = 0;
    return ESP_OK;
}

static esp_err_t backlight_on(void)
{
    ESP_LOGI(TAG, "Setting LCD backlight: 100%%");
    return vb_board_set_backlight_percent(100);
}

static esp_err_t display_init(void)
{
    ESP_RETURN_ON_ERROR(backlight_init(), TAG, "backlight init failed");

    const spi_bus_config_t buscfg = {
        .sclk_io_num = VB_LCD_SPI_CLK,
        .mosi_io_num = VB_LCD_SPI_MOSI,
        .miso_io_num = GPIO_NUM_NC,
        .quadwp_io_num = GPIO_NUM_NC,
        .quadhd_io_num = GPIO_NUM_NC,
        .max_transfer_sz = VB_LCD_H_RES * VB_LCD_V_RES * sizeof(uint16_t),
    };
    ESP_RETURN_ON_ERROR(spi_bus_initialize(VB_LCD_SPI_HOST, &buscfg, SPI_DMA_CH_AUTO), TAG, "spi init failed");

    const esp_lcd_panel_io_spi_config_t io_config = {
        .dc_gpio_num = VB_LCD_DC,
        .cs_gpio_num = VB_LCD_SPI_CS,
        .pclk_hz = VB_LCD_PIXEL_CLOCK_HZ,
        .lcd_cmd_bits = 8,
        .lcd_param_bits = 8,
        .spi_mode = 2,
        .trans_queue_depth = 10,
    };
    ESP_RETURN_ON_ERROR(
        esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)VB_LCD_SPI_HOST, &io_config, &lcd_io),
        TAG,
        "lcd panel io failed"
    );

    const esp_lcd_panel_dev_config_t panel_config = {
        .reset_gpio_num = VB_LCD_RST,
        .rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB,
        .bits_per_pixel = 16,
    };
    ESP_RETURN_ON_ERROR(esp_lcd_new_panel_st7789(lcd_io, &panel_config, &lcd_panel), TAG, "st7789 init failed");

    ESP_RETURN_ON_ERROR(esp_lcd_panel_reset(lcd_panel), TAG, "lcd reset failed");
    ESP_RETURN_ON_ERROR(lcd_cs_set(false), TAG, "lcd cs low failed");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_init(lcd_panel), TAG, "lcd panel init failed");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_invert_color(lcd_panel, true), TAG, "lcd invert failed");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_swap_xy(lcd_panel, true), TAG, "lcd swap xy failed");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_mirror(lcd_panel, true, false), TAG, "lcd mirror failed");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_disp_on_off(lcd_panel, true), TAG, "lcd display on failed");

    return ESP_OK;
}

static esp_err_t touch_init(lv_disp_t *disp)
{
    esp_lcd_touch_config_t tp_cfg = {
        .x_max = VB_LCD_V_RES,
        .y_max = VB_LCD_H_RES,
        .rst_gpio_num = GPIO_NUM_NC,
        .int_gpio_num = GPIO_NUM_NC,
        .levels = {
            .reset = 0,
            .interrupt = 0,
        },
        .flags = {
            .swap_xy = 1,
            .mirror_x = 1,
            .mirror_y = 0,
        },
    };

    esp_lcd_panel_io_handle_t tp_io = NULL;
    esp_lcd_panel_io_i2c_config_t tp_io_config = ESP_LCD_TOUCH_IO_I2C_FT5x06_CONFIG();
    ESP_RETURN_ON_ERROR(
        esp_lcd_new_panel_io_i2c((esp_lcd_i2c_bus_handle_t)VB_I2C_PORT, &tp_io_config, &tp_io),
        TAG,
        "touch io failed"
    );
    ESP_RETURN_ON_ERROR(esp_lcd_touch_new_i2c_ft5x06(tp_io, &tp_cfg, &touch), TAG, "touch init failed");

    const lvgl_port_touch_cfg_t touch_cfg = {
        .disp = disp,
        .handle = touch,
    };
    lvgl_port_add_touch(&touch_cfg);
    return ESP_OK;
}

static void lvgl_flush_wait_callback(lv_disp_drv_t *drv)
{
    (void)drv;
    vTaskDelay(pdMS_TO_TICKS(1));
}

esp_err_t vb_board_display_takeover(void)
{
    if (lcd_panel == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    if (s_display_takeover_active) {
        return ESP_OK;
    }

    esp_err_t err = lvgl_port_stop();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }
    s_display_takeover_active = true;
    return ESP_OK;
}

void vb_board_display_release_takeover(void)
{
    if (!s_display_takeover_active) {
        return;
    }
    s_display_takeover_active = false;
    esp_err_t err = lvgl_port_resume();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "lvgl resume after display takeover failed: %s", esp_err_to_name(err));
    }
}

esp_err_t vb_board_draw_rgb565(uint16_t x, uint16_t y, uint16_t width, uint16_t height, const void *rgb565)
{
    if (lcd_panel == NULL || rgb565 == NULL || width == 0 || height == 0) {
        return ESP_ERR_INVALID_ARG;
    }
    if ((uint32_t)x + width > VB_LCD_H_RES || (uint32_t)y + height > VB_LCD_V_RES) {
        return ESP_ERR_INVALID_SIZE;
    }

    if (s_display_takeover_active) {
        return esp_lcd_panel_draw_bitmap(lcd_panel, x, y, x + width, y + height, rgb565);
    }

    if (!lvgl_port_lock(pdMS_TO_TICKS(100))) {
        return ESP_ERR_TIMEOUT;
    }
    esp_err_t err = esp_lcd_panel_draw_bitmap(lcd_panel, x, y, x + width, y + height, rgb565);
    lvgl_port_unlock();
    return err;
}

esp_err_t vb_board_set_backlight_percent(int level)
{
    if (!s_backlight_ready) {
        return ESP_ERR_INVALID_STATE;
    }
    if (level < 0 || level > 100) {
        return ESP_ERR_INVALID_ARG;
    }

    uint32_t duty = (uint32_t)((level * 1023 + 50) / 100);
    ESP_RETURN_ON_ERROR(ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty), TAG, "backlight duty failed");
    ESP_RETURN_ON_ERROR(ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0), TAG, "backlight update failed");
    s_backlight_percent = level;
    return ESP_OK;
}

esp_err_t vb_board_get_backlight_percent(int *level)
{
    if (level == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!s_backlight_ready) {
        return ESP_ERR_INVALID_STATE;
    }

    *level = s_backlight_percent;
    return ESP_OK;
}

static esp_err_t lvgl_init(vb_board_status_t *status)
{
    lvgl_port_cfg_t lvgl_cfg = ESP_LVGL_PORT_INIT_CONFIG();
    lvgl_cfg.task_stack = 8192;
    ESP_RETURN_ON_ERROR(lvgl_port_init(&lvgl_cfg), TAG, "lvgl port init failed");

    const lvgl_port_display_cfg_t disp_cfg = {
        .io_handle = lcd_io,
        .panel_handle = lcd_panel,
        .buffer_size = VB_LCD_H_RES * VB_LCD_DRAW_BUF_HEIGHT,
        .double_buffer = false,
        .hres = VB_LCD_H_RES,
        .vres = VB_LCD_V_RES,
        .monochrome = false,
        .rotation = {
            .swap_xy = true,
            .mirror_x = true,
            .mirror_y = false,
        },
        .flags = {
            .buff_dma = true,
            .buff_spiram = false,
        },
    };

    lv_disp_t *disp = lvgl_port_add_disp(&disp_cfg);
    if (disp == NULL) {
        return ESP_FAIL;
    }
    disp->driver->wait_cb = lvgl_flush_wait_callback;
    status->display_ok = true;

    esp_err_t touch_err = touch_init(disp);
    if (touch_err == ESP_OK) {
        status->touch_ok = true;
    } else {
        ESP_LOGW(TAG, "touch init failed: %s", esp_err_to_name(touch_err));
    }

    return ESP_OK;
}

esp_err_t vb_board_mount_sd(vb_board_status_t *status)
{
    if (sd_card != NULL) {
        if (status != NULL) {
            status->sd_ok = true;
            status->sd_error = ESP_OK;
        }
        return ESP_OK;
    }

    esp_vfs_fat_sdmmc_mount_config_t mount_config = {
        .format_if_mount_failed = false,
        .max_files = VB_SD_MAX_OPEN_FILES,
        .allocation_unit_size = 16 * 1024,
    };
    sdmmc_host_t host = SDMMC_HOST_DEFAULT();
    host.flags |= SDMMC_HOST_FLAG_ALLOC_ALIGNED_BUF;
    sdmmc_slot_config_t slot_config = SDMMC_SLOT_CONFIG_DEFAULT();
    slot_config.width = 1;
    slot_config.clk = VB_SD_CLK;
    slot_config.cmd = VB_SD_CMD;
    slot_config.d0 = VB_SD_D0;
    slot_config.flags |= SDMMC_SLOT_FLAG_INTERNAL_PULLUP;

    esp_err_t err = esp_vfs_fat_sdmmc_mount(VB_SD_MOUNT_POINT, &host, &slot_config, &mount_config, &sd_card);
    if (status != NULL) {
        status->sd_ok = err == ESP_OK;
        status->sd_error = err;
    }
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "SD mount failed: %s", esp_err_to_name(err));
        return err;
    }

    sdmmc_card_print_info(stdout, sd_card);
    return ESP_OK;
}

void vb_board_unmount_sd(vb_board_status_t *status)
{
    if (sd_card == NULL) {
        if (status != NULL) {
            status->sd_ok = false;
            status->sd_error = ESP_ERR_NOT_FOUND;
        }
        return;
    }

    esp_vfs_fat_sdcard_unmount(VB_SD_MOUNT_POINT, sd_card);
    sd_card = NULL;
    if (status != NULL) {
        status->sd_ok = false;
        status->sd_error = ESP_ERR_NOT_FOUND;
    }
}

static int board_now_ms(void)
{
    return (int)(xTaskGetTickCount() * 1000 / configTICK_RATE_HZ);
}

static void emit_swipe(uint16_t start_x, uint16_t start_y, uint16_t end_x, uint16_t end_y)
{
    vb_board_input_callback_t callback = input_callback;
    if (callback == NULL) {
        return;
    }

    int dx = (int)end_x - (int)start_x;
    int dy = (int)end_y - (int)start_y;
    int abs_dx = dx < 0 ? -dx : dx;
    int abs_dy = dy < 0 ? -dy : dy;
    if (abs_dx < VB_BOARD_TOUCH_SWIPE_MIN_PX && abs_dy < VB_BOARD_TOUCH_SWIPE_MIN_PX) {
        return;
    }

    int code = 0;
    if (abs_dx >= abs_dy) {
        code = dx < 0 ? VB_LUA_KEY_LEFT : VB_LUA_KEY_RIGHT;
    } else {
        code = dy < 0 ? VB_LUA_KEY_UP : VB_LUA_KEY_DOWN;
    }

    callback(code, VB_LUA_KEY_START, board_now_ms(), end_x, end_y, input_user_data);
}

static void board_input_task(void *arg)
{
    (void)arg;
    bool tracking = false;
    uint16_t start_x = 0;
    uint16_t start_y = 0;
    uint16_t last_x = 0;
    uint16_t last_y = 0;

    while (!input_stop_requested) {
        if (touch != NULL && lvgl_port_lock(0)) {
            esp_lcd_touch_point_data_t points[1] = {0};
            uint8_t count = 0;
            esp_lcd_touch_read_data(touch);
            esp_err_t touch_data_err = esp_lcd_touch_get_data(touch, points, &count, 1);
            if (touch_data_err == ESP_OK && count > 0) {
                vb_board_input_callback_t callback = input_callback;
                int timestamp = board_now_ms();
                uint16_t x = points[0].x;
                uint16_t y = points[0].y;
                if (!tracking) {
                    start_x = x;
                    start_y = y;
                    tracking = true;
                    if (callback != NULL) {
                        callback(0, VB_BOARD_TOUCH_EVENT_DOWN, timestamp, x, y, input_user_data);
                    }
                } else if (x != last_x || y != last_y) {
                    if (callback != NULL) {
                        callback(0, VB_BOARD_TOUCH_EVENT_MOVE, timestamp, x, y, input_user_data);
                    }
                }
                last_x = x;
                last_y = y;
            } else if (tracking) {
                vb_board_input_callback_t callback = input_callback;
                if (callback != NULL) {
                    callback(0, VB_BOARD_TOUCH_EVENT_UP, board_now_ms(), last_x, last_y, input_user_data);
                }
                emit_swipe(start_x, start_y, last_x, last_y);
                tracking = false;
            }
            lvgl_port_unlock();
        }
        vTaskDelay(pdMS_TO_TICKS(VB_BOARD_INPUT_POLL_MS));
    }

    input_task = NULL;
    vTaskDelete(NULL);
}

esp_err_t vb_board_input_start(vb_board_input_callback_t callback, void *user_data)
{
    if (callback == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (touch == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    if (input_task != NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    input_callback = callback;
    input_user_data = user_data;
    input_stop_requested = false;

    BaseType_t created = xTaskCreatePinnedToCoreWithCaps(board_input_task,
                                                         "vb_input",
                                                         3072,
                                                         NULL,
                                                         4,
                                                         &input_task,
                                                         tskNO_AFFINITY,
                                                         MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (created != pdPASS) {
        input_task = NULL;
        input_callback = NULL;
        input_user_data = NULL;
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}

void vb_board_input_stop(void)
{
    TaskHandle_t task = input_task;
    if (task == NULL) {
        input_callback = NULL;
        input_user_data = NULL;
        return;
    }

    input_stop_requested = true;
    for (int i = 0; i < 25 && input_task != NULL; i++) {
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    input_callback = NULL;
    input_user_data = NULL;
}

esp_err_t vb_board_start(vb_board_status_t *status)
{
    if (status == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(status, 0, sizeof(*status));

    ESP_LOGI(TAG, "VibeBoard Runtime board start");
    ESP_RETURN_ON_ERROR(vb_board_start_storage(status), TAG, "board storage start failed");
    ESP_RETURN_ON_ERROR(vb_board_start_display(status), TAG, "board display start failed");
    return ESP_OK;
}

esp_err_t vb_board_start_storage(vb_board_status_t *status)
{
    if (status == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    ESP_RETURN_ON_ERROR(i2c_init(), TAG, "i2c init failed");
    ESP_RETURN_ON_ERROR(pca9557_init(), TAG, "pca9557 init failed");
    esp_err_t imu_err = qmi8658_init();
    if (imu_err == ESP_OK) {
        status->imu_ok = true;
    } else {
        status->imu_ok = false;
        s_imu_ready = false;
        ESP_LOGW(TAG, "qmi8658 init failed: %s", esp_err_to_name(imu_err));
    }
    vb_board_mount_sd(status);
    return ESP_OK;
}

esp_err_t vb_board_start_display(vb_board_status_t *status)
{
    if (status == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    ESP_RETURN_ON_ERROR(display_init(), TAG, "display init failed");
    ESP_RETURN_ON_ERROR(lvgl_init(status), TAG, "lvgl init failed");
    ESP_RETURN_ON_ERROR(backlight_on(), TAG, "backlight on failed");
    return ESP_OK;
}
