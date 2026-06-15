#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { createNcRequest, uploadApp } from "./index.mjs";

function usage() {
  console.error("Usage: node tools/app-uploader/cli.mjs [--transport native|nc] [--mode staged|direct] <board-url> <dist-app-dir> [app-id]");
  console.error("Example: node tools/app-uploader/cli.mjs http://192.168.1.32:8080 dist/apps/smoke_network smoke_network");
}

export function parseUploadCliArgs(argv) {
  const args = [...argv];
  let transport = "native";
  let mode = "staged";
  const positional = [];

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--transport") {
      transport = args.shift() || "";
      continue;
    }
    if (arg.startsWith("--transport=")) {
      transport = arg.slice("--transport=".length);
      continue;
    }
    if (arg === "--mode") {
      mode = args.shift() || "";
      continue;
    }
    if (arg.startsWith("--mode=")) {
      mode = arg.slice("--mode=".length);
      continue;
    }
    positional.push(arg);
  }

  if (!["native", "nc"].includes(transport)) {
    throw new Error(`Unsupported transport: ${transport || "(empty)"}`);
  }
  if (!["staged", "direct"].includes(mode)) {
    throw new Error(`Unsupported upload mode: ${mode || "(empty)"}`);
  }

  const [boardUrl, appDir, appId] = positional;
  return { boardUrl, appDir, appId, transport, mode };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseUploadCliArgs(process.argv.slice(2));
  if (!options.boardUrl || !options.appDir || options.boardUrl === "-h" || options.boardUrl === "--help") {
    usage();
    process.exit(options.boardUrl === "-h" || options.boardUrl === "--help" ? 0 : 1);
  }

  try {
    const requestImpl = options.transport === "nc" ? createNcRequest() : undefined;
    const result = await uploadApp({
      appDir: options.appDir,
      boardUrl: options.boardUrl,
      appId: options.appId,
      requestImpl,
      mode: options.mode,
    });
    for (const file of result.files) {
      console.log(`uploaded ${result.appId}/${file.relativePath} ${file.size} bytes`);
    }
    console.log(`uploaded ${result.files.length} files`);
    if (result.confirmed) {
      console.log(`rescan ok; confirmed ${result.appId} in /apps`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
