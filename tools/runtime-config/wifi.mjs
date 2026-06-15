#!/usr/bin/env node
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

function usage() {
  console.error("Usage: node tools/runtime-config/wifi.mjs <sd-root> --ssid <ssid> [--password <password>]");
  console.error("Example: node tools/runtime-config/wifi.mjs /Volumes/VIBEBOARD --ssid \"Studio WiFi\" --password \"secret\"");
}

function requireValue(args, flag) {
  const value = args.shift();
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function validateWifiConfig({ sdRoot, ssid, password }) {
  if (!sdRoot) {
    throw new Error("Missing SD root path");
  }
  if (!ssid) {
    throw new Error("Missing --ssid");
  }
  if (Buffer.byteLength(ssid, "utf8") > 32) {
    throw new Error("SSID must be 32 bytes or fewer");
  }
  if (Buffer.byteLength(password || "", "utf8") > 64) {
    throw new Error("WiFi password must be 64 bytes or fewer");
  }
}

export function parseWifiConfigCliArgs(argv) {
  const args = [...argv];
  const positional = [];
  let ssid = "";
  let password = "";

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--ssid") {
      ssid = requireValue(args, "--ssid");
      continue;
    }
    if (arg.startsWith("--ssid=")) {
      ssid = arg.slice("--ssid=".length);
      continue;
    }
    if (arg === "--password") {
      password = requireValue(args, "--password");
      continue;
    }
    if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  const [sdRoot] = positional;
  const result = { sdRoot, ssid, password };
  validateWifiConfig(result);
  return result;
}

export function buildRuntimeWifiConfig({ ssid, password = "" }) {
  validateWifiConfig({ sdRoot: ".", ssid, password });
  return `${JSON.stringify({ ssid, password }, null, 2)}\n`;
}

export function writeRuntimeWifiConfig({ sdRoot, ssid, password = "" }) {
  validateWifiConfig({ sdRoot, ssid, password });
  const rootStats = statSync(sdRoot);
  if (!rootStats.isDirectory()) {
    throw new Error(`SD root is not a directory: ${sdRoot}`);
  }

  const path = join(sdRoot, "runtime/wifi.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buildRuntimeWifiConfig({ ssid, password }), { mode: 0o600 });
  return { path };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    usage();
    process.exit(0);
  }

  try {
    const options = parseWifiConfigCliArgs(process.argv.slice(2));
    const result = writeRuntimeWifiConfig(options);
    console.log(`wrote ${result.path}`);
  } catch (error) {
    usage();
    console.error(error.message);
    process.exit(1);
  }
}
