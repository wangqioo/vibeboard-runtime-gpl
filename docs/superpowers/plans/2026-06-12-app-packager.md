# App Packager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local app deployment packager that validates an app directory and writes a deterministic `dist/apps/<app-id>/` package with manifest and install notes.

**Architecture:** Add a focused `tools/app-packager/` module that reuses `tools/app-validator/index.mjs` before copying files. Keep packaging logic in `index.mjs`, command wrappers in `cli.mjs` and `package-demos.mjs`, and generated output under git-ignored `dist/`.

**Tech Stack:** Node.js ESM, built-in `node:test`, built-in `fs`, `path`, and `crypto`.

---

## File Structure

- Create: `tools/app-packager/index.mjs`
- Create: `tools/app-packager/cli.mjs`
- Create: `tools/app-packager/package-demos.mjs`
- Create: `tools/app-packager/test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `docs/development-plan.md`
- Modify: `docs/deployment-flow.md`

## Task 1: Packager Core

**Files:**
- Create: `tools/app-packager/index.mjs`
- Create: `tools/app-packager/test.mjs`
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Update `.gitignore`**

Add:

```gitignore
dist/
```

- [ ] **Step 2: Add `test:packager` script**

In `package.json`, update scripts:

```json
"test": "npm run test:validator && npm run test:upstream-map && npm run test:ai-contract && npm run test:packager",
"test:packager": "node --test tools/app-packager/test.mjs"
```

Keep the existing scripts unchanged.

- [ ] **Step 3: Create failing tests in `tools/app-packager/test.mjs`**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  packageApp,
  packageDemoApps,
  slugifyAppId
} from "./index.mjs";

function makeTempRepo() {
  return mkdtempSync(join(tmpdir(), "vibeboard-packager-"));
}

function writeApp(root, appPath, appInfo, mainLua = "print('ok')\n") {
  const fullPath = join(root, appPath);
  mkdirSync(fullPath, { recursive: true });
  writeFileSync(join(fullPath, "app.info"), appInfo);
  writeFileSync(join(fullPath, "main.lua"), mainLua);
  return fullPath;
}

describe("slugifyAppId", () => {
  it("normalizes app ids", () => {
    assert.equal(slugifyAppId("Weather Card"), "weather-card");
    assert.equal(slugifyAppId("voice_ai"), "voice_ai");
    assert.throws(() => slugifyAppId("!!!"), /empty app id/i);
  });
});

describe("packageApp", () => {
  it("creates a package manifest and install notes", () => {
    const root = makeTempRepo();
    try {
      writeApp(
        root,
        "apps/weather",
        "name = weather\nentry = main.lua\ndescription = Weather card\ncapabilities = network\n",
        "http.get('https://example.com', {}, function() end)\n"
      );

      const result = packageApp({
        repoRoot: root,
        appDir: join(root, "apps/weather")
      });

      assert.equal(result.appId, "weather");
      const manifest = JSON.parse(readFileSync(join(result.outputPath, "manifest.json"), "utf8"));
      assert.equal(manifest.schema, "vibeboard-runtime-app-package@1");
      assert.equal(manifest.appId, "weather");
      assert.equal(manifest.name, "weather");
      assert.deepEqual(manifest.capabilities, ["network"]);
      assert.equal(manifest.install.sdPath, "/sd/apps/weather");
      assert.ok(manifest.files.some((file) => file.path === "app.info" && file.sha256));
      assert.ok(manifest.files.some((file) => file.path === "install-notes.txt"));

      const notes = readFileSync(join(result.outputPath, "install-notes.txt"), "utf8");
      assert.match(notes, /Copy all files/);
      assert.match(notes, /does not flash firmware/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not write output when validation fails", () => {
    const root = makeTempRepo();
    try {
      writeApp(root, "apps/broken", "name = broken\nentry = missing.lua\ndescription = Broken\n");
      assert.throws(
        () => packageApp({ repoRoot: root, appDir: join(root, "apps/broken") }),
        /Entry file does not exist/
      );
      assert.throws(() => readFileSync(join(root, "dist/apps/broken/manifest.json")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects app directories outside the repo root", () => {
    const root = makeTempRepo();
    const outside = makeTempRepo();
    try {
      writeApp(outside, "app", "name = outside\nentry = main.lua\ndescription = Outside\n");
      assert.throws(
        () => packageApp({ repoRoot: root, appDir: join(outside, "app") }),
        /inside the repository/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("skips symlinked files inside the app package", () => {
    const root = makeTempRepo();
    try {
      const appPath = writeApp(root, "apps/links", "name = links\nentry = main.lua\ndescription = Links\n");
      writeFileSync(join(root, "secret.txt"), "secret");
      try {
        symlinkSync(join(root, "secret.txt"), join(appPath, "secret-link.txt"));
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return;
        throw error;
      }

      const result = packageApp({ repoRoot: root, appDir: appPath });
      const manifest = JSON.parse(readFileSync(join(result.outputPath, "manifest.json"), "utf8"));
      assert.equal(manifest.files.some((file) => file.path === "secret-link.txt"), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("packageDemoApps", () => {
  it("packages the three demo apps", () => {
    const repoRoot = new URL("../..", import.meta.url).pathname;
    const result = packageDemoApps({ repoRoot });
    assert.deepEqual(result.map((item) => item.appId).sort(), ["nesgame", "voice_ai", "weather"]);
  });
});
```

- [ ] **Step 4: Run failing tests**

Run:

```bash
npm run test:packager
```

Expected: fails because `tools/app-packager/index.mjs` does not exist or exports are missing.

- [ ] **Step 5: Implement `tools/app-packager/index.mjs`**

```js
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";
import { validateAppDirectory } from "../app-validator/index.mjs";

export const DEMO_APP_DIRS = ["apps/weather", "apps/voice_ai", "apps/nesgame"];
export const PACKAGE_SCHEMA = "vibeboard-runtime-app-package@1";

const SKIP_NAMES = new Set([".DS_Store", "manifest.json"]);
const SKIP_DIRS = new Set([".cache", "tmp", "dist"]);

export function slugifyAppId(input) {
  const slug = String(input)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    throw new Error("Empty app id after slug normalization");
  }

  return slug;
}

function assertInsideRepo(repoRoot, targetPath) {
  const resolvedRoot = realpathSync(repoRoot);
  const resolvedTarget = realpathSync(targetPath);
  const rel = relative(resolvedRoot, resolvedTarget);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`App directory must be inside the repository: ${targetPath}`);
  }
  return { resolvedRoot, resolvedTarget };
}

function shouldSkipSource(path, direntName) {
  if (SKIP_NAMES.has(direntName)) return true;
  if (SKIP_DIRS.has(direntName)) return true;
  return false;
}

function copyAppFiles(sourceDir, outputDir) {
  const resolvedSource = realpathSync(sourceDir);

  function copyRecursive(currentSource, currentOutput) {
    mkdirSync(currentOutput, { recursive: true });

    for (const dirent of readdirSync(currentSource, { withFileTypes: true })) {
      if (shouldSkipSource(currentSource, dirent.name)) continue;

      const sourcePath = join(currentSource, dirent.name);
      const outputPath = join(currentOutput, dirent.name);

      if (dirent.isSymbolicLink()) {
        const resolvedLink = realpathSync(sourcePath);
        const rel = relative(resolvedSource, resolvedLink);
        if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
          continue;
        }
        continue;
      }

      if (dirent.isDirectory()) {
        copyRecursive(sourcePath, outputPath);
      } else if (dirent.isFile()) {
        cpSync(sourcePath, outputPath);
      }
    }
  }

  copyRecursive(sourceDir, outputDir);
}

function listFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    for (const dirent of readdirSync(currentDir, { withFileTypes: true })) {
      if (dirent.name === "manifest.json") continue;
      const fullPath = join(currentDir, dirent.name);
      if (dirent.isDirectory()) {
        walk(fullPath);
      } else if (dirent.isFile()) {
        const relPath = relative(rootDir, fullPath).split(sep).join("/");
        const content = readFileSync(fullPath);
        files.push({
          path: relPath,
          size: statSync(fullPath).size,
          sha256: createHash("sha256").update(content).digest("hex")
        });
      }
    }
  }

  walk(rootDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function writeInstallNotes(outputDir, metadata, appId) {
  const notes = [
    "VibeBoard Runtime App Package",
    "",
    `App: ${metadata.name || appId}`,
    `Install path: /sd/apps/${appId}`,
    "",
    `Copy all files in this directory to /sd/apps/${appId} on the device storage.`,
    "This package does not flash firmware.",
    ""
  ].join("\n");
  writeFileSync(join(outputDir, "install-notes.txt"), notes);
}

export function packageApp({ repoRoot = process.cwd(), appDir }) {
  if (!appDir) throw new Error("appDir is required");
  if (!existsSync(appDir)) throw new Error(`App directory does not exist: ${appDir}`);

  const absoluteRepoRoot = resolve(repoRoot);
  const absoluteAppDir = resolve(appDir);
  assertInsideRepo(absoluteRepoRoot, absoluteAppDir);

  const validation = validateAppDirectory(absoluteAppDir);
  if (!validation.ok) {
    throw new Error(`App validation failed for ${appDir}: ${validation.errors.join("; ")}`);
  }

  const appId = slugifyAppId(basename(absoluteAppDir));
  const outputPath = join(absoluteRepoRoot, "dist/apps", appId);
  const tmpPath = join(absoluteRepoRoot, "dist/.tmp", `${appId}-${Date.now()}`);

  rmSync(tmpPath, { recursive: true, force: true });
  mkdirSync(dirname(tmpPath), { recursive: true });
  copyAppFiles(absoluteAppDir, tmpPath);
  writeInstallNotes(tmpPath, validation.metadata, appId);

  const manifest = {
    schema: PACKAGE_SCHEMA,
    appId,
    sourcePath: relative(absoluteRepoRoot, absoluteAppDir).split(sep).join("/"),
    outputPath: relative(absoluteRepoRoot, outputPath).split(sep).join("/"),
    name: validation.metadata.name,
    entry: validation.metadata.entry,
    description: validation.metadata.description,
    capabilities: validation.capabilities,
    files: listFiles(tmpPath),
    install: {
      sdPath: `/sd/apps/${appId}`,
      copy: `Copy the contents of this directory to /sd/apps/${appId} on the device storage.`
    }
  };

  writeFileSync(join(tmpPath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  rmSync(outputPath, { recursive: true, force: true });
  mkdirSync(dirname(outputPath), { recursive: true });
  renameSync(tmpPath, outputPath);

  return { appId, outputPath, manifest };
}

export function packageDemoApps({ repoRoot = process.cwd() } = {}) {
  return DEMO_APP_DIRS.map((appDir) =>
    packageApp({ repoRoot, appDir: join(repoRoot, appDir) })
  );
}
```

- [ ] **Step 6: Run packager tests**

Run:

```bash
npm run test:packager
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json tools/app-packager/index.mjs tools/app-packager/test.mjs
git commit -m "feat: add app packager core"
```

## Task 2: CLI And Demo Packaging

**Files:**
- Create: `tools/app-packager/cli.mjs`
- Create: `tools/app-packager/package-demos.mjs`

- [ ] **Step 1: Create `tools/app-packager/cli.mjs`**

```js
#!/usr/bin/env node
import { resolve } from "node:path";
import { packageApp } from "./index.mjs";

const appDir = process.argv[2];

if (!appDir) {
  console.error("Usage: node tools/app-packager/cli.mjs <app-dir>");
  process.exit(2);
}

try {
  const result = packageApp({
    repoRoot: process.cwd(),
    appDir: resolve(appDir)
  });
  console.log(`packaged ${result.appId} -> ${result.outputPath}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
```

- [ ] **Step 2: Create `tools/app-packager/package-demos.mjs`**

```js
#!/usr/bin/env node
import { packageDemoApps } from "./index.mjs";

try {
  const results = packageDemoApps({ repoRoot: process.cwd() });
  for (const result of results) {
    console.log(`packaged ${result.appId} -> ${result.outputPath}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
```

- [ ] **Step 3: Add npm scripts**

If not already added in Task 1, add:

```json
"package:app": "node tools/app-packager/cli.mjs",
"package:demos": "node tools/app-packager/package-demos.mjs"
```

- [ ] **Step 4: Verify commands**

Run:

```bash
npm run package:app -- apps/weather
npm run package:demos
npm test
```

Expected: commands pass and create:

```text
dist/apps/weather/manifest.json
dist/apps/voice_ai/manifest.json
dist/apps/nesgame/manifest.json
```

- [ ] **Step 5: Commit**

```bash
git add package.json tools/app-packager/cli.mjs tools/app-packager/package-demos.mjs
git commit -m "feat: add app packager CLI"
```

## Task 3: Documentation And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/development-plan.md`
- Modify: `docs/deployment-flow.md`

- [ ] **Step 1: Update `README.md`**

Add:

````markdown
## Package Apps

```bash
npm run package:app -- apps/weather
npm run package:demos
```

Packages are written to `dist/apps/<app-id>/`. The generated directory can be copied to the matching `/sd/apps/<app-id>` path on compatible device storage.
````

- [ ] **Step 2: Update `docs/deployment-flow.md`**

Add the packager into the manual baseline:

````markdown
Prepare a package:

```bash
npm run package:app -- apps/weather
```

Copy the generated `dist/apps/weather/` contents to:

```text
/sd/apps/weather/
```
````

- [ ] **Step 3: Update `docs/development-plan.md`**

Add a short Phase 2A note:

```markdown
### Phase 2A：App 部署包生成器

已完成后，`npm run package:demos` 会把 curated demo 输出到 `dist/apps/`，并生成 `manifest.json` 和 `install-notes.txt`。这仍然是文件级打包，不上传设备、不烧录固件。
```

- [ ] **Step 4: Final verification**

Run:

```bash
npm run test:packager
npm run package:demos
npm test
npm run validate:apps
git diff --check
git status --short
```

Expected:

- all commands exit 0;
- `git status --short` shows only tracked doc changes before commit and no unexpected generated `dist/` files because `dist/` is ignored.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/development-plan.md docs/deployment-flow.md
git commit -m "docs: document app packaging flow"
```

## Self-Review

Spec coverage:

- Commands are covered by Tasks 1 and 2.
- Manifest and install notes are covered by Task 1.
- Demo packaging is covered by Task 2.
- Documentation updates are covered by Task 3.
- Success criteria are covered by Task 3 final verification.

Placeholder scan:

- No TBD/TODO placeholders are present.
- "later" appears only as a non-goal in the design spec, not in this implementation plan.

Type consistency:

- `packageApp`, `packageDemoApps`, and `slugifyAppId` are defined in Task 1 and reused by CLI/tests.
- npm scripts reference files created in Tasks 1 and 2.
