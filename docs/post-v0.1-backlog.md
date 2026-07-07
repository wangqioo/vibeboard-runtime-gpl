# Post-v0.1 Backlog

This backlog tracks work that should continue after the `v0.1-runtime-milestone`. These items do not block the v0.1 machine-verifiable baseline.

## Physical Visual QA

Goal: confirm the apps look correct on the real 320x240 display, not only that metrics and lifecycle smoke pass.

- Capture or observe `weather`, `videos`, `spectrum`, `lv-benchmark`, `btc`, `settings`, `hwmon`, `plane`, `clock`, and `nixie_clock`.
- `camera` and `photos` now have a first physical pass: live preview, capture, on-device camera gallery, and standalone Photos display were user-verified on 2026-07-03. Keep them in later sweeps for regression and long-run capture/gallery soak, not as first-proof blockers.
- Check CJK glyphs, fallback fonts, clipped text, overlapping labels, color depth, transparency, image scaling, GIF playback, and animation smoothness.
- Record each app as pass/fail with a photo or explicit manual observation note in `docs/device-bringup.md`.

## Audio And Voice

Goal: move from driver and bridge metrics to real audible and provider-backed behavior.

- Verify ES8311/amp/speaker output with an audible tone and Voice AI playback path. The 440 Hz tone and file-backed record/playback path have first physical evidence; production gain/noise tuning and long audio soak remain.
- Confirm microphone quality with real speech, not only nonzero PCM or command-provider mock paths. Local Apple Speech STT succeeded once through the desktop bridge after the microphone/channel tuning pass; keep this as first proof, not final audio quality sign-off.
- Connect a provider/base URL that supports the chosen STT route and complete one real record -> transcript -> reply board smoke. The local desktop command-provider route is board/user verified; cloud STT/LLM provider endpoints, credentials, privacy logging, and failure UX remain.
- Keep the privacy boundary documented: transcript-only reply path by default; raw audio forwarded only with explicit opt-in.

## Real Input Hardware

Goal: replace synthetic HTTP hooks with physical interaction evidence.

- Verify BOOT short/long forwarding into active Lua apps on the board.
- Verify `smoke_touch` displays real touch coordinates accurately.
- Verify real BLE/Xbox gamepad discovery, input mapping, disconnect handling, and NES gameplay.
- Decide whether hardware repeat events are needed beyond the current timer-backed `key.repeat_start/stop()` helper.

## Long-Run Stability

Goal: catch leaks, lock contention, slow stop paths, and resource exhaustion that short smoke tests miss.

- Run long app-switch loops across resource-heavy apps: `weather`, `photos`, `videos`, `voice_ai`, `spectrum`, and `nesgame`.
- Run a real NES game soak with display, input, and audio enabled.
- Track heap, PSRAM, LVGL object count, SD open/read failures, stop latency, and app registry health after each loop.
- Add smoke or soak tooling only after deciding which metrics should be stable.

## Performance Parity

Goal: investigate the user-visible startup and animation slowness reported on migrated apps.

Do not assume the cause is the Runtime + Web replacement architecture; upstream Cubic/HoloCubic also supports Runtime + SD/Lua App + WebUI/HTTP replacement. Focus on measurable implementation differences.

First instrumentation slice status:

- Lua HTTP callback dispatch is protected with `lua_pcall`, while request execution intentionally remains synchronous for this slice.
- `weather`, `photos`, and `voice_ai` now emit flat `perf_*` fields in `metrics.json`: `perf_first_paint_ms`, `perf_ready_ms`, `perf_resource_ms`, `perf_http_ms`, `perf_timer_max_ms`, `perf_stop_requested`, and `perf_last_error`.
- These fields are a baseline for comparison, not a claim that startup or animation stutter is fixed.

Initial metrics:

- first paint / first usable time;
- image, font, GIF, PNG, BMP decode time;
- SD file open/read count and duration;
- Lua timer callback duration and frequency;
- LVGL object count and display tick/frame progress;
- metrics write frequency;
- stop/switch latency under load.

Initial app set:

- `weather`
- `photos`
- `nesgame` or `voice_ai`

Hypotheses to test:

- ported apps compensate for missing upstream APIs with extra Lua work, polling, staged boot, or simplified UI paths;
- upstream has broader `httpd`, `websocket`, app event, LVGL binding, and `viper` hot-path support;
- resource-heavy apps hit SD read amplification, decode overhead, PSRAM/DMA pressure, or LVGL lock contention;
- HTTPD, WiFi, SD, metrics writes, native tasks, and Lua/LVGL callbacks compete during startup or animation.

## Web UI Productization

Goal: turn the local Device Web UI from a development tool into a more complete management surface.

- Add browser-side package upload UX for local app directories or packaged output.
- Add device log summary or recent error display.
- Improve staged install rollback/failure messaging.
- Decide whether app-specific WebUI assets need a static file route, auth, CORS, or route table support beyond the current active-app callback bridge.

## Upstream Parity

Goal: continue source-driven compatibility work without pretending all upstream apps are direct drops.

- Continue API inventory app by app.
- Add missing Runtime APIs only when a concrete app requires them.
- Keep validator and package metadata strict so incompatible generated or migrated apps fail before upload.
- Track upstream mapping in `docs/upstream-map.md`.
