# App Packager Design

## Decision

Build a Phase 2A app deployment packager for VibeBoard Runtime GPL.

This is a file-level tool. It does not require ESP32 hardware and does not build runtime firmware. It turns a validated app directory into a deterministic deployment directory under `dist/apps/<app-id>/`.

## Goal

Create a repeatable local flow:

```text
apps/weather/
  -> validate app package
  -> copy package files to dist/apps/weather/
  -> write manifest.json
  -> write install-notes.txt
```

This gives the project a concrete bridge between "we have app source" and "this is the directory a user can copy to SD card or upload later through a web console".

## Non-Goals

Phase 2A does not:

- upload files to a real device;
- flash ESP32 firmware;
- create an ESP-IDF runtime;
- build native `.so` modules;
- minify or transform Lua/assets;
- zip packages unless a later task explicitly adds archive output.

## Commands

Add these npm scripts:

```json
{
  "package:app": "node tools/app-packager/cli.mjs",
  "package:demos": "node tools/app-packager/package-demos.mjs",
  "test:packager": "node --test tools/app-packager/test.mjs"
}
```

Update top-level `npm test` to include `npm run test:packager`.

Usage:

```bash
npm run package:app -- apps/weather
npm run package:demos
```

## Output

For input:

```text
apps/weather/
```

Output:

```text
dist/apps/weather/
  app.info
  main.lua
  main.png
  assets/...
  font/...
  info.html
  manifest.json
  install-notes.txt
```

The app id is derived from the input directory basename, normalized to a safe slug:

- lowercase;
- spaces become `-`;
- only `a-z`, `0-9`, `_`, and `-` remain;
- empty result is an error.

## Manifest

Each package writes:

```json
{
  "schema": "vibeboard-runtime-app-package@1",
  "appId": "weather",
  "sourcePath": "apps/weather",
  "outputPath": "dist/apps/weather",
  "name": "weather",
  "entry": "main.lua",
  "description": "Weather card",
  "capabilities": ["network"],
  "files": [
    {
      "path": "app.info",
      "size": 79,
      "sha256": "..."
    }
  ],
  "install": {
    "sdPath": "/sd/apps/weather",
    "copy": "Copy the contents of this directory to /sd/apps/weather on the device storage."
  }
}
```

The `files[]` list includes every regular file in the output package except `manifest.json` itself. It includes `install-notes.txt`.

## Install Notes

Each package writes `install-notes.txt`:

```text
VibeBoard Runtime App Package

App: weather
Install path: /sd/apps/weather

Copy all files in this directory to /sd/apps/weather on the device storage.
This package does not flash firmware.
```

## Validation Rules

Before packaging, the tool must run `validateAppDirectory(appDir)` from `tools/app-validator/index.mjs`.

If validation fails:

- no output directory is written;
- the CLI exits non-zero;
- errors are printed with the source path and validator messages.

The packager must reject:

- missing app directories;
- app directories outside the repository root;
- app directories with validator errors;
- files that resolve outside the app directory through symlinks.

## Copy Rules

The packager copies regular files and directories recursively.

It skips:

- `.DS_Store`;
- existing `manifest.json`;
- transient files under `.cache/`, `tmp/`, and `dist/`;
- symlinks.

The output directory is replaced atomically enough for local use:

1. build in `dist/.tmp/<app-id>-<timestamp>/`;
2. remove old `dist/apps/<app-id>/`;
3. move the completed temp directory into place.

## Demo Packaging

`tools/app-packager/package-demos.mjs` packages:

```text
apps/weather
apps/voice_ai
apps/nesgame
```

It exits non-zero if any demo fails.

## Tests

Add tests for:

- slug generation;
- successful package creation for a fixture app;
- `manifest.json` contains metadata, file list, sizes, and hashes;
- `install-notes.txt` is created;
- validation failure prevents output;
- symlinked files are skipped or rejected and cannot escape the app directory;
- `package:demos` creates `dist/apps/weather`, `dist/apps/voice_ai`, and `dist/apps/nesgame`.

Use Node's built-in `node:test` and temporary directories for isolated tests. Do not depend on ESP32 hardware.

## Documentation

Update:

- `README.md`: add packaging commands.
- `docs/development-plan.md`: mark Phase 2A packager as the next active step and describe output.
- `docs/deployment-flow.md`: add the packager as the manual deployment preparation step.

## Success Criteria

The feature is complete when these commands pass:

```bash
npm run test:packager
npm run package:demos
npm test
npm run validate:apps
git diff --check
git status --short
```

The expected final state includes:

```text
dist/apps/weather/manifest.json
dist/apps/voice_ai/manifest.json
dist/apps/nesgame/manifest.json
```

`dist/` should be git-ignored because it is generated output.
