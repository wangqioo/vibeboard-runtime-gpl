import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { sendRequest } from "../app-uploader/index.mjs";
import { uploadApp } from "../app-uploader/index.mjs";

const DEFAULT_BOARD_URL = "http://192.168.1.32:8080";
const DEFAULT_PORT = 8790;
const DEFAULT_HOST = "127.0.0.1";

function jsonResponse(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function textResponse(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function assertSafeAppId(appId) {
  if (!appId || appId.startsWith("/") || appId.split("/").includes("..")) {
    throw new Error(`Unsafe app id: ${appId || ""}`);
  }
}

function assertSafeRelativePath(path) {
  if (!path || path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`Unsafe relative path: ${path || ""}`);
  }
}

async function collectBody(request, maxBytes = MAX_UPLOAD_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function recordLog(logEntries, entry) {
  logEntries.unshift({
    at: new Date().toISOString(),
    ...entry,
  });
  if (logEntries.length > 20) {
    logEntries.length = 20;
  }
}

async function materializeUploadTree(appId, files) {
  const root = await mkdtemp(join(tmpdir(), "vibeboard-device-web-upload-"));
  const appDir = join(root, appId);
  await mkdir(appDir, { recursive: true });
  for (const file of files) {
    assertSafeRelativePath(file.path);
    const target = join(appDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    const base64 = typeof file.base64 === "string" ? file.base64 : "";
    if (!base64) {
      throw new Error(`Missing base64 content for ${file.path}`);
    }
    await writeFile(target, Buffer.from(base64, "base64"));
  }
  return { root, appDir };
}

function boardEndpoint({ path, searchParams, method }) {
  if (path === "/api/status" && method === "GET") return { method: "GET", path: "/status" };
  if (path === "/api/apps" && method === "GET") return { method: "GET", path: "/apps" };
  if (path === "/api/stop" && method === "POST") return { method: "POST", path: "/stop" };
  if (path === "/api/rescan" && method === "POST") return { method: "POST", path: "/rescan" };

  if (path === "/api/launch" && method === "POST") {
    const appId = searchParams.get("app");
    assertSafeAppId(appId);
    return { method: "POST", path: `/launch?app=${encodeURIComponent(appId)}` };
  }

  if (path === "/api/delete" && method === "POST") {
    const appId = searchParams.get("app");
    assertSafeAppId(appId);
    return { method: "POST", path: `/apps/delete?app=${encodeURIComponent(appId)}` };
  }

  return null;
}

export async function handleApiRequest({
  request,
  response,
  boardUrl,
  requestImpl = sendRequest,
  uploadAppImpl = uploadApp,
  recordLogEntry = () => {},
  logEntries = null,
}) {
  const url = new URL(request.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;

  if (url.pathname === "/api/logs" && request.method === "GET") {
    jsonResponse(response, 200, { ok: true, entries: Array.isArray(logEntries) ? logEntries : [] });
    return true;
  }

  if (url.pathname === "/api/upload" && request.method === "POST") {
    try {
      const raw = await collectBody(request);
      const payload = JSON.parse(raw.toString("utf8") || "{}");
      const appId = String(payload.appId || payload.app_id || "").trim();
      const files = Array.isArray(payload.files) ? payload.files : [];
      if (!appId) {
        throw new Error("appId is required");
      }
      assertSafeAppId(appId);
      if (files.length === 0) {
        throw new Error("files are required");
      }
      const { root, appDir } = await materializeUploadTree(appId, files);
      try {
        const result = await uploadAppImpl({
          appDir,
          appId,
          boardUrl,
          requestImpl,
        });
        recordLogEntry({
          kind: "upload",
          appId,
          message: `uploaded ${appId} (${files.length} files)`,
        });
        jsonResponse(response, 200, {
          ok: true,
          appId,
          files: files.length,
          confirmed: result.confirmed,
          staged: result.staged,
          stageId: result.stageId,
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    } catch (error) {
      recordLogEntry({
        kind: "upload",
        appId: "",
        error: error.message,
      });
      jsonResponse(response, 500, { ok: false, error: error.message });
    }
    return true;
  }

  let endpoint;
  try {
    endpoint = boardEndpoint({ path: url.pathname, searchParams: url.searchParams, method: request.method });
  } catch (error) {
    jsonResponse(response, 400, { ok: false, error: error.message });
    return true;
  }

  if (!endpoint) {
    jsonResponse(response, 404, { ok: false, error: "Unsupported API route" });
    return true;
  }

  try {
    const base = boardUrl.replace(/\/+$/, "");
    const boardResponse = await requestImpl(`${base}${endpoint.path}`, Buffer.alloc(0), { method: endpoint.method });
    recordLogEntry({
      kind: "proxy",
      path: url.pathname,
      method: request.method,
      message: `${request.method} ${url.pathname} -> ${boardResponse.status}`,
    });
    response.writeHead(boardResponse.status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(boardResponse.text);
  } catch (error) {
    jsonResponse(response, 502, { ok: false, error: error.message });
  }

  return true;
}

export function renderIndexHtml({ boardUrl }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VibeBoard Device</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f7f7f4; color: #1d1d1b; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 18px 22px; border-bottom: 1px solid #d8d6cf; background: #ffffff; }
    main { max-width: 1180px; margin: 0 auto; padding: 18px 22px 28px; }
    h1 { margin: 0; font-size: 20px; font-weight: 650; }
    h2 { margin: 0 0 10px; font-size: 15px; font-weight: 650; }
    button { min-height: 34px; border: 1px solid #b9b6ad; border-radius: 6px; background: #fff; color: #1d1d1b; padding: 0 10px; font: inherit; cursor: pointer; }
    button:hover:not(:disabled) { background: #f0efe9; }
    button:disabled { color: #8f8a80; cursor: not-allowed; background: #eeeae2; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
    .meta { color: #605c54; font-size: 13px; }
    .grid { display: grid; grid-template-columns: minmax(260px, 360px) 1fr; gap: 16px; align-items: start; }
    .panel { background: #fff; border: 1px solid #d8d6cf; border-radius: 8px; padding: 14px; }
    .status { display: grid; grid-template-columns: max-content 1fr; gap: 7px 12px; font-size: 13px; }
    .status dt { color: #605c54; }
    .status dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .apps { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
    .app { border: 1px solid #dad7cf; border-radius: 7px; padding: 10px; background: #fbfaf7; display: grid; gap: 8px; }
    .app.running { border-color: #367a68; background: #eef8f4; }
    .app.legacy { opacity: 0.72; }
    .app-title { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
    .app-name { font-weight: 650; overflow-wrap: anywhere; }
    .badge { font-size: 11px; border: 1px solid #c9c5bc; border-radius: 999px; padding: 2px 7px; white-space: nowrap; color: #4c4943; background: #fff; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .error { color: #9b1c1c; }
    .upload-form { display: grid; gap: 8px; }
    .upload-row { display: grid; grid-template-columns: 1fr 160px; gap: 8px; }
    .upload-row input[type="text"] { min-width: 0; border: 1px solid #b9b6ad; border-radius: 6px; padding: 7px 10px; font: inherit; }
    .log-list { display: grid; gap: 8px; font-size: 12px; }
    .log-entry { display: grid; gap: 2px; padding: 8px 10px; border: 1px solid #e1ddd5; border-radius: 7px; background: #faf9f5; }
    .log-head { display: flex; gap: 8px; justify-content: space-between; align-items: baseline; }
    .log-kind { font-weight: 650; }
    .log-time { color: #7a766c; }
    section + section { margin-top: 16px; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } header { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>VibeBoard Device</h1>
      <div class="meta">Board: ${escapeHtml(boardUrl)}</div>
    </div>
    <div class="toolbar">
      <button id="refresh">Refresh</button>
      <button id="rescan">Rescan</button>
      <button id="stop">Stop</button>
    </div>
  </header>
  <main class="grid">
    <section class="panel">
      <h2>Current App</h2>
      <dl class="status" id="status"></dl>
      <p class="error" id="error"></p>
    </section>
    <section class="panel">
      <h2>Upload App</h2>
      <div class="upload-form">
        <div class="upload-row">
          <input id="upload-app-id" type="text" placeholder="app id (optional)" autocomplete="off">
          <button id="upload">Upload</button>
        </div>
        <input id="upload-files" type="file" webkitdirectory multiple>
        <div class="meta" id="upload-meta">Choose an app directory to upload from this computer.</div>
      </div>
    </section>
    <div>
      <section class="panel">
        <h2>Compatible Apps</h2>
        <div class="apps" id="compatible"></div>
      </section>
      <section class="panel">
        <h2>Legacy Apps</h2>
        <div class="apps" id="legacy"></div>
      </section>
      <section class="panel">
        <h2>Activity Log</h2>
        <div class="log-list" id="logs"></div>
      </section>
    </div>
  </main>
  <script>
    const state = { status: null, apps: [], logs: [] };
    const statusEl = document.getElementById("status");
    const compatibleEl = document.getElementById("compatible");
    const legacyEl = document.getElementById("legacy");
    const errorEl = document.getElementById("error");
    const logsEl = document.getElementById("logs");
    const uploadMetaEl = document.getElementById("upload-meta");
    const uploadFilesEl = document.getElementById("upload-files");
    const uploadAppIdEl = document.getElementById("upload-app-id");

    function setError(error) { errorEl.textContent = error ? String(error.message || error) : ""; }
    function setUploadMeta(text) { uploadMetaEl.textContent = text || "Choose an app directory to upload from this computer."; }
    async function api(path, options = {}) {
      const response = await fetch(path, { cache: "no-store", ...options });
      const text = await response.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { ok: false, error: text }; }
      if (!response.ok) throw new Error(json.error || text || "HTTP " + response.status);
      return json;
    }
    function field(name, value) {
      return "<dt>" + name + "</dt><dd>" + String(value ?? "").replace(/[&<>]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[c])) + "</dd>";
    }
    function renderStatus() {
      const s = state.status || {};
      statusEl.innerHTML = [
        field("state", s.state),
        field("running", s.running),
        field("current_app", s.current_app),
        field("app_count", s.app_count),
        field("last_status", s.last_status),
        field("last_message", s.last_message),
        field("runtime_version", s.runtime_version),
      ].join("");
      document.getElementById("stop").disabled = !s.running;
    }
    function appCard(app, legacy) {
      const running = state.status && state.status.current_app === app.id;
      const el = document.createElement("div");
      el.className = "app" + (running ? " running" : "") + (legacy ? " legacy" : "");
      el.innerHTML = \`
        <div class="app-title">
          <div>
            <div class="app-name"></div>
            <div class="meta"></div>
          </div>
          <span class="badge"></span>
        </div>
        <div class="actions">
          <button data-action="launch">Launch</button>
          <button data-action="delete">Delete</button>
        </div>\`;
      el.querySelector(".app-name").textContent = app.name || app.id;
      el.querySelector(".meta").textContent = app.id + (app.version ? " · " + app.version : "");
      el.querySelector(".badge").textContent = running ? "running" : (legacy ? "legacy" : "ready");
      const launch = el.querySelector('[data-action="launch"]');
      const del = el.querySelector('[data-action="delete"]');
      launch.disabled = legacy || running;
      del.disabled = running;
      launch.onclick = () => action("/api/launch?app=" + encodeURIComponent(app.id), "POST");
      del.onclick = () => action("/api/delete?app=" + encodeURIComponent(app.id), "POST");
      return el;
    }
    function renderApps() {
      compatibleEl.replaceChildren();
      legacyEl.replaceChildren();
      const compatible = state.apps.filter(app => app.compatible !== false);
      const legacy = state.apps.filter(app => app.compatible === false);
      for (const app of compatible) compatibleEl.appendChild(appCard(app, false));
      for (const app of legacy) legacyEl.appendChild(appCard(app, true));
    }
    function renderLogs() {
      logsEl.replaceChildren();
      if (!state.logs.length) {
        const empty = document.createElement("div");
        empty.className = "meta";
        empty.textContent = "No recent actions.";
        logsEl.appendChild(empty);
        return;
      }
      for (const entry of state.logs) {
        const el = document.createElement("div");
        el.className = "log-entry";
        const head = document.createElement("div");
        head.className = "log-head";
        const kind = document.createElement("div");
        kind.className = "log-kind";
        kind.textContent = entry.kind || "action";
        const time = document.createElement("div");
        time.className = "log-time";
        time.textContent = entry.at || "";
        head.append(kind, time);
        const message = document.createElement("div");
        message.className = "meta";
        message.textContent = entry.error || entry.message || "";
        el.append(head, message);
        logsEl.appendChild(el);
      }
    }
    function deriveUploadAppId(files) {
      const first = files[0];
      if (!first) return "";
      const relative = first.webkitRelativePath || first.name || "";
      const segments = relative.split("/").filter(Boolean);
      return segments.length > 1 ? segments[0] : "";
    }
    async function fileToBase64(file) {
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    }
    async function uploadSelectedDirectory() {
      const files = Array.from(uploadFilesEl.files || []);
      if (!files.length) {
        throw new Error("Choose an app directory before uploading");
      }
      const appId = uploadAppIdEl.value.trim() || deriveUploadAppId(files);
      if (!appId) {
        throw new Error("Unable to derive an app id from the selected files");
      }
      const root = files[0].webkitRelativePath ? files[0].webkitRelativePath.split("/")[0] : "";
      const payload = {
        appId,
        files: await Promise.all(files.map(async (file) => {
          const relative = file.webkitRelativePath || file.name;
          const path = root && relative.startsWith(root + "/") ? relative.slice(root.length + 1) : relative;
          return { path, base64: await fileToBase64(file) };
        })),
      };
      await api("/api/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      uploadFilesEl.value = "";
      setUploadMeta("Uploaded " + files.length + " files as " + appId + ".");
      await refresh();
    }
    async function refresh() {
      setError(null);
      try {
        const [status, apps, logs] = await Promise.all([api("/api/status"), api("/api/apps"), api("/api/logs")]);
        state.status = status;
        state.apps = apps.apps || [];
        state.logs = logs.entries || [];
        renderStatus();
        renderApps();
        renderLogs();
      } catch (error) {
        setError(error);
      }
    }
    async function action(path, method) {
      setError(null);
      try {
        await api(path, { method });
        await refresh();
      } catch (error) {
        setError(error);
      }
    }
    document.getElementById("refresh").onclick = refresh;
    document.getElementById("rescan").onclick = () => action("/api/rescan", "POST");
    document.getElementById("stop").onclick = () => action("/api/stop", "POST");
    document.getElementById("upload").onclick = async () => {
      setError(null);
      try {
        await uploadSelectedDirectory();
      } catch (error) {
        setUploadMeta(error.message || String(error));
        setError(error);
      }
    };
    uploadFilesEl.onchange = () => {
      const files = Array.from(uploadFilesEl.files || []);
      if (!files.length) {
        setUploadMeta("");
        return;
      }
      const appId = uploadAppIdEl.value.trim() || deriveUploadAppId(files);
      setUploadMeta(files.length + " files selected" + (appId ? " for " + appId : "") + ".");
    };
    refresh();
  </script>
</body>
</html>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  }[char]));
}

export function parseArgs(argv = process.argv.slice(2)) {
  const result = { boardUrl: DEFAULT_BOARD_URL, port: DEFAULT_PORT, host: DEFAULT_HOST };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--board") {
      result.boardUrl = argv[++i];
      continue;
    }
    if (arg.startsWith("--board=")) {
      result.boardUrl = arg.slice("--board=".length);
      continue;
    }
    if (arg === "--port") {
      result.port = Number(argv[++i]);
      continue;
    }
    if (arg.startsWith("--port=")) {
      result.port = Number(arg.slice("--port=".length));
      continue;
    }
    if (arg === "--host") {
      result.host = argv[++i];
      continue;
    }
    if (arg.startsWith("--host=")) {
      result.host = arg.slice("--host=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.boardUrl) throw new Error("--board is required");
  if (!Number.isInteger(result.port) || result.port <= 0) throw new Error("--port must be a positive integer");
  return result;
}

export function createDeviceWebServer({ boardUrl, requestImpl = sendRequest }) {
  const logs = [];
  return createServer(async (request, response) => {
    if (await handleApiRequest({
      request,
      response,
      boardUrl,
      requestImpl,
      logEntries: logs,
      recordLogEntry: (entry) => recordLog(logs, entry),
    })) return;
    if (request.method === "GET" && (request.url === "/" || request.url.startsWith("/?"))) {
      textResponse(response, 200, renderIndexHtml({ boardUrl }), "text/html; charset=utf-8");
      return;
    }
    textResponse(response, 404, "not found\n");
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const server = createDeviceWebServer(options);
  await new Promise((resolve) => server.listen(options.port, options.host, resolve));
  console.log(`VibeBoard device UI: http://${options.host}:${options.port}`);
  console.log(`Proxying board: ${options.boardUrl}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
