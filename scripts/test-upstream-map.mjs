import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

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
const upstreamMap = readFileSync(join(root, "docs/upstream-map.md"), "utf8");

const expectedPairs = [
  [
    "upstream/holocubic-apps/",
    "https://github.com/clocteck/holocubic-apps"
  ],
  [
    "upstream/holocubic-nes-esp32/",
    "https://github.com/clocteck/holocubic-nes-esp32"
  ],
  ["apps/weather/", "upstream/holocubic-apps/weather/"],
  ["apps/voice_ai/", "upstream/holocubic-apps/voice_ai/"],
  ["apps/nesgame/", "upstream/holocubic-apps/nesgame/"],
  ["modules/nes/", "upstream/holocubic-nes-esp32/"]
];

function assertDocumentedPair(documentText, documentName, left, right) {
  const rows = documentText.split("\n").filter((line) => line.trim().startsWith("|"));
  const hasPair = rows.some((row) => {
    const cells = row
      .split("|")
      .map((cell) => cell.trim().replaceAll("`", ""))
      .filter(Boolean);

    return cells.includes(left) && cells.includes(right);
  });

  assert.equal(hasPair, true, `${documentName} should map ${left} to ${right}`);
}

for (const [left, right] of expectedPairs) {
  assertDocumentedPair(upstreamMap, "docs/upstream-map.md", left, right);
  assertDocumentedPair(notice, "NOTICE.md", left, right);
}

assert.match(notice, /clocteck\/holocubic-apps/);
assert.match(notice, /clocteck\/holocubic-nes-esp32/);
assert.match(notice, /GPL-3\.0/);
