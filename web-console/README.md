# VibeBoard Runtime Web Console

The browser-facing management UI currently lives in `tools/device-web-ui/`.

This `web-console/` directory is reserved for a future packaged web console if the UI is split into a larger frontend project. For now, use the local Node proxy:

```bash
npm run device:web -- --board http://192.168.1.32:8080
```

Open:

```text
http://127.0.0.1:8790
```

The current Device Web UI can:

- show Runtime `/status`;
- list compatible and legacy apps from `/apps`;
- launch, stop, rescan, and delete apps;
- upload a local app directory through the staged install API;
- show recent local proxy actions.

It runs on the developer machine and proxies to the board. This keeps the firmware HTTP service small and avoids requiring CORS support on the ESP32.

USB flashing remains for Runtime installation and recovery, not the normal app-edit loop.

Relevant docs:

- [`docs/deployment-flow.md`](../docs/deployment-flow.md)
- [`docs/app-package-format.md`](../docs/app-package-format.md)
- [`docs/runtime-boundary.md`](../docs/runtime-boundary.md)
- [`docs/ai-generation-contract.md`](../docs/ai-generation-contract.md)
