import { pathToFileURL } from "node:url";
import { sendRequest } from "../app-uploader/index.mjs";

const DEFAULT_BOARD_URL = "http://192.168.1.32:8080";
const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8790";
const DEFAULT_APP_ID = "voice_ai";
const DEFAULT_RECORD_MS = 1500;
const DEFAULT_POLLS = 20;
const DEFAULT_READY_POLLS = 40;
const DEFAULT_INTERVAL_MS = 500;

function usage() {
  console.error("Usage: node tools/voice-ai-smoke/index.mjs [--board <url>] [--bridge <url>]");
  console.error("Options:");
  console.error("  --board <url>       Board install-service URL, default http://192.168.1.32:8080");
  console.error("  --bridge <url>      Desktop bridge URL, default http://127.0.0.1:8790");
  console.error("  --app <id>          App id, default voice_ai");
  console.error("  --record-ms <ms>    Delay between HOME start and HOME stop/send, default 1500");
  console.error("  --polls <count>     Bridge stats polls, default 20");
  console.error("  --ready-polls <count> App readiness polls, default 40");
  console.error("  --interval-ms <ms>  Delay between stats polls, default 500");
  console.error("  --min-audio-bytes <n> Minimum last_audio_bytes, default 1");
  console.error("  --require-gif      Require voice_ai metrics to show an enabled visible GIF before recording");
  console.error("  --require-font     Require voice_ai metrics to show a loaded custom font before recording");
  console.error("  --require-ui-code   Require the bridge reply to return non-empty ui_code");
  console.error("  --require-ai-ui    Require voice_ai metrics to show an active AI UI snippet");
  console.error("  --require-bridge-provider <name> Require bridge /debug/stats provider, e.g. command");
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function parseNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return number;
}

function parsePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return number;
}

export function parseVoiceAiSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    boardUrl: DEFAULT_BOARD_URL,
    bridgeUrl: DEFAULT_BRIDGE_URL,
    appId: DEFAULT_APP_ID,
    recordMs: DEFAULT_RECORD_MS,
    polls: DEFAULT_POLLS,
    readyPolls: DEFAULT_READY_POLLS,
    intervalMs: DEFAULT_INTERVAL_MS,
    minAudioBytes: 1,
    requireGif: false,
    requireFont: false,
    requireUiCode: false,
    requireAiUi: false,
    requireBridgeProvider: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--board") {
      options.boardUrl = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--board=")) {
      options.boardUrl = arg.slice("--board=".length);
      continue;
    }
    if (arg === "--bridge") {
      options.bridgeUrl = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--bridge=")) {
      options.bridgeUrl = arg.slice("--bridge=".length);
      continue;
    }
    if (arg === "--app") {
      options.appId = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--app=")) {
      options.appId = arg.slice("--app=".length);
      continue;
    }
    if (arg === "--record-ms") {
      options.recordMs = parseNonNegativeInteger(argv[++i], "--record-ms");
      continue;
    }
    if (arg.startsWith("--record-ms=")) {
      options.recordMs = parseNonNegativeInteger(arg.slice("--record-ms=".length), "--record-ms");
      continue;
    }
    if (arg === "--polls") {
      options.polls = parsePositiveInteger(argv[++i], "--polls");
      continue;
    }
    if (arg.startsWith("--polls=")) {
      options.polls = parsePositiveInteger(arg.slice("--polls=".length), "--polls");
      continue;
    }
    if (arg === "--ready-polls") {
      options.readyPolls = parsePositiveInteger(argv[++i], "--ready-polls");
      continue;
    }
    if (arg.startsWith("--ready-polls=")) {
      options.readyPolls = parsePositiveInteger(arg.slice("--ready-polls=".length), "--ready-polls");
      continue;
    }
    if (arg === "--interval-ms") {
      options.intervalMs = parseNonNegativeInteger(argv[++i], "--interval-ms");
      continue;
    }
    if (arg.startsWith("--interval-ms=")) {
      options.intervalMs = parseNonNegativeInteger(arg.slice("--interval-ms=".length), "--interval-ms");
      continue;
    }
    if (arg === "--min-audio-bytes") {
      options.minAudioBytes = parsePositiveInteger(argv[++i], "--min-audio-bytes");
      continue;
    }
    if (arg.startsWith("--min-audio-bytes=")) {
      options.minAudioBytes = parsePositiveInteger(arg.slice("--min-audio-bytes=".length), "--min-audio-bytes");
      continue;
    }
    if (arg === "--require-gif") {
      options.requireGif = true;
      continue;
    }
    if (arg === "--require-font") {
      options.requireFont = true;
      continue;
    }
    if (arg === "--require-ui-code") {
      options.requireUiCode = true;
      continue;
    }
    if (arg === "--require-ai-ui") {
      options.requireAiUi = true;
      continue;
    }
    if (arg === "--require-bridge-provider") {
      options.requireBridgeProvider = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--require-bridge-provider=")) {
      options.requireBridgeProvider = arg.slice("--require-bridge-provider=".length);
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.help && !options.boardUrl) throw new Error("--board is required");
  if (!options.help && !options.bridgeUrl) throw new Error("--bridge is required");
  if (!options.help && !options.appId) throw new Error("--app is required");
  if (!options.help && options.requireBridgeProvider === true) throw new Error("--require-bridge-provider requires a value");
  return options;
}

async function requestJson({ url, method, requestImpl }) {
  let response;
  try {
    response = await requestImpl(url, Buffer.alloc(0), { method });
  } catch (error) {
    throw new Error(`${method} ${url} failed: ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${response.text || ""}`.trim());
  }
  return JSON.parse(response.text || "{}");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function injectHome(baseUrl, requestImpl) {
  return requestJson({
    url: `${baseUrl}/input/key?code=HOME&event=SHORT`,
    method: "POST",
    requestImpl,
  });
}

async function readOptionalJson(url, requestImpl) {
  const response = await requestImpl(url, Buffer.alloc(0), { method: "GET" });
  if (!response.ok) {
    return null;
  }
  return JSON.parse(response.text || "{}");
}

async function waitForActiveApp({ boardBase, appId, polls, intervalMs, requestImpl }) {
  let lastStatus = null;
  for (let i = 0; i < polls; i++) {
    lastStatus = await readOptionalJson(`${boardBase}/status`, requestImpl);
    if (lastStatus?.state === "running" && lastStatus?.current_app === appId) {
      return lastStatus;
    }
    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }
  throw new Error(`expected ${appId} to become active before HOME injection; last status=${JSON.stringify(lastStatus)}`);
}

async function waitForCurrentApp({ boardBase, appId, polls, intervalMs, requestImpl }) {
  let lastStatus = null;
  for (let i = 0; i < polls; i++) {
    lastStatus = await readOptionalJson(`${boardBase}/status`, requestImpl);
    if (lastStatus?.current_app === appId) {
      return lastStatus;
    }
    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }
  throw new Error(`expected ${appId} to be the current app before HOME injection; last status=${JSON.stringify(lastStatus)}`);
}

async function safeStop({ boardBase, appId, requestImpl }) {
  try {
    await requestImpl(`${boardBase}/stop`, Buffer.alloc(0), { method: "POST" });
    return;
  } catch (error) {
    const status = await readOptionalJson(`${boardBase}/status`, requestImpl);
    if (!status || (status.state === "running" && status.current_app === appId)) {
      throw error;
    }
  }
}

async function launchAppWithActiveFallback({ boardBase, appId, polls, intervalMs, requestImpl }) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await requestJson({
        url: `${boardBase}/launch?app=${encodeURIComponent(appId)}`,
        method: "POST",
        requestImpl,
      });
      return { ok: true, launched: appId, launchAttempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      try {
        await waitForCurrentApp({ boardBase, appId, polls, intervalMs, requestImpl });
        return { ok: true, launched: appId, active_confirmed: true, recovered_from_launch_error: error.message, launchAttempts: attempt + 1 };
      } catch {
        if (attempt < 1) {
          if (intervalMs > 0) {
            await wait(intervalMs);
          }
          continue;
        }
        throw lastError;
      }
    }
  }
  throw lastError;
}

async function readOptionalText(url, requestImpl) {
  const response = await requestImpl(url, Buffer.alloc(0), { method: "GET" });
  if (!response.ok) {
    return null;
  }
  return response.text || "{}";
}

async function waitForVoiceAiReady({ boardBase, appId, polls, intervalMs, staleMetricsText = null, requestImpl }) {
  const metricsUrl = `${boardBase}/apps/file?app=${encodeURIComponent(appId)}&path=metrics.json`;
  let lastMetrics = null;
  for (let i = 0; i < polls; i++) {
    const metricsText = await readOptionalText(metricsUrl, requestImpl);
    const allowSameAsStale = i > 0;
    if (metricsText != null && (metricsText !== staleMetricsText || allowSameAsStale)) {
      lastMetrics = JSON.parse(metricsText);
    }
    if (lastMetrics && lastMetrics.mode === "idle" && lastMetrics.init_stage === "ready") {
      return lastMetrics;
    }
    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }
  throw new Error(`expected ${appId} to become ready and idle before HOME injection; last metrics=${JSON.stringify(lastMetrics)}`);
}

function hasVisibleGifMetrics(metrics) {
  return metrics?.use_gif === true &&
    metrics?.gif_visible === true &&
    typeof metrics?.gif_state === "string" &&
    metrics.gif_state.length > 0 &&
    typeof metrics?.gif_src === "string" &&
    metrics.gif_src.endsWith(".gif");
}

function hasLoadedFontMetrics(metrics) {
  return metrics?.font_loaded === true &&
    Number(metrics?.font_handle || 0) > 1024 &&
    typeof metrics?.font_src === "string" &&
    metrics.font_src.endsWith(".bin") &&
    (metrics.font_error || "") === "";
}

function assertBridgeProvider(stats, requiredProvider) {
  if (!requiredProvider) {
    return;
  }
  if (stats?.provider !== requiredProvider) {
    throw new Error(`expected bridge provider ${requiredProvider}; stats=${JSON.stringify(stats)}`);
  }
}

export async function runVoiceAiSmoke({
  boardUrl,
  bridgeUrl,
  appId = DEFAULT_APP_ID,
  recordMs = DEFAULT_RECORD_MS,
  polls = DEFAULT_POLLS,
  readyPolls = DEFAULT_READY_POLLS,
  intervalMs = DEFAULT_INTERVAL_MS,
  minAudioBytes = 1,
  requireGif = false,
  requireFont = false,
  requireUiCode = false,
  requireAiUi = false,
  requireBridgeProvider = "",
  requestImpl = sendRequest,
} = {}) {
  if (!boardUrl) throw new Error("boardUrl is required");
  if (!bridgeUrl) throw new Error("bridgeUrl is required");
  if (!appId) throw new Error("appId is required");

  const boardBase = normalizeBaseUrl(boardUrl);
  const bridgeBase = normalizeBaseUrl(bridgeUrl);
  const before = await requestJson({
    url: `${bridgeBase}/debug/stats`,
    method: "GET",
    requestImpl,
  });
  assertBridgeProvider(before, requireBridgeProvider);
  await safeStop({ boardBase, appId, requestImpl });
  const metricsUrl = `${boardBase}/apps/file?app=${encodeURIComponent(appId)}&path=metrics.json`;
  const staleMetricsText = await readOptionalText(metricsUrl, requestImpl);
  const launch = await launchAppWithActiveFallback({ boardBase, appId, polls: readyPolls, intervalMs, requestImpl });
  const activeStatus = await waitForCurrentApp({ boardBase, appId, polls: readyPolls, intervalMs, requestImpl });
  const readyMetrics = await waitForVoiceAiReady({ boardBase, appId, polls: readyPolls, intervalMs, staleMetricsText, requestImpl });
  if (requireGif && !hasVisibleGifMetrics(readyMetrics)) {
    throw new Error(`expected ${appId} GIF metrics to show enabled visible GIF; metrics=${JSON.stringify(readyMetrics)}`);
  }
  if (requireFont && !hasLoadedFontMetrics(readyMetrics)) {
    throw new Error(`expected ${appId} font metrics to show a loaded custom font; metrics=${JSON.stringify(readyMetrics)}`);
  }
  await injectHome(boardBase, requestImpl);
  if (recordMs > 0) {
    await wait(recordMs);
  }
  await injectHome(boardBase, requestImpl);

  let after = null;
  for (let i = 0; i < polls; i++) {
    after = await requestJson({
      url: `${bridgeBase}/debug/stats`,
      method: "GET",
      requestImpl,
    });
    assertBridgeProvider(after, requireBridgeProvider);
    if (
      Number(after.chat_requests) > Number(before.chat_requests || 0) &&
      Number(after.last_audio_bytes || 0) >= minAudioBytes
    ) {
      const status = await requestJson({
        url: `${boardBase}/status`,
        method: "GET",
        requestImpl,
      });
      if (requireUiCode || requireAiUi) {
        if (!resultHasUiCode(after)) {
          throw new Error(`expected bridge reply to return ui_code; after=${JSON.stringify(after)}`);
        }
      }
      if (requireAiUi) {
        const snippetMetrics = await waitForSnippetMetrics({
          boardBase,
          appId,
          polls: readyPolls,
          intervalMs,
          requestImpl,
        });
        return {
          appId,
          launchAttempts: launch.launchAttempts || 1,
          chatRequestsBefore: Number(before.chat_requests || 0),
          chatRequestsAfter: Number(after.chat_requests || 0),
          audioBytes: Number(after.last_audio_bytes || 0),
          transcript: after.last_transcript || "",
          reply: after.last_reply || "",
          uiCode: after.last_ui_code || "",
          readyMetrics,
          snippetMetrics,
          bridgeProvider: after.provider || before.provider || "",
          status,
          activeStatus,
        };
      }
      return {
        appId,
        launchAttempts: launch.launchAttempts || 1,
        chatRequestsBefore: Number(before.chat_requests || 0),
        chatRequestsAfter: Number(after.chat_requests || 0),
        audioBytes: Number(after.last_audio_bytes || 0),
        transcript: after.last_transcript || "",
        reply: after.last_reply || "",
        uiCode: after.last_ui_code || "",
        readyMetrics,
        bridgeProvider: after.provider || before.provider || "",
        status,
        activeStatus,
      };
    }
    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }

  const appMetrics = await readOptionalJson(metricsUrl, requestImpl);
  throw new Error(
    `expected bridge chat_requests to increase and last_audio_bytes >= ${minAudioBytes}; ` +
      `before=${JSON.stringify(before)} after=${JSON.stringify(after)} metrics=${JSON.stringify(appMetrics)}`,
  );
}

function resultHasUiCode(stats) {
  return typeof stats?.last_ui_code === "string" && stats.last_ui_code.trim() !== "";
}

async function waitForSnippetMetrics({ boardBase, appId, polls, intervalMs, requestImpl }) {
  const metricsUrl = `${boardBase}/apps/file?app=${encodeURIComponent(appId)}&path=metrics.json`;
  let lastMetrics = null;
  for (let i = 0; i < polls; i++) {
    lastMetrics = await readOptionalJson(metricsUrl, requestImpl);
    if (hasAiUiMetrics(lastMetrics)) {
      return lastMetrics;
    }
    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }
  throw new Error(`expected ${appId} metrics to show active AI UI snippet; last metrics=${JSON.stringify(lastMetrics)}`);
}

function hasAiUiMetrics(metrics) {
  return metrics?.ai_ui_active === true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseVoiceAiSmokeArgs();
    if (options.help) {
      usage();
      process.exit(0);
    }
    const result = await runVoiceAiSmoke(options);
    console.log(
      `voice-ai smoke ok: audio=${result.audioBytes} chats=${result.chatRequestsBefore}->${result.chatRequestsAfter} ` +
        `state=${result.status.state} current_app=${result.status.current_app} ` +
        `gif=${result.readyMetrics.gif_visible === true ? result.readyMetrics.gif_state || "visible" : "off"} ` +
        `font=${result.readyMetrics.font_loaded === true ? "loaded" : "off"} reply=${result.reply}`,
    );
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
  }
}
