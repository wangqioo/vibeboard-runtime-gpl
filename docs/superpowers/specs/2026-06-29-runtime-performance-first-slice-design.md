# Runtime Performance First Slice Design

Date: 2026-06-29

## Goal

Start the post-v0.1 migrated-app performance work with a small, verifiable slice. The goal is to make the current bottlenecks observable and make callback failures safer before changing the Runtime concurrency model.

This slice is intentionally not the full async HTTP rewrite.

## Problem

Some migrated apps feel slower or more stuttery than their upstream versions. The cause should not be assumed to be the Runtime + Web replacement architecture, because upstream Cubic/HoloCubic also supports Runtime + SD/Lua apps with HTTP/WebUI replacement.

The current likely causes are implementation details:

- Lua `http.get` / `http.post` callback-style calls still run `esp_http_client_perform()` synchronously on the Lua app thread.
- Heavy resource apps do not expose consistent first-paint, resource-load, timer, and stop-latency metrics.
- HTTP callback errors are called through `lua_call`, so a callback bug can interrupt the app path without a clear app-level diagnostic.
- Existing app metrics are useful but app-specific, making cross-app comparison harder.

## Scope

This first slice will:

- Add tests that lock the current Lua HTTP behavior:
  - callback-style HTTP calls still perform synchronously in this slice;
  - callback invocation must use a protected Lua call path;
  - callback failure must be reportable instead of tearing down the app silently.
- Change `lua_http` callback invocation from raw `lua_call` to protected `lua_pcall`.
- Add a small Runtime performance metrics convention for migrated apps:
  - `perf_first_paint_ms`
  - `perf_ready_ms`
  - `perf_resource_ms`
  - `perf_http_ms`
  - `perf_timer_max_ms`
  - `perf_stop_requested`
  - `perf_last_error`
- Update representative migrated apps to start emitting the convention where they already write `metrics.json`.
- Update docs so the next async HTTP slice has a clear before/after baseline.

## Out Of Scope

This slice will not:

- Move HTTP work to a worker task.
- Add a Lua cross-thread callback queue.
- Change the public `http.get` / `http.post` API shape.
- Claim that performance is fixed.
- Add physical visual QA or long-soak evidence.

## Architecture

### Lua HTTP Safety

`lua_http.c` keeps the current synchronous request flow:

```text
Lua app thread
  -> http.get/post
  -> esp_http_client_perform()
  -> protected callback dispatch
  -> return to app
```

Only callback dispatch changes. The callback is called with `lua_pcall`, and failures are turned into diagnostics that can be surfaced through app metrics or log output.

This keeps the first slice low-risk. The later async design can replace the request execution path without also changing error handling semantics.

### Performance Metrics Convention

Apps that already write `metrics.json` should add a `perf_*` block of flat fields. Flat keys are preferred because the current smoke tooling already supports flat metrics assertions.

Recommended app instrumentation:

- capture `APP.started_ms` as early as possible;
- set `perf_first_paint_ms` after the first visible LVGL screen or label is created;
- set `perf_ready_ms` when the app can accept input or background refresh;
- accumulate `perf_resource_ms` around image/font/GIF/resource loading;
- accumulate `perf_http_ms` around network calls;
- update `perf_timer_max_ms` with the slowest timer callback;
- set `perf_stop_requested=true` when `app.exiting()` first becomes true;
- set `perf_last_error` for recoverable callback/resource errors.

The first representative apps should be:

- `weather`
- `photos`
- `voice_ai`

`nesgame` can follow in the next slice because its performance profile includes native tasks and long-running frame metrics.

## Testing

Use TDD:

1. Add a failing firmware static test that rejects raw `lua_call` in HTTP callback dispatch and expects `lua_pcall`.
2. Add static checks that `lua_http.c` still contains synchronous `esp_http_client_perform()` in this slice, so the docs do not accidentally claim async HTTP.
3. Add validator/static checks that representative app metrics include the `perf_*` fields.
4. Run focused tests:
   - `npm run test:firmware-static -- --test-name-pattern "HTTP|performance|metrics"`
   - `npm run test:validator`
   - `npm run package:app -- apps/weather`
   - `npm run package:app -- apps/photos`
   - `npm run package:app -- apps/voice_ai`
   - `git diff --check`
5. If hardware is available, run one lifecycle smoke for each representative app and record before/after metrics.

## Follow-Up Slice

The next slice should design and implement true async HTTP:

```text
Lua app thread
  -> enqueue HTTP request
  -> return immediately
HTTP worker task
  -> esp_http_client_perform()
  -> enqueue callback result
Lua app loop
  -> dispatch callback on Lua thread
```

That follow-up must define pending-request cancellation on app stop and maximum memory per active app.
