#pragma once

#include <stdbool.h>

#include "driver/gpio.h"
#include "esp_err.h"
#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VB_I2C_SDA GPIO_NUM_1
#define VB_I2C_SCL GPIO_NUM_2
#define VB_I2C_PORT 0
#define VB_I2C_FREQ_HZ 100000

#define VB_PCA9557_ADDR 0x19
#define VB_PCA9557_LCD_CS_BIT BIT(0)

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
#define VB_LCD_DRAW_BUF_HEIGHT 20

#define VB_SD_MOUNT_POINT "/sdcard"
#define VB_SD_CLK GPIO_NUM_47
#define VB_SD_CMD GPIO_NUM_48
#define VB_SD_D0 GPIO_NUM_21

typedef struct {
    bool display_ok;
    bool touch_ok;
    bool sd_ok;
    esp_err_t sd_error;
} vb_board_status_t;

esp_err_t vb_board_start(vb_board_status_t *status);
esp_err_t vb_board_mount_sd(vb_board_status_t *status);
lv_indev_t *vb_board_touch_indev(void);

#ifdef __cplusplus
}
#endif
