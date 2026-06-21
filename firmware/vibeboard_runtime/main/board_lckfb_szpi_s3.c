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
static vb_board_input_callback_t input_callback;
static void *input_user_data;

#define VB_BOARD_INPUT_POLL_MS 20
#define VB_BOARD_TOUCH_SWIPE_MIN_PX 28
#define VB_BOARD_TOUCH_EVENT_DOWN 101
#define VB_BOARD_TOUCH_EVENT_MOVE 102
#define VB_BOARD_TOUCH_EVENT_UP 103

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
    return ledc_channel_config(&channel);
}

static esp_err_t backlight_on(void)
{
    ESP_LOGI(TAG, "Setting LCD backlight: 100%%");
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

static void lvgl_flush_wait_callback(lv_disp_drv_t *drv)
{
    (void)drv;
    vTaskDelay(pdMS_TO_TICKS(1));
}

esp_err_t vb_board_draw_rgb565(uint16_t x, uint16_t y, uint16_t width, uint16_t height, const void *rgb565)
{
    if (lcd_panel == NULL || rgb565 == NULL || width == 0 || height == 0) {
        return ESP_ERR_INVALID_ARG;
    }
    if ((uint32_t)x + width > VB_LCD_H_RES || (uint32_t)y + height > VB_LCD_V_RES) {
        return ESP_ERR_INVALID_SIZE;
    }

    return esp_lcd_panel_draw_bitmap(lcd_panel, x, y, x + width, y + height, rgb565);
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
        .max_files = 8,
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
