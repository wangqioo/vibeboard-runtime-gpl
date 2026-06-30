import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8790;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function pcmToWav(audio, metadata = {}) {
  const sampleRate = Number.isFinite(metadata.sampleRate) ? metadata.sampleRate : 16000;
  const bits = Number.isFinite(metadata.bits) ? metadata.bits : 16;
  const channels = Number.isFinite(metadata.channels) ? metadata.channels : 1;
  if (bits !== 16) {
    throw new Error(`WAV save supports pcm_s16le only; got ${bits}-bit PCM`);
  }
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + audio.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(audio.length, 40);
  return Buffer.concat([header, audio]);
}

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function roundMetric(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function analyzeAudioQuality(audio, metadata = {}) {
  const bits = Number.isFinite(metadata.bits) ? metadata.bits : 0;
  const channels = Number.isFinite(metadata.channels) ? metadata.channels : 1;
  const sampleRate = Number.isFinite(metadata.sampleRate) ? metadata.sampleRate : 0;
  if (bits !== 16 || audio.length < 2) {
    return {
      supported: false,
      reason: bits === 16 ? "empty audio" : `unsupported bit depth: ${bits}`,
    };
  }

  const sampleCount = Math.floor(audio.length / 2);
  let peakAbs = 0;
  let sumSquares = 0;
  let silentSamples = 0;
  let clippedSamples = 0;
  const silentThreshold = 256;

  for (let offset = 0; offset + 1 < audio.length; offset += 2) {
    const sample = audio.readInt16LE(offset);
    const abs = Math.abs(sample);
    if (abs > peakAbs) peakAbs = abs;
    sumSquares += sample * sample;
    if (abs <= silentThreshold) silentSamples += 1;
    if (abs >= 32760) clippedSamples += 1;
  }

  const rmsAbs = Math.sqrt(sumSquares / sampleCount);
  const frameRate = sampleRate > 0 && channels > 0 ? sampleRate * channels : 0;
  return {
    supported: true,
    sample_count: sampleCount,
    duration_seconds: frameRate > 0 ? roundMetric(sampleCount / frameRate) : 0,
    peak_abs: peakAbs,
    peak_percent: roundMetric(peakAbs / 32767),
    rms_abs: roundMetric(rmsAbs, 3),
    rms_percent: roundMetric(rmsAbs / 32767),
    silent_ratio: roundMetric(silentSamples / sampleCount),
    clipped_ratio: roundMetric(clippedSamples / sampleCount),
  };
}

async function saveAudioCapture({ dir, audio, metadata, result = null }) {
  if (!dir) {
    return null;
  }
  const absoluteDir = resolve(dir);
  await mkdir(absoluteDir, { recursive: true });
  const id = `${timestampForFilename()}-${randomUUID().slice(0, 8)}`;
  const pcmPath = join(absoluteDir, `${id}.pcm`);
  const wavPath = join(absoluteDir, `${id}.wav`);
  const jsonPath = join(absoluteDir, `${id}.json`);
  const record = {
    id,
    created_at: new Date().toISOString(),
    audio_bytes: audio.length,
    metadata,
    audio_quality: analyzeAudioQuality(audio, metadata),
    pcm_path: pcmPath,
    wav_path: wavPath,
    json_path: jsonPath,
    result,
  };

  await writeFile(pcmPath, audio);
  await writeFile(wavPath, pcmToWav(audio, metadata));
  await writeFile(jsonPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

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

function deviceFacingErrorReply(error) {
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();
  if (lower.includes("no speech detected") || lower.includes("empty transcript")) {
    return "没有识别到语音，请靠近麦克风再试一次";
  }
  if (lower.includes("speech recognition timed out")) {
    return "语音识别超时，请再说一次";
  }
  if (lower.includes("speech recognition permission")) {
    return "电脑端没有语音识别权限，请允许后再试";
  }
  if (lower.includes("command exited") || lower.includes("returned invalid json")) {
    return "电脑端语音识别失败，请查看后端日志";
  }
  return `语音识别失败：${message || "未知错误"}`;
}

function runShellCommand(command, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      if (code !== 0) {
        const errorText = Buffer.concat(stderr).toString("utf8") || output;
        reject(new Error(`command exited ${code}: ${errorText.trim()}`));
        return;
      }
      resolve(output);
    });
    child.stdin.end(input);
  });
}

function parseCommandJson(command, raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${command} returned invalid JSON: ${error.message}`);
  }
}

function envFlagEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
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

export async function runOnceFile({
  audioPath,
  outputPath = "",
  metadata = {},
  transcribe = defaultTranscribe,
  reply = defaultReply,
} = {}) {
  if (!audioPath) {
    throw new Error("--once-file requires an audio file path");
  }
  const audio = await readFile(audioPath);
  if (audio.length === 0) {
    throw new Error("empty audio file");
  }
  const result = await runJob({ audio, metadata: normalizeMetadata(metadata), transcribe, reply });
  if (outputPath) {
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  return result;
}

function createJobId() {
  return `voice-${randomUUID()}`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = { host: DEFAULT_HOST, port: DEFAULT_PORT, async: false, provider: "mock" };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--host") {
      options.host = argv[++index] || DEFAULT_HOST;
    } else if (arg === "--port") {
      options.port = Number.parseInt(argv[++index] || String(DEFAULT_PORT), 10);
    } else if (arg === "--async") {
      options.async = true;
    } else if (arg === "--provider") {
      options.provider = argv[++index] || "mock";
    } else if (arg.startsWith("--provider=")) {
      options.provider = arg.slice("--provider=".length);
    } else if (arg === "--once-file") {
      options.onceFile = argv[++index] || "";
    } else if (arg.startsWith("--once-file=")) {
      options.onceFile = arg.slice("--once-file=".length);
    } else if (arg === "--output") {
      options.output = argv[++index] || "";
    } else if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    } else if (arg === "--sample-rate") {
      options.metadata = { ...options.metadata, sampleRate: Number.parseInt(argv[++index] || "", 10) };
    } else if (arg === "--bits") {
      options.metadata = { ...options.metadata, bits: Number.parseInt(argv[++index] || "", 10) };
    } else if (arg === "--channels") {
      options.metadata = { ...options.metadata, channels: Number.parseInt(argv[++index] || "", 10) };
    } else if (arg === "--format") {
      options.metadata = { ...options.metadata, format: argv[++index] || "" };
    } else if (arg === "--reply-limit") {
      options.metadata = { ...options.metadata, replyLimit: Number.parseInt(argv[++index] || "", 10) };
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!["mock", "command"].includes(options.provider)) {
    throw new Error(`Unsupported provider: ${options.provider}`);
  }
  if (!Number.isFinite(options.port) || options.port <= 0 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (options.onceFile === "") {
    throw new Error("--once-file requires an audio file path");
  }
  if (options.metadata) {
    options.metadata = normalizeMetadata(options.metadata);
  }
  return options;
}

function normalizeMetadata(metadata = {}) {
  const sampleRate = Number.isFinite(metadata.sampleRate) ? metadata.sampleRate : 16000;
  const bits = Number.isFinite(metadata.bits) ? metadata.bits : 32;
  const channels = Number.isFinite(metadata.channels) ? metadata.channels : 1;
  const replyLimit = Number.isFinite(metadata.replyLimit) ? metadata.replyLimit : 100;
  return {
    sampleRate,
    bits,
    channels,
    format: metadata.format || "pcm_s32le",
    replyLimit,
  };
}

export function createProviderFromEnv({
  provider = "mock",
  env = process.env,
  runCommand = runShellCommand,
} = {}) {
  if (provider === "mock") {
    return {
      providerName: "mock",
      transcribe: defaultTranscribe,
      reply: defaultReply,
    };
  }

  if (provider !== "command") {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (!env.VOICE_BRIDGE_TRANSCRIBE_COMMAND || !env.VOICE_BRIDGE_REPLY_COMMAND) {
    throw new Error("VOICE_BRIDGE_TRANSCRIBE_COMMAND and VOICE_BRIDGE_REPLY_COMMAND are required for command provider");
  }

  const includeAudioInReply = envFlagEnabled(env.VOICE_BRIDGE_REPLY_INCLUDE_AUDIO);

  return {
    providerName: "command",
    transcribe: async ({ audio, metadata }) => {
      const payload = {
        audio_base64: audio.toString("base64"),
        metadata,
      };
      const raw = await runCommand(
        env.VOICE_BRIDGE_TRANSCRIBE_COMMAND,
        Buffer.from(`${JSON.stringify(payload)}\n`, "utf8"),
      );
      const result = parseCommandJson(env.VOICE_BRIDGE_TRANSCRIBE_COMMAND, raw);
      if (typeof result.transcript !== "string" || result.transcript === "") {
        throw new Error(`${env.VOICE_BRIDGE_TRANSCRIBE_COMMAND} must return {"transcript":"..."}`);
      }
      return result.transcript;
    },
    reply: async ({ transcript, audio, metadata }) => {
      const payload = { transcript, metadata };
      if (includeAudioInReply && audio) {
        payload.audio_base64 = audio.toString("base64");
      }
      const raw = await runCommand(
        env.VOICE_BRIDGE_REPLY_COMMAND,
        Buffer.from(`${JSON.stringify(payload)}\n`, "utf8"),
      );
      const result = parseCommandJson(env.VOICE_BRIDGE_REPLY_COMMAND, raw);
      if (typeof result.reply !== "string" || result.reply === "") {
        throw new Error(`${env.VOICE_BRIDGE_REPLY_COMMAND} must return {"reply":"..."}`);
      }
      return {
        reply: result.reply,
        uiCode: typeof result.uiCode === "string" ? result.uiCode : (typeof result.ui_code === "string" ? result.ui_code : ""),
      };
    },
  };
}

export function createVoiceBridgeServer({
  asyncMode = false,
  providerName = "mock",
  transcribe = defaultTranscribe,
  reply = defaultReply,
  saveAudioDir = process.env.VOICE_BRIDGE_SAVE_AUDIO_DIR || "",
} = {}) {
  const jobs = new Map();
  const stats = {
    chatRequests: 0,
    lastAudioBytes: 0,
    lastMetadata: null,
    lastTranscript: "",
    lastReply: "",
    lastUiCode: "",
    lastSavedAudio: null,
    lastAudioQuality: null,
  };

  async function runTrackedJob({ audio, metadata }) {
    stats.chatRequests += 1;
    stats.lastAudioBytes = audio.length;
    stats.lastMetadata = metadata;
    try {
      const result = await runJob({ audio, metadata, transcribe, reply });
      stats.lastTranscript = result.transcript || "";
      stats.lastReply = result.reply || "";
      stats.lastUiCode = result.ui_code || "";
      stats.lastSavedAudio = await saveAudioCapture({ dir: saveAudioDir, audio, metadata, result });
      stats.lastAudioQuality = stats.lastSavedAudio?.audio_quality || null;
      return result;
    } catch (error) {
      stats.lastTranscript = "";
      stats.lastReply = deviceFacingErrorReply(error);
      stats.lastUiCode = "";
      stats.lastSavedAudio = await saveAudioCapture({
        dir: saveAudioDir,
        audio,
        metadata,
        result: { ok: false, error: error.message },
      });
      stats.lastAudioQuality = stats.lastSavedAudio?.audio_quality || null;
      throw error;
    }
  }

  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    try {
      if (url.pathname === "/health" && request.method === "GET") {
        jsonResponse(response, 200, { ok: true, service: "vibeboard-voice-bridge", provider: providerName });
        return;
      }

      if (url.pathname === "/debug/stats" && request.method === "GET") {
        jsonResponse(response, 200, {
          ok: true,
          provider: providerName,
          chat_requests: stats.chatRequests,
          last_audio_bytes: stats.lastAudioBytes,
          last_metadata: stats.lastMetadata,
          last_transcript: stats.lastTranscript,
          last_reply: stats.lastReply,
          last_ui_code: stats.lastUiCode,
          last_saved_audio: stats.lastSavedAudio,
          last_audio_quality: stats.lastAudioQuality,
        });
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
          jsonResponse(response, 200, await runTrackedJob({ audio, metadata }));
          return;
        }

        const id = createJobId();
        jobs.set(id, {
          status: "pending",
          result: null,
        });
        runTrackedJob({ audio, metadata })
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
      jsonResponse(response, 500, {
        ok: false,
        error: error.message,
        transcript: "",
        reply: deviceFacingErrorReply(error),
        ui_code: "",
      });
    }
  });
}

function printHelp() {
  console.log("Usage: node desktop-bridge/server.mjs [--host 127.0.0.1] [--port 8790] [--async] [--provider mock|command]");
  console.log("       node desktop-bridge/server.mjs --once-file sample.pcm [--output result.json] [--sample-rate 16000] [--bits 32] [--channels 1] [--format pcm_s32le] [--reply-limit 100] [--provider mock|command]");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let parsedArgs = false;
  try {
    const options = parseArgs();
    parsedArgs = true;
    if (options.help) {
      printHelp();
    } else {
      const provider = createProviderFromEnv({ provider: options.provider });
      if (options.onceFile) {
        const result = await runOnceFile({
          audioPath: options.onceFile,
          outputPath: options.output,
          metadata: options.metadata,
          ...provider,
        });
        console.log(JSON.stringify(result, null, 2));
      } else {
        const server = createVoiceBridgeServer({ asyncMode: options.async, ...provider });
        server.listen(options.port, options.host, () => {
          console.log(`VibeBoard voice bridge: http://${options.host}:${options.port} provider=${options.provider}`);
        });
      }
    }
  } catch (error) {
    console.error(error.message);
    if (!parsedArgs) {
      printHelp();
    }
    process.exitCode = 1;
  }
}
