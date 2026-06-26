import { pathToFileURL } from "node:url";
import {
  normalizeBaseUrl,
  parseNonNegativeInteger,
  parsePositiveInteger,
  runLifecycleSmoke,
} from "../lifecycle-smoke/index.mjs";
import { sendRequest } from "../app-uploader/index.mjs";

const DEFAULT_BOARD_URL = "http://192.168.1.32:8080";
const DEFAULT_APP_ID = "smoke_gamepad";
const DEFAULT_EXPECT_STATE = "running";
const DEFAULT_POLLS = 8;
const DEFAULT_METRICS_POLLS = 8;
const DEFAULT_METRICS_DELAY_MS = 0;
const DEFAULT_INTERVAL_MS = 500;

function usage() {
  console.error("Usage: node tools/gamepad-smoke/index.mjs [--board <url>]");
  console.error("Options:");
  console.error("  --app <id>                 App id to launch, default smoke_gamepad");
  console.error("  --expect-state <state>     Final /status state to wait for, default running");
  console.error("  --expect-current-app <id>  Final /status current_app to wait for, default app id");
  console.error("  --polls <count>            Number of /status polls, default 8");
  console.error("  --metrics-polls <count>    Number of metrics polls after launch, default 8");
  console.error("  --metrics-delay-ms <ms>    Delay before first metrics poll, default 0");
  console.error("  --interval-ms <ms>         Delay between polls, default 500");
  console.error("  --require-updates <count>  Require at least count gamepad update events");
  console.error("  --require-connected        Require metrics to show a connected gamepad");
  console.error("  --require-xbox             Require metrics to show the Xbox button pressed");
  console.error("  --require-disconnects <n>  Require at least n disconnect events");
  console.error("  --require-connect-failed <n> Require at least n connect-failed events");
  console.error("  --inject-gamepad           POST a synthetic gamepad state before metrics polling");
  console.error("  --inject-disconnect        POST a disconnected synthetic state after --inject-gamepad");
  console.error("  --inject-address <value>   Address string for --inject-gamepad, default smoke-gamepad");
  console.error("  --inject-buttons <mask>    Button mask for --inject-gamepad, default 256");
  console.error("  --inject-lx <value>        Left stick X value for --inject-gamepad, default 0");
  console.error("  --inject-ly <value>        Left stick Y value for --inject-gamepad, default 0");
  console.error("  --inject-dpad-up           Set dpad_up=1 for --inject-gamepad");
  console.error("Example:");
  console.error("  npm run gamepad:smoke -- --board http://192.168.1.32:8080");
}

export function parseGamepadSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    boardUrl: DEFAULT_BOARD_URL,
    appId: DEFAULT_APP_ID,
    expectState: DEFAULT_EXPECT_STATE,
    expectCurrentApp: "",
    polls: DEFAULT_POLLS,
    metricsPolls: DEFAULT_METRICS_POLLS,
    metricsDelayMs: DEFAULT_METRICS_DELAY_MS,
    requireUpdates: 0,
    requireConnected: false,
    requireXbox: false,
    requireDisconnects: 0,
    requireConnectFailed: 0,
    injectGamepad: false,
    injectDisconnect: false,
    injectAddress: "smoke-gamepad",
    injectButtons: 256,
    injectLx: 0,
    injectLy: 0,
    injectDpadUp: false,
    intervalMs: DEFAULT_INTERVAL_MS,
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
    if (arg === "--polls") {
      options.polls = parsePositiveInteger(argv[++i], "--polls");
      continue;
    }
    if (arg.startsWith("--polls=")) {
      options.polls = parsePositiveInteger(arg.slice("--polls=".length), "--polls");
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
    if (arg === "--metrics-delay-ms") {
      options.metricsDelayMs = parseNonNegativeInteger(argv[++i], "--metrics-delay-ms");
      continue;
    }
    if (arg.startsWith("--metrics-delay-ms=")) {
      options.metricsDelayMs = parseNonNegativeInteger(arg.slice("--metrics-delay-ms=".length), "--metrics-delay-ms");
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
    if (arg === "--require-updates") {
      options.requireUpdates = parseNonNegativeInteger(argv[++i], "--require-updates");
      continue;
    }
    if (arg.startsWith("--require-updates=")) {
      options.requireUpdates = parseNonNegativeInteger(arg.slice("--require-updates=".length), "--require-updates");
      continue;
    }
    if (arg === "--require-connected") {
      options.requireConnected = true;
      continue;
    }
    if (arg === "--require-xbox") {
      options.requireXbox = true;
      continue;
    }
    if (arg === "--require-disconnects") {
      options.requireDisconnects = parseNonNegativeInteger(argv[++i], "--require-disconnects");
      continue;
    }
    if (arg.startsWith("--require-disconnects=")) {
      options.requireDisconnects = parseNonNegativeInteger(arg.slice("--require-disconnects=".length), "--require-disconnects");
      continue;
    }
    if (arg === "--require-connect-failed") {
      options.requireConnectFailed = parseNonNegativeInteger(argv[++i], "--require-connect-failed");
      continue;
    }
    if (arg.startsWith("--require-connect-failed=")) {
      options.requireConnectFailed = parseNonNegativeInteger(arg.slice("--require-connect-failed=".length), "--require-connect-failed");
      continue;
    }
    if (arg === "--inject-gamepad") {
      options.injectGamepad = true;
      continue;
    }
    if (arg === "--inject-disconnect") {
      options.injectDisconnect = true;
      continue;
    }
    if (arg === "--inject-address") {
      options.injectAddress = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--inject-address=")) {
      options.injectAddress = arg.slice("--inject-address=".length);
      continue;
    }
    if (arg === "--inject-buttons") {
      options.injectButtons = parseNonNegativeInteger(argv[++i], "--inject-buttons");
      continue;
    }
    if (arg.startsWith("--inject-buttons=")) {
      options.injectButtons = parseNonNegativeInteger(arg.slice("--inject-buttons=".length), "--inject-buttons");
      continue;
    }
    if (arg === "--inject-lx") {
      options.injectLx = Number.parseFloat(argv[++i]);
      continue;
    }
    if (arg.startsWith("--inject-lx=")) {
      options.injectLx = Number.parseFloat(arg.slice("--inject-lx=".length));
      continue;
    }
    if (arg === "--inject-ly") {
      options.injectLy = Number.parseFloat(argv[++i]);
      continue;
    }
    if (arg.startsWith("--inject-ly=")) {
      options.injectLy = Number.parseFloat(arg.slice("--inject-ly=".length));
      continue;
    }
    if (arg === "--inject-dpad-up") {
      options.injectDpadUp = true;
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
  if (Number.isNaN(options.injectLx)) {
    throw new Error("--inject-lx must be a number");
  }
  if (Number.isNaN(options.injectLy)) {
    throw new Error("--inject-ly must be a number");
  }
  return options;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readOptionalJson(url, requestImpl) {
  const response = await requestImpl(url, Buffer.alloc(0), { method: "GET" });
  if (!response.ok) {
    return null;
  }
  return JSON.parse(response.text || "{}");
}

async function postGamepadState(boardBase, options, state) {
  const params = new URLSearchParams();
  params.set("started", state.started ? "1" : "0");
  params.set("connected", state.connected ? "1" : "0");
  params.set("connecting", state.connecting ? "1" : "0");
  params.set("buttons", String(state.buttons));
  params.set("lx", String(state.lx));
  params.set("ly", String(state.ly));
  if (state.dpadUp) {
    params.set("dpad_up", "1");
  }
  if (state.address) {
    params.set("address", state.address);
  }
  const response = await options.requestImpl(`${boardBase}/input/gamepad?${params.toString()}`, Buffer.alloc(0), {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`gamepad injection failed: HTTP ${response.status} ${response.text || ""}`.trim());
  }
}

async function injectGamepadState(boardBase, options) {
  await postGamepadState(boardBase, options, {
    started: true,
    connected: true,
    connecting: false,
    buttons: options.injectButtons,
    lx: options.injectLx,
    ly: options.injectLy,
    dpadUp: options.injectDpadUp,
    address: options.injectAddress,
  });
  if (options.injectDisconnect) {
    await postGamepadState(boardBase, options, {
      started: true,
      connected: false,
      connecting: false,
      buttons: 0,
      lx: 0,
      ly: 0,
      dpadUp: false,
      address: options.injectAddress,
    });
  }
}

function metricsSatisfyRequirements(metrics, { requireUpdates, requireConnected, requireXbox, requireDisconnects, requireConnectFailed }) {
  if (!metrics) return false;
  if (Number(metrics.updates ?? 0) < requireUpdates) return false;
  if (requireConnected && metrics.connected !== true) return false;
  if (requireXbox && metrics.xbox !== true && metrics.xbox_seen !== true) return false;
  if (Number(metrics.disconnects ?? 0) < requireDisconnects) return false;
  if (Number(metrics.connect_failed ?? metrics.connect_failed_events ?? 0) < requireConnectFailed) return false;
  return true;
}

async function waitForGamepadMetrics({
  boardBase,
  appId,
  metricsPolls,
  metricsDelayMs,
  intervalMs,
  requireUpdates,
  requireConnected,
  requireXbox,
  requireDisconnects,
  requireConnectFailed,
  requestImpl,
}) {
  const metricsUrl = `${boardBase}/apps/file?app=${encodeURIComponent(appId)}&path=metrics.json`;
  const hasRequirements = requireUpdates > 0 || requireConnected || requireXbox || requireDisconnects > 0 || requireConnectFailed > 0;
  let lastMetrics = null;
  if (metricsDelayMs > 0) {
    await wait(metricsDelayMs);
  }
  for (let i = 0; i < metricsPolls; i++) {
    lastMetrics = await readOptionalJson(metricsUrl, requestImpl);
    if (!hasRequirements && lastMetrics) {
      return lastMetrics;
    }
    if (hasRequirements && metricsSatisfyRequirements(lastMetrics, { requireUpdates, requireConnected, requireXbox, requireDisconnects, requireConnectFailed })) {
      return lastMetrics;
    }
    if (i < metricsPolls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }
  if (hasRequirements) {
    throw new Error(`expected gamepad metrics; last metrics ${JSON.stringify(lastMetrics)}`);
  }
  return lastMetrics;
}

export async function runGamepadSmoke(options = {}) {
  const merged = {
    boardUrl: DEFAULT_BOARD_URL,
    appId: DEFAULT_APP_ID,
    expectState: DEFAULT_EXPECT_STATE,
    polls: DEFAULT_POLLS,
    metricsPolls: DEFAULT_METRICS_POLLS,
    metricsDelayMs: DEFAULT_METRICS_DELAY_MS,
    intervalMs: DEFAULT_INTERVAL_MS,
    requireUpdates: 0,
    requireConnected: false,
    requireXbox: false,
    requireDisconnects: 0,
    requireConnectFailed: 0,
    injectGamepad: false,
    injectDisconnect: false,
    injectAddress: "smoke-gamepad",
    injectButtons: 256,
    injectLx: 0,
    injectLy: 0,
    injectDpadUp: false,
    requestImpl: sendRequest,
    ...options,
  };
  const lifecycle = await runLifecycleSmoke(merged);
  const boardBase = normalizeBaseUrl(merged.boardUrl);
  if (merged.injectGamepad) {
    await injectGamepadState(boardBase, merged);
  }
  const metrics = await waitForGamepadMetrics({
    boardBase,
    appId: merged.appId,
    metricsPolls: merged.metricsPolls,
    metricsDelayMs: merged.metricsDelayMs,
    intervalMs: merged.intervalMs,
    requireUpdates: merged.requireUpdates,
    requireConnected: merged.requireConnected,
    requireXbox: merged.requireXbox,
    requireDisconnects: merged.requireDisconnects,
    requireConnectFailed: merged.requireConnectFailed,
    requestImpl: merged.requestImpl,
  });
  return { ...lifecycle, metrics };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseGamepadSmokeArgs();
    if (options.help) {
      usage();
      process.exit(0);
    }
    const result = await runGamepadSmoke(options);
    const metrics = result.metrics || {};
    console.log(
      `gamepad smoke ok: ${result.launched} state=${result.status.state} current_app=${result.status.current_app} polls=${result.polls} ` +
        `connected=${metrics.connected === true} updates=${Number(metrics.updates ?? 0)} disconnects=${Number(metrics.disconnects ?? 0)} ` +
        `connect_failed=${Number(metrics.connect_failed ?? metrics.connect_failed_events ?? 0)} xbox=${metrics.xbox === true || metrics.xbox_seen === true} buttons=${Number(metrics.buttons_mask ?? 0)}`,
    );
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
  }
}
