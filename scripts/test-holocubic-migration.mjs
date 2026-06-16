import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { validateAppDirectory } from "../tools/app-validator/index.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const matrixPath = join(repoRoot, "docs/holocubic-app-migration.json");
const matrixDocPath = join(repoRoot, "docs/holocubic-app-migration.md");

const upstreamAppIds = [
  "2048",
  "BTC",
  "ConwayLife",
  "FluidPendant",
  "MatrixRain",
  "NixieClock",
  "Spectrum",
  "clock",
  "codex_buddy",
  "devtools",
  "hwmon",
  "lv-benchmark",
  "mini_claw",
  "nesgame",
  "photos",
  "plane",
  "settings",
  "videos",
  "voice_ai",
  "weather"
].sort();

const curatedLegacyTargetIds = new Set([
  "nesgame",
  "voice_ai",
  "weather"
]);

function readJson(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("holocubic app migration plan", () => {
  it("tracks every upstream holocubic app in a machine-readable matrix", () => {
    const matrix = readJson(matrixPath);

    assert.equal(matrix.schema, "vibeboard-holocubic-migration@1");
    assert.equal(matrix.source.repo, "https://github.com/clocteck/holocubic-apps.git");
    assert.equal(matrix.source.commit, "78da33f");
    assert.deepEqual(matrix.apps.map((app) => app.upstreamId).sort(), upstreamAppIds);

    for (const app of matrix.apps) {
      assert.match(app.targetId, /^[a-z0-9_-]+$/);
      assert.ok(Number.isInteger(app.phase));
      assert.ok(["ported", "blocked", "planned"].includes(app.status));
      assert.ok(Array.isArray(app.requiredRuntime));
      assert.ok(app.notes.length > 0);
    }
  });

  it("documents the migration phases for humans", () => {
    assert.equal(existsSync(matrixDocPath), true, `${matrixDocPath} should exist`);
    const doc = readFileSync(matrixDocPath, "utf8");

    assert.match(doc, /# Holocubic App Migration/);
    assert.match(doc, /Phase 1/);
    assert.match(doc, /NixieClock/);
    assert.match(doc, /clock/);
    assert.match(doc, /key\.on/);
    assert.match(doc, /lv_canvas/);
  });

  it("ports the first Holocubic clocks to the current safe runtime subset", () => {
    const matrix = readJson(matrixPath);
    const firstBatch = matrix.apps.filter((app) => app.status === "ported").map((app) => app.targetId).sort();

    assert.deepEqual(firstBatch, [
      "holocubic_analog_clock",
      "holocubic_matrix_rain",
      "holocubic_nixie_clock"
    ]);

    for (const appId of ["holocubic_analog_clock", "holocubic_nixie_clock"]) {
      const appDir = join(repoRoot, "apps", appId);
      const validation = validateAppDirectory(appDir);
      const source = readFileSync(join(appDir, "main.lua"), "utf8");

      assert.equal(validation.ok, true, validation.errors.join("\n"));
      assert.deepEqual(validation.capabilities, ["lvgl", "timer"]);
      assert.match(source, /Holocubic/);
      assert.match(source, /tmr\.create\(\)/);
      assert.match(source, /lv_obj_create/);
      assert.doesNotMatch(source, /lv_img_|lv_canvas_|key\.|touch\.|http\.|wifi\.|file\./);
    }
  });

  it("ports MatrixRain as the first Phase 2 canvas screensaver", () => {
    const matrix = readJson(matrixPath);
    const matrixRain = matrix.apps.find((app) => app.upstreamId === "MatrixRain");
    const appDir = join(repoRoot, "apps/holocubic_matrix_rain");
    const validation = validateAppDirectory(appDir);
    const source = readFileSync(join(appDir, "main.lua"), "utf8");

    assert.equal(matrixRain.status, "ported");
    assert.deepEqual(matrixRain.requiredRuntime, ["lvgl", "timer", "lvgl-canvas"]);
    assert.equal(validation.ok, true, validation.errors.join("\n"));
    assert.deepEqual(validation.capabilities, ["lvgl", "timer"]);
    assert.match(source, /Holocubic Matrix Rain/);
    assert.match(source, /lv_canvas_create/);
    assert.match(source, /lv_canvas_draw_text/);
    assert.match(source, /lv_canvas_draw_rect/);
    assert.match(source, /tmr\.create\(\)/);
    assert.doesNotMatch(source, /key\.|touch\.|http\.|wifi\.|file\./);
  });

  it("keeps a local app package for every Holocubic migration target", () => {
    const matrix = readJson(matrixPath);

    for (const app of matrix.apps) {
      const appDir = join(repoRoot, "apps", app.targetId);
      const validation = validateAppDirectory(appDir);

      assert.equal(existsSync(appDir), true, `${app.targetId} should exist under apps/`);
      assert.equal(validation.ok, true, `${app.targetId}: ${validation.errors.join("\n")}`);
      assert.equal(validation.relativeEntry, "main.lua");
    }
  });

  it("marks unported Holocubic-only local packages as explicit runtime-update placeholders", () => {
    const matrix = readJson(matrixPath);

    for (const app of matrix.apps) {
      if (app.status === "ported" || curatedLegacyTargetIds.has(app.targetId)) continue;

      const source = readFileSync(join(repoRoot, "apps", app.targetId, "main.lua"), "utf8");

      assert.match(source, /Runtime update required/, `${app.targetId} should tell users it is not fully ported yet`);
      assert.match(source, /Missing runtime/, `${app.targetId} should list the missing runtime slice`);
      for (const runtime of app.requiredRuntime) {
        assert.match(
          source,
          new RegExp(escapeRegex(runtime)),
          `${app.targetId} placeholder should mention required runtime slice ${runtime}`
        );
      }
      assert.match(source, /tmr\.create\(\)/, `${app.targetId} should stay alive as a visible placeholder`);
      assert.doesNotMatch(source, /key\.|touch\.|http\.|wifi\.|file\.|require\(/);
    }
  });
});
