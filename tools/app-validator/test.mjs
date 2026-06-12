import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseAppInfo, validateAppDirectory } from "./index.mjs";

const here = dirname(fileURLToPath(import.meta.url));

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
