# App Delete/Uninstall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe board-side and host-side app deletion for uploaded SD apps.

**Architecture:** The install service owns app lifecycle HTTP endpoints, so deletion lives beside `/install`, `/apps`, `/rescan`, `/launch`, and `/stop`. The host helper mirrors the existing upload/launch helper shape and uses the same retry/request infrastructure.

**Tech Stack:** ESP-IDF HTTP server, C filesystem APIs on SD, Node.js test runner, native Node HTTP helper.

---

### Task 1: Host Delete Helper And CLI

**Files:**
- Modify: `tools/app-uploader/index.mjs`
- Create: `tools/app-uploader/delete.mjs`
- Modify: `tools/app-uploader/test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing Node tests**

Add tests to `tools/app-uploader/test.mjs`:

```js
import { parseDeleteCliArgs } from "./delete.mjs";
import { createNcRequest, deleteApp, launchApp, listUploadFiles, uploadApp } from "./index.mjs";

describe("parseDeleteCliArgs", () => {
  it("uses the native Node HTTP transport by default", () => {
    assert.deepEqual(
      parseDeleteCliArgs(["http://192.168.1.32:8080", "demo"]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appId: "demo",
        transport: "native",
      },
    );
  });

  it("keeps nc as an explicit delete fallback transport", () => {
    assert.deepEqual(
      parseDeleteCliArgs(["--transport=nc", "http://192.168.1.32:8080", "demo"]),
      {
        boardUrl: "http://192.168.1.32:8080",
        appId: "demo",
        transport: "nc",
      },
    );
  });
});

describe("deleteApp", () => {
  it("posts a delete request for an installed app", async () => {
    const calls = [];
    const result = await deleteApp({
      boardUrl: "http://192.168.1.32:8080/",
      appId: "demo",
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, method: options.method, body });
        return { ok: true, status: 200, text: '{"ok":true,"deleted":"demo","app_count":2}' };
      },
    });

    assert.deepEqual(result, { ok: true, deleted: "demo", app_count: 2 });
    assert.equal(calls[0].url, "http://192.168.1.32:8080/delete?app=demo");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].body.length, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test:uploader
```

Expected: fail because `deleteApp` and `tools/app-uploader/delete.mjs` do not exist yet.

- [ ] **Step 3: Implement helper and CLI**

Add `deleteApp()` to `tools/app-uploader/index.mjs`:

```js
export async function deleteApp({
  boardUrl,
  appId,
  fetchImpl,
  requestImpl = sendRequest,
  retryAttempts = 3,
  retryDelayMs = 250,
}) {
  if (!boardUrl) {
    throw new Error("boardUrl is required");
  }
  assertSafeRelativePath(appId);

  const base = boardUrl.replace(/\/+$/, "");
  return requestJson({
    url: `${base}/delete?app=${encodeURIComponent(appId)}`,
    method: "POST",
    fetchImpl,
    requestImpl,
    retryAttempts,
    retryDelayMs,
    label: `Delete ${appId}`,
  });
}
```

Create `tools/app-uploader/delete.mjs` following `launch.mjs`, with `parseDeleteCliArgs()`, `main()`, `--transport native|nc`, and output:

```js
console.log(`deleted ${result.deleted}; app_count=${result.app_count}`);
```

Add to `package.json` scripts:

```json
"delete:app": "node tools/app-uploader/delete.mjs"
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
npm run test:uploader
```

Expected: all uploader tests pass.

### Task 2: Firmware Delete Endpoint

**Files:**
- Modify: `firmware/vibeboard_runtime/main/install_service.c`
- Modify: `tools/firmware-static-check/test.mjs`

- [ ] **Step 1: Write failing firmware static tests**

Add expectations to `tools/firmware-static-check/test.mjs` install-service tests:

```js
assert.match(source, /delete_handler/);
assert.match(source, /\/delete/);
assert.match(source, /HTTP_POST,\s*delete_handler/);
assert.match(source, /HTTPD_409_CONFLICT/);
assert.match(source, /remove_app_tree/);
assert.match(source, /vb_app_registry_scan\(s_context->registry\)/);
```

- [ ] **Step 2: Run static tests to verify failure**

Run:

```bash
npm run test:firmware-static
```

Expected: fail because the firmware has no delete endpoint yet.

- [ ] **Step 3: Implement recursive deletion and handler**

In `install_service.c`:

- Include `<dirent.h>` and `<unistd.h>`.
- Add `remove_app_tree(const char *path)` that recursively removes files/directories.
- Add `delete_handler(httpd_req_t *req)`.
- Validate `app` with `get_query_value()` and `reject_unsafe_path()`.
- Return `500` if SD or registry is unavailable.
- Rescan and require the app to exist before deletion.
- Return `409` if `vb_app_runner_is_running()` and `vb_app_runner_current_id()` matches the selected app.
- Delete `/sdcard/apps/<app-id>`.
- Rescan and return `{"ok":true,"deleted":"<app-id>","app_count":N}`.
- Register `"/delete"` as `HTTP_POST`.

- [ ] **Step 4: Run static tests to verify pass**

Run:

```bash
npm run test:firmware-static
```

Expected: all firmware static tests pass.

### Task 3: Docs And Verification

**Files:**
- Modify: `docs/app-package-format.md`
- Modify: `docs/runtime-capabilities.md`
- Modify: `docs/next-session-plan.md`

- [ ] **Step 1: Document the endpoint and CLI**

Add `POST /delete?app=<id>` and `npm run delete:app -- <board-url> <app-id>` to the deployment docs.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
git diff --check
```

Expected: all tests pass and diff check emits no output.

- [ ] **Step 3: Build firmware**

Run from `firmware/vibeboard_runtime`:

```bash
source /Users/wq/esp-idf/export.sh >/tmp/idf-export.log
idf.py build
```

Expected: firmware build completes successfully.

- [ ] **Step 4: Board verification**

On the board:

```bash
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_delete_probe
curl http://192.168.1.32:8080/apps
npm run delete:app -- http://192.168.1.32:8080 smoke_delete_probe
curl http://192.168.1.32:8080/apps
```

Expected: `smoke_delete_probe` appears after upload and disappears after delete.

Verify running-app protection:

```bash
npm run launch:app -- http://192.168.1.32:8080 smoke_visual_native
npm run delete:app -- http://192.168.1.32:8080 smoke_visual_native
```

Expected: delete fails with a board `409` conflict while the app is running.
