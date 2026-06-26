import { pathToFileURL } from "node:url";
import {
  normalizeBaseUrl,
  parseNonNegativeInteger,
  parsePositiveInteger,
  requestJson,
  runLifecycleSmoke,
} from "../lifecycle-smoke/index.mjs";
import { sendRequest } from "../app-uploader/index.mjs";
import { uploadSmokeNesRom } from "../nes-rom-smoke/index.mjs";

const DEFAULT_BOARD_URL = "http://192.168.1.32:8080";
const DEFAULT_APP_ID = "nesgame";
const DEFAULT_ROM_PATH = "roms/smoke.nes";
const DEFAULT_START_KEY = "UP";
const DEFAULT_START_EVENT = "LONG_START";
const DEFAULT_POLLS = 8;
const DEFAULT_SELECTOR_POLLS = 12;
const DEFAULT_METRICS_POLLS = 20;
const DEFAULT_INTERVAL_MS = 500;
const DEFAULT_FRAME_GROWTH = 120;

function usage() {
  console.error("Usage: node tools/nesgame-smoke/index.mjs [--board <url>] [--app nesgame]");
  console.error("Options:");
  console.error("  --rom-path <path>          App-local smoke ROM path, default roms/smoke.nes");
  console.error("  --start-key CODE:EVENT     Key injection that starts selected ROM, default UP:LONG_START");
  console.error("  --polls <count>            Number of /status polls after launch, default 8");
  console.error("  --selector-polls <count>   Number of selector metrics polls, default 12");
  console.error("  --metrics-polls <count>    Number of running metrics polls after key injection, default 20");
  console.error("  --interval-ms <ms>         Delay between polls, default 500");
  console.error("  --require-frame-growth <n> Require running rendered frames to grow by at least n, default 120");
  console.error("  --inject-gamepad           Start and verify NES input through /input/gamepad instead of /input/key");
  console.error("  --inject-selector-buttons <mask> Button mask used to confirm ROM selection, default 1");
  console.error("  --inject-running-buttons <mask>  Button mask used after ROM starts, default 1");
  console.error("  --inject-running-dpad-right      Include dpad_right=1 in the running gamepad state");
  console.error("Example:");
  console.error("  npm run nesgame:smoke -- --board http://192.168.1.32:8080");
}

function parseKeySpec(spec) {
  const [code, event] = String(spec || "").split(":");
  if (!code || !event) {
    throw new Error("--start-key must use CODE:EVENT, for example UP:LONG_START");
  }
  return { code, event };
}

export function parseNesgameSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    boardUrl: DEFAULT_BOARD_URL,
    appId: DEFAULT_APP_ID,
    romPath: DEFAULT_ROM_PATH,
    startKey: DEFAULT_START_KEY,
    startEvent: DEFAULT_START_EVENT,
    polls: DEFAULT_POLLS,
    selectorPolls: DEFAULT_SELECTOR_POLLS,
    metricsPolls: DEFAULT_METRICS_POLLS,
    intervalMs: DEFAULT_INTERVAL_MS,
    requireFrameGrowth: DEFAULT_FRAME_GROWTH,
    injectGamepad: false,
    injectSelectorButtons: 1,
    injectRunningButtons: 1,
    injectRunningDpadRight: false,
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
    if (arg === "--rom-path") {
      options.romPath = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--rom-path=")) {
      options.romPath = arg.slice("--rom-path=".length);
      continue;
    }
    if (arg === "--start-key") {
      const parsed = parseKeySpec(argv[++i]);
      options.startKey = parsed.code;
      options.startEvent = parsed.event;
      continue;
    }
    if (arg.startsWith("--start-key=")) {
      const parsed = parseKeySpec(arg.slice("--start-key=".length));
      options.startKey = parsed.code;
      options.startEvent = parsed.event;
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
    if (arg === "--selector-polls") {
      options.selectorPolls = parsePositiveInteger(argv[++i], "--selector-polls");
      continue;
    }
    if (arg.startsWith("--selector-polls=")) {
      options.selectorPolls = parsePositiveInteger(arg.slice("--selector-polls=".length), "--selector-polls");
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
    if (arg === "--interval-ms") {
      options.intervalMs = parseNonNegativeInteger(argv[++i], "--interval-ms");
      continue;
    }
    if (arg.startsWith("--interval-ms=")) {
      options.intervalMs = parseNonNegativeInteger(arg.slice("--interval-ms=".length), "--interval-ms");
      continue;
    }
    if (arg === "--require-frame-growth") {
      options.requireFrameGrowth = parseNonNegativeInteger(argv[++i], "--require-frame-growth");
      continue;
    }
    if (arg.startsWith("--require-frame-growth=")) {
      options.requireFrameGrowth = parseNonNegativeInteger(arg.slice("--require-frame-growth=".length), "--require-frame-growth");
      continue;
    }
    if (arg === "--inject-gamepad") {
      options.injectGamepad = true;
      continue;
    }
    if (arg === "--inject-selector-buttons") {
      options.injectSelectorButtons = parseNonNegativeInteger(argv[++i], "--inject-selector-buttons");
      continue;
    }
    if (arg.startsWith("--inject-selector-buttons=")) {
      options.injectSelectorButtons = parseNonNegativeInteger(arg.slice("--inject-selector-buttons=".length), "--inject-selector-buttons");
      continue;
    }
    if (arg === "--inject-running-buttons") {
      options.injectRunningButtons = parseNonNegativeInteger(argv[++i], "--inject-running-buttons");
      continue;
    }
    if (arg.startsWith("--inject-running-buttons=")) {
      options.injectRunningButtons = parseNonNegativeInteger(arg.slice("--inject-running-buttons=".length), "--inject-running-buttons");
      continue;
    }
    if (arg === "--inject-running-dpad-right") {
      options.injectRunningDpadRight = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.help && !options.boardUrl) throw new Error("--board is required");
  if (!options.help && !options.appId) throw new Error("--app is required");
  if (!options.help && !options.romPath) throw new Error("--rom-path is required");
  return options;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readMetrics({ boardBase, appId, requestImpl }) {
  const url = `${boardBase}/apps/file?app=${encodeURIComponent(appId)}&path=metrics.json`;
  const response = await requestImpl(url, Buffer.alloc(0), { method: "GET" });
  if (!response.ok) return null;
  return JSON.parse(response.text || "{}");
}

function renderedFrameCount(metrics) {
  return Number(metrics?.rendered_frames ?? metrics?.frames ?? 0);
}

function selectorHasRom(metrics) {
  return metrics?.screen_mode === "select" &&
    metrics?.rom_present === true &&
    Number(metrics?.rom_count ?? 0) > 0 &&
    Number(metrics?.selected_index ?? 0) > 0 &&
    String(metrics?.rom_path || "").endsWith(".nes");
}

function runningHasRom(metrics) {
  return metrics?.screen_mode === "running" &&
    metrics?.rom_present === true &&
    metrics?.started === true &&
    metrics?.running === true &&
    renderedFrameCount(metrics) > 0;
}

function runningHasGamepadInput(metrics, options) {
  if (!options.injectGamepad) return true;
  if (Number(metrics?.last_gamepad_buttons ?? -1) !== options.injectRunningButtons) return false;
  return Number(metrics?.last_gamepad_mask ?? 0) > 0;
}

async function injectGamepad({ boardBase, buttons, dpadRight, requestImpl }) {
  const params = new URLSearchParams();
  params.set("started", "1");
  params.set("connected", "1");
  params.set("connecting", "0");
  params.set("buttons", String(buttons));
  params.set("lx", "0");
  params.set("ly", "0");
  if (dpadRight) {
    params.set("dpad_right", "1");
  }
  params.set("address", "nesgame-smoke");
  await requestJson({
    url: `${boardBase}/input/gamepad?${params.toString()}`,
    method: "POST",
    requestImpl,
  });
}

async function waitForSelectorMetrics({ boardBase, appId, selectorPolls, intervalMs, requestImpl }) {
  let lastMetrics = null;
  for (let i = 0; i < selectorPolls; i++) {
    lastMetrics = await readMetrics({ boardBase, appId, requestImpl });
    if (selectorHasRom(lastMetrics)) {
      return lastMetrics;
    }
    if (i < selectorPolls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }
  throw new Error(`expected ${appId} selector metrics with ROM present; last metrics ${JSON.stringify(lastMetrics)}`);
}

async function waitForRunningMetrics({ boardBase, appId, metricsPolls, intervalMs, requireFrameGrowth, injectGamepad, injectRunningButtons, requestImpl }) {
  let lastMetrics = null;
  let firstRunningMetrics = null;
  let firstFrames = 0;
  let lastFrames = 0;
  for (let i = 0; i < metricsPolls; i++) {
    lastMetrics = await readMetrics({ boardBase, appId, requestImpl });
    if (runningHasRom(lastMetrics)) {
      if (!firstRunningMetrics) {
        firstRunningMetrics = lastMetrics;
        firstFrames = renderedFrameCount(lastMetrics);
      }
      lastFrames = renderedFrameCount(lastMetrics);
      const frameGrowth = lastFrames - firstFrames;
      if (frameGrowth >= requireFrameGrowth && runningHasGamepadInput(lastMetrics, { injectGamepad, injectRunningButtons })) {
        return {
          metrics: lastMetrics,
          frameGrowth,
          firstFrames,
          lastFrames,
        };
      }
    }
    if (i < metricsPolls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }
  if (!firstRunningMetrics) {
    throw new Error(`expected ${appId} running ROM metrics; last metrics ${JSON.stringify(lastMetrics)}`);
  }
  if (injectGamepad && !runningHasGamepadInput(lastMetrics, { injectGamepad, injectRunningButtons })) {
    throw new Error(`expected ${appId} running gamepad input metrics; last metrics ${JSON.stringify(lastMetrics)}`);
  }
  throw new Error(
    `expected ${appId} rendered frame growth >= ${requireFrameGrowth}; observed ${lastFrames - firstFrames}; last metrics ${JSON.stringify(lastMetrics)}`,
  );
}

export async function runNesgameSmoke(options = {}) {
  const merged = {
    boardUrl: DEFAULT_BOARD_URL,
    appId: DEFAULT_APP_ID,
    romPath: DEFAULT_ROM_PATH,
    startKey: DEFAULT_START_KEY,
    startEvent: DEFAULT_START_EVENT,
    polls: DEFAULT_POLLS,
    selectorPolls: DEFAULT_SELECTOR_POLLS,
    metricsPolls: DEFAULT_METRICS_POLLS,
    intervalMs: DEFAULT_INTERVAL_MS,
    requireFrameGrowth: DEFAULT_FRAME_GROWTH,
    injectGamepad: false,
    injectSelectorButtons: 1,
    injectRunningButtons: 1,
    injectRunningDpadRight: false,
    requestImpl: sendRequest,
    ...options,
  };
  const boardBase = normalizeBaseUrl(merged.boardUrl);

  const rom = await uploadSmokeNesRom({
    boardUrl: merged.boardUrl,
    appId: merged.appId,
    romPath: merged.romPath,
    requestImpl: merged.requestImpl,
  });
  const lifecycle = await runLifecycleSmoke({
    boardUrl: merged.boardUrl,
    appId: merged.appId,
    expectState: "running",
    expectCurrentApp: merged.appId,
    polls: merged.polls,
    intervalMs: merged.intervalMs,
    requestImpl: merged.requestImpl,
  });
  const selectorMetrics = await waitForSelectorMetrics({
    boardBase,
    appId: merged.appId,
    selectorPolls: merged.selectorPolls,
    intervalMs: merged.intervalMs,
    requestImpl: merged.requestImpl,
  });
  if (merged.injectGamepad) {
    await injectGamepad({
      boardBase,
      buttons: merged.injectSelectorButtons,
      dpadRight: false,
      requestImpl: merged.requestImpl,
    });
    await injectGamepad({
      boardBase,
      buttons: merged.injectRunningButtons,
      dpadRight: merged.injectRunningDpadRight,
      requestImpl: merged.requestImpl,
    });
  } else {
    await requestJson({
      url: `${boardBase}/input/key?code=${encodeURIComponent(merged.startKey)}&event=${encodeURIComponent(merged.startEvent)}`,
      method: "POST",
      requestImpl: merged.requestImpl,
    });
  }
  const runningResult = await waitForRunningMetrics({
    boardBase,
    appId: merged.appId,
    metricsPolls: merged.metricsPolls,
    intervalMs: merged.intervalMs,
    requireFrameGrowth: merged.requireFrameGrowth,
    injectGamepad: merged.injectGamepad,
    injectRunningButtons: merged.injectRunningButtons,
    requestImpl: merged.requestImpl,
  });

  return {
    ...lifecycle,
    rom,
    selectorMetrics,
    runningMetrics: runningResult.metrics,
    frameGrowth: runningResult.frameGrowth,
    firstFrames: runningResult.firstFrames,
    lastFrames: runningResult.lastFrames,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseNesgameSmokeArgs();
    if (options.help) {
      usage();
      process.exit(0);
    }
    const result = await runNesgameSmoke(options);
    console.log(
      `nesgame smoke ok: ${result.launched} state=${result.status.state} current_app=${result.status.current_app} ` +
        `rom=${result.selectorMetrics.rom_path} frames=${result.firstFrames}->${result.lastFrames} frame_growth=${result.frameGrowth} ` +
        `audio=${Number(result.runningMetrics.audio_bytes ?? 0)} backend=${result.runningMetrics.audio_backend || ""} ` +
        `gamepad_mask=${Number(result.runningMetrics.last_gamepad_mask ?? 0)}`,
    );
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
  }
}
