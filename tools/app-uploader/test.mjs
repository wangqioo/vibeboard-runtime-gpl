import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLaunchCliArgs } from "./launch.mjs";
import { parseUploadCliArgs } from "./cli.mjs";
import { createNcRequest, launchApp, listUploadFiles, uploadApp } from "./index.mjs";

function makePackage() {
  const root = mkdtempSync(join(tmpdir(), "vibeboard-uploader-"));
  const appDir = join(root, "dist/apps/demo");
  mkdirSync(join(appDir, "assets"), { recursive: true });
  writeFileSync(join(appDir, "app.info"), "name = demo\nentry = main.lua\ndescription = Demo\n");
  writeFileSync(join(appDir, "main.lua"), "print('demo')\n");
  writeFileSync(join(appDir, "assets/icon.txt"), "icon\n");
  return { root, appDir };
}

describe("listUploadFiles", () => {
  it("lists ordinary files using slash-separated relative paths", () => {
    const { root, appDir } = makePackage();
    try {
      const files = listUploadFiles(appDir).map((file) => file.relativePath);
      assert.deepEqual(files, ["app.info", "assets/icon.txt", "main.lua"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips symlinks", () => {
    const { root, appDir } = makePackage();
    try {
      try {
        symlinkSync(join(appDir, "main.lua"), join(appDir, "main-link.lua"));
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return;
        throw error;
      }
      const files = listUploadFiles(appDir).map((file) => file.relativePath);
      assert.equal(files.includes("main-link.lua"), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("uploadApp", () => {
  it("posts each file to the board install endpoint", async () => {
    const { root, appDir } = makePackage();
    const calls = [];
    try {
      const result = await uploadApp({
        appDir,
        appId: "demo",
        boardUrl: "http://192.168.1.32:8080/",
        fetchImpl: async (url, options) => {
          calls.push({ url, method: options.method, body: options.body.toString("utf8") });
          if (url.endsWith("/rescan")) return { ok: true, status: 200, text: async () => '{"ok":true,"app_count":1}' };
          if (url.endsWith("/apps")) return { ok: true, status: 200, text: async () => '{"apps":[{"id":"demo"}]}' };
          return { ok: true, status: 200, text: async () => "ok" };
        },
      });

      assert.equal(result.files.length, 3);
      assert.equal(result.confirmed, true);
      assert.equal(calls[0].url, "http://192.168.1.32:8080/install?app=demo&path=app.info");
      assert.equal(calls[0].method, "POST");
      assert.match(calls[0].body, /name = demo/);
      assert.ok(calls.some((call) => call.url.endsWith("path=assets/icon.txt")));
      assert.ok(calls.some((call) => call.url === "http://192.168.1.32:8080/rescan"));
      assert.ok(calls.some((call) => call.url === "http://192.168.1.32:8080/apps"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uploads through native http when fetch is unavailable", async () => {
    const { root, appDir } = makePackage();
    const requests = [];
    const previousFetch = globalThis.fetch;

    try {
      globalThis.fetch = undefined;
      const result = await uploadApp({
        appDir,
        appId: "demo",
        boardUrl: "http://192.168.1.32:8080",
        requestImpl: async (url, body, options = {}) => {
          requests.push({ url, method: options.method, body: body ? body.toString("utf8") : "" });
          if (url.endsWith("/rescan")) return { ok: true, status: 200, text: '{"ok":true,"app_count":1}' };
          if (url.endsWith("/apps")) return { ok: true, status: 200, text: '{"apps":[{"id":"demo"}]}' };
          return { ok: true, status: 200, text: "ok\n" };
        },
      });

      assert.equal(result.files.length, 3);
      assert.equal(result.confirmed, true);
      assert.equal(requests[0].url, "http://192.168.1.32:8080/install?app=demo&path=app.info");
      assert.match(requests[0].body, /name = demo/);
      assert.ok(requests.some((request) => request.url.endsWith("/rescan") && request.method === "POST"));
      assert.ok(requests.some((request) => request.url.endsWith("/apps") && request.method === "GET"));
    } finally {
      globalThis.fetch = previousFetch;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("retries transient upload failures", async () => {
    const { root, appDir } = makePackage();
    let appInfoAttempts = 0;
    try {
      const result = await uploadApp({
        appDir,
        appId: "demo",
        boardUrl: "http://192.168.1.32:8080",
        retryDelayMs: 0,
        requestImpl: async (url) => {
          if (url.endsWith("path=app.info")) {
            appInfoAttempts++;
            if (appInfoAttempts === 1) {
              throw new Error("connect EHOSTUNREACH 192.168.1.32:8080");
            }
          }
          if (url.endsWith("/rescan")) return { ok: true, status: 200, text: '{"ok":true,"app_count":1}' };
          if (url.endsWith("/apps")) return { ok: true, status: 200, text: '{"apps":[{"id":"demo"}]}' };
          return { ok: true, status: 200, text: "ok\n" };
        },
      });

      assert.equal(result.confirmed, true);
      assert.equal(appInfoAttempts, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when the board does not list the uploaded app after rescan", async () => {
    const { root, appDir } = makePackage();
    try {
      await assert.rejects(
        uploadApp({
          appDir,
          appId: "demo",
          boardUrl: "http://192.168.1.32:8080",
          requestImpl: async (url) => {
            if (url.endsWith("/rescan")) return { ok: true, status: 200, text: '{"ok":true,"app_count":1}' };
            if (url.endsWith("/apps")) return { ok: true, status: 200, text: '{"apps":[{"id":"other"}]}' };
            return { ok: true, status: 200, text: "ok\n" };
          },
        }),
        /Uploaded app demo was not found after rescan/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("parseUploadCliArgs", () => {
  it("uses the native Node HTTP transport by default", () => {
    assert.deepEqual(
      parseUploadCliArgs(["http://192.168.1.32:8080", "dist/apps/demo", "demo"]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appDir: "dist/apps/demo",
        appId: "demo",
        transport: "native",
      },
    );
  });

  it("keeps nc as an explicit fallback transport", () => {
    assert.deepEqual(
      parseUploadCliArgs(["--transport", "nc", "http://192.168.1.32:8080", "dist/apps/demo"]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appDir: "dist/apps/demo",
        appId: undefined,
        transport: "nc",
      },
    );
    assert.equal(
      parseUploadCliArgs(["--transport=nc", "http://192.168.1.32:8080", "dist/apps/demo"]).transport,
      "nc",
    );
  });

  it("rejects unknown uploader transports", () => {
    assert.throws(
      () => parseUploadCliArgs(["--transport", "curl", "http://192.168.1.32:8080", "dist/apps/demo"]),
      /Unsupported transport: curl/,
    );
  });
});

describe("parseLaunchCliArgs", () => {
  it("uses the native Node HTTP transport by default", () => {
    assert.deepEqual(
      parseLaunchCliArgs(["http://192.168.1.32:8080", "demo"]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appId: "demo",
        transport: "native",
      },
    );
  });

  it("keeps nc as an explicit launch fallback transport", () => {
    assert.deepEqual(
      parseLaunchCliArgs(["--transport=nc", "http://192.168.1.32:8080", "demo"]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appId: "demo",
        transport: "nc",
      },
    );
  });
});

describe("createNcRequest", () => {
  it("sends raw HTTP through an nc-compatible runner", async () => {
    const commands = [];
    const request = createNcRequest({
      runCommand: async (cmd, args, input) => {
        commands.push({ cmd, args, input });
        return "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 3\r\n\r\nok\n";
      },
    });

    const result = await request("http://192.168.1.32:8080/install?app=demo&path=app.info", Buffer.from("demo"), {
      method: "POST",
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.text, "ok\n");
    assert.equal(commands[0].cmd, "nc");
    assert.deepEqual(commands[0].args, ["-w", "8", "192.168.1.32", "8080"]);
    const input = commands[0].input.toString("utf8");
    assert.match(input, /POST \/install\?app=demo&path=app\.info HTTP\/1\.1/);
    assert.match(input, /Content-Length: 4/);
    assert.ok(input.endsWith("demo"));
  });
});

describe("launchApp", () => {
  it("posts a launch request for an installed app", async () => {
    const calls = [];
    const result = await launchApp({
      boardUrl: "http://192.168.1.32:8080/",
      appId: "demo",
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method, body });
        return { ok: true, status: 200, text: '{"ok":true,"launched":"demo"}' };
      },
    });

    assert.deepEqual(result, { ok: true, launched: "demo" });
    assert.equal(calls[0].url, "http://192.168.1.32:8080/launch?app=demo");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].body.length, 0);
  });
});
