import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8790;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function jsonResponse(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function collectBody(request, maxBytes = MAX_AUDIO_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`audio body exceeds ${maxBytes} bytes`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseMetadata(request) {
  const sampleRate = Number.parseInt(request.headers["x-sample-rate"] || "16000", 10);
  const bits = Number.parseInt(request.headers["x-bits"] || "32", 10);
  const channels = Number.parseInt(request.headers["x-channels"] || "1", 10);
  const replyLimit = Number.parseInt(request.headers["x-reply-limit"] || "100", 10);
  return {
    format: request.headers["x-audio-format"] || "pcm_s32le",
    sampleRate: Number.isFinite(sampleRate) ? sampleRate : 16000,
    bits: Number.isFinite(bits) ? bits : 32,
    channels: Number.isFinite(channels) ? channels : 1,
    replyLimit: Number.isFinite(replyLimit) ? replyLimit : 100,
  };
}

async function defaultTranscribe({ audio, metadata }) {
  const seconds = metadata.sampleRate > 0 && metadata.bits > 0 && metadata.channels > 0
    ? audio.length / (metadata.sampleRate * (metadata.bits / 8) * metadata.channels)
    : 0;
  return `收到 ${audio.length} 字节音频，约 ${seconds.toFixed(1)} 秒`;
}

async function defaultReply({ transcript }) {
  return {
    reply: `我已收到录音：${transcript}`,
    uiCode: "",
  };
}

async function runJob({ audio, metadata, transcribe, reply }) {
  const transcript = await transcribe({ audio, metadata });
  const result = await reply({ transcript, audio, metadata });
  return {
    ok: true,
    transcript,
    reply: result?.reply || "没有回复",
    ui_code: typeof result?.uiCode === "string" ? result.uiCode : "",
  };
}

function createJobId() {
  return `voice-${randomUUID()}`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = { host: DEFAULT_HOST, port: DEFAULT_PORT, async: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--host") {
      options.host = argv[++index] || DEFAULT_HOST;
    } else if (arg === "--port") {
      options.port = Number.parseInt(argv[++index] || String(DEFAULT_PORT), 10);
    } else if (arg === "--async") {
      options.async = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(options.port) || options.port <= 0 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  return options;
}

export function createVoiceBridgeServer({
  asyncMode = false,
  transcribe = defaultTranscribe,
  reply = defaultReply,
} = {}) {
  const jobs = new Map();

  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    try {
      if (url.pathname === "/health" && request.method === "GET") {
        jsonResponse(response, 200, { ok: true, service: "vibeboard-voice-bridge" });
        return;
      }

      if (url.pathname === "/api/chat" && request.method === "POST") {
        const audio = await collectBody(request);
        if (audio.length === 0) {
          jsonResponse(response, 400, { ok: false, error: "empty audio body" });
          return;
        }
        const metadata = parseMetadata(request);
        if (!asyncMode) {
          jsonResponse(response, 200, await runJob({ audio, metadata, transcribe, reply }));
          return;
        }

        const id = createJobId();
        jobs.set(id, {
          status: "pending",
          result: null,
        });
        runJob({ audio, metadata, transcribe, reply })
          .then((result) => jobs.set(id, { status: "done", result }))
          .catch((error) => jobs.set(id, { status: "done", result: { ok: false, error: error.message } }));
        jsonResponse(response, 200, { ok: true, pending: true, id });
        return;
      }

      if (url.pathname === "/api/result" && request.method === "GET") {
        const id = url.searchParams.get("id") || "";
        const job = jobs.get(id);
        if (!job) {
          jsonResponse(response, 404, { ok: false, error: "result not found" });
          return;
        }
        if (job.status !== "done") {
          jsonResponse(response, 200, { ok: true, pending: true, id });
          return;
        }
        jobs.delete(id);
        jsonResponse(response, 200, { pending: false, ...job.result });
        return;
      }

      jsonResponse(response, 404, { ok: false, error: "not found" });
    } catch (error) {
      jsonResponse(response, 500, { ok: false, error: error.message });
    }
  });
}

function printHelp() {
  console.log("Usage: node desktop-bridge/server.mjs [--host 127.0.0.1] [--port 8790] [--async]");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs();
    if (options.help) {
      printHelp();
    } else {
      const server = createVoiceBridgeServer({ asyncMode: options.async });
      server.listen(options.port, options.host, () => {
        console.log(`VibeBoard voice bridge: http://${options.host}:${options.port}`);
      });
    }
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exitCode = 1;
  }
}
