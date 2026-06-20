import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { request as httpRequest } from "node:http";

const DEFAULT_BOARD_URL = "http://192.168.1.32:8080";

function runCommand(cmd, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      if (code === 0) {
        resolve(output);
        return;
      }
      const errorText = Buffer.concat(stderr).toString("utf8") || output;
      reject(new Error(`${cmd} exited ${code}: ${errorText.trim()}`));
    });
  });
}

function fetchText(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: "GET", timeout: timeoutMs }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          text,
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error(`timed out after ${timeoutMs}ms`)));
    request.on("error", reject);
    request.end();
  });
}

export function parseSerialPorts(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\/dev\/cu\.usbmodem/.test(line))
    .sort();
}

function listUsbModemPorts() {
  return readdirSync("/dev")
    .filter((entry) => entry.startsWith("cu.usbmodem"))
    .map((entry) => `/dev/${entry}`)
    .sort();
}

export function isEsp32S3ChipIdOutput(output) {
  return /Chip is ESP32-S3\b/i.test(output) || /\bESP32-S3\b/i.test(output);
}

export function detectRuntimeStatus(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { seen: false, reason: "status response was not JSON" };
  }

  const values = [
    parsed.runtime,
    parsed.project,
    parsed.project_name,
    parsed.name,
    parsed.id,
  ].filter((value) => typeof value === "string");
  const combined = values.join(" ").toLowerCase();
  if (combined.includes("vibeboard")) {
    return { seen: true, reason: "status JSON identifies VibeBoard Runtime", json: parsed };
  }
  if (parsed.package_schema || parsed.lua_api_version || parsed.lvgl_api_version) {
    return { seen: true, reason: "status JSON exposes VibeBoard Runtime metadata", json: parsed };
  }
  return { seen: false, reason: "status JSON did not identify VibeBoard Runtime", json: parsed };
}

async function checkPort(path, runner) {
  const attempts = [
    ["esptool.py", ["--chip", "esp32s3", "-p", path, "chip_id"]],
    ["python3", ["-m", "esptool", "--chip", "esp32s3", "-p", path, "chip_id"]],
  ];
  const errors = [];

  for (const [cmd, args] of attempts) {
    try {
      const output = await runner(cmd, args);
      const esp32s3 = isEsp32S3ChipIdOutput(output);
      return {
        path,
        esp32s3,
        note: esp32s3 ? `${cmd} chip_id reports ESP32-S3` : `${cmd} chip_id did not report ESP32-S3`,
      };
    } catch (error) {
      errors.push(`${cmd}: ${error.message}`);
    }
  }

  return {
    path,
    esp32s3: false,
    note: `chip_id unavailable: ${errors.join("; ")}`,
  };
}

function makeNextSteps({ ports, http, runtime }) {
  if (ports.length === 0) {
    return ["Connect or power-cycle the shared ESP32-S3 board, then rerun npm run device:check."];
  }
  if (!ports.some((port) => port.esp32s3)) {
    return ["Confirm the selected /dev/cu.usbmodem* is the shared ESP32-S3 board before any VibeBoard hardware test."];
  }
  if (!http.reachable) {
    return ["ESP32-S3 is visible over USB, but Runtime HTTP status is unreachable. Check serial boot logs and WiFi before uploading apps."];
  }
  if (!runtime.seen) {
    return ["HTTP is reachable, but it does not look like VibeBoard Runtime. If this is the shared board, inspect serial boot logs and only flash Runtime manually when ready to test."];
  }
  return ["VibeBoard Runtime appears reachable. Continue with app upload/launch verification."];
}

export async function checkDevice({
  boardUrl = DEFAULT_BOARD_URL,
  runCommand: runner = runCommand,
  fetchStatus = (url) => fetchText(url),
  listPorts = listUsbModemPorts,
} = {}) {
  let ports = [];
  try {
    ports = listPorts();
  } catch {
    ports = [];
  }

  const checkedPorts = [];
  for (const path of ports) {
    checkedPorts.push(await checkPort(path, runner));
  }

  const statusUrl = `${boardUrl.replace(/\/+$/, "")}/status`;
  let http;
  let runtime = { seen: false, reason: "status was not checked" };
  try {
    const response = await fetchStatus(statusUrl);
    http = {
      reachable: response.ok,
      status: response.status,
      note: `HTTP ${response.status}`,
    };
    runtime = response.ok
      ? detectRuntimeStatus(response.text)
      : { seen: false, reason: `status endpoint returned HTTP ${response.status}` };
  } catch (error) {
    http = {
      reachable: false,
      status: null,
      note: error.message,
    };
    runtime = { seen: false, reason: "status endpoint unreachable" };
  }

  const result = { boardUrl, ports: checkedPorts, http, runtime };
  result.nextSteps = makeNextSteps(result);
  return result;
}

function yesNo(value) {
  return value ? "yes" : "no";
}

export function renderReport(result) {
  const lines = [
    "VibeBoard shared ESP32-S3 device check",
    "Non-destructive check only: no erase, no flash, no writes.",
    "",
    `Runtime status URL: ${result.boardUrl.replace(/\/+$/, "")}/status`,
    "",
    "Candidate serial ports:",
  ];

  if (result.ports.length === 0) {
    lines.push("  none found matching /dev/cu.usbmodem*");
  } else {
    for (const port of result.ports) {
      lines.push(`  ${port.path}`);
      lines.push(`    ESP32-S3: ${yesNo(port.esp32s3)}`);
      lines.push(`    note: ${port.note}`);
    }
  }

  lines.push("");
  lines.push(`HTTP /status reachable: ${yesNo(result.http.reachable)}${result.http.status ? ` (${result.http.status})` : ""}`);
  lines.push(`HTTP note: ${result.http.note}`);
  lines.push(`VibeBoard Runtime: ${yesNo(result.runtime.seen)}`);
  lines.push(`Runtime note: ${result.runtime.reason}`);
  lines.push("");
  lines.push("Next step:");
  for (const step of result.nextSteps) {
    lines.push(`  - ${step}`);
  }

  return `${lines.join("\n")}\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const boardUrl = argv[0] || DEFAULT_BOARD_URL;
  const result = await checkDevice({ boardUrl });
  process.stdout.write(renderReport(result));
  return result.runtime.seen ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
