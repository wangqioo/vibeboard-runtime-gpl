#include "lua_fluid.h"

#include <math.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "lauxlib.h"

#define VB_LUA_FLUID_META "vibeboard.fluid_native.ctx"
#define VB_FLUID_DEFAULT_PARTICLES 220
#define VB_FLUID_MAX_PARTICLES 512
#define VB_FLUID_DEFAULT_CNX 26
#define VB_FLUID_DEFAULT_CNY 17
#define VB_FLUID_MAX_CELLS 4096

typedef struct {
    int n;
    int cnx;
    int cny;
    int cell_count;
    int push_iter;
    float spacing;
    float radius;
    float dt;
    float bounce;
    float damping;
    float min_x;
    float min_y;
    float max_x;
    float max_y;
    float rest_density;
    uint32_t steps;
    uint32_t last_step_us;
    float *x;
    float *y;
    float *vx;
    float *vy;
    float *density;
    int *prefix;
    int *particle_cell;
    int *particle_id;
} vb_lua_fluid_ctx_t;

static const char *TAG = "lua_fluid";

static void *fluid_calloc(size_t count, size_t size)
{
    void *ptr = heap_caps_calloc(count, size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (ptr == NULL) {
        ptr = heap_caps_calloc(count, size, MALLOC_CAP_8BIT);
    }
    return ptr;
}

static void fluid_free(void *ptr)
{
    if (ptr != NULL) {
        heap_caps_free(ptr);
    }
}

static int table_int(lua_State *L, const char *key, int fallback)
{
    lua_getfield(L, 1, key);
    int value = lua_isnumber(L, -1) ? (int)lua_tointeger(L, -1) : fallback;
    lua_pop(L, 1);
    return value;
}

static float table_float(lua_State *L, const char *key, float fallback)
{
    lua_getfield(L, 1, key);
    float value = lua_isnumber(L, -1) ? (float)lua_tonumber(L, -1) : fallback;
    lua_pop(L, 1);
    return value;
}

static vb_lua_fluid_ctx_t *check_ctx(lua_State *L, int index)
{
    return (vb_lua_fluid_ctx_t *)luaL_checkudata(L, index, VB_LUA_FLUID_META);
}

static int clamp_int(int value, int lo, int hi)
{
    if (value < lo) {
        return lo;
    }
    if (value > hi) {
        return hi;
    }
    return value;
}

static float clamp_float(float value, float lo, float hi)
{
    if (value < lo) {
        return lo;
    }
    if (value > hi) {
        return hi;
    }
    return value;
}

static int cell_index(const vb_lua_fluid_ctx_t *ctx, int x, int y)
{
    return x * ctx->cny + y;
}

static void apply_bounds(vb_lua_fluid_ctx_t *ctx, int i)
{
    float x = ctx->x[i];
    float y = ctx->y[i];
    float vx = ctx->vx[i];
    float vy = ctx->vy[i];

    if (x < ctx->min_x) {
        x = ctx->min_x;
        vx *= ctx->bounce;
    }
    if (x > ctx->max_x) {
        x = ctx->max_x;
        vx *= ctx->bounce;
    }
    if (y < ctx->min_y) {
        y = ctx->min_y;
        vy *= ctx->bounce;
    }
    if (y > ctx->max_y) {
        y = ctx->max_y;
        vy *= ctx->bounce;
    }

    ctx->x[i] = x;
    ctx->y[i] = y;
    ctx->vx[i] = vx;
    ctx->vy[i] = vy;
}

static void rebuild_particle_grid(vb_lua_fluid_ctx_t *ctx)
{
    memset(ctx->prefix, 0, (size_t)(ctx->cell_count + 1) * sizeof(ctx->prefix[0]));

    float inv_spacing = 1.0f / ctx->spacing;
    for (int i = 0; i < ctx->n; i++) {
        int xi = clamp_int((int)floorf(ctx->x[i] * inv_spacing), 0, ctx->cnx - 1);
        int yi = clamp_int((int)floorf(ctx->y[i] * inv_spacing), 0, ctx->cny - 1);
        int cell = cell_index(ctx, xi, yi);
        ctx->particle_cell[i] = cell;
        ctx->prefix[cell]++;
    }

    int prefix = 0;
    for (int c = 0; c < ctx->cell_count; c++) {
        prefix += ctx->prefix[c];
        ctx->prefix[c] = prefix;
    }
    ctx->prefix[ctx->cell_count] = prefix;

    for (int i = 0; i < ctx->n; i++) {
        int cell = ctx->particle_cell[i];
        int slot = ctx->prefix[cell] - 1;
        ctx->prefix[cell] = slot;
        if (slot >= 0 && slot < ctx->n) {
            ctx->particle_id[slot] = i;
        }
    }
}

static void integrate_particles(vb_lua_fluid_ctx_t *ctx, float ax, float ay)
{
    float dt = ctx->dt;
    for (int i = 0; i < ctx->n; i++) {
        ctx->vx[i] = (ctx->vx[i] + ax * dt) * ctx->damping;
        ctx->vy[i] = (ctx->vy[i] + ay * dt) * ctx->damping;
        ctx->x[i] += ctx->vx[i] * dt;
        ctx->y[i] += ctx->vy[i] * dt;
        apply_bounds(ctx, i);
    }
}

static void push_particles_apart(vb_lua_fluid_ctx_t *ctx)
{
    const float inv_spacing = 1.0f / ctx->spacing;
    const float min_dist = 2.0f * ctx->radius;
    const float min_dist2 = min_dist * min_dist;

    for (int iter = 0; iter < ctx->push_iter; iter++) {
        for (int i = 0; i < ctx->n; i++) {
            float px = ctx->x[i];
            float py = ctx->y[i];
            int pxi = clamp_int((int)floorf(px * inv_spacing), 0, ctx->cnx - 1);
            int pyi = clamp_int((int)floorf(py * inv_spacing), 0, ctx->cny - 1);
            int x0 = pxi > 0 ? pxi - 1 : 0;
            int y0 = pyi > 0 ? pyi - 1 : 0;
            int x1 = pxi + 1 < ctx->cnx ? pxi + 1 : ctx->cnx - 1;
            int y1 = pyi + 1 < ctx->cny ? pyi + 1 : ctx->cny - 1;

            for (int gx = x0; gx <= x1; gx++) {
                for (int gy = y0; gy <= y1; gy++) {
                    int cell = cell_index(ctx, gx, gy);
                    int first = ctx->prefix[cell];
                    int last = ctx->prefix[cell + 1];
                    for (int slot = first; slot < last; slot++) {
                        int id = ctx->particle_id[slot];
                        if (id == i || id < 0 || id >= ctx->n) {
                            continue;
                        }

                        float dx = ctx->x[id] - px;
                        float dy = ctx->y[id] - py;
                        float d2 = dx * dx + dy * dy;
                        if (d2 <= 0.0f || d2 > min_dist2) {
                            continue;
                        }

                        float d = sqrtf(d2);
                        if (d <= 0.000001f || d >= min_dist) {
                            continue;
                        }
                        float s = 0.5f * (min_dist - d) / d;
                        float ox = dx * s;
                        float oy = dy * s;
                        ctx->x[i] -= ox;
                        ctx->y[i] -= oy;
                        ctx->x[id] += ox;
                        ctx->y[id] += oy;
                    }
                }
            }
        }
    }

    for (int i = 0; i < ctx->n; i++) {
        apply_bounds(ctx, i);
    }
}

static void splat_density(vb_lua_fluid_ctx_t *ctx)
{
    memset(ctx->density, 0, (size_t)ctx->cell_count * sizeof(ctx->density[0]));
    const float h = ctx->spacing;
    const float inv_h = 1.0f / h;
    const int max_x0 = ctx->cnx - 2;
    const int max_y0 = ctx->cny - 2;

    for (int i = 0; i < ctx->n; i++) {
        float xh = ctx->x[i] - 0.5f * h;
        float yh = ctx->y[i] - 0.5f * h;
        int x0 = clamp_int((int)floorf(xh * inv_h), 0, max_x0);
        int y0 = clamp_int((int)floorf(yh * inv_h), 0, max_y0);
        float tx = clamp_float((xh - (float)x0 * h) * inv_h, 0.0f, 1.0f);
        float ty = clamp_float((yh - (float)y0 * h) * inv_h, 0.0f, 1.0f);
        float sx = 1.0f - tx;
        float sy = 1.0f - ty;

        int nr0 = cell_index(ctx, x0, y0);
        int nr1 = cell_index(ctx, x0 + 1, y0);
        int nr2 = cell_index(ctx, x0 + 1, y0 + 1);
        int nr3 = cell_index(ctx, x0, y0 + 1);

        ctx->density[nr0] += sx * sy;
        ctx->density[nr1] += tx * sy;
        ctx->density[nr2] += tx * ty;
        ctx->density[nr3] += sx * ty;
    }

    if (ctx->rest_density <= 0.0f) {
        float sum = 0.0f;
        int count = 0;
        for (int x = 1; x < ctx->cnx - 1; x++) {
            for (int y = 1; y < ctx->cny - 1; y++) {
                int idx = cell_index(ctx, x, y);
                if (ctx->density[idx] > 0.0f) {
                    sum += ctx->density[idx];
                    count++;
                }
            }
        }
        if (count > 0) {
            ctx->rest_density = sum / (float)count;
        }
        if (ctx->rest_density <= 0.0f) {
            ctx->rest_density = 1.0f;
        }
    }
}

static void init_particles(vb_lua_fluid_ctx_t *ctx)
{
    float default_pos = ctx->spacing + ctx->radius;
    for (int i = 0; i < ctx->n; i++) {
        ctx->x[i] = default_pos;
        ctx->y[i] = default_pos;
        ctx->vx[i] = 0.0f;
        ctx->vy[i] = 0.0f;
        ctx->particle_cell[i] = 0;
        ctx->particle_id[i] = i;
    }

    float dx = 2.0f * ctx->radius;
    float dy = 0.86602540378f * dx;
    int p = 0;
    for (int x = 0; x < ctx->cnx && p < ctx->n; x++) {
        for (int y = 0; y < ctx->cny && p < ctx->n; y++) {
            float px = ctx->spacing + ctx->radius + dx * (float)x + ((y % 2) == 0 ? 0.0f : ctx->radius);
            float py = ctx->spacing + ctx->radius + dy * (float)y;
            if (px <= (float)(ctx->cnx - 1) * ctx->spacing - ctx->radius &&
                py <= (float)(ctx->cny - 1) * ctx->spacing - ctx->radius) {
                ctx->x[p] = px;
                ctx->y[p] = py;
                p++;
            }
        }
    }
    rebuild_particle_grid(ctx);
    splat_density(ctx);
}

static void free_ctx(vb_lua_fluid_ctx_t *ctx)
{
    if (ctx == NULL) {
        return;
    }
    fluid_free(ctx->x);
    fluid_free(ctx->y);
    fluid_free(ctx->vx);
    fluid_free(ctx->vy);
    fluid_free(ctx->density);
    fluid_free(ctx->prefix);
    fluid_free(ctx->particle_cell);
    fluid_free(ctx->particle_id);
    memset(ctx, 0, sizeof(*ctx));
}

static int fluid_gc(lua_State *L)
{
    vb_lua_fluid_ctx_t *ctx = check_ctx(L, 1);
    free_ctx(ctx);
    return 0;
}

static int fluid_step(lua_State *L)
{
    vb_lua_fluid_ctx_t *ctx = check_ctx(L, 1);
    float ax = (float)luaL_optnumber(L, 2, 0.0);
    float ay = (float)luaL_optnumber(L, 3, 16.0);
    int64_t start = esp_timer_get_time();

    integrate_particles(ctx, ax, ay);
    rebuild_particle_grid(ctx);
    push_particles_apart(ctx);
    rebuild_particle_grid(ctx);
    splat_density(ctx);

    int64_t elapsed = esp_timer_get_time() - start;
    ctx->last_step_us = elapsed > 0 ? (uint32_t)elapsed : 0;
    ctx->steps++;
    lua_pushinteger(L, (lua_Integer)ctx->last_step_us);
    return 1;
}

static int fluid_density(lua_State *L)
{
    vb_lua_fluid_ctx_t *ctx = check_ctx(L, 1);
    int lua_cell = (int)luaL_checkinteger(L, 2);
    int idx = lua_cell - 1;
    if (idx < 0 || idx >= ctx->cell_count) {
        lua_pushnumber(L, 0);
        return 1;
    }
    float rest = ctx->rest_density > 0.0f ? ctx->rest_density : 1.0f;
    lua_pushnumber(L, ctx->density[idx] / rest);
    return 1;
}

static int fluid_state(lua_State *L)
{
    vb_lua_fluid_ctx_t *ctx = check_ctx(L, 1);
    lua_newtable(L);
    lua_pushinteger(L, ctx->n);
    lua_setfield(L, -2, "particles");
    lua_pushinteger(L, ctx->cnx);
    lua_setfield(L, -2, "cnx");
    lua_pushinteger(L, ctx->cny);
    lua_setfield(L, -2, "cny");
    lua_pushinteger(L, ctx->push_iter);
    lua_setfield(L, -2, "push_iter");
    lua_pushinteger(L, (lua_Integer)ctx->steps);
    lua_setfield(L, -2, "steps");
    lua_pushinteger(L, (lua_Integer)ctx->last_step_us);
    lua_setfield(L, -2, "last_step_us");
    lua_pushnumber(L, ctx->rest_density);
    lua_setfield(L, -2, "rest_density");
    return 1;
}

static int fluid_create(lua_State *L)
{
    if (lua_gettop(L) >= 1) {
        luaL_checktype(L, 1, LUA_TTABLE);
    } else {
        lua_newtable(L);
    }

    int n = table_int(L, "particles", VB_FLUID_DEFAULT_PARTICLES);
    int cnx = table_int(L, "cnx", VB_FLUID_DEFAULT_CNX);
    int cny = table_int(L, "cny", VB_FLUID_DEFAULT_CNY);
    if (n < 1 || n > VB_FLUID_MAX_PARTICLES) {
        return luaL_error(L, "fluid_native particles out of range");
    }
    if (cnx < 4 || cny < 4 || cnx * cny > VB_FLUID_MAX_CELLS) {
        return luaL_error(L, "fluid_native grid out of range");
    }

    vb_lua_fluid_ctx_t *ctx = (vb_lua_fluid_ctx_t *)lua_newuserdata(L, sizeof(*ctx));
    memset(ctx, 0, sizeof(*ctx));
    luaL_getmetatable(L, VB_LUA_FLUID_META);
    lua_setmetatable(L, -2);

    ctx->n = n;
    ctx->cnx = cnx;
    ctx->cny = cny;
    ctx->cell_count = cnx * cny;
    ctx->push_iter = clamp_int(table_int(L, "push_iter", 2), 0, 6);
    ctx->spacing = table_float(L, "spacing", 0.045f);
    ctx->radius = table_float(L, "radius", 0.0155f);
    ctx->dt = table_float(L, "dt", 0.016f);
    ctx->bounce = table_float(L, "bounce", -0.9f);
    ctx->damping = table_float(L, "damping", 0.997f);
    if (ctx->spacing <= 0.0f || ctx->radius <= 0.0f || ctx->dt <= 0.0f) {
        free_ctx(ctx);
        return luaL_error(L, "fluid_native invalid dimensions");
    }

    ctx->min_x = ctx->spacing + ctx->radius;
    ctx->min_y = ctx->spacing + ctx->radius;
    ctx->max_x = (float)(ctx->cnx - 1) * ctx->spacing - ctx->radius;
    ctx->max_y = (float)(ctx->cny - 1) * ctx->spacing - ctx->radius;

    ctx->x = (float *)fluid_calloc((size_t)n, sizeof(float));
    ctx->y = (float *)fluid_calloc((size_t)n, sizeof(float));
    ctx->vx = (float *)fluid_calloc((size_t)n, sizeof(float));
    ctx->vy = (float *)fluid_calloc((size_t)n, sizeof(float));
    ctx->density = (float *)fluid_calloc((size_t)ctx->cell_count, sizeof(float));
    ctx->prefix = (int *)fluid_calloc((size_t)ctx->cell_count + 1, sizeof(int));
    ctx->particle_cell = (int *)fluid_calloc((size_t)n, sizeof(int));
    ctx->particle_id = (int *)fluid_calloc((size_t)n, sizeof(int));
    if (ctx->x == NULL || ctx->y == NULL || ctx->vx == NULL || ctx->vy == NULL ||
        ctx->density == NULL || ctx->prefix == NULL ||
        ctx->particle_cell == NULL || ctx->particle_id == NULL) {
        free_ctx(ctx);
        return luaL_error(L, "fluid_native allocation failed");
    }

    init_particles(ctx);
    ESP_LOGI(TAG, "fluid_native created: particles=%d grid=%dx%d", ctx->n, ctx->cnx, ctx->cny);
    return 1;
}

void vb_lua_fluid_register(lua_State *L)
{
    if (luaL_newmetatable(L, VB_LUA_FLUID_META)) {
        static const luaL_Reg methods[] = {
            {"step", fluid_step},
            {"density", fluid_density},
            {"state", fluid_state},
            {"__gc", fluid_gc},
            {NULL, NULL},
        };
        luaL_setfuncs(L, methods, 0);
        lua_pushvalue(L, -1);
        lua_setfield(L, -2, "__index");
    }
    lua_pop(L, 1);

    static const luaL_Reg functions[] = {
        {"create", fluid_create},
        {NULL, NULL},
    };
    luaL_newlib(L, functions);
    lua_setglobal(L, "fluid_native");
}
