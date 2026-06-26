import { pathToFileURL } from "node:url";
import {
  normalizeBaseUrl,
  parseNonNegativeInteger,
  parsePositiveInteger,
  runLifecycleSmoke,
} from "../lifecycle-smoke/index.mjs";
import { sendRequest } from "../app-uploader/index.mjs";

const DEFAULT_BOARD_URL = "http://192.168.1.32:8080";
const DEFAULT_APP_ID = "smoke_nes";
const DEFAULT_EXPECT_STATE = "running";
const DEFAULT_POLLS = 8;
const DEFAULT_METRICS_POLLS = 8;
const DEFAULT_INTERVAL_MS = 500;

function usage() {
  console.error("Usage: node tools/nes-smoke/index.mjs [--board <url>] [--app smoke_nes]");
  console.error("Options:");
  console.error("  --expect-state <state>        Final /status state to wait for, default running");
  console.error("  --expect-current-app <app>    Final /status current_app to wait for, default app id");
  console.error("  --polls <count>               Number of /status polls, default 8");
  console.error("  --metrics-polls <count>       Number of metrics polls after launch, default 8");
  console.error("  --interval-ms <ms>            Delay between polls, default 500");
  console.error("  --require-rom                 Require ROM-backed NES execution metrics");
  console.error("  --require-audio-bytes <n>     Require at least n audio bytes in metrics");
  console.error("  --require-audio-backend <id>  Require metrics.audio_backend to match, e.g. host or lua");
  console.error("  --require-frame-growth <n>    Require rendered frames to grow by at least n during metrics polling");
  console.error("  --inject-gamepad              POST a synthetic gamepad state before metrics polling");
  console.error("  --inject-buttons <mask>       Button mask for --inject-gamepad, default 1");
  console.error("  --inject-dpad-right           Set dpad_right=1 for --inject-gamepad");
  console.error("  --inject-address <value>      Address string for --inject-gamepad, default nes-host-smoke");
  console.error("  --require-host-gamepad-mask   Require metrics.host_gamepad_active and nonzero host_gamepad_mask");
  console.error("Example:");
  console.error("  npm run nes:smoke -- --board http://192.168.1.32:8080");
}

export function parseNesSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    boardUrl: DEFAULT_BOARD_URL,
    appId: DEFAULT_APP_ID,
    expectState: DEFAULT_EXPECT_STATE,
    expectCurrentApp: "",
    polls: DEFAULT_POLLS,
    metricsPolls: DEFAULT_METRICS_POLLS,
    intervalMs: DEFAULT_INTERVAL_MS,
    requireRom: false,
    requireAudioBytes: 0,
    requireAudioBackend: "",
    requireFrameGrowth: 0,
    injectGamepad: false,
    injectButtons: 1,
    injectDpadRight: false,
    injectAddress: "nes-host-smoke",
    requireHostGamepadMask: false,
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
    if (arg === "--interval-ms") {
      options.intervalMs = parseNonNegativeInteger(argv[++i], "--interval-ms");
      continue;
    }
    if (arg.startsWith("--interval-ms=")) {
      options.intervalMs = parseNonNegativeInteger(arg.slice("--interval-ms=".length), "--interval-ms");
      continue;
    }
    if (arg === "--require-rom") {
      options.requireRom = true;
      continue;
    }
    if (arg === "--require-audio-bytes") {
      options.requireAudioBytes = parseNonNegativeInteger(argv[++i], "--require-audio-bytes");
      continue;
    }
    if (arg.startsWith("--require-audio-bytes=")) {
      options.requireAudioBytes = parseNonNegativeInteger(
        arg.slice("--require-audio-bytes=".length),
        "--require-audio-bytes",
      );
      continue;
    }
    if (arg === "--require-audio-backend") {
      options.requireAudioBackend = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--require-audio-backend=")) {
      options.requireAudioBackend = arg.slice("--require-audio-backend=".length);
      continue;
    }
    if (arg === "--require-frame-growth") {
      options.requireFrameGrowth = parseNonNegativeInteger(argv[++i], "--require-frame-growth");
      continue;
    }
    if (arg.startsWith("--require-frame-growth=")) {
      options.requireFrameGrowth = parseNonNegativeInteger(
        arg.slice("--require-frame-growth=".length),
        "--require-frame-growth",
      );
      continue;
    }
    if (arg === "--inject-gamepad") {
      options.injectGamepad = true;
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
    if (arg === "--inject-dpad-right") {
      options.injectDpadRight = true;
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
    if (arg === "--require-host-gamepad-mask") {
      options.requireHostGamepadMask = true;
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readOptionalJson(url, requestImpl) {
  try {
    const response = await requestImpl(url, Buffer.alloc(0), { method: "GET" });
    if (!response.ok) {
      return null;
    }
    return JSON.parse(response.text || "{}");
  } catch (error) {
    error.message = `${error.message} while GET ${url}`;
    throw error;
  }
}

function isNesMetrics(metrics) {
  return (
    metrics &&
    typeof metrics === "object" &&
    ("rom_present" in metrics || "started" in metrics || "frames" in metrics || "rendered_frames" in metrics)
  );
}

async function readNesMetrics(boardBase, appId, requestImpl) {
  return readOptionalJson(`${boardBase}/apps/file?app=${encodeURIComponent(appId)}&path=metrics.json`, requestImpl);
}

function metricsShowRomExecution(metrics, requireAudioBytes, requireAudioBackend) {
  if (!metrics || metrics.rom_present !== true || metrics.started !== true || metrics.running !== true) {
    return false;
  }
  const frames = Number(metrics.rendered_frames ?? metrics.frames ?? 0);
  const audioBytes = Number(metrics.audio_bytes ?? 0);
  const audioBackend = String(metrics.audio_backend ?? "");
  return frames > 0 && audioBytes >= requireAudioBytes && (!requireAudioBackend || audioBackend === requireAudioBackend);
}

function metricsAudioBackendMatches(metrics, requireAudioBackend) {
  return !requireAudioBackend || String(metrics?.audio_backend ?? "") === requireAudioBackend;
}

function metricsAudioBytesMatch(metrics, requireAudioBytes) {
  return Number(metrics?.audio_bytes ?? 0) >= requireAudioBytes;
}

function metricsShowHostGamepad(metrics) {
  return metrics?.host_gamepad_active === true && Number(metrics?.host_gamepad_mask ?? 0) > 0;
}

function renderedFrameCount(metrics) {
  return Number(metrics?.rendered_frames ?? metrics?.frames ?? 0);
}

async function injectGamepadState(boardBase, options) {
  const params = new URLSearchParams();
  params.set("started", "1");
  params.set("connected", "1");
  params.set("connecting", "0");
  params.set("buttons", String(options.injectButtons));
  params.set("lx", "0");
  params.set("ly", "0");
  if (options.injectDpadRight) {
    params.set("dpad_right", "1");
  }
  if (options.injectAddress) {
    params.set("address", options.injectAddress);
  }
  const url = `${boardBase}/input/gamepad?${params.toString()}`;
  try {
    const response = await options.requestImpl(url, Buffer.alloc(0), {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`gamepad injection failed: HTTP ${response.status} ${response.text || ""}`.trim());
    }
  } catch (error) {
    error.message = `${error.message} while POST ${url}`;
    throw error;
  }
}

async function waitForNesMetrics({
  boardBase,
  appId,
  metricsPolls,
  intervalMs,
  requireRom,
  requireAudioBytes,
  requireAudioBackend,
  requireFrameGrowth,
  requireHostGamepadMask,
  requestImpl,
}) {
  let lastMetrics = null;
  let firstMatchingMetrics = null;
  let firstMatchingFrames = 0;
  let lastMatchingFrames = 0;
  let metricsSamples = 0;
  for (let i = 0; i < metricsPolls; i++) {
    lastMetrics = await readNesMetrics(boardBase, appId, requestImpl);
    if (lastMetrics) {
      metricsSamples++;
      lastMatchingFrames = renderedFrameCount(lastMetrics);
    }
    if (requireHostGamepadMask && lastMetrics && !metricsShowHostGamepad(lastMetrics)) {
      if (i < metricsPolls - 1 && intervalMs > 0) {
        await wait(intervalMs);
      }
      continue;
    }
    if (!requireRom && lastMetrics) {
      if (requireFrameGrowth <= 0) {
        const frames = renderedFrameCount(lastMetrics);
        return { metrics: lastMetrics, frameGrowth: 0, firstFrames: frames, lastFrames: frames, samples: metricsSamples };
      }
      if (!firstMatchingMetrics) {
        firstMatchingMetrics = lastMetrics;
        firstMatchingFrames = renderedFrameCount(lastMetrics);
      }
    }
    if (requireRom && metricsShowRomExecution(lastMetrics, requireAudioBytes, requireAudioBackend)) {
      if (requireFrameGrowth <= 0) {
        const frames = renderedFrameCount(lastMetrics);
        return { metrics: lastMetrics, frameGrowth: 0, firstFrames: frames, lastFrames: frames, samples: metricsSamples };
      }
      if (!firstMatchingMetrics) {
        firstMatchingMetrics = lastMetrics;
        firstMatchingFrames = renderedFrameCount(lastMetrics);
      }
    }
    if (firstMatchingMetrics) {
      const frameGrowth = renderedFrameCount(lastMetrics) - firstMatchingFrames;
      lastMatchingFrames = renderedFrameCount(lastMetrics);
      if (frameGrowth >= requireFrameGrowth) {
        return {
          metrics: lastMetrics,
          frameGrowth,
          firstFrames: firstMatchingFrames,
          lastFrames: lastMatchingFrames,
          samples: metricsSamples,
        };
      }
    }
    if (i < metricsPolls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }
  if (requireRom && !firstMatchingMetrics) {
    if (requireHostGamepadMask && lastMetrics) {
      throw new Error(`expected ${appId} native host gamepad mask; last metrics ${JSON.stringify(lastMetrics)}`);
    }
    if (requireAudioBackend && lastMetrics && !metricsAudioBackendMatches(lastMetrics, requireAudioBackend)) {
      throw new Error(`expected ${appId} audio_backend ${requireAudioBackend}; last metrics ${JSON.stringify(lastMetrics)}`);
    }
    if (requireAudioBytes > 0 && lastMetrics && !metricsAudioBytesMatch(lastMetrics, requireAudioBytes)) {
      throw new Error(`expected ${appId} audio_bytes >= ${requireAudioBytes}; last metrics ${JSON.stringify(lastMetrics)}`);
    }
    throw new Error(`expected ${appId} ROM-backed metrics; last metrics ${JSON.stringify(lastMetrics)}`);
  }
  if (requireHostGamepadMask && !metricsShowHostGamepad(lastMetrics)) {
    throw new Error(`expected ${appId} native host gamepad mask; last metrics ${JSON.stringify(lastMetrics)}`);
  }
  if (requireFrameGrowth > 0 && firstMatchingMetrics) {
    const frameGrowth = renderedFrameCount(lastMetrics) - firstMatchingFrames;
    throw new Error(
      `expected ${appId} rendered frame growth >= ${requireFrameGrowth}; observed ${frameGrowth}; last metrics ${JSON.stringify(lastMetrics)}`,
    );
  }
  return { metrics: lastMetrics, frameGrowth: 0 };
}

export async function runNesSmoke(options = {}) {
  const merged = {
    boardUrl: DEFAULT_BOARD_URL,
    appId: DEFAULT_APP_ID,
    expectState: DEFAULT_EXPECT_STATE,
    polls: DEFAULT_POLLS,
    metricsPolls: DEFAULT_METRICS_POLLS,
    intervalMs: DEFAULT_INTERVAL_MS,
    requireRom: false,
    requireAudioBytes: 0,
    requireAudioBackend: "",
    requireFrameGrowth: 0,
    injectGamepad: false,
    injectButtons: 1,
    injectDpadRight: false,
    injectAddress: "nes-host-smoke",
    requireHostGamepadMask: false,
    requestImpl: sendRequest,
    ...options,
  };
  const lifecycle = await runLifecycleSmoke(merged);
  const boardBase = normalizeBaseUrl(merged.boardUrl);
  if (merged.injectGamepad) {
    await injectGamepadState(boardBase, merged);
  }
  const metricsResult = await waitForNesMetrics({
    boardBase,
    appId: merged.appId,
    metricsPolls: merged.metricsPolls,
    intervalMs: merged.intervalMs,
    requireRom: merged.requireRom,
    requireAudioBytes: merged.requireAudioBytes,
    requireAudioBackend: merged.requireAudioBackend,
    requireFrameGrowth: merged.requireFrameGrowth,
    requireHostGamepadMask: merged.requireHostGamepadMask,
    requestImpl: merged.requestImpl,
  });
  return {
    ...lifecycle,
    metrics: metricsResult.metrics,
    metricsFrameGrowth: metricsResult.frameGrowth,
    metricsFirstFrames: metricsResult.firstFrames ?? 0,
    metricsLastFrames: metricsResult.lastFrames ?? renderedFrameCount(metricsResult.metrics),
    metricsSamples: metricsResult.samples ?? 0,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseNesSmokeArgs();
    if (options.help) {
      usage();
      process.exit(0);
    }
    const result = await runNesSmoke(options);
    const metrics = result.metrics || {};
    console.log(
        `nes smoke ok: ${result.launched} state=${result.status.state} current_app=${result.status.current_app} polls=${result.polls} ` +
        `rom=${metrics.rom_present === true} started=${metrics.started === true} frames=${Number(metrics.rendered_frames ?? metrics.frames ?? 0)} ` +
        `frame_growth=${Number(result.metricsFrameGrowth ?? 0)} samples=${Number(result.metricsSamples ?? 0)} ` +
        `frames=${Number(result.metricsFirstFrames ?? 0)}->${Number(result.metricsLastFrames ?? 0)} audio=${Number(metrics.audio_bytes ?? 0)} ` +
        `backend=${metrics.audio_backend || ""} host_gamepad=${Number(metrics.host_gamepad_mask ?? 0)} ` +
        `audio_error=${metrics.audio_error || ""}`,
    );
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
  }
}
