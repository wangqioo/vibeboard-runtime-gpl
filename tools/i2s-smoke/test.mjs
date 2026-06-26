import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseI2sSmokeArgs, runI2sSmoke } from "./index.mjs";

const runningStatus = '{"state":"running","current_app":"smoke_i2s"}';

describe("parseI2sSmokeArgs", () => {
  it("parses board URL, app id, polling, and audio gates", () => {
    assert.deepEqual(
      parseI2sSmokeArgs([
        "--board",
        "http://board:8080",
        "--app",
        "smoke_i2s",
        "--polls",
        "3",
        "--interval-ms",
        "0",
        "--require-reads",
        "--require-nonzero",
        "--require-write",
        "--require-tone-writes",
        "8",
      ]),
      {
        boardUrl: "http://board:8080",
        appId: "smoke_i2s",
        polls: 3,
        intervalMs: 0,
        requireReads: true,
        requireNonzero: true,
        requireWrite: true,
        requireToneWrites: 8,
      },
    );
  });
});

describe("runI2sSmoke", () => {
  it("launches smoke_i2s and returns the first readable metrics artifact", async () => {
    const calls = [];
    let launched = false;
    const result = await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 2,
      intervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
        }
        if (url === "http://board:8080/launch?app=smoke_i2s") {
          launched = true;
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: runningStatus };
        }
        if (!launched && url === "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json") {
          return { ok: false, status: 404, text: "not found" };
        }
        if (url === "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json") {
          return {
            ok: true,
            status: 200,
            text: '{"started":true,"rate":16000,"bits":16,"bytes":2048,"reads":1,"nonzero":7,"last_error":""}',
          };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.launched, "smoke_i2s");
    assert.equal(result.metrics.started, true);
    assert.equal(result.metrics.reads, 1);
    assert.equal(result.metrics.nonzero, 7);
    assert.equal(result.polls, 1);
  });

  it("stops any active app before launching the I2S smoke app", async () => {
    const calls = [];
    await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 1,
      intervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json") {
          return { ok: false, status: 404, text: "not found" };
        }
        if (url === "http://board:8080/launch?app=smoke_i2s") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: runningStatus };
        }
        throw new Error(`unexpected ${url}`);
      },
    }).catch(() => {});

    assert.deepEqual(calls.slice(0, 3), [
      { url: "http://board:8080/stop", method: "POST" },
      { url: "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json", method: "GET" },
      { url: "http://board:8080/launch?app=smoke_i2s", method: "POST" },
    ]);
  });

  it("continues when the pre-launch stop request resets but the board is idle", async () => {
    const calls = [];
    const result = await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 2,
      intervalMs: 0,
      requireWrite: true,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/stop") {
          throw new Error("socket hang up");
        }
        if (url === "http://board:8080/status") {
          const status = calls.filter((call) => call.url === "http://board:8080/status").length === 1
            ? '{"state":"idle","current_app":""}'
            : runningStatus;
          return { ok: true, status: 200, text: status };
        }
        if (url === "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json") {
          return { ok: false, status: 404, text: "not found" };
        }
        if (url === "http://board:8080/launch?app=smoke_i2s") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    }).catch((error) => error);

    assert.equal(result.message, "expected readable metrics.json for smoke_i2s; last metrics null");
    assert.deepEqual(calls.slice(0, 4), [
      { url: "http://board:8080/stop", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json", method: "GET" },
      { url: "http://board:8080/launch?app=smoke_i2s", method: "POST" },
    ]);
  });

  it("continues when launch response resets after the app was queued and becomes active", async () => {
    const calls = [];
    let launchAttempted = false;
    const result = await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 3,
      intervalMs: 0,
      requireWrite: true,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json" && !launchAttempted) {
          return { ok: false, status: 404, text: "not found" };
        }
        if (url === "http://board:8080/launch?app=smoke_i2s") {
          launchAttempted = true;
          throw new Error("socket hang up");
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: runningStatus };
        }
        if (url === "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json") {
          return { ok: true, status: 200, text: '{"started":true,"tx_started":true,"writes":2,"tx_bytes":1024,"tone_writes":2,"last_error":""}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.launched, "smoke_i2s");
    assert.equal(result.metrics.tx_bytes, 1024);
    assert.deepEqual(calls.map((call) => call.url), [
      "http://board:8080/stop",
      "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json",
      "http://board:8080/launch?app=smoke_i2s",
      "http://board:8080/status",
      "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json",
    ]);
  });

  it("waits for the launched app to become active before polling metrics", async () => {
    const calls = [];
    const statuses = [
      '{"state":"idle","current_app":""}',
      '{"state":"running","current_app":"smoke_i2s"}',
    ];
    const result = await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 2,
      intervalMs: 0,
      requireWrite: true,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: statuses.shift() };
        }
        if (url === "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json") {
          return { ok: true, status: 200, text: '{"started":true,"rx_started":true,"tx_started":true,"reads":1,"nonzero":1,"writes":1,"tx_bytes":512}' };
        }
        if (url === "http://board:8080/launch?app=smoke_i2s") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.metrics.tx_bytes, 512);
    assert.deepEqual(calls.map((call) => call.url), [
      "http://board:8080/stop",
      "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json",
      "http://board:8080/launch?app=smoke_i2s",
      "http://board:8080/status",
      "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json",
      "http://board:8080/status",
      "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json",
    ]);
  });

  it("accepts fresh satisfying metrics when status is still starting for the target app", async () => {
    const calls = [];
    const result = await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 2,
      intervalMs: 0,
      requireWrite: true,
      requireToneWrites: 8,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json" && calls.length <= 2) {
          return { ok: false, status: 404, text: "not found" };
        }
        if (url === "http://board:8080/launch?app=smoke_i2s") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"starting","current_app":"smoke_i2s"}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_i2s&path=metrics.json") {
          return { ok: true, status: 200, text: '{"started":true,"tx_started":true,"writes":11,"tx_bytes":2816,"tone_writes":11,"last_error":""}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.activeByMetrics, true);
    assert.equal(result.metrics.tone_writes, 11);
    assert.equal(result.polls, 0);
  });

  it("ignores a stale metrics artifact captured before launch", async () => {
    const stale = '{"started":false,"rate":16000,"bits":16,"bytes":81920,"reads":40,"nonzero":81920,"last_error":"stopped"}';
    const fresh = '{"started":true,"rate":16000,"bits":16,"bytes":2048,"reads":1,"nonzero":9,"last_error":""}';
    const metricsResponses = [stale, stale, fresh];
    const result = await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 2,
      intervalMs: 0,
      requireReads: true,
      requestImpl: async (url) => {
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url.includes("/launch")) {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: runningStatus };
        }
        if (url.includes("/apps/file")) {
          return { ok: true, status: 200, text: metricsResponses.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.metrics.reads, 1);
    assert.equal(result.polls, 2);
  });

  it("accepts a running metrics artifact even when an old stopped artifact had read counts", async () => {
    const stale = '{"started":false,"rate":16000,"bits":32,"bytes":81920,"reads":40,"nonzero":81920,"last_error":"stopped after smoke window"}';
    const fresh = '{"started":true,"rate":16000,"bits":32,"bytes":20480,"reads":10,"nonzero":20480,"last_error":""}';
    const metricsResponses = [stale, fresh];
    const result = await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 1,
      intervalMs: 0,
      requireReads: true,
      requireNonzero: true,
      requestImpl: async (url) => {
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url.includes("/launch")) {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: runningStatus };
        }
        if (url.includes("/apps/file")) {
          return { ok: true, status: 200, text: metricsResponses.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.metrics.started, true);
    assert.equal(result.metrics.reads, 10);
    assert.equal(result.metrics.nonzero, 20480);
  });

  it("accepts satisfying metrics after launch even when the text matches the pre-launch artifact", async () => {
    const satisfying = '{"started":true,"rx_started":true,"tx_started":true,"rate":16000,"bits":16,"bytes":24576,"reads":16,"nonzero":24576,"writes":45,"tx_bytes":23040,"last_error":""}';
    const result = await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 1,
      intervalMs: 0,
      requireReads: true,
      requireNonzero: true,
      requireWrite: true,
      requestImpl: async (url) => {
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url.includes("/launch")) {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: runningStatus };
        }
        if (url.includes("/apps/file")) {
          return { ok: true, status: 200, text: satisfying };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.metrics.tx_bytes, 23040);
  });

  it("can require read progress", async () => {
    let launched = false;
    await assert.rejects(
      runI2sSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_i2s",
        polls: 1,
        intervalMs: 0,
        requireReads: true,
        requestImpl: async (url) => {
          if (url.includes("/launch")) {
            launched = true;
            return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
          }
          if (url === "http://board:8080/status") {
            return { ok: true, status: 200, text: runningStatus };
          }
          if (!launched) {
            return { ok: false, status: 404, text: "not found" };
          }
          return {
            ok: true,
            status: 200,
            text: '{"started":false,"rate":16000,"bits":16,"bytes":0,"reads":0,"nonzero":0,"last_error":"missing i2s config"}',
          };
        },
      }),
      /expected reads > 0/,
    );
  });

  it("keeps polling until read progress satisfies the requested gate", async () => {
    let launched = false;
    const metrics = [
      '{"started":true,"rate":16000,"bits":16,"bytes":0,"reads":0,"nonzero":0,"last_error":""}',
      '{"started":true,"rate":16000,"bits":16,"bytes":2048,"reads":1,"nonzero":0,"last_error":""}',
    ];
    const result = await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 2,
      intervalMs: 0,
      requireReads: true,
      requestImpl: async (url) => {
        if (url.includes("/launch")) {
          launched = true;
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: runningStatus };
        }
        if (!launched) {
          return { ok: false, status: 404, text: "not found" };
        }
        return { ok: true, status: 200, text: metrics.shift() };
      },
    });

    assert.equal(result.metrics.reads, 1);
    assert.equal(result.polls, 2);
  });

  it("can require nonzero PCM bytes", async () => {
    let launched = false;
    await assert.rejects(
      runI2sSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_i2s",
        polls: 1,
        intervalMs: 0,
        requireNonzero: true,
        requestImpl: async (url) => {
          if (url.includes("/launch")) {
            launched = true;
            return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
          }
          if (url === "http://board:8080/status") {
            return { ok: true, status: 200, text: runningStatus };
          }
          if (!launched) {
            return { ok: false, status: 404, text: "not found" };
          }
          return {
            ok: true,
            status: 200,
            text: '{"started":true,"rate":16000,"bits":16,"bytes":2048,"reads":1,"nonzero":0,"last_error":""}',
          };
        },
      }),
      /expected nonzero > 0/,
    );
  });

  it("can require TX write progress", async () => {
    let launched = false;
    const metrics = [
      '{"started":true,"tx_started":true,"rate":16000,"bits":16,"bytes":2048,"reads":1,"nonzero":1,"writes":0,"tx_bytes":0,"last_error":""}',
      '{"started":true,"tx_started":true,"rate":16000,"bits":16,"bytes":2048,"reads":1,"nonzero":1,"writes":2,"tx_bytes":1024,"last_error":""}',
    ];
    const result = await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 2,
      intervalMs: 0,
      requireWrite: true,
      requestImpl: async (url) => {
        if (url.includes("/launch")) {
          launched = true;
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: runningStatus };
        }
        if (!launched) {
          return { ok: false, status: 404, text: "not found" };
        }
        return { ok: true, status: 200, text: metrics.shift() };
      },
    });

    assert.equal(result.metrics.writes, 2);
    assert.equal(result.metrics.tx_bytes, 1024);
    assert.equal(result.polls, 2);
  });

  it("fails when required TX write progress is missing", async () => {
    let launched = false;
    await assert.rejects(
      runI2sSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_i2s",
        polls: 1,
        intervalMs: 0,
        requireWrite: true,
        requestImpl: async (url) => {
          if (url.includes("/launch")) {
            launched = true;
            return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
          }
          if (url === "http://board:8080/status") {
            return { ok: true, status: 200, text: runningStatus };
          }
          if (!launched) {
            return { ok: false, status: 404, text: "not found" };
          }
          return {
            ok: true,
            status: 200,
            text: '{"started":true,"tx_started":true,"rate":16000,"bits":16,"bytes":2048,"reads":1,"nonzero":1,"writes":0,"tx_bytes":0,"last_error":""}',
          };
        },
      }),
      /expected tx_bytes > 0/,
    );
  });

  it("can require sustained tone write progress", async () => {
    let launched = false;
    const metrics = [
      '{"started":true,"tx_started":true,"tone_hz":440,"tone_writes":3,"tx_bytes":1536,"last_error":""}',
      '{"started":true,"tx_started":true,"tone_hz":440,"tone_writes":8,"tx_bytes":4096,"last_error":""}',
    ];
    const result = await runI2sSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_i2s",
      polls: 2,
      intervalMs: 0,
      requireToneWrites: 8,
      requestImpl: async (url) => {
        if (url.includes("/launch")) {
          launched = true;
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: runningStatus };
        }
        if (!launched) {
          return { ok: false, status: 404, text: "not found" };
        }
        return { ok: true, status: 200, text: metrics.shift() };
      },
    });

    assert.equal(result.metrics.tone_hz, 440);
    assert.equal(result.metrics.tone_writes, 8);
    assert.equal(result.polls, 2);
  });

  it("fails when sustained tone write progress is missing", async () => {
    let launched = false;
    await assert.rejects(
      runI2sSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_i2s",
        polls: 1,
        intervalMs: 0,
        requireToneWrites: 8,
        requestImpl: async (url) => {
          if (url.includes("/launch")) {
            launched = true;
            return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_i2s"}' };
          }
          if (url === "http://board:8080/status") {
            return { ok: true, status: 200, text: runningStatus };
          }
          if (!launched) {
            return { ok: false, status: 404, text: "not found" };
          }
          return {
            ok: true,
            status: 200,
            text: '{"started":true,"tx_started":true,"tone_hz":440,"tone_writes":3,"tx_bytes":1536,"last_error":""}',
          };
        },
      }),
      /expected tone_writes >= 8/,
    );
  });
});
