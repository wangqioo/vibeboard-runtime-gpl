#include "module_host_api.h"

#include <string.h>

#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define VB_MODULE_HOST_API_VERSION 1
#define VB_MODULE_HOST_SD_ROOT "/sdcard"

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
}
