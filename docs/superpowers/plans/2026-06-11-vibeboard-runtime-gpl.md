# VibeBoard Runtime GPL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first GPL VibeBoard Runtime repository shell that directly absorbs HoloCubic Lua/LVGL apps and NES dynamic module source, validates app packages, and documents the no-reflash app deployment workflow.

**Architecture:** Keep `/Users/wq/vibeboard-runtime-gpl` as a separate GPL-3.0 repo from the existing MIT `/Users/wq/VibeBoard`. Import upstream snapshots into `upstream/`, curate first demo apps into `apps/` and `modules/`, and add small Node-based tooling to validate package metadata and source attribution. Phase 1 is file/package focused and does not build a new ESP32 firmware runtime.

**Tech Stack:** Git, Markdown docs, GPL-3.0, Node.js ESM scripts, built-in `node:test`, shell snapshot import using `curl` and `tar`.

---

## File Structure

Create or modify these files in `/Users/wq/vibeboard-runtime-gpl`:

- `LICENSE`: GPL-3.0 license text copied from upstream `holocubic-apps`.
- `NOTICE.md`: upstream attribution, import date, license notes, curated-copy map.
- `README.md`: product overview, no-reflash boundary, first demo paths.
- `.gitignore`: ignores local caches and temporary import artifacts.
- `package.json`: Node test scripts and package metadata.
- `docs/architecture.md`: runtime-vs-app architecture.
- `docs/app-package-format.md`: `app.info` and package rules.
- `docs/ai-generation-contract.md`: JSON contract for AI-produced packages.
- `docs/deployment-flow.md`: SD/manual baseline and future upload flow.
- `docs/runtime-boundary.md`: what requires flashing and what does not.
- `docs/upstream-map.md`: exact upstream repositories and curated path map.
- `tools/import-upstream.sh`: snapshot importer for both upstream repositories.
- `tools/app-validator/index.mjs`: app metadata parser and validator.
- `tools/app-validator/cli.mjs`: CLI wrapper for validating app directories.
- `tools/app-validator/fixtures/valid-basic/app.info`: valid app fixture.
- `tools/app-validator/fixtures/valid-basic/main.lua`: valid app fixture entry.
- `tools/app-validator/fixtures/missing-entry/app.info`: invalid fixture.
- `tools/app-validator/test.mjs`: validator tests.
- `scripts/test-upstream-map.mjs`: verifies imported upstream and curated copies.
- `scripts/test-ai-contract.mjs`: verifies docs contain the generation contract anchors.
- `upstream/holocubic-apps/**`: imported snapshot from `clocteck/holocubic-apps`.
- `upstream/holocubic-nes-esp32/**`: imported snapshot from `clocteck/holocubic-nes-esp32`.
- `apps/weather/**`: curated copy from `upstream/holocubic-apps/weather`.
- `apps/voice_ai/**`: curated copy from `upstream/holocubic-apps/voice_ai`.
- `apps/nesgame/**`: curated copy from `upstream/holocubic-apps/nesgame`.
- `modules/nes/**`: curated copy from `upstream/holocubic-nes-esp32`.
- `web-console/README.md`: phase-boundary note for future browser upload UI.

## Task 1: Project Shell, License, And Docs

**Files:**
- Create: `LICENSE`
- Create: `NOTICE.md`
- Create: `README.md`
- Create: `.gitignore`
- Create: `package.json`
- Create: `docs/architecture.md`
- Create: `docs/runtime-boundary.md`
- Create: `docs/deployment-flow.md`
- Modify: `docs/superpowers/specs/2026-06-11-vibeboard-runtime-gpl-design.md` only if the implementation uncovers a concrete spec correction.

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
.DS_Store
.cache/
tmp/
*.log
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "vibeboard-runtime-gpl",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "GPL-3.0-only",
  "scripts": {
    "test": "npm run test:validator && npm run test:upstream-map && npm run test:ai-contract",
    "test:validator": "node --test tools/app-validator/test.mjs",
    "test:upstream-map": "node scripts/test-upstream-map.mjs",
    "test:ai-contract": "node scripts/test-ai-contract.mjs",
    "validate:apps": "node tools/app-validator/cli.mjs apps/weather apps/voice_ai apps/nesgame"
  }
}
```

- [ ] **Step 3: Create `LICENSE`**

Copy GPL-3.0 text from `upstream/holocubic-apps/LICENSE` after Task 2 imports upstream. If implementing Task 1 before Task 2, use:

```bash
curl -L https://www.gnu.org/licenses/gpl-3.0.txt -o LICENSE
```

Expected: `LICENSE` starts with `GNU GENERAL PUBLIC LICENSE`.

- [ ] **Step 4: Create `NOTICE.md`**

```markdown
# Notices

This repository is GPL-3.0-only.

It directly absorbs source from these GPL-3.0 upstream projects:

| Upstream | URL | Imported path | Notes |
| --- | --- | --- | --- |
| HoloCubic apps | https://github.com/clocteck/holocubic-apps | `upstream/holocubic-apps/` | Lua/LVGL app collection. |
| HoloCubic NES ESP32 | https://github.com/clocteck/holocubic-nes-esp32 | `upstream/holocubic-nes-esp32/` | ESP32 NES dynamic module. |

Curated VibeBoard-facing copies:

| Local path | Source path |
| --- | --- |
| `apps/weather/` | `upstream/holocubic-apps/weather/` |
| `apps/voice_ai/` | `upstream/holocubic-apps/voice_ai/` |
| `apps/nesgame/` | `upstream/holocubic-apps/nesgame/` |
| `modules/nes/` | `upstream/holocubic-nes-esp32/` |

Import date: 2026-06-11.
```

- [ ] **Step 5: Create `README.md`**

````markdown
# VibeBoard Runtime GPL

VibeBoard Runtime GPL is the GPL-3.0 runtime/app-ecosystem line for ESP32-S3 small-screen devices.

The goal is to flash a generic ESP-IDF runtime once, then iterate on Lua/LVGL app packages without reflashing full firmware for every UI or app change.

## Boundary

Normal app iteration:

```text
AI generates app.info + Lua + assets
  -> validator checks package
  -> user deploys files to device storage
  -> launcher runs the app
```

Still requires runtime firmware work:

- display, input, SD, WiFi, audio, and storage drivers;
- Lua VM and NodeMCU-style module changes;
- LVGL Lua binding changes;
- app launcher or system service changes;
- native module ABI changes.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `upstream/holocubic-apps/` | Full absorbed HoloCubic Lua/LVGL app snapshot. |
| `upstream/holocubic-nes-esp32/` | Full absorbed NES dynamic module snapshot. |
| `apps/` | Curated VibeBoard-facing app packages. |
| `modules/` | Curated native module paths. |
| `tools/app-validator/` | Package metadata parser and validator. |
| `docs/` | Runtime, deployment, app package, and AI generation docs. |

## First Demo Apps

- `apps/weather`: pure Lua/LVGL network/UI app.
- `apps/voice_ai`: device voice app plus desktop AI bridge.
- `apps/nesgame`: Lua app backed by native NES module.

## Validate

```bash
npm test
npm run validate:apps
```
````

- [ ] **Step 6: Create `docs/architecture.md`**

````markdown
# Architecture

VibeBoard Runtime GPL has two layers.

The runtime layer is ESP-IDF firmware flashed onto the ESP32-S3 device. It owns hardware drivers, Lua, LVGL bindings, the launcher, storage, network services, and optional native-module ABI.

The app layer is file-based. AI or a developer produces an app directory with `app.info`, Lua entry files, and assets. The device launcher loads these files from storage without rebuilding or reflashing the whole firmware.

```text
runtime firmware
  -> launcher
  -> app.info
  -> Lua entry
  -> LVGL screen
  -> optional native module
```
````

- [ ] **Step 7: Create `docs/runtime-boundary.md`**

```markdown
# Runtime Boundary

No reflash is expected for:

- changing `app.info`;
- changing Lua app logic;
- changing app-local assets;
- adding app-local config examples;
- deploying another app that uses already exposed runtime APIs.

Runtime firmware work is expected for:

- display, input, SD, WiFi, audio, or storage driver changes;
- new Lua built-in modules;
- new LVGL binding functions;
- launcher lifecycle changes;
- new upload/install system services;
- native module ABI changes.

When a request cannot be satisfied by the app layer, the tool should report `Runtime update required` instead of pretending a Lua app can change firmware internals.
```

- [ ] **Step 8: Create `docs/deployment-flow.md`**

````markdown
# Deployment Flow

Phase 1 defines the file contract and manual deployment baseline.

```text
AI produces app package
  -> app validator passes
  -> copy app directory to device storage
  -> launcher refreshes app list
  -> app starts
```

Manual baseline:

```text
/sd/apps/<app-name>/app.info
/sd/apps/<app-name>/<entry>.lua
/sd/apps/<app-name>/assets/...
```

Future transport options:

- WiFi HTTP upload exposed by the runtime.
- Browser upload through a VibeBoard Runtime web console.
- SD-card copy for recovery and offline installation.

USB flashing is for runtime installation and recovery, not the normal app-edit loop.
````

- [ ] **Step 9: Run shell checks**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add .gitignore package.json LICENSE NOTICE.md README.md docs/architecture.md docs/runtime-boundary.md docs/deployment-flow.md
git commit -m "docs: add GPL runtime project shell"
```

## Task 2: Upstream Snapshot Import

**Files:**
- Create: `tools/import-upstream.sh`
- Create: `upstream/holocubic-apps/**`
- Create: `upstream/holocubic-nes-esp32/**`
- Modify: `NOTICE.md`
- Create: `docs/upstream-map.md`
- Create: `scripts/test-upstream-map.mjs`

- [ ] **Step 1: Create `tools/import-upstream.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="${ROOT}/tmp/upstream-import"

rm -rf "${TMP_DIR}"
mkdir -p "${TMP_DIR}" "${ROOT}/upstream"

download_and_unpack() {
  local repo="$1"
  local out_name="$2"
  local tarball="${TMP_DIR}/${out_name}.tar.gz"

  curl -L "https://codeload.github.com/${repo}/tar.gz/refs/heads/main" -o "${tarball}"
  rm -rf "${ROOT}/upstream/${out_name}"
  mkdir -p "${TMP_DIR}/${out_name}"
  tar -xzf "${tarball}" -C "${TMP_DIR}/${out_name}" --strip-components=1
  mv "${TMP_DIR}/${out_name}" "${ROOT}/upstream/${out_name}"
}

download_and_unpack "clocteck/holocubic-apps" "holocubic-apps"
download_and_unpack "clocteck/holocubic-nes-esp32" "holocubic-nes-esp32"

rm -rf "${TMP_DIR}"
echo "Imported upstream snapshots into ${ROOT}/upstream"
```

- [ ] **Step 2: Make script executable**

Run:

```bash
chmod +x tools/import-upstream.sh
```

Expected: command exits 0.

- [ ] **Step 3: Run upstream import**

Run:

```bash
tools/import-upstream.sh
```

Expected:

```text
Imported upstream snapshots into /Users/wq/vibeboard-runtime-gpl/upstream
```

If network fails due to sandboxing, rerun with approved network access rather than replacing the script with ad hoc commands.

- [ ] **Step 4: Create `docs/upstream-map.md`**

```markdown
# Upstream Map

## Imported Snapshots

| Path | Source | Purpose |
| --- | --- | --- |
| `upstream/holocubic-apps/` | `https://github.com/clocteck/holocubic-apps` | Lua/LVGL apps and docs. |
| `upstream/holocubic-nes-esp32/` | `https://github.com/clocteck/holocubic-nes-esp32` | NES native dynamic module. |

## Curated Demo Sources

| Demo | Source path | Local path |
| --- | --- | --- |
| Weather | `upstream/holocubic-apps/weather/` | `apps/weather/` |
| Voice AI | `upstream/holocubic-apps/voice_ai/` | `apps/voice_ai/` |
| NES game | `upstream/holocubic-apps/nesgame/` | `apps/nesgame/` |
| NES module | `upstream/holocubic-nes-esp32/` | `modules/nes/` |

## License

Both upstream projects are GPL-3.0. This repository is GPL-3.0-only.
```

- [ ] **Step 5: Create `scripts/test-upstream-map.mjs`**

```js
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
```

- [ ] **Step 6: Run upstream map test**

Run:

```bash
npm run test:upstream-map
```

Expected: process exits 0 with no assertion error.

- [ ] **Step 7: Commit**

```bash
git add tools/import-upstream.sh upstream docs/upstream-map.md scripts/test-upstream-map.mjs NOTICE.md
git commit -m "chore: import HoloCubic upstream snapshots"
```

## Task 3: App Package Validator

**Files:**
- Create: `tools/app-validator/index.mjs`
- Create: `tools/app-validator/cli.mjs`
- Create: `tools/app-validator/test.mjs`
- Create: `tools/app-validator/fixtures/valid-basic/app.info`
- Create: `tools/app-validator/fixtures/valid-basic/main.lua`
- Create: `tools/app-validator/fixtures/missing-entry/app.info`
- Create: `docs/app-package-format.md`

- [ ] **Step 1: Create `tools/app-validator/index.mjs`**

```js
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, normalize, relative } from "node:path";

export function parseAppInfo(text) {
  const data = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (!match) {
      throw new Error(`Invalid app.info line: ${rawLine}`);
    }
    data[match[1]] = match[2].trim();
  }
  return data;
}

export function validateAppDirectory(appDir) {
  const errors = [];
  const warnings = [];
  const appInfoPath = join(appDir, "app.info");

  if (!existsSync(appInfoPath)) {
    return {
      ok: false,
      appDir,
      appName: basename(appDir),
      metadata: {},
      errors: ["Missing app.info"],
      warnings
    };
  }

  let metadata = {};
  try {
    metadata = parseAppInfo(readFileSync(appInfoPath, "utf8"));
  } catch (error) {
    errors.push(error.message);
  }

  for (const field of ["name", "entry", "description"]) {
    if (!metadata[field]) errors.push(`Missing required field: ${field}`);
  }

  if (metadata.entry) {
    const normalizedEntry = normalize(metadata.entry);
    if (normalizedEntry.startsWith("..") || normalizedEntry.includes("/../")) {
      errors.push("Entry path must stay inside the app directory");
    } else {
      const entryPath = join(appDir, normalizedEntry);
      if (!existsSync(entryPath)) {
        errors.push(`Entry file does not exist: ${metadata.entry}`);
      } else if (!statSync(entryPath).isFile()) {
        errors.push(`Entry path is not a file: ${metadata.entry}`);
      }
    }
  }

  const capabilities = metadata.capabilities
    ? metadata.capabilities.split(",").map((item) => item.trim()).filter(Boolean)
    : [];

  if (metadata.kind === "service" && !capabilities.includes("service")) {
    warnings.push("Service apps should declare capabilities = service");
  }

  return {
    ok: errors.length === 0,
    appDir,
    appName: metadata.name || basename(appDir),
    metadata,
    capabilities,
    errors,
    warnings,
    relativeEntry: metadata.entry ? relative(appDir, join(appDir, metadata.entry)) : ""
  };
}
```

- [ ] **Step 2: Create validator fixtures**

Create `tools/app-validator/fixtures/valid-basic/app.info`:

```ini
name = Timer
entry = main.lua
description = Simple timer
capabilities = lvgl,timer
```

Create `tools/app-validator/fixtures/valid-basic/main.lua`:

```lua
print("timer")
```

Create `tools/app-validator/fixtures/missing-entry/app.info`:

```ini
name = Broken
entry = missing.lua
description = Missing entry file
```

- [ ] **Step 3: Create `tools/app-validator/test.mjs`**

```js
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
```

- [ ] **Step 4: Create `tools/app-validator/cli.mjs`**

```js
#!/usr/bin/env node
import { validateAppDirectory } from "./index.mjs";

const appDirs = process.argv.slice(2);

if (appDirs.length === 0) {
  console.error("Usage: node tools/app-validator/cli.mjs <app-dir> [app-dir...]");
  process.exit(2);
}

let failed = false;

for (const appDir of appDirs) {
  const result = validateAppDirectory(appDir);
  if (result.ok) {
    console.log(`ok ${appDir} (${result.appName})`);
    for (const warning of result.warnings) {
      console.log(`warn ${appDir}: ${warning}`);
    }
  } else {
    failed = true;
    console.error(`fail ${appDir}`);
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
  }
}

process.exit(failed ? 1 : 0);
```

- [ ] **Step 5: Create `docs/app-package-format.md`**

````markdown
# App Package Format

Each app is a directory containing `app.info` and an entry Lua file.

Minimal `app.info`:

```ini
name = Timer
entry = main.lua
description = Simple countdown timer
capabilities = lvgl,timer
```

Required fields:

- `name`: launcher display name.
- `entry`: Lua file inside the app directory.
- `description`: short summary.

Optional fields:

- `capabilities`: comma-separated runtime capabilities such as `lvgl`, `timer`, `network`, `audio`, `file`, `module`, or `service`.
- `kind`: app kind. `service` is reserved for background service-style apps.

Package validation rejects missing metadata, missing entry files, and entry paths outside the app directory.
````

- [ ] **Step 6: Run validator tests**

Run:

```bash
npm run test:validator
```

Expected: all `node:test` tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/app-validator docs/app-package-format.md package.json
git commit -m "feat: add app package validator"
```

## Task 4: Curated Demo App And Module Paths

**Files:**
- Create: `apps/weather/**`
- Create: `apps/voice_ai/**`
- Create: `apps/nesgame/**`
- Create: `modules/nes/**`
- Modify: `NOTICE.md`
- Create: `web-console/README.md`

- [ ] **Step 1: Copy curated app directories**

Run:

```bash
mkdir -p apps modules
cp -R upstream/holocubic-apps/weather apps/weather
cp -R upstream/holocubic-apps/voice_ai apps/voice_ai
cp -R upstream/holocubic-apps/nesgame apps/nesgame
cp -R upstream/holocubic-nes-esp32 modules/nes
```

Expected:

```bash
test -f apps/weather/app.info
test -f apps/voice_ai/app.info
test -f apps/nesgame/app.info
test -f modules/nes/README.md
```

- [ ] **Step 2: Validate curated apps**

Run:

```bash
npm run validate:apps
```

Expected:

```text
ok apps/weather (...)
ok apps/voice_ai (...)
ok apps/nesgame (...)
```

- [ ] **Step 3: Create `web-console/README.md`**

````markdown
# Web Console

This directory is reserved for the future browser-facing upload and validation UI.

Phase 1 does not implement the web console. The first usable loop is:

```text
generate app package
  -> run app validator
  -> copy files to device storage manually or through an available runtime upload endpoint
```
````

- [ ] **Step 4: Update `NOTICE.md` if copy paths changed**

Ensure `NOTICE.md` contains these rows:

```markdown
| `apps/weather/` | `upstream/holocubic-apps/weather/` |
| `apps/voice_ai/` | `upstream/holocubic-apps/voice_ai/` |
| `apps/nesgame/` | `upstream/holocubic-apps/nesgame/` |
| `modules/nes/` | `upstream/holocubic-nes-esp32/` |
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps modules web-console NOTICE.md
git commit -m "feat: curate first runtime demo apps"
```

## Task 5: AI Generation Contract Tests And Docs

**Files:**
- Create: `docs/ai-generation-contract.md`
- Create: `scripts/test-ai-contract.mjs`
- Modify: `README.md`

- [ ] **Step 1: Create `docs/ai-generation-contract.md`**

````markdown
# AI Generation Contract

The AI generator must output a package plan before files.

```json
{
  "app": {
    "name": "Timer",
    "entry": "main.lua",
    "description": "Simple countdown timer",
    "capabilities": ["lvgl", "timer"]
  },
  "files": [
    {
      "path": "app.info",
      "type": "text",
      "content": "name = Timer\nentry = main.lua\ndescription = Simple countdown timer\ncapabilities = lvgl,timer\n"
    },
    {
      "path": "main.lua",
      "type": "lua",
      "content": "print(\"timer\")\n"
    }
  ]
}
```

Prefer Lua/LVGL app generation when the request is for:

- small-screen UI;
- dashboard or status card;
- simple tool;
- simple game;
- AI widget;
- network card using existing runtime APIs.

Return `Runtime update required` when the request needs:

- driver changes;
- pin-map changes;
- BLE service changes;
- partition or sdkconfig changes;
- LVGL bindings not exposed by the runtime;
- native module ABI changes.
````

- [ ] **Step 2: Create `scripts/test-ai-contract.mjs`**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const doc = readFileSync(join(root, "docs/ai-generation-contract.md"), "utf8");

for (const required of [
  "\"app\"",
  "\"files\"",
  "capabilities",
  "Prefer Lua/LVGL app generation",
  "Runtime update required"
]) {
  assert.match(doc, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
```

- [ ] **Step 3: Add README link**

Add this under `Validate` in `README.md`:

```markdown
## AI App Generation

See [docs/ai-generation-contract.md](docs/ai-generation-contract.md) for the package-plan format and fallback rules.
```

- [ ] **Step 4: Run contract test**

Run:

```bash
npm run test:ai-contract
```

Expected: exits 0.

- [ ] **Step 5: Run full tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add docs/ai-generation-contract.md scripts/test-ai-contract.mjs README.md package.json
git commit -m "docs: define AI app generation contract"
```

## Task 6: Final Verification And Handoff Notes

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment-flow.md` if test/usage commands changed.

- [ ] **Step 1: Run all verification**

Run:

```bash
npm test
npm run validate:apps
git diff --check
git status --short
```

Expected:

- `npm test` exits 0.
- `npm run validate:apps` validates `weather`, `voice_ai`, and `nesgame`.
- `git diff --check` has no output.
- `git status --short` shows no uncommitted changes after final commit.

- [ ] **Step 2: Confirm phase boundary in README**

Ensure `README.md` says:

```markdown
Phase 1 does not build a complete ESP32 runtime firmware. It organizes the GPL runtime project, imports upstream source, validates app packages, and documents the deployment path.
```

- [ ] **Step 3: Commit any final doc correction**

If Step 2 required a README edit:

```bash
git add README.md docs/deployment-flow.md
git commit -m "docs: clarify phase one runtime boundary"
```

- [ ] **Step 4: Report completion**

Report:

- final commit SHA;
- tests run and results;
- imported upstream paths;
- curated app paths;
- explicit note that `/Users/wq/VibeBoard` was not modified with GPL source.

## Self-Review

Spec coverage:

- GPL project separation is covered by Task 1 and Task 6.
- Upstream source absorption is covered by Task 2.
- Curated `weather`, `voice_ai`, `nesgame`, and NES module paths are covered by Task 4.
- App package validation is covered by Task 3.
- AI generation contract is covered by Task 5.
- Deployment and runtime boundaries are covered by Task 1 and Task 6.

Placeholder scan:

- No implementation task uses TBD/TODO placeholder text.
- The `web-console/README.md` note is an explicit non-implemented phase boundary from the approved spec.

Type consistency:

- The validator exports `parseAppInfo` and `validateAppDirectory`; tests and CLI use those exact names.
- Package scripts reference created files and commands.
