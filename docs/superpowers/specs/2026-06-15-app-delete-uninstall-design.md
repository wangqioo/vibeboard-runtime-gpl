# App Delete/Uninstall Design

Date: 2026-06-15

## Goal

Add a safe app deletion path so a developer can remove an uploaded SD app without pulling the SD card.

## Scope

This slice adds one board endpoint and one Mac helper:

- `POST /delete?app=<app-id>` on the install service.
- `npm run delete:app -- http://<ip>:8080 <app-id>` for the host.

This slice does not add a browser UI, upload staging, rollback, or Lua-side `app.*` APIs.

## Safety Rules

Deletion is constrained to one installed app directory under `/sdcard/apps/<app-id>`.

- Reject missing, empty, absolute, or traversal-style app IDs using the same unsafe path policy as upload and launch.
- Refuse to delete the currently running app with `409 Conflict`.
- Return `404 Not Found` when the app is not present in the scanned registry.
- Delete recursively only after the app is found in the registry.
- Rescan the registry after deletion and return the new app count.

The endpoint intentionally does not auto-stop running apps. Explicit stop remains a separate operation.

## API

Request:

```text
POST /delete?app=<app-id>
```

Successful response:

```json
{"ok":true,"deleted":"demo","app_count":3}
```

Errors:

- `400 Bad Request`: missing or unsafe app ID.
- `404 Not Found`: app not found in the current SD app registry.
- `409 Conflict`: app is currently running.
- `500 Internal Server Error`: SD unavailable, rescan failure, or filesystem deletion failure.

## Host Tool

`deleteApp()` in `tools/app-uploader/index.mjs` mirrors `launchApp()`:

- validates `boardUrl` and `appId`;
- calls `POST /delete?app=<app-id>`;
- returns parsed JSON.

`tools/app-uploader/delete.mjs` provides the CLI:

```bash
npm run delete:app -- http://192.168.1.32:8080 smoke_visual_native
```

Expected output:

```text
deleted smoke_visual_native; app_count=3
```

## Testing

- Node tests cover the helper request URL/method and CLI argument parsing.
- Firmware static tests verify `/delete` is registered, the handler exists, running app deletion is rejected, recursive deletion is present, and registry rescan follows deletion.
- Board verification should upload a disposable app, delete it, confirm `/apps` no longer lists it, and confirm deleting a running app returns conflict.
