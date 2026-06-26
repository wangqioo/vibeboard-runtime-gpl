import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAppManagerSmokeArgs, runAppManagerSmoke } from "./index.mjs";

describe("parseAppManagerSmokeArgs", () => {
  it("parses board URL, manager app, target app, and polling options", () => {
    assert.deepEqual(
      parseAppManagerSmokeArgs([
        "--board",
        "http://board:8080",
        "--manager-app",
        "smoke_app_manager",
        "--target-app",
        "smoke_key",
        "--polls",
        "6",
        "--interval-ms",
        "0",
      ]),
      {
        boardUrl: "http://board:8080",
        managerAppId: "smoke_app_manager",
        targetAppId: "smoke_key",
        expectState: "running",
        polls: 6,
        intervalMs: 0,
      },
    );
  });
});

describe("runAppManagerSmoke", () => {
  it("launches smoke_app_manager and waits for handoff to smoke_key", async () => {
    const calls = [];
    const result = await runAppManagerSmoke({
      boardUrl: "http://board:8080",
      managerAppId: "smoke_app_manager",
      targetAppId: "smoke_key",
      polls: 2,
      intervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_app_manager") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_app_manager"}' };
        }
        if (url === "http://board:8080/status" && calls.filter((call) => call.url.endsWith("/status")).length === 1) {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"smoke_app_manager"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"smoke_key"}' };
        }
        throw new Error(`unexpected URL ${url}`);
      },
    });

    assert.equal(result.launched, "smoke_app_manager");
    assert.equal(result.targetAppId, "smoke_key");
    assert.equal(result.status.current_app, "smoke_key");
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_app_manager", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/status", method: "GET" },
    ]);
  });
});
