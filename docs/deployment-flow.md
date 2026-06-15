# Deployment Flow

VibeBoard app deployment is now a staged board workflow. The normal path never writes half an app into the launchable directory.

```text
AI produces app package
  -> app validator passes
  -> app packager writes dist/apps/<app-id>
  -> browser console or host uploader discards stale staging data
  -> browser console or host uploader stages package files under /sdcard/.staging/<app-id>
  -> runtime validates app.info plus the entry file and commits to /sdcard/apps/<app-id>
  -> client confirms the app through /apps
  -> user launches from the native screen launcher, browser console, or HTTP /launch
```

Create a package for one app:

```bash
npm run package:app -- apps/weather
```

Create packages for all curated demo apps:

```bash
npm run package:demos
```

Manual baseline:

```text
dist/apps/<app-id>/app.info
dist/apps/<app-id>/<entry>.lua
dist/apps/<app-id>/assets/...
dist/apps/<app-id>/manifest.json
dist/apps/<app-id>/install-notes.txt
```

Device storage target:

```text
/sd/apps/<app-id>/app.info
/sd/apps/<app-id>/<entry>.lua
/sd/apps/<app-id>/assets/...
```

`manifest.json` records the package schema, source path, install path, declared capabilities, and SHA-256 hashes for packaged files. It is for tooling and audit; the current runtime launcher only needs `app.info` and the entry Lua file.

Transport options:

- Browser console served by the runtime:

```text
http://<board-ip>:8080/
```

The browser console supports app listing, status refresh, manual folder upload, launch, stop, delete, and browser-side AI app creation. Manual and AI-created apps both use the same staged `/discard -> /stage -> /commit` path.

- WiFi HTTP upload exposed by the runtime:

```bash
npm run upload:app -- http://<board-ip>:8080 dist/apps/<app-id> <app-id>
```

The uploader defaults to staged mode. It calls `/discard`, uploads files through `/stage`, commits with `/commit`, and confirms the committed app through `/apps`. The old direct `/install` path remains available as an explicit compatibility mode:

```bash
npm run upload:app -- --mode direct http://<board-ip>:8080 dist/apps/<app-id> <app-id>
```

The uploader and launch helper default to Node's native HTTP client. The old `nc` transport remains available only as an explicit fallback:

```bash
npm run upload:app -- --transport nc http://<board-ip>:8080 dist/apps/<app-id> <app-id>
npm run launch:app -- --transport nc http://<board-ip>:8080 <app-id>
```

The current firmware endpoint is intentionally small:

```text
GET /
GET /status
GET /apps
POST /install?app=<id>&path=<relative>
POST /stage?app=<id>&path=<relative>
POST /commit?app=<id>
POST /discard?app=<id>
POST /rescan
POST /launch?app=<id>
POST /stop
POST /delete?app=<id>
```

`GET /` serves the self-contained Web Console. `POST /stage` writes one file under `/sdcard/.staging/<id>/<relative>`, rejects absolute paths and `..`, and creates parent directories as needed. `POST /commit` validates `app.info` and the declared entry file before replacing `/sdcard/apps/<id>`. Apps can then be launched from the native `VibeBoard Apps` screen, browser console, or `/launch`.

Browser AI creation:

```text
prompt + OpenAI API key in browser
  -> direct HTTPS call to OpenAI Responses API
  -> strict JSON app package response
  -> browser validates app id, file paths, text file types, and main.lua
  -> staged upload and commit
```

The API key is not sent to the board. The first implementation intentionally keeps the AI bridge in the browser, so the key is visible to that browser session and should only be used from a trusted machine and network.

Current limitations:

- formal WiFi configuration has a Mac CLI entry, but the `/sdcard/runtime/wifi.json` path still needs fresh board evidence before removing the smoke app compatibility fallback;
- browser AI creation has static coverage and board delivery coverage, but a real API-key prompt-to-running-app smoke still needs to be recorded;
- browser-direct OpenAI calls depend on browser/network/CORS behavior;
- browser AI creation currently supports text package files, not binary asset generation;
- compatibility checks still rely on the app validator, browser-side schema validation, and documented runtime capabilities.

Other transport options:

- SD-card copy for recovery and offline installation.

USB flashing is for runtime installation and recovery, not the normal app-edit loop.
