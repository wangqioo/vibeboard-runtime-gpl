import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildRuntimeWifiConfig, parseWifiConfigCliArgs, writeRuntimeWifiConfig } from "./wifi.mjs";

describe("runtime WiFi config writer", () => {
  it("parses the SD root, SSID, and password", () => {
    assert.deepEqual(
      parseWifiConfigCliArgs(["/Volumes/VIBEBOARD", "--ssid", "Studio WiFi", "--password", "secret"]),
      {
        sdRoot: "/Volumes/VIBEBOARD",
        ssid: "Studio WiFi",
        password: "secret",
      },
    );
  });

  it("accepts equals-style flags and open-network passwords", () => {
    assert.deepEqual(
      parseWifiConfigCliArgs(["--ssid=Guest", "/Volumes/VIBEBOARD"]),
      {
        sdRoot: "/Volumes/VIBEBOARD",
        ssid: "Guest",
        password: "",
      },
    );
  });

  it("rejects a missing SSID", () => {
    assert.throws(
      () => parseWifiConfigCliArgs(["/Volumes/VIBEBOARD", "--password", "secret"]),
      /Missing --ssid/,
    );
  });

  it("builds the runtime wifi.json payload", () => {
    assert.equal(
      buildRuntimeWifiConfig({ ssid: "Studio WiFi", password: "secret" }),
      '{\n  "ssid": "Studio WiFi",\n  "password": "secret"\n}\n',
    );
  });

  it("writes runtime/wifi.json under the SD root", () => {
    const sdRoot = mkdtempSync(join(tmpdir(), "vibeboard-sd-"));
    try {
      const result = writeRuntimeWifiConfig({ sdRoot, ssid: "Studio WiFi", password: "secret" });
      const expectedPath = join(sdRoot, "runtime/wifi.json");

      assert.equal(result.path, expectedPath);
      assert.equal(existsSync(expectedPath), true);
      assert.deepEqual(JSON.parse(readFileSync(expectedPath, "utf8")), {
        ssid: "Studio WiFi",
        password: "secret",
      });
    } finally {
      rmSync(sdRoot, { recursive: true, force: true });
    }
  });
});
