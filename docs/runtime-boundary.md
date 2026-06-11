# Runtime Boundary

No reflash is expected for:

- changing `app.info`;
- changing Lua app logic;
- changing app-local assets;
- adding app-local config examples;
- deploying another app that uses already exposed runtime APIs.

Runtime firmware work is expected for:

- display, input, SD, WiFi, audio, or storage driver changes;
- new Lua built-in modules;
- new LVGL binding functions;
- launcher lifecycle changes;
- new upload/install system services;
- native module ABI changes.

When a request cannot be satisfied by the app layer, the tool should report `Runtime update required` instead of pretending a Lua app can change firmware internals.
