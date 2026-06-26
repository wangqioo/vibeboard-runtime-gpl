import { sendRequest } from "../app-uploader/index.mjs";
import { pathToFileURL } from "node:url";

const DEFAULT_BOARD_URL = "http://192.168.1.32:8080";
const DEFAULT_APP_ID = "smoke_i2s";
const DEFAULT_POLLS = 10;
const DEFAULT_INTERVAL_MS = 500;

function usage() {
  console.error("Usage: node tools/i2s-smoke/index.mjs [--board <url>] [--require-reads] [--require-nonzero] [--require-write] [--require-tone-writes <n>]");
  console.error("Options:");
  console.error("  --board <url>       Board base URL, default http://192.168.1.32:8080");
  console.error("  --app <id>          App id to launch, default smoke_i2s");
  console.error("  --polls <count>     Number of metrics polls, default 10");
  console.error("  --interval-ms <ms>  Delay between polls, default 500");
  console.error("  --require-reads     Fail unless metrics.reads > 0");
  console.error("  --require-nonzero   Fail unless metrics.nonzero > 0");
  console.error("  --require-write     Fail unless metrics.tx_bytes > 0");
  console.error("  --require-tone-writes <n>  Fail unless metrics.tone_writes >= n");
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function parsePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return number;
}

function parseNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return number;
}

export function parseI2sSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    boardUrl: DEFAULT_BOARD_URL,
    appId: DEFAULT_APP_ID,
    polls: DEFAULT_POLLS,
    intervalMs: DEFAULT_INTERVAL_MS,
    requireReads: false,
    requireNonzero: false,
    requireWrite: false,
    requireToneWrites: 0,
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
    if (arg === "--app") {
      options.appId = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--app=")) {
      options.appId = arg.slice("--app=".length);
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
    if (arg === "--interval-ms") {
      options.intervalMs = parseNonNegativeInteger(argv[++i], "--interval-ms");
      continue;
    }
    if (arg.startsWith("--interval-ms=")) {
      options.intervalMs = parseNonNegativeInteger(arg.slice("--interval-ms=".length), "--interval-ms");
      continue;
    }
    if (arg === "--require-reads") {
      options.requireReads = true;
      continue;
    }
    if (arg === "--require-nonzero") {
      options.requireNonzero = true;
      continue;
    }
    if (arg === "--require-write") {
      options.requireWrite = true;
      continue;
    }
    if (arg === "--require-tone-writes") {
      options.requireToneWrites = parsePositiveInteger(argv[++i], "--require-tone-writes");
      continue;
    }
    if (arg.startsWith("--require-tone-writes=")) {
      options.requireToneWrites = parsePositiveInteger(arg.slice("--require-tone-writes=".length), "--require-tone-writes");
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.help && !options.boardUrl) {
    throw new Error("--board is required");
  }
  if (!options.help && !options.appId) {
    throw new Error("--app is required");
  }
  return options;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson({ url, method, requestImpl }) {
  const response = await requestImpl(url, Buffer.alloc(0), { method });
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${response.text || ""}`.trim());
  }
  return JSON.parse(response.text || "{}");
}

async function requestOptionalText({ url, requestImpl }) {
  const response = await requestImpl(url, Buffer.alloc(0), { method: "GET" });
  if (!response.ok) {
    return null;
  }
  return response.text || "{}";
}

async function requestOptionalJson({ url, requestImpl }) {
  const text = await requestOptionalText({ url, requestImpl });
  return text == null ? null : JSON.parse(text);
}

async function safeStop({ baseUrl, appId, requestImpl }) {
  try {
    await requestImpl(`${baseUrl}/stop`, Buffer.alloc(0), { method: "POST" });
    return;
  } catch (error) {
    const status = await requestOptionalJson({
      url: `${baseUrl}/status`,
      requestImpl,
    });
    if (!status || (status.state === "running" && status.current_app === appId)) {
      throw error;
    }
  }
}

async function waitForActiveApp({ baseUrl, appId, polls, intervalMs, requestImpl }) {
  let status = null;
  for (let i = 0; i < polls; i++) {
    status = await requestOptionalJson({
      url: `${baseUrl}/status`,
      requestImpl,
    });
    if (status?.state === "running" && status?.current_app === appId) {
      return status;
    }
    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }
  throw new Error(`expected ${appId} to become active; last status ${JSON.stringify(status)}`);
}

async function readFreshMetrics({ metricsUrl, staleMetricsText, requestImpl, gates }) {
  const metricsText = await requestOptionalText({
    url: metricsUrl,
    requestImpl,
  });
  if (metricsText == null) {
    return null;
  }
  const parsedMetrics = JSON.parse(metricsText);
  if (metricsSatisfy(parsedMetrics, gates) || metricsText !== staleMetricsText) {
    return parsedMetrics;
  }
  return null;
}

async function waitForActiveAppOrMetrics({ baseUrl, appId, polls, intervalMs, requestImpl, metricsUrl, staleMetricsText, gates }) {
  let status = null;
  let lastMetrics = null;
  for (let i = 0; i < polls; i++) {
    status = await requestOptionalJson({
      url: `${baseUrl}/status`,
      requestImpl,
    });
    if (status?.state === "running" && status?.current_app === appId) {
      return { status, activeByMetrics: false, metrics: null };
    }
    lastMetrics = await readFreshMetrics({ metricsUrl, staleMetricsText, requestImpl, gates });
    if (status?.current_app === appId && metricsSatisfy(lastMetrics, gates)) {
      return { status, activeByMetrics: true, metrics: lastMetrics };
    }
    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }
  throw new Error(`expected ${appId} to become active; last status ${JSON.stringify(status)} metrics ${JSON.stringify(lastMetrics)}`);
}

async function launchAppWithActiveFallback({ baseUrl, appId, polls, intervalMs, requestImpl }) {
  try {
    return await requestJson({
      url: `${baseUrl}/launch?app=${encodeURIComponent(appId)}`,
      method: "POST",
      requestImpl,
    });
  } catch (error) {
    try {
      await waitForActiveApp({ baseUrl, appId, polls, intervalMs, requestImpl });
      return { ok: true, launched: appId, active_confirmed: true, recovered_from_launch_error: error.message };
    } catch {
      throw error;
    }
  }
}

function assertMetrics(metrics, { requireReads, requireNonzero, requireWrite, requireToneWrites }) {
  if (!metrics || typeof metrics !== "object") {
    throw new Error("missing i2s metrics");
  }
  if (requireReads && !(Number(metrics.reads) > 0)) {
    throw new Error(`expected reads > 0; metrics=${JSON.stringify(metrics)}`);
  }
  if (requireNonzero && !(Number(metrics.nonzero) > 0)) {
    throw new Error(`expected nonzero > 0; metrics=${JSON.stringify(metrics)}`);
  }
  if (requireWrite && !(Number(metrics.tx_bytes) > 0)) {
    throw new Error(`expected tx_bytes > 0; metrics=${JSON.stringify(metrics)}`);
  }
  if (requireToneWrites > 0 && !(Number(metrics.tone_writes) >= requireToneWrites)) {
    throw new Error(`expected tone_writes >= ${requireToneWrites}; metrics=${JSON.stringify(metrics)}`);
  }
}

function metricsSatisfy(metrics, { requireReads, requireNonzero, requireWrite, requireToneWrites }) {
  if (!metrics || typeof metrics !== "object") {
    return false;
  }
  if (metrics.started === false) {
    return false;
  }
  if (requireReads && !(Number(metrics.reads) > 0)) {
    return false;
  }
  if (requireNonzero && !(Number(metrics.nonzero) > 0)) {
    return false;
  }
  if (requireWrite && !(Number(metrics.tx_bytes) > 0)) {
    return false;
  }
  if (requireToneWrites > 0 && !(Number(metrics.tone_writes) >= requireToneWrites)) {
    return false;
  }
  return true;
}

export async function runI2sSmoke({
  boardUrl,
  appId = DEFAULT_APP_ID,
  polls = DEFAULT_POLLS,
  intervalMs = DEFAULT_INTERVAL_MS,
  requireReads = false,
  requireNonzero = false,
  requireWrite = false,
  requireToneWrites = 0,
  requestImpl = sendRequest,
} = {}) {
  if (!boardUrl) throw new Error("boardUrl is required");
  if (!appId) throw new Error("appId is required");
  if (!Number.isInteger(polls) || polls <= 0) throw new Error("polls must be a positive integer");
  if (!Number.isInteger(intervalMs) || intervalMs < 0) throw new Error("intervalMs must be a non-negative integer");
  if (!Number.isInteger(requireToneWrites) || requireToneWrites < 0) throw new Error("requireToneWrites must be a non-negative integer");

  const baseUrl = normalizeBaseUrl(boardUrl);
  const metricsUrl = `${baseUrl}/apps/file?app=${encodeURIComponent(appId)}&path=metrics.json`;
  const gates = { requireReads, requireNonzero, requireWrite, requireToneWrites };
  await safeStop({ baseUrl, appId, requestImpl });
  const staleMetricsText = await requestOptionalText({
    url: metricsUrl,
    requestImpl,
  });
  const launch = await launchAppWithActiveFallback({ baseUrl, appId, polls, intervalMs, requestImpl });
  let activeByMetrics = false;
  let lastMetrics = null;
  if (!launch.active_confirmed) {
    const activePolls = Math.max(polls, 30);
    const active = await waitForActiveAppOrMetrics({
      baseUrl,
      appId,
      polls: activePolls,
      intervalMs,
      requestImpl,
      metricsUrl,
      staleMetricsText,
      gates,
    });
    activeByMetrics = active.activeByMetrics;
    lastMetrics = active.metrics;
  }

  if (lastMetrics && metricsSatisfy(lastMetrics, gates)) {
    assertMetrics(lastMetrics, gates);
    return {
      appId,
      launched: launch.launched || appId,
      metrics: lastMetrics,
      polls: 0,
      activeByMetrics,
    };
  }

  for (let i = 0; i < polls; i++) {
    const parsedMetrics = await readFreshMetrics({ metricsUrl, staleMetricsText, requestImpl, gates });
    if (parsedMetrics) {
      lastMetrics = parsedMetrics;
    }
    if (lastMetrics && metricsSatisfy(lastMetrics, gates)) {
      assertMetrics(lastMetrics, gates);
      return {
        appId,
        launched: launch.launched || appId,
        metrics: lastMetrics,
        polls: i + 1,
        activeByMetrics,
      };
    }
    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }

  if (lastMetrics) {
    assertMetrics(lastMetrics, gates);
  }
  throw new Error(`expected readable metrics.json for ${appId}; last metrics ${JSON.stringify(lastMetrics)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseI2sSmokeArgs();
    if (options.help) {
      usage();
      process.exit(0);
    }
    const result = await runI2sSmoke(options);
    const metrics = result.metrics;
    console.log(
      `i2s smoke ok: ${result.launched} started=${metrics.started} reads=${metrics.reads} bytes=${metrics.bytes} nonzero=${metrics.nonzero} writes=${metrics.writes || 0} tx_bytes=${metrics.tx_bytes || 0} tone_hz=${metrics.tone_hz || 0} tone_writes=${metrics.tone_writes || 0} error=${metrics.last_error || ""} polls=${result.polls}`,
    );
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
  }
}
