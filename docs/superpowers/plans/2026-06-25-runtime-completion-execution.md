# VibeBoard Runtime Completion Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining VibeBoard Runtime GPL development-plan items by closing each remaining machine-verifiable slice, recording hardware/visual blockers honestly, and updating project docs after each verified slice.

**Architecture:** Work in thin validation and implementation slices. Prefer existing smoke tools and app metrics before adding new runtime code. Treat physical-only evidence, such as visible screen quality, speaker output, BOOT button presses, and real BLE/Xbox input, as explicit hardware-verification tasks that cannot be claimed complete without observation.

**Tech Stack:** ESP-IDF firmware, Lua apps on SD, Node.js smoke tools, LVGL, VibeBoard HTTP install/runtime APIs.

---

### Task 1: Baseline Device And Workspace State

**Files:**
- Read: `docs/development-plan.md`
- Read: `docs/next-session-plan.md`
- Read: `docs/device-bringup.md`
- Modify: `docs/device-bringup.md`

- [x] **Step 1: Record worktree state**

Run:

```bash
git status --short
```

Expected: repository may be dirty. Do not revert unrelated changes.

- [x] **Step 2: Verify board identity**

Run:

```bash
npm run device:check
```

Expected: ESP32-S3 is detected and `http://192.168.1.32:8080/status` reports VibeBoard Runtime metadata.

- [x] **Step 3: Capture idle runtime status**

Run:

```bash
curl -fsS http://192.168.1.32:8080/status
```

Expected: JSON with `state:"idle"` or a known active app that can be stopped before smoke tests.

- [x] **Step 4: Update device bring-up notes**

Append a dated note to `docs/device-bringup.md` with the device check result, status JSON summary, and any active app cleanup performed.

### Task 2: Weather Lifecycle And Background Gate Closure

**Files:**
- Modify: `docs/development-plan.md`
- Modify: `docs/device-bringup.md`
- Modify: `docs/next-session-plan.md`

- [x] **Step 1: Package and upload Weather**

Run:

```bash
npm run package:app -- apps/weather
npm run upload:app -- http://192.168.1.32:8080 dist/apps/weather weather
```

Expected: package succeeds and upload commits `weather` in `/apps`.

- [x] **Step 2: Run metrics-gated lifecycle smoke**

Run:

```bash
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --metrics-polls 60 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics fonts_ready=true --require-metrics assets_ready=true --require-metrics visual_assets_ready=true --require-metrics background_ready=true --require-metrics background_attempts=1 --stop --stop-polls 35 --stop-interval-ms 500
```

Expected: smoke passes with `background_ready=true`, `background_attempts=1`, and `stop_state=idle`.

- [x] **Step 3: Document scope of completion**

Update docs to state that the timer/background metrics gate is closed, but visible large PNG/LVGL background remains a separate visual/deferred-work task unless it is actually restored and observed.

### Task 3: Resource App Machine Smoke Sweep

**Files:**
- Modify: `docs/device-bringup.md`
- Modify: `docs/development-plan.md`
- Modify: `docs/next-session-plan.md`

- [x] **Step 1: Package demo apps**

Run:

```bash
npm run package:demos
```

Expected: demo packaging succeeds.

- [x] **Step 2: Lifecycle smoke display/resource apps**

Run each command:

```bash
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app matrix_rain --polls 35 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app nixie_clock --polls 35 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app clock --polls 35 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app conway_life --polls 35 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app fluid_pendant --polls 35 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500
npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app smoke_controls --polls 35 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500
```

Expected: each app reaches running and returns to idle after stop. If an app is missing or incompatible, upload the current packaged app before retrying.

- [x] **Step 3: Record visual evidence gap**

Update docs with which apps passed machine lifecycle smoke. Record that actual PNG/glyph/layout/animation correctness remains unclaimed unless a photo/screenshot or direct observation is available.

### Task 4: Input And App Manager Regression Sweep

**Files:**
- Modify: `docs/device-bringup.md`
- Modify: `docs/development-plan.md`
- Modify: `docs/next-session-plan.md`

- [x] **Step 1: Run key repeat smoke**

Run:

```bash
npm run input:smoke -- --board http://192.168.1.32:8080 --app smoke_key --key LEFT:SHORT --expect-state running --delay-ms 500 --metrics-polls 14 --require-event UP:LONG_REPEAT --require-event UP:LONG_END
```

Expected: smoke passes and app can be stopped cleanly afterward if it remains running.

- [x] **Step 2: Run gamepad synthetic lifecycle smoke**

Run:

```bash
npm run gamepad:smoke -- --board http://192.168.1.32:8080 --inject-gamepad --inject-disconnect --require-updates 2 --require-disconnects 1 --metrics-delay-ms 1000 --metrics-polls 20 --polls 12 --interval-ms 500
```

Expected: smoke passes with update and disconnect metrics.

- [x] **Step 3: Run app-manager handoff smoke**

Run:

```bash
npm run app-manager:smoke -- --board http://192.168.1.32:8080 --polls 35 --interval-ms 500
```

Expected: smoke passes and observes `smoke_app_manager` handing off to `smoke_key`.

- [x] **Step 4: Record physical input gap**

Update docs to distinguish synthetic HTTP/key/gamepad evidence from physical BOOT, real touch coordinates, hardware repeat, and real BLE/Xbox input.

### Task 5: NES Runtime Stability Sweep

**Files:**
- Modify: `docs/device-bringup.md`
- Modify: `docs/development-plan.md`
- Modify: `docs/next-session-plan.md`

- [x] **Step 1: Upload legal smoke ROM**

Run:

```bash
npm run nes:rom:smoke -- --board http://192.168.1.32:8080 --app smoke_nes --path roms/smoke.nes
```

Expected: legal mapper-0 smoke ROM is uploaded to the app-local ROM path.

- [x] **Step 2: Run long frame-growth smoke**

Run:

```bash
npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 30 --metrics-polls 140 --interval-ms 500 --require-rom --require-frame-growth 1600 --require-audio-bytes 128 --require-audio-backend host
```

Expected: smoke passes with sustained frame growth, host audio bytes, and host audio backend. This is not a full 60fps claim.

- [x] **Step 3: Run nesgame selector-to-ROM smoke**

Run:

```bash
npm run nesgame:smoke -- --board http://192.168.1.32:8080 --require-frame-growth 120 --inject-gamepad
```

Expected: selector finds app-local ROM, starts it, and frame count grows.

- [x] **Step 4: Record physical NES gaps**

Update docs to distinguish machine smoke from real speaker output, real BLE/Xbox input, physical UX, and longer real-game soak.

### Task 6: Voice AI And I2S Sweep

**Files:**
- Modify: `docs/device-bringup.md`
- Modify: `docs/development-plan.md`
- Modify: `docs/voice-ai-flow.md`

- [x] **Step 1: Verify bridge availability**

Run:

```bash
curl -fsS http://192.168.1.26:8790/health
```

Expected: bridge responds. If unavailable, start the documented bridge or record the blocker.

- [x] **Step 2: Run I2S tone smoke**

Run:

```bash
npm run i2s:smoke -- --board http://192.168.1.32:8080 --polls 20 --interval-ms 500 --require-write --require-tone-writes 8
```

Expected: smoke passes with `tone_writes >= 8` and nonzero `tx_bytes`.

- [x] **Step 3: Run Voice AI command-provider smoke**

Run:

```bash
npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1200 --ready-polls 60 --polls 30 --interval-ms 500 --require-gif --require-font --require-bridge-provider command --min-audio-bytes 1
```

Expected: smoke passes to the current command-provider contract. If transcript/reply are empty or HTTP status records an error, document that real provider completion remains open.

- [x] **Step 4: Record real-audio and provider gaps**

Update docs to distinguish PCM/upload/metrics evidence from ES8311 speaker output, audible confirmation, GIF visual animation, and real OpenAI/provider credentials.

### Task 7: Deployment And Config Productization Sweep

**Files:**
- Modify: `docs/device-bringup.md`
- Modify: `docs/development-plan.md`

- [x] **Step 1: Run device web smoke**

Run:

```bash
npm run device:web:smoke -- --board http://192.168.1.32:8080 --base http://127.0.0.1:8790
```

Expected: web proxy can status/list/launch/stop/rescan/delete a temporary app.

- [x] **Step 2: Run interrupted upload smoke**

Run:

```bash
npm run upload:interrupted-smoke -- http://192.168.1.32:8080 interrupted_upload_smoke
```

Expected: staged upload aborts cleanly and temporary app is absent.

- [x] **Step 3: Run runtime config reboot smoke on non-secret config**

Run:

```bash
npm run runtime:config:smoke -- --reboot --reboot-polls 45 --reboot-delay-ms 1000 http://192.168.1.32:8080 i2s runtime/i2s.local.json
```

Expected: config write succeeds, board reboots, and Runtime HTTP returns.

- [x] **Step 4: Record WiFi credential limitation**

If no fresh WiFi credentials file is provided, document that real WiFi write-then-reboot smoke remains unverified.

### Task 8: Release Readiness Audit

**Files:**
- Modify: `docs/development-plan.md`
- Modify: `docs/device-bringup.md`
- Create or Modify: release documentation if missing

- [x] **Step 1: Run local test suite subset**

Run:

```bash
npm run test:firmware-static
npm run test:validator
npm run test:packager
git diff --check
```

Expected: all pass.

- [x] **Step 2: Run ESP-IDF build**

Run:

```bash
source /Users/wq/esp-idf/export.sh && idf.py build
```

Expected: firmware builds and app partition has documented free space.

- [x] **Step 3: Audit release artifacts**

Check for bootloader, partition table, app binary, and flash args in the ESP-IDF build output. Record exact paths and sizes in docs.

- [x] **Step 4: Final gap list**

Update docs with a final checklist separating:

- complete with machine evidence;
- complete with physical evidence;
- blocked on human observation or external hardware/service;
- intentionally deferred scope.
