# AI Generation Contract

The AI generator must output a package plan before files.

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

Prefer Lua/LVGL app generation when the request is for:

- small-screen UI;
- dashboard or status card;
- simple tool;
- simple game;
- AI widget;
- network card using existing runtime APIs.

Return `Runtime update required` when the request needs:

- driver changes;
- pin-map changes;
- BLE service changes;
- partition or sdkconfig changes;
- LVGL bindings not exposed by the runtime;
- native module ABI changes.
