import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { request as httpRequest } from "node:http";
import { createVoiceBridgeServer, parseArgs } from "./server.mjs";

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
    assert.deepEqual(parseArgs(["--host", "0.0.0.0", "--port", "8790", "--async"]), {
      host: "0.0.0.0",
      port: 8790,
      async: true,
    });
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
