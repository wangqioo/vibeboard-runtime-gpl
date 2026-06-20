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

The current implementation is a provider-neutral protocol bridge. It validates and stores audio requests, returns deterministic Chinese mock replies by default, and supports both synchronous and pending-result flows.

Provider selection:

```sh
node desktop-bridge/server.mjs --host 0.0.0.0 --port 8790 --provider mock
node desktop-bridge/server.mjs --host 0.0.0.0 --port 8790 --provider command
```

The `command` provider keeps real STT/LLM credentials outside this repo. It calls local commands with JSON on stdin and expects JSON on stdout:

```sh
VOICE_BRIDGE_TRANSCRIBE_COMMAND="your-transcribe-command" \
VOICE_BRIDGE_REPLY_COMMAND="your-reply-command" \
node desktop-bridge/server.mjs --host 0.0.0.0 --port 8790 --provider command
```

Transcribe input:

```json
{
  "audio_base64": "base64 PCM bytes",
  "metadata": {
    "format": "pcm_s32le",
    "sampleRate": 16000,
    "bits": 32,
    "channels": 1,
    "replyLimit": 100
  }
}
```

Transcribe output:

```json
{
  "transcript": "用户语音转写"
}
```

Reply input:

```json
{
  "transcript": "用户语音转写",
  "metadata": {
    "format": "pcm_s32le",
    "sampleRate": 16000,
    "bits": 32,
    "channels": 1,
    "replyLimit": 100
  }
}
```

Reply output:

```json
{
  "reply": "中文回复",
  "ui_code": ""
}
```

The bridge intentionally does not hard-code a cloud STT or LLM SDK yet. The command boundary lets a local wrapper own provider selection, credentials, logging, and privacy policy without changing the device protocol.

For local provider bring-up without the ESP32 board, the same bridge can run one PCM file through the selected provider and print the normal `/api/chat` JSON result:

```sh
VOICE_BRIDGE_TRANSCRIBE_COMMAND="your-transcribe-command" \
VOICE_BRIDGE_REPLY_COMMAND="your-reply-command" \
node desktop-bridge/server.mjs \
  --provider command \
  --once-file samples/voice.pcm \
  --sample-rate 16000 \
  --bits 32 \
  --channels 1 \
  --format pcm_s32le \
  --reply-limit 100 \
  --output /tmp/vibeboard-voice-result.json
```

This one-shot path is for validating wrapper commands, JSON shape, PCM metadata, and error handling before the board microphone path is ready. It is not a substitute for the final `apps/voice_ai` board smoke.

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

The runtime-owned microphone pins still come from `/sdcard/runtime/i2s.json`, which can be written with:

```text
npm run runtime:config -- http://192.168.1.32:8080 i2s runtime/i2s.local.json
```

## Remaining Work

- Provide production STT and LLM command wrappers for the bridge `command` provider and decide credential storage/privacy rules.
- Board-verify I2S microphone capture with the correct ES7210 or board mic path.
- Board-verify `voice_ai` upload, reply rendering, and GIF buddy animation.
