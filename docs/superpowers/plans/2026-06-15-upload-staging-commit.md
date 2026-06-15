# Upload Staging Commit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `upload:app` stage files outside `/sdcard/apps` and commit only complete packages.

**Architecture:** Keep `/install` as direct compatibility mode. Add `/stage`, `/commit`, and `/discard` to `install_service.c`; staged files live under `/sdcard/.staging/<app-id>`, and commit validates `app.info` plus the entry file before rename-based replacement. The host uploader defaults to staged mode and exposes `--mode direct` for the old behavior.

**Tech Stack:** Node.js `node:test` for host tooling, ESP-IDF C firmware, static firmware guardrail tests, Git documentation.

---

## File Structure

- Modify `tools/app-uploader/test.mjs`: add failing tests for staged default behavior, direct mode, cleanup on staged failure, and CLI mode parsing.
- Modify `tools/app-uploader/index.mjs`: add staged upload flow helpers while preserving direct upload behavior.
- Modify `tools/app-uploader/cli.mjs`: parse `--mode staged|direct`, default to `staged`, and pass mode to `uploadApp`.
- Modify `tools/firmware-static-check/test.mjs`: assert staged endpoint registration and commit safety patterns.
- Modify `firmware/vibeboard_runtime/main/install_service.c`: add staging root, generic parent directory creation, staged write, discard, commit validation, and rename replacement.
- Modify `docs/app-package-format.md`, `docs/deployment-flow.md`, `docs/runtime-capabilities.md`, `docs/next-session-plan.md`, and `docs/device-bringup.md`: document staged deployment and verification evidence.

## Task 1: Host Uploader Tests

**Files:**
- Modify: `tools/app-uploader/test.mjs`

- [ ] **Step 1: Write failing staged default tests**

Add tests under `describe("uploadApp", ...)`:

```js
  it("stages files by default before commit", async () => {
    const { root, appDir } = makePackage();
    const calls = [];
    try {
      const result = await uploadApp({
        appDir,
        appId: "demo",
        boardUrl: "http://192.168.1.32:8080/",
        requestImpl: async (url, body, options = {}) => {
          calls.push({ url, method: options.method, body: body ? body.toString("utf8") : "" });
          if (url.endsWith("/apps")) return { ok: true, status: 200, text: '{"apps":[{"id":"demo"}]}' };
          return { ok: true, status: 200, text: '{"ok":true,"app_count":1}' };
        },
      });

      assert.equal(result.mode, "staged");
      assert.equal(result.files.length, 3);
      assert.equal(result.confirmed, true);
      assert.equal(calls[0].url, "http://192.168.1.32:8080/discard?app=demo");
      assert.equal(calls[0].method, "POST");
      assert.equal(calls[1].url, "http://192.168.1.32:8080/stage?app=demo&path=app.info");
      assert.match(calls[1].body, /name = demo/);
      assert.ok(calls.some((call) => call.url.endsWith("/commit?app=demo") && call.method === "POST"));
      assert.ok(calls.some((call) => call.url === "http://192.168.1.32:8080/apps" && call.method === "GET"));
      assert.equal(calls.some((call) => call.url.includes("/install?")), false);
      assert.equal(calls.some((call) => call.url.endsWith("/rescan")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Convert old direct endpoint test to explicit direct mode**

Change the old `"posts each file to the board install endpoint"` test to pass `mode: "direct"` and assert `result.mode === "direct"`. Keep its `/install`, `/rescan`, and `/apps` expectations.

- [ ] **Step 3: Add staged failure cleanup test**

Add this test:

```js
  it("best-effort discards staging after a staged upload failure", async () => {
    const { root, appDir } = makePackage();
    const calls = [];
    try {
      await assert.rejects(
        uploadApp({
          appDir,
          appId: "demo",
          boardUrl: "http://192.168.1.32:8080",
          retryAttempts: 1,
          requestImpl: async (url, body, options = {}) => {
            calls.push({ url, method: options.method });
            if (url.includes("/stage?") && url.endsWith("path=app.info")) {
              return { ok: false, status: 500, text: "write failed" };
            }
            return { ok: true, status: 200, text: '{"ok":true}' };
          },
        }),
        /500 write failed/,
      );
      assert.equal(calls[0].url, "http://192.168.1.32:8080/discard?app=demo");
      assert.equal(calls.at(-1).url, "http://192.168.1.32:8080/discard?app=demo");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 4: Add CLI mode parsing tests**

Update `parseUploadCliArgs` expectations to include `mode: "staged"` by default, and add:

```js
  it("keeps direct upload mode as an explicit compatibility path", () => {
    assert.deepEqual(
      parseUploadCliArgs(["--mode", "direct", "http://192.168.1.32:8080", "dist/apps/demo", "demo"]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appDir: "dist/apps/demo",
        appId: "demo",
        transport: "native",
        mode: "direct",
      },
    );
    assert.equal(
      parseUploadCliArgs(["--mode=direct", "http://192.168.1.32:8080", "dist/apps/demo"]).mode,
      "direct",
    );
  });

  it("rejects unknown upload modes", () => {
    assert.throws(
      () => parseUploadCliArgs(["--mode", "raw", "http://192.168.1.32:8080", "dist/apps/demo"]),
      /Unsupported upload mode: raw/,
    );
  });
```

- [ ] **Step 5: Run host uploader tests and verify RED**

Run:

```bash
npm run test:uploader
```

Expected: fails because `mode`, `/stage`, `/commit`, and `/discard` are not implemented yet.

## Task 2: Host Uploader Implementation

**Files:**
- Modify: `tools/app-uploader/index.mjs`
- Modify: `tools/app-uploader/cli.mjs`
- Test: `tools/app-uploader/test.mjs`

- [ ] **Step 1: Add staged/direct helpers**

In `tools/app-uploader/index.mjs`, add small helpers:

```js
function buildUploadUrls(base, appId, relativePath, mode) {
  if (mode === "direct") {
    return { file: `${base}/install?app=${encodeURIComponent(appId)}&path=${encodePath(relativePath)}` };
  }
  return { file: `${base}/stage?app=${encodeURIComponent(appId)}&path=${encodePath(relativePath)}` };
}

async function postEmpty({ url, fetchImpl, requestImpl, retryAttempts, retryDelayMs, label }) {
  return sendBoardRequest({
    url,
    body: Buffer.alloc(0),
    method: "POST",
    fetchImpl,
    requestImpl,
    retryAttempts,
    retryDelayMs,
    label,
  });
}
```

- [ ] **Step 2: Make `uploadApp` default to staged mode**

Update the function signature with `mode = "staged"`. Reject unknown modes with:

```js
  if (!["staged", "direct"].includes(mode)) {
    throw new Error(`Unsupported upload mode: ${mode || "(empty)"}`);
  }
```

For direct mode, keep the old flow: upload files to `/install`, call `/rescan`, then call `/apps`.

For staged mode, implement:

```js
  let stagedStarted = false;
  try {
    await postEmpty({ url: `${base}/discard?app=${encodeURIComponent(appId)}`, fetchImpl, requestImpl, retryAttempts, retryDelayMs, label: "Discard staging" });
    stagedStarted = true;
    for (const file of files) {
      const url = buildUploadUrls(base, appId, file.relativePath, mode).file;
      const body = readFileSync(file.fullPath);
      await sendBoardRequest({ url, body, method: "POST", fetchImpl, requestImpl, retryAttempts, retryDelayMs, label: `Stage ${file.relativePath}` });
    }
    await postEmpty({ url: `${base}/commit?app=${encodeURIComponent(appId)}`, fetchImpl, requestImpl, retryAttempts, retryDelayMs, label: "Commit staging" });
  } catch (error) {
    if (stagedStarted) {
      try {
        await postEmpty({ url: `${base}/discard?app=${encodeURIComponent(appId)}`, fetchImpl, requestImpl, retryAttempts: 1, retryDelayMs: 0, label: "Discard staging after failure" });
      } catch {
        // Preserve the original upload failure.
      }
    }
    throw error;
  }
```

Return `{ appId, files, confirmed: confirm, apps, mode }`.

- [ ] **Step 3: Parse `--mode` in the CLI**

Update `usage()`:

```js
Usage: node tools/app-uploader/cli.mjs [--transport native|nc] [--mode staged|direct] <board-url> <dist-app-dir> [app-id]
```

In `parseUploadCliArgs`, support `--mode value` and `--mode=value`, default `mode = "staged"`, reject values outside `staged` and `direct`, and return `{ boardUrl, appDir, appId, transport, mode }`.

Pass `mode: options.mode` into `uploadApp`.

- [ ] **Step 4: Run host uploader tests and verify GREEN**

Run:

```bash
npm run test:uploader
```

Expected: all uploader tests pass.

- [ ] **Step 5: Commit host uploader changes**

Run:

```bash
git add tools/app-uploader/index.mjs tools/app-uploader/cli.mjs tools/app-uploader/test.mjs
git commit -m "feat: stage app uploads by default"
```

## Task 3: Firmware Static RED

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add staged endpoint guardrails**

In the `"starts a sandboxed HTTP install service for SD app uploads"` test, add assertions:

```js
    assert.match(source, /VB_STAGING_PATH\s+"\/sdcard\/\.staging"/);
    assert.match(source, /stage_handler/);
    assert.match(source, /commit_handler/);
    assert.match(source, /discard_handler/);
    assert.match(source, /\/stage/);
    assert.match(source, /\/commit/);
    assert.match(source, /\/discard/);
    assert.match(source, /HTTP_POST,\s*stage_handler/);
    assert.match(source, /HTTP_POST,\s*commit_handler/);
    assert.match(source, /HTTP_POST,\s*discard_handler/);
    assert.match(source, /validate_staged_app/);
    assert.match(source, /app\.info/);
    assert.match(source, /main\.lua/);
    assert.match(source, /rename\(backup_dir,\s*app_dir\)/);
    assert.match(source, /rename\(staging_dir,\s*app_dir\)/);
    assert.match(source, /\\"committed\\":\\"%s\\"/);
```

- [ ] **Step 2: Run static firmware tests and verify RED**

Run:

```bash
npm run test:firmware-static
```

Expected: fails because the staged firmware endpoints are not implemented.

## Task 4: Firmware Implementation

**Files:**
- Modify: `firmware/vibeboard_runtime/main/install_service.c`
- Test: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Add staging path constants and generic directory creation**

Near the existing stack size define:

```c
#define VB_STAGING_PATH "/sdcard/.staging"
#define VB_STAGING_BACKUP_SUFFIX ".previous"
```

Replace `ensure_parent_dirs` with a helper that accepts a base:

```c
static esp_err_t ensure_parent_dirs_from_base(const char *path, const char *base)
{
    char buffer[VB_APP_PATH_MAX];
    strlcpy(buffer, path, sizeof(buffer));

    size_t base_len = strlen(base);
    for (char *cursor = buffer + base_len + 1; *cursor != '\0'; cursor++) {
        if (*cursor != '/') {
            continue;
        }
        *cursor = '\0';
        esp_err_t err = mkdir_if_missing(buffer);
        *cursor = '/';
        if (err != ESP_OK) {
            return err;
        }
    }
    return ESP_OK;
}
```

Use `ensure_parent_dirs_from_base(full_path, VB_APPS_PATH)` in `/install`.

- [ ] **Step 2: Factor file receive into a shared helper**

Extract the body-writing part of `install_handler` into:

```c
static esp_err_t receive_request_file(httpd_req_t *req, const char *full_path)
```

It opens `full_path`, reads `req->content_len` with `httpd_req_recv`, writes with `fwrite`, and returns `ESP_OK` or `ESP_FAIL`. Keep the same error logging.

- [ ] **Step 3: Implement `stage_handler`**

Add:

```c
static esp_err_t stage_handler(httpd_req_t *req)
```

It validates `app` and `path`, ensures `VB_STAGING_PATH`, builds `/sdcard/.staging/<app>/<path>`, calls `ensure_parent_dirs_from_base(full_path, VB_STAGING_PATH)`, receives the file, and returns text `ok\n`.

- [ ] **Step 4: Implement staged app validation**

Add:

```c
static bool read_entry_from_info(const char *info_path, char *entry, size_t entry_size)
static esp_err_t validate_staged_app(const char *staging_dir)
```

`read_entry_from_info` scans lines for `entry = value`, trims whitespace, and defaults to `main.lua` when no entry is present. `validate_staged_app` requires `app.info`, rejects unsafe entry values, builds the entry path, and requires `stat(entry_path, &st) == 0 && !S_ISDIR(st.st_mode)`.

- [ ] **Step 5: Implement discard and commit**

Add:

```c
static esp_err_t remove_tree_if_exists(const char *path)
static esp_err_t discard_handler(httpd_req_t *req)
static esp_err_t commit_handler(httpd_req_t *req)
```

`discard_handler` validates `app`, builds `/sdcard/.staging/<app>`, removes it if it exists, and returns `{"ok":true,"discarded":"<id>"}`.

`commit_handler` validates `app`, rejects the currently running app with `409 Conflict`, builds `staging_dir`, `app_dir`, and `backup_dir`, validates staging, removes any old backup, renames the current app directory to backup if it exists, renames staging to app, restores backup if staging rename fails, rescans the registry, deletes backup after success, and returns `{"ok":true,"committed":"<id>","app_count":N}`.

- [ ] **Step 6: Register staged endpoints**

In `vb_install_service_start`, register:

```c
err = register_handler("/stage", HTTP_POST, stage_handler);
err = register_handler("/commit", HTTP_POST, commit_handler);
err = register_handler("/discard", HTTP_POST, discard_handler);
```

Place them near `/install`.

- [ ] **Step 7: Run static firmware tests and verify GREEN**

Run:

```bash
npm run test:firmware-static
```

Expected: all static firmware tests pass.

- [ ] **Step 8: Commit firmware changes**

Run:

```bash
git add firmware/vibeboard_runtime/main/install_service.c tools/firmware-static-check/test.mjs
git commit -m "feat: add staged app commit endpoints"
```

## Task 5: Documentation

**Files:**
- Modify: `docs/app-package-format.md`
- Modify: `docs/deployment-flow.md`
- Modify: `docs/runtime-capabilities.md`
- Modify: `docs/next-session-plan.md`

- [ ] **Step 1: Document staged endpoints**

Update `docs/app-package-format.md` App Deployment Service table to include `/stage`, `/commit`, and `/discard`. State that `upload:app` defaults to staged mode and `--mode direct` keeps the old `/install` path.

- [ ] **Step 2: Update deployment flow**

Update `docs/deployment-flow.md` so the runtime upload path is `discard -> stage files -> commit -> /apps confirm`. Remove stale limitations saying there is no staging/commit or delete endpoint.

- [ ] **Step 3: Update runtime capabilities**

Add rows for staged upload and Mac staged upload tool with `build-verified` until board verification is complete.

- [ ] **Step 4: Update next session plan**

Mark staging/commit as implemented in current work and leave browser UI plus formal WiFi entry as remaining deployment productization items.

- [ ] **Step 5: Commit docs**

Run:

```bash
git add docs/app-package-format.md docs/deployment-flow.md docs/runtime-capabilities.md docs/next-session-plan.md
git commit -m "docs: describe staged app deployment"
```

## Task 6: Full Verification And Board Smoke

**Files:**
- Modify after board verification: `docs/device-bringup.md`
- Modify after board verification: `docs/runtime-capabilities.md`

- [ ] **Step 1: Run full host tests**

Run:

```bash
npm test
```

Expected: all Node tests pass.

- [ ] **Step 2: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 3: Build firmware**

Run from `firmware/vibeboard_runtime`:

```bash
source /Users/wq/esp-idf/export.sh
export PATH=/Users/wq/.espressif/tools/xtensa-esp-elf/esp-14.2.0_20260121/xtensa-esp-elf/bin:$PATH
idf.py build
```

Expected: build exits 0.

- [ ] **Step 4: Flash board**

Run from `firmware/vibeboard_runtime`:

```bash
source /Users/wq/esp-idf/export.sh
export PATH=/Users/wq/.espressif/tools/xtensa-esp-elf/esp-14.2.0_20260121/xtensa-esp-elf/bin:$PATH
idf.py -p /dev/cu.usbmodem111301 flash
```

Expected: flash exits 0.

- [ ] **Step 5: Package and staged-upload a probe app**

Run:

```bash
npm run package:app -- apps/smoke_visual
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_stage_probe
curl -s http://192.168.1.32:8080/apps
```

Expected: uploader reports staged upload and `/apps` lists `smoke_stage_probe`.

- [ ] **Step 6: Launch, stop, and delete the probe app**

Run:

```bash
npm run launch:app -- http://192.168.1.32:8080 smoke_stage_probe
curl -s -X POST http://192.168.1.32:8080/stop
npm run delete:app -- http://192.168.1.32:8080 smoke_stage_probe
curl -s http://192.168.1.32:8080/apps
```

Expected: launch succeeds, stop reports stopped, delete succeeds, and `/apps` no longer lists `smoke_stage_probe`.

- [ ] **Step 7: Verify running-app commit rejection**

Run:

```bash
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_stage_running
npm run launch:app -- http://192.168.1.32:8080 smoke_stage_running
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_stage_running
curl -s -X POST http://192.168.1.32:8080/stop
npm run delete:app -- http://192.168.1.32:8080 smoke_stage_running
```

Expected: second upload fails with `409 app is running`, then stop/delete cleanup succeeds.

- [ ] **Step 8: Record board evidence**

Append a dated section to `docs/device-bringup.md` with the exact commands and relevant outputs. Upgrade staged upload rows in `docs/runtime-capabilities.md` to `board-verified`.

- [ ] **Step 9: Commit verification docs**

Run:

```bash
git add docs/device-bringup.md docs/runtime-capabilities.md
git commit -m "docs: record staged upload board verification"
```

- [ ] **Step 10: Push branch**

Run:

```bash
git push
```

Expected: branch updates on GitHub.

## Self-Review

- Spec coverage: The plan covers staged endpoints, commit validation, replacement semantics, host default staged mode, direct compatibility mode, tests, docs, build, flash, and board verification.
- Placeholder scan: No task uses placeholder language; code and commands are concrete.
- Type consistency: `mode`, `stage_handler`, `commit_handler`, `discard_handler`, `validate_staged_app`, `VB_STAGING_PATH`, and return JSON fields are named consistently across tasks.
