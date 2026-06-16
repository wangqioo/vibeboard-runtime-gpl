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

function readJson(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  return JSON.parse(readFileSync(path, "utf8"));
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

  it("ports the first two Holocubic clocks to the current safe runtime subset", () => {
    const matrix = readJson(matrixPath);
    const firstBatch = matrix.apps.filter((app) => app.status === "ported").map((app) => app.targetId).sort();

    assert.deepEqual(firstBatch, ["holocubic_analog_clock", "holocubic_nixie_clock"]);

    for (const appId of firstBatch) {
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
});
