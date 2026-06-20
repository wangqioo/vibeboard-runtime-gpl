#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { listApps, uploadApp } from "./index.mjs";

const DEFAULT_APP_ID = "interrupted_upload_smoke";
const DEFAULT_FAIL_PATH = "main.lua";

export function createInterruptedUploadSmokeApp(root, appId = DEFAULT_APP_ID) {
  const appDir = join(root, appId);
  mkdirSync(join(appDir, "assets"), { recursive: true });
  writeFileSync(join(appDir, "app.info"), [
    `name = ${appId}`,
    "entry = main.lua",
    "description = Interrupted upload staged abort smoke app",
    "schema = vibeboard-runtime-app-package@2",
    "version = 0.0.0",
    "kind = app",
    "capabilities = lvgl",
    "",
  ].join("\n"));
  writeFileSync(join(appDir, "assets/payload.txt"), "uploaded before intentional interruption\n");
  writeFileSync(join(appDir, "main.lua"), [
    "local root = lv_scr_act()",
    "lv_obj_clean(root)",
    "local label = lv_label_create(root)",
    "lv_label_set_text(label, 'interrupted upload smoke')",
    "lv_obj_align(label, LV_ALIGN_CENTER, 0, 0)",
    "",
  ].join("\n"));
  return appDir;
}

function wrapInterruptedRequest(requestImpl, failPath) {
  return async (url, body, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/install" && parsed.searchParams.get("path") === failPath) {
      throw new Error(`intentional interrupted upload at ${failPath}`);
    }
    return requestImpl(url, body, options);
  };
}

export async function runInterruptedUploadSmoke({
  boardUrl,
  appId = DEFAULT_APP_ID,
  failPath = DEFAULT_FAIL_PATH,
  stageId = `${appId}-interrupted-smoke`,
  createTempDir = () => mkdtemp(join(tmpdir(), "vibeboard-interrupted-upload-")),
  requestImpl,
} = {}) {
  if (!boardUrl) throw new Error("boardUrl is required");
  if (!requestImpl) throw new Error("requestImpl is required");

  const root = await createTempDir();
  const appDir = createInterruptedUploadSmokeApp(root, appId);
  let uploadError;

  try {
    try {
      await uploadApp({
        appDir,
        appId,
        boardUrl,
        requestImpl: wrapInterruptedRequest(requestImpl, failPath),
        stageId,
        staged: true,
        confirm: true,
        retryAttempts: 1,
        retryDelayMs: 0,
      });
    } catch (error) {
      uploadError = error;
    }

    if (!uploadError) {
      throw new Error("Interrupted upload smoke unexpectedly completed");
    }

    const apps = await listApps({
      boardUrl,
      requestImpl,
      retryAttempts: 1,
      retryDelayMs: 0,
    });
    const present = Array.isArray(apps.apps) && apps.apps.some((app) => app.id === appId);
    if (present) {
      throw new Error(`${appId} is still present after interrupted upload abort`);
    }

    return {
      appId,
      failPath,
      stageId,
      aborted: true,
      confirmedAbsent: true,
      error: uploadError.message,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function parseInterruptedUploadCliArgs(argv = process.argv.slice(2)) {
  const args = [...argv];
  let failPath = DEFAULT_FAIL_PATH;
  const positional = [];

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--fail-path") {
      failPath = args.shift() || "";
      continue;
    }
    if (arg.startsWith("--fail-path=")) {
      failPath = arg.slice("--fail-path=".length);
      continue;
    }
    positional.push(arg);
  }

  const [boardUrl, appId = DEFAULT_APP_ID] = positional;
  return { boardUrl, appId, failPath };
}

function usage() {
  console.error("Usage: node tools/app-uploader/interrupted-smoke.mjs [--fail-path <relative-path>] <board-url> [app-id]");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseInterruptedUploadCliArgs();
  if (!options.boardUrl || options.boardUrl === "-h" || options.boardUrl === "--help") {
    usage();
    process.exit(options.boardUrl === "-h" || options.boardUrl === "--help" ? 0 : 1);
  }

  try {
    const { sendRequest } = await import("./index.mjs");
    const result = await runInterruptedUploadSmoke({ ...options, requestImpl: sendRequest });
    console.log(`interrupted upload smoke ok: ${result.appId} absent after abort at ${result.failPath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
