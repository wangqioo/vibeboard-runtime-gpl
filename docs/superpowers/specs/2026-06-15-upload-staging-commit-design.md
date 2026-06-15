# Upload Staging Commit Design

## Goal

Make app uploads transactional from the launcher's point of view. A partially uploaded package must stay outside `/sdcard/apps/<app-id>` until every file is present and the host explicitly commits it.

## Context

The current HTTP install path writes each file directly to `/sdcard/apps/<app-id>/<path>`. If Wi-Fi drops, the CLI is interrupted, or the board resets in the middle of an upload, the app directory can contain a half package. The registry already skips packages with missing entry files, but a broken update can still overwrite a previously working app.

The runtime already has the pieces this feature needs:

- path validation through `reject_unsafe_path()`;
- recursive deletion through `remove_app_tree()`;
- registry rescanning through `vb_app_registry_scan()`;
- running-app protection in the delete endpoint.

## HTTP API

The existing `/install` endpoint stays available as direct mode for debugging and compatibility.

Add these staged upload endpoints:

- `POST /stage?app=<id>&path=<relative>` writes the request body to `/sdcard/.staging/<id>/<relative>`.
- `POST /commit?app=<id>` validates `/sdcard/.staging/<id>`, replaces `/sdcard/apps/<id>`, rescans the registry, and returns `{"ok":true,"committed":"<id>","app_count":N}`.
- `POST /discard?app=<id>` removes `/sdcard/.staging/<id>` if it exists and returns `{"ok":true,"discarded":"<id>"}`.

All staged endpoints use the same unsafe path rules as `/install`: empty values, absolute paths, and any `..` segment are rejected. `/commit` rejects an app that is currently running with `409 Conflict` before it touches either app directory.

## Commit Validation

Commit succeeds only when the staging directory contains:

- `app.info`;
- a declared entry file from `entry = <path>` in `app.info`, or `main.lua` if `entry` is absent.

The entry path is validated with the same relative path guard. If validation fails, the staging directory is left in place so the host can inspect or discard it.

## Replacement Semantics

Commit keeps staging outside the registry until the final move. The implementation uses same-filesystem directory renames on the SD card:

1. ensure `/sdcard/apps` and `/sdcard/.staging` exist;
2. validate the staged package;
3. if `/sdcard/apps/<id>` exists, move it to `/sdcard/.staging/<id>.previous`;
4. move `/sdcard/.staging/<id>` to `/sdcard/apps/<id>`;
5. rescan the registry;
6. delete the backup directory after the new app is in place.

If the new app move fails after backup creation, the runtime attempts to restore the previous app directory. This is not a guaranteed power-loss-proof filesystem transaction, but it prevents half-uploaded packages from becoming launchable and keeps the normal failure mode recoverable.

## Host Uploader

`npm run upload:app` switches to staged mode by default:

1. `POST /discard?app=<id>` to clear old staging data;
2. upload every file with `/stage`;
3. `POST /commit?app=<id>`;
4. `GET /apps` to confirm the app is launchable.

If a staged file upload or commit fails, the CLI best-effort calls `/discard` and then reports the original failure. Direct mode remains available as `--mode direct` and keeps the old `/install` plus `/rescan` flow.

## Testing

Host tests cover:

- default uploads call `/discard`, `/stage`, `/commit`, then `/apps`;
- native HTTP fallback uses the staged endpoints;
- transient staged upload failures still retry;
- staged failure performs best-effort discard;
- `--mode direct` preserves the old `/install` behavior;
- invalid upload modes are rejected.

Firmware static checks cover:

- `/stage`, `/commit`, and `/discard` are registered;
- staged writes use `/sdcard/.staging`;
- commit validates `app.info` and the entry file;
- commit returns `409 Conflict` for the currently running app;
- commit uses rename-based replacement and registry rescan.

Board verification uploads a packaged app in staged mode, confirms it appears in `/apps`, launches and stops it, and verifies committing over a running app is rejected.
