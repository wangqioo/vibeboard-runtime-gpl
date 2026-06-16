import { readdirSync, readFileSync, statSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { basename, join, relative, sep } from "node:path";
import { spawn } from "node:child_process";

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function assertSafeRelativePath(path) {
  if (!path || path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`Unsafe upload path: ${path}`);
  }
}

export function listUploadFiles(appDir) {
  const files = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relativePath = relative(appDir, fullPath).split(sep).join("/");
      assertSafeRelativePath(relativePath);
      files.push({ fullPath, relativePath, size: statSync(fullPath).size });
    }
  }

  walk(appDir);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function postFile(url, body) {
  return sendRequest(url, body, { method: "POST" });
}

export function sendRequest(url, body = Buffer.alloc(0), { method = body.length > 0 ? "POST" : "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method,
      headers: {
        "content-length": body.length,
        "connection": "close",
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          text,
        });
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}

function runCommand(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      if (code !== 0) {
        const errorText = Buffer.concat(stderr).toString("utf8") || output;
        reject(new Error(`${cmd} exited ${code}: ${errorText.trim()}`));
        return;
      }
      resolve(output);
    });
    child.stdin.end(input);
  });
}

function parseHttpResponse(raw) {
  const separator = raw.indexOf("\r\n\r\n");
  if (separator < 0) {
    throw new Error("Invalid HTTP response from board");
  }
  const header = raw.slice(0, separator);
  const text = raw.slice(separator + 4);
  const statusMatch = header.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/);
  if (!statusMatch) {
    throw new Error("Missing HTTP status from board");
  }
  const status = Number(statusMatch[1]);
  return { ok: status >= 200 && status < 300, status, text };
}

export function createNcRequest({ runCommand: runner = runCommand, timeoutSeconds = 8 } = {}) {
  return async function ncRequest(url, body = Buffer.alloc(0), { method = body.length > 0 ? "POST" : "GET" } = {}) {
    const parsed = new URL(url);
    const port = parsed.port || "80";
    const path = `${parsed.pathname}${parsed.search}`;
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(body || "");
    const head = [
      `${method} ${path} HTTP/1.1`,
      `Host: ${parsed.hostname}:${port}`,
      `Content-Length: ${payload.length}`,
      "Connection: close",
      "",
      "",
    ].join("\r\n");
    const raw = await runner("nc", ["-w", String(timeoutSeconds), parsed.hostname, port], Buffer.concat([
      Buffer.from(head, "utf8"),
      payload,
    ]));
    return parseHttpResponse(raw);
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeStageId(appId) {
  const suffix = Date.now().toString(36);
  return `${appId}-${suffix}`;
}

async function withRetries(operation, { attempts, delayMs, label }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts && delayMs > 0) {
        await wait(delayMs);
      }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastError?.message || lastError}`);
}

async function sendBoardRequest({ url, body, method, fetchImpl, requestImpl, retryAttempts, retryDelayMs, label }) {
  return withRetries(async () => {
    const response = fetchImpl
      ? await fetchImpl(url, { method, body })
      : await requestImpl(url, body || Buffer.alloc(0), { method });
    if (!response.ok) {
      const text = typeof response.text === "function" ? await response.text() : response.text || "";
      throw new Error(`${response.status} ${text}`.trim());
    }
    return response;
  }, { attempts: retryAttempts, delayMs: retryDelayMs, label });
}

async function readResponseText(response) {
  return typeof response.text === "function" ? await response.text() : response.text || "";
}

async function requestJson({ url, method, fetchImpl, requestImpl, retryAttempts, retryDelayMs, label }) {
  const response = await sendBoardRequest({
    url,
    body: Buffer.alloc(0),
    method,
    fetchImpl,
    requestImpl,
    retryAttempts,
    retryDelayMs,
    label,
  });
  const text = await readResponseText(response);
  return JSON.parse(text);
}

export async function uploadApp({
  appDir,
  boardUrl,
  appId = basename(appDir),
  fetchImpl,
  requestImpl = sendRequest,
  retryAttempts = 3,
  retryDelayMs = 250,
  confirm = true,
  staged = true,
  stageId = makeStageId(appId),
}) {
  if (!boardUrl) {
    throw new Error("boardUrl is required");
  }
  assertSafeRelativePath(appId);

  const base = boardUrl.replace(/\/+$/, "");
  const files = listUploadFiles(appDir);
  try {
    for (const file of files) {
      const stageQuery = staged ? `&stage=${encodeURIComponent(stageId)}` : "";
      const url = `${base}/install?app=${encodeURIComponent(appId)}&path=${encodePath(file.relativePath)}${stageQuery}`;
      const body = readFileSync(file.fullPath);
      await sendBoardRequest({
        url,
        body,
        method: "POST",
        fetchImpl,
        requestImpl,
        retryAttempts,
        retryDelayMs,
        label: `Upload ${file.relativePath}`,
      });
    }
  } catch (error) {
    if (staged) {
      try {
        await sendBoardRequest({
          url: `${base}/install/abort?stage=${encodeURIComponent(stageId)}`,
          body: Buffer.alloc(0),
          method: "POST",
          fetchImpl,
          requestImpl,
          retryAttempts: 1,
          retryDelayMs: 0,
          label: `Abort stage ${stageId}`,
        });
      } catch {
        // Preserve the original upload failure; abort is best-effort cleanup.
      }
    }
    throw error;
  }

  let apps = null;
  if (confirm) {
    if (staged) {
      await requestJson({
        url: `${base}/install/commit?app=${encodeURIComponent(appId)}&stage=${encodeURIComponent(stageId)}`,
        method: "POST",
        fetchImpl,
        requestImpl,
        retryAttempts,
        retryDelayMs,
        label: `Commit ${appId}`,
      });
    } else {
      await requestJson({
        url: `${base}/rescan`,
        method: "POST",
        fetchImpl,
        requestImpl,
        retryAttempts,
        retryDelayMs,
        label: "Rescan",
      });
    }
    apps = await requestJson({
      url: `${base}/apps`,
      method: "GET",
      fetchImpl,
      requestImpl,
      retryAttempts,
      retryDelayMs,
      label: "List apps",
    });
    const found = Array.isArray(apps.apps) && apps.apps.some((app) => app.id === appId);
    if (!found) {
      throw new Error(`Uploaded app ${appId} was not found after rescan`);
    }
  }

  return { appId, files, confirmed: confirm, apps, staged, stageId: staged ? stageId : null };
}

export async function launchApp({
  boardUrl,
  appId,
  fetchImpl,
  requestImpl = sendRequest,
  retryAttempts = 3,
  retryDelayMs = 250,
}) {
  if (!boardUrl) {
    throw new Error("boardUrl is required");
  }
  assertSafeRelativePath(appId);

  const base = boardUrl.replace(/\/+$/, "");
  return requestJson({
    url: `${base}/launch?app=${encodeURIComponent(appId)}`,
    method: "POST",
    fetchImpl,
    requestImpl,
    retryAttempts,
    retryDelayMs,
    label: `Launch ${appId}`,
  });
}
