# Browser AI Web Console Design

## Goal

Build the first browser management page for VibeBoard Runtime and include a
browser-native AI app creator. The page is served by the device at:

```text
http://<board-ip>:8080/
```

The user explicitly chose direct browser-to-AI generation. This design accepts
that choice and treats browser-visible API credentials as an acknowledged tradeoff.

## Existing Context

The runtime already exposes the deployment and lifecycle API:

- `GET /status`
- `GET /apps`
- `POST /stage?app=<id>&path=<relative>`
- `POST /commit?app=<id>`
- `POST /discard?app=<id>`
- `POST /launch?app=<id>`
- `POST /stop`
- `POST /delete?app=<id>`
- legacy `POST /install?app=<id>&path=<relative>`

The app package contract already exists:

- installed app directory contains `app.info` and an entry Lua file;
- AI generation produces an intermediate app plan JSON;
- `app.entry` must point to a generated Lua file;
- generated file paths must stay inside the app directory;
- runtime-required work must be reported as `Runtime update required`.

## OpenAI Integration Basis

The web console will use direct `fetch()` calls rather than a JavaScript SDK.
This avoids adding frontend dependencies to firmware.

References checked for the API shape and risk boundary:

- OpenAI Responses API create endpoint:
  `https://platform.openai.com/docs/api-reference/responses/create`
- OpenAI structured outputs with JSON schema:
  `https://platform.openai.com/docs/guides/structured-outputs`
- Official OpenAI Node SDK browser warning:
  `https://github.com/openai/openai-node#why-is-this-dangerous`

The implementation should use the current Responses API and structured JSON
output where browser CORS and the API endpoint permit direct calls. If direct
browser calls fail because of OpenAI-side CORS behavior, the page must report a
clear error explaining that this mode needs a browser-callable API endpoint or a
local bridge. It must not silently fall back to a hidden proxy.

## Scope

### Runtime Management

The page provides a quiet admin interface for:

- runtime status;
- app list;
- manual app folder upload;
- app launch;
- current app stop;
- app delete with confirmation;
- refresh and operation error reporting.

### AI App Creation

The same page includes an `AI Create App` panel:

- API key input;
- model input with a sensible default;
- app id input;
- prompt textarea;
- generate button;
- generated plan preview;
- validation result;
- upload/commit progress;
- launch generated app button after success.

The first implementation only generates text files:

- `app.info`;
- `main.lua`;
- optional text assets such as `.json`, `.txt`, `.md`, or `.csv`.

Binary images, generated bitmaps, audio, fonts, archives, and native modules are
out of scope for the first version.

## Non-Goals

- No localhost AI bridge.
- No server-side secret storage.
- No user accounts or authentication.
- No Wi-Fi configuration UI in this slice.
- No log streaming.
- No code editor for already-installed apps.
- No AI-generated firmware, drivers, BLE services, partition changes, or
  sdkconfig changes.

## Architecture

```text
Browser at http://<board-ip>:8080/
  |
  | GET /status, GET /apps
  | POST /launch, /stop, /delete
  | POST /stage, /commit, /discard
  v
ESP32 runtime install service

Browser
  |
  | POST OpenAI Responses API
  v
OpenAI API
  |
  | app plan JSON
  v
Browser validator
  |
  | staged file upload
  v
ESP32 runtime install service
```

The firmware serves one self-contained HTML document with inline CSS and inline
JavaScript. The page should not request external JS, CSS, fonts, or images.

## Credential Handling

The UI must make the direct-browser risk explicit:

- The API key is visible to the browser runtime and browser developer tools.
- The default behavior keeps the key only in JavaScript memory for the current
  page session.
- A `Remember key in this browser` checkbox may store it in `localStorage`.
  This checkbox defaults to off.
- A `Clear key` action removes any stored key and clears the input.
- The key is never sent to the ESP32 runtime.
- The key is never embedded in firmware strings or repository files.

## AI Request Contract

The page sends a strict generation instruction:

- Generate one VibeBoard Lua/LVGL app package plan.
- Return only JSON matching the app plan schema.
- Use only runtime-exposed Lua/LVGL, timer, network, JSON, time, file, and
  package capabilities documented by the project.
- If the request needs runtime or firmware work, return a structured
  `runtime_update_required` result instead of inventing unsupported Lua APIs.

The response schema has two top-level outcomes:

```json
{
  "kind": "app_plan",
  "app": {
    "name": "Timer",
    "entry": "main.lua",
    "description": "Simple timer",
    "capabilities": ["lvgl", "timer"]
  },
  "files": [
    {
      "path": "main.lua",
      "type": "lua",
      "content": "print(\"timer\")\n"
    }
  ]
}
```

```json
{
  "kind": "runtime_update_required",
  "reason": "Needs BLE APIs that are not exposed to Lua."
}
```

The browser may synthesize `app.info` from `app` metadata before upload, matching
the existing plan writer behavior where app metadata is authoritative.

## Browser Validation

Before uploading, the page validates:

- `appId` matches a conservative identifier rule: letters, digits, `_`, and `-`;
- `app.name`, `app.entry`, and `app.description` are non-empty strings;
- `app.entry` names a generated Lua file;
- every file has a relative path;
- no path starts with `/`;
- no path contains `..`;
- no path is empty;
- no path contains backslash;
- first version accepts only text-like file types;
- a generated `app.info` is present in the final upload set;
- generated capabilities are reflected in `app.info`.

Validation is a client-side guardrail, not a sandbox. The runtime's staged
commit validation remains the final on-device safety check.

## Upload Flow

AI-created apps and manual folder uploads both use staged deployment:

1. `POST /discard?app=<id>`
2. `POST /stage?app=<id>&path=<relative>` for each file
3. `POST /commit?app=<id>`
4. `GET /apps`

If any stage upload fails, the page attempts `POST /discard?app=<id>` and shows
the failed file path and HTTP status.

If commit returns `409 app is running`, the page shows a specific message telling
the user to stop the app first.

## UI Design

The page is a utilitarian device console, not a landing page.

Desktop layout:

- top status strip with runtime state, current app, app count, and refresh;
- main app table with launch/delete actions;
- side panel for manual upload and AI creation;
- operation log/status region.

Mobile layout:

- single-column layout;
- status first;
- app list next;
- AI and manual upload below.

Interaction rules:

- buttons show disabled/loading states during network operations;
- destructive delete requires confirmation;
- API key field uses password input and a clear action;
- generated plan preview is collapsed by default after validation succeeds;
- errors are shown near the related action and also recorded in the operation
  status area.

## Firmware Integration

Add a small web console module instead of growing `install_service.c` further:

- `firmware/vibeboard_runtime/main/web_console.h`
- `firmware/vibeboard_runtime/main/web_console.c`

The install service registers the root handler:

```c
vb_web_console_register(s_server);
```

The handler serves only `GET /`. CSS and JavaScript are inline, so no extra HTTP
handlers are required. The existing URI handler capacity of 12 should still be
enough for the root page plus current install-service endpoints.

## Testing

Static firmware tests should prove:

- `web_console.c` is included in firmware CMake sources;
- the install service registers `vb_web_console_register`;
- the web console serves `GET /`;
- the HTML contains the runtime management endpoints;
- the HTML contains staged upload endpoints;
- the HTML contains the AI creation panel;
- the HTML calls the OpenAI Responses API with structured output configuration;
- the client validation rejects path traversal and absolute paths.

Repository verification:

```bash
npm test
git diff --check
idf.py build
```

Board verification after flashing:

```bash
curl http://<board-ip>:8080/
curl http://<board-ip>:8080/status
curl http://<board-ip>:8080/apps
```

Manual browser verification:

- page loads at `http://<board-ip>:8080/`;
- app list appears;
- launch/stop/delete work;
- manual upload works;
- AI prompt can generate a simple Lua app and stage/commit it;
- generated app can be launched.

## Risks

- Direct browser AI calls expose the user's API key to the local browser session.
- OpenAI may reject direct browser calls via CORS; this design reports that
  failure clearly and does not add an implicit bridge.
- Generated Lua can still be logically bad even if the package structure is
  valid; the first version relies on runtime failure reporting and user review.
- Large generated files can exceed RAM or upload reliability; first version
  should keep a conservative client-side size limit.

## Acceptance Criteria

- Visiting `/` on the board shows a non-blank management page.
- The page can list installed apps.
- The page can launch, stop, and delete apps through existing runtime endpoints.
- The page can upload a manually selected app folder through staging/commit.
- The page can call OpenAI directly from the browser using a user-entered key.
- The page can validate an AI-generated package plan.
- The page can upload and commit the generated text-only app.
- The page never stores API keys unless the user explicitly chooses browser
  storage.
