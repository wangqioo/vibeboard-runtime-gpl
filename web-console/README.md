# VibeBoard Runtime Web Console

This directory is reserved for the future browser upload UI.

Phase 1 does not implement a web console. The current deployment path is the file-based app package contract:

```text
AI generates app.info + Lua + assets
  -> validator checks package
  -> user deploys files to device storage
  -> launcher runs the app
```

The future web console should upload validated app packages to the runtime over WiFi or another runtime-owned transport. USB flashing remains for runtime installation and recovery, not the normal app-edit loop.

Relevant phase documents:

- [`docs/deployment-flow.md`](../docs/deployment-flow.md)
- [`docs/app-package-format.md`](../docs/app-package-format.md)
- [`docs/runtime-boundary.md`](../docs/runtime-boundary.md)
- [`docs/ai-generation-contract.md`](../docs/ai-generation-contract.md)
