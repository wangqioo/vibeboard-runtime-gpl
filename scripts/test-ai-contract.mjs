import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const doc = readFileSync(join(root, "docs/ai-generation-contract.md"), "utf8");

function literalPattern(text) {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

for (const required of [
  "\"app\"",
  "\"files\"",
  "capabilities",
  "Prefer Lua/LVGL app generation",
  "Runtime update required"
]) {
  assert.match(doc, literalPattern(required));
}
