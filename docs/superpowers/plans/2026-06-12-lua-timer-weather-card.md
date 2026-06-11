# Lua Timer Weather Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal Lua timer loop and update the weather card demo to Shanghai with a live one-second update label.

**Architecture:** Keep LVGL object operations in `lua_lvgl.c`. Add timer registration and loop ownership to `app_runner.c`, where the Lua state already lives. The runner keeps the Lua task alive when intervals exist and calls Lua callbacks from the same task.

**Tech Stack:** ESP-IDF, FreeRTOS, georgik/lua, LVGL 8, Node static tests.

---

### Task 1: Static Tests

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add timer runtime checks**

Require `set_interval`, callback refs, `lua_pcall`, and an interval loop in `app_runner.c`.

- [ ] **Step 2: Add dynamic card checks**

Require `apps/smoke_ui/main.lua` to show `Shanghai`, `Updated 00s`, `set_interval(1000`, and `weather card dynamic ok`.

- [ ] **Step 3: Verify red**

Run: `npm run test:firmware-static`

Expected: FAIL because timer runtime and updated app script are not implemented yet.

### Task 2: Lua Timer Runtime

**Files:**
- Modify: `firmware/vibeboard_runtime/main/app_runner.c`

- [ ] **Step 1: Register `set_interval`**

Expose `set_interval(ms, callback)` to Lua. Store callback references with `luaL_ref`.

- [ ] **Step 2: Keep the Lua task alive**

After `luaL_dofile`, if intervals exist, run a bounded smoke loop that invokes callbacks every second for board verification.

- [ ] **Step 3: Verify green**

Run: `npm run test:firmware-static`

Expected: PASS.

### Task 3: Dynamic Shanghai Weather Card

**Files:**
- Modify: `apps/smoke_ui/main.lua`

- [ ] **Step 1: Update card text**

Change location to `Shanghai` and add an `Updated 00s` label.

- [ ] **Step 2: Register interval**

Use `set_interval(1000, function() ... end)` to update the label once per second and print `weather card tick` for the first few ticks.

- [ ] **Step 3: Verify all tests and firmware**

Run `npm test`, then `idf.py build`.

Expected: both pass.

### Task 4: One SD Write and Board Verification

**Files:**
- Modify: `docs/device-bringup.md`

- [ ] **Step 1: Flash firmware**

Flash once after the final firmware build.

- [ ] **Step 2: Write SD once**

After all code is done, package `apps/smoke_ui`, copy it to SD once, and eject the card.

- [ ] **Step 3: Verify board**

With the SD card back in the board, monitor serial logs for `weather card dynamic ok` and `weather card tick`.

- [ ] **Step 4: Record evidence**

Append evidence to `docs/device-bringup.md` and commit.
