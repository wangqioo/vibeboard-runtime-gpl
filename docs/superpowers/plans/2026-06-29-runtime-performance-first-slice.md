# Runtime Performance First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first post-v0.1 performance instrumentation slice for migrated apps and make Lua HTTP callback failures protected.

**Architecture:** Keep Lua HTTP request execution synchronous in this slice, but make callback dispatch use `lua_pcall` and expose callback failures as diagnostics. Add flat `perf_*` metrics to representative migrated apps so later async HTTP and resource-loading work has a before/after baseline.

**Tech Stack:** ESP-IDF C firmware, Lua apps, Node.js `node:test` static checks, existing app packager and validator.

---

## File Structure

- Modify `tools/firmware-static-check/test.mjs`: add RED/GREEN static guardrails for Lua HTTP callback safety, intentional synchronous HTTP behavior, and `perf_*` metrics in representative apps.
- Modify `firmware/vibeboard_runtime/main/lua_http.c`: replace raw callback `lua_call` with protected `lua_pcall` and log/report callback failures.
- Modify `apps/weather/main.lua`: add `perf_*` state fields and update `write_metrics()` around boot/resource/HTTP paths.
- Modify `apps/photos/main.lua`: add `perf_*` fields around UI first paint, image scanning/loading, timer max duration, and stop request.
- Modify `apps/voice_ai/main.lua`: add `perf_*` fields around boot readiness, GIF/font/resource work, bridge HTTP calls, timer/polling, and stop request.
- Modify `docs/development-plan.md` and `docs/post-v0.1-backlog.md`: record that first-slice metrics exist but true async HTTP remains future work.

## Task 1: Static RED For HTTP Callback Safety And Sync Baseline

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`
- Read: `firmware/vibeboard_runtime/main/lua_http.c`

- [ ] **Step 1: Add failing static test for protected HTTP callbacks**

Insert this test near the existing HTTP module checks, after the test that registers WiFi/HTTP/sjson/time modules:

```js
  it("keeps Lua HTTP callback dispatch protected while request execution is still synchronous", () => {
    const httpSource = readRequired(luaHttpSourcePath);

    assert.match(httpSource, /static void call_callback/);
    assert.match(httpSource, /lua_pcall\(L,\s*2,\s*0,\s*0\)/);
    assert.match(httpSource, /ESP_LOGW\(TAG,\s*"http callback failed:/);

    const callbackBody = httpSource.match(/static void call_callback\([\s\S]*?\n\}/);
    assert.ok(callbackBody, "call_callback body is present");
    assert.doesNotMatch(callbackBody[0], /lua_call\(L,\s*2,\s*0\)/);

    assert.match(httpSource, /esp_http_client_perform\(client\)/);
    assert.doesNotMatch(httpSource, /xTaskCreate/);
  });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test:firmware-static -- --test-name-pattern "Lua HTTP callback"
```

Expected: FAIL because `lua_http.c` still uses `lua_call(L, 2, 0)` and lacks the HTTP callback failure log.

## Task 2: Make Lua HTTP Callback Dispatch Protected

**Files:**
- Modify: `firmware/vibeboard_runtime/main/lua_http.c`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add ESP logging include and tag**

In `firmware/vibeboard_runtime/main/lua_http.c`, add the log include and tag near the existing includes/defines:

```c
#include "esp_log.h"
```

```c
static const char *TAG = "lua_http";
```

- [ ] **Step 2: Replace raw callback call with protected call**

Change `call_callback` from:

```c
    lua_call(L, 2, 0);
```

to:

```c
    if (lua_pcall(L, 2, 0, 0) != LUA_OK) {
        const char *message = lua_tostring(L, -1);
        ESP_LOGW(TAG, "http callback failed: %s", message != NULL ? message : "unknown error");
        lua_pop(L, 1);
    }
```

Do not change `esp_http_client_perform(client)` in this task. The request path remains synchronous by design.

- [ ] **Step 3: Run focused GREEN test**

Run:

```bash
npm run test:firmware-static -- --test-name-pattern "Lua HTTP callback"
```

Expected: PASS.

- [ ] **Step 4: Commit HTTP callback safety**

Run:

```bash
git add firmware/vibeboard_runtime/main/lua_http.c tools/firmware-static-check/test.mjs
git commit -m "fix: protect lua http callbacks"
```

## Task 3: Static RED For Representative `perf_*` Metrics

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`
- Read: `apps/weather/main.lua`
- Read: `apps/photos/main.lua`
- Read: `apps/voice_ai/main.lua`

- [ ] **Step 1: Add failing static test for migrated app performance metrics**

Insert this test near the migrated app runtime gap checks:

```js
  it("exposes first-slice migrated app performance metrics", () => {
    const weather = readRequired(weatherSourcePath);
    const photos = readRequired(photosSourcePath);
    const voiceAi = readRequired(voiceAiSourcePath);

    for (const [name, source] of [
      ["weather", weather],
      ["photos", photos],
      ["voice_ai", voiceAi],
    ]) {
      assert.match(source, /perf_first_paint_ms/, `${name} exposes first paint metric`);
      assert.match(source, /perf_ready_ms/, `${name} exposes ready metric`);
      assert.match(source, /perf_resource_ms/, `${name} exposes resource metric`);
      assert.match(source, /perf_http_ms/, `${name} exposes HTTP metric`);
      assert.match(source, /perf_timer_max_ms/, `${name} exposes timer max metric`);
      assert.match(source, /perf_stop_requested/, `${name} exposes stop metric`);
      assert.match(source, /perf_last_error/, `${name} exposes performance error metric`);
      assert.match(source, /local function mark_perf_timer/, `${name} tracks timer callback duration`);
    }

    assert.match(weather, /APP\.perf\.started_ms\s*=\s*now_ms\(\)/);
    assert.match(photos, /APP\.perf\.started_ms\s*=\s*now_ms\(\)/);
    assert.match(voiceAi, /APP\.perf\.started_ms\s*=\s*now_ms\(\)/);
  });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test:firmware-static -- --test-name-pattern "performance metrics"
```

Expected: FAIL because the three apps do not yet expose the full `perf_*` convention.

## Task 4: Add `perf_*` Metrics To Photos

**Files:**
- Modify: `apps/photos/main.lua`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add clock and perf state**

After `local APP = PHOTOS_APP`, add:

```lua
local function now_ms()
  if millis then
    local ok, value = pcall(millis)
    if ok and type(value) == "number" then return value end
  end
  if tmr and tmr.now then
    local ok, value = pcall(function() return tmr.now() end)
    if ok and type(value) == "number" then return math.floor(value / 1000) end
  end
  return 0
end

APP.perf = {
  started_ms = now_ms(),
  first_paint_ms = 0,
  ready_ms = 0,
  resource_ms = 0,
  http_ms = 0,
  timer_max_ms = 0,
  stop_requested = false,
  last_error = "",
}

APP.perf.started_ms = now_ms()

local function perf_elapsed()
  local started = APP.perf.started_ms or 0
  local now = now_ms()
  if started <= 0 or now <= started then return 0 end
  return now - started
end

local function mark_perf_timer(start_ms)
  local elapsed = now_ms() - (start_ms or 0)
  if elapsed > (APP.perf.timer_max_ms or 0) then
    APP.perf.timer_max_ms = elapsed
  end
end
```

- [ ] **Step 2: Add perf fields to `write_metrics()`**

Append these fields before the final `"}"` in the JSON body:

```lua
    .. ',"perf_first_paint_ms":' .. tostring(APP.perf.first_paint_ms or 0)
    .. ',"perf_ready_ms":' .. tostring(APP.perf.ready_ms or 0)
    .. ',"perf_resource_ms":' .. tostring(APP.perf.resource_ms or 0)
    .. ',"perf_http_ms":' .. tostring(APP.perf.http_ms or 0)
    .. ',"perf_timer_max_ms":' .. tostring(APP.perf.timer_max_ms or 0)
    .. ',"perf_stop_requested":' .. tostring(APP.perf.stop_requested == true)
    .. ',"perf_last_error":"' .. json_escape(APP.perf.last_error) .. '"'
```

- [ ] **Step 3: Instrument image scan and first paint**

In `draw_ui()`, wrap `scan_images()`:

```lua
  local resource_start = now_ms()
  APP.images = scan_images()
  APP.perf.resource_ms = (APP.perf.resource_ms or 0) + math.max(0, now_ms() - resource_start)
```

After `APP.photos_ready = true`, add:

```lua
  if (APP.perf.first_paint_ms or 0) == 0 then
    APP.perf.first_paint_ms = perf_elapsed()
  end
  APP.perf.ready_ms = perf_elapsed()
```

- [ ] **Step 4: Instrument timer and stop**

At the start of `APP.stop`, add:

```lua
  APP.perf.stop_requested = true
```

Inside the timer callback, first line:

```lua
    local tick_start = now_ms()
```

Before each return path in the timer callback, call:

```lua
    mark_perf_timer(tick_start)
```

For the `app.exiting()` branch, set:

```lua
      APP.perf.stop_requested = true
```

- [ ] **Step 5: Run focused metric test**

Run:

```bash
npm run test:firmware-static -- --test-name-pattern "performance metrics"
```

Expected: still FAIL because weather and voice_ai are not done yet, but photos-related assertions should no longer be the failing reason.

## Task 5: Add `perf_*` Metrics To Weather

**Files:**
- Modify: `apps/weather/main.lua`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add perf state after `APP.state`**

After the `APP.state = { ... }` block, add:

```lua
    APP.perf = {
    started_ms = 0,
    first_paint_ms = 0,
    ready_ms = 0,
    resource_ms = 0,
    http_ms = 0,
    timer_max_ms = 0,
    stop_requested = false,
    last_error = "",
    }
```

After `local function now_ms()` is available in the file, add:

```lua
    APP.perf.started_ms = now_ms()

    local function perf_elapsed()
    local started = APP.perf.started_ms or 0
    local now = now_ms()
    if started <= 0 or now <= started then return 0 end
    return now - started
    end

    local function mark_perf_timer(start_ms)
    local elapsed = now_ms() - (start_ms or 0)
    if elapsed > (APP.perf.timer_max_ms or 0) then
        APP.perf.timer_max_ms = elapsed
    end
    end
```

- [ ] **Step 2: Add perf fields to `write_metrics()`**

Before the final closing brace in the JSON body, add:

```lua
        .. ",\"perf_first_paint_ms\":" .. tostring(APP.perf.first_paint_ms or 0)
        .. ",\"perf_ready_ms\":" .. tostring(APP.perf.ready_ms or 0)
        .. ",\"perf_resource_ms\":" .. tostring(APP.perf.resource_ms or 0)
        .. ",\"perf_http_ms\":" .. tostring(APP.perf.http_ms or 0)
        .. ",\"perf_timer_max_ms\":" .. tostring(APP.perf.timer_max_ms or 0)
        .. ",\"perf_stop_requested\":" .. json_bool(APP.perf.stop_requested)
        .. ",\"perf_last_error\":" .. json_string(APP.perf.last_error or "")
```

- [ ] **Step 3: Instrument UI/resource stages**

In `stage_full_ui()`, wrap `init_ui()` with:

```lua
    local stage_start = now_ms()
    init_ui()
    APP.perf.resource_ms = (APP.perf.resource_ms or 0) + math.max(0, now_ms() - stage_start)
    if (APP.perf.first_paint_ms or 0) == 0 then
        APP.perf.first_paint_ms = perf_elapsed()
    end
```

In `stage_fonts()` and `stage_assets()`, wrap `init_fonts()` / `lazy_load_visual_assets()` with a `stage_start` and add elapsed time to `APP.perf.resource_ms`.

When `APP.state.assets_ready = true`, set:

```lua
    APP.perf.ready_ms = perf_elapsed()
```

- [ ] **Step 4: Instrument HTTP and timer callbacks**

In each weather HTTP request function, set a local start time before calling `http.cubicserver.get(...)`:

```lua
    local http_start = now_ms()
```

At the start of the HTTP callback, add:

```lua
    APP.perf.http_ms = (APP.perf.http_ms or 0) + math.max(0, now_ms() - http_start)
```

At the start of timer callbacks in `start_timers()`, capture `local tick_start = now_ms()` and call `mark_perf_timer(tick_start)` before returning.

When `maybe_stop_for_exit()` or `APP.stop(...)` observes exit, set:

```lua
    APP.perf.stop_requested = true
```

- [ ] **Step 5: Run focused metric test**

Run:

```bash
npm run test:firmware-static -- --test-name-pattern "performance metrics"
```

Expected: still FAIL because voice_ai is not done yet, but weather and photos assertions should pass.

## Task 6: Add `perf_*` Metrics To Voice AI

**Files:**
- Modify: `apps/voice_ai/main.lua`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add perf state after `APP.state`**

After `APP.state = { ... }`, add:

```lua
APP.perf = {
  started_ms = 0,
  first_paint_ms = 0,
  ready_ms = 0,
  resource_ms = 0,
  http_ms = 0,
  timer_max_ms = 0,
  stop_requested = false,
  last_error = "",
}
```

After `now_ms()` is defined, add:

```lua
APP.perf.started_ms = now_ms()

local function perf_elapsed()
  local started = APP.perf.started_ms or 0
  local now = now_ms()
  if started <= 0 or now <= started then return 0 end
  return now - started
end

local function mark_perf_timer(start_ms)
  local elapsed = now_ms() - (start_ms or 0)
  if elapsed > (APP.perf.timer_max_ms or 0) then
    APP.perf.timer_max_ms = elapsed
  end
end
```

- [ ] **Step 2: Add perf fields to `write_metrics()`**

Append these fields before the final `"metrics_error"` field or immediately after it:

```lua
    .. ",\"perf_first_paint_ms\":" .. tostring(APP.perf.first_paint_ms or 0)
    .. ",\"perf_ready_ms\":" .. tostring(APP.perf.ready_ms or 0)
    .. ",\"perf_resource_ms\":" .. tostring(APP.perf.resource_ms or 0)
    .. ",\"perf_http_ms\":" .. tostring(APP.perf.http_ms or 0)
    .. ",\"perf_timer_max_ms\":" .. tostring(APP.perf.timer_max_ms or 0)
    .. ",\"perf_stop_requested\":" .. tostring(APP.perf.stop_requested == true)
    .. ",\"perf_last_error\":\"" .. json_escape(APP.perf.last_error) .. "\""
```

- [ ] **Step 3: Instrument boot and resources**

In `build_ui()` or the first function that creates the visible root UI, capture a resource start time around LVGL/GIF/font work:

```lua
  local resource_start = now_ms()
```

After the first visible UI is created, set:

```lua
  if (APP.perf.first_paint_ms or 0) == 0 then
    APP.perf.first_paint_ms = perf_elapsed()
  end
  APP.perf.resource_ms = (APP.perf.resource_ms or 0) + math.max(0, now_ms() - resource_start)
```

When `finish_boot()` sets `init_stage` to `"ready"`, add:

```lua
  APP.perf.ready_ms = perf_elapsed()
```

- [ ] **Step 4: Instrument HTTP calls and timers**

In `submit_audio(raw)`, before `http.post(...)`, add:

```lua
  local http_start = now_ms()
```

At the start of the `http.post` callback, add:

```lua
    APP.perf.http_ms = (APP.perf.http_ms or 0) + math.max(0, now_ms() - http_start)
```

For `http.get` polling callbacks, use the same pattern around each `http.get(...)`.

At the start/end of recurring timer callbacks, capture `tick_start` and call `mark_perf_timer(tick_start)`.

In `APP.stop`, set:

```lua
  APP.perf.stop_requested = true
```

- [ ] **Step 5: Run focused metric test**

Run:

```bash
npm run test:firmware-static -- --test-name-pattern "performance metrics"
```

Expected: PASS.

- [ ] **Step 6: Commit migrated app metrics**

Run:

```bash
git add tools/firmware-static-check/test.mjs apps/weather/main.lua apps/photos/main.lua apps/voice_ai/main.lua
git commit -m "feat: add migrated app performance metrics"
```

## Task 7: Update Docs And Verify Packages

**Files:**
- Modify: `docs/development-plan.md`
- Modify: `docs/post-v0.1-backlog.md`
- Test: package commands and focused tests

- [ ] **Step 1: Update docs with first-slice status**

In `docs/development-plan.md`, under “迁移 App 的性能和卡顿优化”, add a dated note:

```markdown
2026-06-29 第一刀计划：先锁定 `lua_http` callback 安全和同步阻塞事实，再让 `weather`、`photos`、`voice_ai` 输出统一 `perf_*` metrics。这个切片不声称已解决卡顿，也不把 HTTP 改成真正异步；下一步才是 HTTP worker task + Lua callback 派发队列。
```

In `docs/post-v0.1-backlog.md`, under “Performance Parity”, add:

```markdown
First slice status: `weather`, `photos`, and `voice_ai` should expose flat `perf_*` metrics. True async HTTP remains a follow-up slice.
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
npm run test:firmware-static -- --test-name-pattern "Lua HTTP callback|performance metrics"
npm run test:validator
npm run package:app -- apps/weather
npm run package:app -- apps/photos
npm run package:app -- apps/voice_ai
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run broad local verification**

Run:

```bash
npm test
```

Expected: exits 0.

- [ ] **Step 4: Commit docs**

Run:

```bash
git add docs/development-plan.md docs/post-v0.1-backlog.md
git commit -m "docs: record performance metrics first slice"
```

## Task 8: Optional Board Smoke

**Files:**
- Modify: `docs/device-bringup.md` only if hardware smoke is run

- [ ] **Step 1: Package and upload representative apps**

Run when the board is available:

```bash
npm run package:app -- apps/weather
npm run upload:app -- http://192.168.1.32:8080 dist/apps/weather weather
npm run package:app -- apps/photos
npm run upload:app -- http://192.168.1.32:8080 dist/apps/photos photos
npm run package:app -- apps/voice_ai
npm run upload:app -- http://192.168.1.32:8080 dist/apps/voice_ai voice_ai
```

Expected: each package uploads and confirms through `/apps` plus `app.info` readback.

- [ ] **Step 2: Run metrics-gated lifecycle smoke**

Run:

```bash
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --allow-starting --metrics-polls 40 --metrics-interval-ms 500 --require-metrics 'perf_first_paint_ms>=0' --require-metrics 'perf_ready_ms>=0' --stop
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app photos --allow-starting --metrics-polls 20 --metrics-interval-ms 500 --require-metrics 'perf_first_paint_ms>=0' --require-metrics 'perf_ready_ms>=0' --stop
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app voice_ai --allow-starting --metrics-polls 40 --metrics-interval-ms 500 --require-metrics 'perf_first_paint_ms>=0' --require-metrics 'perf_ready_ms>=0' --stop
```

Expected: each app launches, writes `perf_*` metrics, and stops back to idle.

- [ ] **Step 3: Record board evidence**

Append a note to `docs/device-bringup.md` with the exact commands and observed metrics. If board smoke is not run, do not claim board evidence.

## Self-Review

- Spec coverage: HTTP callback safety is covered by Tasks 1-2; metrics convention is covered by Tasks 3-6; docs are covered by Task 7; optional board evidence is covered by Task 8.
- Placeholder scan: no `TBD`, `TODO`, or “similar to” steps are used.
- Type consistency: the plan uses the same flat metric names as the design: `perf_first_paint_ms`, `perf_ready_ms`, `perf_resource_ms`, `perf_http_ms`, `perf_timer_max_ms`, `perf_stop_requested`, and `perf_last_error`.
