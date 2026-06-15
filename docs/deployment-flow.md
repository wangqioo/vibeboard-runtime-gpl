# Deployment Flow

Phase 2A defines the file contract, validates apps, and creates deployable file packages.

```text
AI produces app package
  -> app validator passes
  -> app packager writes dist/apps/<app-id>
  -> uploader discards stale staging data
  -> uploader stages package files under /sdcard/.staging/<app-id>
  -> runtime validates app.info plus the entry file and commits to /sdcard/apps/<app-id>
  -> uploader confirms the app through /apps
  -> user launches from the native screen launcher or HTTP /launch
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
POST /install?app=<id>&path=<relative>
POST /stage?app=<id>&path=<relative>
POST /commit?app=<id>
POST /discard?app=<id>
POST /rescan
POST /launch?app=<id>
POST /stop
POST /delete?app=<id>
```

`POST /stage` writes one file under `/sdcard/.staging/<id>/<relative>`, rejects absolute paths and `..`, and creates parent directories as needed. `POST /commit` validates `app.info` and the declared entry file before replacing `/sdcard/apps/<id>`. Apps can then be launched from the native `VibeBoard Apps` screen or through `/launch`.

Current limitations:

- no browser management UI yet;
- no formal WiFi configuration entry yet beyond `/sdcard/runtime/wifi.json` and the current smoke app compatibility fallback;
- compatibility checks still rely on the app validator and documented runtime capabilities.

Other transport options:

- Browser upload through a future VibeBoard Runtime web console.
- SD-card copy for recovery and offline installation.

USB flashing is for runtime installation and recovery, not the normal app-edit loop.
