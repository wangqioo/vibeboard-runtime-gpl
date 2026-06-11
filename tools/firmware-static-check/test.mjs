import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("../..", import.meta.url).pathname;
const firmwareRoot = join(repoRoot, "firmware/vibeboard_runtime");
const boardHeaderPath = join(firmwareRoot, "main/board_lckfb_szpi_s3.h");
const boardSourcePath = join(firmwareRoot, "main/board_lckfb_szpi_s3.c");
const registrySourcePath = join(firmwareRoot, "main/app_registry.c");

function readRequired(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  return readFileSync(path, "utf8");
}

describe("vibeboard runtime firmware static guardrails", () => {
  it("keeps documented LCKFB display pins", () => {
    const header = readRequired(boardHeaderPath);

    assert.match(header, /VB_LCD_SPI_MOSI\s+GPIO_NUM_40/);
    assert.match(header, /VB_LCD_SPI_CLK\s+GPIO_NUM_41/);
    assert.match(header, /VB_LCD_DC\s+GPIO_NUM_39/);
    assert.match(header, /VB_LCD_BACKLIGHT\s+GPIO_NUM_42/);
    assert.match(header, /VB_LCD_H_RES\s+320/);
    assert.match(header, /VB_LCD_V_RES\s+240/);
  });

  it("keeps documented LCKFB SD pins", () => {
    const header = readRequired(boardHeaderPath);

    assert.match(header, /VB_SD_CLK\s+GPIO_NUM_47/);
    assert.match(header, /VB_SD_CMD\s+GPIO_NUM_48/);
    assert.match(header, /VB_SD_D0\s+GPIO_NUM_21/);
    assert.match(header, /VB_SD_MOUNT_POINT\s+"\/sdcard"/);
  });

  it("does not format SD cards during mount", () => {
    const source = readRequired(boardSourcePath);

    assert.match(source, /\.format_if_mount_failed\s*=\s*false/);
  });

  it("scans the board app directory", () => {
    const header = readRequired(join(firmwareRoot, "main/app_registry.h"));
    const source = readRequired(registrySourcePath);

    assert.match(header, /VB_APPS_PATH\s+"\/sdcard\/apps"/);
    assert.match(source, /VB_APPS_PATH/);
    assert.match(source, /app\.info/);
  });
});
