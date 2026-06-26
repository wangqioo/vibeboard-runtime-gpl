#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createNcRequest, runRuntimeConfigSmoke } from "./index.mjs";

function usage() {
  console.error("Usage: node tools/app-uploader/runtime-config-smoke.mjs [--transport native|nc] [--reboot] [--reboot-polls <n>] [--reboot-delay-ms <ms>] [--expect-app-count <n>] [--expect-ip <ip>] <board-url> <wifi|cubicserver|i2s> <json-file|-|json>");
  console.error("Example: node tools/app-uploader/runtime-config-smoke.mjs http://192.168.1.32:8080 i2s '{\"bclk_pin\":1,\"ws_pin\":2,\"din_pin\":3}'");
}

export function parseRuntimeConfigSmokeCliArgs(argv) {
  const args = [...argv];
  let transport = "native";
  let reboot = false;
  let rebootPolls = 30;
  let rebootDelayMs = 1000;
  let expectAppCount = null;
  let expectIp = "";

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
    if (arg === "--reboot") {
      reboot = true;
      args.splice(index, 1);
      continue;
    }
    if (arg === "--reboot-polls") {
      rebootPolls = Number(args[index + 1]);
      args.splice(index, 2);
      continue;
    }
    if (arg.startsWith("--reboot-polls=")) {
      rebootPolls = Number(arg.slice("--reboot-polls=".length));
      args.splice(index, 1);
      continue;
    }
    if (arg === "--reboot-delay-ms") {
      rebootDelayMs = Number(args[index + 1]);
      args.splice(index, 2);
      continue;
    }
    if (arg.startsWith("--reboot-delay-ms=")) {
      rebootDelayMs = Number(arg.slice("--reboot-delay-ms=".length));
      args.splice(index, 1);
      continue;
    }
    if (arg === "--expect-app-count") {
      expectAppCount = Number(args[index + 1]);
      args.splice(index, 2);
      continue;
    }
    if (arg.startsWith("--expect-app-count=")) {
      expectAppCount = Number(arg.slice("--expect-app-count=".length));
      args.splice(index, 1);
      continue;
    }
    if (arg === "--expect-ip") {
      expectIp = args[index + 1] || "";
      args.splice(index, 2);
      continue;
    }
    if (arg.startsWith("--expect-ip=")) {
      expectIp = arg.slice("--expect-ip=".length);
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
  if (!Number.isInteger(rebootPolls) || rebootPolls < 1) {
    throw new Error("Invalid --reboot-polls");
  }
  if (!Number.isInteger(rebootDelayMs) || rebootDelayMs < 0) {
    throw new Error("Invalid --reboot-delay-ms");
  }
  if (expectAppCount !== null && (!Number.isInteger(expectAppCount) || expectAppCount < 0)) {
    throw new Error("Invalid --expect-app-count");
  }
  return { boardUrl: args[0], name: args[1], source: args[2], transport, reboot, rebootPolls, rebootDelayMs, expectAppCount, expectIp };
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
    const options = parseRuntimeConfigSmokeCliArgs(process.argv.slice(2));
    const body = readConfigBody(options.source);
    JSON.parse(body);
    const requestImpl = options.transport === "nc" ? createNcRequest() : undefined;
    const result = await runRuntimeConfigSmoke({
      boardUrl: options.boardUrl,
      name: options.name,
      body,
      requestImpl,
      reboot: options.reboot,
      rebootPolls: options.rebootPolls,
      rebootDelayMs: options.rebootDelayMs,
      expectAppCount: options.expectAppCount,
      expectIp: options.expectIp,
    });
    console.log(
      `runtime config smoke ok: ${result.config.config} state=${result.status.state} runtime=${result.status.runtime_version} polls=${result.statusPolls}`,
    );
  } catch (error) {
    usage();
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
