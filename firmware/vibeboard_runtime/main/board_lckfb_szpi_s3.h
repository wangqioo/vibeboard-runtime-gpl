#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "driver/gpio.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VB_I2C_SDA GPIO_NUM_1
#define VB_I2C_SCL GPIO_NUM_2
#define VB_I2C_PORT 0
#define VB_I2C_FREQ_HZ 100000

#define VB_PCA9557_ADDR 0x19
#define VB_PCA9557_LCD_CS_BIT BIT(0)
#define VB_PCA9557_PA_EN_BIT BIT(1)
#define VB_PCA9557_DVP_PWDN_BIT BIT(2)

#define VB_LCD_SPI_HOST SPI3_HOST
#define VB_LCD_PIXEL_CLOCK_HZ (80 * 1000 * 1000)
#define VB_LCD_SPI_MOSI GPIO_NUM_40
#define VB_LCD_SPI_CLK GPIO_NUM_41
#define VB_LCD_SPI_CS GPIO_NUM_NC
#define VB_LCD_DC GPIO_NUM_39
#define VB_LCD_RST GPIO_NUM_NC
#define VB_LCD_BACKLIGHT GPIO_NUM_42
#define VB_LCD_H_RES 320
#define VB_LCD_V_RES 240
#define VB_LCD_DRAW_BUF_HEIGHT 5
#define VB_CAMERA_LCD_STRIPE_ROWS 8

#define VB_SD_MOUNT_POINT "/sdcard"
#define VB_SD_MAX_OPEN_FILES 16
#define VB_SD_CLK GPIO_NUM_47
#define VB_SD_CMD GPIO_NUM_48
#define VB_SD_D0 GPIO_NUM_21

#define VB_CAMERA_XCLK GPIO_NUM_5
#define VB_CAMERA_SIOD GPIO_NUM_1
#define VB_CAMERA_SIOC GPIO_NUM_2
#define VB_CAMERA_D7 GPIO_NUM_9
#define VB_CAMERA_D6 GPIO_NUM_4
#define VB_CAMERA_D5 GPIO_NUM_6
#define VB_CAMERA_D4 GPIO_NUM_15
#define VB_CAMERA_D3 GPIO_NUM_17
#define VB_CAMERA_D2 GPIO_NUM_8
#define VB_CAMERA_D1 GPIO_NUM_18
#define VB_CAMERA_D0 GPIO_NUM_16
#define VB_CAMERA_VSYNC GPIO_NUM_3
#define VB_CAMERA_HREF GPIO_NUM_46
#define VB_CAMERA_PCLK GPIO_NUM_7
#define VB_CAMERA_XCLK_FREQ_HZ 12000000

typedef struct {
    bool display_ok;
    bool touch_ok;
    bool imu_ok;
    bool sd_ok;
    esp_err_t sd_error;
} vb_board_status_t;

typedef void (*vb_board_input_callback_t)(int code, int event, int timestamp_ms, uint16_t x, uint16_t y, void *user_data);

typedef struct {
    int16_t acc_x;
    int16_t acc_y;
    int16_t acc_z;
    int16_t gyr_x;
    int16_t gyr_y;
    int16_t gyr_z;
    float roll;
    float pitch;
    float angle_z;
    int timestamp_ms;
} vb_board_imu_sample_t;

typedef struct {
    uint16_t width;
    uint16_t height;
    size_t len;
    const char *format;
    const void *buf;
    void *driver_frame;
} vb_board_camera_frame_t;

typedef enum {
    VB_CAMERA_PREVIEW_MODE_STOPPED = 0,
    VB_CAMERA_PREVIEW_MODE_QVGA_DIRECT,
    VB_CAMERA_PREVIEW_MODE_QQVGA_SCALED,
} vb_board_camera_preview_mode_t;

esp_err_t vb_board_start(vb_board_status_t *status);
esp_err_t vb_board_start_storage(vb_board_status_t *status);
esp_err_t vb_board_start_display(vb_board_status_t *status);
esp_err_t vb_board_mount_sd(vb_board_status_t *status);
void vb_board_unmount_sd(vb_board_status_t *status);
esp_err_t vb_board_audio_prepare(bool want_rx, bool want_tx, uint32_t sample_rate, uint16_t bits, uint16_t channels, bool rx_tdm);
esp_err_t vb_board_display_takeover(void);
void vb_board_display_release_takeover(void);
esp_err_t vb_board_draw_rgb565(uint16_t x, uint16_t y, uint16_t width, uint16_t height, const void *rgb565);
esp_err_t vb_board_set_backlight_percent(int level);
esp_err_t vb_board_get_backlight_percent(int *level);
bool vb_board_imu_available(void);
esp_err_t vb_board_imu_read(vb_board_imu_sample_t *sample);
esp_err_t vb_board_camera_start(uint16_t width, uint16_t height, const char *format);
esp_err_t vb_board_camera_preview_start(void);
void vb_board_camera_preview_stop(void);
const char *vb_board_camera_preview_mode(uint16_t *width, uint16_t *height);
esp_err_t vb_board_camera_capture(vb_board_camera_frame_t *frame);
esp_err_t vb_board_camera_draw(const vb_board_camera_frame_t *frame);
void vb_board_camera_return(vb_board_camera_frame_t *frame);
void vb_board_camera_stop(void);
esp_err_t vb_board_input_start(vb_board_input_callback_t callback, void *user_data);
void vb_board_input_stop(void);

#ifdef __cplusplus
}
#endif
