import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDeleteCliArgs } from "./delete.mjs";
import {
  createInterruptedUploadSmokeApp,
  parseInterruptedUploadCliArgs,
  runInterruptedUploadSmoke,
} from "./interrupted-smoke.mjs";
import { parseLaunchCliArgs } from "./launch.mjs";
import { parseUploadCliArgs } from "./cli.mjs";
import { createNcRequest, deleteApp, launchApp, listUploadFiles, sendRequest, stopApp, uploadApp } from "./index.mjs";

function makePackage() {
  const root = mkdtempSync(join(tmpdir(), "vibeboard-uploader-"));
  const appDir = join(root, "dist/apps/demo");
  mkdirSync(join(appDir, "assets"), { recursive: true });
  writeFileSync(join(appDir, "app.info"), "name = demo\nentry = main.lua\ndescription = Demo\n");
  writeFileSync(join(appDir, "main.lua"), "print('demo')\n");
  writeFileSync(join(appDir, "assets/icon.txt"), "icon\n");
  return { root, appDir };
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function byteLength(text) {
  return Buffer.byteLength(text);
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
  it("uploads files into a stage and commits the app by default", async () => {
    const { root, appDir } = makePackage();
    const calls = [];
    try {
      const result = await uploadApp({
        appDir,
        appId: "demo",
        boardUrl: "http://192.168.1.32:8080/",
        stageId: "demo-stage",
        fetchImpl: async (url, options) => {
          calls.push({ url, method: options.method, body: options.body.toString("utf8") });
          if (url.endsWith("/install/commit?app=demo&stage=demo-stage")) return { ok: true, status: 200, text: async () => '{"ok":true,"committed":"demo"}' };
          if (url.endsWith("/apps")) return { ok: true, status: 200, text: async () => '{"apps":[{"id":"demo"}]}' };
          return { ok: true, status: 200, text: async () => "ok" };
        },
      });

      assert.equal(result.files.length, 3);
      assert.equal(result.confirmed, true);
      assert.equal(result.staged, true);
      assert.equal(calls[0].url, "http://192.168.1.32:8080/install?app=demo&path=app.info&stage=demo-stage");
      assert.equal(calls[0].method, "POST");
      assert.match(calls[0].body, /name = demo/);
      assert.ok(calls.some((call) => call.url.endsWith("path=assets/icon.txt&stage=demo-stage")));
      assert.ok(calls.some((call) => call.url === "http://192.168.1.32:8080/install/commit?app=demo&stage=demo-stage"));
      assert.ok(calls.some((call) => call.url === "http://192.168.1.32:8080/apps"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("aborts the stage when a staged upload fails", async () => {
    const { root, appDir } = makePackage();
    const calls = [];
    try {
      await assert.rejects(
        uploadApp({
          appDir,
          appId: "demo",
          boardUrl: "http://192.168.1.32:8080",
          retryAttempts: 1,
          stageId: "demo-stage",
          requestImpl: async (url, body, options = {}) => {
            calls.push({ url, method: options.method, body: body ? body.toString("utf8") : "" });
            if (url.endsWith("/install/abort?stage=demo-stage")) return { ok: true, status: 200, text: '{"ok":true,"aborted":"demo-stage"}' };
            if (url.includes("path=assets/icon.txt")) throw new Error("write failed");
            return { ok: true, status: 200, text: "ok\n" };
          },
        }),
        /write failed/,
      );
      assert.ok(calls.some((call) => call.url === "http://192.168.1.32:8080/install/abort?stage=demo-stage"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("can use the legacy direct install path for old firmware", async () => {
    const { root, appDir } = makePackage();
    const calls = [];
    try {
      const result = await uploadApp({
        appDir,
        appId: "demo",
        boardUrl: "http://192.168.1.32:8080/",
        staged: false,
        fetchImpl: async (url, options) => {
          calls.push({ url, method: options.method, body: options.body.toString("utf8") });
          if (url.endsWith("/rescan")) return { ok: true, status: 200, text: async () => '{"ok":true,"app_count":1}' };
          if (url.endsWith("/apps")) return { ok: true, status: 200, text: async () => '{"apps":[{"id":"demo"}]}' };
          return { ok: true, status: 200, text: async () => "ok" };
        },
      });

      assert.equal(result.staged, false);
      assert.equal(calls[0].url, "http://192.168.1.32:8080/install?app=demo&path=app.info");
      assert.ok(calls.some((call) => call.url === "http://192.168.1.32:8080/rescan"));
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
        staged: false,
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
        staged: false,
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
          staged: false,
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

  it("rejects a packaged app when local files no longer match manifest hashes", async () => {
    const { root, appDir } = makePackage();
    const calls = [];
    try {
      const appInfo = "name = demo\nentry = main.lua\ndescription = Demo\n";
      const mainLua = "print('demo')\n";
      const icon = "icon\n";
      writeFileSync(join(appDir, "manifest.json"), JSON.stringify({
        schema: "vibeboard-runtime-app-package@2",
        files: [
          { path: "app.info", size: byteLength(appInfo), sha256: sha256(appInfo) },
          { path: "main.lua", size: byteLength(mainLua), sha256: sha256(mainLua) },
          { path: "assets/icon.txt", size: byteLength(icon), sha256: sha256(icon) }
        ]
      }));
      writeFileSync(join(appDir, "main.lua"), "print('nope')\n");

      await assert.rejects(
        uploadApp({
          appDir,
          appId: "demo",
          boardUrl: "http://192.168.1.32:8080",
          requestImpl: async (url) => {
            calls.push(url);
            return { ok: true, status: 200, text: "ok\n" };
          },
        }),
        /Package integrity check failed: main\.lua sha256 mismatch/,
      );
      assert.equal(calls.length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("interrupted upload smoke", () => {
  it("creates a temporary app package for staged abort checks", () => {
    const root = mkdtempSync(join(tmpdir(), "vibeboard-interrupted-upload-test-"));
    try {
      const appDir = createInterruptedUploadSmokeApp(root, "interrupted_smoke");
      const files = listUploadFiles(appDir).map((file) => file.relativePath);
      assert.deepEqual(files, ["app.info", "assets/payload.txt", "main.lua"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("aborts a staged upload after an intentional file failure and confirms absence", async () => {
    const calls = [];
    const result = await runInterruptedUploadSmoke({
      boardUrl: "http://192.168.1.32:8080",
      appId: "interrupted_smoke",
      stageId: "interrupted-stage",
      failPath: "main.lua",
      createTempDir: async () => mkdtempSync(join(tmpdir(), "vibeboard-interrupted-upload-test-")),
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method, body: body.toString("utf8") });
        if (url.includes("path=main.lua")) {
          throw new Error("intentional interrupted upload at main.lua");
        }
        if (url.endsWith("/install/abort?stage=interrupted-stage")) {
          return { ok: true, status: 200, text: '{"ok":true,"aborted":"interrupted-stage"}' };
        }
        if (url.endsWith("/apps")) {
          return { ok: true, status: 200, text: '{"apps":[{"id":"other"}]}' };
        }
        return { ok: true, status: 200, text: "ok\n" };
      },
    });

    assert.equal(result.appId, "interrupted_smoke");
    assert.equal(result.aborted, true);
    assert.equal(result.confirmedAbsent, true);
    assert.match(result.error, /intentional interrupted upload at main\.lua/);
    assert.ok(calls.some((call) => call.url.endsWith("path=app.info&stage=interrupted-stage")));
    assert.ok(calls.some((call) => call.url.endsWith("path=assets/payload.txt&stage=interrupted-stage")));
    assert.ok(calls.some((call) => call.url.endsWith("/install/abort?stage=interrupted-stage")));
    assert.ok(calls.some((call) => call.url.endsWith("/apps")));
    assert.equal(calls.some((call) => call.url.includes("/install/commit")), false);
  });

  it("fails when the interrupted app appears after abort confirmation", async () => {
    await assert.rejects(
      runInterruptedUploadSmoke({
        boardUrl: "http://192.168.1.32:8080",
        appId: "interrupted_smoke",
        stageId: "interrupted-stage",
        failPath: "main.lua",
        createTempDir: async () => mkdtempSync(join(tmpdir(), "vibeboard-interrupted-upload-test-")),
        requestImpl: async (url) => {
          if (url.includes("path=main.lua")) {
            throw new Error("intentional interrupted upload at main.lua");
          }
          if (url.endsWith("/apps")) {
            return { ok: true, status: 200, text: '{"apps":[{"id":"interrupted_smoke"}]}' };
          }
          return { ok: true, status: 200, text: "ok\n" };
        },
      }),
      /interrupted_smoke is still present after interrupted upload abort/,
    );
  });

  it("parses interrupted upload smoke cli args", () => {
    assert.deepEqual(
      parseInterruptedUploadCliArgs([
        "--fail-path",
        "assets/payload.txt",
        "http://192.168.1.32:8080",
        "interrupted_smoke",
      ]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appId: "interrupted_smoke",
        failPath: "assets/payload.txt",
      },
    );
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
        staged: true,
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
        staged: true,
      },
    );
    assert.equal(
      parseUploadCliArgs(["--transport=nc", "http://192.168.1.32:8080", "dist/apps/demo"]).transport,
      "nc",
    );
  });

  it("can opt into the legacy direct install workflow", () => {
    assert.deepEqual(
      parseUploadCliArgs(["--legacy-direct", "http://192.168.1.32:8080", "dist/apps/demo", "demo"]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appDir: "dist/apps/demo",
        appId: "demo",
        transport: "native",
        staged: false,
      },
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

describe("sendRequest", () => {
  it("times out and destroys native HTTP requests that do not finish", async () => {
    const request = {
      on() {},
      setTimeout(ms, callback) {
        assert.equal(ms, 12);
        callback();
        return this;
      },
      destroy: mock.fn(),
      end() {},
    };

    await assert.rejects(
      sendRequest("http://192.168.1.32:8080/status", Buffer.alloc(0), {
        method: "GET",
        timeoutMs: 12,
        httpRequestImpl: () => request,
      }),
      /timed out after 12ms/,
    );
    assert.equal(request.destroy.mock.callCount(), 1);
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

describe("stopApp", () => {
  it("posts a stop request", async () => {
    const calls = [];
    const result = await stopApp({
      boardUrl: "http://192.168.1.32:8080/",
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method, body });
        return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
      },
    });

    assert.deepEqual(result, { ok: true, stopped: true });
    assert.equal(calls[0].url, "http://192.168.1.32:8080/stop");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].body.length, 0);
  });
});

describe("deleteApp", () => {
  it("deletes a non-running app without stopping the current app", async () => {
    const calls = [];
    const result = await deleteApp({
      boardUrl: "http://192.168.1.32:8080/",
      appId: "demo",
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url.endsWith("/status")) {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"other"}' };
        }
        if (url.endsWith("/apps/delete?app=demo")) {
          return { ok: true, status: 200, text: '{"ok":true,"deleted":"demo"}' };
        }
        if (url.endsWith("/apps")) {
          return { ok: true, status: 200, text: '{"apps":[{"id":"other"}]}' };
        }
        throw new Error(`unexpected url ${url}`);
      },
    });

    assert.equal(result.deleted, "demo");
    assert.equal(result.stopped, false);
    assert.equal(calls.some((call) => call.url.endsWith("/stop")), false);
  });

  it("stops the app before deleting when the target is running", async () => {
    const calls = [];
    const result = await deleteApp({
      boardUrl: "http://192.168.1.32:8080",
      appId: "demo",
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url.endsWith("/status")) {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"demo"}' };
        }
        if (url.endsWith("/stop")) {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url.endsWith("/apps/delete?app=demo")) {
          return { ok: true, status: 200, text: '{"ok":true,"deleted":"demo"}' };
        }
        if (url.endsWith("/apps")) {
          return { ok: true, status: 200, text: '{"apps":[]}' };
        }
        throw new Error(`unexpected url ${url}`);
      },
    });

    assert.equal(result.deleted, "demo");
    assert.equal(result.stopped, true);
    assert.deepEqual(
      calls.map((call) => call.url.replace("http://192.168.1.32:8080", "")),
      ["/status", "/stop", "/apps/delete?app=demo", "/apps"],
    );
  });

  it("fails when the deleted app is still listed after confirmation", async () => {
    await assert.rejects(
      deleteApp({
        boardUrl: "http://192.168.1.32:8080",
        appId: "demo",
        requestImpl: async (url) => {
          if (url.endsWith("/status")) {
            return { ok: true, status: 200, text: '{"state":"idle","current_app":null}' };
          }
          if (url.endsWith("/apps/delete?app=demo")) {
            return { ok: true, status: 200, text: '{"ok":true,"deleted":"demo"}' };
          }
          if (url.endsWith("/apps")) {
            return { ok: true, status: 200, text: '{"apps":[{"id":"demo"}]}' };
          }
          throw new Error(`unexpected url ${url}`);
        },
      }),
      /Deleted app demo is still present after rescan/,
    );
  });
});

describe("parseDeleteCliArgs", () => {
  it("uses native transport and stop-if-running by default", () => {
    assert.deepEqual(parseDeleteCliArgs(["http://192.168.1.32:8080", "demo"]), {
      boardUrl: "http://192.168.1.32:8080",
      appId: "demo",
      transport: "native",
      stopIfRunning: true,
    });
  });

  it("supports nc transport and no-stop mode", () => {
    assert.deepEqual(parseDeleteCliArgs(["--transport=nc", "--no-stop", "http://192.168.1.32:8080", "demo"]), {
      boardUrl: "http://192.168.1.32:8080",
      appId: "demo",
      transport: "nc",
      stopIfRunning: false,
    });
  });
});
