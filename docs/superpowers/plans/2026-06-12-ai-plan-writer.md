# AI Plan Writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local tool that writes an AI package plan JSON file into a validated app directory and can optionally package it for device-storage deployment.

**Architecture:** Add a focused `tools/app-plan-writer/` module with a library, CLI, and tests. Reuse `validateAppDirectory` and `slugifyAppId` so generated app directories follow the same rules as curated apps and packaged apps.

**Tech Stack:** Node.js ESM, `node:test`, existing validator and packager modules.

---

## File Structure

- Create `tools/app-plan-writer/index.mjs`: plan validation, safe file writing, app validation, optional packaging.
- Create `tools/app-plan-writer/cli.mjs`: command-line wrapper for JSON files.
- Create `tools/app-plan-writer/test.mjs`: red-green coverage for writer behavior.
- Modify `package.json`: add `test:plan-writer` and `write:app-plan`.
- Modify `.gitignore`: ignore `generated/`.
- Modify `README.md`, `docs/ai-generation-contract.md`, and `docs/development-plan.md`: document the new command and current phase status.

## Task 1: Plan Writer Core

**Files:**

- Create: `tools/app-plan-writer/test.mjs`
- Create: `tools/app-plan-writer/index.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing tests**

Create `tools/app-plan-writer/test.mjs` with tests for:

- valid plan writes `app.info` and `main.lua`;
- omitted `app.info` is generated from metadata;
- invalid traversal path is rejected;
- missing entry file is rejected;
- `packageOutput: true` calls the packager and creates `dist/apps/<app-id>/manifest.json`.

- [ ] **Step 2: Verify red**

Run:

```bash
npm run test:plan-writer
```

Expected: fails because the script/module does not exist yet.

- [ ] **Step 3: Implement core**

Create `tools/app-plan-writer/index.mjs` exporting:

- `writeAppPlan({ repoRoot, planPath, outputRoot, packageOutput })`
- `writeAppPlanObject({ repoRoot, plan, outputRoot, packageOutput })`

The implementation must safely write files, generate `app.info`, validate the app, and optionally call `packageApp`.

- [ ] **Step 4: Add npm scripts**

Add:

```json
"test:plan-writer": "node --test tools/app-plan-writer/test.mjs"
```

and include it in `npm test`.

- [ ] **Step 5: Verify green**

Run:

```bash
npm run test:plan-writer
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json tools/app-plan-writer/index.mjs tools/app-plan-writer/test.mjs
git commit -m "feat: add AI app plan writer"
```

## Task 2: CLI and Documentation

**Files:**

- Create: `tools/app-plan-writer/cli.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/ai-generation-contract.md`
- Modify: `docs/development-plan.md`

- [ ] **Step 1: Write CLI**

Create `tools/app-plan-writer/cli.mjs` that accepts:

```bash
npm run write:app-plan -- <plan.json>
npm run write:app-plan -- <plan.json> --package
```

It should print the generated app path and package path when present.

- [ ] **Step 2: Add npm script**

Add:

```json
"write:app-plan": "node tools/app-plan-writer/cli.mjs"
```

- [ ] **Step 3: Document usage**

Update README and docs to explain:

- AI produces JSON package plan;
- writer turns it into `generated/apps/<app-id>/`;
- validator checks the result;
- optional packager writes `dist/apps/<app-id>/`;
- still no firmware flashing or device upload.

- [ ] **Step 4: Verify command path**

Create a temporary sample plan in `/tmp`, then run:

```bash
npm run write:app-plan -- /tmp/vibeboard-timer-plan.json --package
```

Expected: command prints generated and packaged paths.

- [ ] **Step 5: Final verification**

Run:

```bash
npm test
npm run validate:apps
npm run package:demos
git diff --check
git status --short
```

Expected: tests pass, generated package commands pass, and only intended tracked files are modified before commit.

- [ ] **Step 6: Commit**

```bash
git add package.json README.md docs/ai-generation-contract.md docs/development-plan.md tools/app-plan-writer/cli.mjs
git commit -m "docs: document AI app plan writer"
```
