import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkDevice,
  detectRuntimeStatus,
  isEsp32S3ChipIdOutput,
  parseSerialPorts,
  renderReport,
} from "./index.mjs";

describe("parseSerialPorts", () => {
  it("keeps only usbmodem candidate ports", () => {
    assert.deepEqual(
      parseSerialPorts("/dev/cu.Bluetooth-Incoming-Port\n/dev/cu.usbmodem112301\n/dev/cu.usbserial-1\n"),
      ["/dev/cu.usbmodem112301"],
    );
  });
});

describe("isEsp32S3ChipIdOutput", () => {
  it("recognizes ESP32-S3 chip_id output", () => {
    assert.equal(isEsp32S3ChipIdOutput("Chip is ESP32-S3 (QFN56) (revision v0.2)\nFeatures: WiFi, BLE, Embedded PSRAM 8MB\n"), true);
  });

  it("rejects non-S3 output", () => {
    assert.equal(isEsp32S3ChipIdOutput("Chip is ESP32-C3 (revision v0.4)\n"), false);
  });
});

describe("detectRuntimeStatus", () => {
  it("recognizes VibeBoard Runtime status JSON", () => {
    const status = detectRuntimeStatus('{"runtime":"vibeboard_runtime","version":"0.1.0","state":"idle"}');
    assert.equal(status.seen, true);
    assert.equal(status.reason, "status JSON identifies VibeBoard Runtime");
  });

  it("treats unrelated JSON as reachable but not Runtime", () => {
    const status = detectRuntimeStatus('{"project":"other_firmware"}');
    assert.equal(status.seen, false);
    assert.equal(status.reason, "status JSON did not identify VibeBoard Runtime");
  });
});

describe("checkDevice", () => {
  it("reports port candidates, ESP32-S3 detection, and Runtime status without flashing", async () => {
    const commands = [];
    const result = await checkDevice({
      runCommand: async (cmd, args) => {
        commands.push([cmd, ...args]);
        if (cmd === "esptool.py") return "Chip is ESP32-S3 (QFN56) (revision v0.2)\n";
        throw new Error(`unexpected ${cmd}`);
      },
      listPorts: () => ["/dev/cu.usbmodem112301"],
      fetchStatus: async () => ({
        ok: true,
        status: 200,
        text: '{"runtime":"vibeboard_runtime","state":"idle"}',
      }),
    });

    assert.deepEqual(result.ports.map((port) => port.path), ["/dev/cu.usbmodem112301"]);
    assert.equal(result.ports[0].esp32s3, true);
    assert.equal(result.http.reachable, true);
    assert.equal(result.runtime.seen, true);
    assert.deepEqual(commands, [
      ["esptool.py", "--chip", "esp32s3", "-p", "/dev/cu.usbmodem112301", "chip_id"],
    ]);
  });

  it("falls back to python module esptool when esptool.py is unavailable", async () => {
    const commands = [];
    const result = await checkDevice({
      runCommand: async (cmd, args) => {
        commands.push([cmd, ...args]);
        if (cmd === "esptool.py") throw new Error("ENOENT");
        if (cmd === "python3") return "Chip is ESP32-S3 (QFN56) (revision v0.2)\n";
        throw new Error(`unexpected ${cmd}`);
      },
      listPorts: () => ["/dev/cu.usbmodem112301"],
      fetchStatus: async () => ({
        ok: false,
        status: 404,
        text: "not found",
      }),
    });

    assert.equal(result.ports[0].esp32s3, true);
    assert.deepEqual(commands, [
      ["esptool.py", "--chip", "esp32s3", "-p", "/dev/cu.usbmodem112301", "chip_id"],
      ["python3", "-m", "esptool", "--chip", "esp32s3", "-p", "/dev/cu.usbmodem112301", "chip_id"],
    ]);
  });

  it("degrades gracefully when tools and Runtime are unavailable", async () => {
    const result = await checkDevice({
      runCommand: async (cmd) => {
        throw new Error("missing tool");
      },
      listPorts: () => [],
      fetchStatus: async () => {
        throw new Error("connect EHOSTUNREACH");
      },
    });

    assert.deepEqual(result.ports, []);
    assert.equal(result.http.reachable, false);
    assert.equal(result.runtime.seen, false);
    assert.match(result.nextSteps[0], /connect or power-cycle/i);
  });
});

describe("renderReport", () => {
  it("prints non-destructive wording and next steps", async () => {
    const report = renderReport({
      boardUrl: "http://192.168.1.32:8080",
      ports: [{ path: "/dev/cu.usbmodem112301", esp32s3: false, note: "chip_id did not report ESP32-S3" }],
      http: { reachable: true, status: 200, note: "HTTP 200" },
      runtime: { seen: false, reason: "status JSON did not identify VibeBoard Runtime" },
      nextSteps: ["If this is the shared ESP32-S3 board, check serial boot logs before flashing Runtime manually."],
    });

    assert.match(report, /Non-destructive check only/);
    assert.match(report, /\/dev\/cu\.usbmodem112301/);
    assert.match(report, /VibeBoard Runtime: no/);
    assert.doesNotMatch(report, /write_flash|erase_flash/i);
  });
});
