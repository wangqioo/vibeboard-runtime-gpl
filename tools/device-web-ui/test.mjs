import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWebUiSmokeApp, runSmokeFlow } from "./smoke.mjs";
import { handleApiRequest, parseArgs, renderIndexHtml } from "./server.mjs";

function makeResponse() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
    },
  };
}

describe("device web ui args", () => {
  it("uses the board URL and local port from cli flags", () => {
    assert.deepEqual(parseArgs(["--board", "http://192.168.1.32:8080", "--port", "8790"]), {
      boardUrl: "http://192.168.1.32:8080",
      port: 8790,
      host: "127.0.0.1",
    });
  });
});

describe("device web ui smoke flow", () => {
  it("creates a temporary smoke app package", () => {
    const root = mkdtempSync(join(tmpdir(), "vibeboard-device-web-smoke-test-"));
    try {
      const appDir = createWebUiSmokeApp(root);
      const info = new URL("app.info", `file://${appDir}/`);
      assert.equal(info.pathname.endsWith("/web_ui_smoke/app.info"), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exercises launch, stop, rescan, and delete through the local web proxy", async () => {
    const calls = [];
    let running = false;
    const result = await runSmokeFlow({
      boardUrl: "http://192.168.1.32:8080",
      baseUrl: "http://127.0.0.1:8790",
      appId: "web_ui_smoke",
      createTempDir: () => "/tmp/web-ui-smoke",
      upload: async ({ appDir, appId }) => {
        calls.push(["upload", appId, appDir]);
        return { appId, files: [], confirmed: true };
      },
      fetchJson: async (url, options = {}) => {
        calls.push([options.method || "GET", url]);
        if (url.endsWith("/api/apps")) return { apps: [{ id: "web_ui_smoke", compatible: true }] };
        if (url.endsWith("/api/status")) {
          return running
            ? { state: "running", running: true, current_app: "web_ui_smoke" }
            : { state: "idle", running: false, current_app: "" };
        }
        if (url.endsWith("/api/launch?app=web_ui_smoke")) {
          running = true;
          return { ok: true, launched: "web_ui_smoke" };
        }
        if (url.endsWith("/api/stop")) {
          running = false;
          return { ok: true, stopped: true };
        }
        if (url.endsWith("/api/rescan")) return { ok: true, app_count: 1 };
        if (url.endsWith("/api/delete?app=web_ui_smoke")) return { ok: true, deleted: "web_ui_smoke" };
        throw new Error(`unexpected ${url}`);
      },
      cleanup: () => {},
    });

    assert.equal(result.deleted, true);
    assert.deepEqual(calls.map((call) => call[0]), ["upload", "GET", "POST", "GET", "POST", "POST", "POST"]);
  });
});

describe("renderIndexHtml", () => {
  it("separates compatible and legacy app sections in the client UI", () => {
    const html = renderIndexHtml({ boardUrl: "http://192.168.1.32:8080" });
    assert.match(html, /Compatible Apps/);
    assert.match(html, /Legacy Apps/);
    assert.match(html, /Current App/);
    assert.match(html, /last_status/);
    assert.match(html, /\/api\/apps/);
    assert.match(html, /\/api\/status/);
  });
});

describe("handleApiRequest", () => {
  it("proxies app lifecycle API calls to the configured board URL", async () => {
    const calls = [];
    const requestImpl = async (url, body, options = {}) => {
      calls.push({ url, method: options.method, body: body.toString("utf8") });
      return { ok: true, status: 200, text: JSON.stringify({ ok: true, url }) };
    };

    const cases = [
      ["/api/status", "GET", "http://192.168.1.32:8080/status"],
      ["/api/apps", "GET", "http://192.168.1.32:8080/apps"],
      ["/api/launch?app=weather", "POST", "http://192.168.1.32:8080/launch?app=weather"],
      ["/api/stop", "POST", "http://192.168.1.32:8080/stop"],
      ["/api/rescan", "POST", "http://192.168.1.32:8080/rescan"],
      ["/api/delete?app=weather", "POST", "http://192.168.1.32:8080/apps/delete?app=weather"],
    ];

    for (const [path, method, boardUrl] of cases) {
      const response = makeResponse();
      const handled = await handleApiRequest({
        request: { url: path, method },
        response,
        boardUrl: "http://192.168.1.32:8080/",
        requestImpl,
      });
      assert.equal(handled, true);
      assert.equal(response.statusCode, 200);
      assert.deepEqual(JSON.parse(response.body), { ok: true, url: boardUrl });
    }

    assert.deepEqual(calls.map((call) => [call.method, call.url]), cases.map(([, method, boardUrl]) => [method, boardUrl]));
  });

  it("rejects unsafe delete app ids before proxying", async () => {
    const response = makeResponse();
    const handled = await handleApiRequest({
      request: { url: "/api/delete?app=../weather", method: "POST" },
      response,
      boardUrl: "http://192.168.1.32:8080",
      requestImpl: async () => {
        throw new Error("should not proxy unsafe app id");
      },
    });

    assert.equal(handled, true);
    assert.equal(response.statusCode, 400);
    assert.match(response.body, /Unsafe app id/);
  });
});
