# Deployment Flow

Phase 1 defines the file contract and manual deployment baseline.

```text
AI produces app package
  -> app validator passes
  -> copy app directory to device storage
  -> launcher refreshes app list
  -> app starts
```

Manual baseline:

```text
/sd/apps/<app-name>/app.info
/sd/apps/<app-name>/<entry>.lua
/sd/apps/<app-name>/assets/...
```

Future transport options:

- WiFi HTTP upload exposed by the runtime.
- Browser upload through a VibeBoard Runtime web console.
- SD-card copy for recovery and offline installation.

USB flashing is for runtime installation and recovery, not the normal app-edit loop.
