#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { uploadApp } from "../app-uploader/index.mjs";

const DEFAULT_APP_ID = "web_ui_smoke";

function normalizeBase(url) {
  return url.replace(/\/+$/, "");
}

async function defaultFetchJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text}`);
  }
  if (!response.ok) {
    throw new Error(json.error || text || `HTTP ${response.status}`);
  }
  return json;
}

export function createWebUiSmokeApp(root, appId = DEFAULT_APP_ID) {
  const appDir = join(root, appId);
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, "app.info"), [
    `name = ${appId}`,
    "entry = main.lua",
    "description = Web UI lifecycle smoke app",
    "schema = vibeboard-runtime-app-package@2",
    "version = 0.0.0",
    "kind = app",
    "capabilities = lvgl,timer",
    "",
  ].join("\n"));
  writeFileSync(join(appDir, "main.lua"), [
    "local root = lv_scr_act()",
    "lv_obj_clean(root)",
    "local label = lv_label_create(root)",
    "lv_label_set_text(label, 'web ui smoke')",
    "lv_obj_align(label, LV_ALIGN_CENTER, 0, 0)",
    "print('web ui smoke started')",
    "",
  ].join("\n"));
  return appDir;
}

async function waitForStatus({ baseUrl, appId, fetchJson, expectedRunning, attempts = 8 }) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    last = await fetchJson(`${baseUrl}/api/status`);
    const isRunning = last.current_app === appId && ["running", "starting"].includes(last.state);
    if (expectedRunning ? isRunning : !isRunning) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${appId} running=${expectedRunning}; last status ${JSON.stringify(last)}`);
}

export async function runSmokeFlow({
  boardUrl,
  baseUrl,
  appId = DEFAULT_APP_ID,
  createTempDir = () => mkdtemp(join(tmpdir(), "vibeboard-device-web-smoke-")),
  upload = uploadApp,
  fetchJson = defaultFetchJson,
  cleanup = (path) => rmSync(path, { recursive: true, force: true }),
} = {}) {
  if (!boardUrl) throw new Error("boardUrl is required");
  if (!baseUrl) throw new Error("baseUrl is required");

  const root = await createTempDir();
  const appDir = createWebUiSmokeApp(root, appId);
  const apiBase = normalizeBase(baseUrl);

  try {
    await upload({ appDir, appId, boardUrl });
    const apps = await fetchJson(`${apiBase}/api/apps`);
    if (!Array.isArray(apps.apps) || !apps.apps.some((app) => app.id === appId && app.compatible !== false)) {
      throw new Error(`${appId} was not visible as a compatible app through the web UI proxy`);
    }

    await fetchJson(`${apiBase}/api/launch?app=${encodeURIComponent(appId)}`, { method: "POST" });
    const running = await waitForStatus({ baseUrl: apiBase, appId, fetchJson, expectedRunning: true });

    await fetchJson(`${apiBase}/api/stop`, { method: "POST" });
    await fetchJson(`${apiBase}/api/rescan`, { method: "POST" });
    await fetchJson(`${apiBase}/api/delete?app=${encodeURIComponent(appId)}`, { method: "POST" });

    return { appId, running, deleted: true };
  } finally {
    cleanup(root);
  }
}

export function parseSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    boardUrl: "http://192.168.1.32:8080",
    baseUrl: "http://127.0.0.1:8790",
    appId: DEFAULT_APP_ID,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--board") {
      options.boardUrl = argv[++i];
      continue;
    }
    if (arg.startsWith("--board=")) {
      options.boardUrl = arg.slice("--board=".length);
      continue;
    }
    if (arg === "--base") {
      options.baseUrl = argv[++i];
      continue;
    }
    if (arg.startsWith("--base=")) {
      options.baseUrl = arg.slice("--base=".length);
      continue;
    }
    if (arg === "--app") {
      options.appId = argv[++i];
      continue;
    }
    if (arg.startsWith("--app=")) {
      options.appId = arg.slice("--app=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runSmokeFlow(parseSmokeArgs());
    console.log(`device web smoke ok: launched and deleted ${result.appId}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
