# Voice AI Flow

This document tracks the current device-to-desktop bridge contract for `apps/voice_ai`.

## Current Slice

The device app records through the Runtime native `i2s.record_file(...)` path.
The packaged `voice_audio` helper then converts the app-local capture file to
the bridge PCM contract and posts the raw bytes to a desktop bridge:

```text
POST /api/chat
Content-Type: application/octet-stream
X-Audio-Format: pcm_s16le
X-Sample-Rate: 16000
X-Bits: 16
X-Channels: 1
X-Reply-Limit: 100
```

Recording duration is constrained by both `max_record_ms` and the app memory
guard `MAX_RECORD_BYTES = 98304`. With the current default PCM contract
(`pcm_s16le`, 16000 Hz, 16-bit, mono), the byte guard wins:

```text
98304 / (16000 * 2) = 3.072 seconds
```

This is not a microphone or I2S hardware limit. The app captures to an
app-local raw file first, but the shared Lua helper still constructs the final
16 kHz mono upload body before HTTP upload. The 96 KiB guard keeps Voice AI
from exhausting or fragmenting memory while GIFs, fonts, LVGL objects, and HTTP
upload are active. Longer production recordings should use streaming upload or
a firmware-side file-to-HTTP helper before raising the constant.

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

## Board Smoke Status

The current automated board smoke is:

```sh
npm run voice-ai:smoke -- \
  --board http://192.168.1.32:8080 \
  --bridge http://192.168.1.26:8790 \
  --record-ms 1800 \
  --ready-polls 80 \
  --polls 35 \
  --interval-ms 500 \
  --min-audio-bytes 1024 \
  --require-gif
```

Latest 2026-06-23 board result after reflashing `/dev/cu.usbmodem111301`:

```text
voice-ai smoke ok: audio=4096 chats=0->1 state=running current_app=voice_ai gif=idle reply=我已收到录音：收到 4096 字节音频，约 0.1 秒
```

The smoke requires `metrics.json` to report `use_gif=true`, `gif_visible=true`, a non-empty
`gif_state`, and a `.gif` `gif_src` before it records. This proves the app selected and exposed a
visible GIF state through machine-readable metrics; it does not replace physical screen/camera
verification of the animation.

The same session fixed a board-only launch failure where the larger `voice_ai` package returned
`500 ESP_ERR_NO_MEM` from `/launch`. The deferred HTTP launch job is heap-caps allocated, and its
background task now uses a SPIRAM-capable stack plus `heap_caps_free` cleanup.

2026-06-24/25 follow-up: the smoke tool now supports `--require-bridge-provider <name>` and the
desktop bridge exposes `provider` through `/health` and `/debug/stats`. The board was reflashed on
`/dev/cu.usbmodem111301`, `voice_ai` was re-uploaded, and the command-provider boundary reached the
board:

```text
npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1800 --ready-polls 120 --polls 35 --interval-ms 500 --min-audio-bytes 1024 --require-gif --require-bridge-provider command
voice-ai smoke ok: audio=6144 chats=0->1 state=running current_app=voice_ai gif=idle reply=
```

Bridge stats after the run showed `provider=command`, `chat_requests=1`, `last_audio_bytes=6144`,
and PCM metadata `pcm_s16le/16000/16/1`. This proves the board can record and upload audio through
the non-mock provider boundary. It does not yet prove a successful production reply: the test command
provider returned an empty transcript/reply, and the app metrics recorded `last_http_code=500` while
showing the GIF busy state. Real OpenAI credentials/wrapper board verification remains open.

The same pass also hardened startup diagnostics: `voice_ai` no longer writes `metrics.json` at the
earliest `load_config` stage, avoiding startup SD writes before UI setup. The smoke tool now accepts
ready metrics after launch even when their text matches the pre-launch stale file, which prevents a
false timeout after a clean app restart.

2026-06-25 recovery: the board-side open-file budget was raised from 8 to 16 so `voice_ai` could keep
its custom GIF and font assets live while still serving app files. After flashing the board, the same
`voice-ai:smoke` command returned `voice-ai smoke ok: audio=1536 chats=0->1 state=running current_app=voice_ai gif=idle font=loaded reply=reply:transcript:2048`, and direct `/apps/file` reads for `metrics.json`, `main.lua`, and `app.info` all succeeded while the app was running.

2026-07-01 physical Voice AI success: `voice_ai` was moved off the old Lua timer
`i2s.read` recording path and onto the same native file-backed audio lane used
by `audio_loopback`. The debug sequence exposed two firmware bugs: ES7210 RX
could reuse stale codec state and return all-zero captures after app switching,
and `i2s.play_file` could fail after recording because playback buffers required
internal RAM. The fixes force RX codec re-prepare before capture and let
`play_file` allocate normal 8-bit-capable heap memory instead of internal-only
memory. After flashing `/dev/cu.usbmodem112301`, `audio_loopback` returned to
`mode=idle`, `record_bytes=384000`, `play_bytes=128968`, and `last_error=""`.
The user then launched `voice_ai`, short-pressed HOME, spoke into the microphone,
and confirmed that the device displayed the recognized text and reply. Bridge
stats captured the successful local Apple Speech command-provider round trip:

```json
{
  "provider": "command",
  "chat_requests": 8,
  "last_audio_bytes": 98304,
  "last_metadata": {
    "format": "pcm_s16le",
    "sampleRate": 16000,
    "bits": 16,
    "channels": 1
  },
  "last_transcript": "<recognized user speech>",
  "last_reply": "识别结果：<recognized user speech>",
  "last_audio_quality": {
    "duration_seconds": 3.072,
    "peak_abs": 5462,
    "rms_abs": 420.221,
    "silent_ratio": 0.621745
  }
}
```

This is the first confirmed physical end-to-end path:

```text
ES7210 microphone -> Runtime native record_file -> app-local raw capture ->
voice_audio helper -> 16 kHz mono PCM upload ->
desktop bridge command provider -> Apple Speech -> local reply command ->
device UI display
```

Future microphone applications should start from this lane. Lua code should
request high-level capture/playback operations from Runtime and should not use
timer-driven `i2s.read` loops for user-facing voice capture unless the firmware
adds a tested streaming API.

## Reuse Guidance

For future microphone, speaker, or backend-linked applications, treat the
2026-07-01 Voice AI path as the baseline:

- Capture through Runtime-owned codec/I2S helpers such as `i2s.record_file`, or
  through `voice_audio.record_bridge_pcm` when the app needs bridge-ready voice
  PCM.
- Keep sample-rate conversion, channel selection, codec re-prepare, and playback
  buffering in firmware or in one shared Runtime/helper layer.
- Let Lua own product behavior, UI state, and HTTP request orchestration, not
  low-level microphone timing.
- Save raw captures on the desktop bridge during bring-up so failed STT runs can
  be distinguished from silent input, bad channel selection, upload failure, or
  provider errors.
- Verify each new backend provider independently. The local Apple Speech command
  provider is proven; external STT/LLM services still depend on their endpoint
  shape, credentials, latency, and privacy/logging policy.

This makes new audio apps practical, but it is not a blanket guarantee that
all future audio features are finished by default. Long recordings, streaming
upload, wake-word detection, echo cancellation, noise suppression, automatic
gain control, and cloud providers are follow-up capabilities on top of this
baseline.

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

Local macOS Speech transcription can run without a cloud STT provider:

```sh
VOICE_BRIDGE_SAVE_AUDIO_DIR=recordings \
VOICE_BRIDGE_TRANSCRIBE_COMMAND="swift desktop-bridge/apple-speech-transcribe.swift" \
VOICE_BRIDGE_REPLY_COMMAND="node desktop-bridge/local-reply.mjs" \
node desktop-bridge/server.mjs --host 0.0.0.0 --port 8790 --provider command
```

When `VOICE_BRIDGE_SAVE_AUDIO_DIR` is set, each `/api/chat` upload is saved as
raw `.pcm`, playable `.wav`, and `.json` metadata/result files. The `.pcm` file
is the exact byte stream uploaded by the device. The Apple Speech command reads
the command-provider JSON contract from stdin, writes a temporary WAV file for
`SFSpeechRecognizer`, then prints `{"transcript":"..."}` to stdout. The default
locale is `zh-CN`; set `APPLE_SPEECH_LOCALE` to another BCP-47 locale when
needed. The first run may require granting Speech Recognition permission to the
terminal process.

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
    "format": "pcm_s16le",
    "sampleRate": 16000,
    "bits": 16,
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
    "format": "pcm_s16le",
    "sampleRate": 16000,
    "bits": 16,
    "channels": 1,
    "replyLimit": 100
  }
}
```

By default, the reply command does not receive raw audio. That keeps the LLM side of the pipeline on
transcript-only input unless a local wrapper explicitly opts into the larger privacy surface:

```sh
VOICE_BRIDGE_REPLY_INCLUDE_AUDIO=1
```

When this flag is enabled, the reply command also receives:

```json
{
  "audio_base64": "base64 PCM bytes"
}
```

Reply output:

```json
{
  "reply": "中文回复",
  "ui_code": ""
}
```

The bridge intentionally does not hard-code a cloud STT or LLM SDK yet. The command boundary lets a local wrapper own provider selection, credentials, logging, and privacy policy without changing the device protocol. The current built-in privacy boundary is test-covered: STT/transcribe commands receive audio, LLM/reply commands receive only transcript and metadata unless `VOICE_BRIDGE_REPLY_INCLUDE_AUDIO=1` is set.

An OpenAI-compatible wrapper is included for the `command` provider. It converts incoming PCM to a
temporary WAV upload for `/v1/audio/transcriptions`, then sends transcript-only text to
`/v1/responses` by default. Compatible services that expose Chat Completions instead can set
`OPENAI_REPLY_ENDPOINT=chat_completions` and use `/v1/chat/completions` for the reply step:

```sh
export OPENAI_API_KEY="..."
export OPENAI_TRANSCRIBE_MODEL="gpt-4o-mini-transcribe"
export OPENAI_REPLY_MODEL="gpt-4.1-mini"

VOICE_BRIDGE_TRANSCRIBE_COMMAND="npm run -s voice:openai:transcribe" \
VOICE_BRIDGE_REPLY_COMMAND="npm run -s voice:openai:reply" \
node desktop-bridge/server.mjs --host 0.0.0.0 --port 8790 --provider command
```

Optional settings:

```sh
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_REPLY_SYSTEM_PROMPT="你是 VibeBoard 桌面设备上的语音助手，回答要简洁。"
OPENAI_REPLY_ENDPOINT="responses" # or chat_completions
```

The wrapper is unit-tested with mocked HTTP responses and preserves the bridge privacy boundary: the
reply step receives only `transcript` and `metadata`, not `audio_base64`.

2026-06-25 local provider follow-up: the current shell environment had `OPENAI_API_KEY` and
`OPENAI_BASE_URL` set, and the configured OpenAI-compatible base URL responded to `/models`.
A generated Chinese `say` sample was converted to 16 kHz mono PCM and run through:

```sh
VOICE_BRIDGE_TRANSCRIBE_COMMAND="node desktop-bridge/openai-voice-commands.mjs transcribe" \
VOICE_BRIDGE_REPLY_COMMAND="node desktop-bridge/openai-voice-commands.mjs reply" \
node desktop-bridge/server.mjs \
  --provider command \
  --once-file /tmp/vibeboard-voice-openai.*/voice.pcm \
  --sample-rate 16000 \
  --bits 16 \
  --channels 1 \
  --format pcm_s16le \
  --reply-limit 80
```

That run did not complete because the configured compatible service returned
`HTTP 404 text/plain: 404 page not found` for `/audio/transcriptions`. A direct reply-command probe
against the same base URL also failed with
`HTTP 502 text/html; charset=UTF-8` for `/responses`. A follow-up probe showed the same service does
support `/chat/completions` when `OPENAI_REPLY_MODEL=gpt-5.4-mini`, and the wrapper now has a
test-covered `OPENAI_REPLY_ENDPOINT=chat_completions` mode. Verified local command:

```sh
printf '%s\n' '{"transcript":"你好，请用一句话确认 VibeBoard 语音回复端点可用。","metadata":{"replyLimit":80}}' | \
  OPENAI_REPLY_ENDPOINT=chat_completions \
  OPENAI_REPLY_MODEL=gpt-5.4-mini \
  node desktop-bridge/openai-voice-commands.mjs reply
```

Output:

```json
{"reply":"VibeBoard 语音回复端点可用。","ui_code":""}
```

This narrows the remaining provider gap: credentials and model listing are present and reply can use
Chat Completions, but the selected base URL still does not expose the audio transcription endpoint
expected by the wrapper. The wrapper and bridge CLI report non-JSON OpenAI-compatible responses with
endpoint/status/content-type context and no extra usage noise. A board `voice_ai` smoke against a
provider that supports transcription plus reply still needs hardware/network verification.

For local provider bring-up without the ESP32 board, the same bridge can run one PCM file through the selected provider and print the normal `/api/chat` JSON result:

```sh
VOICE_BRIDGE_TRANSCRIBE_COMMAND="your-transcribe-command" \
VOICE_BRIDGE_REPLY_COMMAND="your-reply-command" \
node desktop-bridge/server.mjs \
  --provider command \
  --once-file samples/voice.pcm \
  --sample-rate 16000 \
  --bits 16 \
  --channels 1 \
  --format pcm_s16le \
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
  "sample_bits": 16,
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

- `apps/voice_ai` core record/upload/reply loop is board-verified with the mock bridge. On 2026-06-22 the board launched `voice_ai`, waited for `metrics.json` `init_stage=ready`, injected `HOME/SHORT` twice through `/input/key`, drained I2S PCM, posted to the desktop bridge, and returned:

```text
voice-ai smoke ok: audio=2048 chats=0->1 state=running current_app=voice_ai reply=我已收到录音：收到 2048 字节音频，约 0.0 秒
```

- The app now reads `config.json` through the app-local `file.open(...):read(...)` path and guards config loading with `pcall`, so a config parse/read issue cannot block startup before HOME binding.
- The 2026-06-23 smoke also passed with `"use_gif": true` and `--require-gif`, proving machine-readable GIF selection/visibility metrics; physical screen observation of the animation remains pending.
- The 2026-06-25 command-provider sweep fixed a lifecycle/input issue: `voice_ai` could previously write ready metrics from top-level startup while Runtime `/status` stayed `starting`, so injected HOME events were not drained by the Lua runner and the bridge never received a new upload. Heavy UI/timer/update readiness now runs from a 50 ms one-shot boot timer after config/font/key setup, allowing the script to return to the runner loop. Board verification with the command bridge passed:

```text
voice-ai smoke ok: audio=6144 chats=3->4 state=running current_app=voice_ai gif=idle font=loaded reply=
```

  This proves fresh board PCM reached the command-provider bridge with GIF/font metrics ready. The empty `reply=` means the current command provider/wrapper still lacks a successful transcript/reply result; real credentials/provider behavior remains open.
- OpenAI-compatible STT and LLM command wrappers are available as `npm run voice:openai:transcribe` and `npm run voice:openai:reply`; they are test-covered with mocked HTTP and keep the reply step transcript-only.
- Board-verify the GIF buddy path on the physical screen with `"use_gif": true`.
- Cloud STT/LLM providers still need their own credential/privacy/logging
  verification. The local Apple Speech command-provider path is physically
  verified, but that does not prove every external STT endpoint works.
