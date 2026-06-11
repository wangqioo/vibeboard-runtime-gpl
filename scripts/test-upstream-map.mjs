import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const requiredPaths = [
  "upstream/holocubic-apps/README.md",
  "upstream/holocubic-apps/weather/app.info",
  "upstream/holocubic-apps/voice_ai/app.info",
  "upstream/holocubic-apps/nesgame/app.info",
  "upstream/holocubic-nes-esp32/README.md",
  "upstream/holocubic-nes-esp32/main/nes_module.c",
  "docs/upstream-map.md",
  "NOTICE.md"
];

for (const path of requiredPaths) {
  assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
}

const notice = readFileSync(join(root, "NOTICE.md"), "utf8");
assert.match(notice, /clocteck\/holocubic-apps/);
assert.match(notice, /clocteck\/holocubic-nes-esp32/);
assert.match(notice, /GPL-3\.0/);
