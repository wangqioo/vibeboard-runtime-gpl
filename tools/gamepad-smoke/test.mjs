import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGamepadSmokeArgs, runGamepadSmoke } from "./index.mjs";

describe("parseGamepadSmokeArgs", () => {
  it("parses board URL and polling options", () => {
    assert.deepEqual(
      parseGamepadSmokeArgs([
        "--board",
        "http://192.168.1.32:8080",
        "--polls",
        "4",
        "--metrics-polls",
        "3",
        "--metrics-delay-ms",
        "100",
        "--require-updates",
        "2",
        "--require-connected",
        "--require-xbox",
        "--require-disconnects",
        "1",
        "--require-connect-failed",
        "1",
        "--inject-gamepad",
        "--inject-disconnect",
        "--inject-address",
        "xbox-smoke",
        "--inject-buttons",
        "256",
        "--inject-lx",
        "0.25",
        "--inject-ly",
        "-0.5",
        "--inject-dpad-up",
        "--interval-ms",
        "25",
      ]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appId: "smoke_gamepad",
        expectState: "running",
        expectCurrentApp: "smoke_gamepad",
        polls: 4,
        metricsPolls: 3,
        metricsDelayMs: 100,
        requireUpdates: 2,
        requireConnected: true,
        requireXbox: true,
        requireDisconnects: 1,
        requireConnectFailed: 1,
        injectGamepad: true,
        injectDisconnect: true,
        injectAddress: "xbox-smoke",
        injectButtons: 256,
        injectLx: 0.25,
        injectLy: -0.5,
        injectDpadUp: true,
        intervalMs: 25,
      },
    );
  });
});

describe("runGamepadSmoke", () => {
  it("launches smoke_gamepad and waits for running status", async () => {
    const calls = [];
    const result = await runGamepadSmoke({
      boardUrl: "http://board:8080",
      polls: 1,
      metricsPolls: 1,
      intervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_gamepad") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_gamepad"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"smoke_gamepad","last_status":"ESP_OK"}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_gamepad&path=metrics.json") {
          return { ok: false, status: 404, text: '{"error":"not found"}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.launched, "smoke_gamepad");
    assert.equal(result.status.current_app, "smoke_gamepad");
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_gamepad", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/apps/file?app=smoke_gamepad&path=metrics.json", method: "GET" },
    ]);
  });

  it("reads gamepad metrics and waits for required input state", async () => {
    const calls = [];
    const result = await runGamepadSmoke({
      boardUrl: "http://board:8080",
      polls: 1,
      metricsPolls: 3,
      intervalMs: 0,
      requireUpdates: 2,
      requireConnected: true,
      requireXbox: true,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_gamepad") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_gamepad"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"smoke_gamepad","last_status":"ESP_OK"}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_gamepad&path=metrics.json") {
          return {
            ok: true,
            status: 200,
            text: JSON.stringify({
              ok: true,
              started: true,
              connected: true,
              updates: 2,
              connects: 1,
              xbox: false,
              xbox_seen: true,
              buttons_mask: 256,
            }),
          };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.metrics.connected, true);
    assert.equal(result.metrics.updates, 2);
    assert.equal(result.metrics.xbox_seen, true);
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_gamepad", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/apps/file?app=smoke_gamepad&path=metrics.json", method: "GET" },
    ]);
  });

  it("injects a gamepad state through the runtime HTTP hook before polling metrics", async () => {
    const calls = [];
    const result = await runGamepadSmoke({
      boardUrl: "http://board:8080",
      polls: 1,
      metricsPolls: 1,
      intervalMs: 0,
      requireUpdates: 1,
      requireConnected: true,
      requireXbox: true,
      injectGamepad: true,
      injectAddress: "xbox-smoke",
      injectButtons: 256,
      injectLx: 0.25,
      injectLy: -0.5,
      injectDpadUp: true,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_gamepad") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_gamepad"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"smoke_gamepad","last_status":"ESP_OK"}' };
        }
        if (
          url ===
          "http://board:8080/input/gamepad?started=1&connected=1&connecting=0&buttons=256&lx=0.25&ly=-0.5&dpad_up=1&address=xbox-smoke"
        ) {
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_gamepad&path=metrics.json") {
          return {
            ok: true,
            status: 200,
            text: JSON.stringify({
              ok: true,
              connected: true,
              updates: 1,
              xbox_seen: true,
              buttons_mask: 256,
              address: "xbox-smoke",
            }),
          };
        }
        throw new Error(`unexpected ${options.method} ${url}`);
      },
    });

    assert.equal(result.metrics.connected, true);
    assert.equal(result.metrics.xbox_seen, true);
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_gamepad", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      {
        url: "http://board:8080/input/gamepad?started=1&connected=1&connecting=0&buttons=256&lx=0.25&ly=-0.5&dpad_up=1&address=xbox-smoke",
        method: "POST",
      },
      { url: "http://board:8080/apps/file?app=smoke_gamepad&path=metrics.json", method: "GET" },
    ]);
  });

  it("can inject connect then disconnect and require lifecycle event metrics", async () => {
    const calls = [];
    const result = await runGamepadSmoke({
      boardUrl: "http://board:8080",
      polls: 1,
      metricsPolls: 1,
      intervalMs: 0,
      requireUpdates: 2,
      requireConnected: false,
      requireDisconnects: 1,
      injectGamepad: true,
      injectDisconnect: true,
      injectAddress: "xbox-smoke",
      injectButtons: 256,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_gamepad") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_gamepad"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"smoke_gamepad","last_status":"ESP_OK"}' };
        }
        if (
          url ===
          "http://board:8080/input/gamepad?started=1&connected=1&connecting=0&buttons=256&lx=0&ly=0&address=xbox-smoke"
        ) {
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        if (
          url ===
          "http://board:8080/input/gamepad?started=1&connected=0&connecting=0&buttons=0&lx=0&ly=0&address=xbox-smoke"
        ) {
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_gamepad&path=metrics.json") {
          return {
            ok: true,
            status: 200,
            text: JSON.stringify({
              ok: true,
              connected: false,
              updates: 2,
              connects: 1,
              disconnects: 1,
              connect_failed: 0,
              xbox_seen: true,
            }),
          };
        }
        throw new Error(`unexpected ${options.method} ${url}`);
      },
    });

    assert.equal(result.metrics.connected, false);
    assert.equal(result.metrics.disconnects, 1);
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_gamepad", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      {
        url: "http://board:8080/input/gamepad?started=1&connected=1&connecting=0&buttons=256&lx=0&ly=0&address=xbox-smoke",
        method: "POST",
      },
      {
        url: "http://board:8080/input/gamepad?started=1&connected=0&connecting=0&buttons=0&lx=0&ly=0&address=xbox-smoke",
        method: "POST",
      },
      { url: "http://board:8080/apps/file?app=smoke_gamepad&path=metrics.json", method: "GET" },
    ]);
  });

  it("fails when required gamepad updates never appear", async () => {
    await assert.rejects(
      runGamepadSmoke({
        boardUrl: "http://board:8080",
        polls: 1,
        metricsPolls: 1,
        intervalMs: 0,
        requireUpdates: 1,
        requestImpl: async (url, body, options = {}) => {
          if (url === "http://board:8080/launch?app=smoke_gamepad") {
            return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_gamepad"}' };
          }
          if (url === "http://board:8080/status") {
            return { ok: true, status: 200, text: '{"state":"running","current_app":"smoke_gamepad","last_status":"ESP_OK"}' };
          }
          if (url === "http://board:8080/apps/file?app=smoke_gamepad&path=metrics.json") {
            return { ok: true, status: 200, text: '{"ok":true,"connected":false,"updates":0}' };
          }
          throw new Error(`unexpected ${options.method} ${url}`);
        },
      }),
      /expected gamepad metrics/,
    );
  });
});
