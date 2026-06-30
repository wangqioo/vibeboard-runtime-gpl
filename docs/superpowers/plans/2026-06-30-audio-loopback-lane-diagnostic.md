# Audio Loopback Lane Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a board-level audio capture diagnostic that records in the SZPI speech-reference format and lets the user audition each captured lane.

**Architecture:** Runtime I2S keeps the existing TDM default but accepts an explicit Lua `tdm = false` override for RX. `audio_loopback` uses `16kHz / 32-bit / stereo / STD` capture and splits every frame into four little-endian 16-bit lanes for playback profiles.

**Tech Stack:** ESP-IDF I2S STD/TDM drivers, Lua runtime bindings, LVGL app, Node static tests.

---

### Task 1: Runtime I2S Mode Override

**Files:**
- Modify: `firmware/vibeboard_runtime/main/lua_i2s.c`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] Add a table boolean reader and pass an explicit `tdm` override into `start_port`.
- [ ] Include the override in the started-port reuse check so a port restarts when mode changes.
- [ ] Keep default behavior unchanged: RX-only stereo still uses TDM unless Lua passes `tdm = false`.

### Task 2: Four-Lane Audio Loopback

**Files:**
- Modify: `apps/audio_loopback/main.lua`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] Change capture to `SAMPLE_RATE = 16000`, `BITS = 32`, `CHANNELS = 2`.
- [ ] Pass `tdm = false` to RX startup.
- [ ] Replace downsampled left/right profiles with `lane1`, `lane2`, `lane3`, and `lane4` profiles.
- [ ] Build playback by extracting the selected 16-bit lane from each 8-byte capture frame and duplicating it to stereo TX.
- [ ] Add per-lane RMS/peak metrics so the selected channel can be compared without listening alone.

### Task 3: Verify and Deploy

**Files:**
- Modify: no additional files expected

- [ ] Run `npm run test:firmware-static -- --test-name-pattern "I2S|Audio Loopback"`.
- [ ] Run `npm run test:validator`.
- [ ] Build firmware with ESP-IDF.
- [ ] Flash the board.
- [ ] Upload `apps/audio_loopback`.
- [ ] Ask the user to record once and short-press through lane1-lane4 to choose the cleanest voice.
