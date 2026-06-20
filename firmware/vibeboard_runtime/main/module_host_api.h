#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

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
    uint32_t version;
    vb_module_host_serial_api_t serial;
    vb_module_host_time_api_t time;
    vb_module_host_heap_api_t heap;
    vb_module_host_file_api_t file;
} vb_module_host_api_t;

void vb_module_host_api_init(vb_module_host_api_t *api);

#ifdef __cplusplus
}
#endif
