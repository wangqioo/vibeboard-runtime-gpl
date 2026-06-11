# AI Plan Writer Design

## Goal

Build a local tool that turns an AI package plan JSON file into a VibeBoard Runtime app directory, validates it, and optionally hands it to the existing app packager.

This is the next step after Phase 2A packaging. It does not call an AI model, does not flash firmware, and does not upload to a device.

## Inputs

The input is the JSON shape documented in `docs/ai-generation-contract.md`:

```json
{
  "app": {
    "name": "Timer",
    "entry": "main.lua",
    "description": "Simple countdown timer",
    "capabilities": ["timer"]
  },
  "files": [
    {
      "path": "main.lua",
      "type": "lua",
      "content": "print(\"timer\")\n"
    }
  ]
}
```

`app.info` can be omitted from `files[]`. The writer generates it from `app`.

## Outputs

The default output path is:

```text
generated/apps/<app-id>/
```

`<app-id>` is a normalized app name using the same slug style as the packager.

The writer creates:

```text
generated/apps/<app-id>/app.info
generated/apps/<app-id>/<files from plan>
```

If `--package` is passed, the writer also creates:

```text
dist/apps/<app-id>/
```

by calling the existing app packager.

## Validation Rules

The writer rejects:

- missing `app.name`, `app.entry`, or `app.description`;
- missing or non-array `files`;
- absolute file paths;
- `..` path traversal;
- paths that resolve outside the target app directory;
- file records without string `content`;
- generated plans where `app.entry` is not present after writing files;
- app packages that fail `validateAppDirectory`.

The writer overwrites the target generated app directory by default. This keeps repeated AI repair loops simple and deterministic.

## CLI

Commands:

```bash
npm run write:app-plan -- examples/ai-plans/timer.json
npm run write:app-plan -- examples/ai-plans/timer.json --package
```

Output should print the generated app path. With `--package`, it also prints the package path.

## Architecture

Add `tools/app-plan-writer/`:

- `index.mjs`: parse, validate, write files, run app validation, optionally package.
- `cli.mjs`: thin command-line wrapper.
- `test.mjs`: node:test coverage for valid plans and rejection cases.

The writer reuses `slugifyAppId` from `tools/app-packager/index.mjs` so app IDs stay consistent across generated apps and packaged apps.

## Non-Goals

- No OpenAI API integration yet.
- No web console UI yet.
- No ESP32 upload endpoint yet.
- No zip/tar export yet.
- No binary asset decoding yet; this first version writes text content only.
