# Deployment Flow

Phase 2A defines the file contract, validates apps, and creates deployable file packages.

```text
AI produces app package
  -> app validator passes
  -> app packager writes dist/apps/<app-id>
  -> copy package contents to device storage
  -> launcher refreshes app list
  -> app starts
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

`manifest.json` records the package schema, source path, install path, declared capabilities, and SHA-256 hashes for packaged files. It is for tooling and audit; the first runtime can ignore it if the launcher only needs `app.info` and the entry Lua file.

Transport options:

- WiFi HTTP upload exposed by the runtime:

```bash
npm run upload:app -- http://<board-ip>:8080 dist/apps/<app-id> <app-id>
```

The current firmware endpoint is intentionally small:

```text
POST /install?app=<id>&path=<relative>
```

It writes one file under `/sdcard/apps/<id>/<relative>`, rejects absolute paths and `..`, and creates parent directories as needed. It does not yet rescan or launch the uploaded app at runtime; reboot or a future launcher/rescan phase is still needed.

- Browser upload through a VibeBoard Runtime web console.
- SD-card copy for recovery and offline installation.

USB flashing is for runtime installation and recovery, not the normal app-edit loop.
