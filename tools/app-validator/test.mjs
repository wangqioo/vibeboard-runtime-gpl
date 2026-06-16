import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseAppInfo, validateAppDirectory } from "./index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");
const funDemoApps = [
  "demo_pixel_pet",
  "demo_focus_timer",
  "demo_lucky_card",
  "demo_space_dash",
  "demo_digital_clock",
  "holocubic_nixie_clock",
  "holocubic_analog_clock",
  "holocubic_matrix_rain",
  "demo_terminal_status",
  "demo_neon_dash",
  "demo_night_light",
  "demo_auto_snake",
  "smoke_canvas"
];
const holocubicCatalogApps = [
  "holocubic_2048",
  "holocubic_analog_clock",
  "holocubic_btc",
  "holocubic_codex_buddy",
  "holocubic_conway_life",
  "holocubic_devtools",
  "holocubic_fluid_pendant",
  "holocubic_hwmon",
  "holocubic_lv_benchmark",
  "holocubic_matrix_rain",
  "holocubic_mini_claw",
  "holocubic_nixie_clock",
  "holocubic_photos",
  "holocubic_plane",
  "holocubic_settings",
  "holocubic_spectrum",
  "holocubic_videos",
  "nesgame",
  "voice_ai",
  "weather"
];

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

describe("fun demo apps", () => {
  for (const appId of funDemoApps) {
    it(`accepts ${appId} as a stable lvgl timer demo`, () => {
      const result = validateAppDirectory(join(repoRoot, "apps", appId));

      assert.equal(result.ok, true, result.errors.join("\n"));
      assert.deepEqual(result.capabilities, ["lvgl", "timer"]);
      assert.equal(result.relativeEntry, "main.lua");
    });
  }

  it("keeps demo_digital_clock as a simple large black and white clock", () => {
    const source = readFileSync(join(repoRoot, "apps/demo_digital_clock/main.lua"), "utf8");

    assert.match(source, /lv_obj_set_style_bg_color\(root,\s*0x000000\)/);
    assert.match(source, /SEGMENT_COLOR\s*=\s*0xffffff/);
    assert.match(source, /draw_digit/);
    assert.match(source, /draw_colon/);
    assert.doesNotMatch(source, /VibeBoard Clock|LOCAL DEMO|offline safe template/);
  });

  it("keeps style demo sources visually distinct", () => {
    const terminal = readFileSync(join(repoRoot, "apps/demo_terminal_status/main.lua"), "utf8");
    const neon = readFileSync(join(repoRoot, "apps/demo_neon_dash/main.lua"), "utf8");
    const pet = readFileSync(join(repoRoot, "apps/demo_pixel_pet/main.lua"), "utf8");
    const night = readFileSync(join(repoRoot, "apps/demo_night_light/main.lua"), "utf8");

    assert.match(terminal, /TERMINAL_GREEN\s*=\s*0x39ff14/);
    assert.match(terminal, /BOOT LOG|SYS OK|MEM OK/);
    assert.match(neon, /NEON_CYAN\s*=\s*0x00f5ff/);
    assert.match(neon, /NEON_MAGENTA\s*=\s*0xff2bd6/);
    assert.match(pet, /PIXEL_SIZE\s*=/);
    assert.match(pet, /draw_pet/);
    assert.match(night, /WARM_AMBER\s*=\s*0xffb45c/);
    assert.match(night, /moon|breath/i);
  });

  it("keeps demo_auto_snake as a timer-driven self-playing game", () => {
    const source = readFileSync(join(repoRoot, "apps/demo_auto_snake/main.lua"), "utf8");

    assert.match(source, /MAX_SNAKE\s*=\s*28/);
    assert.match(source, /choose_direction/);
    assert.match(source, /move_snake/);
    assert.match(source, /snake_timer:alarm\(250,\s*tmr\.ALARM_AUTO/);
    assert.doesNotMatch(source, /touch\.|key\./);
  });

  it("accepts smoke_input as the stable key input smoke app", () => {
    const result = validateAppDirectory(join(repoRoot, "apps/smoke_input"));

    assert.equal(result.ok, true, result.errors.join("\n"));
    assert.deepEqual(result.capabilities, ["lvgl", "timer", "input"]);
    assert.equal(result.relativeEntry, "main.lua");
  });

  it("keeps the first Holocubic ports inside the safe runtime subset", () => {
    const nixie = readFileSync(join(repoRoot, "apps/holocubic_nixie_clock/main.lua"), "utf8");
    const analog = readFileSync(join(repoRoot, "apps/holocubic_analog_clock/main.lua"), "utf8");

    assert.match(nixie, /Holocubic Nixie/);
    assert.match(nixie, /TUBE_BG/);
    assert.match(nixie, /draw_digit/);
    assert.match(analog, /Holocubic Clock/);
    assert.match(analog, /object-drawn analog port/);
    assert.match(analog, /hour_hand/);
    assert.doesNotMatch(nixie + analog, /lv_img_|lv_canvas_|key\.|touch\.|http\.|wifi\.|file\./);
  });

  it("keeps holocubic_matrix_rain as a canvas-only screensaver port", () => {
    const source = readFileSync(join(repoRoot, "apps/holocubic_matrix_rain/main.lua"), "utf8");

    assert.match(source, /Holocubic Matrix Rain/);
    assert.match(source, /lv_canvas_create/);
    assert.match(source, /lv_canvas_fill_bg/);
    assert.match(source, /lv_canvas_draw_rect/);
    assert.match(source, /lv_canvas_draw_text/);
    assert.match(source, /lv_obj_invalidate/);
    assert.match(source, /COLUMN_W\s*=\s*24/);
    assert.match(source, /TRAIL\s*=\s*6/);
    assert.match(source, /rain_timer:alarm\(180,\s*tmr\.ALARM_AUTO/);
    assert.doesNotMatch(source, /key\.|touch\.|http\.|wifi\.|file\./);
  });
});

describe("Holocubic app catalog", () => {
  for (const appId of holocubicCatalogApps) {
    it(`accepts ${appId} as a local catalog package`, () => {
      const result = validateAppDirectory(join(repoRoot, "apps", appId));

      assert.equal(result.ok, true, result.errors.join("\n"));
      assert.equal(result.relativeEntry, "main.lua");
    });
  }
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
