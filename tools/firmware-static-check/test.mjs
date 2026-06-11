import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("../..", import.meta.url).pathname;
const firmwareRoot = join(repoRoot, "firmware/vibeboard_runtime");
const boardHeaderPath = join(firmwareRoot, "main/board_lckfb_szpi_s3.h");
const boardSourcePath = join(firmwareRoot, "main/board_lckfb_szpi_s3.c");
const registrySourcePath = join(firmwareRoot, "main/app_registry.c");
const registryHeaderPath = join(firmwareRoot, "main/app_registry.h");
const runnerSourcePath = join(firmwareRoot, "main/app_runner.c");
const mainSourcePath = join(firmwareRoot, "main/main.c");
const luaLvglSourcePath = join(firmwareRoot, "main/lua_lvgl.c");
const luaLvglHeaderPath = join(firmwareRoot, "main/lua_lvgl.h");
const smokeUiSourcePath = join(repoRoot, "apps/smoke_ui/main.lua");

function readRequired(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  return readFileSync(path, "utf8");
}

describe("vibeboard runtime firmware static guardrails", () => {
  it("keeps documented LCKFB display pins", () => {
    const header = readRequired(boardHeaderPath);
    const source = readRequired(boardSourcePath);

    assert.match(header, /VB_LCD_SPI_MOSI\s+GPIO_NUM_40/);
    assert.match(header, /VB_LCD_SPI_CLK\s+GPIO_NUM_41/);
    assert.match(header, /VB_LCD_DC\s+GPIO_NUM_39/);
    assert.match(header, /VB_LCD_BACKLIGHT\s+GPIO_NUM_42/);
    assert.match(header, /VB_LCD_H_RES\s+320/);
    assert.match(header, /VB_LCD_V_RES\s+240/);
    assert.match(source, /\.flags\.output_invert\s*=\s*true/);
    assert.match(source, /Setting LCD backlight: 100%%/);
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
    const header = readRequired(registryHeaderPath);
    const source = readRequired(registrySourcePath);

    assert.match(header, /VB_APPS_PATH\s+"\/sdcard\/apps"/);
    assert.match(source, /VB_APPS_PATH/);
    assert.match(source, /app\.info/);
  });

  it("tracks the first app entry path for execution", () => {
    const header = readRequired(registryHeaderPath);
    const source = readRequired(registrySourcePath);

    assert.match(header, /first_app_entry/);
    assert.match(header, /first_app_path/);
    assert.match(source, /entry/);
    assert.match(source, /main\.lua/);
  });

  it("runs the first app through a Lua runner", () => {
    const runner = readRequired(runnerSourcePath);
    const main = readRequired(mainSourcePath);

    assert.match(runner, /VB_LUA_TASK_STACK_SIZE/);
    assert.match(runner, /xTaskCreatePinnedToCore/);
    assert.match(runner, /luaL_newstate/);
    assert.match(runner, /luaL_openlibs/);
    assert.match(runner, /luaL_dofile/);
    assert.match(runner, /Lua app ok/);
    assert.match(main, /vb_app_runner_run/);
  });

  it("registers a minimal LVGL Lua surface", () => {
    const header = readRequired(luaLvglHeaderPath);
    const source = readRequired(luaLvglSourcePath);
    const runner = readRequired(runnerSourcePath);

    assert.match(header, /vb_lua_lvgl_register/);
    assert.match(source, /lvgl_port_lock/);
    assert.match(source, /lv_scr_act/);
    assert.match(source, /lv_obj_create/);
    assert.match(source, /lv_obj_clean/);
    assert.match(source, /lv_obj_set_size/);
    assert.match(source, /lv_obj_set_width/);
    assert.match(source, /lv_obj_set_height/);
    assert.match(source, /lv_obj_set_style_bg_color/);
    assert.match(source, /lv_obj_set_style_text_color/);
    assert.match(source, /lv_obj_set_style_radius/);
    assert.match(source, /lv_obj_set_style_pad_all/);
    assert.match(source, /lv_obj_set_style_border_width/);
    assert.match(source, /lv_obj_set_style_border_color/);
    assert.match(source, /lv_label_create/);
    assert.match(source, /lv_label_set_text/);
    assert.match(source, /lv_obj_align/);
    assert.match(source, /LV_ALIGN_CENTER/);
    assert.match(source, /LV_ALIGN_TOP_LEFT/);
    assert.match(source, /LV_ALIGN_TOP_MID/);
    assert.match(source, /LV_ALIGN_BOTTOM_LEFT/);
    assert.match(runner, /vb_lua_lvgl_register\(L\)/);
  });

  it("ships a Lua weather card smoke UI app", () => {
    const source = readRequired(smokeUiSourcePath);

    assert.match(source, /lv_scr_act\(\)/);
    assert.match(source, /lv_obj_clean\(root\)/);
    assert.match(source, /lv_obj_set_style_bg_color\(root,\s*0x[0-9a-fA-F]+\)/);
    assert.match(source, /lv_obj_create\(root\)/);
    assert.match(source, /lv_obj_set_size\(card,\s*288,\s*196\)/);
    assert.match(source, /lv_label_set_text\(title,\s*"VibeBoard Weather"\)/);
    assert.match(source, /lv_label_set_text\(location,\s*"Shenzhen"\)/);
    assert.match(source, /lv_label_set_text\(temp,\s*"26C"\)/);
    assert.match(source, /lv_label_set_text\(condition,\s*"Cloudy"\)/);
    assert.match(source, /Humidity 68%/);
    assert.match(source, /Wind 12 km\/h/);
    assert.match(source, /weather card ok/);
  });
});
