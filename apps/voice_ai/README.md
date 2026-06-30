# Voice AI

320x240 voice assistant app. The device records audio and sends it to a desktop bridge. The bridge transcribes the audio, calls `gpt-5.4-mini`, and returns a short Chinese reply plus a sandboxed LVGL Lua UI snippet.

When `ui_code` is returned, the app creates a temporary LVGL screen and loads it full-screen. The next short `HOME` press cleans up that temporary screen, switches back to the app screen, and starts a new recording.

The raw bridge JSON response is written to UART0 with the `bridge_json` prefix, including `reply` and any returned `ui_code`.

## Device config

Copy `config.example.json` to `config.json` on the SD card and adjust the computer IP:

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

`sample_rate` describes the PCM format posted to the desktop bridge. On the
LCKFB SZPI ESP32-S3 board, the app records through the Runtime native
`i2s.record_file(...)` path first, saving 48 kHz, 16-bit stereo/TDM ES7210
capture to an app-local raw file. It then converts that file to the bridge
contract, currently 16 kHz mono PCM, before upload. This matches the verified
on-device loopback path and keeps microphone timing, codec setup, and I2S
buffering in firmware instead of in Lua timers.

`max_record_ms` is still bounded by the app-side memory guard
`MAX_RECORD_BYTES = 98304`. With the default 16 kHz, 16-bit, mono PCM format,
that is about 3.1 seconds of uploaded audio:

```text
98304 / (16000 * 2) = 3.072 seconds
```

The guard is intentional. Voice AI uses file-backed capture but still builds the
final uploaded 16 kHz mono request body in Lua before posting to the bridge, so
a longer upload still needs either streaming upload or a firmware-side
file-to-HTTP helper before raising this limit.

## Controls

- Short press `HOME`: record one short clip and send it.
- Short press `HOME` while an AI screen is visible: close it and start recording.
- Long press `HOME`: exit the app.

## AI UI snippets

The bridge asks the model to return Lua in this shape:

```lua
return function(ctx)
  local screen = ctx.new_screen()
  ctx.label(screen, 18, 76, 284, 72, "Hello", 0xF4F7FA, ctx.ALIGN_CENTER)
  return { screen = screen, cleanup = function() end }
end
```

The snippet runs in a restricted environment. It can use most `lv_*` LVGL bindings and `LV_*` constants available on the device. Screen switching, root cleanup, object deletion, parent discovery, resource load/free, AVI playback, global animation delete, file, HTTP, I2S, keys, app exit, `require`, `_G`, `debug`, `os`, and `io` are blocked.

Normal text replies can return an empty `ui_code`; the app will keep showing the regular reply screen.

## Font

The current app uses the Runtime font policy:

1. `LV_FONT_COMMON_CN_13` for normal Chinese UI text.
2. `LV_FONT_VOICE_AI_13` as a narrow app-specific compatibility fallback.
3. `LV_FONT_SIMSUN_16_CJK` as the built-in CJK fallback.

`LV_FONT_COMMON_CN_13` is generated from `font/msyh_cn_3500_charset.txt`, which
covers the common 3500 Chinese character set, ASCII, common punctuation, `℃`,
and `°`. The app no longer loads `/sd/apps/voice_ai/font/msyh_cn_13.bin` by
default because firmware-resident fonts avoid SD font load overhead and reduce
memory pressure while GIF/UI assets are active.

`font/msyh_cn_13.bin` and `font/build_msyh_cn_13.ps1` remain as the legacy
app-local generation reference. Use the script only when testing SD-loaded font
behavior.

The script expects Node and `lv_font_conv`. Set these when they are not on `PATH`:

```powershell
$env:NODE_EXE="C:\path\to\node.exe"
$env:LV_FONT_CONV_JS="C:\path\to\lv_font_conv.js"
.\font\build_msyh_cn_13.ps1
```
