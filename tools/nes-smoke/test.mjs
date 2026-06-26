import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseNesSmokeArgs, runNesSmoke } from "./index.mjs";

describe("parseNesSmokeArgs", () => {
  it("parses board URL, app id, expected state, and polling options", () => {
    assert.deepEqual(
      parseNesSmokeArgs([
        "--board",
        "http://192.168.1.32:8080",
        "--app",
        "smoke_nes",
        "--expect-state",
        "running",
        "--expect-current-app",
        "smoke_nes",
        "--polls",
        "3",
        "--metrics-polls",
        "5",
        "--require-rom",
        "--require-audio-bytes",
        "16",
        "--require-audio-backend",
        "host",
        "--require-frame-growth",
        "30",
        "--inject-gamepad",
        "--inject-buttons",
        "1",
        "--inject-dpad-right",
        "--inject-address",
        "nes-host-smoke",
        "--require-host-gamepad-mask",
        "--interval-ms",
        "10",
      ]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appId: "smoke_nes",
        expectState: "running",
        expectCurrentApp: "smoke_nes",
        polls: 3,
        metricsPolls: 5,
        intervalMs: 10,
        requireRom: true,
        requireAudioBytes: 16,
        requireAudioBackend: "host",
        requireFrameGrowth: 30,
        injectGamepad: true,
        injectButtons: 1,
        injectDpadRight: true,
        injectAddress: "nes-host-smoke",
        requireHostGamepadMask: true,
      },
    );
  });
});

describe("runNesSmoke", () => {
  it("launches smoke_nes and returns the first matching status", async () => {
    const calls = [];
    const statuses = [
      '{"state":"starting","running":true,"current_app":"smoke_nes","last_status":"ESP_OK"}',
      '{"state":"running","running":true,"current_app":"smoke_nes","last_status":"ESP_OK"}',
    ];
    const result = await runNesSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_nes",
      expectState: "running",
      expectCurrentApp: "smoke_nes",
      polls: 2,
      intervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_nes") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_nes"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: statuses.shift() };
        }
        if (url === "http://board:8080/app/metrics") {
          return { ok: false, status: 404, text: '{"error":"not found"}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_nes&path=metrics.json") {
          return {
            ok: true,
            status: 200,
            text: '{"ok":true,"rom_present":false,"started":false,"running":false,"frames":0,"audio_bytes":0,"last_error":"open rom failed"}',
          };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.launched, "smoke_nes");
    assert.equal(result.status.state, "running");
    assert.equal(result.status.current_app, "smoke_nes");
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_nes", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/apps/file?app=smoke_nes&path=metrics.json", method: "GET" },
    ]);
  });

  it("reads smoke_nes metrics and verifies ROM-backed execution when required", async () => {
    const calls = [];
    const statuses = ['{"state":"running","running":true,"current_app":"smoke_nes","last_status":"ESP_OK"}'];
    const metrics = [
      '{"ok":true,"rom_present":true,"started":true,"running":true,"frames":2,"rendered_frames":2,"audio_bytes":128,"last_error":""}',
    ];
    const result = await runNesSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_nes",
      expectState: "running",
      expectCurrentApp: "smoke_nes",
      polls: 1,
      metricsPolls: 1,
      intervalMs: 0,
      requireRom: true,
      requireAudioBytes: 64,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_nes") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_nes"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: statuses.shift() };
        }
        if (url === "http://board:8080/apps/file?app=smoke_nes&path=metrics.json") {
          return { ok: true, status: 200, text: metrics.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.metrics.started, true);
    assert.equal(result.metrics.audio_bytes, 128);
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_nes", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/apps/file?app=smoke_nes&path=metrics.json", method: "GET" },
    ]);
  });

  it("returns null when metrics.json is unavailable", async () => {
    const calls = [];
    await assert.rejects(
      runNesSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_nes",
      expectState: "running",
      expectCurrentApp: "smoke_nes",
      polls: 1,
      metricsPolls: 1,
      intervalMs: 0,
      requireRom: true,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_nes") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_nes"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","running":true,"current_app":"smoke_nes"}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_nes&path=metrics.json") {
          return { ok: false, status: 404, text: '{"error":"not found"}' };
        }
        throw new Error(`unexpected ${url}`);
      },
      }),
      /expected smoke_nes ROM-backed metrics; last metrics null/,
    );
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_nes", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/apps/file?app=smoke_nes&path=metrics.json", method: "GET" },
    ]);
  });

  it("fails ROM-required smoke when metrics show only loader/no-ROM path", async () => {
    await assert.rejects(
      runNesSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_nes",
        expectState: "running",
        expectCurrentApp: "smoke_nes",
        polls: 1,
        metricsPolls: 1,
        intervalMs: 0,
        requireRom: true,
        requestImpl: async (url) => {
          if (url.includes("/status")) {
            return { ok: true, status: 200, text: '{"state":"running","current_app":"smoke_nes"}' };
          }
          if (url.includes("/apps/file")) {
            return {
              ok: true,
              status: 200,
              text: '{"ok":true,"rom_present":false,"started":false,"running":false,"frames":0,"audio_bytes":0,"last_error":"open rom failed"}',
            };
          }
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_nes"}' };
        },
      }),
      /expected smoke_nes ROM-backed metrics/,
    );
  });

  it("requires a specific audio backend when requested", async () => {
    await assert.rejects(
      runNesSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_nes",
        expectState: "running",
        expectCurrentApp: "smoke_nes",
        polls: 1,
        metricsPolls: 1,
        intervalMs: 0,
        requireRom: true,
        requireAudioBackend: "host",
        requestImpl: async (url) => {
          if (url.includes("/status")) {
            return { ok: true, status: 200, text: '{"state":"running","running":true,"current_app":"smoke_nes"}' };
          }
          if (url.includes("/apps/file")) {
            return {
              ok: true,
              status: 200,
              text: '{"ok":true,"rom_present":true,"started":true,"running":true,"frames":12,"rendered_frames":12,"audio_active":true,"audio_backend":"lua","audio_bytes":1024,"last_error":""}',
            };
          }
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_nes"}' };
        },
      }),
      /expected smoke_nes audio_backend host/,
    );
  });

  it("reports missing audio bytes separately from backend mismatches", async () => {
    await assert.rejects(
      runNesSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_nes",
        expectState: "running",
        expectCurrentApp: "smoke_nes",
        polls: 1,
        metricsPolls: 1,
        intervalMs: 0,
        requireRom: true,
        requireAudioBytes: 128,
        requireAudioBackend: "host",
        requestImpl: async (url) => {
          if (url.includes("/status")) {
            return { ok: true, status: 200, text: '{"state":"running","running":true,"current_app":"smoke_nes"}' };
          }
          if (url.includes("/apps/file")) {
            return {
              ok: true,
              status: 200,
              text: '{"ok":true,"rom_present":true,"started":true,"running":true,"frames":12,"rendered_frames":12,"audio_active":true,"audio_backend":"host","audio_bytes":0,"last_error":""}',
            };
          }
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_nes"}' };
        },
      }),
      /expected smoke_nes audio_bytes >= 128/,
    );
  });

  it("injects gamepad state and requires native host gamepad metrics", async () => {
    const calls = [];
    const metrics = [
      '{"ok":true,"rom_present":true,"started":true,"running":true,"frames":10,"rendered_frames":10,"audio_backend":"host","audio_bytes":0,"host_gamepad_active":true,"host_gamepad_mask":129,"last_error":""}',
    ];
    const result = await runNesSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_nes",
      expectState: "running",
      expectCurrentApp: "smoke_nes",
      polls: 1,
      metricsPolls: 1,
      intervalMs: 0,
      requireRom: true,
      injectGamepad: true,
      injectButtons: 1,
      injectDpadRight: true,
      injectAddress: "nes-host-smoke",
      requireHostGamepadMask: true,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://board:8080/launch?app=smoke_nes") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_nes"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","running":true,"current_app":"smoke_nes"}' };
        }
        if (
          url ===
          "http://board:8080/input/gamepad?started=1&connected=1&connecting=0&buttons=1&lx=0&ly=0&dpad_right=1&address=nes-host-smoke"
        ) {
          return { ok: true, status: 200, text: '{"ok":true,"injected":true}' };
        }
        if (url === "http://board:8080/apps/file?app=smoke_nes&path=metrics.json") {
          return { ok: true, status: 200, text: metrics.shift() };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.metrics.host_gamepad_active, true);
    assert.equal(result.metrics.host_gamepad_mask, 129);
    assert.deepEqual(calls, [
      { url: "http://board:8080/launch?app=smoke_nes", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      {
        url: "http://board:8080/input/gamepad?started=1&connected=1&connecting=0&buttons=1&lx=0&ly=0&dpad_right=1&address=nes-host-smoke",
        method: "POST",
      },
      { url: "http://board:8080/apps/file?app=smoke_nes&path=metrics.json", method: "GET" },
    ]);
  });

  it("fails when native host gamepad metrics are required but missing", async () => {
    await assert.rejects(
      runNesSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_nes",
        expectState: "running",
        expectCurrentApp: "smoke_nes",
        polls: 1,
        metricsPolls: 1,
        intervalMs: 0,
        requireRom: true,
        requireHostGamepadMask: true,
        requestImpl: async (url) => {
          if (url.includes("/status")) {
            return { ok: true, status: 200, text: '{"state":"running","running":true,"current_app":"smoke_nes"}' };
          }
          if (url.includes("/apps/file")) {
            return {
              ok: true,
              status: 200,
              text: '{"ok":true,"rom_present":true,"started":true,"running":true,"frames":12,"rendered_frames":12,"host_gamepad_active":false,"host_gamepad_mask":0,"last_error":""}',
            };
          }
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_nes"}' };
        },
      }),
      /expected smoke_nes native host gamepad mask/,
    );
  });

  it("requires rendered frames to keep increasing across metrics polls", async () => {
    const metrics = [
      '{"ok":true,"rom_present":true,"started":true,"running":true,"frames":10,"rendered_frames":10,"audio_bytes":0,"last_error":""}',
      '{"ok":true,"rom_present":true,"started":true,"running":true,"frames":18,"rendered_frames":18,"audio_bytes":0,"last_error":""}',
      '{"ok":true,"rom_present":true,"started":true,"running":true,"frames":43,"rendered_frames":43,"audio_bytes":0,"last_error":""}',
    ];
    const result = await runNesSmoke({
      boardUrl: "http://board:8080",
      appId: "smoke_nes",
      expectState: "running",
      expectCurrentApp: "smoke_nes",
      polls: 1,
      metricsPolls: 3,
      intervalMs: 0,
      requireRom: true,
      requireFrameGrowth: 30,
      requestImpl: async (url) => {
        if (url.includes("/status")) {
          return { ok: true, status: 200, text: '{"state":"running","running":true,"current_app":"smoke_nes"}' };
        }
        if (url.includes("/apps/file")) {
          return { ok: true, status: 200, text: metrics.shift() };
        }
        return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_nes"}' };
      },
    });

    assert.equal(result.metrics.rendered_frames, 43);
    assert.equal(result.metricsFrameGrowth, 33);
    assert.equal(result.metricsFirstFrames, 10);
    assert.equal(result.metricsLastFrames, 43);
    assert.equal(result.metricsSamples, 3);
  });

  it("fails frame-growth smoke when rendered frames stall", async () => {
    const metrics = [
      '{"ok":true,"rom_present":true,"started":true,"running":true,"frames":20,"rendered_frames":20,"audio_bytes":0,"last_error":""}',
      '{"ok":true,"rom_present":true,"started":true,"running":true,"frames":21,"rendered_frames":21,"audio_bytes":0,"last_error":""}',
    ];
    await assert.rejects(
      runNesSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_nes",
        expectState: "running",
        expectCurrentApp: "smoke_nes",
        polls: 1,
        metricsPolls: 2,
        intervalMs: 0,
        requireRom: true,
        requireFrameGrowth: 5,
        requestImpl: async (url) => {
          if (url.includes("/status")) {
            return { ok: true, status: 200, text: '{"state":"running","running":true,"current_app":"smoke_nes"}' };
          }
          if (url.includes("/apps/file")) {
            return { ok: true, status: 200, text: metrics.shift() };
          }
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_nes"}' };
        },
      }),
      /expected smoke_nes rendered frame growth >= 5; observed 1/,
    );
  });

  it("fails with the last observed status when the expected state is not reached", async () => {
    await assert.rejects(
      runNesSmoke({
        boardUrl: "http://board:8080",
        appId: "smoke_nes",
        expectState: "running",
        expectCurrentApp: "smoke_nes",
        polls: 1,
        intervalMs: 0,
        requestImpl: async (url) => {
          if (url.includes("/status")) {
            return { ok: true, status: 200, text: '{"state":"failed","current_app":"","last_status":"ESP_FAIL"}' };
          }
          return { ok: true, status: 200, text: '{"ok":true,"launched":"smoke_nes"}' };
        },
      }),
      /expected state running and current_app smoke_nes/,
    );
  });
});
