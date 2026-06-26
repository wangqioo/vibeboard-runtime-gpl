import { pathToFileURL } from "node:url";
import { sendRequest } from "../app-uploader/index.mjs";
import {
  normalizeBaseUrl,
  parseNonNegativeInteger,
  parsePositiveInteger,
  requestJson,
} from "../lifecycle-smoke/index.mjs";

const DEFAULT_BOARD_URL = "http://192.168.1.32:8080";
const DEFAULT_MANAGER_APP_ID = "smoke_app_manager";
const DEFAULT_TARGET_APP_ID = "smoke_key";
const DEFAULT_EXPECT_STATE = "running";
const DEFAULT_POLLS = 12;
const DEFAULT_INTERVAL_MS = 500;

function usage() {
  console.error("Usage: node tools/app-manager-smoke/index.mjs [--board <url>]");
  console.error("Options:");
  console.error("  --manager-app <id>    Manager app to launch, default smoke_app_manager");
  console.error("  --target-app <id>     App expected after handoff, default smoke_key");
  console.error("  --expect-state <id>   Final /status state to wait for, default running");
  console.error("  --polls <count>       Number of /status polls, default 12");
  console.error("  --interval-ms <ms>    Delay between polls, default 500");
  console.error("Example:");
  console.error("  npm run app-manager:smoke -- --board http://192.168.1.32:8080");
}

export function parseAppManagerSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    boardUrl: DEFAULT_BOARD_URL,
    managerAppId: DEFAULT_MANAGER_APP_ID,
    targetAppId: DEFAULT_TARGET_APP_ID,
    expectState: DEFAULT_EXPECT_STATE,
    polls: DEFAULT_POLLS,
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
    if (arg === "--manager-app") {
      options.managerAppId = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--manager-app=")) {
      options.managerAppId = arg.slice("--manager-app=".length);
      continue;
    }
    if (arg === "--target-app") {
      options.targetAppId = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--target-app=")) {
      options.targetAppId = arg.slice("--target-app=".length);
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
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.help && !options.boardUrl) {
    throw new Error("--board is required");
  }
  if (!options.help && !options.managerAppId) {
    throw new Error("--manager-app is required");
  }
  if (!options.help && !options.targetAppId) {
    throw new Error("--target-app is required");
  }
  return options;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAppManagerSmoke({
  boardUrl,
  managerAppId = DEFAULT_MANAGER_APP_ID,
  targetAppId = DEFAULT_TARGET_APP_ID,
  expectState = DEFAULT_EXPECT_STATE,
  polls = DEFAULT_POLLS,
  intervalMs = DEFAULT_INTERVAL_MS,
  requestImpl = sendRequest,
} = {}) {
  if (!boardUrl) throw new Error("boardUrl is required");
  if (!managerAppId) throw new Error("managerAppId is required");
  if (!targetAppId) throw new Error("targetAppId is required");
  if (!Number.isInteger(polls) || polls <= 0) throw new Error("polls must be a positive integer");
  if (!Number.isInteger(intervalMs) || intervalMs < 0) throw new Error("intervalMs must be a non-negative integer");

  const baseUrl = normalizeBaseUrl(boardUrl);
  const launch = await requestJson({
    url: `${baseUrl}/launch?app=${encodeURIComponent(managerAppId)}`,
    method: "POST",
    requestImpl,
  });

  let lastStatus = null;
  for (let i = 0; i < polls; i++) {
    lastStatus = await requestJson({
      url: `${baseUrl}/status`,
      method: "GET",
      requestImpl,
    });
    if (lastStatus.state === expectState && lastStatus.current_app === targetAppId) {
      return {
        managerAppId,
        targetAppId,
        launched: launch.launched || managerAppId,
        status: lastStatus,
        polls: i + 1,
      };
    }
    if (i < polls - 1 && intervalMs > 0) {
      await wait(intervalMs);
    }
  }

  throw new Error(
    `expected ${managerAppId} handoff to ${targetAppId} with state ${expectState}; ` +
      `last status ${JSON.stringify(lastStatus)}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseAppManagerSmokeArgs();
    if (options.help) {
      usage();
      process.exit(0);
    }
    const result = await runAppManagerSmoke(options);
    console.log(
      `app-manager smoke ok: ${result.launched}->${result.targetAppId} state=${result.status.state} current_app=${result.status.current_app} polls=${result.polls}`,
    );
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
  }
}
