import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeAppPlan,
  writeAppPlanObject
} from "./index.mjs";

function makeTempRepo() {
  return mkdtempSync(join(tmpdir(), "vibeboard-plan-writer-"));
}

function validPlan(overrides = {}) {
  return {
    app: {
      name: "Timer",
      entry: "main.lua",
      description: "Simple countdown timer",
      capabilities: ["timer"],
      ...overrides.app
    },
    files: overrides.files || [
      {
        path: "main.lua",
        type: "lua",
        content: "print('timer')\n"
      }
    ]
  };
}

describe("writeAppPlanObject", () => {
  it("writes a generated app directory and app.info", () => {
    const root = makeTempRepo();
    try {
      const result = writeAppPlanObject({ repoRoot: root, plan: validPlan() });

      assert.equal(result.appId, "timer");
      assert.equal(result.validation.ok, true);
      assert.equal(result.packageResult, null);
      assert.equal(readFileSync(join(result.appDir, "main.lua"), "utf8"), "print('timer')\n");
      assert.equal(
        readFileSync(join(result.appDir, "app.info"), "utf8"),
        "name = Timer\nentry = main.lua\ndescription = Simple countdown timer\ncapabilities = timer\n"
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("overwrites app.info from metadata instead of trusting plan content", () => {
    const root = makeTempRepo();
    try {
      const result = writeAppPlanObject({
        repoRoot: root,
        plan: validPlan({
          files: [
            {
              path: "app.info",
              type: "text",
              content: "name = Wrong\nentry = wrong.lua\ndescription = Wrong\n"
            },
            {
              path: "main.lua",
              type: "lua",
              content: "print('timer')\n"
            }
          ]
        })
      });

      assert.match(readFileSync(join(result.appDir, "app.info"), "utf8"), /name = Timer/);
      assert.doesNotMatch(readFileSync(join(result.appDir, "app.info"), "utf8"), /Wrong/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects files that traverse outside the generated app directory", () => {
    const root = makeTempRepo();
    try {
      assert.throws(
        () =>
          writeAppPlanObject({
            repoRoot: root,
            plan: validPlan({
              files: [
                {
                  path: "../escape.lua",
                  type: "lua",
                  content: "print('escape')\n"
                }
              ]
            })
          }),
        /must stay inside the app directory/
      );
      assert.equal(existsSync(join(root, "generated/apps/timer")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects plans where the entry file is not written", () => {
    const root = makeTempRepo();
    try {
      assert.throws(
        () =>
          writeAppPlanObject({
            repoRoot: root,
            plan: validPlan({ files: [] })
          }),
        /Entry file does not exist/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("packages the generated app when requested", () => {
    const root = makeTempRepo();
    try {
      const result = writeAppPlanObject({
        repoRoot: root,
        plan: validPlan(),
        packageOutput: true
      });

      assert.equal(result.packageResult.appId, "timer");
      assert.equal(existsSync(join(result.packageResult.outputPath, "manifest.json")), true);
      assert.equal(existsSync(join(root, "dist/apps/timer/manifest.json")), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("writeAppPlan", () => {
  it("reads a JSON plan file", () => {
    const root = makeTempRepo();
    try {
      const planPath = join(root, "timer.json");
      writeFileSync(planPath, `${JSON.stringify(validPlan(), null, 2)}\n`);

      const result = writeAppPlan({ repoRoot: root, planPath });

      assert.equal(result.appId, "timer");
      assert.equal(existsSync(join(result.appDir, "main.lua")), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
