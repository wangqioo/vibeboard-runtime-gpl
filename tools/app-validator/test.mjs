import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseAppInfo, validateAppDirectory } from "./index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATED_APP_EXPECTED_CAPABILITIES = new Map([
  ["apps/matrix_rain", ["lvgl", "timer"]],
  ["apps/nixie_clock", ["lvgl", "file", "timer", "network"]],
  ["apps/clock", ["lvgl", "file", "timer", "network"]],
  ["apps/conway_life", ["lvgl", "file", "timer"]],
  ["apps/fluid_pendant", ["lvgl", "file", "timer", "input"]],
  ["apps/2048", ["lvgl", "file", "timer", "input"]],
  ["apps/btc", ["lvgl", "network", "timer", "file"]],
  ["apps/settings", ["lvgl", "timer", "input", "file"]],
  ["apps/hwmon", ["lvgl", "network", "timer", "file"]],
  ["apps/spectrum", ["lvgl", "timer", "input", "file", "audio"]],
  ["apps/audio_loopback", ["lvgl", "timer", "input", "file", "audio"]],
  ["apps/videos", ["lvgl", "timer", "input", "file"]],
  ["apps/photos", ["lvgl", "timer", "input", "file", "webui"]],
  ["apps/plane", ["lvgl", "timer", "input", "file"]],
  ["apps/lv-benchmark", ["lvgl", "timer", "file"]],
  ["apps/mini_claw", ["lvgl", "network", "timer", "file", "webui"]],
  ["apps/weather", ["lvgl", "network", "timer", "input", "file"]],
  ["apps/voice_ai", ["lvgl", "network", "audio", "file", "timer", "input"]],
  ["apps/nesgame", ["lvgl", "file", "timer", "input", "module", "native"]],
  ["apps/smoke_app_manager", ["lvgl", "timer", "input", "file", "webui"]]
]);

describe("parseAppInfo", () => {
  it("parses key value metadata", () => {
    assert.deepEqual(parseAppInfo("name = Demo\nentry = main.lua\n"), {
      name: "Demo",
      entry: "main.lua"
    });
  });

  it("rejects malformed lines", () => {
    assert.throws(() => parseAppInfo("name Demo"), /Invalid app.info line/);
  });
});

describe("validateAppDirectory", () => {
  it("accepts a valid app package", () => {
    const result = validateAppDirectory(join(here, "fixtures/valid-basic"));
    assert.equal(result.ok, true);
    assert.equal(result.appName, "Timer");
    assert.deepEqual(result.capabilities, ["lvgl", "timer"]);
  });

  it("rejects restricted API usage without a matching capability", () => {
    const result = validateAppDirectory(join(here, "fixtures/missing-network-capability"));
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["Missing capability declaration: network"]);
  });

  it("accepts restricted API usage with a matching capability", () => {
    const result = validateAppDirectory(join(here, "fixtures/declared-network-capability"));
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.capabilities, ["network"]);
  });

  it("requires network capability for NTP initialization", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-ntp-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = NTP",
        "entry = main.lua",
        "description = NTP app",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), "time.initntp('pool.ntp.org')\n");

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, false);
      assert.deepEqual(result.errors, ["Missing capability declaration: network"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires timer capability for tmr usage", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-timer-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = Timer",
        "entry = main.lua",
        "description = Timer app",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), "local timer = tmr.create()\n");

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, false);
      assert.deepEqual(result.errors, ["Missing capability declaration: timer"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires input capability for key usage", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-input-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = Input",
        "entry = main.lua",
        "description = Input app",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), "key.on(function() end)\n");

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, false);
      assert.deepEqual(result.errors, ["Missing capability declaration: input"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires input capability for gamepad usage", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-gamepad-input-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = Gamepad",
        "entry = main.lua",
        "description = Gamepad app",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), "local state = gamepad.state()\n");

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, false);
      assert.deepEqual(result.errors, ["Missing capability declaration: input"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires webui capability for app route registration", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-webui-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = WebUI",
        "entry = main.lua",
        "description = WebUI app",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), [
        "app.set_webui(true)",
        "app.route('/api/ping', function(req) return { body = 'pong' } end)",
        ""
      ].join("\n"));

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, false);
      assert.deepEqual(result.errors, ["Missing capability declaration: webui"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires lvgl capability for LVGL usage", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-lvgl-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = Display",
        "entry = main.lua",
        "description = Display app",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), "local root = lv_scr_act()\nlv_obj_create(root)\n");

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, false);
      assert.deepEqual(result.errors, ["Missing capability declaration: lvgl"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects LVGL calls that are not exposed by the current runtime", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-lvgl-api-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = Missing LVGL",
        "entry = main.lua",
        "description = Missing LVGL binding",
        "capabilities = lvgl",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), [
        "local root = lv_scr_act()",
        "lv_obj_create(root)",
        "lv_totally_missing_widget(root)",
        ""
      ].join("\n"));

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, false);
      assert.deepEqual(result.errors, ["Runtime update required: unsupported LVGL API lv_totally_missing_widget"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores unsupported APIs that only appear inside Lua comments and strings", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-lexical-scan-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = Lexical Scan",
        "entry = main.lua",
        "description = Validator lexical scan",
        "capabilities = lvgl",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), [
        "-- lv_totally_missing_widget(root)",
        "local note = \"i2s.write(0, 'pcm') and tmr.delay(10) are not real calls\"",
        "local block = [[ gamepad.connect('AA:BB') ]]",
        "local root = lv_scr_act()",
        "lv_obj_create(root)",
        ""
      ].join("\n"));

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, true);
      assert.deepEqual(result.errors, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects calls to unsupported Lua module APIs", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-lua-api-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = Missing Lua APIs",
        "entry = main.lua",
        "description = Missing Lua module bindings",
        "capabilities = input,audio,timer,webui",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), [
        "gamepad.connect('AA:BB:CC:DD:EE:FF')",
        "app.set_home_exit(false)",
        "app.set_status_text('ready')",
        "app.route('/api/ping', function() end)",
        "app.set_webui(true)",
        "i2s.write(0, 'pcm')",
        "tmr.delay(100)",
        ""
      ].join("\n"));

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, false);
      assert.deepEqual(result.errors, [
        "Runtime update required: unsupported Lua API app.set_status_text",
        "Runtime update required: unsupported Lua API gamepad.connect",
        "Runtime update required: unsupported Lua API tmr.delay"
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts supported Lua APIs in non-entry Lua files", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-nested-lua-api-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = Nested Lua APIs",
        "entry = main.lua",
        "description = Missing Lua module binding in helper",
        "capabilities = audio",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), "dofile('helper.lua')\n");
      writeFileSync(join(appDir, "helper.lua"), "i2s.write(0, 'pcm')\n");

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts app-local file mutation helpers used by migrated service apps", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-file-helpers-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = File Helpers",
        "entry = main.lua",
        "description = Uses the migrated file helper surface",
        "capabilities = file",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), [
        "file.stat('config.json')",
        "file.mkdir('data')",
        "file.putcontents('data/state.txt', 'ready')",
        "file.rename('data/state.txt', 'data/state.next')",
        "file.remove('data/state.next')",
        "file.rmdir('data')",
        ""
      ].join("\n"));

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, true);
      assert.deepEqual(result.errors, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects apps that require newer runtime API versions", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-runtime-version-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(appDir, "app.info"), [
        "name = Future Runtime",
        "entry = main.lua",
        "description = Requires a newer runtime",
        "requires.runtime = >=0.2.0",
        "requires.luaApi = >=0.3.0",
        "requires.lvglApi = >=0.4.0",
        "requires.nativeAbi = >=2.0.0",
        ""
      ].join("\n"));
      writeFileSync(join(appDir, "main.lua"), "print('future')\n");

      const result = validateAppDirectory(appDir);

      assert.equal(result.ok, false);
      assert.deepEqual(result.errors, [
        "Runtime update required: requires runtime >=0.2.0, current 0.1.0",
        "Runtime update required: requires luaApi >=0.3.0, current 0.1.0",
        "Runtime update required: requires lvglApi >=0.4.0, current 0.1.0",
        "Runtime update required: requires nativeAbi >=2.0.0, current vibeboard-native-module-abi@1"
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps migrated app capabilities aligned with static API usage", () => {
    for (const [appPath, expectedCapabilities] of MIGRATED_APP_EXPECTED_CAPABILITIES) {
      const result = validateAppDirectory(join(repoRoot, appPath));

      assert.equal(result.ok, true, `${appPath}: ${result.errors.join("; ")}`);
      assert.deepEqual(result.capabilities, expectedCapabilities, `${appPath} capability drift`);
    }
  });

  it("rejects a package with a missing entry file", () => {
    const result = validateAppDirectory(join(here, "fixtures/missing-entry"));
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["Entry file does not exist: missing.lua"]);
  });

  it("rejects an entry path that traverses outside the app directory", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-traversal-"));
    try {
      const appDir = join(root, "app");
      mkdirSync(appDir);
      writeFileSync(join(root, "outside.lua"), "return {}\n");
      writeFileSync(join(appDir, "app.info"), [
        "name = Traversal",
        "entry = ../outside.lua",
        "description = Traversal app",
        ""
      ].join("\n"));

      const result = validateAppDirectory(appDir);
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /Entry path must stay inside the app directory/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an absolute entry path", () => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-absolute-"));
    try {
      const appDir = join(root, "app");
      const outsidePath = join(root, "outside.lua");
      mkdirSync(appDir);
      writeFileSync(outsidePath, "return {}\n");
      writeFileSync(join(appDir, "app.info"), [
        "name = Absolute",
        `entry = ${outsidePath}`,
        "description = Absolute app",
        ""
      ].join("\n"));

      const result = validateAppDirectory(appDir);
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /Entry path must stay inside the app directory/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked entry that resolves outside the app directory", (context) => {
    const root = mkdtempSync(join(tmpdir(), "app-validator-symlink-"));
    try {
      const appDir = join(root, "app");
      const outsidePath = join(root, "outside.lua");
      const symlinkPath = join(appDir, "main.lua");
      mkdirSync(appDir);
      writeFileSync(outsidePath, "return {}\n");
      writeFileSync(join(appDir, "app.info"), [
        "name = Symlink",
        "entry = main.lua",
        "description = Symlink app",
        ""
      ].join("\n"));
      try {
        symlinkSync(outsidePath, symlinkPath);
      } catch (error) {
        context.skip(`Symlink creation unsupported: ${error.message}`);
        return;
      }

      const result = validateAppDirectory(appDir);
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /Entry path must stay inside the app directory/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
