import { sendRequest } from "../app-uploader/index.mjs";
import { pathToFileURL } from "node:url";

const DEFAULT_BOARD_URL = "http://192.168.1.32:8080";
const DEFAULT_EXPECT_STATE = "running";
const DEFAULT_POLLS = 8;
const DEFAULT_INTERVAL_MS = 500;
const DEFAULT_STOP_TIMEOUT_MS = 16000;

function usage() {
  console.error("Usage: node tools/lifecycle-smoke/index.mjs --app <id> [--board <url>]");
  console.error("Options:");
  console.error("  --board <url>              Board base URL, default http://192.168.1.32:8080");
  console.error("  --app <id>                 App id to launch");
  console.error("  --expect-state <state>     Final /status state to wait for, default running");
  console.error("  --expect-current-app <id>  Final /status current_app to wait for, default app id");
  console.error("  --allow-starting           Accept state=starting while waiting for running");
  console.error("  --polls <count>            Number of /status polls, default 8");
  console.error("  --interval-ms <ms>         Delay between polls, default 500");
  console.error("  --stop                     Stop the app after launch and require idle state");
  console.error("  --stop-polls <count>       Number of /status polls after /stop, default --polls");
  console.error("  --stop-interval-ms <ms>    Delay between stop status polls, default --interval-ms");
  console.error("  --metrics-polls <count>    Number of metrics.json polls when --require-metrics is used");
  console.error("  --metrics-interval-ms <ms> Delay between metrics polls, default --interval-ms");
  console.error("  --require-metrics k=v      Require app metrics.json key to equal a bool, number, or string value");
  console.error("  --require-metrics k>=n     Require app metrics.json numeric key to be at least n");
  console.error("Example:");
  console.error("  npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app smoke_controls");
}

export function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

export function parsePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return number;
}

export function parseNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return number;
}

export function parseLifecycleSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    boardUrl: DEFAULT_BOARD_URL,
    appId: "",
    expectState: DEFAULT_EXPECT_STATE,
    expectCurrentApp: "",
    allowStarting: false,
    polls: DEFAULT_POLLS,
    intervalMs: DEFAULT_INTERVAL_MS,
    stop: false,
    stopPolls: DEFAULT_POLLS,
    stopIntervalMs: DEFAULT_INTERVAL_MS,
    metricsPolls: DEFAULT_POLLS,
    metricsIntervalMs: DEFAULT_INTERVAL_MS,
    requireMetrics: [],
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
    if (arg === "--expect-state") {
      options.expectState = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--expect-state=")) {
      options.expectState = arg.slice("--expect-state=".length);
      continue;
    }
    if (arg === "--expect-current-app") {
      options.expectCurrentApp = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--expect-current-app=")) {
      options.expectCurrentApp = arg.slice("--expect-current-app=".length);
      continue;
    }
    if (arg === "--allow-starting") {
      options.allowStarting = true;
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
    if (arg === "--stop") {
      options.stop = true;
      continue;
    }
    if (arg === "--stop-polls") {
      options.stopPolls = parsePositiveInteger(argv[++i], "--stop-polls");
      continue;
    }
    if (arg.startsWith("--stop-polls=")) {
      options.stopPolls = parsePositiveInteger(arg.slice("--stop-polls=".length), "--stop-polls");
      continue;
    }
    if (arg === "--stop-interval-ms") {
      options.stopIntervalMs = parseNonNegativeInteger(argv[++i], "--stop-interval-ms");
      continue;
    }
    if (arg.startsWith("--stop-interval-ms=")) {
      options.stopIntervalMs = parseNonNegativeInteger(arg.slice("--stop-interval-ms=".length), "--stop-interval-ms");
      continue;
    }
    if (arg === "--metrics-polls") {
      options.metricsPolls = parsePositiveInteger(argv[++i], "--metrics-polls");
      continue;
    }
    if (arg.startsWith("--metrics-polls=")) {
      options.metricsPolls = parsePositiveInteger(arg.slice("--metrics-polls=".length), "--metrics-polls");
      continue;
    }
    if (arg === "--metrics-interval-ms") {
      options.metricsIntervalMs = parseNonNegativeInteger(argv[++i], "--metrics-interval-ms");
      continue;
    }
    if (arg.startsWith("--metrics-interval-ms=")) {
      options.metricsIntervalMs = parseNonNegativeInteger(arg.slice("--metrics-interval-ms=".length), "--metrics-interval-ms");
      continue;
    }
    if (arg === "--require-metrics") {
      options.requireMetrics.push(parseRequiredMetric(argv[++i] || ""));
      continue;
    }
    if (arg.startsWith("--require-metrics=")) {
      options.requireMetrics.push(parseRequiredMetric(arg.slice("--require-metrics=".length)));
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
  if (!options.expectCurrentApp) {
    options.expectCurrentApp = options.appId;
  }
  return options;
}

export function parseMetricValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function parseRequiredMetric(value) {
  const lowerBound = value.indexOf(">=");
  if (lowerBound > 0) {
    return {
      key: value.slice(0, lowerBound),
      operator: ">=",
      value: parseMetricValue(value.slice(lowerBound + 2)),
    };
  }
  const equals = value.indexOf("=");
  if (equals <= 0) {
    throw new Error("--require-metrics must be in key=value or key>=number form");
  }
  return {
    key: value.slice(0, equals),
    operator: "=",
    value: parseMetricValue(value.slice(equals + 1)),
  };
}

export async function requestJson({ url, method, timeoutMs, requestImpl }) {
  const response = await requestImpl(url, Buffer.alloc(0), { method, timeoutMs });
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${response.text || ""}`.trim());
  }
  return JSON.parse(response.text || "{}");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusMatches(status, expectState, expectCurrentApp, allowStarting = false) {
  if (expectState && status.state !== expectState) {
    if (!(allowStarting && expectState === "running" && status.state === "starting")) {
      return false;
    }
  }
  if (expectCurrentApp && status.current_app !== expectCurrentApp) {
    return false;
  }
  return true;
}

export async function runLifecycleSmoke({
  boardUrl,
  appId,
  expectState = "running",
  expectCurrentApp = appId,
  allowStarting = false,
  polls = 8,
  intervalMs = 500,
  stop = false,
  stopPolls = polls,
  stopIntervalMs = intervalMs,
  stopTimeoutMs = DEFAULT_STOP_TIMEOUT_MS,
  metricsPolls = polls,
  metricsIntervalMs = intervalMs,
  requireMetrics = [],
  requestImpl = sendRequest,
} = {}) {
  if (!boardUrl) throw new Error("boardUrl is required");
  if (!appId) throw new Error("appId is required");
  if (!Number.isInteger(polls) || polls <= 0) throw new Error("polls must be a positive integer");
  if (!Number.isInteger(intervalMs) || intervalMs < 0) throw new Error("intervalMs must be a non-negative integer");
  if (!Number.isInteger(stopPolls) || stopPolls <= 0) throw new Error("stopPolls must be a positive integer");
  if (!Number.isInteger(stopIntervalMs) || stopIntervalMs < 0) {
    throw new Error("stopIntervalMs must be a non-negative integer");
  }
  if (!Number.isInteger(stopTimeoutMs) || stopTimeoutMs <= 0) {
    throw new Error("stopTimeoutMs must be a positive integer");
  }
  if (!Number.isInteger(metricsPolls) || metricsPolls <= 0) throw new Error("metricsPolls must be a positive integer");
  if (!Number.isInteger(metricsIntervalMs) || metricsIntervalMs < 0) {
    throw new Error("metricsIntervalMs must be a non-negative integer");
  }

  const baseUrl = normalizeBaseUrl(boardUrl);
  let launch = {};
  let launchRequestOk = true;
  let launchRequestError = "";
  try {
    launch = await requestJson({
      url: `${baseUrl}/launch?app=${encodeURIComponent(appId)}`,
      method: "POST",
      requestImpl,
    });
  } catch (error) {
    launchRequestOk = false;
    launchRequestError = error?.message || String(error);
  }

  let lastStatus = null;
  for (let i = 0; i < polls; i++) {
    try {
      lastStatus = await requestJson({
        url: `${baseUrl}/status`,
        method: "GET",
        requestImpl,
      });
    } catch (error) {
      lastStatus = { error: error?.message || String(error) };
    }
    if (statusMatches(lastStatus, expectState, expectCurrentApp, allowStarting)) {
      const result = {
        appId,
        launched: launch.launched || appId,
        launchRequestOk,
        launchRequestError,
        status: lastStatus,
        polls: i + 1,
      };
      if (requireMetrics.length > 0) {
        const metricsResult = await waitForMetrics({
          baseUrl,
          appId,
          requirements: requireMetrics,
          polls: metricsPolls,
          intervalMs: metricsIntervalMs,
          requestImpl,
        });
        result.metrics = metricsResult.metrics;
        result.metricsPolls = metricsResult.polls;
      }
      if (stop) {
        result.stop = await stopAndWaitIdle({
          baseUrl,
          polls: stopPolls,
          intervalMs: stopIntervalMs,
          timeoutMs: stopTimeoutMs,
          requestImpl,
        });
      }
      return {
        ...result,
      };
    }
    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }

  throw new Error(
    `expected state ${expectState || "(any)"} and current_app ${expectCurrentApp || "(any)"}; ` +
      `last status ${JSON.stringify(lastStatus)}` +
      (launchRequestError ? `; launch request error: ${launchRequestError}` : ""),
  );
}

function metricRequirementMatches(metrics, { key, operator = "=", value }) {
  const actual = metrics?.[key];
  if (operator === ">=") {
    return typeof actual === "number" && typeof value === "number" && actual >= value;
  }
  if (typeof value === "number" && typeof actual === "string" && actual.trim() !== "") {
    return Number(actual) === value;
  }
  return actual === value;
}

function formatMetricRequirement({ key, operator = "=", value }) {
  return `${key}${operator}${String(value)}`;
}

function metricMatches(metrics, requirements) {
  return requirements.every((requirement) => metricRequirementMatches(metrics, requirement));
}

async function waitForMetrics({ baseUrl, appId, requirements, polls, intervalMs, requestImpl }) {
  let lastMetrics = null;
  const metricsUrl = `${baseUrl}/apps/file?app=${encodeURIComponent(appId)}&path=metrics.json`;

  for (let i = 0; i < polls; i++) {
    try {
      lastMetrics = await requestJson({
        url: metricsUrl,
        method: "GET",
        requestImpl,
      });
      if (metricMatches(lastMetrics, requirements)) {
        return { metrics: lastMetrics, polls: i + 1 };
      }
    } catch (error) {
      lastMetrics = { error: error?.message || String(error) };
    }

    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }

  const expected = requirements.map(formatMetricRequirement).join(",");
  throw new Error(`expected ${appId} metrics ${expected}; last metrics ${JSON.stringify(lastMetrics)}`);
}

async function stopAndWaitIdle({ baseUrl, polls, intervalMs, timeoutMs, requestImpl }) {
  let stopResponse = {};
  let stopRequestOk = true;
  let stopRequestError = "";
  try {
    stopResponse = await requestJson({
      url: `${baseUrl}/stop`,
      method: "POST",
      timeoutMs,
      requestImpl,
    });
  } catch (error) {
    stopRequestOk = false;
    stopRequestError = error?.message || String(error);
  }

  let lastStatus = null;
  for (let i = 0; i < polls; i++) {
    try {
      lastStatus = await requestJson({
        url: `${baseUrl}/status`,
        method: "GET",
        requestImpl,
      });
    } catch (error) {
      lastStatus = { error: error?.message || String(error) };
    }
    if (statusMatches(lastStatus, "idle", "")) {
      return {
        stopped: stopResponse.stopped !== false,
        stopRequestOk,
        stopRequestError,
        status: lastStatus,
        polls: i + 1,
      };
    }
    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }

  throw new Error(
    `expected idle after stop; last status ${JSON.stringify(lastStatus)}` +
      (stopRequestError ? `; stop request error: ${stopRequestError}` : ""),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseLifecycleSmokeArgs();
    if (options.help) {
      usage();
      process.exit(0);
    }
    const result = await runLifecycleSmoke(options);
    let message = `lifecycle smoke ok: ${result.launched} state=${result.status.state} current_app=${result.status.current_app} polls=${result.polls}`;
    if (result.stop) {
      message += ` stop_state=${result.stop.status.state} stop_current_app=${result.stop.status.current_app} stop_polls=${result.stop.polls}`;
    }
    if (result.metrics) {
      message += ` metrics=${JSON.stringify(result.metrics)}`;
    }
    console.log(message);
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
  }
}
