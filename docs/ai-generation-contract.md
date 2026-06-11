# AI Generation Contract

The AI generator must output a package plan before files.

JSON is an intermediate generation plan used by VibeBoard tooling, not the
on-device package format. The on-disk package is app.info + Lua/assets directory,
as documented in [App Package Format](app-package-format.md).

```json
{
  "app": {
    "name": "Timer",
    "entry": "main.lua",
    "description": "Simple countdown timer",
    "capabilities": ["lvgl", "timer"]
  },
  "files": [
    {
      "path": "app.info",
      "type": "text",
      "content": "name = Timer\nentry = main.lua\ndescription = Simple countdown timer\ncapabilities = lvgl,timer\n"
    },
    {
      "path": "main.lua",
      "type": "lua",
      "content": "print(\"timer\")\n"
    }
  ]
}
```

The package plan maps to the on-disk app package as follows:

- `app` metadata becomes `app.info` fields.
- `files[]` becomes files written inside the app directory.
- `app.entry` must name the Lua entry file written by `files[]`.
- Generated asset paths must stay inside the app directory.

Prefer Lua/LVGL app generation when the request is for:

- small-screen UI;
- dashboard or status card;
- simple tool;
- simple game;
- AI widget;
- network card using existing runtime APIs.

Return or report `Runtime update required` when the request needs:

- driver changes;
- pin-map changes;
- BLE service changes;
- partition or sdkconfig changes;
- LVGL bindings not exposed by the runtime;
- native module ABI changes.

Requests that return `Runtime update required` must route to firmware/runtime
work instead of pretending the app package can provide the missing driver,
binding, partition, or ABI support.
