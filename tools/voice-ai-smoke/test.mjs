import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseVoiceAiSmokeArgs, runVoiceAiSmoke } from "./index.mjs";

describe("parseVoiceAiSmokeArgs", () => {
  it("parses board, bridge, timing, and polling options", () => {
    assert.deepEqual(
      parseVoiceAiSmokeArgs([
        "--board",
        "http://board:8080",
        "--bridge",
        "http://host:8790",
        "--record-ms",
        "1500",
        "--polls",
        "4",
        "--ready-polls",
        "8",
        "--interval-ms",
        "10",
        "--require-gif",
        "--require-bridge-provider",
        "command",
      ]),
      {
        boardUrl: "http://board:8080",
        bridgeUrl: "http://host:8790",
        appId: "voice_ai",
        recordMs: 1500,
        polls: 4,
        readyPolls: 8,
        intervalMs: 10,
        minAudioBytes: 1,
        requireGif: true,
        requireFont: false,
        requireUiCode: false,
        requireAiUi: false,
        requireBridgeProvider: "command",
      },
    );
  });
});

describe("runVoiceAiSmoke", () => {
  it("launches voice_ai, records with HOME, and verifies bridge stats increased", async () => {
    const calls = [];
    const bridgeStats = [
      { ok: true, chat_requests: 2, last_audio_bytes: 0, last_metadata: null, last_transcript: "", last_reply: "" },
      { ok: true, chat_requests: 2, last_audio_bytes: 0, last_metadata: null, last_transcript: "", last_reply: "" },
      {
        ok: true,
        chat_requests: 3,
        last_audio_bytes: 4096,
        last_metadata: { format: "pcm_s16le", sampleRate: 16000, bits: 16, channels: 1, replyLimit: 80 },
        last_transcript: "收到 4096 字节音频",
        last_reply: "我已收到录音",
      },
    ];
    const appMetrics = [
      { ok: true, status: 200, text: '{"mode":"idle","init_stage":"old","record_bytes":0}' },
      { ok: true, status: 200, text: '{"mode":"idle","init_stage":"ready","record_bytes":0,"rx_events":0,"submit_count":0,"last_audio_bytes":0,"last_http_code":0}' },
    ];

    const result = await runVoiceAiSmoke({
      boardUrl: "http://board:8080",
      bridgeUrl: "http://host:8790",
      recordMs: 0,
      polls: 3,
      intervalMs: 0,
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://host:8790/debug/stats") {
          return { ok: true, status: 200, text: JSON.stringify(bridgeStats.shift()) };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
        }
        if (url === "http://board:8080/launch?app=voice_ai") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"voice_ai"}' };
        }
        if (url === "http://board:8080/apps/file?app=voice_ai&path=metrics.json") {
          return appMetrics.shift() || { ok: true, status: 200, text: '{"mode":"recording"}' };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true,"injected":{"code":"HOME","event":"SHORT"}}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.audioBytes, 4096);
    assert.equal(result.chatRequestsBefore, 2);
    assert.equal(result.chatRequestsAfter, 3);
    assert.equal(result.status.current_app, "voice_ai");
    assert.deepEqual(calls, [
      { url: "http://host:8790/debug/stats", method: "GET" },
      { url: "http://board:8080/stop", method: "POST" },
      { url: "http://board:8080/apps/file?app=voice_ai&path=metrics.json", method: "GET" },
      { url: "http://board:8080/launch?app=voice_ai", method: "POST" },
      { url: "http://board:8080/status", method: "GET" },
      { url: "http://board:8080/apps/file?app=voice_ai&path=metrics.json", method: "GET" },
      { url: "http://board:8080/input/key?code=HOME&event=SHORT", method: "POST" },
      { url: "http://board:8080/input/key?code=HOME&event=SHORT", method: "POST" },
      { url: "http://host:8790/debug/stats", method: "GET" },
      { url: "http://host:8790/debug/stats", method: "GET" },
      { url: "http://board:8080/status", method: "GET" },
    ]);
  });

  it("can require voice_ai to expose an enabled visible GIF in metrics before recording", async () => {
    const bridgeStats = [
      { ok: true, chat_requests: 0, last_audio_bytes: 0, last_transcript: "", last_reply: "" },
      { ok: true, chat_requests: 1, last_audio_bytes: 4096, last_transcript: "收到 4096 字节音频", last_reply: "我已收到录音" },
    ];
    const appMetrics = [
      {
        ok: true,
        status: 200,
        text: '{"mode":"idle","init_stage":"old","use_gif":false,"gif_visible":false,"gif_state":"","gif_src":""}',
      },
      {
        ok: true,
        status: 200,
        text: '{"mode":"idle","init_stage":"ready","use_gif":true,"gif_visible":true,"gif_state":"idle","gif_src":"S:/apps/voice_ai/assets/buddy/idle_0.gif","record_bytes":0,"rx_events":0,"submit_count":0,"last_audio_bytes":0}',
      },
    ];

    const result = await runVoiceAiSmoke({
      boardUrl: "http://board:8080",
      bridgeUrl: "http://host:8790",
      recordMs: 0,
      polls: 1,
      intervalMs: 0,
      requireGif: true,
      requestImpl: async (url, body, options = {}) => {
        if (url === "http://host:8790/debug/stats") {
          return { ok: true, status: 200, text: JSON.stringify(bridgeStats.shift()) };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
        }
        if (url === "http://board:8080/launch?app=voice_ai") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"voice_ai"}' };
        }
        if (url === "http://board:8080/apps/file?app=voice_ai&path=metrics.json") {
          return appMetrics.shift() || { ok: true, status: 200, text: '{"mode":"recording"}' };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true,"injected":{"code":"HOME","event":"SHORT"}}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}' };
        }
        throw new Error(`unexpected ${options.method} ${url}`);
      },
    });

    assert.equal(result.readyMetrics.use_gif, true);
    assert.equal(result.readyMetrics.gif_visible, true);
    assert.equal(result.readyMetrics.gif_state, "idle");
    assert.match(result.readyMetrics.gif_src, /idle_0\.gif$/);
  });

  it("allows HOME injection when voice_ai is current and ready even if status is still starting", async () => {
    const bridgeStats = [
      { ok: true, provider: "command", chat_requests: 4, last_audio_bytes: 0, last_transcript: "", last_reply: "" },
      { ok: true, provider: "command", chat_requests: 5, last_audio_bytes: 5120, last_transcript: "", last_reply: "" },
    ];
    let homeInjections = 0;
    const result = await runVoiceAiSmoke({
      boardUrl: "http://board:8080",
      bridgeUrl: "http://host:8790",
      recordMs: 0,
      polls: 1,
      intervalMs: 0,
      requireGif: true,
      requireFont: true,
      requireBridgeProvider: "command",
      requestImpl: async (url) => {
        if (url === "http://host:8790/debug/stats") {
          return { ok: true, status: 200, text: JSON.stringify(bridgeStats.shift()) };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
        }
        if (url === "http://board:8080/launch?app=voice_ai") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"voice_ai"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"starting","current_app":"voice_ai","last_status":"ESP_OK"}' };
        }
        if (url === "http://board:8080/apps/file?app=voice_ai&path=metrics.json") {
          return {
            ok: true,
            status: 200,
            text: '{"mode":"idle","init_stage":"ready","use_gif":true,"gif_visible":true,"gif_state":"idle","gif_src":"/apps/voice_ai/assets/buddy/idle_0.gif","font_loaded":true,"font_handle":-13014,"font_src":"builtin:LV_FONT_COMMON_CN_13","font_error":""}',
          };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          homeInjections += 1;
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.activeStatus.state, "starting");
    assert.equal(result.audioBytes, 5120);
    assert.equal(homeInjections, 2);
  });

  it("can require voice_ai to expose a loaded custom font in metrics before recording", async () => {
    const bridgeStats = [
      { ok: true, chat_requests: 0, last_audio_bytes: 0, last_transcript: "", last_reply: "" },
      { ok: true, chat_requests: 1, last_audio_bytes: 4096, last_transcript: "收到 4096 字节音频", last_reply: "我已收到录音" },
    ];
    const appMetrics = [
      {
        ok: true,
        status: 200,
        text: '{"mode":"idle","init_stage":"old","font_loaded":false,"font_handle":0,"font_src":"","font_error":""}',
      },
      {
        ok: true,
        status: 200,
        text: '{"mode":"idle","init_stage":"ready","font_loaded":true,"font_handle":-13014,"font_src":"builtin:LV_FONT_COMMON_CN_13","font_error":"","record_bytes":0,"rx_events":0,"submit_count":0,"last_audio_bytes":0}',
      },
    ];

    const result = await runVoiceAiSmoke({
      boardUrl: "http://board:8080",
      bridgeUrl: "http://host:8790",
      recordMs: 0,
      polls: 1,
      intervalMs: 0,
      requireFont: true,
      requestImpl: async (url, body, options = {}) => {
        if (url === "http://host:8790/debug/stats") {
          return { ok: true, status: 200, text: JSON.stringify(bridgeStats.shift()) };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
        }
        if (url === "http://board:8080/launch?app=voice_ai") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"voice_ai"}' };
        }
        if (url === "http://board:8080/apps/file?app=voice_ai&path=metrics.json") {
          return appMetrics.shift() || { ok: true, status: 200, text: '{"mode":"recording"}' };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true,"injected":{"code":"HOME","event":"SHORT"}}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}' };
        }
        throw new Error(`unexpected ${options.method} ${url}`);
      },
    });

    assert.equal(result.readyMetrics.font_loaded, true);
    assert.equal(result.readyMetrics.font_handle, -13014);
    assert.equal(result.readyMetrics.font_src, "builtin:LV_FONT_COMMON_CN_13");
    assert.equal(result.readyMetrics.font_error, "");
  });

  it("can require a bridge ui_code and active AI snippet metrics", async () => {
    const bridgeStats = [
      { ok: true, provider: "command", chat_requests: 0, last_audio_bytes: 0, last_transcript: "", last_reply: "", last_ui_code: "" },
      {
        ok: true,
        provider: "command",
        chat_requests: 1,
        last_audio_bytes: 4096,
        last_transcript: "收到 4096 字节音频",
        last_reply: "测试回复",
        last_ui_code: "return function(ctx) return { screen = ctx.new_screen() } end",
      },
    ];
    const appMetrics = [
      { ok: true, status: 200, text: '{"mode":"idle","init_stage":"idle","ai_ui_active":false,"record_bytes":0,"rx_events":0,"submit_count":0,"last_audio_bytes":0}' },
      { ok: true, status: 200, text: '{"mode":"idle","init_stage":"ready","ai_ui_active":false,"record_bytes":0,"rx_events":0,"submit_count":0,"last_audio_bytes":0}' },
      { ok: true, status: 200, text: '{"mode":"reply","init_stage":"ready","ai_ui_active":true,"record_bytes":0,"rx_events":0,"submit_count":1,"last_audio_bytes":4096}' },
    ];

    const result = await runVoiceAiSmoke({
      boardUrl: "http://board:8080",
      bridgeUrl: "http://host:8790",
      recordMs: 0,
      polls: 2,
      readyPolls: 3,
      intervalMs: 0,
      requireUiCode: true,
      requireAiUi: true,
      requireBridgeProvider: "command",
      requestImpl: async (url, body, options = {}) => {
        if (url === "http://host:8790/debug/stats") {
          return { ok: true, status: 200, text: JSON.stringify(bridgeStats.shift()) };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
        }
        if (url === "http://board:8080/launch?app=voice_ai") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"voice_ai"}' };
        }
        if (url === "http://board:8080/apps/file?app=voice_ai&path=metrics.json") {
          return appMetrics.shift() || { ok: true, status: 200, text: '{"mode":"reply","init_stage":"ready","ai_ui_active":true}' };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true,"injected":{"code":"HOME","event":"SHORT"}}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.uiCode, "return function(ctx) return { screen = ctx.new_screen() } end");
    assert.equal(result.snippetMetrics.ai_ui_active, true);
    assert.equal(result.readyMetrics.ai_ui_active, false);
    assert.equal(result.reply, "测试回复");
  });

  it("can require the bridge to run through a specific provider", async () => {
    const bridgeStats = [
      { ok: true, provider: "command", chat_requests: 0, last_audio_bytes: 0, last_transcript: "", last_reply: "" },
      { ok: true, provider: "command", chat_requests: 1, last_audio_bytes: 4096, last_transcript: "收到 4096 字节音频", last_reply: "我已收到录音" },
    ];
    const metricsText = [
      '{"mode":"idle","init_stage":"old"}',
      '{"mode":"idle","init_stage":"ready"}',
    ];
    const result = await runVoiceAiSmoke({
      boardUrl: "http://board:8080",
      bridgeUrl: "http://host:8790",
      recordMs: 0,
      polls: 1,
      intervalMs: 0,
      requireBridgeProvider: "command",
      requestImpl: async (url) => {
        if (url === "http://host:8790/debug/stats") {
          return { ok: true, status: 200, text: JSON.stringify(bridgeStats.shift()) };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
        }
        if (url === "http://board:8080/launch?app=voice_ai") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"voice_ai"}' };
        }
        if (url === "http://board:8080/apps/file?app=voice_ai&path=metrics.json") {
          const text = metricsText.shift() || '{"mode":"idle","init_stage":"ready"}';
          return { ok: true, status: 200, text };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.bridgeProvider, "command");
  });

  it("ignores stale ready metrics captured before launch", async () => {
    const calls = [];
    const staleReady = '{"mode":"idle","init_stage":"ready","bridge_url":"http://old:8790"}';
    const freshReady = '{"mode":"idle","init_stage":"ready","bridge_url":"http://new:8790"}';
    const metricsResponses = [staleReady, staleReady, freshReady];
    const bridgeStats = [
      { ok: true, provider: "command", chat_requests: 0, last_audio_bytes: 0, last_transcript: "", last_reply: "" },
      { ok: true, provider: "command", chat_requests: 1, last_audio_bytes: 4096, last_transcript: "fresh", last_reply: "reply" },
    ];

    const result = await runVoiceAiSmoke({
      boardUrl: "http://board:8080",
      bridgeUrl: "http://host:8790",
      recordMs: 0,
      readyPolls: 3,
      polls: 1,
      intervalMs: 0,
      requireBridgeProvider: "command",
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://host:8790/debug/stats") {
          return { ok: true, status: 200, text: JSON.stringify(bridgeStats.shift()) };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url === "http://board:8080/launch?app=voice_ai") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"voice_ai"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}' };
        }
        if (url === "http://board:8080/apps/file?app=voice_ai&path=metrics.json") {
          return { ok: true, status: 200, text: metricsResponses.shift() };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.readyMetrics.bridge_url, "http://new:8790");
    assert.deepEqual(calls.map((call) => call.url), [
      "http://host:8790/debug/stats",
      "http://board:8080/stop",
      "http://board:8080/apps/file?app=voice_ai&path=metrics.json",
      "http://board:8080/launch?app=voice_ai",
      "http://board:8080/status",
      "http://board:8080/apps/file?app=voice_ai&path=metrics.json",
      "http://board:8080/apps/file?app=voice_ai&path=metrics.json",
      "http://board:8080/input/key?code=HOME&event=SHORT",
      "http://board:8080/input/key?code=HOME&event=SHORT",
      "http://host:8790/debug/stats",
      "http://board:8080/status",
    ]);
  });

  it("accepts ready metrics after launch even when unchanged from the pre-launch file", async () => {
    const sameReady = '{"mode":"idle","init_stage":"ready","bridge_url":"http://same:8790"}';
    const metricsResponses = [sameReady, sameReady, sameReady];
    const bridgeStats = [
      { ok: true, provider: "command", chat_requests: 0, last_audio_bytes: 0, last_transcript: "", last_reply: "" },
      { ok: true, provider: "command", chat_requests: 1, last_audio_bytes: 4096, last_transcript: "fresh", last_reply: "reply" },
    ];

    const result = await runVoiceAiSmoke({
      boardUrl: "http://board:8080",
      bridgeUrl: "http://host:8790",
      recordMs: 0,
      readyPolls: 2,
      polls: 1,
      intervalMs: 0,
      requireBridgeProvider: "command",
      requestImpl: async (url) => {
        if (url === "http://host:8790/debug/stats") {
          return { ok: true, status: 200, text: JSON.stringify(bridgeStats.shift()) };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url === "http://board:8080/apps/file?app=voice_ai&path=metrics.json") {
          return { ok: true, status: 200, text: metricsResponses.shift() };
        }
        if (url === "http://board:8080/launch?app=voice_ai") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"voice_ai"}' };
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}' };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.readyMetrics.bridge_url, "http://same:8790");
  });

  it("continues when pre-launch stop resets but the board is idle", async () => {
    const calls = [];
    const bridgeStats = [
      { ok: true, provider: "command", chat_requests: 0, last_audio_bytes: 0, last_transcript: "", last_reply: "" },
      { ok: true, provider: "command", chat_requests: 1, last_audio_bytes: 4096, last_transcript: "fresh", last_reply: "reply" },
    ];
    const metricsResponses = [
      null,
      '{"mode":"idle","init_stage":"ready","use_gif":true,"gif_visible":true,"gif_state":"idle","gif_src":"idle.gif"}',
    ];

    const result = await runVoiceAiSmoke({
      boardUrl: "http://board:8080",
      bridgeUrl: "http://host:8790",
      recordMs: 0,
      readyPolls: 2,
      polls: 1,
      intervalMs: 0,
      requireBridgeProvider: "command",
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://host:8790/debug/stats") {
          return { ok: true, status: 200, text: JSON.stringify(bridgeStats.shift()) };
        }
        if (url === "http://board:8080/stop") {
          throw new Error("socket hang up");
        }
        if (url === "http://board:8080/status") {
          const statusCalls = calls.filter((call) => call.url === "http://board:8080/status").length;
          const text = statusCalls === 1
            ? '{"state":"idle","current_app":""}'
            : '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}';
          return { ok: true, status: 200, text };
        }
        if (url === "http://board:8080/apps/file?app=voice_ai&path=metrics.json") {
          const text = metricsResponses.shift();
          if (text == null) return { ok: false, status: 404, text: "not found" };
          return { ok: true, status: 200, text };
        }
        if (url === "http://board:8080/launch?app=voice_ai") {
          return { ok: true, status: 200, text: '{"ok":true,"launched":"voice_ai"}' };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.bridgeProvider, "command");
    assert.deepEqual(calls.slice(0, 4).map((call) => call.url), [
      "http://host:8790/debug/stats",
      "http://board:8080/stop",
      "http://board:8080/status",
      "http://board:8080/apps/file?app=voice_ai&path=metrics.json",
    ]);
  });

  it("continues when launch response resets after voice_ai becomes active", async () => {
    const bridgeStats = [
      { ok: true, provider: "command", chat_requests: 0, last_audio_bytes: 0, last_transcript: "", last_reply: "" },
      { ok: true, provider: "command", chat_requests: 1, last_audio_bytes: 4096, last_transcript: "fresh", last_reply: "reply" },
    ];
    const metricsResponses = [
      null,
      '{"mode":"idle","init_stage":"ready","use_gif":true,"gif_visible":true,"gif_state":"idle","gif_src":"idle.gif"}',
    ];
    const result = await runVoiceAiSmoke({
      boardUrl: "http://board:8080",
      bridgeUrl: "http://host:8790",
      recordMs: 0,
      readyPolls: 2,
      polls: 1,
      intervalMs: 0,
      requireBridgeProvider: "command",
      requestImpl: async (url) => {
        if (url === "http://host:8790/debug/stats") {
          return { ok: true, status: 200, text: JSON.stringify(bridgeStats.shift()) };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url === "http://board:8080/apps/file?app=voice_ai&path=metrics.json") {
          const text = metricsResponses.shift();
          if (text == null) return { ok: false, status: 404, text: "not found" };
          return { ok: true, status: 200, text };
        }
        if (url === "http://board:8080/launch?app=voice_ai") {
          throw new Error("socket hang up");
        }
        if (url === "http://board:8080/status") {
          return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}' };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.bridgeProvider, "command");
  });

  it("retries launch when the first response resets and the board stays idle", async () => {
    const bridgeStats = [
      { ok: true, provider: "command", chat_requests: 0, last_audio_bytes: 0, last_transcript: "", last_reply: "" },
      { ok: true, provider: "command", chat_requests: 1, last_audio_bytes: 4096, last_transcript: "fresh", last_reply: "reply" },
    ];
    const calls = [];
    const metricsResponses = [
      null,
      null,
      '{"mode":"idle","init_stage":"ready","use_gif":true,"gif_visible":true,"gif_state":"idle","gif_src":"idle.gif"}',
    ];
    let launchCalls = 0;
    let statusCalls = 0;
    const result = await runVoiceAiSmoke({
      boardUrl: "http://board:8080",
      bridgeUrl: "http://host:8790",
      recordMs: 0,
      readyPolls: 2,
      polls: 1,
      intervalMs: 0,
      requireBridgeProvider: "command",
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method });
        if (url === "http://host:8790/debug/stats") {
          return { ok: true, status: 200, text: JSON.stringify(bridgeStats.shift()) };
        }
        if (url === "http://board:8080/stop") {
          return { ok: true, status: 200, text: '{"ok":true,"stopped":true}' };
        }
        if (url === "http://board:8080/apps/file?app=voice_ai&path=metrics.json") {
          const text = metricsResponses.shift();
          if (text == null) return { ok: false, status: 404, text: "not found" };
          return { ok: true, status: 200, text };
        }
        if (url === "http://board:8080/launch?app=voice_ai") {
          launchCalls += 1;
          if (launchCalls === 1) {
            throw new Error("socket hang up");
          }
          return { ok: true, status: 200, text: '{"ok":true,"launched":"voice_ai"}' };
        }
        if (url === "http://board:8080/status") {
          statusCalls += 1;
          if (statusCalls <= 3) {
            return { ok: true, status: 200, text: '{"state":"idle","current_app":""}' };
          }
          return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}' };
        }
        if (url === "http://board:8080/input/key?code=HOME&event=SHORT") {
          return { ok: true, status: 200, text: '{"ok":true}' };
        }
        throw new Error(`unexpected ${url}`);
      },
    });

    assert.equal(result.launchAttempts, 2);
    assert.equal(result.audioBytes, 4096);
    assert.equal(result.bridgeProvider, "command");
    assert.deepEqual(calls.map((call) => call.url), [
      "http://host:8790/debug/stats",
      "http://board:8080/stop",
      "http://board:8080/apps/file?app=voice_ai&path=metrics.json",
      "http://board:8080/launch?app=voice_ai",
      "http://board:8080/status",
      "http://board:8080/status",
      "http://board:8080/launch?app=voice_ai",
      "http://board:8080/status",
      "http://board:8080/status",
      "http://board:8080/apps/file?app=voice_ai&path=metrics.json",
      "http://board:8080/apps/file?app=voice_ai&path=metrics.json",
      "http://board:8080/input/key?code=HOME&event=SHORT",
      "http://board:8080/input/key?code=HOME&event=SHORT",
      "http://host:8790/debug/stats",
      "http://board:8080/status",
    ]);
  });

  it("fails when the bridge provider is not the required provider", async () => {
    await assert.rejects(
      runVoiceAiSmoke({
        boardUrl: "http://board:8080",
        bridgeUrl: "http://host:8790",
        recordMs: 0,
        polls: 1,
        intervalMs: 0,
        requireBridgeProvider: "command",
        requestImpl: async (url) => {
          if (url === "http://host:8790/debug/stats") {
            return { ok: true, status: 200, text: '{"ok":true,"provider":"mock","chat_requests":0,"last_audio_bytes":0}' };
          }
          return { ok: true, status: 200, text: '{"ok":true}' };
        },
      }),
      /expected bridge provider command/,
    );
  });

  it("fails when GIF metrics are required but not visible", async () => {
    const appMetrics = [
      '{"mode":"idle","init_stage":"old","use_gif":false,"gif_visible":false,"gif_state":"","gif_src":""}',
      '{"mode":"idle","init_stage":"ready","use_gif":true,"gif_visible":false,"gif_state":"","gif_src":""}',
    ];
    await assert.rejects(
      runVoiceAiSmoke({
        boardUrl: "http://board:8080",
        bridgeUrl: "http://host:8790",
        recordMs: 0,
        polls: 1,
        intervalMs: 0,
        requireGif: true,
        requestImpl: async (url) => {
          if (url.includes("/debug/stats")) {
            return { ok: true, status: 200, text: '{"ok":true,"chat_requests":0,"last_audio_bytes":0}' };
          }
          if (url === "http://board:8080/stop") {
            return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
          }
          if (url === "http://board:8080/status") {
            return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}' };
          }
          if (url.includes("/apps/file")) {
            return { ok: true, status: 200, text: appMetrics.shift() };
          }
          return { ok: true, status: 200, text: '{"ok":true}' };
        },
      }),
      /expected voice_ai GIF metrics/,
    );
  });

  it("fails when font metrics are required but not loaded", async () => {
    const appMetrics = [
      '{"mode":"idle","init_stage":"old","font_loaded":false,"font_handle":0,"font_src":"","font_error":""}',
      '{"mode":"idle","init_stage":"ready","font_loaded":false,"font_handle":0,"font_src":"builtin:LV_FONT_COMMON_CN_13","font_error":"invalid handle 0"}',
    ];
    await assert.rejects(
      runVoiceAiSmoke({
        boardUrl: "http://board:8080",
        bridgeUrl: "http://host:8790",
        recordMs: 0,
        polls: 1,
        intervalMs: 0,
        requireFont: true,
        requestImpl: async (url) => {
          if (url.includes("/debug/stats")) {
            return { ok: true, status: 200, text: '{"ok":true,"chat_requests":0,"last_audio_bytes":0}' };
          }
          if (url === "http://board:8080/stop") {
            return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
          }
          if (url === "http://board:8080/status") {
            return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai","last_status":"ESP_OK"}' };
          }
          if (url.includes("/apps/file")) {
            return { ok: true, status: 200, text: appMetrics.shift() };
          }
          return { ok: true, status: 200, text: '{"ok":true}' };
        },
      }),
      /expected voice_ai font metrics/,
    );
  });

  it("fails when the bridge does not receive audio", async () => {
    const appMetrics = [
      '{"mode":"idle","init_stage":"old","record_bytes":0,"rx_events":0}',
      '{"mode":"idle","init_stage":"ready","record_bytes":0,"rx_events":0}',
    ];
    await assert.rejects(
      runVoiceAiSmoke({
        boardUrl: "http://board:8080",
        bridgeUrl: "http://host:8790",
        recordMs: 0,
        polls: 1,
        intervalMs: 0,
        requestImpl: async (url) => {
          if (url.includes("/debug/stats")) {
            return { ok: true, status: 200, text: '{"ok":true,"chat_requests":0,"last_audio_bytes":0}' };
          }
          if (url === "http://board:8080/stop") {
            return { ok: true, status: 200, text: '{"ok":true,"stopped":false}' };
          }
          if (url === "http://board:8080/status") {
            return { ok: true, status: 200, text: '{"state":"running","current_app":"voice_ai"}' };
          }
          if (url.includes("/apps/file")) {
            return { ok: true, status: 200, text: appMetrics.shift() };
          }
          return { ok: true, status: 200, text: '{"ok":true}' };
        },
      }),
      /expected bridge chat_requests to increase/,
    );
  });
});
