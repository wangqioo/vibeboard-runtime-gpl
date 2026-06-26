import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseInputSmokeArgs, runInputSmoke } from "./index.mjs";

describe("parseInputSmokeArgs", () => {
  it("parses board, app, keys, and expected final state", () => {
    assert.deepEqual(
      parseInputSmokeArgs([
        "--board",
        "http://192.168.1.32:8080",
        "--app",
        "smoke_key",
        "--key",
        "LEFT:SHORT",
        "--key=HOME:SHORT",
        "--expect-state",
        "idle",
      ]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appId: "smoke_key",
        keys: [
          { code: "LEFT", event: "SHORT" },
          { code: "HOME", event: "SHORT" },
        ],
        expectState: "idle",
        activePolls: 20,
        metricsPolls: 0,
        requireEvents: [],
      },
    );
  });

  it("requires an app and at least one key", () => {
    assert.throws(() => parseInputSmokeArgs(["--key", "HOME:SHORT"]), /--app is required/);
    assert.throws(() => parseInputSmokeArgs(["--app", "smoke_key"]), /at least one --key/);
  });
});

describe("runInputSmoke", () => {
  it("launches the app, injects keys, and verifies final state", async () => {
    const calls = [];
    const result = await runInputSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_key",
      keys: [
        { code: "LEFT", event: "SHORT" },
        { code: "HOME", event: "SHORT" },
      ],
      expectState: "idle",
      delayMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_key") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_key"}' };
        }
        if (url === "http://board:8080/status" && calls.length === 2) {
          return { ok: true, status: 200, text: '{"state":"running","running":true,"current_app":"smoke_key"}' };
        }
        if (url === "http://board:8080/input/key?code=LEFT&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true,"injected":{"code":"LEFT","event":"SHORT"}}' };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true,"injected":{"code":"HOME","event":"SHORT"}}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"idle","running":false,"current_app":"","last_status":"ESP_ERR_INVALID_STATE"}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.launched, "smoke_key");
    assert.equal(result.injected.length, 2);
    assert.equal(result.status.state, "idle");
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_key", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/input/key?code=LEFT&event=SHORT", method: "POST" },
      { url: "http://board:8080/input/key?code=HOME&event=SHORT", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
    ]);
  });

  it("waits until the launched app is active before injecting keys", async () => {
    const calls = [];
    const statuses = [
      '{"state":"idle","running":false,"current_app":""}',
      '{"state":"running","running":true,"current_app":"smoke_key"}',
      '{"state":"running","running":true,"current_app":"smoke_key"}',
    ];
    const result = await runInputSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_key",
      keys: [{ code: "LEFT", event: "SHORT" }],
      expectState: "running",
      delayMs: 0,
      activePolls: 3,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_key") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_key"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: statuses.shift() };
        }
        if (url === "http://board:8080/input/key?code=LEFT&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true,"injected":{"code":"LEFT","event":"SHORT"}}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.status.current_app, "smoke_key");
    assert.deepEqual(calls.map((call) => call.url), [
      "http://board:8080/launch?app=smoke_key",
      "http://board:8080/status",
      "http://board:8080/status",
      "http://board:8080/input/key?code=LEFT&event=SHORT",
      "http://board:8080/status",
    ]);
  });

  it("can require app metrics to include specific key events", async () => {
    const metrics = [
      '{"ok":true,"count":1,"events":{"LEFT:SHORT":1}}',
      '{"ok":true,"count":4,"events":{"LEFT:SHORT":1,"UP:LONG_START":1,"UP:LONG_REPEAT":1,"UP:LONG_END":1}}',
    ];
    const result = await runInputSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_key",
      keys: [{ code: "LEFT", event: "SHORT" }],
      expectState: "running",
      delayMs: 0,
      metricsPolls: 2,
      requireEvents: [
        { code: "UP", event: "LONG_REPEAT" },
        { code: "UP", event: "LONG_END" },
      ],
      requestImpl: async (url) => {
        if (url === "http://board:8080/launch?app=smoke_key") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_key"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","running":true,"current_app":"smoke_key"}' };
        }
        if (url === "http://board:8080/input/key?code=LEFT&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true,"injected":{"code":"LEFT","event":"SHORT"}}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_key&path=metrics.json") {
          return { ok: true, status: 200, text: metrics.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.metrics.events["UP:LONG_REPEAT"], 1);
    assert.equal(result.metrics.events["UP:LONG_END"], 1);
  });

  it("fails when the final state does not match", async () => {
    const statuses = [
      '{"state":"running","current_app":"voice_ai"}',
      '{"state":"idle","current_app":""}',
    ];
    await assert.rejects(
      runInputSmoke({
        boardUrl: "http://board:8080",
        appId: "voice_ai",
        keys: [{ code: "HOME", event: "SHORT" }],
        expectState: "running",
        delayMs: 0,
        requestImpl: async (url) => {
          if (url.includes("/status")) {
            return { ok: true, status: 200, text: statuses.shift() };
          }
          return { ok: true, status: 200, text: '{"ok":true}' };
        },
      }),
      /expected final state running, got idle/,
    );
  });

  it("fails when required key metrics are missing", async () => {
    await assert.rejects(
      runInputSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_key",
        keys: [{ code: "LEFT", event: "SHORT" }],
        expectState: "running",
        delayMs: 0,
        metricsPolls: 1,
        requireEvents: [{ code: "UP", event: "LONG_REPEAT" }],
        requestImpl: async (url) => {
          if (url.includes("/status")) {
            return { ok: true, status: 200, text: '{"state":"running","current_app":"smoke_key"}' };
          }
          if (url.includes("/apps/file")) {
            return { ok: true, status: 200, text: '{"ok":true,"events":{"LEFT:SHORT":1}}' };
          }
          return { ok: true, status: 200, text: '{"ok":true}' };
        },
      }),
      /expected smoke_key metrics event UP:LONG_REPEAT/,
    );
  });
});
