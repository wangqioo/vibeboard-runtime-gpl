#pragma once

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

void *lvgl_runtime_alloc(size_t size);
void lvgl_runtime_free(void *ptr);
void *lvgl_runtime_realloc(void *ptr, size_t new_size);

#ifdef __cplusplus
}
#endif
