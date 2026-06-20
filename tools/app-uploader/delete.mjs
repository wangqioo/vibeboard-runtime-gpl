#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { createNcRequest, deleteApp } from "./index.mjs";

function usage() {
  console.error("Usage: node tools/app-uploader/delete.mjs [--transport native|nc] [--no-stop] <board-url> <app-id>");
  console.error("Example: node tools/app-uploader/delete.mjs http://192.168.1.32:8080 smoke_visual_remote");
}

export function parseDeleteCliArgs(argv) {
  const args = [...argv];
  let transport = "native";
  let stopIfRunning = true;
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
    if (arg === "--no-stop") {
      stopIfRunning = false;
      continue;
    }
    positional.push(arg);
  }

  if (!["native", "nc"].includes(transport)) {
    throw new Error(`Unsupported transport: ${transport || "(empty)"}`);
  }

  const [boardUrl, appId] = positional;
  return { boardUrl, appId, transport, stopIfRunning };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseDeleteCliArgs(process.argv.slice(2));
  if (!options.boardUrl || !options.appId || options.boardUrl === "-h" || options.boardUrl === "--help") {
    usage();
    process.exit(options.boardUrl === "-h" || options.boardUrl === "--help" ? 0 : 1);
  }

  try {
    const requestImpl = options.transport === "nc" ? createNcRequest() : undefined;
    const result = await deleteApp({
      boardUrl: options.boardUrl,
      appId: options.appId,
      requestImpl,
      stopIfRunning: options.stopIfRunning,
    });
    const stopped = result.stopped ? " after stop" : "";
    console.log(`deleted ${result.deleted || options.appId}${stopped}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
