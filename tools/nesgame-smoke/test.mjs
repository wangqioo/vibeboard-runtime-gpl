import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseNesgameSmokeArgs, runNesgameSmoke } from "./index.mjs";

describe("parseNesgameSmokeArgs", () => {
  it("parses board URL, app id, ROM path, key event, and polling options", () => {
    assert.deepEqual(
      parseNesgameSmokeArgs([
        "--board",
        "http://board:8080",
        "--app",
        "nesgame",
        "--rom-path",
        "roms/smoke.nes",
        "--start-key",
        "UP:LONG_START",
        "--polls",
        "3",
        "--selector-polls",
        "4",
        "--metrics-polls",
        "5",
        "--require-frame-growth",
        "30",
        "--inject-gamepad",
        "--inject-running-buttons",
        "1",
        "--inject-running-dpad-right",
        "--interval-ms",
        "10",
      ]),
      {
        boardUrl: "http://board:8080",
        appId: "nesgame",
        romPath: "roms/smoke.nes",
        startKey: "UP",
        startEvent: "LONG_START",
        polls: 3,
        selectorPolls: 4,
        metricsPolls: 5,
        intervalMs: 10,
        requireFrameGrowth: 30,
        injectGamepad: true,
        injectSelectorButtons: 1,
        injectRunningButtons: 1,
        injectRunningDpadRight: true,
      },
    );
  });
});

describe("runNesgameSmoke", () => {
  it("uploads a smoke ROM, launches nesgame, verifies selector metrics, injects start, and verifies frame growth", async () => {
    const calls = [];
    const statuses = ['{"state":"running","running":true,"current_app":"nesgame","last_status":"ESP_OK"}'];
    const metrics = [
      '{"ok":true,"screen_mode":"select","rom_present":true,"rom_count":1,"selected_index":1,"rom_path":"/sdcard/apps/nesgame/roms/smoke.nes","started":false,"running":false,"frames":0,"rendered_frames":0}',
      '{"ok":true,"screen_mode":"running","rom_present":true,"rom_count":1,"selected_index":1,"rom_path":"/sdcard/apps/nesgame/roms/smoke.nes","started":true,"running":true,"frames":10,"rendered_frames":10,"audio_backend":"none","audio_bytes":0}',
      '{"ok":true,"screen_mode":"running","rom_present":true,"rom_count":1,"selected_index":1,"rom_path":"/sdcard/apps/nesgame/roms/smoke.nes","started":true,"running":true,"frames":45,"rendered_frames":45,"audio_backend":"none","audio_bytes":0}',
    ];

    const result = await runNesgameSmoke({
      boardUrl: "http://board:8080",
      appId: "nesgame",
      romPath: "roms/smoke.nes",
      startKey: "UP",
      startEvent: "LONG_START",
      polls: 1,
      selectorPolls: 1,
      metricsPolls: 2,
      intervalMs: 0,
      requireFrameGrowth: 30,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, bodyLength: body.length, method: options.method, timeoutMs: options.timeoutMs });
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
        }
        if (url === "http://board:8080/install?app=nesgame&path=roms/smoke.nes") {
          return { ok: true, status: 200, text: "ok\n" };
        }
        if (url === "http://board:8080/launch?app=nesgame") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"nesgame"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: statuses.shift() };
        }
        if (url === "http://board:8080/apps/file?app=nesgame&path=metrics.json") {
          return { ok: true, status: 200, text: metrics.shift() };
        }
        if (url === "http://board:8080/input/key?code=UP&event=LONG_START") {
          return { ok: true, status: 200, text: '{"ok":true,"injected":{"code":"UP","event":"LONG_START"}}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.status.current_app, "nesgame");
    assert.equal(result.selectorMetrics.screen_mode, "select");
    assert.equal(result.runningMetrics.screen_mode, "running");
    assert.equal(result.frameGrowth, 35);
    assert.equal(result.firstFrames, 10);
    assert.equal(result.lastFrames, 45);
    assert.deepEqual(calls, [
      { url: "http://board:8080/stop", bodyLength: 0, method: "POST", timeoutMs: undefined },
      { url: "http://board:8080/install?app=nesgame&path=roms/smoke.nes", bodyLength: 24592, method: "POST", timeoutMs: 30000 },
      { url: "http://board:8080/launch?app=nesgame", bodyLength: 0, method: "POST", timeoutMs: undefined },
      { url: "http://board:8080/status", bodyLength: 0, method: "GET", timeoutMs: undefined },
      { url: "http://board:8080/apps/file?app=nesgame&path=metrics.json", bodyLength: 0, method: "GET", timeoutMs: undefined },
      { url: "http://board:8080/input/key?code=UP&event=LONG_START", bodyLength: 0, method: "POST", timeoutMs: undefined },
      { url: "http://board:8080/apps/file?app=nesgame&path=metrics.json", bodyLength: 0, method: "GET", timeoutMs: undefined },
      { url: "http://board:8080/apps/file?app=nesgame&path=metrics.json", bodyLength: 0, method: "GET", timeoutMs: undefined },
    ]);
  });

  it("can start nesgame and verify running NES input through HTTP gamepad injection", async () => {
    const calls = [];
    const statuses = ['{"state":"running","running":true,"current_app":"nesgame","last_status":"ESP_OK"}'];
    const metrics = [
      '{"ok":true,"screen_mode":"select","rom_present":true,"rom_count":1,"selected_index":1,"rom_path":"/sdcard/apps/nesgame/roms/smoke.nes","started":false,"running":false,"frames":0,"rendered_frames":0}',
      '{"ok":true,"screen_mode":"running","rom_present":true,"rom_count":1,"selected_index":1,"rom_path":"/sdcard/apps/nesgame/roms/smoke.nes","started":true,"running":true,"frames":10,"rendered_frames":10,"audio_backend":"none","audio_bytes":0,"last_gamepad_buttons":1,"last_gamepad_mask":129}',
      '{"ok":true,"screen_mode":"running","rom_present":true,"rom_count":1,"selected_index":1,"rom_path":"/sdcard/apps/nesgame/roms/smoke.nes","started":true,"running":true,"frames":45,"rendered_frames":45,"audio_backend":"none","audio_bytes":0,"last_gamepad_buttons":1,"last_gamepad_mask":129}',
    ];

    const result = await runNesgameSmoke({
      boardUrl: "http://board:8080",
      appId: "nesgame",
      romPath: "roms/smoke.nes",
      polls: 1,
      selectorPolls: 1,
      metricsPolls: 2,
      intervalMs: 0,
      requireFrameGrowth: 30,
      injectGamepad: true,
      injectSelectorButtons: 1,
      injectRunningButtons: 1,
      injectRunningDpadRight: true,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, bodyLength: body.length, method: options.method, timeoutMs: options.timeoutMs });
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
        }
        if (url === "http://board:8080/install?app=nesgame&path=roms/smoke.nes") {
          return { ok: true, status: 200, text: "ok\n" };
        }
        if (url === "http://board:8080/launch?app=nesgame") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"nesgame"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: statuses.shift() };
        }
        if (url === "http://board:8080/apps/file?app=nesgame&path=metrics.json") {
          return { ok: true, status: 200, text: metrics.shift() };
        }
        if (url === "http://board:8080/input/gamepad?started=1&connected=1&connecting=0&buttons=1&lx=0&ly=0&address=nesgame-smoke") {
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        if (url === "http://board:8080/input/gamepad?started=1&connected=1&connecting=0&buttons=1&lx=0&ly=0&dpad_right=1&address=nesgame-smoke") {
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.runningMetrics.last_gamepad_buttons, 1);
    assert.equal(result.runningMetrics.last_gamepad_mask, 129);
    assert.deepEqual(calls, [
      { url: "http://board:8080/stop", bodyLength: 0, method: "POST", timeoutMs: undefined },
      { url: "http://board:8080/install?app=nesgame&path=roms/smoke.nes", bodyLength: 24592, method: "POST", timeoutMs: 30000 },
      { url: "http://board:8080/launch?app=nesgame", bodyLength: 0, method: "POST", timeoutMs: undefined },
      { url: "http://board:8080/status", bodyLength: 0, method: "GET", timeoutMs: undefined },
      { url: "http://board:8080/apps/file?app=nesgame&path=metrics.json", bodyLength: 0, method: "GET", timeoutMs: undefined },
      {
        url: "http://board:8080/input/gamepad?started=1&connected=1&connecting=0&buttons=1&lx=0&ly=0&address=nesgame-smoke",
        bodyLength: 0,
        method: "POST",
        timeoutMs: undefined,
      },
      {
        url: "http://board:8080/input/gamepad?started=1&connected=1&connecting=0&buttons=1&lx=0&ly=0&dpad_right=1&address=nesgame-smoke",
        bodyLength: 0,
        method: "POST",
        timeoutMs: undefined,
      },
      { url: "http://board:8080/apps/file?app=nesgame&path=metrics.json", bodyLength: 0, method: "GET", timeoutMs: undefined },
      { url: "http://board:8080/apps/file?app=nesgame&path=metrics.json", bodyLength: 0, method: "GET", timeoutMs: undefined },
    ]);
  });

  it("fails when selector metrics do not show an app-local ROM", async () => {
    await assert.rejects(
      runNesgameSmoke({
        boardUrl: "http://board:8080",
        appId: "nesgame",
        polls: 1,
        selectorPolls: 1,
        intervalMs: 0,
        requestImpl: async (url) => {
          if (url.includes("/status")) {
            return { ok: true, status: 200, text: '{"state":"running","current_app":"nesgame"}' };
          }
          if (url.includes("/apps/file")) {
            return { ok: true, status: 200, text: '{"ok":true,"screen_mode":"select","rom_present":false,"rom_count":0}' };
          }
          return { ok: true, status: 200, text: '{"ok":true}' };
        },
      }),
      /expected nesgame selector metrics with ROM present/,
    );
  });
});
