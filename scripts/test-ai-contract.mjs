import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_LUA_API_SYMBOLS, SUPPORTED_LVGL_SYMBOLS } from "../tools/app-validator/index.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const doc = readFileSync(join(root, "docs/ai-generation-contract.md"), "utf8");

const jsonFence = doc.match(/```json\s*([\s\S]*?)```/);
assert.ok(jsonFence, "expected first fenced json block");

const plan = JSON.parse(jsonFence[1]);

assert.equal(typeof plan.app?.name, "string");
assert.ok(plan.app.name.length > 0);
assert.equal(typeof plan.app?.entry, "string");
assert.ok(plan.app.entry.length > 0);
assert.equal(typeof plan.app?.description, "string");
assert.ok(plan.app.description.length > 0);
assert.ok(Array.isArray(plan.app?.capabilities));
assert.ok(plan.app.capabilities.length > 0);

assert.ok(Array.isArray(plan.files));

const appInfo = plan.files.find((file) => file.path === "app.info");
const luaEntry = plan.files.find((file) => file.path === "main.lua");

assert.ok(appInfo, "expected files[] to contain app.info");
assert.ok(luaEntry, "expected files[] to contain main.lua");
assert.equal(typeof appInfo.content, "string");
assert.match(appInfo.content, /^name\s*=/m);
assert.match(appInfo.content, /^entry\s*=/m);
assert.match(appInfo.content, /^description\s*=/m);

const capabilitiesLine = appInfo.content
  .split("\n")
  .find((line) => /^capabilities\s*=/.test(line));
assert.ok(capabilitiesLine, "expected app.info capabilities line");

const appInfoCapabilities = capabilitiesLine
  .replace(/^capabilities\s*=\s*/, "")
  .split(",")
  .map((capability) => capability.trim())
  .filter(Boolean);

assert.deepEqual(appInfoCapabilities, plan.app.capabilities);

for (const requiredBoundary of [
  /JSON is an intermediate generation plan/i,
  /on-disk package is app\.info \+ Lua\/assets directory/i,
  /Runtime update required/,
  /Allowed Runtime Lua APIs/i,
  /app\.launch\(id\)/,
  /app\.set_home_exit\(enabled\)/,
  /touch\.on\(callback\)/,
  /gamepad\.push_state\(state\)/,
  /i2s\.write/i
]) {
  assert.match(doc, requiredBoundary);
}

for (const symbol of SUPPORTED_LUA_API_SYMBOLS) {
  assert.match(
    doc,
    new RegExp(`${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\(`),
    `expected AI contract to document ${symbol}`
  );
}

for (const symbol of SUPPORTED_LVGL_SYMBOLS) {
  assert.match(
    doc,
    new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
    `expected AI contract to document ${symbol}`
  );
}
