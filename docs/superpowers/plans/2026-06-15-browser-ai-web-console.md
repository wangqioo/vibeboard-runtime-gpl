# Browser AI Web Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a browser management page from the board at `/`, with direct browser-to-OpenAI app generation and staged upload to the runtime.

**Architecture:** Add a focused firmware web console module that registers `GET /` and serves one self-contained HTML/CSS/JS page. Keep all runtime actions on existing HTTP endpoints, and implement AI app generation entirely in browser JavaScript with user-entered API credentials, client-side validation, and staged commit upload.

**Tech Stack:** ESP-IDF HTTP server, plain C string-served HTML, plain browser JavaScript, OpenAI Responses API over `fetch`, existing firmware static Node tests.

---

## File Map

- Create `firmware/vibeboard_runtime/main/web_console.h`: public registration function for the root web console handler.
- Create `firmware/vibeboard_runtime/main/web_console.c`: static HTML document, `GET /` handler, response headers, `vb_web_console_register`.
- Modify `firmware/vibeboard_runtime/main/install_service.c`: include `web_console.h` and register the root handler after HTTP server start.
- Modify `firmware/vibeboard_runtime/main/CMakeLists.txt`: compile `web_console.c`.
- Modify `tools/firmware-static-check/test.mjs`: add static guardrails for the new page, endpoints, AI panel, OpenAI request shape, credential handling, and client validation.
- Modify `web-console/README.md`: replace the reserved placeholder with the shipped console behavior and risk notes.

## Task 1: Static Guardrails for Web Console Module

**Files:**
- Modify: `tools/firmware-static-check/test.mjs`
- Later create: `firmware/vibeboard_runtime/main/web_console.h`
- Later create: `firmware/vibeboard_runtime/main/web_console.c`
- Later modify: `firmware/vibeboard_runtime/main/CMakeLists.txt`
- Later modify: `firmware/vibeboard_runtime/main/install_service.c`

- [ ] **Step 1: Add failing static test paths**

Add these constants near the existing install service paths in `tools/firmware-static-check/test.mjs`:

```js
const webConsoleSourcePath = join(firmwareRoot, "main/web_console.c");
const webConsoleHeaderPath = join(firmwareRoot, "main/web_console.h");
```

- [ ] **Step 2: Add failing static web console test**

Add this test after `starts a sandboxed HTTP install service for SD app uploads`:

```js
  it("serves a browser web console with direct AI app creation", () => {
    const cmake = readRequired(cmakePath);
    const installService = readRequired(installServiceSourcePath);
    const header = readRequired(webConsoleHeaderPath);
    const source = readRequired(webConsoleSourcePath);

    assert.match(cmake, /web_console\.c/);
    assert.match(header, /vb_web_console_register/);
    assert.match(header, /httpd_handle_t/);
    assert.match(installService, /#include "web_console\.h"/);
    assert.match(installService, /vb_web_console_register\(s_server\)/);

    assert.match(source, /esp_http_server\.h/);
    assert.match(source, /\.uri\s*=\s*"\/"/);
    assert.match(source, /\.method\s*=\s*HTTP_GET/);
    assert.match(source, /httpd_resp_set_type\(req,\s*"text\/html"/);
    assert.match(source, /Cache-Control/);
    assert.match(source, /VibeBoard Runtime/);
    assert.match(source, /AI Create App/);
    assert.match(source, /OpenAI API Key/);
    assert.match(source, /Remember key in this browser/);
    assert.match(source, /Clear key/);
    assert.match(source, /https:\/\/api\.openai\.com\/v1\/responses/);
    assert.match(source, /Authorization/);
    assert.match(source, /Bearer/);
    assert.match(source, /json_schema/);
    assert.match(source, /runtime_update_required/);

    assert.match(source, /fetchJson\('\/status'\)/);
    assert.match(source, /fetchJson\('\/apps'\)/);
    assert.match(source, /postJson\('\/launch\?app='/);
    assert.match(source, /postJson\('\/stop'/);
    assert.match(source, /postJson\('\/delete\?app='/);
    assert.match(source, /postJson\('\/discard\?app='/);
    assert.match(source, /fetch\(stageUrl/);
    assert.match(source, /postJson\('\/commit\?app='/);
    assert.match(source, /webkitdirectory/);

    assert.match(source, /localStorage\.getItem\(KEY_STORAGE_NAME\)/);
    assert.match(source, /localStorage\.setItem\(KEY_STORAGE_NAME,\s*key\)/);
    assert.match(source, /localStorage\.removeItem\(KEY_STORAGE_NAME\)/);
    assert.match(source, /validateAppId/);
    assert.match(source, /\[A-Za-z0-9_-\]/);
    assert.match(source, /validateRelativePath/);
    assert.match(source, /path\.includes\('\.\.'\)/);
    assert.match(source, /path\.startsWith\('\/'\)/);
    assert.match(source, /path\.includes\('\\\\'\)/);
    assert.match(source, /synthesizeAppInfo/);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm run test:firmware-static
```

Expected: fails because `firmware/vibeboard_runtime/main/web_console.h` does not exist.

## Task 2: Firmware Web Console Handler

**Files:**
- Create: `firmware/vibeboard_runtime/main/web_console.h`
- Create: `firmware/vibeboard_runtime/main/web_console.c`
- Modify: `firmware/vibeboard_runtime/main/CMakeLists.txt`
- Modify: `firmware/vibeboard_runtime/main/install_service.c`

- [ ] **Step 1: Add the public header**

Create `firmware/vibeboard_runtime/main/web_console.h`:

```c
#pragma once

#include "esp_err.h"
#include "esp_http_server.h"

esp_err_t vb_web_console_register(httpd_handle_t server);
```

- [ ] **Step 2: Add a minimal module that intentionally leaves most assertions failing**

Create `firmware/vibeboard_runtime/main/web_console.c`:

```c
#include "web_console.h"

#include "esp_http_server.h"

static const char *INDEX_HTML =
    "<!doctype html><html><head><meta charset=\"utf-8\">"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
    "<title>VibeBoard Runtime</title></head>"
    "<body><h1>VibeBoard Runtime</h1><section>AI Create App</section></body></html>";

static esp_err_t root_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    return httpd_resp_sendstr(req, INDEX_HTML);
}

esp_err_t vb_web_console_register(httpd_handle_t server)
{
    const httpd_uri_t root_uri = {
        .uri = "/",
        .method = HTTP_GET,
        .handler = root_handler,
        .user_ctx = NULL,
    };
    return httpd_register_uri_handler(server, &root_uri);
}
```

- [ ] **Step 3: Wire the module into firmware build and service startup**

Modify `firmware/vibeboard_runtime/main/CMakeLists.txt` to add:

```cmake
        "web_console.c"
```

Modify `firmware/vibeboard_runtime/main/install_service.c` includes:

```c
#include "web_console.h"
```

After `httpd_start` succeeds in `vb_install_service_start`, before registering `/install`, add:

```c
    err = vb_web_console_register(s_server);
    if (err != ESP_OK) {
        return err;
    }
```

- [ ] **Step 4: Run test to verify only HTML/content assertions remain failing**

Run:

```bash
npm run test:firmware-static
```

Expected: the file-existence and registration checks pass; content checks for endpoints, AI request, and validation still fail.

## Task 3: Implement Runtime Management UI

**Files:**
- Modify: `firmware/vibeboard_runtime/main/web_console.c`

- [ ] **Step 1: Replace `INDEX_HTML` with a self-contained admin page shell**

Replace the minimal HTML string with a complete static string that includes:

```html
<header class="topbar">
  <div>
    <p class="eyebrow">Device Console</p>
    <h1>VibeBoard Runtime</h1>
  </div>
  <button id="refreshBtn" type="button">Refresh</button>
</header>

<section class="status-grid" aria-label="Runtime status">
  <div><span>State</span><strong id="runnerState">unknown</strong></div>
  <div><span>Current App</span><strong id="currentApp">none</strong></div>
  <div><span>Apps</span><strong id="appCount">0</strong></div>
  <div><span>Last Result</span><strong id="lastMessage">unknown</strong></div>
</section>

<main class="layout">
  <section class="panel">
    <div class="section-head">
      <h2>Apps</h2>
      <button id="stopBtn" type="button">Stop Current</button>
    </div>
    <div id="appsList" class="apps-list"></div>
  </section>

  <aside class="side">
    <section class="panel">
      <h2>Upload App Folder</h2>
      <label>App ID <input id="manualAppId" type="text" autocomplete="off"></label>
      <label>Folder <input id="folderInput" type="file" webkitdirectory multiple></label>
      <button id="uploadBtn" type="button">Upload Folder</button>
      <p id="uploadStatus" class="status-text"></p>
    </section>

    <section class="panel" id="aiPanel">
      <h2>AI Create App</h2>
    </section>
  </aside>
</main>

<section class="panel log-panel">
  <h2>Operation Status</h2>
  <pre id="logOutput">Ready.</pre>
</section>
```

Use compact, responsive CSS inside `<style>`. Keep body text at 16px or larger, use visible labels, keep buttons at least 44px tall, and avoid external assets.

- [ ] **Step 2: Add runtime endpoint JavaScript**

Add these functions inside `<script>`:

```js
async function fetchJson(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) throw new Error(response.status + ' ' + text);
  return text ? JSON.parse(text) : {};
}

async function postJson(path) {
  const response = await fetch(path, { method: 'POST', headers: { Accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) throw new Error(response.status + ' ' + text);
  return text ? JSON.parse(text) : {};
}
```

- [ ] **Step 3: Add status and app rendering**

Add functions named `refreshRuntime`, `renderStatus`, and `renderApps` that:

- call `fetchJson('/status')`;
- call `fetchJson('/apps')`;
- fill `runnerState`, `currentApp`, `appCount`, and `lastMessage`;
- render each app with `Launch` and `Delete` buttons;
- call `postJson('/launch?app=' + encodeURIComponent(app.id))`;
- call `postJson('/delete?app=' + encodeURIComponent(app.id))` after `confirm`;
- call `postJson('/stop')` from the global stop button.

- [ ] **Step 4: Add manual folder staged upload**

Add functions named `uploadFilesForApp`, `relativePathForFile`, `encodePath`, and `uploadManualFolder`.

The upload sequence must be:

```js
await postJson('/discard?app=' + encodeURIComponent(appId));
for (const file of files) {
  const rel = relativePathForFile(file, rootPrefix);
  const stageUrl = '/stage?app=' + encodeURIComponent(appId) + '&path=' + encodePath(rel);
  const response = await fetch(stageUrl, { method: 'POST', body: file });
  if (!response.ok) throw new Error(response.status + ' ' + await response.text());
}
await postJson('/commit?app=' + encodeURIComponent(appId));
await refreshRuntime();
```

`encodePath` must encode each path segment separately:

```js
function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}
```

- [ ] **Step 5: Run static test and expect AI assertions still failing**

Run:

```bash
npm run test:firmware-static
```

Expected: runtime management endpoint assertions pass; AI request, key storage, and validation assertions still fail.

## Task 4: Implement Browser AI App Creation

**Files:**
- Modify: `firmware/vibeboard_runtime/main/web_console.c`

- [ ] **Step 1: Add AI panel markup**

Inside `<section class="panel" id="aiPanel">`, include:

```html
<h2>AI Create App</h2>
<p class="risk">Direct browser AI exposes the API key to this browser session.</p>
<label>OpenAI API Key <input id="apiKey" type="password" autocomplete="off"></label>
<label class="check"><input id="rememberKey" type="checkbox"> Remember key in this browser</label>
<button id="clearKeyBtn" type="button">Clear key</button>
<label>Model <input id="modelName" type="text" value="gpt-5.5" autocomplete="off"></label>
<label>New App ID <input id="aiAppId" type="text" autocomplete="off" placeholder="pomodoro"></label>
<label>Prompt <textarea id="aiPrompt" rows="6"></textarea></label>
<button id="generateBtn" type="button">Generate and Upload</button>
<p id="aiStatus" class="status-text"></p>
<details>
  <summary>Generated plan</summary>
  <pre id="planPreview"></pre>
</details>
```

- [ ] **Step 2: Add credential storage helpers**

Add:

```js
const KEY_STORAGE_NAME = 'vibeboard.openai_api_key';

function loadStoredKey() {
  const stored = localStorage.getItem(KEY_STORAGE_NAME);
  if (stored) {
    document.getElementById('apiKey').value = stored;
    document.getElementById('rememberKey').checked = true;
  }
}

function persistKeyPreference() {
  const key = document.getElementById('apiKey').value.trim();
  if (document.getElementById('rememberKey').checked && key) {
    localStorage.setItem(KEY_STORAGE_NAME, key);
  } else {
    localStorage.removeItem(KEY_STORAGE_NAME);
  }
}

function clearStoredKey() {
  localStorage.removeItem(KEY_STORAGE_NAME);
  document.getElementById('apiKey').value = '';
  document.getElementById('rememberKey').checked = false;
}
```

- [ ] **Step 3: Add app plan validation helpers**

Add functions:

```js
function validateAppId(appId) {
  if (!/^[A-Za-z0-9_-]+$/.test(appId)) throw new Error('App ID may only contain letters, digits, _ and -.');
}

function validateRelativePath(path) {
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\\\')) {
    throw new Error('Unsafe path: ' + path);
  }
}

function synthesizeAppInfo(plan) {
  const capabilities = Array.isArray(plan.app.capabilities) ? plan.app.capabilities.join(',') : '';
  return [
    'name = ' + plan.app.name,
    'entry = ' + plan.app.entry,
    'description = ' + plan.app.description,
    capabilities ? 'capabilities = ' + capabilities : '',
    ''
  ].filter(Boolean).join('\\n');
}

function validatePlan(plan) {
  if (!plan || plan.kind !== 'app_plan') throw new Error('AI did not return an app plan.');
  if (!plan.app || !plan.app.name || !plan.app.entry || !plan.app.description) {
    throw new Error('Plan is missing app metadata.');
  }
  if (!Array.isArray(plan.files)) throw new Error('Plan files must be an array.');
  let hasEntry = false;
  for (const file of plan.files) {
    validateRelativePath(file.path);
    if (file.path === plan.app.entry && file.type === 'lua') hasEntry = true;
    if (typeof file.content !== 'string') throw new Error('File content must be text: ' + file.path);
  }
  if (!hasEntry) throw new Error('Plan does not include the Lua entry file.');
}
```

- [ ] **Step 4: Add OpenAI Responses call**

Add `generatePlanWithOpenAI`:

```js
async function generatePlanWithOpenAI(apiKey, model, prompt, appId) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: 'Generate one VibeBoard Lua/LVGL app package plan as JSON. Return runtime_update_required when firmware, drivers, BLE, partitions, sdkconfig, native modules, or unavailable LVGL bindings are needed.'
        },
        {
          role: 'user',
          content: 'App ID: ' + appId + '\\nRequest: ' + prompt
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'vibeboard_app_plan',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['kind'],
            properties: {
              kind: { type: 'string', enum: ['app_plan', 'runtime_update_required'] },
              reason: { type: 'string' },
              app: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'entry', 'description', 'capabilities'],
                properties: {
                  name: { type: 'string' },
                  entry: { type: 'string' },
                  description: { type: 'string' },
                  capabilities: { type: 'array', items: { type: 'string' } }
                }
              },
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['path', 'type', 'content'],
                  properties: {
                    path: { type: 'string' },
                    type: { type: 'string', enum: ['lua', 'text', 'json', 'csv', 'markdown'] },
                    content: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || JSON.stringify(payload));
  const text = payload.output_text || payload.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
  if (!text) throw new Error('OpenAI response did not include output_text.');
  return JSON.parse(text);
}
```

- [ ] **Step 5: Add generated app upload flow**

Add:

```js
function filesFromPlan(plan) {
  const files = plan.files.filter(file => file.path !== 'app.info').map(file => ({
    path: file.path,
    content: file.content
  }));
  files.unshift({ path: 'app.info', content: synthesizeAppInfo(plan) });
  return files;
}

async function uploadGeneratedPlan(appId, plan) {
  const files = filesFromPlan(plan);
  await postJson('/discard?app=' + encodeURIComponent(appId));
  for (const file of files) {
    const stageUrl = '/stage?app=' + encodeURIComponent(appId) + '&path=' + encodePath(file.path);
    const response = await fetch(stageUrl, { method: 'POST', body: file.content });
    if (!response.ok) throw new Error(response.status + ' ' + await response.text());
  }
  await postJson('/commit?app=' + encodeURIComponent(appId));
  await refreshRuntime();
}
```

Wire the generate button to:

1. read API key, model, app id, and prompt;
2. `validateAppId(appId)`;
3. `persistKeyPreference()`;
4. call `generatePlanWithOpenAI`;
5. if `kind === 'runtime_update_required'`, show the reason and stop;
6. `validatePlan(plan)`;
7. show JSON in `planPreview`;
8. `uploadGeneratedPlan(appId, plan)`;
9. show success and enable app launch from the refreshed list.

- [ ] **Step 6: Run static test and make it pass**

Run:

```bash
npm run test:firmware-static
```

Expected: pass.

## Task 5: Documentation Update

**Files:**
- Modify: `web-console/README.md`

- [ ] **Step 1: Replace reserved placeholder**

Rewrite `web-console/README.md` to say:

```markdown
# VibeBoard Runtime Web Console

The runtime now serves a browser console from the board:

```text
http://<board-ip>:8080/
```

The console uses the existing runtime HTTP API for app lifecycle and deployment:

- status and app list;
- staged app upload and commit;
- launch, stop, and delete;
- direct browser AI app creation.

The AI creator is intentionally browser-direct. The user enters an OpenAI API key
in the page, and the page calls the OpenAI Responses API with structured JSON
output. This means the key is visible to the browser session and developer tools.
By default the key stays in page memory only. The optional remember checkbox stores
it in browser `localStorage`.

AI-created apps are still uploaded through `/discard`, `/stage`, and `/commit`.
The browser performs client-side path and package checks before upload, and the
runtime commit validation remains the final on-device check.

Relevant documents:

- [`docs/app-package-format.md`](../docs/app-package-format.md)
- [`docs/ai-generation-contract.md`](../docs/ai-generation-contract.md)
- [`docs/deployment-flow.md`](../docs/deployment-flow.md)
```

- [ ] **Step 2: Run diff check**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

## Task 6: Full Verification and Commit

**Files:**
- All changed files

- [ ] **Step 1: Run repository tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run firmware build**

Run from `firmware/vibeboard_runtime`:

```bash
source /Users/wq/esp-idf/export.sh
idf.py build
```

Expected: firmware builds successfully.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add firmware/vibeboard_runtime/main/web_console.h firmware/vibeboard_runtime/main/web_console.c firmware/vibeboard_runtime/main/CMakeLists.txt firmware/vibeboard_runtime/main/install_service.c tools/firmware-static-check/test.mjs web-console/README.md
git commit -m "feat: add browser AI web console"
```

- [ ] **Step 4: Optional board verification after flash**

If a board is connected and reachable, flash the firmware and verify:

```bash
curl http://192.168.1.32:8080/
curl http://192.168.1.32:8080/status
curl http://192.168.1.32:8080/apps
```

Expected:

- `/` returns HTML containing `VibeBoard Runtime` and `AI Create App`;
- `/status` returns JSON;
- `/apps` returns JSON.

Manual browser verification should open `http://192.168.1.32:8080/` and test:

- app list renders;
- launch/stop/delete work;
- manual folder upload works;
- AI app generation can call OpenAI directly when a valid key is entered;
- generated app commits and can be launched.

## Self-Review

- Spec coverage: the plan covers the root page, management actions, manual staged upload, direct browser AI generation, credential handling, client validation, firmware integration, documentation, tests, build, and board checks.
- Scope check: Wi-Fi config, log streaming, code editing, binary assets, and localhost bridge are intentionally excluded.
- Placeholder scan: no open TODO/TBD work remains; optional board verification is explicitly conditional on hardware reachability.
