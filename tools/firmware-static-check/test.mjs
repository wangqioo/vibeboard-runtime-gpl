import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const firmwareRoot = join(repoRoot, "firmware/vibeboard_runtime");
const boardHeaderPath = join(firmwareRoot, "main/board_lckfb_szpi_s3.h");
const boardSourcePath = join(firmwareRoot, "main/board_lckfb_szpi_s3.c");
const registrySourcePath = join(firmwareRoot, "main/app_registry.c");
const registryHeaderPath = join(firmwareRoot, "main/app_registry.h");
const runnerSourcePath = join(firmwareRoot, "main/app_runner.c");
const runnerHeaderPath = join(firmwareRoot, "main/app_runner.h");
const installServiceSourcePath = join(firmwareRoot, "main/install_service.c");
const installServiceHeaderPath = join(firmwareRoot, "main/install_service.h");
const launcherHeaderPath = join(firmwareRoot, "main/launcher_ui.h");
const launcherSourcePath = join(firmwareRoot, "main/launcher_ui.c");
const mainSourcePath = join(firmwareRoot, "main/main.c");
const luaLvglSourcePath = join(firmwareRoot, "main/lua_lvgl.c");
const luaLvglHeaderPath = join(firmwareRoot, "main/lua_lvgl.h");
const luaLvglInternalHeaderPath = join(firmwareRoot, "main/lua_lvgl_internal.h");
const luaLvglFsSourcePath = join(firmwareRoot, "main/lua_lvgl_fs.c");
const luaLvglCanvasSourcePath = join(firmwareRoot, "main/lua_lvgl_canvas.c");
const luaLvglWidgetsSourcePath = join(firmwareRoot, "main/lua_lvgl_widgets.c");
const luaFileSourcePath = join(firmwareRoot, "main/lua_file.c");
const luaFileHeaderPath = join(firmwareRoot, "main/lua_file.h");
const luaHttpSourcePath = join(firmwareRoot, "main/lua_http.c");
const luaHttpHeaderPath = join(firmwareRoot, "main/lua_http.h");
const luaSjsonSourcePath = join(firmwareRoot, "main/lua_sjson.c");
const luaSjsonHeaderPath = join(firmwareRoot, "main/lua_sjson.h");
const luaTmrSourcePath = join(firmwareRoot, "main/lua_tmr.c");
const luaTmrHeaderPath = join(firmwareRoot, "main/lua_tmr.h");
const luaKeySourcePath = join(firmwareRoot, "main/lua_key.c");
const luaKeyHeaderPath = join(firmwareRoot, "main/lua_key.h");
const luaGamepadSourcePath = join(firmwareRoot, "main/lua_gamepad.c");
const luaGamepadHeaderPath = join(firmwareRoot, "main/lua_gamepad.h");
const luaI2sSourcePath = join(firmwareRoot, "main/lua_i2s.c");
const luaI2sHeaderPath = join(firmwareRoot, "main/lua_i2s.h");
const luaNativeModuleSourcePath = join(firmwareRoot, "main/lua_native_module.c");
const luaNativeModuleHeaderPath = join(firmwareRoot, "main/lua_native_module.h");
const luaAppSourcePath = join(firmwareRoot, "main/lua_app.c");
const luaAppHeaderPath = join(firmwareRoot, "main/lua_app.h");
const nativeModuleLoaderSourcePath = join(firmwareRoot, "main/native_module_loader.c");
const nativeModuleLoaderHeaderPath = join(firmwareRoot, "main/native_module_loader.h");
const moduleHostApiSourcePath = join(firmwareRoot, "main/module_host_api.c");
const moduleHostApiHeaderPath = join(firmwareRoot, "main/module_host_api.h");
const nativeModuleStaticAdapterSourcePath = join(firmwareRoot, "main/native_module_static_adapter.c");
const nativeModuleStaticAdapterHeaderPath = join(firmwareRoot, "main/native_module_static_adapter.h");
const nesNativeAdapterSourcePath = join(firmwareRoot, "main/nes_native_adapter.c");
const nesNativeAdapterHeaderPath = join(firmwareRoot, "main/nes_native_adapter.h");
const nesHostShimSourcePath = join(firmwareRoot, "main/nes_host_v1_shim.c");
const nesHostShimHeaderPath = join(firmwareRoot, "main/nes_host_v1_shim.h");
const upstreamNesRoot = join(repoRoot, "modules/nes");
const upstreamNesCoreBridgeHeaderPath = join(upstreamNesRoot, "runtime/nes_core_bridge.h");
const upstreamNesPortHeaderPath = join(upstreamNesRoot, "port/nes_port.h");
const upstreamNesArduinoHeaderPath = join(upstreamNesRoot, "port/Arduino.h");
const upstreamNesAudioHeaderPath = join(upstreamNesRoot, "audio/nes_audio_out.h");
const moduleAbiHeaderPath = join(firmwareRoot, "main/module_abi.h");
const luaTimeSourcePath = join(firmwareRoot, "main/lua_time.c");
const luaTimeHeaderPath = join(firmwareRoot, "main/lua_time.h");
const luaWifiSourcePath = join(firmwareRoot, "main/lua_wifi.c");
const luaWifiHeaderPath = join(firmwareRoot, "main/lua_wifi.h");
const runtimeWifiSourcePath = join(firmwareRoot, "main/runtime_wifi.c");
const runtimeWifiHeaderPath = join(firmwareRoot, "main/runtime_wifi.h");
const cmakePath = join(firmwareRoot, "main/CMakeLists.txt");
const linkerFragmentPath = join(firmwareRoot, "main/linker.lf");
const partitionsPath = join(firmwareRoot, "partitions.csv");
const sdkconfigDefaultsPath = join(firmwareRoot, "sdkconfig.defaults");
const smokeUiSourcePath = join(repoRoot, "apps/smoke_ui/main.lua");
const smokeFileInfoPath = join(repoRoot, "apps/smoke_file/app.info");
const smokeFileSourcePath = join(repoRoot, "apps/smoke_file/main.lua");
const smokeFileConfigPath = join(repoRoot, "apps/smoke_file/config.json");
const smokeAssetsInfoPath = join(repoRoot, "apps/smoke_assets/app.info");
const smokeAssetsSourcePath = join(repoRoot, "apps/smoke_assets/main.lua");
const smokeAssetsImagePath = join(repoRoot, "apps/smoke_assets/assets/icon.bin");
const smokeVisualInfoPath = join(repoRoot, "apps/smoke_visual/app.info");
const smokeVisualSourcePath = join(repoRoot, "apps/smoke_visual/main.lua");
const smokeVisualBmpPath = join(repoRoot, "apps/smoke_visual/assets/icon.bmp");
const smokeControlsInfoPath = join(repoRoot, "apps/smoke_controls/app.info");
const smokeControlsSourcePath = join(repoRoot, "apps/smoke_controls/main.lua");
const smokeNetworkInfoPath = join(repoRoot, "apps/smoke_network/app.info");
const smokeNetworkSourcePath = join(repoRoot, "apps/smoke_network/main.lua");
const smokeNetworkConfigPath = join(repoRoot, "apps/smoke_network/wifi.example.json");
const smokeFailInfoPath = join(repoRoot, "apps/smoke_fail/app.info");
const smokeFailSourcePath = join(repoRoot, "apps/smoke_fail/main.lua");
const smokeTimerInfoPath = join(repoRoot, "apps/smoke_timer/app.info");
const smokeTimerSourcePath = join(repoRoot, "apps/smoke_timer/main.lua");
const smokeKeyInfoPath = join(repoRoot, "apps/smoke_key/app.info");
const smokeKeySourcePath = join(repoRoot, "apps/smoke_key/main.lua");
const smokeTouchInfoPath = join(repoRoot, "apps/smoke_touch/app.info");
const smokeTouchSourcePath = join(repoRoot, "apps/smoke_touch/main.lua");
const smokeGamepadInfoPath = join(repoRoot, "apps/smoke_gamepad/app.info");
const smokeGamepadSourcePath = join(repoRoot, "apps/smoke_gamepad/main.lua");
const smokeI2sInfoPath = join(repoRoot, "apps/smoke_i2s/app.info");
const smokeI2sSourcePath = join(repoRoot, "apps/smoke_i2s/main.lua");
const smokeNesInfoPath = join(repoRoot, "apps/smoke_nes/app.info");
const smokeNesSourcePath = join(repoRoot, "apps/smoke_nes/main.lua");
const smokeNesNativeManifestPath = join(repoRoot, "apps/smoke_nes/native/nes.vbn");
const smokeAppManagerInfoPath = join(repoRoot, "apps/smoke_app_manager/app.info");
const smokeAppManagerSourcePath = join(repoRoot, "apps/smoke_app_manager/main.lua");
const matrixRainInfoPath = join(repoRoot, "apps/matrix_rain/app.info");
const matrixRainSourcePath = join(repoRoot, "apps/matrix_rain/main.lua");
const nixieClockInfoPath = join(repoRoot, "apps/nixie_clock/app.info");
const nixieClockSourcePath = join(repoRoot, "apps/nixie_clock/main.lua");
const nixieClockDigitPath = join(repoRoot, "apps/nixie_clock/assets/digit_0.png");
const nixieClockTubePath = join(repoRoot, "apps/nixie_clock/assets/tube_off.png");
const clockInfoPath = join(repoRoot, "apps/clock/app.info");
const clockSourcePath = join(repoRoot, "apps/clock/main.lua");
const clockDialPath = join(repoRoot, "apps/clock/assets/dial.png");
const clockHourPath = join(repoRoot, "apps/clock/assets/hour.png");
const conwayLifeInfoPath = join(repoRoot, "apps/conway_life/app.info");
const conwayLifeSourcePath = join(repoRoot, "apps/conway_life/main.lua");
const conwayLifeFontPath = join(repoRoot, "apps/conway_life/font/time_46.bin");
const fluidPendantInfoPath = join(repoRoot, "apps/fluid_pendant/app.info");
const fluidPendantSourcePath = join(repoRoot, "apps/fluid_pendant/main.lua");
const fluidPendantFontPath = join(repoRoot, "apps/fluid_pendant/font/time_46.bin");
const app2048InfoPath = join(repoRoot, "apps/2048/app.info");
const app2048SourcePath = join(repoRoot, "apps/2048/main.lua");
const app2048FontPath = join(repoRoot, "apps/2048/font/tile_18.bin");
const weatherInfoPath = join(repoRoot, "apps/weather/app.info");
const weatherSourcePath = join(repoRoot, "apps/weather/main.lua");
const voiceAiInfoPath = join(repoRoot, "apps/voice_ai/app.info");
const voiceAiSourcePath = join(repoRoot, "apps/voice_ai/main.lua");
const nesgameInfoPath = join(repoRoot, "apps/nesgame/app.info");
const nesgameSourcePath = join(repoRoot, "apps/nesgame/main.lua");
const nesgameNativeManifestPath = join(repoRoot, "apps/nesgame/native/nes.vbn");

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

  it("uses a runtime-sized app partition for network-enabled firmware", () => {
    const defaults = readRequired(sdkconfigDefaultsPath);
    const partitions = readRequired(partitionsPath);

    assert.match(defaults, /CONFIG_PARTITION_TABLE_CUSTOM=y/);
    assert.match(defaults, /CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions\.csv"/);
    assert.match(partitions, /factory,\s+app,\s+factory,\s+0x10000,\s+0x400000/);
  });

  it("keeps the main task stack large enough for SD app scanning", () => {
    const defaults = readRequired(sdkconfigDefaultsPath);

    assert.match(defaults, /CONFIG_ESP_MAIN_TASK_STACK_SIZE=8192/);
    assert.match(defaults, /CONFIG_FATFS_LFN_STACK=y/);
  });

  it("reserves internal DMA memory for SD-backed Lua apps", () => {
    const defaults = readRequired(sdkconfigDefaultsPath);
    const board = readRequired(boardSourcePath);

    assert.match(defaults, /CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL=2048/);
    assert.match(defaults, /CONFIG_SPIRAM_MALLOC_RESERVE_INTERNAL=65536/);
    assert.match(defaults, /# CONFIG_FATFS_ALLOC_PREFER_EXTRAM is not set/);
    assert.match(board, /host\.flags\s*\|=\s*SDMMC_HOST_FLAG_ALLOC_ALIGNED_BUF/);
  });

  it("lets the LVGL flush wait loop yield to the scheduler", () => {
    const source = readRequired(boardSourcePath);
    const header = readRequired(boardHeaderPath);

    assert.match(source, /lvgl_flush_wait_callback/);
    assert.match(source, /disp->driver->wait_cb\s*=\s*lvgl_flush_wait_callback/);
    assert.match(source, /vTaskDelay\(pdMS_TO_TICKS\(1\)\)/);
    assert.match(source, /\.buff_dma\s*=\s*true/);
    assert.match(source, /\.buff_spiram\s*=\s*false/);
    assert.match(header, /VB_LCD_DRAW_BUF_HEIGHT\s+5/);
  });

  it("routes native display DMA writes through the board LCD panel", () => {
    const header = readRequired(boardHeaderPath);
    const source = readRequired(boardSourcePath);
    const hostApi = readRequired(moduleHostApiSourcePath);

    assert.match(header, /vb_board_draw_rgb565/);
    assert.match(source, /esp_lcd_panel_draw_bitmap\(lcd_panel/);
    assert.match(source, /vb_board_draw_rgb565/);
    assert.match(hostApi, /board_lckfb_szpi_s3\.h/);
    assert.match(hostApi, /vb_board_draw_rgb565\(x,\s*y,\s*width,\s*height,\s*rgb565\)/);
    assert.doesNotMatch(hostApi, /vb_host_display_push_image_dma[\s\S]*return\s+-1;\s*\n}/);
  });

  it("does not format SD cards during mount", () => {
    const source = readRequired(boardSourcePath);

    assert.match(source, /\.format_if_mount_failed\s*=\s*false/);
  });

  it("scans the board app directory", () => {
    const header = readRequired(registryHeaderPath);
    const source = readRequired(registrySourcePath);

    assert.match(header, /VB_APPS_PATH\s+"\/sdcard\/apps"/);
    assert.match(header, /VB_APP_MANIFEST_SCHEMA_MAX/);
    assert.match(header, /VB_APP_VERSION_MAX/);
    assert.match(header, /VB_APP_KIND_MAX/);
    assert.match(header, /VB_APP_CAPABILITIES_MAX/);
    assert.match(header, /VB_APP_REGISTRY_MAX_APPS/);
    assert.match(header, /VB_APP_REGISTRY_MAX_APPS\s+32/);
    assert.match(header, /vb_app_registry_entry_t/);
    assert.match(header, /manifest_schema/);
    assert.match(header, /version/);
    assert.match(header, /kind/);
    assert.match(header, /capabilities/);
    assert.match(header, /compatible/);
    assert.match(header, /apps\[/);
    assert.match(source, /VB_APPS_PATH/);
    assert.match(source, /app\.info/);
    assert.match(source, /manifest\.json/);
    assert.match(source, /read_app_manifest/);
    assert.match(source, /vibeboard-runtime-app-package@2/);
    assert.match(source, /stat\(app_path,\s*&st\)/);
    assert.match(source, /skip app entry that is missing/);
    assert.match(source, /result->apps/);
  });

  it("exposes app manifest compatibility metadata through HTTP apps", () => {
    const source = readRequired(installServiceSourcePath);

    assert.match(source, /manifest_schema/);
    assert.match(source, /version/);
    assert.match(source, /kind/);
    assert.match(source, /capabilities/);
    assert.match(source, /compatible/);
    assert.match(source, /\\"schema\\":\\"%s\\"/);
    assert.match(source, /\\"version\\":\\"%s\\"/);
    assert.match(source, /\\"kind\\":\\"%s\\"/);
    assert.match(source, /\\"capabilities\\":\\"%s\\"/);
    assert.match(source, /\\"compatible\\":%s/);
  });

  it("prevents incompatible app packages from launching", () => {
    const installService = readRequired(installServiceSourcePath);
    const launcher = readRequired(launcherSourcePath);

    assert.match(installService, /selected_app\.compatible/);
    assert.match(installService, /HTTPD_400_BAD_REQUEST,\s*"app incompatible"/);
    assert.match(launcher, /apps->apps\[i\]\.compatible/);
    assert.match(launcher, /s_rendered_apps\[s_rendered_app_count\+\+\]\s*=\s*apps->apps\[i\]/);
  });

  it("keeps expanded app registry buffers out of static DRAM", () => {
    const main = readRequired(mainSourcePath);
    const launcher = readRequired(launcherSourcePath);

    assert.match(main, /static\s+vb_app_registry_result_t\s+\*s_apps/);
    assert.match(main, /heap_caps_calloc\(1,\s*sizeof\(\*s_apps\),\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.doesNotMatch(main, /static\s+vb_app_registry_result_t\s+s_apps/);
    assert.match(launcher, /static\s+vb_app_registry_entry_t\s+\*s_rendered_apps/);
    assert.match(launcher, /heap_caps_calloc\(VB_APP_REGISTRY_MAX_APPS,\s*sizeof\(\*s_rendered_apps\),\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.doesNotMatch(launcher, /static\s+vb_app_registry_entry_t\s+s_rendered_apps\[VB_APP_REGISTRY_MAX_APPS\]/);
  });

  it("tracks the first app entry path for execution", () => {
    const header = readRequired(registryHeaderPath);
    const source = readRequired(registrySourcePath);

    assert.match(header, /first_app_entry/);
    assert.match(header, /first_app_path/);
    assert.match(source, /entry/);
    assert.match(source, /main\.lua/);
  });

  it("starts a sandboxed HTTP install service for SD app uploads", () => {
    const header = readRequired(installServiceHeaderPath);
    const source = readRequired(installServiceSourcePath);
    const cmake = readRequired(cmakePath);
    const main = readRequired(mainSourcePath);

    assert.match(cmake, /install_service\.c/);
    assert.match(cmake, /esp_http_server/);
    assert.match(header, /vb_install_service_start/);
    assert.match(header, /vb_install_service_context_t/);
    assert.match(source, /esp_http_server\.h/);
    assert.match(source, /esp_netif_init/);
    assert.match(source, /esp_event_loop_create_default/);
    assert.match(source, /httpd_start/);
    assert.match(source, /VB_INSTALL_HTTPD_STACK_SIZE\s+8192/);
    assert.match(source, /config\.stack_size\s*=\s*VB_INSTALL_HTTPD_STACK_SIZE/);
    assert.match(source, /config\.task_caps\s*=\s*\(MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.match(source, /config\.max_uri_handlers\s*=\s*12/);
    assert.match(source, /status_handler/);
    assert.match(source, /apps_handler/);
    assert.match(source, /runtime_config_handler/);
    assert.match(source, /VB_RUNTIME_CUBICSERVER_CONFIG_PATH\s+"\/sdcard\/runtime\/cubicserver\.json"/);
    assert.match(source, /VB_RUNTIME_WIFI_CONFIG_PATH\s+"\/sdcard\/runtime\/wifi\.json"/);
    assert.match(source, /VB_RUNTIME_I2S_CONFIG_PATH\s+"\/sdcard\/runtime\/i2s\.json"/);
    assert.match(source, /VB_RUNTIME_CONFIG_MAX_BYTES\s+512/);
    assert.match(source, /strcmp\(name,\s*"cubicserver"\)/);
    assert.match(source, /strcmp\(name,\s*"wifi"\)/);
    assert.match(source, /strcmp\(name,\s*"i2s"\)/);
    assert.match(source, /write_runtime_config_body/);
    assert.match(source, /rescan_handler/);
    assert.match(source, /launch_handler/);
    assert.match(source, /stop_handler/);
    assert.match(source, /\/status/);
    assert.match(source, /\/apps/);
    assert.match(source, /register_handler\("\/runtime\/config",\s*HTTP_POST,\s*runtime_config_handler\)/);
    assert.match(source, /\/rescan/);
    assert.match(source, /\/launch/);
    assert.match(source, /\/stop/);
    assert.match(source, /vb_app_runner_launch_async/);
    assert.match(source, /vb_app_runner_stop/);
    assert.match(source, /vb_app_runner_wait_stopped/);
    assert.match(source, /vb_app_registry_scan/);
    assert.match(source, /HTTP_POST/);
    assert.match(source, /\/install/);
    assert.match(source, /VB_APPS_PATH/);
    assert.match(source, /reject_unsafe_path/);
    assert.match(source, /\.\./);
    assert.match(source, /httpd_req_recv/);
    assert.match(source, /fwrite/);
    assert.match(main, /vb_install_service_context_t/);
    assert.match(main, /static\s+vb_app_registry_result_t\s+\*s_apps/);
    assert.match(main, /static\s+vb_install_service_context_t\s+s_install_context/);
    assert.match(main, /vb_install_service_start\(&s_install_context\)/);
  });

  it("exposes a versioned native module ABI through runtime status", () => {
    const abi = readRequired(moduleAbiHeaderPath);
    const service = readRequired(installServiceSourcePath);

    assert.match(abi, /VB_NATIVE_MODULE_ABI_VERSION\s+"vibeboard-native-module-abi@1"/);
    assert.match(service, /module_abi\.h/);
    assert.match(service, /VB_RUNTIME_NATIVE_ABI_VERSION\s+VB_NATIVE_MODULE_ABI_VERSION/);
    assert.match(service, /\\"native_abi_version\\":%s/);
    assert.doesNotMatch(service, /VB_RUNTIME_NATIVE_ABI_VERSION\s+NULL/);
  });

  it("registers a Lua native module searcher before app scripts run", () => {
    const runner = readRequired(runnerSourcePath);
    const cmake = readRequired(cmakePath);

    assert.match(cmake, /native_module_loader\.c/);
    assert.match(cmake, /lua_native_module\.c/);
    assert.match(cmake, /module_host_api\.c/);
    assert.match(cmake, /native_module_static_adapter\.c/);
    assert.match(cmake, /nes_native_adapter\.c/);
    assert.match(cmake, /nes_host_v1_shim\.c/);
    assert.match(cmake, /runtime\/nes_core_bridge\.cpp/);
    assert.match(cmake, /port\/nes_port\.cpp/);
    assert.match(cmake, /core\/ppu2C02\.cpp/);
    assert.match(cmake, /audio\/nes_audio_out\.cpp/);
    assert.match(cmake, /video\/nes_video_out\.cpp/);
    assert.match(runner, /lua_native_module\.h/);
    assert.match(runner, /vb_lua_native_module_register\(L,\s*app\)/);
    assert.match(runner, /vb_lua_native_module_register\(L,\s*app\)[\s\S]*load_lua_file\(L,\s*app->first_app_path\)/);
  });

  it("maps NES module IRAM sections explicitly so they are not linker orphans", () => {
    const cmake = readRequired(cmakePath);
    const linker = readRequired(linkerFragmentPath);

    assert.match(cmake, /LDFRAGMENTS\s+"linker\.lf"/);
    assert.match(linker, /\[sections:nes_mod_iram_text\]/);
    assert.match(linker, /\.mod_iram\+/);
    assert.match(linker, /\.mod_iram\.literal\+/);
    assert.match(linker, /\[scheme:nes_mod_iram_default\]/);
    assert.match(linker, /nes_mod_iram_text\s*->\s*flash_text/);
    assert.match(linker, /\[mapping:vibeboard_runtime_nes_mod_iram\]/);
    assert.match(linker, /archive:\s+libmain\.a/);
    assert.match(linker, /\*\s+\(nes_mod_iram_default\)/);
  });

  it("keeps native module loader failures precise before NES core is ported", () => {
    const loaderHeader = readRequired(nativeModuleLoaderHeaderPath);
    const loader = readRequired(nativeModuleLoaderSourcePath);
    const luaModule = readRequired(luaNativeModuleSourcePath);
    const hostApiHeader = readRequired(moduleHostApiHeaderPath);
    const hostApi = readRequired(moduleHostApiSourcePath);
    const staticAdapterHeader = readRequired(nativeModuleStaticAdapterHeaderPath);
    const staticAdapter = readRequired(nativeModuleStaticAdapterSourcePath);
    const nesNativeAdapterHeader = readRequired(nesNativeAdapterHeaderPath);
    const nesNativeAdapter = readRequired(nesNativeAdapterSourcePath);
    const nesHostShimHeader = readRequired(nesHostShimHeaderPath);
    const nesHostShim = readRequired(nesHostShimSourcePath);
    const upstreamNesCoreBridgeHeader = readRequired(upstreamNesCoreBridgeHeaderPath);
    const upstreamNesPortHeader = readRequired(upstreamNesPortHeaderPath);
    const upstreamNesArduinoHeader = readRequired(upstreamNesArduinoHeaderPath);
    const upstreamNesAudioHeader = readRequired(upstreamNesAudioHeaderPath);

    assert.match(loaderHeader, /vb_native_module_load/);
    assert.match(loaderHeader, /vb_native_module_manifest_t/);
    assert.match(loaderHeader, /vb_native_module_result_t/);
    assert.match(loaderHeader, /void\s+\*module/);
    assert.match(loaderHeader, /VB_NATIVE_MODULE_ERROR_MAX/);
    assert.match(loaderHeader, /VB_NATIVE_MODULE_MANIFEST_MAGIC\s+"VBNM"/);
    assert.match(loader, /Native module load failed/);
    assert.match(loader, /Native module symbol missing/);
    assert.match(loader, /Native module ABI mismatch/);
    assert.match(loader, /Native module host API unsupported/);
    assert.match(loader, /parse_manifest_line/);
    assert.match(loader, /magic\s*=\s*VBNM/);
    assert.match(loader, /abi\s*=\s*vibeboard-native-module-abi@1/);
    assert.match(loader, /symbol\s*=\s*vb_native_module_init/);
    assert.match(loader, /min_host\s*=\s*vibeboard-native-host@1/);
    assert.match(loader, /VB_NATIVE_MODULE_REQUIRED_SYMBOL\s+"vb_native_module_init"/);
    assert.match(loader, /VB_NATIVE_MODULE_HOST_API_VERSION\s+"vibeboard-native-host@1"/);
    assert.match(loader, /native_module_static_adapter\.h/);
    assert.match(loader, /vb_native_module_static_adapter_load/);
    assert.match(hostApiHeader, /vb_module_host_api_t/);
    assert.match(hostApiHeader, /vb_module_host_serial_api_t/);
    assert.match(hostApiHeader, /vb_module_host_time_api_t/);
    assert.match(hostApiHeader, /vb_module_host_heap_api_t/);
    assert.match(hostApiHeader, /vb_module_host_file_api_t/);
    assert.match(hostApiHeader, /vb_module_host_task_api_t/);
    assert.match(hostApiHeader, /vb_module_host_display_api_t/);
    assert.match(hostApiHeader, /vb_module_host_display_surface_t/);
    assert.match(hostApiHeader, /vb_module_host_lua_api_t/);
    assert.match(hostApiHeader, /vb_module_host_api_init/);
    assert.match(hostApi, /vb_host_serial_write/);
    assert.match(hostApi, /vb_host_serial_println/);
    assert.match(hostApi, /vb_host_time_millis/);
    assert.match(hostApi, /vb_host_time_micros/);
    assert.match(hostApi, /vb_host_time_delay_ms/);
    assert.match(hostApi, /vb_host_heap_malloc/);
    assert.match(hostApi, /vb_host_heap_free/);
    assert.match(hostApi, /vb_host_file_open/);
    assert.match(hostApi, /vb_host_file_read/);
    assert.match(hostApi, /vb_host_file_close/);
    assert.match(hostApi, /vb_host_task_create/);
    assert.match(hostApi, /vb_host_task_remove/);
    assert.match(hostApi, /vb_host_task_yield/);
    assert.match(hostApi, /vb_host_task_delay_ms/);
    assert.match(hostApi, /vb_host_display_width/);
    assert.match(hostApi, /vb_host_display_height/);
    assert.match(hostApi, /vb_host_display_acquire/);
    assert.match(hostApi, /vb_host_display_start_write/);
    assert.match(hostApi, /vb_host_display_push_image_dma/);
    assert.match(hostApi, /vb_host_display_end_write/);
    assert.match(hostApi, /vb_host_display_release/);
    assert.match(hostApi, /VB_MODULE_HOST_DISPLAY_WIDTH\s+320/);
    assert.match(hostApi, /VB_MODULE_HOST_DISPLAY_HEIGHT\s+240/);
    assert.match(hostApi, /s_display_owner/);
    assert.match(hostApi, /vb_host_lua_gettop/);
    assert.match(hostApi, /vb_host_lua_settop/);
    assert.match(hostApi, /vb_host_lua_pushboolean/);
    assert.match(hostApi, /vb_host_lua_pushinteger/);
    assert.match(hostApi, /vb_host_lua_pushstring/);
    assert.match(hostApi, /vb_host_lua_setfield/);
    assert.match(hostApi, /vb_host_lua_checkinteger/);
    assert.match(hostApi, /vb_host_lua_checkstring/);
    assert.match(hostApi, /vb_host_lua_error/);
    assert.match(hostApi, /esp_timer_get_time/);
    assert.match(hostApi, /heap_caps_malloc/);
    assert.match(hostApi, /MALLOC_CAP_8BIT/);
    assert.match(hostApi, /xTaskCreatePinnedToCore/);
    assert.match(hostApi, /vTaskDelete/);
    assert.match(hostApi, /\/sdcard/);
    assert.match(staticAdapterHeader, /vb_native_module_static_adapter_load/);
    assert.match(staticAdapter, /vb_native_module_static_adapter_load/);
    assert.match(staticAdapter, /nes_native_adapter\.h/);
    assert.match(staticAdapter, /module_host_api\.h/);
    assert.match(staticAdapter, /vb_module_host_api_init/);
    assert.match(staticAdapter, /strcmp\(module_name,\s*"nes"\)/);
    assert.match(staticAdapter, /vb_nes_native_module_init/);
    assert.match(staticAdapter, /void\s+\*module\s*=\s*NULL/);
    assert.match(staticAdapter, /vb_native_module_init\(&host_api,\s*&module\)/);
    assert.match(staticAdapter, /init_err\s*==\s*ESP_ERR_NOT_SUPPORTED/);
    assert.match(staticAdapter, /Native module host API unsupported: vb_native_module_init/);
    assert.match(staticAdapter, /result->error\[0\]\s*=\s*'\\0'/);
    assert.match(staticAdapter, /result->module\s*=\s*module/);
    assert.match(staticAdapter, /result->status\s*=\s*ESP_OK/);
    assert.match(nesNativeAdapterHeader, /vb_nes_native_module_init/);
    assert.match(nesNativeAdapterHeader, /module_host_api\.h/);
    assert.match(nesNativeAdapterHeader, /nes_host_v1_shim\.h/);
    assert.match(nesNativeAdapter, /vb_nes_native_module_init/);
    assert.match(nesNativeAdapter, /runtime\/nes_core_bridge\.h/);
    assert.match(nesNativeAdapter, /module_host_api_v1\s+host_v1/);
    assert.match(nesNativeAdapter, /nes_core_status_t\s+core_status/);
    assert.match(nesNativeAdapter, /void\s+\*core_runtime/);
    assert.match(nesNativeAdapter, /vb_nes_host_v1_shim_init\(&s_nes_module\.host_v1,\s*&s_nes_module\.host_api\)/);
    assert.match(nesNativeAdapter, /nes_core_create\(&s_nes_module\.host_v1\)/);
    assert.match(nesNativeAdapter, /nes_core_start\(nes->core_runtime,\s*rom_path,\s*&options,\s*err,\s*sizeof\(err\)\)/);
    assert.match(nesNativeAdapter, /nes_core_stop\(nes->core_runtime,\s*3000,\s*1,\s*err,\s*sizeof\(err\)\)/);
    assert.match(nesNativeAdapter, /nes_core_set_input_mask\(nes->core_runtime,\s*runtime_mask_to_nes_mask\(nes->player_1_mask\)\)/);
    assert.match(nesNativeAdapter, /nes_core_status\(nes->core_runtime,\s*&nes->core_status\)/);
    assert.match(nesNativeAdapter, /nes_core_destroy\(s_nes_module\.core_runtime\)/);
    assert.match(nesNativeAdapter, /static\s+uint32_t\s+runtime_mask_to_nes_mask\(uint8_t\s+mask\)/);
    assert.match(nesNativeAdapter, /nes_core_options_t\s+options/);
    assert.match(nesNativeAdapter, /apply_start_options\(L,\s*2,\s*&options\)/);
    assert.match(nesNativeAdapter, /table_u32\(L,\s*"target_fps",\s*options->target_fps\)/);
    assert.match(nesNativeAdapter, /table_bool\(L,\s*"audio_enabled",\s*options->audio_enabled != 0\)/);
    assert.match(nesNativeAdapter, /options->audio_lua_fallback/);
    assert.match(nesNativeAdapter, /options->audio_sample_rate/);
    assert.match(nesNativeAdapter, /options->audio_queue_bytes/);
    assert.match(nesNativeAdapterHeader, /vb_nes_native_module_read_audio/);
    assert.match(nesNativeAdapter, /vb_nes_native_module_read_audio/);
    assert.match(nesNativeAdapter, /nes_core_read_audio\(nes->core_runtime,\s*buf,\s*max_bytes\)/);
    assert.match(luaModule, /nes_stub_read_audio/);
    assert.match(luaModule, /set_module_function\(L,\s*"read_audio",\s*module,\s*nes_stub_read_audio\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"core_state"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"core_running"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"core_loaded"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"core_frames"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"last_nes_mask"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"display_stream_supported"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"display_stream_active"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"audio_active"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"audio_backend"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"core_last_error"\)/);
    assert.match(nesNativeAdapter, /host_api->version/);
    assert.match(nesNativeAdapter, /host_api->display\.width/);
    assert.match(nesNativeAdapter, /host_api->heap\.malloc/);
    assert.match(nesNativeAdapter, /vb_module_host_api_t\s+host_api/);
    assert.match(nesNativeAdapter, /s_nes_module\.host_api\s*=\s*\*host_api/);
    assert.match(nesNativeAdapter, /\*module\s*=/);
    assert.match(nesNativeAdapter, /host_api\.file\.open/);
    assert.match(nesNativeAdapter, /host_api\.file\.read/);
    assert.match(nesNativeAdapter, /host_api\.file\.close/);
    assert.match(nesNativeAdapter, /read_ines_header/);
    assert.match(nesNativeAdapter, /invalid iNES header/);
    assert.match(nesNativeAdapter, /NES 2\.0 rom is not supported yet/);
    assert.match(nesHostShimHeader, /nes_module_abi_v1\.h/);
    assert.match(nesHostShimHeader, /vb_nes_host_v1_shim_init/);
    assert.match(nesHostShim, /MODULE_ABI_VERSION/);
    assert.match(nesHostShim, /module_host_api_v1/);
    assert.match(nesHostShim, /host->serial\.write/);
    assert.match(nesHostShim, /host->sd\.open/);
    assert.match(nesHostShim, /host->file\.read/);
    assert.match(nesHostShim, /host->display\.pushImageDMA/);
    assert.match(nesHostShim, /shim_task_create/);
    assert.match(nesHostShim, /shim_task_remove/);
    assert.match(nesHostShim, /host->task\.create\s*=\s*shim_task_create/);
    assert.match(nesHostShim, /host->task\.remove\s*=\s*shim_task_remove/);
    assert.match(nesHostShim, /MODULE_ERR_UNSUPPORTED/);
    assert.match(upstreamNesCoreBridgeHeader, /\.\.\/include\/module_abi\.h/);
    assert.match(upstreamNesPortHeader, /\.\.\/include\/module_abi\.h/);
    assert.match(upstreamNesArduinoHeader, /\.\.\/include\/module_abi\.h/);
    assert.match(upstreamNesAudioHeader, /\.\.\/include\/module_abi\.h/);
    assert.match(luaModule, /package/);
    assert.match(luaModule, /searchers/);
    assert.match(luaModule, /vb_native_module_load/);
    assert.match(luaModule, /nes_native_adapter\.h/);
    assert.match(luaModule, /push_nes_stub_module\(L,\s*result\.module\)/);
    assert.match(luaModule, /lua_touserdata\(L,\s*lua_upvalueindex\(1\)\)/);
    assert.match(luaModule, /vb_nes_native_module_state/);
    assert.match(luaModule, /vb_nes_native_module_start/);
    assert.match(luaModule, /vb_nes_native_module_input_set_mask/);
    assert.match(luaModule, /return\s+luaL_error\(L,\s*"%s",\s*result\.error\)/);
  });

  it("returns a core-backed NES Lua module after native manifest validation", () => {
    const luaModule = readRequired(luaNativeModuleSourcePath);
    const nesNativeAdapter = readRequired(nesNativeAdapterSourcePath);

    assert.match(luaModule, /push_nes_stub_module/);
    assert.match(luaModule, /"PLAYER_1"/);
    assert.match(luaModule, /"BTN_UP"/);
    assert.match(luaModule, /"BTN_DOWN"/);
    assert.match(luaModule, /"BTN_LEFT"/);
    assert.match(luaModule, /"BTN_RIGHT"/);
    assert.match(luaModule, /"BTN_A"/);
    assert.match(luaModule, /"BTN_B"/);
    assert.match(luaModule, /"BTN_SELECT"/);
    assert.match(luaModule, /"BTN_START"/);
    assert.match(luaModule, /"state"/);
    assert.match(luaModule, /"start"/);
    assert.match(luaModule, /"stop"/);
    assert.match(luaModule, /"input"/);
    assert.match(luaModule, /"set_mask"/);
    assert.match(luaModule, /"clear"/);
    assert.match(nesNativeAdapter, /core_state_name/);
    assert.match(nesNativeAdapter, /"core_state"/);
    assert.match(nesNativeAdapter, /"core_running"/);
  });

  it("routes the migrated NES app through require('nes') instead of assuming a global module", () => {
    const app = readRequired(nesgameSourcePath);
    const info = readRequired(nesgameInfoPath);
    const nativeManifest = readRequired(nesgameNativeManifestPath);
    const requireIndex = app.indexOf('local nes = require("nes")');
    const playerIndex = app.indexOf("APP.PLAYER = nes.PLAYER_1");

    assert.match(app, /local\s+nes\s*=\s*require\(["']nes["']\)/);
    assert.ok(requireIndex >= 0, "nesgame should require the NES module explicitly");
    assert.ok(playerIndex > requireIndex, "nesgame should not use nes before require('nes')");
    assert.match(info, /capabilities\s*=\s*lvgl,file,timer,input,module,native/);
    assert.match(nativeManifest, /magic\s*=\s*VBNM/);
    assert.match(nativeManifest, /abi\s*=\s*vibeboard-native-module-abi@1/);
    assert.match(nativeManifest, /symbol\s*=\s*vb_native_module_init/);
    assert.match(nativeManifest, /min_host\s*=\s*vibeboard-native-host@1/);
  });

  it("supports staged app install commit, abort, and delete operations", () => {
    const source = readRequired(installServiceSourcePath);

    assert.match(source, /VB_APP_STAGE_PATH/);
    assert.match(source, /get_query_value\(req,\s*"stage"/);
    assert.match(source, /build_app_path/);
    assert.match(source, /build_stage_path/);
    assert.match(source, /install_commit_handler/);
    assert.match(source, /install_abort_handler/);
    assert.match(source, /app_delete_handler/);
    assert.match(source, /remove_tree/);
    assert.match(source, /rename\(/);
    assert.match(source, /"\/install\/commit"/);
    assert.match(source, /"\/install\/abort"/);
    assert.match(source, /"\/apps\/delete"/);
    assert.match(source, /\\"committed\\"/);
    assert.match(source, /\\"aborted\\"/);
    assert.match(source, /\\"deleted\\"/);
  });

  it("validates staged package manifest file hashes before commit", () => {
    const source = readRequired(installServiceSourcePath);

    assert.match(source, /validate_stage_manifest/);
    assert.match(source, /"manifest\.json"/);
    assert.match(source, /mbedtls_sha256_starts/);
    assert.match(source, /mbedtls_sha256_update/);
    assert.match(source, /mbedtls_sha256_finish/);
    assert.match(source, /sha256 mismatch/);
    assert.match(source, /manifest validation failed/);
    assert.match(source, /validate_stage_manifest\(stage_path\)[\s\S]*rename\(stage_path,\s*app_path\)/);
  });

  it("exposes Lua runner lifecycle for launcher and HTTP launch", () => {
    const header = readRequired(join(firmwareRoot, "main/app_runner.h"));
    const runner = readRequired(runnerSourcePath);
    const main = readRequired(mainSourcePath);

    assert.match(header, /vb_app_runner_lifecycle_state_t/);
    assert.match(header, /VB_APP_RUNNER_STATE_IDLE/);
    assert.match(header, /VB_APP_RUNNER_STATE_STARTING/);
    assert.match(header, /VB_APP_RUNNER_STATE_RUNNING/);
    assert.match(header, /VB_APP_RUNNER_STATE_STOPPING/);
    assert.match(header, /VB_APP_RUNNER_STATE_FAILED/);
    assert.match(header, /vb_app_runner_state_name/);
    assert.match(header, /vb_app_runner_current_state_name/);
    assert.match(header, /vb_app_runner_run_entry/);
    assert.match(header, /vb_app_runner_launch_async/);
    assert.match(header, /vb_app_runner_launch_options_t/);
    assert.match(header, /vb_app_runner_launch_async_with_options/);
    assert.match(header, /vb_app_runner_stop/);
    assert.match(header, /vb_app_runner_wait_stopped/);
    assert.match(header, /vb_app_runner_current_id/);
    assert.match(runner, /case\s+VB_APP_RUNNER_STATE_IDLE:\s*return\s+"idle"/);
    assert.match(runner, /case\s+VB_APP_RUNNER_STATE_STARTING:\s*return\s+"starting"/);
    assert.match(runner, /case\s+VB_APP_RUNNER_STATE_RUNNING:\s*return\s+"running"/);
    assert.match(runner, /case\s+VB_APP_RUNNER_STATE_STOPPING:\s*return\s+"stopping"/);
    assert.match(runner, /case\s+VB_APP_RUNNER_STATE_FAILED:\s*return\s+"failed"/);
    assert.match(runner, /s_runner_state_mux/);
    assert.match(runner, /reserve_runner_start/);
    assert.match(runner, /s_runner_state\.lifecycle_state\s*=\s*VB_APP_RUNNER_STATE_STARTING/);
    assert.match(runner, /set_running_if_starting/);
    assert.match(runner, /s_runner_state\.lifecycle_state\s*=\s*VB_APP_RUNNER_STATE_STOPPING/);
    assert.match(runner, /s_runner_state\.lifecycle_state\s*=\s*VB_APP_RUNNER_STATE_FAILED/);
    assert.match(runner, /s_runner_state\.lifecycle_state\s*=\s*VB_APP_RUNNER_STATE_IDLE/);
    assert.match(runner, /stop_requested[\s\S]*VB_APP_RUNNER_STATE_IDLE/);
    assert.match(runner, /was_stop_requested\s*=\s*s_runner_state\.stop_requested[\s\S]*s_runner_state\.last_status\s*=\s*status/);
    assert.match(runner, /s_runner_state\.last_message[\s\S]*s_runner_state\.lifecycle_state\s*=\s*VB_APP_RUNNER_STATE_IDLE/);
    assert.match(runner, /vb_app_runner_run[\s\S]*reserve_runner_start/);
    assert.match(runner, /VB_LUA_TASK_STACK_SIZE/);
    assert.match(runner, /xTaskCreatePinnedToCoreWithCaps/);
    assert.match(runner, /MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT/);
    assert.match(runner, /vb_app_registry_entry_t/);
    assert.match(runner, /entry_to_registry/);
    assert.match(runner, /s_runner_state/);
    assert.match(runner, /stop_requested/);
    assert.match(runner, /vb_lua_tmr_set_stop_flag/);
    assert.match(runner, /luaL_newstate/);
    assert.match(runner, /luaL_openlibs/);
    assert.match(runner, /load_lua_file/);
    assert.match(runner, /lua_load/);
    assert.match(runner, /heap_caps_malloc\(VB_LUA_SCRIPT_READ_CHUNK,\s*MALLOC_CAP_INTERNAL\s*\|\s*MALLOC_CAP_DMA\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.match(runner, /fread\(reader->buffer,\s*1,\s*VB_LUA_SCRIPT_READ_CHUNK/);
    assert.doesNotMatch(runner, /luaL_dofile/);
    assert.match(runner, /Lua app ok/);
    assert.doesNotMatch(main, /vb_app_runner_run\(s_apps,\s*&run\)/);
    assert.match(main, /vb_launcher_ui_show\(s_apps,\s*scan_err\)/);
  });

  it("registers a read-only Lua app manager module", () => {
    const source = readRequired(luaAppSourcePath);
    const header = readRequired(luaAppHeaderPath);
    const runner = readRequired(runnerSourcePath);
    const cmake = readRequired(cmakePath);

    assert.match(header, /vb_lua_app_register/);
    assert.match(header, /vb_lua_app_set_stop_flag/);
    assert.match(source, /luaL_Reg\s+functions/);
    assert.match(source, /"list"/);
    assert.match(source, /"rescan",\s*lua_app_rescan/);
    assert.match(source, /"current"/);
    assert.match(source, /"exiting"/);
    assert.match(source, /"exit",\s*lua_app_exit/);
    assert.match(source, /"on"/);
    assert.match(source, /VB_LUA_APP_EVENT_EXIT/);
    assert.match(source, /VB_LUA_APP_EVENT_LAUNCH/);
    assert.match(source, /VB_LUA_APP_EVENT_STOP/);
    assert.match(source, /vb_lua_app_dispatch_event/);
    assert.match(source, /vb_lua_app_dispatch_event\(L,\s*state,\s*VB_LUA_APP_EVENT_STOP/);
    assert.match(source, /vb_lua_app_dispatch_event\(L,\s*state,\s*VB_LUA_APP_EVENT_LAUNCH/);
    assert.match(source, /\*state->stop_requested\s*=\s*true/);
    assert.match(source, /vb_app_registry_scan/);
    assert.match(source, /vb_app_runner_current_id/);
    assert.match(source, /vb_app_runner_current_state_name/);
    assert.match(source, /vb_lua_app_dispatch_exit/);
    assert.match(runner, /#include\s+"lua_app\.h"/);
    assert.match(runner, /vb_lua_app_set_stop_flag\(&runtime\.app,\s*&s_runner_state\.stop_requested\)/);
    assert.match(runner, /vb_lua_app_register\(L,\s*&runtime\.app\)/);
    assert.match(runner, /vb_lua_app_dispatch_exit\(L,\s*&runtime->app\)/);
    assert.match(cmake, /"lua_app\.c"/);
  });

  it("lets Lua apps opt out of default HOME or EXIT stop handling", () => {
    const source = readRequired(luaAppSourcePath);
    const header = readRequired(luaAppHeaderPath);
    const runner = readRequired(runnerSourcePath);
    const runnerHeader = readRequired(runnerHeaderPath);
    const launcher = readRequired(launcherSourcePath);

    assert.match(header, /home_exit_enabled/);
    assert.match(source, /lua_app_set_home_exit/);
    assert.match(source, /"set_home_exit",\s*lua_app_set_home_exit/);
    assert.match(source, /state->home_exit_enabled\s*=\s*lua_toboolean\(L,\s*1\)/);
    assert.match(runner, /vb_lua_app_should_handle_home_exit\(&runtime->app\)/);
    assert.match(runner, /code\s*==\s*VB_LUA_KEY_HOME\s*\|\|\s*code\s*==\s*VB_LUA_KEY_EXIT/);
    assert.match(runner, /event\s*==\s*VB_LUA_KEY_SHORT\s*\|\|\s*event\s*==\s*VB_LUA_KEY_LONG_START/);
    assert.match(runner, /s_runner_state\.stop_requested\s*=\s*true/);
    assert.match(runnerHeader, /vb_app_runner_enqueue_key/);
    assert.match(runner, /vb_app_runner_enqueue_key\(int code,\s*int event\)/);
    assert.match(runner, /vb_lua_key_enqueue\(&runtime->key,\s*code,\s*event/);
    assert.match(runner, /vb_lua_app_should_handle_home_exit\(&runtime->app\)/);
    assert.match(launcher, /vb_app_runner_enqueue_key\(VB_LUA_KEY_HOME,\s*VB_LUA_KEY_SHORT\)/);
    assert.match(launcher, /vb_app_runner_enqueue_key\(VB_LUA_KEY_HOME,\s*VB_LUA_KEY_LONG_START\)/);
    assert.doesNotMatch(launcher, /launcher inactive; BOOT short press ignored/);
  });

  it("queues Lua app manager launch handoff without re-entering the active runner", () => {
    const source = readRequired(luaAppSourcePath);
    const header = readRequired(luaAppHeaderPath);
    const runner = readRequired(runnerSourcePath);

    assert.match(header, /pending_launch/);
    assert.match(source, /lua_app_launch/);
    assert.match(source, /"launch",\s*lua_app_launch/);
    assert.match(source, /vb_lua_app_take_pending_launch/);
    assert.match(source, /strcmp\(id,\s*vb_app_runner_current_id\(\)\)\s*==\s*0/);
    assert.match(source, /state->pending_launch\s*=\s*\*entry/);
    assert.match(source, /\*state->stop_requested\s*=\s*true/);
    assert.match(runner, /vb_lua_app_take_pending_launch/);
    assert.match(runner, /vb_app_runner_launch_async\(&pending_launch\)/);
    assert.doesNotMatch(source, /lua_app_launch[\s\S]*vb_app_runner_launch_async/);
  });

  it("exposes the last Lua runner result for launcher failure feedback", () => {
    const header = readRequired(runnerHeaderPath);
    const runner = readRequired(runnerSourcePath);

    assert.match(header, /vb_app_runner_last_status/);
    assert.match(header, /vb_app_runner_last_message/);
    assert.match(runner, /last_message/);
    assert.match(runner, /vb_app_runner_last_status/);
    assert.match(runner, /vb_app_runner_last_message/);
    assert.match(runner, /strlcpy\(s_runner_state\.last_message/);
  });

  it("keeps native launcher refresh and stop controls on the device screen", () => {
    const source = readRequired(launcherSourcePath);

    assert.match(source, /create_control_button/);
    assert.match(source, /Stop/);
    assert.match(source, /Refresh/);
    assert.match(source, /stop_button_event_cb/);
    assert.match(source, /refresh_button_event_cb/);
    assert.match(source, /refresh_launcher_from_event/);
    assert.match(source, /refresh_launcher_from_task/);
    assert.match(source, /vb_app_registry_scan/);
    assert.match(source, /vb_app_runner_stop/);
    assert.match(source, /vb_app_runner_wait_stopped/);
    assert.match(source, /refresh_rendered_apps/);
    assert.doesNotMatch(source, /vb_launcher_render_snapshot_t\s+\w+/);
  });

  it("returns to the native launcher after stop or async app failure", () => {
    const source = readRequired(launcherSourcePath);
    const header = readRequired(launcherHeaderPath);
    const installService = readRequired(installServiceSourcePath);

    assert.match(source, /start_return_to_launcher_task/);
    assert.match(source, /return_to_launcher_task/);
    assert.match(header, /vb_launcher_ui_note_async_launch/);
    assert.match(source, /vb_launcher_ui_note_async_launch/);
    assert.match(installService, /#include "launcher_ui\.h"/);
    assert.match(installService, /note_launcher_async_launch/);
    assert.match(installService, /before_start\s*=\s*note_launcher_async_launch/);
    assert.match(installService, /vb_app_runner_launch_async_with_options\(&selected_app,\s*&launch_options\)/);
    assert.doesNotMatch(installService, /vb_app_runner_launch_async\(&selected_app\)/);
    assert.match(source, /vb_app_runner_is_running/);
    assert.match(source, /vb_app_runner_current_state_name/);
    assert.match(source, /vb_app_runner_last_message/);
    assert.match(source, /Failed:/);
    assert.match(source, /Stopped/);
    assert.match(source, /launcher inactive; BOOT long press: stop app/);
    assert.match(source, /xTaskCreatePinnedToCoreWithCaps\(return_to_launcher_task/);
    assert.match(source, /"vb_return",\s*8192/);
    assert.match(source, /MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT/);
  });

  it("gives heavier migrated apps enough time to stop before switching", () => {
    const runnerHeader = readRequired(runnerHeaderPath);
    const installService = readRequired(installServiceSourcePath);
    const launcher = readRequired(launcherSourcePath);

    assert.match(runnerHeader, /VB_APP_RUNNER_STOP_TIMEOUT_MS\s+5000/);
    assert.match(installService, /vb_app_runner_wait_stopped\(VB_APP_RUNNER_STOP_TIMEOUT_MS\)/);
    assert.match(launcher, /vb_app_runner_wait_stopped\(VB_APP_RUNNER_STOP_TIMEOUT_MS\)/);
    assert.doesNotMatch(installService, /vb_app_runner_wait_stopped\(1500\)/);
    assert.doesNotMatch(launcher, /vb_app_runner_wait_stopped\(1500\)/);
  });

  it("exposes app runner lifecycle state through HTTP status", () => {
    const source = readRequired(installServiceSourcePath);

    assert.match(source, /VB_RUNTIME_VERSION/);
    assert.match(source, /VB_RUNTIME_LUA_API_VERSION/);
    assert.match(source, /VB_RUNTIME_LVGL_API_VERSION/);
    assert.match(source, /VB_RUNTIME_PACKAGE_SCHEMA/);
    assert.match(source, /VB_RUNTIME_NATIVE_ABI_VERSION/);
    assert.match(source, /vb_app_runner_current_state_name\(\)/);
    assert.match(source, /vb_app_runner_last_status/);
    assert.match(source, /vb_app_runner_last_message/);
    assert.match(source, /\\"state\\":\\"%s\\"/);
    assert.match(source, /\\"running\\":%s/);
    assert.match(source, /\\"current_app\\":\\"%s\\"/);
    assert.match(source, /\\"runtime_version\\":\\"%s\\"/);
    assert.match(source, /\\"lua_api_version\\":\\"%s\\"/);
    assert.match(source, /\\"lvgl_api_version\\":\\"%s\\"/);
    assert.match(source, /\\"package_schema\\":\\"%s\\"/);
    assert.match(source, /\\"native_abi_version\\":%s/);
    assert.match(source, /\\"last_status\\":\\"%s\\"/);
    assert.match(source, /\\"last_message\\":\\"%s\\"/);
  });

  it("boots into a native touch launcher", () => {
    const header = readRequired(launcherHeaderPath);
    const source = readRequired(launcherSourcePath);
    const cmake = readRequired(cmakePath);
    const main = readRequired(mainSourcePath);

    assert.match(cmake, /launcher_ui\.c/);
    assert.match(header, /vb_launcher_ui_show/);
    assert.match(source, /VibeBoard Apps/);
    assert.match(source, /lv_btn_create/);
    assert.match(source, /lv_obj_add_event_cb/);
    assert.match(source, /LV_EVENT_CLICKED/);
    assert.match(source, /VB_LAUNCHER_BOOT_KEY/);
    assert.match(source, /GPIO_NUM_0/);
    assert.match(source, /VB_LAUNCHER_DEBOUNCE_MS/);
    assert.match(source, /VB_LAUNCHER_KEY_COOLDOWN_MS/);
    assert.match(source, /BOOT short: next/);
    assert.match(source, /BOOT long press: launch/);
    assert.match(source, /vb_app_runner_is_running/);
    assert.match(source, /vb_app_runner_current_id/);
    assert.match(source, /vb_app_runner_stop/);
    assert.match(source, /vb_app_runner_wait_stopped\(VB_APP_RUNNER_STOP_TIMEOUT_MS\)/);
    assert.match(source, /vb_app_runner_launch_async/);
    assert.match(main, /#include "launcher_ui\.h"/);
    assert.match(main, /vb_launcher_ui_show\(s_apps,\s*scan_err\)/);
    assert.doesNotMatch(main, /vb_app_runner_run\(s_apps,\s*&run\)/);
  });

  it("disables launcher controls after handing the screen to a Lua app", () => {
    const source = readRequired(launcherSourcePath);

    assert.match(source, /s_launcher_active/);
    assert.match(source, /deactivate_launcher_unlocked/);
    assert.match(source, /deactivate_launcher_from_task/);
    assert.match(source, /s_app_buttons\[i\]\s*=\s*NULL/);
    assert.match(source, /is_launcher_active/);
    assert.match(source, /if\s*\(!launcher_active\)\s*\{/);
    assert.match(source, /before_start\s*=\s*note_async_launch_before_start/);
    assert.match(source, /vb_app_runner_launch_async_with_options\(app,\s*&options\)/);
  });

  it("keeps Lua alive for interval callbacks", () => {
    const runner = readRequired(runnerSourcePath);

    assert.match(runner, /vb_lua_tmr_register/);
    assert.match(runner, /vb_lua_tmr_set_stop_flag/);
    assert.match(runner, /vb_lua_tmr_run_loop/);
    assert.doesNotMatch(runner, /VB_LUA_SMOKE_LOOP_TICKS/);
    const source = readRequired(luaTmrSourcePath);
    const header = readRequired(luaTmrHeaderPath);
    assert.match(source, /vTaskDelay/);
    assert.match(source, /stop_requested/);
    assert.match(source, /Lua tmr loop stop requested/);
    assert.match(header, /vb_lua_tmr_set_stop_flag/);
  });

  it("registers a NodeMCU-style tmr module", () => {
    const header = readRequired(luaTmrHeaderPath);
    const source = readRequired(luaTmrSourcePath);
    const cmake = readRequired(cmakePath);
    const runner = readRequired(runnerSourcePath);

    assert.match(cmake, /lua_tmr\.c/);
    assert.match(header, /vb_lua_tmr_register/);
    assert.match(header, /vb_lua_tmr_run_loop/);
    assert.match(source, /tmr/);
    assert.match(source, /ALARM_SINGLE/);
    assert.match(source, /ALARM_AUTO/);
    assert.match(source, /ALARM_SEMI/);
    assert.match(source, /tmr_create/);
    assert.match(source, /timer_alarm/);
    assert.match(source, /timer_stop/);
    assert.match(source, /timer_unregister/);
    assert.match(source, /timer_state/);
    assert.match(source, /timer_interval/);
    assert.match(source, /tmr_now/);
    assert.match(source, /tmr_time/);
    assert.match(source, /millis/);
    assert.match(source, /luaL_ref/);
    assert.match(source, /lua_rawgeti/);
    assert.match(source, /lua_pcall/);
    assert.match(runner, /vb_lua_tmr_register\(L,\s*&runtime\.tmr\)/);
  });

  it("registers a minimal Lua key module for interactive apps", () => {
    const header = readRequired(luaKeyHeaderPath);
    const source = readRequired(luaKeySourcePath);
    const cmake = readRequired(cmakePath);
    const runner = readRequired(runnerSourcePath);

    assert.match(cmake, /lua_key\.c/);
    assert.match(header, /vb_lua_key_register/);
    assert.match(source, /key_on/);
    assert.match(source, /key_off/);
    assert.match(source, /key_push/);
    assert.match(source, /key_repeat_start/);
    assert.match(source, /key_repeat_stop/);
    assert.match(source, /VB_LUA_KEY_REPEAT_DELAY_MS/);
    assert.match(source, /VB_LUA_KEY_REPEAT_INTERVAL_MS/);
    assert.match(source, /VB_LUA_KEY_MAX_REPEATERS/);
    assert.match(source, /VB_LUA_KEY_LONG_REPEAT/);
    assert.match(source, /VB_LUA_KEY_LONG_END/);
    assert.match(source, /xTimerCreate/);
    assert.match(source, /xTimerChangePeriod/);
    assert.match(source, /xTimerStop/);
    assert.match(source, /"repeat_start"/);
    assert.match(source, /"repeat_stop"/);
    assert.match(source, /LEFT/);
    assert.match(source, /RIGHT/);
    assert.match(source, /UP/);
    assert.match(source, /DOWN/);
    assert.match(source, /HOME/);
    assert.match(source, /EXIT/);
    assert.match(source, /START/);
    assert.match(source, /SHORT/);
    assert.match(source, /LONG_START/);
    assert.match(source, /LONG_REPEAT/);
    assert.match(source, /LONG_END/);
    assert.match(source, /luaL_ref/);
    assert.match(source, /lua_rawgeti/);
    assert.match(source, /tmr\.now/);
    assert.match(runner, /vb_lua_key_register\(L,\s*&runtime\.key\)/);
  });

  it("bridges board input into Lua key events through the runner loop", () => {
    const header = readRequired(luaKeyHeaderPath);
    const source = readRequired(luaKeySourcePath);
    const runner = readRequired(runnerSourcePath);
    const boardHeader = readRequired(boardHeaderPath);
    const boardSource = readRequired(boardSourcePath);

    assert.match(header, /vb_lua_key_state_t/);
    assert.match(header, /vb_lua_key_init/);
    assert.match(header, /vb_lua_key_enqueue/);
    assert.match(header, /vb_lua_key_process_pending/);
    assert.match(header, /vb_lua_key_cleanup/);

    assert.match(source, /QueueHandle_t\s+queue/);
    assert.match(source, /xQueueCreate/);
    assert.match(source, /xQueueSend/);
    assert.match(source, /xQueueReceive/);
    assert.match(source, /vb_lua_key_process_pending/);

    assert.match(boardHeader, /vb_board_input_start/);
    assert.match(boardHeader, /vb_board_input_stop/);
    assert.match(boardHeader, /vb_board_input_callback_t/);
    assert.match(boardSource, /esp_lcd_touch_read_data/);
    assert.match(boardSource, /esp_lcd_touch_point_data_t/);
    assert.match(boardSource, /esp_lcd_touch_get_data/);
    assert.doesNotMatch(boardSource, /esp_lcd_touch_get_coordinates/);
    assert.match(boardSource, /vb_board_input_start/);
    assert.match(boardSource, /vb_board_input_stop/);
    assert.match(boardSource, /xTaskCreatePinnedToCoreWithCaps\(board_input_task/);
    assert.match(boardSource, /MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT/);

    assert.match(runner, /vb_lua_key_init\(&runtime\.key\)/);
    assert.match(runner, /vb_lua_key_register\(L,\s*&runtime\.key\)/);
    assert.match(runner, /vb_board_input_start\(runner_input_cb,\s*&runtime\)/);
    assert.match(runner, /vb_lua_input_poll/);
    assert.match(runner, /"vb_runner_runtime"/);
    assert.match(runner, /vb_lua_key_process_pending\(L,\s*&runtime->key\)/);
    assert.match(runner, /vb_board_input_stop\(\)/);
    assert.match(runner, /cleanup_lua_runtime/);
    assert.match(runner, /vb_lua_key_cleanup\(L,\s*&runtime->key\)/);

    assert.doesNotMatch(boardSource, /lua_pcall/);
    assert.doesNotMatch(boardSource, /lua_State/);
  });

  it("bridges board touch coordinates into a Lua touch module through the runner loop", () => {
    const boardHeader = readRequired(boardHeaderPath);
    const boardSource = readRequired(boardSourcePath);
    const runner = readRequired(runnerSourcePath);
    const touchHeader = readRequired(join(firmwareRoot, "main/lua_touch.h"));
    const touchSource = readRequired(join(firmwareRoot, "main/lua_touch.c"));
    const cmake = readRequired(cmakePath);

    assert.match(boardHeader, /\(\*vb_board_input_callback_t\)\(int code,\s*int event,\s*int timestamp_ms,\s*uint16_t x,\s*uint16_t y,\s*void \*user_data\)/);
    assert.match(boardSource, /VB_BOARD_TOUCH_EVENT_DOWN/);
    assert.match(boardSource, /VB_BOARD_TOUCH_EVENT_MOVE/);
    assert.match(boardSource, /VB_BOARD_TOUCH_EVENT_UP/);
    assert.match(boardSource, /VB_LUA_KEY_LEFT/);
    assert.match(boardSource, /callback\(code,\s*VB_LUA_KEY_START/);
    assert.match(boardSource, /callback\(0,\s*VB_BOARD_TOUCH_EVENT_DOWN/);
    assert.match(touchHeader, /vb_lua_touch_state_t/);
    assert.match(touchHeader, /vb_lua_touch_enqueue/);
    assert.match(touchHeader, /vb_lua_touch_process_pending/);
    assert.match(touchSource, /touch_on/);
    assert.match(touchSource, /touch_off/);
    assert.match(touchSource, /touch_push/);
    assert.match(touchSource, /VB_LUA_TOUCH_DOWN/);
    assert.match(touchSource, /VB_LUA_TOUCH_MOVE/);
    assert.match(touchSource, /VB_LUA_TOUCH_UP/);
    assert.match(runner, /#include "lua_touch\.h"/);
    assert.match(runner, /vb_lua_touch_init\(&runtime\.touch\)/);
    assert.match(runner, /vb_lua_touch_register\(L,\s*&runtime\.touch\)/);
    assert.match(runner, /vb_lua_touch_process_pending\(L,\s*&runtime->touch\)/);
    assert.match(runner, /vb_lua_touch_enqueue\(&runtime->touch/);
    assert.match(runner, /vb_lua_touch_cleanup\(L,\s*&runtime->touch\)/);
    assert.match(cmake, /lua_touch\.c/);
  });

  it("registers a sandboxed Lua file module", () => {
    const header = readRequired(luaFileHeaderPath);
    const source = readRequired(luaFileSourcePath);
    const cmake = readRequired(cmakePath);
    const runner = readRequired(runnerSourcePath);

    assert.match(cmake, /lua_file\.c/);
    assert.match(header, /vb_lua_file_register/);
    assert.match(source, /file_exists/);
    assert.match(source, /file_read/);
    assert.match(source, /file_write/);
    assert.match(source, /file_list/);
    assert.match(source, /file_open/);
    assert.match(source, /getcontents/);
    assert.match(source, /listdir/);
    assert.match(source, /VB_SD_MOUNT_POINT/);
    assert.match(source, /VB_APPS_PATH/);
    assert.match(runner, /vb_lua_file_register\(L,\s*app\)/);
  });

  it("registers network, json, and time Lua modules", () => {
    const httpHeader = readRequired(luaHttpHeaderPath);
    const httpSource = readRequired(luaHttpSourcePath);
    const sjsonHeader = readRequired(luaSjsonHeaderPath);
    const sjsonSource = readRequired(luaSjsonSourcePath);
    const timeHeader = readRequired(luaTimeHeaderPath);
    const timeSource = readRequired(luaTimeSourcePath);
    const wifiHeader = readRequired(luaWifiHeaderPath);
    const wifiSource = readRequired(luaWifiSourcePath);
    const cmake = readRequired(cmakePath);
    const runner = readRequired(runnerSourcePath);

    assert.match(cmake, /lua_http\.c/);
    assert.match(cmake, /lua_sjson\.c/);
    assert.match(cmake, /lua_time\.c/);
    assert.match(cmake, /lua_wifi\.c/);
    assert.match(cmake, /esp_http_client/);
    assert.match(cmake, /esp_netif/);
    assert.match(cmake, /esp_wifi/);
    assert.match(cmake, /json/);
    assert.match(cmake, /nvs_flash/);
    assert.match(httpHeader, /vb_lua_http_register/);
    assert.match(httpSource, /http_get/);
    assert.match(httpSource, /http_post/);
    assert.match(httpSource, /esp_http_client_perform/);
    assert.match(httpSource, /esp_http_client_get_status_code/);
    assert.match(sjsonHeader, /vb_lua_sjson_register/);
    assert.match(sjsonSource, /sjson_decode/);
    assert.match(sjsonSource, /sjson_encode/);
    assert.match(sjsonSource, /lua_setglobal\(L,\s*"json"\)/);
    assert.match(sjsonSource, /lua_setglobal\(L,\s*"sjson"\)/);
    assert.match(sjsonSource, /cJSON_Parse/);
    assert.match(sjsonSource, /cJSON_PrintUnformatted/);
    assert.match(timeHeader, /vb_lua_time_register/);
    assert.match(timeSource, /time_get/);
    assert.match(timeSource, /time_getlocal/);
    assert.match(timeSource, /time_settimezone/);
    assert.match(timeSource, /time_initntp/);
    assert.match(timeSource, /esp_netif_init/);
    assert.match(timeSource, /esp_event_loop_create_default/);
    assert.match(timeSource, /esp_sntp_init/);
    assert.match(wifiHeader, /vb_lua_wifi_register/);
    assert.match(wifiSource, /wifi_start/);
    assert.match(wifiSource, /wifi_mode/);
    assert.match(wifiSource, /wifi_sta_config/);
    assert.match(wifiSource, /wifi_sta_connect/);
    assert.match(wifiSource, /wifi_sta_getip/);
    assert.match(wifiSource, /#include "runtime_wifi\.h"/);
    assert.match(wifiSource, /vb_runtime_wifi_ensure_wifi/);
    assert.match(wifiSource, /vb_runtime_wifi_start/);
    assert.match(wifiSource, /vb_runtime_wifi_configure_sta/);
    assert.match(wifiSource, /vb_runtime_wifi_connect_sta/);
    assert.match(wifiSource, /vb_runtime_wifi_ensure_netif/);
    assert.match(wifiSource, /vb_runtime_wifi_sta_netif/);
    assert.doesNotMatch(wifiSource, /esp_netif_create_default_wifi_sta/);
    assert.doesNotMatch(wifiSource, /nvs_flash_init/);
    assert.match(runner, /vb_lua_wifi_register\(L\)/);
    assert.match(runner, /vb_lua_http_register\(L\)/);
    assert.match(runner, /vb_lua_sjson_register\(L\)/);
    assert.match(runner, /vb_lua_time_register\(L\)/);
  });

  it("tracks migrated app runtime API gaps before hardware runs", () => {
    const http = readRequired(luaHttpSourcePath);
    const sjson = readRequired(luaSjsonSourcePath);
    const canvas = readRequired(luaLvglCanvasSourcePath);
    const widgetSource = readRequired(luaLvglWidgetsSourcePath);
    const weather = readRequired(weatherSourcePath);
    const voiceAi = readRequired(voiceAiSourcePath);
    const nesgame = readRequired(nesgameSourcePath);

    assert.match(weather, /http\.cubicserver\.get/);
    assert.match(http, /http_cubicserver_get/);
    assert.match(http, /VB_HTTP_CUBICSERVER_BASE_URL/);
    assert.match(http, /VB_HTTP_CUBICSERVER_CONFIG_PATH\s+"\/sdcard\/runtime\/cubicserver\.json"/);
    assert.match(http, /load_cubicserver_base_url/);
    assert.match(http, /cJSON_GetObjectItem\(root,\s*"base_url"\)/);
    assert.match(http, /lua_setfield\(L,\s*-2,\s*"cubicserver"\)/);

    assert.match(weather, /json\.decode/);
    assert.match(voiceAi, /json\.decode/);
    assert.match(sjson, /lua_setglobal\(L,\s*"sjson"\)/);
    assert.match(sjson, /lua_setglobal\(L,\s*"json"\)/);

    assert.doesNotMatch(weather, /zlib\.gunzip/);
    assert.doesNotMatch(weather, /zlib\.isgzip/);
    assert.doesNotMatch(weather, /Accept-Encoding:\s*gzip/);
    assert.doesNotMatch(readRequired(cmakePath), /lua_zlib\.c/);

    assert.doesNotMatch(weather, /lv_canvas_draw_img/);
    assert.doesNotMatch(weather, /lv_canvas_blur_hor/);
    assert.doesNotMatch(weather, /lv_canvas_blur_ver/);
    assert.doesNotMatch(weather, /lv_canvas_create\(strip,\s*GLASS_W,\s*GLASS_H/);
    assert.doesNotMatch(weather, /lv_canvas_create\(panel,\s*FORECAST_GLASS_W,\s*FORECAST_GLASS_H/);
    assert.doesNotMatch(canvas, /"lv_canvas_draw_img"/);
    assert.doesNotMatch(canvas, /"lv_canvas_blur_hor"/);
    assert.doesNotMatch(canvas, /"lv_canvas_blur_ver"/);

    assert.match(voiceAi, /lv_gif_set_src/);
    assert.match(readRequired(sdkconfigDefaultsPath), /CONFIG_LV_USE_GIF=y/);
    assert.match(widgetSource, /lv_gif_create/);
    assert.match(widgetSource, /"lv_gif_create"/);
    assert.match(widgetSource, /lv_gif_set_src/);
    assert.match(widgetSource, /"lv_gif_set_src"/);

    assert.match(voiceAi, /key\.SHORT/);
    assert.match(voiceAi, /key\.EXIT/);
    assert.match(readRequired(luaKeySourcePath), /SHORT/);
    assert.match(readRequired(luaKeySourcePath), /EXIT/);

    assert.match(nesgame, /gamepad\.state/);
    assert.match(nesgame, /nes\./);
    assert.match(readRequired(cmakePath), /lua_gamepad\.c/);
    assert.doesNotMatch(readRequired(cmakePath), /lua_nes\.c/);
  });

  it("registers a Lua gamepad compatibility module", () => {
    const header = readRequired(luaGamepadHeaderPath);
    const source = readRequired(luaGamepadSourcePath);
    const cmake = readRequired(cmakePath);
    const runner = readRequired(runnerSourcePath);

    assert.match(cmake, /lua_gamepad\.c/);
    assert.match(header, /vb_lua_gamepad_register/);
    assert.match(source, /gamepad_state/);
    assert.match(source, /gamepad_start/);
    assert.match(source, /gamepad_stop/);
    assert.match(source, /gamepad_on/);
    assert.match(source, /gamepad_off/);
    assert.match(source, /gamepad_rescan/);
    assert.match(source, /gamepad_push_state/);
    assert.match(source, /gamepad_start[\s\S]*dispatch_event\(L,\s*VB_GAMEPAD_EVT_CONNECTING\)/);
    assert.match(source, /gamepad_rescan[\s\S]*dispatch_event\(L,\s*VB_GAMEPAD_EVT_CONNECTING\)/);
    assert.match(source, /was_connecting[\s\S]*VB_GAMEPAD_EVT_CONNECT_FAILED/);
    assert.match(source, /EVT_CONNECTED/);
    assert.match(source, /EVT_DISCONNECTED/);
    assert.match(source, /EVT_UPDATE/);
    assert.match(source, /BTN_XBOX/);
    assert.match(runner, /#include\s+"lua_gamepad\.h"/);
    assert.match(runner, /vb_lua_gamepad_register\(L\)/);
  });

  it("registers a Lua I2S recording module for Voice AI", () => {
    const header = readRequired(luaI2sHeaderPath);
    const source = readRequired(luaI2sSourcePath);
    const cmake = readRequired(cmakePath);
    const runner = readRequired(runnerSourcePath);

    assert.match(cmake, /lua_i2s\.c/);
    assert.match(header, /vb_lua_i2s_register/);
    assert.match(source, /i2s_start/);
    assert.match(source, /i2s_read/);
    assert.match(source, /i2s_stop/);
    assert.match(source, /i2s_status/);
    assert.match(source, /MODE_MASTER/);
    assert.match(source, /MODE_RX/);
    assert.match(source, /CHANNEL_ONLY_LEFT/);
    assert.match(source, /FORMAT_I2S/);
    assert.match(source, /\/sdcard\/runtime\/i2s\.json/);
    assert.match(source, /i2s_channel_read/);
    assert.match(source, /i2s_channel_disable/);
    assert.match(runner, /#include\s+"lua_i2s\.h"/);
    assert.match(runner, /vb_lua_i2s_register\(L\)/);
  });

  it("starts optional runtime Wi-Fi from SD before serving installs", () => {
    const header = readRequired(runtimeWifiHeaderPath);
    const source = readRequired(runtimeWifiSourcePath);
    const cmake = readRequired(cmakePath);
    const main = readRequired(mainSourcePath);

    assert.match(cmake, /runtime_wifi\.c/);
    assert.match(cmake, /esp_wifi/);
    assert.match(cmake, /json/);
    assert.match(header, /vb_runtime_wifi_start_from_sd/);
    assert.match(source, /\/sdcard\/runtime\/wifi\.json/);
    assert.match(source, /\/sdcard\/apps\/smoke_network\/wifi\.json/);
    assert.match(source, /runtime WiFi config not found/);
    assert.match(source, /cJSON_Parse/);
    assert.match(source, /ssid/);
    assert.match(source, /password/);
    assert.match(source, /esp_netif_create_default_wifi_sta/);
    assert.match(source, /esp_wifi_set_mode\(WIFI_MODE_STA\)/);
    assert.match(source, /esp_wifi_set_config\(WIFI_IF_STA/);
    assert.match(source, /esp_wifi_start/);
    assert.match(source, /esp_wifi_connect/);
    assert.match(source, /runtime sta got ip/);
    assert.match(main, /#include "runtime_wifi\.h"/);
    assert.match(main, /vb_runtime_wifi_start_from_sd\(\)/);
    assert.match(
      main,
      /vb_board_start\(&board\)[\s\S]*vb_runtime_wifi_start_from_sd\(\)[\s\S]*vb_install_service_start\(&s_install_context\)/,
    );
  });

  it("registers a minimal LVGL Lua surface", () => {
    const header = readRequired(luaLvglHeaderPath);
    const source = readRequired(luaLvglSourcePath);
    const internal = readRequired(luaLvglInternalHeaderPath);
    const fsSource = readRequired(luaLvglFsSourcePath);
    const widgetSource = readRequired(luaLvglWidgetsSourcePath);
    const runner = readRequired(runnerSourcePath);
    const cmake = readRequired(cmakePath);
    const defaults = readRequired(sdkconfigDefaultsPath);

    assert.match(header, /vb_lua_lvgl_register/);
    assert.match(cmake, /lua_lvgl_fs\.c/);
    assert.match(cmake, /lua_lvgl_widgets\.c/);
    assert.match(defaults, /CONFIG_LV_USE_BMP=y/);
    assert.match(defaults, /CONFIG_LV_USE_PNG=y/);
    assert.match(source, /vb_lua_lvgl_widgets_register/);
    assert.match(source, /vb_lua_lvgl_fs_register/);
    assert.match(source, /vb_lua_lvgl_store_object/);
    assert.match(internal, /VB_LVGL_OBJECT_MAX 128/);
    assert.match(source, /for \(int i = 0; i < VB_LVGL_OBJECT_MAX; i\+\+\)/);
    assert.match(source, /s_objects\[i\] == NULL/);
    assert.match(source, /return i \+ 1/);
    assert.match(source, /vb_lua_lvgl_forget_object_tree/);
    assert.match(source, /lv_obj_get_child_cnt/);
    assert.match(source, /lv_obj_get_child/);
    assert.match(internal, /vb_lua_lvgl_check_object_id/);
    assert.match(internal, /vb_lua_lvgl_resolve_object/);
    assert.match(internal, /vb_lua_lvgl_store_object/);
    assert.match(internal, /vb_lua_lvgl_forget_object_tree/);
    assert.match(fsSource, /lv_extra_init/);
    assert.match(fsSource, /lv_resolve_asset_path/);
    assert.match(fsSource, /lv_asset_exists/);
    assert.match(fsSource, /lv_fs_open/);
    assert.match(fsSource, /lv_fs_drv_register/);
    assert.match(fsSource, /LVGL_FS_SD_LETTER/);
    assert.match(widgetSource, /lvgl_port_lock/);
    assert.match(widgetSource, /lv_scr_act/);
    assert.match(widgetSource, /lv_obj_create/);
    assert.match(widgetSource, /lv_obj_clean/);
    assert.match(
      widgetSource,
      /vb_lua_lvgl_forget_object_tree\(object\);[\s\S]*lv_obj_clean\(object\);/,
    );
    assert.match(widgetSource, /lv_obj_set_size/);
    assert.match(widgetSource, /lv_obj_set_width/);
    assert.match(widgetSource, /lv_obj_set_height/);
    assert.match(widgetSource, /lv_obj_set_pos/);
    assert.match(widgetSource, /lv_obj_set_x/);
    assert.match(widgetSource, /lv_obj_set_y/);
    assert.match(widgetSource, /lv_obj_del/);
    assert.match(
      widgetSource,
      /vb_lua_lvgl_forget_object_tree\(object\);[\s\S]*lv_obj_del\(object\);/,
    );
    assert.match(widgetSource, /lv_obj_move_foreground/);
    assert.match(widgetSource, /lv_obj_set_style_bg_color/);
    assert.match(widgetSource, /lv_obj_set_style_bg_opa/);
    assert.match(widgetSource, /lv_obj_set_style_bg_grad_color/);
    assert.match(widgetSource, /lv_obj_set_style_bg_grad_dir/);
    assert.match(widgetSource, /lv_obj_set_style_bg_main_stop/);
    assert.match(widgetSource, /lv_obj_set_style_bg_grad_stop/);
    assert.match(widgetSource, /lv_obj_set_style_text_color/);
    assert.match(widgetSource, /lv_obj_set_style_text_font/);
    assert.match(widgetSource, /lv_obj_set_style_text_opa/);
    assert.match(widgetSource, /lv_obj_set_style_text_align/);
    assert.match(widgetSource, /lv_obj_set_style_text_letter_space/);
    assert.match(widgetSource, /lv_obj_set_style_radius/);
    assert.match(widgetSource, /lv_obj_set_style_pad_all/);
    assert.match(widgetSource, /lv_obj_set_style_border_width/);
    assert.match(widgetSource, /lv_obj_set_style_border_color/);
    assert.match(widgetSource, /lv_obj_set_style_border_opa/);
    assert.match(widgetSource, /lv_obj_set_style_clip_corner/);
    assert.match(widgetSource, /lv_obj_set_style_shadow_width/);
    assert.match(widgetSource, /lv_obj_set_style_shadow_color/);
    assert.match(widgetSource, /lv_obj_set_style_shadow_opa/);
    assert.match(widgetSource, /lv_obj_set_style_shadow_ofs_x/);
    assert.match(widgetSource, /lv_obj_set_style_shadow_ofs_y/);
    assert.match(widgetSource, /lv_obj_set_style_shadow_spread/);
    assert.match(widgetSource, /lv_obj_set_style_opa/);
    assert.match(widgetSource, /lv_obj_remove_style_all/);
    assert.match(widgetSource, /lv_label_create/);
    assert.match(widgetSource, /lv_label_set_text/);
    assert.match(widgetSource, /lv_label_set_long_mode/);
    assert.match(widgetSource, /lv_img_create/);
    assert.match(widgetSource, /lv_img_set_src/);
    assert.match(widgetSource, /lv_img_set_antialias/);
    assert.match(widgetSource, /lv_img_set_angle/);
    assert.match(widgetSource, /lv_img_set_pivot/);
    assert.match(widgetSource, /lv_img_set_zoom/);
    assert.match(widgetSource, /lv_font_load/);
    assert.match(widgetSource, /lv_font_free/);
    assert.match(widgetSource, /lv_btn_create/);
    assert.match(widgetSource, /lv_bar_create/);
    assert.match(widgetSource, /lv_bar_set_value/);
    assert.match(widgetSource, /lv_bar_set_range/);
    assert.match(widgetSource, /lv_obj_add_flag/);
    assert.match(widgetSource, /lv_obj_clear_flag/);
    assert.match(widgetSource, /lv_obj_align/);
    assert.match(widgetSource, /lv_anim_start/);
    assert.match(widgetSource, /lv_anim_del/);
    assert.match(widgetSource, /lv_anim_delete/);
    assert.match(source, /ANIM_X/);
    assert.match(source, /ANIM_Y/);
    assert.match(source, /ANIM_W/);
    assert.match(source, /ANIM_H/);
    assert.match(source, /ANIM_OPA/);
    assert.match(source, /ANIM_PATH_EASE_OUT/);
    assert.match(source, /LV_GRAD_DIR_VER/);
    assert.match(source, /LV_ALIGN_CENTER/);
    assert.match(source, /LV_ALIGN_TOP_LEFT/);
    assert.match(source, /LV_ALIGN_TOP_MID/);
    assert.match(source, /LV_ALIGN_BOTTOM_LEFT/);
    assert.match(source, /LV_OBJ_FLAG_SCROLLABLE/);
    assert.match(source, /LV_OBJ_FLAG_HIDDEN/);
    assert.match(source, /LV_LABEL_LONG_CLIP/);
    assert.match(source, /LV_LABEL_LONG_WRAP/);
    assert.match(source, /LV_LABEL_LONG_SCROLL_CIRCULAR/);
    assert.match(source, /LV_ANIM_OFF/);
    assert.match(source, /LV_ANIM_ON/);
    assert.match(runner, /vb_lua_lvgl_register\(L\)/);
  });

  it("registers LVGL canvas drawing for MatrixRain-style apps", () => {
    const cmake = readRequired(cmakePath);
    const source = readRequired(luaLvglSourcePath);
    const header = readRequired(luaLvglInternalHeaderPath);
    const canvas = readRequired(luaLvglCanvasSourcePath);

    assert.match(cmake, /lua_lvgl_canvas\.c/);
    assert.match(source, /vb_lua_lvgl_canvas_register\(L\)/);
    assert.match(header, /vb_lua_lvgl_canvas_register/);
    assert.match(source, /LV_PART_MAIN/);
    assert.match(source, /LV_TEXT_ALIGN_CENTER/);
    assert.match(source, /LV_IMG_CF_TRUE_COLOR/);
    assert.match(canvas, /VB_LVGL_CANVAS_WIDTH\s+320/);
    assert.match(canvas, /VB_LVGL_CANVAS_HEIGHT\s+240/);
    assert.match(canvas, /lv_canvas_create/);
    assert.match(canvas, /lv_canvas_set_buffer/);
    assert.match(canvas, /lv_canvas_fill_bg/);
    assert.match(canvas, /lv_canvas_draw_rect/);
    assert.match(canvas, /lv_canvas_draw_text/);
    assert.match(canvas, /lv_obj_invalidate/);
    assert.match(canvas, /"lv_canvas_create"/);
    assert.match(canvas, /"lv_canvas_fill_bg"/);
    assert.match(canvas, /"lv_canvas_draw_rect"/);
    assert.match(canvas, /"lv_canvas_draw_text"/);
    assert.match(canvas, /"lv_canvas_frame_begin"/);
    assert.match(canvas, /"lv_canvas_frame_end"/);
    assert.match(canvas, /"lv_canvas_begin"/);
    assert.match(canvas, /"lv_canvas_end"/);
    assert.match(canvas, /"lv_obj_invalidate"/);
  });

  it("ships a Lua weather card smoke UI app", () => {
    const source = readRequired(smokeUiSourcePath);

    assert.match(source, /lv_scr_act\(\)/);
    assert.match(source, /lv_obj_clean\(root\)/);
    assert.match(source, /lv_obj_set_style_bg_color\(root,\s*0x[0-9a-fA-F]+\)/);
    assert.match(source, /lv_obj_create\(root\)/);
    assert.match(source, /lv_obj_set_size\(card,\s*288,\s*196\)/);
    assert.match(source, /lv_label_set_text\(title,\s*"VibeBoard Weather"\)/);
    assert.match(source, /lv_label_set_text\(location,\s*"Shanghai"\)/);
    assert.match(source, /lv_label_set_text\(temp,\s*"26C"\)/);
    assert.match(source, /lv_label_set_text\(condition,\s*"Cloudy"\)/);
    assert.match(source, /Humidity 68%/);
    assert.match(source, /Wind 12 km\/h/);
    assert.match(source, /Updated 00s/);
    assert.match(source, /tmr\.create\(\)/);
    assert.match(source, /tmr\.ALARM_AUTO/);
    assert.match(source, /:alarm\(1000,\s*tmr\.ALARM_AUTO/);
    assert.match(source, /weather card dynamic ok/);
    assert.match(source, /weather card tick/);
  });

  it("ships a tmr smoke app", () => {
    const info = readRequired(smokeTimerInfoPath);
    const source = readRequired(smokeTimerSourcePath);

    assert.match(info, /name\s*=\s*smoke_timer/);
    assert.match(info, /capabilities\s*=\s*timer/);
    assert.match(source, /tmr\.create\(\)/);
    assert.match(source, /tmr\.ALARM_AUTO/);
    assert.match(source, /tmr\.ALARM_SINGLE/);
    assert.match(source, /:alarm\(1000,\s*tmr\.ALARM_AUTO/);
    assert.match(source, /:alarm\(2500,\s*tmr\.ALARM_SINGLE/);
    assert.match(source, /timer:state\(\)/);
    assert.match(source, /timer:unregister\(\)/);
    assert.match(source, /smoke timer tick/);
    assert.match(source, /smoke timer single/);
  });

  it("ships a key input smoke app", () => {
    const info = readRequired(smokeKeyInfoPath);
    const source = readRequired(smokeKeySourcePath);

    assert.match(info, /name\s*=\s*smoke_key/);
    assert.match(info, /capabilities\s*=\s*lvgl,timer,input/);
    assert.match(source, /key\.on\(function\(evt_code,\s*evt_type,\s*ts_ms\)/);
    assert.match(source, /key\.push\(key\.LEFT/);
    assert.match(source, /key\.push\(key\.RIGHT/);
    assert.doesNotMatch(source, /\[key\.START\]\s*=\s*"START"/);
    assert.match(source, /lv_label_set_text\(event_label/);
    assert.match(source, /smoke key event/);
  });

  it("ships a touch coordinate smoke app", () => {
    const info = readRequired(smokeTouchInfoPath);
    const source = readRequired(smokeTouchSourcePath);

    assert.match(info, /name\s*=\s*smoke_touch/);
    assert.match(info, /capabilities\s*=\s*lvgl,timer,input/);
    assert.match(source, /touch\.on\(function\(evt,\s*x,\s*y,\s*ts_ms\)/);
    assert.match(source, /touch\.push\(touch\.DOWN/);
    assert.match(source, /touch\.push\(touch\.MOVE/);
    assert.match(source, /touch\.push\(touch\.UP/);
    assert.match(source, /lv_label_set_text\(coord_label/);
    assert.match(source, /smoke touch event/);
  });

  it("ships a gamepad compatibility smoke app", () => {
    const info = readRequired(smokeGamepadInfoPath);
    const source = readRequired(smokeGamepadSourcePath);

    assert.match(info, /name\s*=\s*smoke_gamepad/);
    assert.match(info, /capabilities\s*=\s*lvgl,timer,input/);
    assert.match(source, /gamepad\.start/);
    assert.match(source, /gamepad\.on\(gamepad\.EVT_CONNECTING/);
    assert.match(source, /gamepad\.on\(gamepad\.EVT_CONNECTED/);
    assert.match(source, /gamepad\.on\(gamepad\.EVT_DISCONNECTED/);
    assert.match(source, /gamepad\.on\(gamepad\.EVT_UPDATE/);
    assert.match(source, /gamepad\.push_state/);
    assert.match(source, /gamepad\.state/);
    assert.match(source, /gamepad\.BTN_XBOX/);
  });

  it("ships an I2S recording smoke app", () => {
    const info = readRequired(smokeI2sInfoPath);
    const source = readRequired(smokeI2sSourcePath);

    assert.match(info, /name\s*=\s*smoke_i2s/);
    assert.match(info, /capabilities\s*=\s*lvgl,timer,audio/);
    assert.match(source, /i2s\.start/);
    assert.match(source, /i2s\.read/);
    assert.match(source, /i2s\.status/);
    assert.match(source, /i2s\.stop/);
  });

  it("ships a file smoke app", () => {
    const info = readRequired(smokeFileInfoPath);
    const source = readRequired(smokeFileSourcePath);
    const config = readRequired(smokeFileConfigPath);

    assert.match(info, /name\s*=\s*smoke_file/);
    assert.match(info, /capabilities\s*=\s*file/);
    assert.match(source, /file\.exists\("config\.json"\)/);
    assert.match(source, /file\.read\("config\.json"\)/);
    assert.match(source, /file\.list\("\."\)/);
    assert.match(source, /file\.write\("runtime-state\.txt"/);
    assert.match(source, /file\.open\("config\.json",\s*"r"\)/);
    assert.match(source, /smoke file ok/);
    assert.match(config, /"city"\s*:\s*"Shanghai"/);
  });

  it("ships an asset path smoke app", () => {
    const info = readRequired(smokeAssetsInfoPath);
    const source = readRequired(smokeAssetsSourcePath);
    const image = readRequired(smokeAssetsImagePath);

    assert.match(info, /name\s*=\s*smoke_assets/);
    assert.match(info, /capabilities\s*=\s*lvgl,file/);
    assert.match(source, /file\.exists\("assets\/icon\.bin"\)/);
    assert.match(source, /lv_resolve_asset_path\("assets\/icon\.bin"\)/);
    assert.match(source, /lv_resolve_asset_path\("\/sd\/apps\/smoke_assets\/assets\/icon\.bin"\)/);
    assert.match(source, /lv_resolve_asset_path\("S:\/apps\/smoke_assets\/assets\/icon\.bin"\)/);
    assert.match(source, /lv_asset_exists\(resolved\)/);
    assert.match(source, /lv_img_create\(root\)/);
    assert.match(source, /lv_img_set_src\(image,\s*resolved\)/);
    assert.match(source, /lv_obj_set_pos\(image,\s*128,\s*96\)/);
    assert.match(source, /lv_obj_set_x\(status,\s*12\)/);
    assert.match(source, /lv_obj_set_y\(status,\s*210\)/);
    assert.match(source, /lv_label_set_long_mode\(status,\s*LV_LABEL_LONG_CLIP\)/);
    assert.match(source, /lv_obj_clear_flag\(root,\s*LV_OBJ_FLAG_SCROLLABLE\)/);
    assert.match(source, /smoke assets ok/);
    assert.match(image, /VIBEBOARD_ASSET_SMOKE/);
  });

  it("ships a visual smoke app with a real BMP asset and common widgets", () => {
    const info = readRequired(smokeVisualInfoPath);
    const source = readRequired(smokeVisualSourcePath);
    const bmp = readFileSync(smokeVisualBmpPath);

    assert.match(info, /name\s*=\s*smoke_visual/);
    assert.match(info, /capabilities\s*=\s*lvgl,file,timer/);
    assert.equal(bmp.subarray(0, 2).toString("ascii"), "BM");
    assert.match(source, /lv_resolve_asset_path\("assets\/icon\.bmp"\)/);
    assert.match(source, /lv_asset_exists\(icon_path\)/);
    assert.match(source, /lv_img_create\(root\)/);
    assert.match(source, /lv_img_set_src\(image,\s*icon_path\)/);
    assert.match(source, /lv_btn_create\(root\)/);
    assert.match(source, /lv_bar_create\(root\)/);
    assert.match(source, /lv_bar_set_range\(bar,\s*0,\s*100\)/);
    assert.match(source, /lv_bar_set_value\(bar,\s*progress,\s*LV_ANIM_ON\)/);
    assert.match(source, /tmr\.create\(\)/);
    assert.match(source, /smoke visual ok/);
  });

  it("registers common LVGL control widgets for migrated apps", () => {
    const source = readRequired(luaLvglWidgetsSourcePath);

    for (const symbol of [
      "lv_slider_create",
      "lv_slider_set_range",
      "lv_slider_set_value",
      "lv_slider_get_value",
      "lv_list_create",
      "lv_list_add_text",
      "lv_list_add_btn",
      "lv_switch_create",
      "lv_dropdown_create",
      "lv_dropdown_set_options",
      "lv_dropdown_set_selected",
      "lv_dropdown_get_selected",
      "lv_textarea_create",
      "lv_textarea_set_text",
      "lv_textarea_add_text",
      "lv_textarea_get_text",
      "lv_roller_create",
      "lv_roller_set_options",
      "lv_roller_set_selected",
      "lv_roller_get_selected",
      "lv_arc_create",
      "lv_arc_set_range",
      "lv_arc_set_value",
      "lv_arc_get_value"
    ]) {
      assert.match(source, new RegExp(`"${symbol}"`));
    }
  });

  it("ships a common control widget smoke app", () => {
    const info = readRequired(smokeControlsInfoPath);
    const source = readRequired(smokeControlsSourcePath);

    assert.match(info, /name\s*=\s*smoke_controls/);
    assert.match(info, /capabilities\s*=\s*lvgl,timer/);
    assert.match(source, /lv_slider_create\(root\)/);
    assert.match(source, /lv_list_create\(root\)/);
    assert.match(source, /lv_switch_create\(root\)/);
    assert.match(source, /lv_dropdown_create\(root\)/);
    assert.match(source, /lv_textarea_create\(root\)/);
    assert.match(source, /lv_roller_create\(root\)/);
    assert.match(source, /lv_arc_create\(root\)/);
    assert.match(source, /smoke controls ok/);
  });

  it("ships MatrixRain as the first upstream display app migration", () => {
    const info = readRequired(matrixRainInfoPath);
    const source = readRequired(matrixRainSourcePath);

    assert.match(info, /name = MatrixRain/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,timer/);
    assert.match(source, /MATRIX_RAIN_APP/);
    assert.match(source, /lv_canvas_create/);
    assert.match(source, /lv_canvas_draw_text/);
    assert.match(source, /tmr\.create/);
  });

  it("ships NixieClock as an upstream image-clock migration", () => {
    const info = readRequired(nixieClockInfoPath);
    const source = readRequired(nixieClockSourcePath);
    const digit = readFileSync(nixieClockDigitPath);
    const tube = readFileSync(nixieClockTubePath);

    assert.match(info, /name = Nixie Clock/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,file,timer,network/);
    assert.match(source, /NIXIE_CLOCK_APP/);
    assert.match(source, /ASSET_DIR = "\/sd\/apps\/nixie_clock\/assets"/);
    assert.match(source, /lv_img_create/);
    assert.match(source, /lv_img_set_src/);
    assert.match(source, /lv_obj_remove_style_all/);
    assert.match(source, /lv_img_set_antialias/);
    assert.match(source, /time_mod\.getlocal/);
    assert.match(source, /tmr\.create/);
    assert.deepEqual([...digit.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.deepEqual([...tube.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("ships Clock as an upstream analog clock migration", () => {
    const info = readRequired(clockInfoPath);
    const source = readRequired(clockSourcePath);
    const dial = readFileSync(clockDialPath);
    const hour = readFileSync(clockHourPath);

    assert.match(info, /name = Clock/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,file,timer,network/);
    assert.match(source, /CLOCK_APP/);
    assert.match(source, /ASSET_DIR = "\/sd\/apps\/clock\/assets"/);
    assert.match(source, /lv_img_set_angle/);
    assert.match(source, /lv_img_set_pivot/);
    assert.match(source, /lv_img_set_zoom/);
    assert.match(source, /lv_obj_set_style_text_font/);
    assert.match(source, /time\.getlocal/);
    assert.match(source, /tmr\.create/);
    assert.deepEqual([...dial.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.deepEqual([...hour.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("ships ConwayLife as an upstream canvas and time migration", () => {
    const info = readRequired(conwayLifeInfoPath);
    const source = readRequired(conwayLifeSourcePath);
    const font = readFileSync(conwayLifeFontPath);

    assert.match(info, /name = ConwayLife/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,file,timer/);
    assert.match(source, /CONWAY_LIFE_APP/);
    assert.match(source, /\/sd\/apps\/conway_life\/font\/time_46\.bin/);
    assert.match(source, /lv_canvas_create/);
    assert.match(source, /lv_canvas_draw_rect/);
    assert.match(source, /lv_label_create/);
    assert.match(source, /time_getlocal_fn/);
    assert.match(source, /tmr\.create/);
    assert.match(source, /PERIODIC_INJECT_MS/);
    assert.ok(font.length > 0);
  });

  it("ships FluidPendant as an upstream liquid canvas migration", () => {
    const info = readRequired(fluidPendantInfoPath);
    const source = readRequired(fluidPendantSourcePath);
    const font = readFileSync(fluidPendantFontPath);

    assert.match(info, /name = FluidPendant/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,file,timer/);
    assert.match(source, /FLUID_PENDANT_APP/);
    assert.match(source, /lv_canvas_create/);
    assert.match(source, /lv_canvas_draw_rect/);
    assert.match(source, /lv_label_create/);
    assert.match(source, /time_getlocal_fn/);
    assert.match(source, /tmr\.create/);
    assert.match(source, /APP\.init_viper_engine/);
    assert.ok(font.length > 0);
  });

  it("ships 2048 as an upstream key-driven game migration", () => {
    const info = readRequired(app2048InfoPath);
    const source = readRequired(app2048SourcePath);
    const font = readFileSync(app2048FontPath);

    assert.match(info, /name = 2048/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,file,timer,input/);
    assert.match(source, /APP_2048/);
    assert.match(source, /\/sd\/apps\/2048\/font\/tile_18\.bin/);
    assert.match(source, /local lv_begin = nil/);
    assert.match(source, /local lv_end = nil/);
    assert.doesNotMatch(source, /local lv_begin = lv_begin or/);
    assert.doesNotMatch(source, /local lv_begin = lv_canvas_frame_begin/);
    assert.doesNotMatch(source, /local lv_begin = .*lv_canvas_begin/);
    assert.match(source, /key\.on/);
    assert.match(source, /key\.off/);
    assert.match(source, /EXIT_CONFIRM_WINDOW_MS/);
    assert.match(source, /handle_exit_event/);
    assert.match(source, /pending_exit/);
    assert.match(source, /APP\.request_exit/);
    assert.match(source, /tmr\.create/);
    assert.match(source, /lv_anim_start/);
    assert.doesNotMatch(source, /lv_canvas_create/);
    assert.ok(font.length > 0);
  });

  it("ships a NES native module smoke app", () => {
    const info = readRequired(smokeNesInfoPath);
    const source = readRequired(smokeNesSourcePath);
    const nativeManifest = readRequired(smokeNesNativeManifestPath);

    assert.match(info, /name\s*=\s*smoke_nes/);
    assert.match(info, /entry\s*=\s*main\.lua/);
    assert.match(info, /capabilities\s*=\s*lvgl,timer,module,native/);
    assert.match(source, /local\s+nes\s*=\s*require\(["']nes["']\)/);
    assert.match(source, /nes\.state\(\)/);
    assert.match(source, /nes\.start\(/);
    assert.match(source, /nes\.read_audio/);
    assert.match(source, /nes\.input\.set_mask/);
    assert.match(source, /\/sdcard\/nes\/smoke\.nes/);
    assert.match(source, /core_frames/);
    assert.match(source, /audio_bytes/);
    assert.match(source, /core_last_error/);
    assert.match(source, /open rom failed/);
    assert.match(nativeManifest, /magic\s*=\s*VBNM/);
    assert.match(nativeManifest, /abi\s*=\s*vibeboard-native-module-abi@1/);
    assert.match(nativeManifest, /symbol\s*=\s*vb_native_module_init/);
    assert.match(nativeManifest, /min_host\s*=\s*vibeboard-native-host@1/);
  });

  it("ships a Lua app manager smoke app", () => {
    const info = readRequired(smokeAppManagerInfoPath);
    const source = readRequired(smokeAppManagerSourcePath);

    assert.match(info, /name\s*=\s*smoke_app_manager/);
    assert.match(info, /entry\s*=\s*main\.lua/);
    assert.match(info, /capabilities\s*=\s*lvgl,timer,input/);
    assert.match(source, /app\.list\(\)/);
    assert.match(source, /app\.rescan\(\)/);
    assert.match(source, /app\.current\(\)/);
    assert.match(source, /app\.exiting\(\)/);
    assert.match(source, /type\(app\.exit\)\s*==\s*["']function["']/);
    assert.match(source, /type\(app\.launch\)\s*==\s*["']function["']/);
    assert.match(source, /type\(app\.set_home_exit\)\s*==\s*["']function["']/);
    assert.match(source, /app\.set_home_exit\(false\)/);
    assert.match(source, /app\.set_home_exit\(true\)/);
    assert.match(source, /app\.launch\(["']smoke_key["']\)/);
    assert.match(source, /software_home_injected/);
    assert.match(source, /key\.push\(key\.HOME,\s*key\.SHORT\)/);
    assert.match(source, /key\.on/);
    assert.match(source, /key\.HOME/);
    assert.match(source, /app\.on\(["']exit["']/);
    assert.match(source, /tmr\.create\(\):alarm/);
  });

  it("keeps input declarations on migrated interactive apps", () => {
    const weatherInfo = readRequired(weatherInfoPath);
    const weather = readRequired(weatherSourcePath);
    const voiceAiInfo = readRequired(voiceAiInfoPath);
    const voiceAi = readRequired(voiceAiSourcePath);
    const nesgameInfo = readRequired(nesgameInfoPath);
    const nesgame = readRequired(nesgameSourcePath);

    assert.match(weatherInfo, /capabilities = lvgl,network,timer,input/);
    assert.match(weather, /key\.on/);
    assert.match(weather, /key\.off/);

    assert.match(voiceAiInfo, /capabilities = lvgl,network,audio,file,timer,input/);
    assert.match(voiceAi, /key\.off/);

    assert.match(nesgameInfo, /capabilities = lvgl,file,timer,input,module,native/);
    assert.match(nesgame, /key\.on/);
    assert.match(nesgame, /key\.off/);
  });

  it("ships a network smoke app for WiFi, HTTP, JSON, and NTP", () => {
    const info = readRequired(smokeNetworkInfoPath);
    const source = readRequired(smokeNetworkSourcePath);
    const config = readRequired(smokeNetworkConfigPath);

    assert.match(info, /name\s*=\s*smoke_network/);
    assert.match(info, /capabilities\s*=\s*network,file,timer/);
    assert.match(source, /file\.exists\("wifi\.json"\)/);
    assert.match(source, /sjson\.decode/);
    assert.match(source, /sjson\.encode/);
    assert.match(source, /wifi\.mode\("sta"\)/);
    assert.match(source, /wifi\.sta\.config/);
    assert.match(source, /wifi\.sta\.connect/);
    assert.match(source, /wifi\.sta\.getip/);
    assert.match(source, /time\.settimezone\("CST-8"\)/);
    assert.match(source, /time\.initntp/);
    assert.match(source, /time\.get/);
    assert.match(source, /http\.get/);
    assert.match(source, /smoke network ready/);
    assert.match(config, /"ssid"\s*:\s*"YOUR_WIFI_SSID"/);
    assert.match(config, /"password"\s*:\s*"YOUR_WIFI_PASSWORD"/);
  });

  it("ships a failure smoke app for lifecycle status checks", () => {
    const info = readRequired(smokeFailInfoPath);
    const source = readRequired(smokeFailSourcePath);

    assert.match(info, /name\s*=\s*smoke_fail/);
    assert.match(info, /entry\s*=\s*main\.lua/);
    assert.match(source, /smoke fail start/);
    assert.match(source, /intentional smoke failure/);
  });
});
