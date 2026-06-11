# LCKFB SZPI ESP32-S3 Source Map

Local source snapshot:

```text
/Users/wq/Downloads/szpi-s3-esp
```

This is the local LCKFB `szpi-s3-esp` example collection for the `立创·实战派ESP32-S3开发板` track.

Do not copy this full tree into `vibeboard-runtime-gpl`. It is 845 MB and contains generated build output. Use it as the local board-support reference.

No top-level `LICENSE` or `README` file was found in this local snapshot during inspection. Treat direct source import as blocked until license/source provenance is confirmed. Hardware constants and bring-up observations can still be documented.

## Example Inventory

Relevant examples:

| Path | Use for VibeBoard Runtime |
| --- | --- |
| `/Users/wq/Downloads/szpi-s3-esp/03-micro_sd` | First SD-card mount proof. |
| `/Users/wq/Downloads/szpi-s3-esp/06-lcd` | Minimal ST7789 LCD proof. |
| `/Users/wq/Downloads/szpi-s3-esp/08-lcd_lvgl` | Best first BSP seed for LCD + touch + LVGL. |
| `/Users/wq/Downloads/szpi-s3-esp/09-wifi_scan_connect` | WiFi scan/connect proof. |
| `/Users/wq/Downloads/szpi-s3-esp/04-audio_es7210` | Microphone/audio input proof. |
| `/Users/wq/Downloads/szpi-s3-esp/05-audio_es8311` | Codec/audio output proof. |
| `/Users/wq/Downloads/szpi-s3-esp/14-handheld` | Larger integrated demo, useful after single-subsystem proofs. |

Use order:

```text
03-micro_sd
  -> 06-lcd
  -> 08-lcd_lvgl
  -> 09-wifi_scan_connect
  -> optional audio examples
  -> 14-handheld only after the basics are proven
```

## Confirmed Board Constants From Local Source

Sources:

- `/Users/wq/Downloads/szpi-s3-esp/03-micro_sd/main/main.c`
- `/Users/wq/Downloads/szpi-s3-esp/08-lcd_lvgl/main/esp32_s3_szp.h`
- `/Users/wq/Downloads/szpi-s3-esp/08-lcd_lvgl/main/esp32_s3_szp.c`
- `/Users/wq/Downloads/szpi-s3-esp/08-lcd_lvgl/main/idf_component.yml`
- `/Users/wq/Downloads/szpi-s3-esp/08-lcd_lvgl/sdkconfig.defaults`

### Target

```text
ESP-IDF target: esp32s3
Flash: 16 MB
PSRAM: enabled, octal, 80 MHz
CPU: 240 MHz
```

### SD Card

Source: `03-micro_sd/main/main.c`

```text
Mode: SDMMC 1-bit
Mount point in example: /sdcard
CLK: GPIO47
CMD: GPIO48
D0:  GPIO21
Internal pullups: enabled
```

Important source note:

```text
format_if_mount_failed = true
```

For VibeBoard bring-up, change this to `false` unless the SD card contains disposable test data.

### I2C

Source: `08-lcd_lvgl/main/esp32_s3_szp.h`

```text
I2C port: 0
SDA: GPIO1
SCL: GPIO2
Frequency: 100 kHz
```

I2C devices seen in the BSP file:

```text
QMI8658: 0x6A
PCA9557: 0x19
FT5x06-compatible touch: configured through esp_lcd_touch_ft5x06
```

### LCD

Source: `08-lcd_lvgl/main/esp32_s3_szp.h` and `.c`

```text
Controller: ST7789
Resolution: 320 x 240
SPI host: SPI3_HOST
Pixel clock: 80 MHz
MOSI: GPIO40
SCLK: GPIO41
MISO: not used
DC: GPIO39
RST: not used
Backlight: GPIO42 via LEDC channel 0
CS: GPIO_NUM_NC in SPI config, controlled through PCA9557 LCD_CS_GPIO
Bits per pixel: 16
Draw buffer height: 20
```

Panel configuration:

```text
SPI mode: 2
invert_color: true
swap_xy: true
mirror_x: true
mirror_y: false
LVGL buffer: PSRAM
LVGL double buffer: false
```

### Touch

Source: `08-lcd_lvgl/main/esp32_s3_szp.c`

```text
Driver: esp_lcd_touch_ft5x06
I2C port: 0
Reset GPIO: not used
Interrupt GPIO: not used
x_max: BSP_LCD_V_RES
y_max: BSP_LCD_H_RES
swap_xy: true
mirror_x: true
mirror_y: false
```

### Audio Pins Present In Shared BSP Header

Source: `08-lcd_lvgl/main/esp32_s3_szp.h`

```text
I2S port: 0
MCLK: GPIO38
BCLK: GPIO14
WS:   GPIO13
DOUT: GPIO45
DIN:  not set in this header
Sample rate example constant: 16000
```

Audio should be validated later against `04-audio_es7210` and `05-audio_es8311`, not only this shared header.

### LVGL Dependencies

Source: `08-lcd_lvgl/main/idf_component.yml`

```text
lvgl/lvgl: ~8.3.0
espressif/esp_lvgl_port: ~1.4.0
espressif/esp_lcd_touch_ft5x06: ~1.0.6
idf: >=4.1.0
```

Source: `08-lcd_lvgl/sdkconfig.defaults`

```text
CONFIG_LV_COLOR_16_SWAP=y
CONFIG_LV_MEM_CUSTOM=y
CONFIG_LV_USE_DEMO_WIDGETS=y
CONFIG_LV_USE_DEMO_KEYPAD_AND_ENCODER=y
CONFIG_LV_USE_DEMO_BENCHMARK=y
CONFIG_LV_USE_DEMO_STRESS=y
CONFIG_LV_USE_DEMO_MUSIC=y
```

## Runtime Seed Recommendation

Use `08-lcd_lvgl` as the first VibeBoard Runtime firmware seed.

Reason:

- It already initializes the exact LCD path.
- It already initializes touch.
- It uses `esp_lvgl_port`, which is a practical base for future Lua/LVGL integration.
- It is much smaller than `14-handheld` and avoids bringing in camera, Bluetooth HID, speech, MP3, and large font assets too early.

Initial runtime skeleton should copy only the concepts and minimal files needed from:

```text
/Users/wq/Downloads/szpi-s3-esp/08-lcd_lvgl/main/esp32_s3_szp.h
/Users/wq/Downloads/szpi-s3-esp/08-lcd_lvgl/main/esp32_s3_szp.c
/Users/wq/Downloads/szpi-s3-esp/08-lcd_lvgl/main/idf_component.yml
/Users/wq/Downloads/szpi-s3-esp/08-lcd_lvgl/sdkconfig.defaults
```

The first VibeBoard-specific change should be replacing LVGL demo startup with a simple boot screen:

```text
VibeBoard Runtime
SD: pending
Apps: pending
```

Then add SD mount and `/sdcard/apps` scanning.

## Open Items

- Confirm license terms for copied local source before importing code into this GPL repo.
- Confirm whether mount path should be `/sdcard/apps` or `/sd/apps` in the new runtime.
- Confirm ESP-IDF version compatibility with the local `/Users/wq/esp-idf` installation.
- Confirm the attached physical board serial path and chip identity.
