#include "board_lckfb_szpi_s3.h"

#include <string.h>

#include "driver/i2c.h"
#include "driver/ledc.h"
#include "driver/sdmmc_host.h"
#include "driver/spi_master.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_lcd_touch_ft5x06.h"
#include "esp_log.h"
#include "esp_vfs_fat.h"
#include "esp_lvgl_port.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lvgl.h"
#include "sdmmc_cmd.h"

static const char *TAG = "board_lckfb";

static esp_lcd_panel_handle_t lcd_panel;
static esp_lcd_panel_io_handle_t lcd_io;
static esp_lcd_touch_handle_t touch;
static sdmmc_card_t *sd_card;

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
    ESP_RETURN_ON_ERROR(pca9557_write(0x01, VB_PCA9557_LCD_CS_BIT), TAG, "pca output failed");
    ESP_RETURN_ON_ERROR(pca9557_write(0x03, 0xf8), TAG, "pca config failed");
    return ESP_OK;
}

static esp_err_t lcd_cs_set(bool high)
{
    return pca9557_write(0x01, high ? VB_PCA9557_LCD_CS_BIT : 0x00);
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
    ESP_RETURN_ON_ERROR(ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 1023), TAG, "backlight duty failed");
    return ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
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

static esp_err_t lvgl_init(vb_board_status_t *status)
{
    const lvgl_port_cfg_t lvgl_cfg = ESP_LVGL_PORT_INIT_CONFIG();
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
            .buff_dma = false,
            .buff_spiram = true,
        },
    };

    lv_disp_t *disp = lvgl_port_add_disp(&disp_cfg);
    if (disp == NULL) {
        return ESP_FAIL;
    }
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
    esp_vfs_fat_sdmmc_mount_config_t mount_config = {
        .format_if_mount_failed = false,
        .max_files = 8,
        .allocation_unit_size = 16 * 1024,
    };
    sdmmc_host_t host = SDMMC_HOST_DEFAULT();
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

esp_err_t vb_board_start(vb_board_status_t *status)
{
    if (status == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(status, 0, sizeof(*status));

    ESP_LOGI(TAG, "VibeBoard Runtime board start");
    ESP_RETURN_ON_ERROR(i2c_init(), TAG, "i2c init failed");
    ESP_RETURN_ON_ERROR(pca9557_init(), TAG, "pca9557 init failed");
    ESP_RETURN_ON_ERROR(display_init(), TAG, "display init failed");
    ESP_RETURN_ON_ERROR(lvgl_init(status), TAG, "lvgl init failed");
    vb_board_mount_sd(status);
    return ESP_OK;
}
