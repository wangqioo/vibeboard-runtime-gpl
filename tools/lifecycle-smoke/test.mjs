import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLifecycleSmokeArgs, runLifecycleSmoke } from "./index.mjs";

describe("parseLifecycleSmokeArgs", () => {
  it("parses board URL, app id, state, and polling options", () => {
    assert.deepEqual(
      parseLifecycleSmokeArgs([
        "--board",
        "http://board:8080",
        "--app",
        "smoke_controls",
        "--expect-state",
        "running",
        "--polls",
        "3",
        "--interval-ms",
        "0",
        "--stop",
        "--stop-polls",
        "4",
        "--metrics-polls",
        "6",
        "--require-metrics",
        "ui_ready=true",
        "--require-metrics",
        "boot_stage=3",
      ]),
      {
        boardUrl: "http://board:8080",
        appId: "smoke_controls",
        expectState: "running",
        expectCurrentApp: "smoke_controls",
        allowStarting: false,
        polls: 3,
        intervalMs: 0,
        stop: true,
        stopPolls: 4,
        stopIntervalMs: 500,
        metricsPolls: 6,
        metricsIntervalMs: 500,
        requireMetrics: [
          { key: "ui_ready", operator: "=", value: true },
          { key: "boot_stage", operator: "=", value: 3 },
        ],
      },
    );
  });

  it("requires an app id for the generic lifecycle smoke", () => {
    assert.throws(
      () => parseLifecycleSmokeArgs(["--board", "http://board:8080"]),
      /--app is required/,
    );
  });
});

describe("runLifecycleSmoke", () => {
  it("launches an app and returns the first matching status", async () => {
    const calls = [];
    const statuses = [
      '{"state":"starting","current_app":"smoke_gamepad","last_status":"ESP_OK"}',
      '{"state":"running","current_app":"smoke_gamepad","last_status":"ESP_OK"}',
    ];
    const result = await runLifecycleSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_gamepad",
      expectState: "running",
      expectCurrentApp: "smoke_gamepad",
      polls: 2,
      intervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_gamepad") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_gamepad"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: statuses.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.launched, "smoke_gamepad");
    assert.equal(result.status.state, "running");
    assert.equal(result.polls, 2);
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_gamepad", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/status", method: "GET" },
    ]);
  });

  it("can accept starting while waiting for running", async () => {
    const calls = [];
    const statuses = [
      '{"state":"starting","current_app":"smoke_gamepad","last_status":"ESP_OK"}',
    ];
    const result = await runLifecycleSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_gamepad",
      expectState: "running",
      expectCurrentApp: "smoke_gamepad",
      allowStarting: true,
      polls: 1,
      intervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_gamepad") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_gamepad"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: statuses.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.status.state, "starting");
    assert.equal(result.polls, 1);
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_gamepad", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
    ]);
  });

  it("stops the launched app and waits for the board to return idle", async () => {
    const calls = [];
    const statuses = [
      '{"state":"running","current_app":"weather","last_status":"ESP_OK"}',
      '{"state":"stopping","current_app":"weather","last_status":"ESP_OK"}',
      '{"state":"idle","current_app":"","last_status":"ESP_OK"}',
    ];
    const result = await runLifecycleSmoke({
      boardUrl: "http://board:8080",
      appId: "weather",
      polls: 1,
      intervalMs: 0,
      stop: true,
      stopPolls: 2,
      stopIntervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=weather") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"weather"}' };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: statuses.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.stop.stopped, true);
    assert.equal(result.stop.status.state, "idle");
    assert.equal(result.stop.status.current_app, "");
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=weather", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/stop", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/status", method: "GET" },
    ]);
  });

  it("uses a longer timeout for stop requests", async () => {
    const calls = [];
    let statusCalls = 0;
    const result = await runLifecycleSmoke({
      boardUrl: "http://board:8080",
      appId: "weather",
      polls: 1,
      intervalMs: 0,
      stop: true,
      stopPolls: 1,
      stopIntervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method, timeoutMs: options.timeoutMs });
        if (url === "http://board:8080/launch?app=weather") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"weather"}' };
        }
        if (url === "http://board:8080/status") {
          statusCalls += 1;
          return {
            ok: true,
            status: 200,
            text: statusCalls === 1
              ? '{"state":"running","current_app":"weather","last_status":"ESP_OK"}'
              : '{"state":"idle","current_app":"","last_status":"ESP_OK"}',
          };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.stop.stopRequestOk, true);
    assert.equal(calls.find((call) => call.url === "http://board:8080/stop").timeoutMs, 16000);
  });

  it("waits for required app metrics before returning success", async () => {
    const calls = [];
    const metrics = [
      '{"ui_ready":true,"fonts_ready":false,"assets_ready":false,"boot_stage":1}',
      '{"ui_ready":true,"fonts_ready":true,"assets_ready":true,"boot_stage":3}',
    ];

    const result = await runLifecycleSmoke({
      boardUrl: "http://board:8080",
      appId: "weather",
      polls: 1,
      intervalMs: 0,
      metricsPolls: 2,
      metricsIntervalMs: 0,
      requireMetrics: [
        { key: "ui_ready", value: true },
        { key: "fonts_ready", value: true },
        { key: "assets_ready", value: true },
        { key: "boot_stage", value: 3 },
      ],
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=weather") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"weather"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"weather","last_status":"ESP_OK"}' };
        }
        if (url === "http://board:8080/apps/file?app=weather&path=metrics.json") {
          return { ok: true, status: 200, text: metrics.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.metrics.boot_stage, 3);
    assert.equal(result.metricsPolls, 2);
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=weather", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/apps/file?app=weather&path=metrics.json", method: "GET" },
      { url: "http://board:8080/apps/file?app=weather&path=metrics.json", method: "GET" },
    ]);
  });

  it("supports lower-bound numeric metric requirements", async () => {
    const metrics = [
      '{"ui_ready":true,"network_attempts":0,"price_ready":false}',
      '{"ui_ready":true,"network_attempts":2,"price_ready":true}',
    ];

    const parsed = parseLifecycleSmokeArgs([
      "--app",
      "btc",
      "--require-metrics",
      "network_attempts>=1",
    ]);
    assert.deepEqual(parsed.requireMetrics, [
      { key: "network_attempts", operator: ">=", value: 1 },
    ]);

    const result = await runLifecycleSmoke({
      boardUrl: "http://board:8080",
      appId: "btc",
      polls: 1,
      intervalMs: 0,
      metricsPolls: 2,
      metricsIntervalMs: 0,
      requireMetrics: parsed.requireMetrics,
      requestImpl: async (url) => {
        if (url === "http://board:8080/launch?app=btc") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"btc"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"btc","last_status":"ESP_OK"}' };
        }
        if (url === "http://board:8080/apps/file?app=btc&path=metrics.json") {
          return { ok: true, status: 200, text: metrics.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.metrics.network_attempts, 2);
    assert.equal(result.metricsPolls, 2);
  });

  it("matches numeric expected metrics against numeric strings from app JSON", async () => {
    const result = await runLifecycleSmoke({
      boardUrl: "http://board:8080",
      appId: "btc",
      polls: 1,
      intervalMs: 0,
      metricsPolls: 1,
      metricsIntervalMs: 0,
      requireMetrics: [
        { key: "last_price", operator: "=", value: 65432.1 },
      ],
      requestImpl: async (url) => {
        if (url === "http://board:8080/launch?app=btc") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"btc"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"btc","last_status":"ESP_OK"}' };
        }
        if (url === "http://board:8080/apps/file?app=btc&path=metrics.json") {
          return { ok: true, status: 200, text: '{"last_price":"65432.1"}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.metrics.last_price, "65432.1");
  });

  it("fails when required app metrics are not reached", async () => {
    await assert.rejects(
      runLifecycleSmoke({
        boardUrl: "http://board:8080",
        appId: "weather",
        polls: 1,
        intervalMs: 0,
        metricsPolls: 1,
        metricsIntervalMs: 0,
        requireMetrics: [{ key: "assets_ready", value: true }],
        requestImpl: async (url) => {
          if (url.includes("/launch")) {
            return { ok: true, status: 200, text: '{"ok":true,"launched":"weather"}' };
          }
          if (url.includes("/status")) {
            return { ok: true, status: 200, text: '{"state":"running","current_app":"weather","last_status":"ESP_OK"}' };
          }
          if (url.includes("/apps/file")) {
            return { ok: true, status: 200, text: '{"assets_ready":false}' };
          }
          throw new Error(`unexpected ${url}`);
        },
      }),
      /expected weather metrics assets_ready=true/,
    );
  });

  it("accepts an idle board after the stop request connection resets", async () => {
    const calls = [];
    const statuses = [
      '{"state":"running","current_app":"weather","last_status":"ESP_OK"}',
      '{"state":"idle","current_app":"","last_status":"ESP_OK"}',
    ];
    const result = await runLifecycleSmoke({
      boardUrl: "http://board:8080",
      appId: "weather",
      polls: 1,
      intervalMs: 0,
      stop: true,
      stopPolls: 1,
      stopIntervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=weather") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"weather"}' };
        }
        if (url === "http://board:8080/stop") {
          throw new Error("read ECONNRESET");
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: statuses.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.stop.stopRequestOk, false);
    assert.match(result.stop.stopRequestError, /ECONNRESET/);
    assert.equal(result.stop.status.state, "idle");
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=weather", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/stop", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
    ]);
  });

  it("continues when launch response resets after the app becomes active", async () => {
    const calls = [];
    const statuses = [
      '{"state":"running","current_app":"nixie_clock","last_status":"ESP_OK"}',
      '{"state":"idle","current_app":"","last_status":"ESP_OK"}',
    ];
    const result = await runLifecycleSmoke({
      boardUrl: "http://board:8080",
      appId: "nixie_clock",
      polls: 1,
      intervalMs: 0,
      stop: true,
      stopPolls: 1,
      stopIntervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=nixie_clock") {
          throw new Error("read ECONNRESET");
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: statuses.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.launched, "nixie_clock");
    assert.equal(result.launchRequestOk, false);
    assert.match(result.launchRequestError, /ECONNRESET/);
    assert.equal(result.status.state, "running");
    assert.equal(result.stop.status.state, "idle");
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=nixie_clock", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/stop", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
    ]);
  });

  it("keeps polling status after a transient connection reset", async () => {
    const calls = [];
    const result = await runLifecycleSmoke({
      boardUrl: "http://board:8080",
      appId: "clock",
      polls: 2,
      intervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=clock") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"clock"}' };
        }
        if (url === "http://board:8080/status" && calls.filter((call) => call.url === url).length === 1) {
          throw new Error("read ECONNRESET");
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"clock","last_status":"ESP_OK"}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.status.state, "running");
    assert.equal(result.polls, 2);
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=clock", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/status", method: "GET" },
    ]);
  });

  it("fails with the last observed status when expectations are not reached", async () => {
    await assert.rejects(
      runLifecycleSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_gamepad",
        expectState: "running",
        expectCurrentApp: "smoke_gamepad",
        polls: 1,
        intervalMs: 0,
        requestImpl: async (url) => {
          if (url.includes("/status")) {
            return { ok: true, status: 200, text: '{"state":"failed","current_app":"","last_status":"ESP_FAIL"}' };
          }
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_gamepad"}' };
        },
      }),
      /expected state running and current_app smoke_gamepad/,
    );
  });
});
