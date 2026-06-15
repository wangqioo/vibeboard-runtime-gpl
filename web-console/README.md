# VibeBoard Runtime Web Console

The runtime serves a browser console from the board:

```text
http://<board-ip>:8080/
```

The console uses the existing runtime HTTP API for app lifecycle and deployment:

- status and app list;
- staged app upload and commit;
- launch, stop, and delete;
- direct browser AI app creation.

The AI creator is intentionally browser-direct. The user enters an OpenAI API key
in the page, and the page calls the OpenAI Responses API with structured JSON
output. This means the key is visible to the browser session and developer tools.
By default the key stays in page memory only. The optional remember checkbox stores
it in browser `localStorage`. Because the board console is served over local HTTP,
use the AI creator only on a trusted network.

AI-created apps are still uploaded through `/discard`, `/stage`, and `/commit`.
The browser performs client-side path and package checks before upload, and the
runtime commit validation remains the final on-device check.

Relevant documents:

- [`docs/app-package-format.md`](../docs/app-package-format.md)
- [`docs/ai-generation-contract.md`](../docs/ai-generation-contract.md)
- [`docs/deployment-flow.md`](../docs/deployment-flow.md)
