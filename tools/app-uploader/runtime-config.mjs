#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createNcRequest, setRuntimeConfig } from "./index.mjs";

function usage() {
  console.error("Usage: node tools/app-uploader/runtime-config.mjs [--transport native|nc] <board-url> <wifi|cubicserver|i2s> <json-file|-|json>");
  console.error("Example: node tools/app-uploader/runtime-config.mjs http://192.168.1.32:8080 wifi runtime/wifi.local.json");
}

export function parseRuntimeConfigCliArgs(argv) {
  const args = [...argv];
  let transport = "native";

  for (let index = 0; index < args.length;) {
    const arg = args[index];
    if (arg === "--transport") {
      transport = args[index + 1];
      args.splice(index, 2);
      continue;
    }
    if (arg.startsWith("--transport=")) {
      transport = arg.slice("--transport=".length);
      args.splice(index, 1);
      continue;
    }
    index++;
  }

  if (!["native", "nc"].includes(transport)) {
    throw new Error(`Unsupported transport: ${transport}`);
  }
  if (args.length !== 3) {
    throw new Error("Missing required arguments");
  }
  return { boardUrl: args[0], name: args[1], source: args[2], transport };
}

function readConfigBody(source) {
  if (source === "-") {
    return readFileSync(0, "utf8");
  }
  if (source.trim().startsWith("{")) {
    return source;
  }
  return readFileSync(source, "utf8");
}

async function main() {
  try {
    const options = parseRuntimeConfigCliArgs(process.argv.slice(2));
    const body = readConfigBody(options.source);
    JSON.parse(body);
    const requestImpl = options.transport === "nc" ? createNcRequest() : undefined;
    const result = await setRuntimeConfig({
      boardUrl: options.boardUrl,
      name: options.name,
      body,
      requestImpl,
    });
    console.log(`updated runtime config ${result.config}`);
  } catch (error) {
    usage();
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
