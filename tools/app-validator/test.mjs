import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
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

  it("rejects a package with a missing entry file", () => {
    const result = validateAppDirectory(join(here, "fixtures/missing-entry"));
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["Entry file does not exist: missing.lua"]);
  });
});
