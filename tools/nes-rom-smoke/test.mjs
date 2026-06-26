import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSmokeNesRom, parseNesRomSmokeArgs, uploadSmokeNesRom } from "./index.mjs";

describe("createSmokeNesRom", () => {
  it("creates a legal iNES v1 mapper-0 NROM smoke ROM", () => {
    const rom = createSmokeNesRom();

    assert.equal(rom.length, 16 + 16 * 1024 + 8 * 1024);
    assert.deepEqual([...rom.subarray(0, 4)], [0x4e, 0x45, 0x53, 0x1a]);
    assert.equal(rom[4], 1);
    assert.equal(rom[5], 1);
    assert.equal(rom[6], 0);
    assert.equal(rom[7], 0);

    const prgStart = 16;
    assert.deepEqual([...rom.subarray(prgStart, prgStart + 23)], [
      0xa9, 0x01, 0x8d, 0x15, 0x40,
      0xa9, 0x30, 0x8d, 0x00, 0x40,
      0xa9, 0xfd, 0x8d, 0x02, 0x40,
      0xa9, 0x08, 0x8d, 0x03, 0x40,
      0x4c, 0x15, 0x80,
    ]);
    assert.deepEqual([...rom.subarray(prgStart + 0x3ffa, prgStart + 0x4000)], [
      0x00, 0x80,
      0x00, 0x80,
      0x00, 0x80,
    ]);
  });
});

describe("parseNesRomSmokeArgs", () => {
  it("parses board, app id, path, and no-upload mode", () => {
    assert.deepEqual(
      parseNesRomSmokeArgs([
        "--board",
        "http://board:8080",
        "--app",
        "smoke_nes",
        "--path",
        "roms/smoke.nes",
        "--no-upload",
      ]),
      {
        boardUrl: "http://board:8080",
        appId: "smoke_nes",
        romPath: "roms/smoke.nes",
        upload: false,
      },
    );
  });
});

describe("uploadSmokeNesRom", () => {
  it("uploads the generated ROM through the existing app install endpoint", async () => {
    const calls = [];
    const result = await uploadSmokeNesRom({
      boardUrl: "http://board:8080",
      appId: "smoke_nes",
      romPath: "roms/smoke.nes",
      requestImpl: async (url, body, options = {}) => {
        calls.push({ url, bodyLength: body.length, method: options.method, timeoutMs: options.timeoutMs });
        return { ok: true, status: 200, text: "ok\n" };
      },
    });

    assert.equal(result.bytes, 24592);
    assert.equal(result.path, "roms/smoke.nes");
    assert.deepEqual(calls, [
      {
        url: "http://board:8080/stop",
        bodyLength: 0,
        method: "POST",
        timeoutMs: undefined,
      },
      {
        url: "http://board:8080/install?app=smoke_nes&path=roms/smoke.nes",
        bodyLength: 24592,
        method: "POST",
        timeoutMs: 30000,
      },
    ]);
  });
});
