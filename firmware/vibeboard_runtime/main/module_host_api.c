#include "module_host_api.h"

#include <string.h>

#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lauxlib.h"
#include "lua.h"
#include "board_lckfb_szpi_s3.h"

#define VB_MODULE_HOST_API_VERSION 1
#define VB_MODULE_HOST_SD_ROOT "/sdcard"
#define VB_MODULE_HOST_DISPLAY_WIDTH 320
#define VB_MODULE_HOST_DISPLAY_HEIGHT 240

static const char *s_display_owner = NULL;

static int vb_host_serial_write(const void *data, size_t size)
{
    if (data == NULL || size == 0) {
        return 0;
    }
    return (int)fwrite(data, 1, size, stdout);
}

static int vb_host_serial_print(const char *text)
{
    if (text == NULL) {
        return 0;
    }
    return printf("%s", text);
}

static int vb_host_serial_println(const char *text)
{
    if (text == NULL) {
        return printf("\n");
    }
    return printf("%s\n", text);
}

static void vb_host_serial_flush(void)
{
    fflush(stdout);
}

static uint32_t vb_host_time_millis(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000ULL);
}

static uint64_t vb_host_time_micros(void)
{
    return (uint64_t)esp_timer_get_time();
}

static void vb_host_time_delay_ms(uint32_t ms)
{
    vTaskDelay(pdMS_TO_TICKS(ms));
}

static void vb_host_time_yield(void)
{
    taskYIELD();
}

static void *vb_host_heap_malloc(size_t size)
{
    return heap_caps_malloc(size, MALLOC_CAP_8BIT);
}

static void *vb_host_heap_calloc(size_t count, size_t size)
{
    return heap_caps_calloc(count, size, MALLOC_CAP_8BIT);
}

static void vb_host_heap_free(void *ptr)
{
    heap_caps_free(ptr);
}

static size_t vb_host_heap_free_size(void)
{
    return heap_caps_get_free_size(MALLOC_CAP_8BIT);
}

static size_t vb_host_heap_largest_free_block(void)
{
    return heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
}

static bool vb_host_file_path_allowed(const char *path)
{
    return path != NULL && strncmp(path, VB_MODULE_HOST_SD_ROOT, strlen(VB_MODULE_HOST_SD_ROOT)) == 0;
}

static FILE *vb_host_file_open(const char *path, const char *mode)
{
    if (!vb_host_file_path_allowed(path) || mode == NULL) {
        return NULL;
    }
    return fopen(path, mode);
}

static size_t vb_host_file_read(void *dest, size_t size, FILE *file)
{
    if (dest == NULL || file == NULL || size == 0) {
        return 0;
    }
    return fread(dest, 1, size, file);
}

static int vb_host_file_seek(FILE *file, long offset, int whence)
{
    if (file == NULL) {
        return -1;
    }
    return fseek(file, offset, whence);
}

static long vb_host_file_position(FILE *file)
{
    if (file == NULL) {
        return -1;
    }
    return ftell(file);
}

static long vb_host_file_size_bytes(FILE *file)
{
    if (file == NULL) {
        return -1;
    }

    long current = ftell(file);
    if (current < 0 || fseek(file, 0, SEEK_END) != 0) {
        return -1;
    }
    long size = ftell(file);
    if (fseek(file, current, SEEK_SET) != 0) {
        return -1;
    }
    return size;
}

static long vb_host_file_available(FILE *file)
{
    long size = vb_host_file_size_bytes(file);
    long current = vb_host_file_position(file);
    if (size < 0 || current < 0 || current > size) {
        return -1;
    }
    return size - current;
}

static int vb_host_file_close(FILE *file)
{
    if (file == NULL) {
        return -1;
    }
    return fclose(file);
}

static BaseType_t vb_host_task_create(TaskFunction_t entry,
                                      const char *name,
                                      uint32_t stack_depth,
                                      void *arg,
                                      UBaseType_t priority,
                                      TaskHandle_t *handle)
{
    if (entry == NULL || name == NULL || stack_depth == 0) {
        return pdFAIL;
    }
    return xTaskCreatePinnedToCore(entry, name, stack_depth, arg, priority, handle, tskNO_AFFINITY);
}

static void vb_host_task_remove(TaskHandle_t handle)
{
    vTaskDelete(handle);
}

static void vb_host_task_yield(void)
{
    taskYIELD();
}

static void vb_host_task_delay_ms(uint32_t ms)
{
    vTaskDelay(pdMS_TO_TICKS(ms));
}

static uint16_t vb_host_display_width(void)
{
    return VB_MODULE_HOST_DISPLAY_WIDTH;
}

static uint16_t vb_host_display_height(void)
{
    return VB_MODULE_HOST_DISPLAY_HEIGHT;
}

static int vb_host_display_acquire(const char *owner, vb_module_host_display_surface_t *surface)
{
    if (owner == NULL || owner[0] == '\0' || surface == NULL) {
        return -1;
    }
    if (s_display_owner != NULL) {
        return -1;
    }

    s_display_owner = owner;
    memset(surface, 0, sizeof(*surface));
    surface->owner = owner;
    surface->width = VB_MODULE_HOST_DISPLAY_WIDTH;
    surface->height = VB_MODULE_HOST_DISPLAY_HEIGHT;
    return 0;
}

static int vb_host_display_start_write(vb_module_host_display_surface_t *surface)
{
    if (surface == NULL || surface->owner == NULL || surface->owner != s_display_owner || surface->writing) {
        return -1;
    }
    surface->writing = true;
    return 0;
}

static int vb_host_display_push_image_dma(vb_module_host_display_surface_t *surface,
                                          uint16_t x,
                                          uint16_t y,
                                          uint16_t width,
                                          uint16_t height,
                                          const void *rgb565)
{
    if (surface == NULL || rgb565 == NULL || !surface->writing || surface->owner != s_display_owner) {
        return -1;
    }
    if (width == 0 || height == 0 || x + width > surface->width || y + height > surface->height) {
        return -1;
    }
    return vb_board_draw_rgb565(x, y, width, height, rgb565) == ESP_OK ? 0 : -1;
}

static int vb_host_display_end_write(vb_module_host_display_surface_t *surface)
{
    if (surface == NULL || surface->owner != s_display_owner || !surface->writing) {
        return -1;
    }
    surface->writing = false;
    return 0;
}

static void vb_host_display_release(vb_module_host_display_surface_t *surface)
{
    if (surface == NULL || surface->owner != s_display_owner) {
        return;
    }
    s_display_owner = NULL;
    memset(surface, 0, sizeof(*surface));
}

static int vb_host_lua_gettop(lua_State *L)
{
    return lua_gettop(L);
}

static void vb_host_lua_settop(lua_State *L, int index)
{
    lua_settop(L, index);
}

static void vb_host_lua_pushboolean(lua_State *L, int value)
{
    lua_pushboolean(L, value);
}

static void vb_host_lua_pushinteger(lua_State *L, lua_Integer value)
{
    lua_pushinteger(L, value);
}

static void vb_host_lua_pushstring(lua_State *L, const char *value)
{
    lua_pushstring(L, value);
}

static void vb_host_lua_setfield(lua_State *L, int index, const char *key)
{
    lua_setfield(L, index, key);
}

static lua_Integer vb_host_lua_checkinteger(lua_State *L, int arg)
{
    return luaL_checkinteger(L, arg);
}

static const char *vb_host_lua_checkstring(lua_State *L, int arg)
{
    return luaL_checkstring(L, arg);
}

static int vb_host_lua_error(lua_State *L, const char *message)
{
    return luaL_error(L, "%s", message ? message : "native module error");
}

void vb_module_host_api_init(vb_module_host_api_t *api)
{
    if (api == NULL) {
        return;
    }

    memset(api, 0, sizeof(*api));
    api->version = VB_MODULE_HOST_API_VERSION;
    api->serial.write = vb_host_serial_write;
    api->serial.print = vb_host_serial_print;
    api->serial.println = vb_host_serial_println;
    api->serial.flush = vb_host_serial_flush;
    api->time.millis = vb_host_time_millis;
    api->time.micros = vb_host_time_micros;
    api->time.delay_ms = vb_host_time_delay_ms;
    api->time.yield = vb_host_time_yield;
    api->heap.malloc = vb_host_heap_malloc;
    api->heap.calloc = vb_host_heap_calloc;
    api->heap.free = vb_host_heap_free;
    api->heap.free_size = vb_host_heap_free_size;
    api->heap.largest_free_block = vb_host_heap_largest_free_block;
    api->file.open = vb_host_file_open;
    api->file.read = vb_host_file_read;
    api->file.seek = vb_host_file_seek;
    api->file.position = vb_host_file_position;
    api->file.size_bytes = vb_host_file_size_bytes;
    api->file.available = vb_host_file_available;
    api->file.close = vb_host_file_close;
    api->task.create = vb_host_task_create;
    api->task.remove = vb_host_task_remove;
    api->task.yield = vb_host_task_yield;
    api->task.delay_ms = vb_host_task_delay_ms;
    api->display.width = vb_host_display_width;
    api->display.height = vb_host_display_height;
    api->display.acquire = vb_host_display_acquire;
    api->display.start_write = vb_host_display_start_write;
    api->display.push_image_dma = vb_host_display_push_image_dma;
    api->display.end_write = vb_host_display_end_write;
    api->display.release = vb_host_display_release;
    api->lua.gettop = vb_host_lua_gettop;
    api->lua.settop = vb_host_lua_settop;
    api->lua.pushboolean = vb_host_lua_pushboolean;
    api->lua.pushinteger = vb_host_lua_pushinteger;
    api->lua.pushstring = vb_host_lua_pushstring;
    api->lua.setfield = vb_host_lua_setfield;
    api->lua.checkinteger = vb_host_lua_checkinteger;
    api->lua.checkstring = vb_host_lua_checkstring;
    api->lua.error = vb_host_lua_error;
}
