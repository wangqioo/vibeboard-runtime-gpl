# Deployment Flow

Phase 2A defines the file contract, validates apps, and creates deployable file packages.

```text
AI produces app package
  -> app validator passes
  -> app packager writes dist/apps/<app-id>
  -> upload package contents to the runtime or copy them to SD
  -> runtime rescans /sdcard/apps
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

The uploader and launch helper default to Node's native HTTP client. The old `nc`
transport remains available only as an explicit fallback:

```bash
npm run upload:app -- --transport nc http://<board-ip>:8080 dist/apps/<app-id> <app-id>
npm run launch:app -- --transport nc http://<board-ip>:8080 <app-id>
```

The current firmware endpoint is intentionally small:

```text
POST /install?app=<id>&path=<relative>
POST /rescan
POST /launch?app=<id>
```

`POST /install` writes one file under `/sdcard/apps/<id>/<relative>`, rejects absolute paths and `..`, and creates parent directories as needed. The uploader calls `/rescan` after upload and confirms the app through `/apps`. Apps can then be launched from the native `VibeBoard Apps` screen or through `/launch`.

Current limitations:

- no staging/commit step yet, so a half-uploaded package can exist on SD;
- no delete endpoint yet;
- no browser management UI yet;
- compatibility checks still rely on the app validator and documented runtime capabilities.

Other transport options:

- Browser upload through a future VibeBoard Runtime web console.
- SD-card copy for recovery and offline installation.

USB flashing is for runtime installation and recovery, not the normal app-edit loop.
