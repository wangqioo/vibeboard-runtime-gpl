#include "lvgl_runtime_alloc.h"

#include "esp_heap_caps.h"

void *lvgl_runtime_alloc(size_t size)
{
    if (size == 0) {
        return NULL;
    }

    void *ptr = heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (ptr == NULL) {
        ptr = heap_caps_malloc(size, MALLOC_CAP_8BIT);
    }
    return ptr;
}

void lvgl_runtime_free(void *ptr)
{
    heap_caps_free(ptr);
}

void *lvgl_runtime_realloc(void *ptr, size_t new_size)
{
    if (new_size == 0) {
        heap_caps_free(ptr);
        return NULL;
    }

    if (ptr == NULL) {
        return lvgl_runtime_alloc(new_size);
    }

    void *new_ptr = heap_caps_realloc(ptr, new_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (new_ptr == NULL) {
        new_ptr = heap_caps_realloc(ptr, new_size, MALLOC_CAP_8BIT);
    }
    return new_ptr;
}
