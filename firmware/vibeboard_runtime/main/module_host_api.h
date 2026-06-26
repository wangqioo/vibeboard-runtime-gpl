#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lua.h"
#include "lauxlib.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int (*write)(const void *data, size_t size);
    int (*print)(const char *text);
    int (*println)(const char *text);
    void (*flush)(void);
} vb_module_host_serial_api_t;

typedef struct {
    uint32_t (*millis)(void);
    uint64_t (*micros)(void);
    void (*delay_ms)(uint32_t ms);
    void (*yield)(void);
} vb_module_host_time_api_t;

typedef struct {
    void *(*malloc)(size_t size);
    void *(*calloc)(size_t count, size_t size);
    void (*free)(void *ptr);
    size_t (*free_size)(void);
    size_t (*largest_free_block)(void);
} vb_module_host_heap_api_t;

typedef struct {
    FILE *(*open)(const char *path, const char *mode);
    size_t (*read)(void *dest, size_t size, FILE *file);
    int (*seek)(FILE *file, long offset, int whence);
    long (*position)(FILE *file);
    long (*size_bytes)(FILE *file);
    long (*available)(FILE *file);
    int (*close)(FILE *file);
} vb_module_host_file_api_t;

typedef struct {
    BaseType_t (*create)(TaskFunction_t entry,
                         const char *name,
                         uint32_t stack_depth,
                         void *arg,
                         UBaseType_t priority,
                         TaskHandle_t *handle);
    void (*remove)(TaskHandle_t handle);
    void (*yield)(void);
    void (*delay_ms)(uint32_t ms);
} vb_module_host_task_api_t;

typedef struct {
    const char *owner;
    uint16_t width;
    uint16_t height;
    bool writing;
} vb_module_host_display_surface_t;

typedef struct {
    uint16_t (*width)(void);
    uint16_t (*height)(void);
    int (*acquire)(const char *owner, vb_module_host_display_surface_t *surface);
    int (*start_write)(vb_module_host_display_surface_t *surface);
    int (*push_image_dma)(vb_module_host_display_surface_t *surface,
                          uint16_t x,
                          uint16_t y,
                          uint16_t width,
                          uint16_t height,
                          const void *rgb565);
    int (*end_write)(vb_module_host_display_surface_t *surface);
    void (*release)(vb_module_host_display_surface_t *surface);
} vb_module_host_display_api_t;

typedef struct {
    bool started;
    bool connected;
    bool connecting;
    int buttons_mask;
    double lx;
    double ly;
    bool dpad_up;
    bool dpad_down;
    bool dpad_left;
    bool dpad_right;
    char address[32];
    char last_address[32];
} vb_module_host_gamepad_state_t;

typedef struct {
    int (*snapshot)(uint8_t player, vb_module_host_gamepad_state_t *out);
} vb_module_host_gamepad_api_t;

typedef struct {
    int (*gettop)(lua_State *L);
    void (*settop)(lua_State *L, int index);
    void (*pushboolean)(lua_State *L, int value);
    void (*pushinteger)(lua_State *L, lua_Integer value);
    void (*pushstring)(lua_State *L, const char *value);
    void (*setfield)(lua_State *L, int index, const char *key);
    lua_Integer (*checkinteger)(lua_State *L, int arg);
    const char *(*checkstring)(lua_State *L, int arg);
    int (*error)(lua_State *L, const char *message);
} vb_module_host_lua_api_t;

typedef struct {
    uint32_t version;
    vb_module_host_serial_api_t serial;
    vb_module_host_time_api_t time;
    vb_module_host_heap_api_t heap;
    vb_module_host_file_api_t file;
    vb_module_host_task_api_t task;
    vb_module_host_display_api_t display;
    vb_module_host_gamepad_api_t gamepad;
    vb_module_host_lua_api_t lua;
} vb_module_host_api_t;

void vb_module_host_api_init(vb_module_host_api_t *api);

#ifdef __cplusplus
}
#endif
