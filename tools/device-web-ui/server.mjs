import { createServer } from "node:http";
import { sendRequest } from "../app-uploader/index.mjs";

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

function assertSafeAppId(appId) {
  if (!appId || appId.startsWith("/") || appId.split("/").includes("..")) {
    throw new Error(`Unsafe app id: ${appId || ""}`);
  }
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
}) {
  const url = new URL(request.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;

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
    <div>
      <section class="panel">
        <h2>Compatible Apps</h2>
        <div class="apps" id="compatible"></div>
      </section>
      <section class="panel">
        <h2>Legacy Apps</h2>
        <div class="apps" id="legacy"></div>
      </section>
    </div>
  </main>
  <script>
    const state = { status: null, apps: [] };
    const statusEl = document.getElementById("status");
    const compatibleEl = document.getElementById("compatible");
    const legacyEl = document.getElementById("legacy");
    const errorEl = document.getElementById("error");

    function setError(error) { errorEl.textContent = error ? String(error.message || error) : ""; }
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
    async function refresh() {
      setError(null);
      try {
        const [status, apps] = await Promise.all([api("/api/status"), api("/api/apps")]);
        state.status = status;
        state.apps = apps.apps || [];
        renderStatus();
        renderApps();
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
  return createServer(async (request, response) => {
    if (await handleApiRequest({ request, response, boardUrl, requestImpl })) return;
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
