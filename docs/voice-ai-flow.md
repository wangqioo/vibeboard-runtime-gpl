# Voice AI Flow

This document tracks the current device-to-desktop bridge contract for `apps/voice_ai`.

## Current Slice

The device app records PCM through the Lua `i2s` module, then posts the raw bytes to a desktop bridge:

```text
POST /api/chat
Content-Type: application/octet-stream
X-Audio-Format: pcm_s32le
X-Sample-Rate: 16000
X-Bits: 32
X-Channels: 1
X-Reply-Limit: 100
```

The synchronous bridge response is:

```json
{
  "ok": true,
  "transcript": "用户语音转写",
  "reply": "中文回复",
  "ui_code": ""
}
```

The asynchronous bridge response is:

```json
{
  "ok": true,
  "pending": true,
  "id": "voice-..."
}
```

When pending, the device polls:

```text
GET /api/result?id=voice-...
```

Result polling returns either:

```json
{
  "ok": true,
  "pending": true,
  "id": "voice-..."
}
```

or:

```json
{
  "ok": true,
  "pending": false,
  "transcript": "用户语音转写",
  "reply": "中文回复",
  "ui_code": "return function(ctx) ... end"
}
```

Errors always use JSON with `ok: false` and a human-readable `error` string.

## Desktop Bridge

The local testable bridge lives in `desktop-bridge/server.mjs`.

```sh
node desktop-bridge/server.mjs --host 0.0.0.0 --port 8790
```

The current implementation is a provider-neutral protocol bridge. It validates and stores audio requests, returns deterministic Chinese mock replies by default, and supports both synchronous and pending-result flows. It does not yet call a real STT or OpenAI provider.

## Device Config

Set `apps/voice_ai/config.json` on SD to point at the computer running the bridge:

```json
{
  "bridge_url": "http://192.168.0.80:8790",
  "sample_rate": 16000,
  "sample_bits": 32,
  "max_record_ms": 10000,
  "reply_limit": 100,
  "use_gif": true
}
```

The runtime-owned microphone pins still come from `/sdcard/runtime/i2s.json`.

## Remaining Work

- Wire a real speech-to-text provider into `desktop-bridge/server.mjs`.
- Wire a real OpenAI response provider that returns `reply` plus optional sandboxed LVGL `ui_code`.
- Board-verify I2S microphone capture with the correct ES7210 or board mic path.
- Board-verify `voice_ai` upload, reply rendering, and GIF buddy animation.
