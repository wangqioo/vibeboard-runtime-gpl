# Deployment Flow

The deployment flow validates app packages, writes deployable files, then installs them on the Runtime over HTTP or by SD-card copy.

```text
AI produces app package
  -> app validator passes
  -> app packager writes dist/apps/<app-id>
  -> upload package contents to the runtime or copy them to SD
  -> runtime rescans /sdcard/apps
  -> user launches from the native screen launcher, local web UI, or HTTP /launch
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

- WiFi HTTP upload exposed by the runtime:

```bash
npm run upload:app -- http://<board-ip>:8080 dist/apps/<app-id> <app-id>
```

The uploader and launch helper default to Node's native HTTP client. The old `nc`
transport remains available only as an explicit fallback:

```bash
npm run upload:app -- --transport nc http://<board-ip>:8080 dist/apps/<app-id> <app-id>
npm run launch:app -- --transport nc http://<board-ip>:8080 <app-id>
```

The current firmware endpoint is intentionally small but transactional:

```text
POST /install?app=<id>&path=<relative>&stage=<stage-id>
POST /install/commit?app=<id>&stage=<stage-id>
POST /install/abort?stage=<stage-id>
POST /apps/delete?app=<id>
POST /rescan
POST /launch?app=<id>
```

By default, the uploader writes files under `/sdcard/.vibeboard-staging/<stage-id>/`, calls `/install/commit` to replace `/sdcard/apps/<id>`, and then confirms the app through `/apps`. If an upload fails before commit, the uploader calls `/install/abort` as best-effort cleanup. Apps can then be launched from the native `VibeBoard Apps` screen or through `/launch`.

The local browser UI wraps the same board API:

```bash
npm run device:web -- --board http://<board-ip>:8080
```

Open `http://127.0.0.1:8790` to view status, list apps, upload an app directory, launch, stop, rescan, or delete apps.

For old firmware that only supports direct writes, use:

```bash
npm run upload:app -- --legacy-direct http://<board-ip>:8080 dist/apps/<app-id> <app-id>
```

Current limitations:

- The browser UI is a local Node proxy, not a static UI served by the ESP32 firmware.
- Compatibility checks still rely on the app validator, package manifest metadata, and documented runtime capabilities.

Other transport options:

- SD-card copy for recovery and offline installation.

USB flashing is for runtime installation and recovery, not the normal app-edit loop.
