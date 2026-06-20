#include "nes_host_v1_shim.h"

#include <stdio.h>
#include <string.h>

static vb_module_host_api_t s_source;
static vb_module_host_display_surface_t s_display_surface;

static int32_t shim_serial_write(const void *data, size_t size)
{
    if (s_source.serial.write == NULL) {
        return MODULE_ERR_UNSUPPORTED;
    }
    return (int32_t)s_source.serial.write(data, size);
}

static int32_t shim_serial_print(const char *text)
{
    if (s_source.serial.print == NULL) {
        return MODULE_ERR_UNSUPPORTED;
    }
    return (int32_t)s_source.serial.print(text);
}

static int32_t shim_serial_println(const char *text)
{
    if (s_source.serial.println == NULL) {
        return MODULE_ERR_UNSUPPORTED;
    }
    return (int32_t)s_source.serial.println(text);
}

static int32_t shim_sd_begin(void)
{
    return MODULE_OK;
}

static int32_t shim_sd_mounted(void)
{
    return 1;
}

static const char *shim_sd_mount_point(void)
{
    return "/sdcard";
}

static int32_t shim_sd_open(const char *path, uint32_t mode, void **out_file)
{
    if (path == NULL || out_file == NULL || (mode & MODULE_FILE_READ) == 0 || s_source.file.open == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }

    FILE *file = s_source.file.open(path, "rb");
    if (file == NULL) {
        return MODULE_ERR_NOT_FOUND;
    }

    *out_file = file;
    return MODULE_OK;
}

static int32_t shim_unsupported_path(const char *path)
{
    (void)path;
    return MODULE_ERR_UNSUPPORTED;
}

static int32_t shim_sd_rename(const char *from, const char *to)
{
    (void)from;
    (void)to;
    return MODULE_ERR_UNSUPPORTED;
}

static int32_t shim_file_close(void *file)
{
    if (file == NULL || s_source.file.close == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }
    return s_source.file.close((FILE *)file) == 0 ? MODULE_OK : MODULE_ERR_IO;
}

static int32_t shim_file_read(void *file, void *buf, size_t len, size_t *out_read)
{
    if (file == NULL || buf == NULL || s_source.file.read == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }
    size_t read = s_source.file.read(buf, len, (FILE *)file);
    if (out_read != NULL) {
        *out_read = read;
    }
    return read > 0 || len == 0 ? MODULE_OK : MODULE_ERR_IO;
}

static int32_t shim_file_available(void *file, size_t *out_available)
{
    if (file == NULL || out_available == NULL || s_source.file.available == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }
    long available = s_source.file.available((FILE *)file);
    if (available < 0) {
        return MODULE_ERR_IO;
    }
    *out_available = (size_t)available;
    return MODULE_OK;
}

static int32_t shim_file_seek(void *file, int64_t offset, uint32_t mode)
{
    if (file == NULL || s_source.file.seek == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }

    int whence = SEEK_SET;
    if (mode == MODULE_SEEK_CUR) {
        whence = SEEK_CUR;
    } else if (mode == MODULE_SEEK_END) {
        whence = SEEK_END;
    }

    return s_source.file.seek((FILE *)file, (long)offset, whence) == 0 ? MODULE_OK : MODULE_ERR_IO;
}

static int32_t shim_file_position(void *file, uint64_t *out_pos)
{
    if (file == NULL || out_pos == NULL || s_source.file.position == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }
    long position = s_source.file.position((FILE *)file);
    if (position < 0) {
        return MODULE_ERR_IO;
    }
    *out_pos = (uint64_t)position;
    return MODULE_OK;
}

static int32_t shim_file_size_bytes(void *file, uint64_t *out_size)
{
    if (file == NULL || out_size == NULL || s_source.file.size_bytes == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }
    long size = s_source.file.size_bytes((FILE *)file);
    if (size < 0) {
        return MODULE_ERR_IO;
    }
    *out_size = (uint64_t)size;
    return MODULE_OK;
}

static int32_t shim_file_unsupported(void *file)
{
    (void)file;
    return MODULE_ERR_UNSUPPORTED;
}

static int32_t shim_file_write(void *file, const void *buf, size_t len, size_t *out_written)
{
    (void)file;
    (void)buf;
    (void)len;
    if (out_written != NULL) {
        *out_written = 0;
    }
    return MODULE_ERR_UNSUPPORTED;
}

static void *shim_heap_malloc(size_t size, uint32_t caps)
{
    (void)caps;
    return s_source.heap.malloc != NULL ? s_source.heap.malloc(size) : NULL;
}

static void *shim_heap_calloc(size_t count, size_t size, uint32_t caps)
{
    (void)caps;
    return s_source.heap.calloc != NULL ? s_source.heap.calloc(count, size) : NULL;
}

static void *shim_heap_realloc(void *ptr, size_t size, uint32_t caps)
{
    (void)ptr;
    (void)size;
    (void)caps;
    return NULL;
}

static void shim_heap_free(void *ptr)
{
    if (s_source.heap.free != NULL) {
        s_source.heap.free(ptr);
    }
}

static size_t shim_heap_free_size(uint32_t caps)
{
    (void)caps;
    return s_source.heap.free_size != NULL ? s_source.heap.free_size() : 0;
}

static size_t shim_heap_largest_free_block(uint32_t caps)
{
    (void)caps;
    return s_source.heap.largest_free_block != NULL ? s_source.heap.largest_free_block() : 0;
}

static int32_t shim_display_width(void)
{
    return s_source.display.width != NULL ? s_source.display.width() : 0;
}

static int32_t shim_display_height(void)
{
    return s_source.display.height != NULL ? s_source.display.height() : 0;
}

static int32_t shim_display_get_caps(module_display_caps_t *out_caps)
{
    if (out_caps == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }
    memset(out_caps, 0, sizeof(*out_caps));
    out_caps->size = sizeof(*out_caps);
    out_caps->width = (uint16_t)shim_display_width();
    out_caps->height = (uint16_t)shim_display_height();
    out_caps->pixel_formats = MODULE_PIXEL_RGB565;
    return MODULE_OK;
}

static int32_t shim_display_acquire(const char *owner, const module_display_desc_t *desc, void **out_surface)
{
    (void)desc;
    if (out_surface == NULL || s_source.display.acquire == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }
    int err = s_source.display.acquire(owner, &s_display_surface);
    if (err != 0) {
        return MODULE_ERR_BUSY;
    }
    *out_surface = &s_display_surface;
    return MODULE_OK;
}

static int32_t shim_display_release(void *surface)
{
    if (surface == NULL || s_source.display.release == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }
    s_source.display.release((vb_module_host_display_surface_t *)surface);
    return MODULE_OK;
}

static int32_t shim_display_start_write(void *surface)
{
    if (surface == NULL || s_source.display.start_write == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }
    return s_source.display.start_write((vb_module_host_display_surface_t *)surface) == 0 ? MODULE_OK : MODULE_ERR_FAILED;
}

static int32_t shim_display_push_image_dma(void *surface, int16_t x, int16_t y, uint16_t w, uint16_t h, const uint16_t *pixels)
{
    if (surface == NULL || pixels == NULL || s_source.display.push_image_dma == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }
    int err = s_source.display.push_image_dma((vb_module_host_display_surface_t *)surface, x, y, w, h, pixels);
    return err == 0 ? MODULE_OK : MODULE_ERR_UNSUPPORTED;
}

static int32_t shim_display_end_write(void *surface)
{
    if (surface == NULL || s_source.display.end_write == NULL) {
        return MODULE_ERR_INVALID_ARG;
    }
    return s_source.display.end_write((vb_module_host_display_surface_t *)surface) == 0 ? MODULE_OK : MODULE_ERR_FAILED;
}

static int32_t shim_display_fill_screen(void *surface, uint16_t color)
{
    (void)surface;
    (void)color;
    return MODULE_ERR_UNSUPPORTED;
}

static int32_t shim_display_set_addr_window(void *surface, int32_t x, int32_t y, int32_t w, int32_t h)
{
    (void)surface;
    (void)x;
    (void)y;
    (void)w;
    (void)h;
    return MODULE_ERR_UNSUPPORTED;
}

static int32_t shim_display_push_pixels_dma(void *surface, const uint16_t *pixels, size_t len)
{
    (void)surface;
    (void)pixels;
    (void)len;
    return MODULE_ERR_UNSUPPORTED;
}

static int32_t shim_audio_begin(const module_audio_desc_t *desc, void **out_stream)
{
    (void)desc;
    (void)out_stream;
    return MODULE_ERR_UNSUPPORTED;
}

static int32_t shim_audio_write(void *stream, const void *samples, size_t bytes, size_t *out_written)
{
    (void)stream;
    (void)samples;
    (void)bytes;
    if (out_written != NULL) {
        *out_written = 0;
    }
    return MODULE_ERR_UNSUPPORTED;
}

static int32_t shim_audio_available(void *stream, size_t *out_bytes)
{
    (void)stream;
    if (out_bytes != NULL) {
        *out_bytes = 0;
    }
    return MODULE_ERR_UNSUPPORTED;
}

static int32_t shim_audio_end(void *stream)
{
    (void)stream;
    return MODULE_ERR_UNSUPPORTED;
}

void vb_nes_host_v1_shim_init(module_host_api_v1 *host, const vb_module_host_api_t *source)
{
    if (host == NULL || source == NULL) {
        return;
    }

    memset(host, 0, sizeof(*host));
    s_source = *source;

    host->abi_version = MODULE_ABI_VERSION;
    host->size = sizeof(*host);

    host->serial.size = sizeof(host->serial);
    host->serial.write = shim_serial_write;
    host->serial.print = shim_serial_print;
    host->serial.println = shim_serial_println;
    host->serial.flush = source->serial.flush;

    host->sd.size = sizeof(host->sd);
    host->sd.begin = shim_sd_begin;
    host->sd.mounted = shim_sd_mounted;
    host->sd.mount_point = shim_sd_mount_point;
    host->sd.exists = shim_unsupported_path;
    host->sd.mkdir = shim_unsupported_path;
    host->sd.remove = shim_unsupported_path;
    host->sd.rename = shim_sd_rename;
    host->sd.open = shim_sd_open;

    host->file.size = sizeof(host->file);
    host->file.close = shim_file_close;
    host->file.available = shim_file_available;
    host->file.read = shim_file_read;
    host->file.write = shim_file_write;
    host->file.seek = shim_file_seek;
    host->file.position = shim_file_position;
    host->file.size_bytes = shim_file_size_bytes;
    host->file.flush = shim_file_unsupported;
    host->file.is_directory = NULL;

    host->display.size = sizeof(host->display);
    host->display.width = shim_display_width;
    host->display.height = shim_display_height;
    host->display.get_caps = shim_display_get_caps;
    host->display.acquire = shim_display_acquire;
    host->display.release = shim_display_release;
    host->display.startWrite = shim_display_start_write;
    host->display.pushImageDMA = shim_display_push_image_dma;
    host->display.endWrite = shim_display_end_write;
    host->display.fillScreen = shim_display_fill_screen;
    host->display.setAddrWindow = shim_display_set_addr_window;
    host->display.pushPixelsDMA = shim_display_push_pixels_dma;

    host->audio.size = sizeof(host->audio);
    host->audio.begin = shim_audio_begin;
    host->audio.write = shim_audio_write;
    host->audio.available = shim_audio_available;
    host->audio.end = shim_audio_end;

    host->time.size = sizeof(host->time);
    host->time.millis = source->time.millis;
    host->time.micros = source->time.micros;
    host->time.delay = source->time.delay_ms;
    host->time.yield = source->time.yield;

    host->heap.size = sizeof(host->heap);
    host->heap.malloc = shim_heap_malloc;
    host->heap.calloc = shim_heap_calloc;
    host->heap.realloc = shim_heap_realloc;
    host->heap.free = shim_heap_free;
    host->heap.free_size = shim_heap_free_size;
    host->heap.largest_free_block = shim_heap_largest_free_block;

    host->task.size = sizeof(host->task);
    host->task.yield = source->task.yield;
    host->task.delay = source->task.delay_ms;
}
