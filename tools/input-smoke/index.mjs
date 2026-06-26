import { pathToFileURL } from "node:url";
import { sendRequest } from "../app-uploader/index.mjs";

const DEFAULT_BOARD_URL = "http://192.168.1.32:8080";
const DEFAULT_EXPECT_STATE = "running";
const DEFAULT_METRICS_POLLS = 0;
const DEFAULT_ACTIVE_POLLS = 20;

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function usage() {
  console.error("Usage: node tools/input-smoke/index.mjs --app <app-id> --key CODE:EVENT [--key CODE:EVENT ...]");
  console.error("Options:");
  console.error("  --board <url>          Board install-service URL, default http://192.168.1.32:8080");
  console.error("  --expect-state <state> Final /status state to require, default running");
  console.error("  --delay-ms <ms>        Delay after each key injection, default 250");
  console.error("  --active-polls <n>    Poll /status until app is active before injection, default 20");
  console.error("  --metrics-polls <n>   Poll app metrics.json this many times, default 0");
  console.error("  --require-event C:E   Require metrics.events[CODE:EVENT] to be present");
  console.error("Example:");
  console.error("  npm run input:smoke -- --app smoke_key --key LEFT:SHORT --metrics-polls 12 --require-event UP:LONG_REPEAT");
}

function parseKeySpec(spec) {
  const [code, event, extra] = String(spec || "").split(":");
  if (!code || !event || extra != null) {
    throw new Error(`Invalid --key value: ${spec}; expected CODE:EVENT`);
  }
  return { code, event };
}

export function parseInputSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    boardUrl: DEFAULT_BOARD_URL,
    appId: "",
    keys: [],
    expectState: DEFAULT_EXPECT_STATE,
    activePolls: DEFAULT_ACTIVE_POLLS,
    metricsPolls: DEFAULT_METRICS_POLLS,
    requireEvents: [],
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
    if (arg === "--key") {
      options.keys.push(parseKeySpec(argv[++i]));
      continue;
    }
    if (arg.startsWith("--key=")) {
      options.keys.push(parseKeySpec(arg.slice("--key=".length)));
      continue;
    }
    if (arg === "--expect-state") {
      options.expectState = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--expect-state=")) {
      options.expectState = arg.slice("--expect-state=".length);
      continue;
    }
    if (arg === "--delay-ms") {
      options.delayMs = Number(argv[++i]);
      continue;
    }
    if (arg.startsWith("--delay-ms=")) {
      options.delayMs = Number(arg.slice("--delay-ms=".length));
      continue;
    }
    if (arg === "--active-polls") {
      options.activePolls = Number(argv[++i]);
      continue;
    }
    if (arg.startsWith("--active-polls=")) {
      options.activePolls = Number(arg.slice("--active-polls=".length));
      continue;
    }
    if (arg === "--metrics-polls") {
      options.metricsPolls = Number(argv[++i]);
      continue;
    }
    if (arg.startsWith("--metrics-polls=")) {
      options.metricsPolls = Number(arg.slice("--metrics-polls=".length));
      continue;
    }
    if (arg === "--require-event") {
      options.requireEvents.push(parseKeySpec(argv[++i]));
      continue;
    }
    if (arg.startsWith("--require-event=")) {
      options.requireEvents.push(parseKeySpec(arg.slice("--require-event=".length)));
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.help && !options.appId) {
    throw new Error("--app is required");
  }
  if (!options.help && options.keys.length === 0) {
    throw new Error("at least one --key CODE:EVENT is required");
  }
  if (options.delayMs != null && (!Number.isFinite(options.delayMs) || options.delayMs < 0)) {
    throw new Error("--delay-ms must be a non-negative number");
  }
  if (!Number.isInteger(options.activePolls) || options.activePolls < 1) {
    throw new Error("--active-polls must be a positive integer");
  }
  if (!Number.isInteger(options.metricsPolls) || options.metricsPolls < 0) {
    throw new Error("--metrics-polls must be a non-negative integer");
  }
  return options;
}

async function requestJson({ url, method, requestImpl }) {
  const response = await requestImpl(url, Buffer.alloc(0), { method });
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${response.text || ""}`.trim());
  }
  return JSON.parse(response.text || "{}");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function metricEventKey(event) {
  return `${event.code}:${event.event}`;
}

function hasMetricEvent(metrics, event) {
  return Number(metrics?.events?.[metricEventKey(event)] || 0) > 0;
}

async function pollMetrics({ baseUrl, appId, metricsPolls, requireEvents, delayMs, requestImpl }) {
  if (metricsPolls <= 0) {
    return undefined;
  }

  const url = `${baseUrl}/apps/file?app=${encodeURIComponent(appId)}&path=metrics.json`;
  let metrics;
  for (let poll = 0; poll < metricsPolls; poll++) {
    metrics = await requestJson({ url, method: "GET", requestImpl });
    if (requireEvents.every((event) => hasMetricEvent(metrics, event))) {
      return metrics;
    }
    if (poll + 1 < metricsPolls && delayMs > 0) {
      await wait(delayMs);
    }
  }

  const missing = requireEvents.find((event) => !hasMetricEvent(metrics, event));
  if (missing) {
    throw new Error(`expected ${appId} metrics event ${metricEventKey(missing)}`);
  }
  return metrics;
}

async function waitForActiveApp({ baseUrl, appId, activePolls, delayMs, requestImpl }) {
  let status;
  for (let poll = 0; poll < activePolls; poll++) {
    status = await requestJson({
      url: `${baseUrl}/status`,
      method: "GET",
      requestImpl,
    });
    if (status.state === "running" && status.current_app === appId) {
      return status;
    }
    if (poll + 1 < activePolls && delayMs > 0) {
      await wait(delayMs);
    }
  }
  throw new Error(`expected ${appId} to become active, got state=${status?.state || "(missing)"} current_app=${status?.current_app || "(missing)"}`);
}

export async function runInputSmoke({
  boardUrl,
  appId,
  keys,
  expectState = DEFAULT_EXPECT_STATE,
  delayMs = 250,
  activePolls = DEFAULT_ACTIVE_POLLS,
  metricsPolls = DEFAULT_METRICS_POLLS,
  requireEvents = [],
  requestImpl = sendRequest,
} = {}) {
  if (!boardUrl) throw new Error("boardUrl is required");
  if (!appId) throw new Error("appId is required");
  if (!Array.isArray(keys) || keys.length === 0) throw new Error("keys are required");

  const baseUrl = normalizeBaseUrl(boardUrl);
  const launched = await requestJson({
    url: `${baseUrl}/launch?app=${encodeURIComponent(appId)}`,
    method: "POST",
    requestImpl,
  });
  await waitForActiveApp({ baseUrl, appId, activePolls, delayMs, requestImpl });

  const injected = [];
  for (const key of keys) {
    const result = await requestJson({
      url: `${baseUrl}/input/key?code=${encodeURIComponent(key.code)}&event=${encodeURIComponent(key.event)}`,
      method: "POST",
      requestImpl,
    });
    injected.push(result.injected || key);
    if (delayMs > 0) {
      await wait(delayMs);
    }
  }

  const status = await requestJson({
    url: `${baseUrl}/status`,
    method: "GET",
    requestImpl,
  });
  if (expectState && status.state !== expectState) {
    throw new Error(`expected final state ${expectState}, got ${status.state || "(missing)"}`);
  }

  const metrics = await pollMetrics({
    baseUrl,
    appId,
    metricsPolls,
    requireEvents,
    delayMs,
    requestImpl,
  });

  return {
    appId,
    launched: launched.launched || appId,
    injected,
    status,
    metrics,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseInputSmokeArgs();
    if (options.help) {
      usage();
      process.exit(0);
    }
    const result = await runInputSmoke(options);
    const metricsSuffix = result.metrics ? ` metrics_count=${Number(result.metrics.count || 0)}` : "";
    console.log(`input smoke ok: ${result.appId} ${result.injected.length} keys final=${result.status.state}${metricsSuffix}`);
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
  }
}
