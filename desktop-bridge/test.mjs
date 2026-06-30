import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { request as httpRequest } from "node:http";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProviderFromEnv, createVoiceBridgeServer, parseArgs, runOnceFile } from "./server.mjs";
import { createOpenAiVoiceCommands, runOpenAiVoiceCommand } from "./openai-voice-commands.mjs";

function requestJson(server, path, { method = "GET", body = Buffer.alloc(0), headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const request = httpRequest({
      host: "127.0.0.1",
      port: address.port,
      path,
      method,
      headers: {
        "content-length": body.length,
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: response.statusCode, json: JSON.parse(text), text });
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function withServer(options, run) {
  const server = createVoiceBridgeServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("voice bridge args", () => {
  it("uses local defaults and supports host, port, and async flags", () => {
    assert.deepEqual(parseArgs(["--host", "0.0.0.0", "--port", "8790", "--async", "--provider", "command"]), {
      host: "0.0.0.0",
      port: 8790,
      async: true,
      provider: "command",
    });
  });

  it("supports one-shot local audio file runs with metadata overrides", () => {
    assert.deepEqual(parseArgs([
      "--provider=command",
      "--once-file",
      "sample.pcm",
      "--sample-rate",
      "24000",
      "--bits",
      "16",
      "--channels",
      "2",
      "--format",
      "pcm_s16le",
      "--reply-limit",
      "40",
    ]), {
      host: "127.0.0.1",
      port: 8790,
      async: false,
      provider: "command",
      onceFile: "sample.pcm",
      metadata: {
        sampleRate: 24000,
        bits: 16,
        channels: 2,
        format: "pcm_s16le",
        replyLimit: 40,
      },
    });
  });
});

describe("voice bridge providers", () => {
  it("uses the mock provider by default", async () => {
    const provider = createProviderFromEnv({ env: {} });
    const transcript = await provider.transcribe({
      audio: Buffer.from([1, 2, 3, 4]),
      metadata: { sampleRate: 16000, bits: 32, channels: 1 },
    });
    const reply = await provider.reply({ transcript });

    assert.match(transcript, /收到 4 字节音频/);
    assert.match(reply.reply, /我已收到录音/);
    assert.equal(reply.uiCode, "");
  });

  it("rejects command provider when commands are not configured", () => {
    assert.throws(
      () => createProviderFromEnv({ provider: "command", env: {} }),
      /VOICE_BRIDGE_TRANSCRIBE_COMMAND and VOICE_BRIDGE_REPLY_COMMAND are required/,
    );
  });

  it("runs command provider hooks with audio and transcript payloads", async () => {
    const calls = [];
    const provider = createProviderFromEnv({
      provider: "command",
      env: {
        VOICE_BRIDGE_TRANSCRIBE_COMMAND: "transcribe-local",
        VOICE_BRIDGE_REPLY_COMMAND: "reply-local",
      },
      runCommand: async (command, input) => {
        calls.push({ command, input: JSON.parse(input.toString("utf8")) });
        if (command === "transcribe-local") {
          return JSON.stringify({ transcript: `bytes=${calls[0].input.audio_base64.length}` });
        }
        return JSON.stringify({ reply: `reply:${calls[1].input.transcript}`, ui_code: "return function() end" });
      },
    });

    const transcript = await provider.transcribe({
      audio: Buffer.from([1, 2, 3]),
      metadata: { sampleRate: 16000, bits: 32, channels: 1, format: "pcm_s32le" },
    });
    const reply = await provider.reply({
      transcript,
      metadata: { sampleRate: 16000, bits: 32, channels: 1, format: "pcm_s32le" },
    });

    assert.equal(transcript, "bytes=4");
    assert.deepEqual(reply, { reply: "reply:bytes=4", uiCode: "return function() end" });
    assert.equal(calls[0].command, "transcribe-local");
    assert.equal(calls[0].input.audio_base64, "AQID");
    assert.equal(calls[0].input.metadata.sampleRate, 16000);
    assert.equal(calls[1].command, "reply-local");
    assert.equal(calls[1].input.transcript, "bytes=4");
  });

  it("keeps raw audio out of reply commands unless explicitly allowed", async () => {
    const calls = [];
    const provider = createProviderFromEnv({
      provider: "command",
      env: {
        VOICE_BRIDGE_TRANSCRIBE_COMMAND: "transcribe-local",
        VOICE_BRIDGE_REPLY_COMMAND: "reply-local",
      },
      runCommand: async (command, input) => {
        calls.push({ command, input: JSON.parse(input.toString("utf8")) });
        if (command === "transcribe-local") {
          return JSON.stringify({ transcript: "transcript only" });
        }
        return JSON.stringify({ reply: "reply ok" });
      },
    });

    await provider.transcribe({
      audio: Buffer.from([1, 2, 3]),
      metadata: { sampleRate: 16000, bits: 32, channels: 1, format: "pcm_s32le" },
    });
    await provider.reply({
      transcript: "transcript only",
      audio: Buffer.from([1, 2, 3]),
      metadata: { sampleRate: 16000, bits: 32, channels: 1, format: "pcm_s32le" },
    });

    assert.equal(calls[1].command, "reply-local");
    assert.equal("audio_base64" in calls[1].input, false);

    const allowedCalls = [];
    const providerWithAudio = createProviderFromEnv({
      provider: "command",
      env: {
        VOICE_BRIDGE_TRANSCRIBE_COMMAND: "transcribe-local",
        VOICE_BRIDGE_REPLY_COMMAND: "reply-local",
        VOICE_BRIDGE_REPLY_INCLUDE_AUDIO: "1",
      },
      runCommand: async (command, input) => {
        allowedCalls.push({ command, input: JSON.parse(input.toString("utf8")) });
        if (command === "transcribe-local") {
          return JSON.stringify({ transcript: "transcript with audio" });
        }
        return JSON.stringify({ reply: "reply ok" });
      },
    });

    await providerWithAudio.reply({
      transcript: "transcript with audio",
      audio: Buffer.from([1, 2, 3]),
      metadata: { sampleRate: 16000, bits: 32, channels: 1, format: "pcm_s32le" },
    });

    assert.equal(allowedCalls[0].command, "reply-local");
    assert.equal(allowedCalls[0].input.audio_base64, "AQID");
  });

  it("reports invalid JSON from command provider hooks", async () => {
    const provider = createProviderFromEnv({
      provider: "command",
      env: {
        VOICE_BRIDGE_TRANSCRIBE_COMMAND: "bad-transcribe",
        VOICE_BRIDGE_REPLY_COMMAND: "reply-local",
      },
      runCommand: async () => "not-json",
    });

    await assert.rejects(
      () => provider.transcribe({
        audio: Buffer.from([1]),
        metadata: { sampleRate: 16000, bits: 32, channels: 1, format: "pcm_s32le" },
      }),
      /bad-transcribe returned invalid JSON/,
    );
  });
});

describe("OpenAI voice command wrappers", () => {
  it("transcribes PCM payloads through the OpenAI audio transcription endpoint", async () => {
    const requests = [];
    const commands = createOpenAiVoiceCommands({
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_TRANSCRIBE_MODEL: "gpt-4o-mini-transcribe",
      },
      fetch: async (url, options) => {
        requests.push({ url, options });
        return {
          ok: true,
          status: 200,
          json: async () => ({ text: "你好，VibeBoard" }),
        };
      },
    });

    const result = await commands.transcribe({
      audio_base64: Buffer.from([1, 2, 3, 4]).toString("base64"),
      metadata: { sampleRate: 16000, bits: 16, channels: 1, format: "pcm_s16le" },
    });

    assert.deepEqual(result, { transcript: "你好，VibeBoard" });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.headers.authorization, "Bearer test-key");
    assert.equal(requests[0].options.body.get("model"), "gpt-4o-mini-transcribe");
    const file = requests[0].options.body.get("file");
    assert.equal(file.name, "vibeboard.pcm.wav");
    assert.equal(file.type, "audio/wav");
  });

  it("builds transcript-only replies through the OpenAI Responses endpoint", async () => {
    const requests = [];
    const commands = createOpenAiVoiceCommands({
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_REPLY_MODEL: "gpt-4.1-mini",
        OPENAI_REPLY_SYSTEM_PROMPT: "你是设备助手",
      },
      fetch: async (url, options) => {
        requests.push({ url, options });
        return {
          ok: true,
          status: 200,
          json: async () => ({ output_text: "已执行" }),
        };
      },
    });

    const result = await commands.reply({
      transcript: "打开天气",
      metadata: { replyLimit: 20 },
      audio_base64: Buffer.from([9, 9, 9]).toString("base64"),
    });

    assert.deepEqual(result, { reply: "已执行", ui_code: "" });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.openai.com/v1/responses");
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.headers.authorization, "Bearer test-key");
    const payload = JSON.parse(requests[0].options.body);
    assert.equal(payload.model, "gpt-4.1-mini");
    assert.equal(payload.input[0].content[0].text, "你是设备助手");
    assert.match(payload.input[1].content[0].text, /打开天气/);
    assert.equal(JSON.stringify(payload).includes("audio_base64"), false);
  });

  it("can build transcript-only replies through Chat Completions when configured", async () => {
    const requests = [];
    const commands = createOpenAiVoiceCommands({
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_REPLY_ENDPOINT: "chat_completions",
        OPENAI_REPLY_MODEL: "gpt-5.4-mini",
        OPENAI_REPLY_SYSTEM_PROMPT: "你是设备助手",
      },
      fetch: async (url, options) => {
        requests.push({ url, options });
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: "已执行" } }] }),
        };
      },
    });

    const result = await commands.reply({
      transcript: "打开天气",
      metadata: { replyLimit: 20 },
      audio_base64: Buffer.from([9, 9, 9]).toString("base64"),
    });

    assert.deepEqual(result, { reply: "已执行", ui_code: "" });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.openai.com/v1/chat/completions");
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.headers.authorization, "Bearer test-key");
    const payload = JSON.parse(requests[0].options.body);
    assert.equal(payload.model, "gpt-5.4-mini");
    assert.deepEqual(payload.messages[0], { role: "system", content: "你是设备助手" });
    assert.match(payload.messages[1].content, /打开天气/);
    assert.match(payload.messages[1].content, /20/);
    assert.equal(JSON.stringify(payload).includes("audio_base64"), false);
  });

  it("runs transcribe and reply command modes from JSON stdin payloads", async () => {
    const requests = [];
    const fetch = async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/audio/transcriptions")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ text: "语音文本" }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ output_text: "语音回复" }),
      };
    };

    assert.deepEqual(await runOpenAiVoiceCommand({
      mode: "transcribe",
      inputText: JSON.stringify({
        audio_base64: Buffer.from([1, 2, 3, 4]).toString("base64"),
        metadata: { sampleRate: 16000, bits: 16, channels: 1, format: "pcm_s16le" },
      }),
      env: { OPENAI_API_KEY: "test-key" },
      fetch,
    }), { transcript: "语音文本" });

    assert.deepEqual(await runOpenAiVoiceCommand({
      mode: "reply",
      inputText: JSON.stringify({
        transcript: "语音文本",
        metadata: { replyLimit: 24 },
        audio_base64: Buffer.from([9, 9, 9]).toString("base64"),
      }),
      env: { OPENAI_API_KEY: "test-key" },
      fetch,
    }), { reply: "语音回复", ui_code: "" });

    assert.equal(requests.length, 2);
    assert.equal(JSON.stringify(JSON.parse(requests[1].options.body)).includes("audio_base64"), false);
  });

  it("reports non-JSON OpenAI-compatible responses with endpoint context", async () => {
    const commands = createOpenAiVoiceCommands({
      env: { OPENAI_API_KEY: "test-key", OPENAI_BASE_URL: "https://voice.example/v1" },
      fetch: async () => ({
        ok: false,
        status: 404,
        headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/html" : null) },
        text: async () => "<html>not found</html>",
      }),
    });

    await assert.rejects(
      () => commands.transcribe({
        audio_base64: Buffer.from([1, 2, 3, 4]).toString("base64"),
        metadata: { sampleRate: 16000, bits: 16, channels: 1, format: "pcm_s16le" },
      }),
      /OpenAI transcription returned non-JSON response: HTTP 404 text\/html/,
    );
  });
});

describe("voice bridge one-shot runner", () => {
  it("runs the configured provider against a local audio file and writes JSON output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vibeboard-voice-"));
    const audioPath = join(dir, "sample.pcm");
    const outputPath = join(dir, "result.json");
    try {
      await writeFile(audioPath, Buffer.from([1, 2, 3, 4]));

      const result = await runOnceFile({
        audioPath,
        outputPath,
        metadata: { sampleRate: 8000, bits: 16, channels: 1, format: "pcm_s16le", replyLimit: 20 },
        transcribe: async ({ audio, metadata }) => `bytes=${audio.length},rate=${metadata.sampleRate}`,
        reply: async ({ transcript }) => ({ reply: `reply:${transcript}`, uiCode: "return function() end" }),
      });

      assert.deepEqual(result, {
        ok: true,
        transcript: "bytes=4,rate=8000",
        reply: "reply:bytes=4,rate=8000",
        ui_code: "return function() end",
      });
      assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), result);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("voice bridge http api", () => {
  it("returns a synchronous Chinese reply for raw PCM uploads", async () => {
    await withServer({
      transcribe: async ({ audio, metadata }) => `收到 ${audio.length} bytes @ ${metadata.sampleRate}`,
      reply: async ({ transcript }) => ({ reply: `已收到：${transcript}`, uiCode: "" }),
    }, async (server) => {
      const response = await requestJson(server, "/api/chat", {
        method: "POST",
        body: Buffer.from([1, 2, 3, 4]),
        headers: {
          "content-type": "application/octet-stream",
          "x-sample-rate": "16000",
          "x-bits": "32",
          "x-channels": "1",
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.json, {
        ok: true,
        transcript: "收到 4 bytes @ 16000",
        reply: "已收到：收到 4 bytes @ 16000",
        ui_code: "",
      });
    });
  });

  it("passes device audio metadata headers into the provider pipeline", async () => {
    const seen = [];
    await withServer({
      transcribe: async ({ audio, metadata }) => {
        seen.push({ stage: "transcribe", audioLength: audio.length, metadata });
        return `limit=${metadata.replyLimit}`;
      },
      reply: async ({ transcript, metadata }) => {
        seen.push({ stage: "reply", transcript, metadata });
        return { reply: `reply:${transcript}:${metadata.format}`, uiCode: "" };
      },
    }, async (server) => {
      const response = await requestJson(server, "/api/chat", {
        method: "POST",
        body: Buffer.from([1, 2, 3, 4, 5, 6]),
        headers: {
          "content-type": "application/octet-stream",
          "x-audio-format": "pcm_s32le",
          "x-sample-rate": "24000",
          "x-bits": "32",
          "x-channels": "1",
          "x-reply-limit": "42",
        },
      });

      assert.equal(response.status, 200);
      assert.equal(response.json.reply, "reply:limit=42:pcm_s32le");
      assert.deepEqual(seen, [
        {
          stage: "transcribe",
          audioLength: 6,
          metadata: {
            format: "pcm_s32le",
            sampleRate: 24000,
            bits: 32,
            channels: 1,
            replyLimit: 42,
          },
        },
        {
          stage: "reply",
          transcript: "limit=42",
          metadata: {
            format: "pcm_s32le",
            sampleRate: 24000,
            bits: 32,
            channels: 1,
            replyLimit: 42,
          },
        },
      ]);
    });
  });

  it("exposes debug stats for board voice smoke verification", async () => {
    await withServer({
      transcribe: async ({ audio, metadata }) => `bytes=${audio.length},bits=${metadata.bits}`,
      reply: async ({ transcript }) => ({ reply: `reply:${transcript}`, uiCode: "" }),
    }, async (server) => {
      const before = await requestJson(server, "/debug/stats");
      assert.equal(before.status, 200);
      assert.deepEqual(before.json, {
        ok: true,
        provider: "mock",
        chat_requests: 0,
        last_audio_bytes: 0,
        last_metadata: null,
        last_transcript: "",
        last_reply: "",
        last_ui_code: "",
        last_saved_audio: null,
        last_audio_quality: null,
      });

      await requestJson(server, "/api/chat", {
        method: "POST",
        body: Buffer.from([1, 2, 3, 4, 5]),
        headers: {
          "content-type": "application/octet-stream",
          "x-sample-rate": "16000",
          "x-bits": "32",
          "x-channels": "1",
        },
      });

      const after = await requestJson(server, "/debug/stats");
      assert.equal(after.status, 200);
      assert.deepEqual(after.json, {
        ok: true,
        provider: "mock",
        chat_requests: 1,
        last_audio_bytes: 5,
        last_metadata: {
          format: "pcm_s32le",
          sampleRate: 16000,
          bits: 32,
          channels: 1,
          replyLimit: 100,
        },
        last_transcript: "bytes=5,bits=32",
        last_reply: "reply:bytes=5,bits=32",
        last_ui_code: "",
        last_saved_audio: null,
        last_audio_quality: null,
      });
    });
  });

  it("saves uploaded audio as PCM, WAV, and metadata when configured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vibeboard-voice-save-"));
    try {
      await withServer({
        saveAudioDir: dir,
        transcribe: async ({ audio }) => `bytes=${audio.length}`,
        reply: async ({ transcript }) => ({ reply: `reply:${transcript}`, uiCode: "" }),
      }, async (server) => {
        const body = Buffer.from([1, 2, 3, 4]);
        const response = await requestJson(server, "/api/chat", {
          method: "POST",
          body,
          headers: {
            "content-type": "application/octet-stream",
            "x-audio-format": "pcm_s16le",
            "x-sample-rate": "16000",
            "x-bits": "16",
            "x-channels": "1",
          },
        });

        assert.equal(response.status, 200);
        assert.equal(response.json.transcript, "bytes=4");

        const files = (await readdir(dir)).sort();
        const pcmFile = files.find((file) => file.endsWith(".pcm"));
        const wavFile = files.find((file) => file.endsWith(".wav"));
        const jsonFile = files.find((file) => file.endsWith(".json"));
        assert.ok(pcmFile);
        assert.ok(wavFile);
        assert.ok(jsonFile);
        assert.deepEqual(await readFile(join(dir, pcmFile)), body);

        const wav = await readFile(join(dir, wavFile));
        assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
        assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
        assert.deepEqual(wav.subarray(44), body);

        const metadata = JSON.parse(await readFile(join(dir, jsonFile), "utf8"));
        assert.equal(metadata.audio_bytes, 4);
        assert.equal(metadata.pcm_path.endsWith(pcmFile), true);
        assert.equal(metadata.wav_path.endsWith(wavFile), true);
        assert.deepEqual(metadata.metadata, {
          format: "pcm_s16le",
          sampleRate: 16000,
          bits: 16,
          channels: 1,
          replyLimit: 100,
        });
        assert.equal(metadata.result.transcript, "bytes=4");
        assert.equal(metadata.result.reply, "reply:bytes=4");

        const stats = await requestJson(server, "/debug/stats");
        assert.equal(stats.status, 200);
        assert.equal(stats.json.last_saved_audio.pcm_path.endsWith(pcmFile), true);
        assert.equal(stats.json.last_saved_audio.wav_path.endsWith(wavFile), true);
        assert.equal(stats.json.last_saved_audio.json_path.endsWith(jsonFile), true);
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records basic PCM16 audio quality metrics for saved uploads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vibeboard-voice-quality-"));
    try {
      await withServer({
        saveAudioDir: dir,
        transcribe: async ({ audio }) => `bytes=${audio.length}`,
        reply: async ({ transcript }) => ({ reply: `reply:${transcript}`, uiCode: "" }),
      }, async (server) => {
        const body = Buffer.alloc(8);
        body.writeInt16LE(0, 0);
        body.writeInt16LE(16384, 2);
        body.writeInt16LE(-16384, 4);
        body.writeInt16LE(32767, 6);

        await requestJson(server, "/api/chat", {
          method: "POST",
          body,
          headers: {
            "content-type": "application/octet-stream",
            "x-audio-format": "pcm_s16le",
            "x-sample-rate": "16000",
            "x-bits": "16",
            "x-channels": "1",
          },
        });

        const jsonFile = (await readdir(dir)).find((file) => file.endsWith(".json"));
        assert.ok(jsonFile);
        const saved = JSON.parse(await readFile(join(dir, jsonFile), "utf8"));
        assert.equal(saved.audio_quality.supported, true);
        assert.equal(saved.audio_quality.sample_count, 4);
        assert.equal(saved.audio_quality.duration_seconds, 0.00025);
        assert.equal(saved.audio_quality.peak_abs, 32767);
        assert.equal(saved.audio_quality.peak_percent, 1);
        assert.equal(saved.audio_quality.silent_ratio, 0.25);
        assert.equal(saved.audio_quality.clipped_ratio, 0.25);
        assert.ok(saved.audio_quality.rms_abs > 20000);
        assert.ok(saved.audio_quality.rms_percent > 0.6);

        const stats = await requestJson(server, "/debug/stats");
        assert.equal(stats.json.last_audio_quality.peak_abs, 32767);
        assert.equal(stats.json.last_audio_quality.silent_ratio, 0.25);
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("still saves uploaded audio when transcription fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vibeboard-voice-save-fail-"));
    try {
      await withServer({
        saveAudioDir: dir,
        transcribe: async () => {
          throw new Error("speech unavailable");
        },
      }, async (server) => {
        const body = Buffer.from([5, 6, 7, 8]);
        const response = await requestJson(server, "/api/chat", {
          method: "POST",
          body,
          headers: {
            "content-type": "application/octet-stream",
            "x-audio-format": "pcm_s16le",
            "x-sample-rate": "16000",
            "x-bits": "16",
            "x-channels": "1",
          },
        });

        assert.equal(response.status, 500);
        assert.deepEqual(response.json, {
          ok: false,
          error: "speech unavailable",
          transcript: "",
          reply: "语音识别失败：speech unavailable",
          ui_code: "",
        });

        const files = (await readdir(dir)).sort();
        const pcmFile = files.find((file) => file.endsWith(".pcm"));
        const jsonFile = files.find((file) => file.endsWith(".json"));
        assert.ok(pcmFile);
        assert.ok(jsonFile);
        assert.deepEqual(await readFile(join(dir, pcmFile)), body);

        const metadata = JSON.parse(await readFile(join(dir, jsonFile), "utf8"));
        assert.equal(metadata.audio_bytes, 4);
        assert.deepEqual(metadata.result, { ok: false, error: "speech unavailable" });

        const stats = await requestJson(server, "/debug/stats");
        assert.equal(stats.status, 200);
        assert.equal(stats.json.last_saved_audio.json_path.endsWith(jsonFile), true);
        assert.equal(stats.json.last_transcript, "");
        assert.equal(stats.json.last_reply, "语音识别失败：speech unavailable");
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("hides command-provider internals from device-facing failure replies", async () => {
    await withServer({
      transcribe: async () => {
        throw new Error('command exited 1: {"error":"speech recognition failed: No speech detected"}');
      },
    }, async (server) => {
      const response = await requestJson(server, "/api/chat", {
        method: "POST",
        body: Buffer.from([1, 2, 3, 4]),
        headers: {
          "content-type": "application/octet-stream",
          "x-audio-format": "pcm_s16le",
          "x-sample-rate": "16000",
          "x-bits": "16",
          "x-channels": "1",
        },
      });

      assert.equal(response.status, 500);
      assert.equal(response.json.error, 'command exited 1: {"error":"speech recognition failed: No speech detected"}');
      assert.equal(response.json.reply, "没有识别到语音，请靠近麦克风再试一次");
      assert.equal(response.json.reply.includes("command exited"), false);
    });
  });

  it("exposes the active provider name through health and debug stats", async () => {
    await withServer({
      providerName: "command",
      transcribe: async () => "transcript",
      reply: async () => ({ reply: "reply", uiCode: "" }),
    }, async (server) => {
      const health = await requestJson(server, "/health");
      assert.equal(health.status, 200);
      assert.equal(health.json.provider, "command");

      const stats = await requestJson(server, "/debug/stats");
      assert.equal(stats.status, 200);
      assert.equal(stats.json.provider, "command");
      assert.equal(stats.json.last_ui_code, "");
    });
  });

  it("tracks the last returned ui_code in debug stats", async () => {
    await withServer({
      providerName: "command",
      transcribe: async () => "transcript",
      reply: async () => ({ reply: "reply", uiCode: "return function(ctx) return { screen = ctx.new_screen() } end" }),
    }, async (server) => {
      const chat = await requestJson(server, "/api/chat", {
        method: "POST",
        body: Buffer.from([1, 2, 3]),
        headers: { "content-type": "application/octet-stream" },
      });

      assert.equal(chat.status, 200);
      assert.equal(chat.json.ui_code, "return function(ctx) return { screen = ctx.new_screen() } end");

      const stats = await requestJson(server, "/debug/stats");
      assert.equal(stats.status, 200);
      assert.equal(stats.json.last_ui_code, "return function(ctx) return { screen = ctx.new_screen() } end");
    });
  });

  it("supports pending jobs through /api/result", async () => {
    await withServer({
      asyncMode: true,
      transcribe: async () => "测试语音",
      reply: async () => ({ reply: "测试回复", uiCode: "return function(ctx) return { screen = ctx.new_screen() } end" }),
    }, async (server) => {
      const chat = await requestJson(server, "/api/chat", {
        method: "POST",
        body: Buffer.from([1, 2]),
        headers: { "content-type": "application/octet-stream" },
      });

      assert.equal(chat.status, 200);
      assert.equal(chat.json.ok, true);
      assert.equal(chat.json.pending, true);
      assert.match(chat.json.id, /^voice-/);

      const result = await requestJson(server, `/api/result?id=${encodeURIComponent(chat.json.id)}`);
      assert.equal(result.status, 200);
      assert.equal(result.json.ok, true);
      assert.equal(result.json.pending, false);
      assert.equal(result.json.transcript, "测试语音");
      assert.equal(result.json.reply, "测试回复");
      assert.match(result.json.ui_code, /ctx\.new_screen/);
    });
  });

  it("returns clear errors for missing audio and unknown jobs", async () => {
    await withServer({}, async (server) => {
      const empty = await requestJson(server, "/api/chat", { method: "POST" });
      assert.equal(empty.status, 400);
      assert.deepEqual(empty.json, { ok: false, error: "empty audio body" });

      const missing = await requestJson(server, "/api/result?id=voice-missing");
      assert.equal(missing.status, 404);
      assert.deepEqual(missing.json, { ok: false, error: "result not found" });
    });
  });
});
