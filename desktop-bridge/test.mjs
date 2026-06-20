import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { request as httpRequest } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProviderFromEnv, createVoiceBridgeServer, parseArgs, runOnceFile } from "./server.mjs";

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
