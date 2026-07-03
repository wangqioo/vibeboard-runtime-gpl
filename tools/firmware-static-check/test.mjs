import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const packageJsonPath = join(repoRoot, "package.json");
const newAppGuidePath = join(repoRoot, "docs/new-app-development-guide.md");
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
const lvglBmpSourcePath = join(firmwareRoot, "managed_components/lvgl__lvgl/src/extra/libs/bmp/lv_bmp.c");
const lvglBmpPatchPath = join(firmwareRoot, "cmake/patch_lvgl_bmp_runtime.cmake");
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
const luaImuSourcePath = join(firmwareRoot, "main/lua_imu.c");
const luaImuHeaderPath = join(firmwareRoot, "main/lua_imu.h");
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
const upstreamNesCoreBridgeSourcePath = join(upstreamNesRoot, "runtime/nes_core_bridge.cpp");
const upstreamNesPortHeaderPath = join(upstreamNesRoot, "port/nes_port.h");
const upstreamNesPortSourcePath = join(upstreamNesRoot, "port/nes_port.cpp");
const upstreamNesArduinoHeaderPath = join(upstreamNesRoot, "port/Arduino.h");
const upstreamNesAudioHeaderPath = join(upstreamNesRoot, "audio/nes_audio_out.h");
const moduleAbiHeaderPath = join(firmwareRoot, "main/module_abi.h");
const runtimeVersionHeaderPath = join(firmwareRoot, "main/runtime_version.h");
const luaTimeSourcePath = join(firmwareRoot, "main/lua_time.c");
const luaTimeHeaderPath = join(firmwareRoot, "main/lua_time.h");
const luaSysSourcePath = join(firmwareRoot, "main/lua_sys.c");
const luaSysHeaderPath = join(firmwareRoot, "main/lua_sys.h");
const luaWifiSourcePath = join(firmwareRoot, "main/lua_wifi.c");
const luaWifiHeaderPath = join(firmwareRoot, "main/lua_wifi.h");
const runtimeWifiSourcePath = join(firmwareRoot, "main/runtime_wifi.c");
const runtimeWifiHeaderPath = join(firmwareRoot, "main/runtime_wifi.h");
const projectCmakePath = join(firmwareRoot, "CMakeLists.txt");
const cmakePath = join(firmwareRoot, "main/CMakeLists.txt");
const esp32CameraPatchPath = join(firmwareRoot, "cmake/patch_esp32_camera_runtime.cmake");
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
const smokeLvglWidgetsInfoPath = join(repoRoot, "apps/smoke_lvgl_widgets/app.info");
const smokeLvglWidgetsSourcePath = join(repoRoot, "apps/smoke_lvgl_widgets/main.lua");
const smokeLvglWidgetsBmpPath = join(repoRoot, "apps/smoke_lvgl_widgets/assets/icon.bmp");
const smokeLvglStyleInfoPath = join(repoRoot, "apps/smoke_lvgl_style/app.info");
const smokeLvglStyleSourcePath = join(repoRoot, "apps/smoke_lvgl_style/main.lua");
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
const smokeImuInfoPath = join(repoRoot, "apps/smoke_imu/app.info");
const smokeImuSourcePath = join(repoRoot, "apps/smoke_imu/main.lua");
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
const btcInfoPath = join(repoRoot, "apps/btc/app.info");
const btcSourcePath = join(repoRoot, "apps/btc/main.lua");
const settingsInfoPath = join(repoRoot, "apps/settings/app.info");
const settingsSourcePath = join(repoRoot, "apps/settings/main.lua");
const hwmonInfoPath = join(repoRoot, "apps/hwmon/app.info");
const hwmonSourcePath = join(repoRoot, "apps/hwmon/main.lua");
const hwmonConfigPath = join(repoRoot, "apps/hwmon/config.json");
const spectrumInfoPath = join(repoRoot, "apps/spectrum/app.info");
const spectrumSourcePath = join(repoRoot, "apps/spectrum/main.lua");
const audioLoopbackInfoPath = join(repoRoot, "apps/audio_loopback/app.info");
const audioLoopbackSourcePath = join(repoRoot, "apps/audio_loopback/main.lua");
const codexBuddyInfoPath = join(repoRoot, "apps/codex_buddy/app.info");
const codexBuddySourcePath = join(repoRoot, "apps/codex_buddy/main.lua");
const codexBuddyConfigPath = join(repoRoot, "apps/codex_buddy/config.example.json");
const codexBuddyAssetManifestPath = join(repoRoot, "apps/codex_buddy/assets/bufo/manifest.json");
const videosInfoPath = join(repoRoot, "apps/videos/app.info");
const videosSourcePath = join(repoRoot, "apps/videos/main.lua");
const photosInfoPath = join(repoRoot, "apps/photos/app.info");
const photosSourcePath = join(repoRoot, "apps/photos/main.lua");
const planeInfoPath = join(repoRoot, "apps/plane/app.info");
const planeSourcePath = join(repoRoot, "apps/plane/main.lua");
const lvBenchmarkInfoPath = join(repoRoot, "apps/lv-benchmark/app.info");
const lvBenchmarkSourcePath = join(repoRoot, "apps/lv-benchmark/main.lua");
const miniClawInfoPath = join(repoRoot, "apps/mini_claw/app.info");
const miniClawSourcePath = join(repoRoot, "apps/mini_claw/main.lua");
const app2048InfoPath = join(repoRoot, "apps/2048/app.info");
const app2048SourcePath = join(repoRoot, "apps/2048/main.lua");
const app2048FontPath = join(repoRoot, "apps/2048/font/tile_18.bin");
const weatherInfoPath = join(repoRoot, "apps/weather/app.info");
const weatherSourcePath = join(repoRoot, "apps/weather/main.lua");
const voiceAiInfoPath = join(repoRoot, "apps/voice_ai/app.info");
const voiceAiSourcePath = join(repoRoot, "apps/voice_ai/main.lua");
const voiceAudioHelperPath = join(repoRoot, "apps/lib/voice_audio.lua");
const voiceAiCharsetPath = join(repoRoot, "apps/voice_ai/font/voice_ui_charset.txt");
const voiceAiFontSourcePath = join(firmwareRoot, "main/vb_font_voice_ai_13.c");
const commonCnFontSourcePath = join(firmwareRoot, "main/vb_font_common_cn_13.c");
const voiceAiSmokeToolPath = join(repoRoot, "tools/voice-ai-smoke/index.mjs");
const voiceAiSmokeTestPath = join(repoRoot, "tools/voice-ai-smoke/test.mjs");
const nesgameInfoPath = join(repoRoot, "apps/nesgame/app.info");
const nesgameSourcePath = join(repoRoot, "apps/nesgame/main.lua");
const nesgameNativeManifestPath = join(repoRoot, "apps/nesgame/native/nes.vbn");
const nesgameSmokeToolPath = join(repoRoot, "tools/nesgame-smoke/index.mjs");
const nesgameSmokeTestPath = join(repoRoot, "tools/nesgame-smoke/test.mjs");
const smokeCameraInfoPath = join(repoRoot, "apps/smoke_camera/app.info");
const smokeCameraSourcePath = join(repoRoot, "apps/smoke_camera/main.lua");
const cameraAppInfoPath = join(repoRoot, "apps/camera/app.info");
const cameraAppSourcePath = join(repoRoot, "apps/camera/main.lua");

function readRequired(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  return readFileSync(path, "utf8");
}

function functionBody(source, name) {
  const match = source.match(new RegExp(`(?:static\\s+)?[\\w\\s\\*_]+\\s+${name}\\([^)]*\\)\\n\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${name} should exist`);
  return match[1];
}

function luaFunctionBody(source, name) {
  const match = source.match(new RegExp(`local\\s+function\\s+${name}\\([^)]*\\)([\\s\\S]*?)\\nend`));
  assert.ok(match, `${name} should exist`);
  return match[1];
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
    assert.match(header, /VB_CAMERA_LCD_STRIPE_ROWS\s+8/);
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
    const cmake = readRequired(cmakePath);
    const allocator = readRequired(join(firmwareRoot, "main/lvgl_runtime_alloc.c"));

    assert.match(defaults, /CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL=2048/);
    assert.match(defaults, /CONFIG_SPIRAM_MALLOC_RESERVE_INTERNAL=65536/);
    assert.match(defaults, /# CONFIG_FATFS_ALLOC_PREFER_EXTRAM is not set/);
    assert.match(defaults, /CONFIG_LV_MEM_CUSTOM_INCLUDE="lvgl_runtime_alloc\.h"/);
    assert.doesNotMatch(defaults, /CONFIG_LV_MEM_CUSTOM_INCLUDE="stdlib\.h"/);
    assert.match(board, /host\.flags\s*\|=\s*SDMMC_HOST_FLAG_ALLOC_ALIGNED_BUF/);
    assert.match(cmake, /idf_component_get_property\(lvgl_lib\s+lvgl__lvgl\s+COMPONENT_LIB\)/);
    assert.match(cmake, /target_include_directories\(\$\{lvgl_lib\}\s+PUBLIC\s+\$\{CMAKE_CURRENT_LIST_DIR\}\)/);
    assert.match(cmake, /target_sources\(\$\{lvgl_lib\}\s+PRIVATE\s+\$\{CMAKE_CURRENT_LIST_DIR\}\/lvgl_runtime_alloc\.c\)/);
    assert.match(cmake, /LV_MEM_CUSTOM_ALLOC=lvgl_runtime_alloc/);
    assert.match(cmake, /LV_MEM_CUSTOM_FREE=lvgl_runtime_free/);
    assert.match(cmake, /LV_MEM_CUSTOM_REALLOC=lvgl_runtime_realloc/);
    assert.match(allocator, /heap_caps_malloc\(size,\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.match(allocator, /heap_caps_realloc\(ptr,\s*new_size,\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.match(allocator, /heap_caps_free\(ptr\)/);
  });

  it("keeps runtime WiFi startup from exhausting internal RAM", () => {
    const defaults = readRequired(sdkconfigDefaultsPath);
    const sdkconfig = readRequired(join(firmwareRoot, "sdkconfig"));
    const main = readRequired(mainSourcePath);
    const board = readRequired(boardSourcePath);
    const boardHeader = readRequired(boardHeaderPath);
    const wifiHeader = readRequired(join(firmwareRoot, "main/runtime_wifi.h"));
    const wifiSource = readRequired(join(firmwareRoot, "main/runtime_wifi.c"));

    for (const source of [defaults, sdkconfig]) {
      assert.match(source, /CONFIG_SPIRAM_TRY_ALLOCATE_WIFI_LWIP=y/);
      assert.match(source, /CONFIG_NVS_ALLOCATE_CACHE_IN_SPIRAM=y/);
      assert.match(source, /# CONFIG_ESP_WIFI_NVS_ENABLED is not set/);
      assert.match(source, /# CONFIG_ESP_PHY_CALIBRATION_AND_DATA_STORAGE is not set/);
      assert.match(source, /# CONFIG_ESP_PHY_RF_CAL_PARTIAL is not set/);
      assert.match(source, /CONFIG_ESP_PHY_RF_CAL_FULL=y/);
      assert.match(source, /CONFIG_ESP_WIFI_STATIC_RX_BUFFER_NUM=6/);
      assert.match(source, /CONFIG_ESP_WIFI_DYNAMIC_RX_BUFFER_NUM=8/);
      assert.match(source, /CONFIG_ESP_WIFI_STATIC_TX_BUFFER_NUM=8/);
      assert.match(source, /CONFIG_ESP_WIFI_MGMT_SBUF_NUM=16/);
      assert.match(source, /# CONFIG_ESP_WIFI_ENABLE_WPA3_SAE is not set/);
      assert.match(source, /# CONFIG_ESP_WIFI_ENABLE_WPA3_OWE_STA is not set/);
      assert.match(source, /CONFIG_LWIP_MAX_SOCKETS=10/);
      assert.match(source, /CONFIG_LWIP_MAX_ACTIVE_TCP=8/);
      assert.match(source, /CONFIG_LWIP_MAX_LISTENING_TCP=8/);
      assert.match(source, /CONFIG_LWIP_TCPIP_RECVMBOX_SIZE=16/);
      assert.match(source, /CONFIG_LWIP_TCP_SND_BUF_DEFAULT=2920/);
      assert.match(source, /CONFIG_LWIP_TCP_WND_DEFAULT=2920/);
      assert.match(source, /CONFIG_LWIP_MAX_UDP_PCBS=8/);
      assert.match(source, /CONFIG_LWIP_MAX_RAW_PCBS=4/);
    }

    assert.match(sdkconfig, /CONFIG_ESP_PHY_CALIBRATION_MODE=2/);

    assert.match(defaults, /# CONFIG_ESP_WIFI_ENABLE_SAE_PK is not set/);
    assert.match(defaults, /# CONFIG_ESP_WIFI_ENABLE_SAE_H2E is not set/);
    assert.match(defaults, /# CONFIG_ESP_WIFI_SOFTAP_SAE_SUPPORT is not set/);

    assert.match(
      main,
      /vb_runtime_wifi_prepare\(\)[\s\S]*vb_board_start_storage\(&board\)[\s\S]*vb_runtime_wifi_load_config_from_sd\(&wifi_config\)[\s\S]*vb_board_unmount_sd\(&board\)[\s\S]*vb_runtime_wifi_start_config\(&wifi_config\)[\s\S]*vb_board_mount_sd\(&board\)[\s\S]*vb_board_start_display\(&board\)[\s\S]*vb_app_registry_init\(\)/,
    );
    assert.match(boardHeader, /vb_board_unmount_sd/);
    assert.match(board, /esp_vfs_fat_sdcard_unmount\(VB_SD_MOUNT_POINT,\s*sd_card\)/);
    assert.match(wifiHeader, /vb_runtime_wifi_load_config_from_sd/);
    assert.match(wifiHeader, /vb_runtime_wifi_prepare/);
    assert.match(wifiHeader, /vb_runtime_wifi_start_config/);
    assert.match(wifiSource, /!CONFIG_ESP_WIFI_NVS_ENABLED && !CONFIG_ESP_PHY_CALIBRATION_AND_DATA_STORAGE/);
    assert.match(wifiSource, /vb_runtime_wifi_prepare/);
    assert.match(wifiSource, /vb_runtime_wifi_start_config/);
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

  it("keeps the LVGL task stack large enough for deferred app resource loads", () => {
    const source = readRequired(boardSourcePath);

    const stackMatch = source.match(/\.task_stack\s*=\s*(\d+)/);
    assert.ok(stackMatch, "board LVGL init overrides the default task stack");
    assert.ok(Number(stackMatch[1]) >= 8192, "LVGL task stack must handle deferred Weather background loading");
  });

  it("routes native display DMA writes through the board LCD panel", () => {
    const header = readRequired(boardHeaderPath);
    const source = readRequired(boardSourcePath);
    const hostApi = readRequired(moduleHostApiSourcePath);

    assert.match(header, /vb_board_draw_rgb565/);
    assert.match(header, /vb_board_display_takeover/);
    assert.match(header, /vb_board_display_release_takeover/);
    assert.match(source, /lvgl_port_stop\(\)/);
    assert.match(source, /lvgl_port_resume\(\)/);
    assert.match(source, /s_display_takeover_active/);
    assert.match(source, /esp_lcd_panel_draw_bitmap\(lcd_panel/);
    assert.match(source, /vb_board_draw_rgb565/);
    assert.match(source, /lvgl_port_lock\(pdMS_TO_TICKS\(100\)\)/);
    assert.match(source, /lvgl_port_unlock\(\)/);
    assert.match(hostApi, /board_lckfb_szpi_s3\.h/);
    assert.match(hostApi, /ESP_LOGW\(TAG,\s*"display push failed/);
    assert.match(hostApi, /esp_err_t\s+draw_err\s*=\s*vb_board_draw_rgb565/);
    assert.match(hostApi, /vb_board_display_takeover\(\)/);
    assert.match(hostApi, /vb_board_display_release_takeover\(\)/);
    assert.match(hostApi, /vb_board_draw_rgb565\(x,\s*y,\s*width,\s*height,\s*rgb565\)/);
    assert.doesNotMatch(hostApi, /vb_host_display_push_image_dma[\s\S]*return\s+-1;\s*\n}/);
  });

  it("does not format SD cards during mount", () => {
    const source = readRequired(boardSourcePath);

    assert.match(source, /\.format_if_mount_failed\s*=\s*false/);
  });

  it("keeps enough SD open files for runtime apps with live assets", () => {
    const header = readRequired(boardHeaderPath);
    const source = readRequired(boardSourcePath);

    assert.match(header, /VB_SD_MAX_OPEN_FILES\s+32/);
    assert.match(source, /\.max_files\s*=\s*VB_SD_MAX_OPEN_FILES/);
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
    assert.match(header, /VB_APP_REGISTRY_MAX_APPS\s+64/);
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
    assert.match(source, /next->apps/);
  });

  it("keeps cached app registry entries when a rescan cannot open the apps directory", () => {
    const source = readRequired(registrySourcePath);

    assert.match(source, /heap_caps_calloc\(1,\s*sizeof\(\*next\),\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.match(source, /vb_app_registry_result_t\s+\*next/);
    assert.match(source, /free\(next\)/);
    assert.doesNotMatch(source, /vb_app_registry_result_t\s+next\s*=\s*\{0\}/);
    assert.match(source, /DIR\s+\*dir\s*=\s*opendir\(VB_APPS_PATH\)/);
    assert.match(source, /opendir\(VB_APPS_PATH\)[\s\S]*return\s+ESP_ERR_NOT_FOUND/);
    assert.match(source, /\*result\s*=\s*\*next/);
    assert.doesNotMatch(
      source,
      /memset\(result,\s*0,\s*sizeof\(\*result\)\)[\s\S]*DIR\s+\*dir\s*=\s*opendir\(VB_APPS_PATH\)/,
    );
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
    assert.match(source, /config\.task_caps\s*=\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT/);
    assert.match(source, /config\.max_uri_handlers\s*=\s*(?:2[0-9]|[3-9][0-9])/);
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
    assert.match(source, /reboot_handler/);
    assert.match(source, /\/status/);
    assert.match(source, /\/apps/);
    assert.match(source, /register_handler\("\/runtime\/config",\s*HTTP_POST,\s*runtime_config_handler\)/);
    assert.match(source, /\/rescan/);
    assert.match(source, /\/launch/);
    assert.match(source, /\/stop/);
    assert.match(source, /register_handler\("\/reboot",\s*HTTP_POST,\s*reboot_handler\)/);
    assert.match(source, /esp_restart\(\)/);
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
    assert.match(service, /\\"native_abi_version\\":\\"%s\\"/);
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
    assert.match(runner, /vb_lua_native_module_register\(L,\s*app\)[\s\S]*load_lua_script\(L,\s*app->first_app_path,\s*script\)/);
  });

  it("cleans up native module state when a Lua app exits", () => {
    const runner = readRequired(runnerSourcePath);
    const luaModuleHeader = readRequired(luaNativeModuleHeaderPath);
    const luaModule = readRequired(luaNativeModuleSourcePath);
    const nesNativeAdapterHeader = readRequired(nesNativeAdapterHeaderPath);
    const nesNativeAdapter = readRequired(nesNativeAdapterSourcePath);

    assert.match(luaModuleHeader, /vb_lua_native_module_cleanup/);
    assert.match(runner, /cleanup_lua_runtime[\s\S]*vb_lua_native_module_cleanup\(L\)/);
    assert.match(luaModule, /vb_lua_native_module_cleanup\(lua_State \*L\)/);
    assert.match(luaModule, /vb_nes_native_module_cleanup/);
    assert.match(nesNativeAdapterHeader, /vb_nes_native_module_cleanup/);
    assert.match(nesNativeAdapter, /vb_nes_native_module_cleanup\(void\)/);
    assert.match(nesNativeAdapter, /nes_core_stop\(s_nes_module\.core_runtime,\s*3000,\s*1/);
    assert.match(nesNativeAdapter, /nes_core_destroy\(s_nes_module\.core_runtime\)/);
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

  it("keeps NES core and APU tasks watchdog-friendly during long soaks", () => {
    const bridge = readRequired(upstreamNesCoreBridgeSourcePath);
    const bus = readRequired(join(repoRoot, "modules/nes/core/bus.cpp"));
    const portHeader = readRequired(upstreamNesPortHeaderPath);
    const portSource = readRequired(upstreamNesPortSourcePath);
    const startApuTask = bridge.match(/bool\s+startApuTask\(\)[\s\S]*?\n    void\s+stopApuTask/);
    const busClock = bus.match(/MOD_IRAM_ATTR void Bus::clock\(\)[\s\S]*?#ifdef FRAMESKIP/);
    const renderImage = bus.match(/IRAM_ATTR void Bus::renderImage\(uint16_t scanline,\s*uint16_t row_count\)[\s\S]*?bool Bus::consumeRenderFailure/);

    assert.match(portHeader, /void\s+nes_port_yield\s*\(\s*void\s*\)/);
    assert.match(portSource, /extern\s+"C"\s+void\s+nes_port_yield\s*\(\s*void\s*\)/);
    assert.match(portSource, /s_host->task\.yield/);
    assert.match(portSource, /s_host->task\.yield\(\);[\s\S]*nes_port_delay\(1\);/);
    assert.doesNotMatch(portSource, /s_host->task\.yield\(\);\s*return;/);
    assert.match(bridge, /void\s+apuTaskLoop\(\)[\s\S]*nes_port_yield\(\)/);
    assert.doesNotMatch(bridge, /void\s+apuTaskLoop\(\)\s*\{\s*while\s*\(\s*!m_apu_task\s*\)/);
    assert.match(bridge, /__atomic_store_n\(&m_apu_task_started,\s*true,\s*__ATOMIC_RELEASE\);[\s\S]*while\s*\(!__atomic_load_n\(&m_apu_task_stop,\s*__ATOMIC_ACQUIRE\)\s*&&\s*!m_stop_requested\)/);
    assert.ok(startApuTask);
    assert.match(startApuTask[0], /__atomic_store_n\(&m_apu_task_started,\s*false,[\s\S]*m_host->task\.create\("nes_apu"/);
    assert.doesNotMatch(startApuTask[0], /m_host->task\.create\("nes_apu"[\s\S]*__atomic_store_n\(&m_apu_task_started,\s*false,/);
    assert.match(bridge, /__atomic_load_n\(&m_apu_task_started,\s*__ATOMIC_ACQUIRE\)/);
    assert.match(bridge, /__atomic_add_fetch\(&m_audio_apu_ticks,\s*256u,\s*__ATOMIC_RELEASE\)/);
    assert.match(bridge, /const uint32_t sample_rate = m_options\.audio_sample_rate > 0 \? m_options\.audio_sample_rate : 22050u/);
    assert.match(bridge, /const uint32_t batch_us = \(uint32_t\)\(\(256ULL \* 1000000ULL\) \/ sample_rate\)/);
    assert.match(bridge, /if \(now < next_batch_due\)[\s\S]*nes_port_delay\(sleep_us \/ 1000u\)/);
    assert.match(bridge, /void\s+taskLoop\(\)[\s\S]*nes_port_yield\(\)/);
    assert.match(bridge, /m_bus->clock\(\);[\s\S]*nes_port_yield\(\);[\s\S]*StageFrameClockDone/);
    assert.ok(busClock, "Bus::clock body is present");
    assert.match(busClock[0], /ppu_scanline \+= 3\)[\s\S]*nes_port_yield\(\)/);
    assert.match(busClock[0], /ppu\.setVBlank\(\);[\s\S]*nes_port_yield\(\);[\s\S]*cpu\.clock\(2501\)/);
    assert.ok(renderImage, "Bus::renderImage body is present");
    assert.match(renderImage[0], /submitTransferChunk\(scanline,\s*row_count,\s*&err\)[\s\S]*nes_port_yield\(\)[\s\S]*prepareRenderBuffer\(\)/);
    assert.match(bridge, /m_options\.audio_task_stack_bytes == 0[\s\S]*m_options\.audio_task_stack_bytes = 8192/);
    assert.match(bridge, /m_host->task\.create\("nes_apu"[\s\S]*m_options\.audio_task_stack_bytes/);
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
    assert.match(loader, /retry_manifest_open/);
    assert.match(loader, /VB_NATIVE_MODULE_OPEN_RETRIES/);
    assert.match(loader, /vTaskDelay\(pdMS_TO_TICKS\(VB_NATIVE_MODULE_OPEN_RETRY_DELAY_MS\)\)/);
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
    assert.match(hostApi, /const uint32_t stack_words = \(stack_depth \+ sizeof\(StackType_t\) - 1u\) \/ sizeof\(StackType_t\);/);
    assert.match(hostApi, /xTaskCreatePinnedToCore\(entry,\s*name,\s*stack_words,\s*arg,\s*priority,\s*handle,\s*tskNO_AFFINITY\)/);
    assert.doesNotMatch(hostApi, /xTaskCreatePinnedToCore\(entry,\s*name,\s*stack_depth,\s*arg,\s*priority,\s*handle,\s*tskNO_AFFINITY\)/);
    assert.doesNotMatch(hostApi, /xTaskCreatePinnedToCoreWithCaps\(entry[\s\S]*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT/);
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
    assert.match(nesNativeAdapter, /table_u16\(L,\s*"frame_width",\s*options->width\)/);
    assert.match(nesNativeAdapter, /table_u16\(L,\s*"frame_height",\s*options->height\)/);
    assert.match(nesNativeAdapter, /table_bool\(L,\s*"center_on_screen",\s*false\)/);
    assert.match(nesNativeAdapter, /table_bool\(L,\s*"audio_enabled",\s*options->audio_enabled != 0\)/);
    assert.match(nesNativeAdapter, /options->audio_lua_fallback/);
    assert.match(nesNativeAdapter, /options->audio_sample_rate/);
    assert.match(nesNativeAdapter, /options->audio_queue_bytes/);
    assert.match(nesNativeAdapter, /table_u32\(L,\s*"audio_task_stack_bytes",\s*options->audio_task_stack_bytes\)/);
    assert.match(upstreamNesCoreBridgeHeader, /uint32_t\s+audio_task_stack_bytes/);
    assert.match(nesNativeAdapter, /table_u32\(L,\s*"audio_ringbuf_samples",\s*0\)/);
    assert.match(nesNativeAdapter, /bytes_per_sample/);
    assert.match(nesNativeAdapter, /options->task_stack_bytes < 4096/);
    assert.match(nesNativeAdapter, /options->task_stack_bytes = 4096/);
    assert.doesNotMatch(nesNativeAdapter, /options->task_stack_bytes < 8192[\s\S]*options->task_stack_bytes = 16 \* 1024/);
    assert.match(nesNativeAdapterHeader, /vb_nes_native_module_read_audio/);
    assert.match(nesNativeAdapter, /vb_nes_native_module_read_audio/);
    assert.match(nesNativeAdapter, /nes_core_read_audio\(nes->core_runtime,\s*buf,\s*max_bytes\)/);
    assert.match(luaModule, /nes_stub_read_audio/);
    assert.match(luaModule, /set_module_function\(L,\s*"read_audio",\s*module,\s*nes_stub_read_audio\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"core_state"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"core_running"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"core_loaded"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"core_frames"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"rendered_frames"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"core_rendered_frames"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"module_backend"\)/);
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
    assert.match(nesHostShim, /shim_stream_window_t/);
    assert.match(nesHostShim, /shim_display_set_addr_window/);
    assert.match(nesHostShim, /shim_display_push_pixels_dma/);
    assert.match(nesHostShim, /s_source\.display\.push_image_dma\(\(vb_module_host_display_surface_t \*\)surface,\s*s_stream_window\.x,\s*s_stream_window\.y \+ s_stream_window\.pushed_rows,\s*s_stream_window\.w,\s*rows,\s*pixels\)/);
    assert.doesNotMatch(functionBody(nesHostShim, "shim_display_set_addr_window"), /return MODULE_ERR_UNSUPPORTED;/);
    assert.doesNotMatch(functionBody(nesHostShim, "shim_display_push_pixels_dma"), /return MODULE_ERR_UNSUPPORTED;/);
    assert.match(nesHostShim, /shim_task_create/);
    assert.match(nesHostShim, /shim_task_remove/);
    assert.match(nesHostShim, /strcmp\(name,\s*"nes_apu"\)\s*==\s*0/);
    assert.match(nesHostShim, /xTaskCreatePinnedToCoreWithCaps\([\s\S]*tskNO_AFFINITY,[\s\S]*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT/);
    assert.match(nesHostShim, /vTaskDeleteWithCaps/);
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
    assert.match(upstreamNesCoreBridgeHeader, /audio_written_bytes/);
    assert.match(upstreamNesCoreBridgeHeader, /audio_apu_task_present/);
    assert.match(upstreamNesCoreBridgeHeader, /audio_apu_task_started/);
    assert.match(upstreamNesCoreBridgeHeader, /audio_apu_task_ret/);
    assert.match(upstreamNesCoreBridgeHeader, /audio_apu_ticks/);
    assert.match(upstreamNesCoreBridgeHeader, /audio_sink_calls/);
    assert.match(upstreamNesCoreBridgeHeader, /audio_queued_bytes/);
    assert.match(nesNativeAdapter, /audio_written_bytes/);
    assert.match(nesNativeAdapter, /audio_apu_task_present/);
    assert.match(nesNativeAdapter, /audio_apu_task_started/);
    assert.match(nesNativeAdapter, /audio_apu_task_ret/);
    assert.match(nesNativeAdapter, /audio_apu_ticks/);
    assert.match(nesNativeAdapter, /audio_sink_calls/);
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

  it("bridges Lua gamepad state into the native NES host API", () => {
    const luaGamepadHeader = readRequired(luaGamepadHeaderPath);
    const luaGamepad = readRequired(luaGamepadSourcePath);
    const hostApiHeader = readRequired(moduleHostApiHeaderPath);
    const hostApi = readRequired(moduleHostApiSourcePath);
    const nesHostShim = readRequired(nesHostShimSourcePath);
    const nesNativeAdapter = readRequired(nesNativeAdapterSourcePath);
    const moduleAbi = readRequired(upstreamNesCoreBridgeHeaderPath.replace("runtime/nes_core_bridge.h", "include/module_abi.h"));

    assert.match(luaGamepadHeader, /vb_lua_gamepad_snapshot_t/);
    assert.match(luaGamepadHeader, /vb_lua_gamepad_snapshot\(/);
    assert.match(luaGamepad, /vb_lua_gamepad_snapshot\(vb_lua_gamepad_snapshot_t\s+\*out\)/);
    assert.match(luaGamepad, /out->buttons_mask\s*=\s*s_gamepad\.buttons_mask/);
    assert.match(luaGamepad, /out->dpad_up\s*=\s*s_gamepad\.dpad_up/);

    assert.match(hostApiHeader, /vb_module_host_gamepad_state_t/);
    assert.match(hostApiHeader, /vb_module_host_gamepad_api_t/);
    assert.match(hostApiHeader, /vb_module_host_gamepad_api_t\s+gamepad/);
    assert.match(hostApi, /#include\s+"lua_gamepad\.h"/);
    assert.match(hostApi, /static\s+int\s+vb_host_gamepad_snapshot/);
    assert.match(hostApi, /vb_lua_gamepad_snapshot\(&snapshot\)/);
    assert.match(hostApi, /api->gamepad\.snapshot\s*=\s*vb_host_gamepad_snapshot/);

    assert.match(nesHostShim, /static\s+uint32_t\s+shim_gamepad_state_mask\(uint8_t\s+player\)/);
    assert.match(moduleAbi, /uint32_t\s+\(\*state_mask\)\(uint8_t\s+player\)/);
    assert.match(nesHostShim, /MODULE_GAMEPAD_A/);
    assert.match(nesHostShim, /MODULE_GAMEPAD_SELECT/);
    assert.match(nesHostShim, /MODULE_GAMEPAD_START/);
    assert.match(nesHostShim, /MODULE_GAMEPAD_UP/);
    assert.match(nesHostShim, /MODULE_GAMEPAD_HOME/);
    assert.match(nesHostShim, /host->gamepad\.state_mask\s*=\s*shim_gamepad_state_mask/);

    assert.match(nesNativeAdapter, /uint32_t\s+host_gamepad_mask/);
    assert.match(nesNativeAdapter, /bool\s+host_gamepad_active/);
    assert.match(nesNativeAdapter, /static\s+uint32_t\s+module_gamepad_mask_to_nes_mask\(uint32_t\s+mask\)/);
    assert.match(nesNativeAdapter, /static\s+void\s+sync_host_gamepad\(vb_nes_native_module_t\s+\*nes\)/);
    assert.match(nesNativeAdapter, /nes_core_set_input_mask\(nes->core_runtime,\s*module_gamepad_mask_to_nes_mask\(host_mask\)\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"host_gamepad_mask"\)/);
    assert.match(nesNativeAdapter, /lua_setfield\(L,\s*-2,\s*"host_gamepad_active"\)/);
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

  it("keeps nesgame smokeable with app-local ROM fallback and machine-readable metrics", () => {
    const app = readRequired(nesgameSourcePath);
    const packageJson = readRequired(packageJsonPath);
    const smokeTool = readRequired(nesgameSmokeToolPath);
    const smokeTest = readRequired(nesgameSmokeTestPath);

    assert.match(app, /APP\.APP_ROM_DIR\s*=\s*"roms"/);
    assert.match(app, /APP\.APP_ROM_ABS_DIR\s*=\s*"\/sdcard\/apps\/nesgame\/roms"/);
    assert.match(app, /APP\.ROM_DIRS\s*=\s*\{[\s\S]*APP\.APP_ROM_DIR[\s\S]*"\/sd\/nes"[\s\S]*\}/);
    assert.match(app, /scan_roms\(\)/);
    assert.match(app, /for\s+_,\s*dir_path\s+in\s+ipairs\(APP\.ROM_DIRS\)/);
    assert.match(app, /type\(entry\)\s*==\s*"string"/);
    assert.match(app, /rom_path_for_entry/);
    assert.match(app, /metrics\.json/);
    assert.match(app, /write_metrics/);
    assert.match(app, /rom_present/);
    assert.match(app, /rom_count/);
    assert.match(app, /selected_index/);
    assert.match(app, /screen_mode/);
    assert.match(app, /rendered_frames/);
    assert.match(app, /audio_bytes/);
    assert.match(app, /last_gamepad_buttons/);
    assert.match(app, /last_gamepad_mask/);
    assert.match(app, /metrics_timer/);
    assert.match(app, /gamepad_timer/);
    assert.match(app, /start_gamepad_service_deferred/);
    assert.match(app, /APP\.gamepad_timer:alarm\(50,\s*tmr\.ALARM_SINGLE/);
    const bootSequence = app.match(/local function boot\(\)[\s\S]*?return true\s+end/);
    assert.ok(bootSequence, "nesgame boot sequence is present");
    assert.ok(
      bootSequence[0].indexOf("start_gamepad_service_deferred()") > bootSequence[0].indexOf("register_key_handlers()"),
      "nesgame should defer BLE/gamepad startup until after key registration",
    );
    assert.doesNotMatch(app, /if\s+not\s+start_gamepad_service\(\)\s+then\s+return\s+false\s+end/);
    assert.match(app, /local\s+update_metrics/);
    assert.match(app, /update_metrics\s*=\s*function\(status_override\)/);
    assert.ok(
      app.indexOf("local update_metrics") < app.indexOf("local function render_selector_ui"),
      "update_metrics must be predeclared before render_selector_ui so Lua does not resolve it as a nil global",
    );
    assert.match(app, /nes\.read_audio/);
    assert.match(app, /task_stack_bytes\s*=\s*6144/);
    assert.match(app, /audio_task_stack_bytes\s*=\s*8192/);
    assert.match(app, /transfer_rows\s*=\s*1/);
    assert.match(app, /audio_enabled\s*=\s*true/);
    assert.match(app, /audio_lua_fallback\s*=\s*true/);
    assert.match(app, /audio_queue_bytes\s*=\s*32768/);
    assert.match(app, /COPY \.NES TO \/APPS\/NESGAME\/ROMS/);
    assert.match(app, /local\s+ALIGN_LEFT_MID\s*=\s*LV_ALIGN_LEFT_MID\s+or\s+4/);
    assert.match(app, /local\s+ALIGN_RIGHT_MID\s*=\s*LV_ALIGN_RIGHT_MID\s+or\s+6/);
    assert.match(app, /local\s+ALIGN_TOP_RIGHT\s*=\s*LV_ALIGN_TOP_RIGHT\s+or\s+2/);
    assert.doesNotMatch(app, /lv_obj_align\(box,\s*align\s+or\s+LV_ALIGN_CENTER/);
    assert.match(packageJson, /"test:nesgame-smoke":\s*"node --test tools\/nesgame-smoke\/test\.mjs"/);
    assert.match(packageJson, /"nesgame:smoke":\s*"node tools\/nesgame-smoke\/index\.mjs"/);
    assert.match(smokeTool, /uploadSmokeNesRom/);
    assert.match(smokeTool, /runLifecycleSmoke/);
    assert.match(smokeTool, /waitForSelectorMetrics/);
    assert.match(smokeTool, /selectorHasRom/);
    assert.match(smokeTool, /\/input\/key\?code=/);
    assert.match(smokeTool, /--inject-gamepad/);
    assert.match(smokeTool, /\/input\/gamepad/);
    assert.match(smokeTool, /last_gamepad_mask/);
    assert.match(smokeTool, /waitForRunningMetrics/);
    assert.match(smokeTool, /requireFrameGrowth/);
    assert.match(smokeTool, /nesgame smoke ok/);
    assert.match(smokeTest, /uploads a smoke ROM, launches nesgame, verifies selector metrics, injects start, and verifies frame growth/);
    assert.match(smokeTest, /verify running NES input through HTTP gamepad injection/);
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

  it("preserves the previous app directory when staged commit replacement fails", () => {
    const source = readRequired(installServiceSourcePath);
    const commitStart = source.indexOf("static esp_err_t install_commit_handler");
    const abortStart = source.indexOf("static esp_err_t install_abort_handler", commitStart);
    assert.ok(commitStart >= 0, "install_commit_handler should exist");
    assert.ok(abortStart > commitStart, "install_abort_handler should follow install_commit_handler");
    const commit = source.slice(commitStart, abortStart);

    assert.match(source, /static esp_err_t build_commit_backup_path/);
    assert.match(commit, /char backup_path\[VB_APP_PATH_MAX\]/);
    assert.match(commit, /build_commit_backup_path\(backup_path,\s*sizeof\(backup_path\),\s*stage\)/);
    assert.match(commit, /rename\(app_path,\s*backup_path\)/);
    assert.match(commit, /rename\(stage_path,\s*app_path\)/);
    assert.match(commit, /rename\(backup_path,\s*app_path\)/);
    assert.match(commit, /remove_tree\(backup_path\)/);
    assert.ok(
      commit.indexOf("rename(app_path, backup_path)") < commit.indexOf("rename(stage_path, app_path)"),
      "old app should be moved to backup before staged app replaces it",
    );
    assert.ok(
      commit.indexOf("rename(backup_path, app_path)") > commit.indexOf("rename(stage_path, app_path)"),
      "old app restore should happen only after staged app replacement fails",
    );
    assert.doesNotMatch(
      commit,
      /remove_tree\(app_path\)[\s\S]{0,200}rename\(stage_path,\s*app_path\)/,
      "commit must not delete the old app immediately before moving the staged app into place",
    );
  });

  it("exposes Lua runner lifecycle for launcher and HTTP launch", () => {
    const header = readRequired(join(firmwareRoot, "main/app_runner.h"));
    const runner = readRequired(runnerSourcePath);
    const boardHeader = readRequired(boardHeaderPath);
    const board = readRequired(boardSourcePath);
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
    assert.match(header, /vb_app_runner_launch_async_from_registry/);
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
    assert.match(runner, /#define\s+VB_LUA_TASK_STACK_SIZE\s+\(48\s*\*\s*1024\)/);
    assert.match(runner, /xTaskCreatePinnedToCoreWithCaps/);
    assert.match(runner, /MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT/);
    assert.match(runner, /vb_app_registry_entry_t/);
    assert.match(runner, /entry_to_registry/);
    assert.match(runner, /s_runner_state/);
    assert.match(runner, /stop_requested/);
    assert.match(runner, /vb_lua_tmr_set_stop_flag/);
    assert.match(runner, /lua_psram_alloc/);
    assert.match(runner, /lua_newstate\(lua_psram_alloc,\s*NULL,\s*0\)/);
    assert.match(runner, /heap_caps_realloc\(ptr,\s*nsize,\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.doesNotMatch(runner, /luaL_newstate/);
    assert.match(runner, /luaL_openlibs/);
    assert.match(runner, /preload_lua_file/);
    assert.match(runner, /FILE\s+\*file\s*=\s*fopen\(path,\s*"rb"\)/);
    assert.match(runner, /fseek\(file,\s*0,\s*SEEK_END\)/);
    assert.match(runner, /ftell\(file\)/);
    assert.match(runner, /heap_caps_malloc\(\(size_t\)size,\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.match(runner, /fread\(data,\s*1,\s*\(size_t\)size,\s*file\)/);
    assert.match(runner, /load_lua_script/);
    assert.match(runner, /luaL_loadbufferx\(L,\s*script->data,\s*script->size,\s*chunk_name,\s*NULL\)/);
    assert.match(runner, /preload_lua_file\(app->first_app_path,\s*&context\.script/);
    assert.match(runner, /context->registry\s*=\s*\*registry/);
    assert.match(runner, /context->registry\.first_app_path/);
    assert.match(runner, /preload_lua_file\(context->registry\.first_app_path,\s*&context->script/);
    assert.match(runner, /run_lua_file\(&context->registry,\s*&context->script/);
    assert.match(runner, /free_lua_script\(&context->script\)/);
    assert.match(runner, /s_script_reader_mutex/);
    assert.match(runner, /StaticSemaphore_t\s+s_script_reader_mutex_buffer/);
    assert.match(runner, /xSemaphoreCreateMutexStatic\(&s_script_reader_mutex_buffer\)/);
    assert.doesNotMatch(runner, /xSemaphoreCreateMutex\(\)/);
    assert.match(runner, /xSemaphoreTake\(s_script_reader_mutex,\s*portMAX_DELAY\)/);
    assert.match(runner, /xSemaphoreGive\(s_script_reader_mutex\)/);
    assert.doesNotMatch(runner, /heap_caps_malloc\(VB_LUA_SCRIPT_READ_CHUNK/);
    assert.doesNotMatch(runner, /script read buffer alloc failed/);
    assert.doesNotMatch(runner, /lua_load\(L,\s*lua_script_reader/);
    assert.doesNotMatch(runner, /open\(path,\s*O_RDONLY\)/);
    assert.doesNotMatch(runner, /read\(fd,\s*script\s*\+\s*offset/);
    assert.doesNotMatch(runner, /fread\(reader->buffer,\s*1,\s*VB_LUA_SCRIPT_READ_CHUNK/);
    assert.doesNotMatch(runner, /#include\s+"ff\.h"/);
    assert.doesNotMatch(boardHeader, /vb_board_resolve_sd_fatfs_path/);
    assert.doesNotMatch(board, /ff_diskio_get_pdrv_card/);
    assert.doesNotMatch(runner, /luaL_dofile/);
    assert.match(runner, /Lua app ok/);
    assert.doesNotMatch(main, /vb_app_runner_run\(s_apps,\s*&run\)/);
    assert.match(main, /vb_launcher_ui_show\(s_apps,\s*scan_err\)/);
  });

  it("marks Lua apps running only after the script reaches the event loop", () => {
    const runner = readRequired(runnerSourcePath);

    const runLuaFile = runner.match(/static esp_err_t run_lua_file[\s\S]*?static void lua_task/);
    assert.ok(runLuaFile, "run_lua_file body is present");
    const loadIndex = runLuaFile[0].indexOf("load_lua_script");
    const runningIndex = runLuaFile[0].indexOf("set_running_if_starting()");
    const loopIndex = runLuaFile[0].indexOf("vb_lua_tmr_run_loop");
    assert.ok(loadIndex >= 0, "run_lua_file loads the Lua script");
    assert.ok(runningIndex > loadIndex, "runner marks running after Lua script load");
    assert.ok(loopIndex > runningIndex, "runner marks running before entering timer loop");

    const luaTask = runner.match(/static void lua_task[\s\S]*?static void lua_async_task/);
    const luaAsyncTask = runner.match(/static void lua_async_task[\s\S]*?esp_err_t vb_app_runner_run/);
    assert.ok(luaTask, "lua_task body is present");
    assert.ok(luaAsyncTask, "lua_async_task body is present");
    assert.doesNotMatch(luaTask[0], /set_running_if_starting\(\)/);
    assert.doesNotMatch(luaAsyncTask[0], /set_running_if_starting\(\)/);
  });

  it("registers a read-only Lua app manager module", () => {
    const source = readRequired(luaAppSourcePath);
    const header = readRequired(luaAppHeaderPath);
    const runner = readRequired(runnerSourcePath);
    const cmake = readRequired(cmakePath);

    assert.match(header, /vb_lua_app_register/);
    assert.match(header, /vb_lua_app_set_stop_flag/);
    assert.match(header, /vb_lua_app_set_registry/);
    assert.match(header, /const\s+vb_app_registry_result_t\s+\*registry/);
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
    assert.match(source, /push_registry_apps/);
    assert.match(source, /state->registry/);
    assert.doesNotMatch(source, /vb_app_registry_scan/);
    assert.match(source, /vb_app_runner_current_id/);
    assert.match(source, /vb_app_runner_current_state_name/);
    assert.match(source, /vb_lua_app_dispatch_exit/);
    assert.match(runner, /#include\s+"lua_app\.h"/);
    assert.match(runner, /vb_lua_app_set_stop_flag\(&runtime\.app,\s*&s_runner_state\.stop_requested\)/);
    assert.match(runner, /vb_lua_app_set_registry\(&runtime\.app,\s*app\)/);
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

  it("exposes a minimal Lua WebUI route bridge for active apps", () => {
    const source = readRequired(luaAppSourcePath);
    const header = readRequired(luaAppHeaderPath);
    const runner = readRequired(runnerSourcePath);
    const runnerHeader = readRequired(runnerHeaderPath);
    const install = readRequired(installServiceSourcePath);

    assert.match(header, /webui_enabled/);
    assert.match(header, /route_callback_ref/);
    assert.match(header, /vb_lua_app_dispatch_webui/);
    assert.match(source, /lua_app_route_base/);
    assert.match(source, /lua_app_set_webui/);
    assert.match(source, /lua_app_route/);
    assert.match(source, /"route_base",\s*lua_app_route_base/);
    assert.match(source, /"set_webui",\s*lua_app_set_webui/);
    assert.match(source, /"route",\s*lua_app_route/);
    assert.match(source, /VB_LUA_APP_WEBUI_ROUTE_WILDCARD\s+"\/app\/\*"/);
    assert.match(source, /state->webui_enabled\s*=\s*lua_toboolean\(L,\s*1\)/);
    assert.match(source, /luaL_ref\(L,\s*LUA_REGISTRYINDEX\)/);
    assert.match(source, /vb_lua_app_dispatch_webui/);
    assert.match(runnerHeader, /vb_app_runner_dispatch_webui/);
    assert.match(runner, /vb_app_runner_dispatch_webui\(const char \*path/);
    assert.match(runner, /s_active_runtime/);
    assert.match(runner, /vb_webui_request_t/);
    assert.match(runner, /s_webui_queue/);
    assert.match(runner, /xQueueSend\(s_webui_queue/);
    assert.match(runner, /xSemaphoreTake\(request->done/);
    assert.match(runner, /vb_lua_tmr_set_poll_callback\(&runtime\.tmr,\s*vb_lua_runner_poll,\s*&runtime\)/);
    assert.match(runner, /static int vb_lua_runner_poll\(lua_State \*L,\s*void \*user_data\)/);
    assert.match(runner, /xQueueReceive\(s_webui_queue/);
    assert.match(runner, /vb_lua_app_dispatch_webui\(L,[\s\S]*&runtime->app/);
    assert.doesNotMatch(functionBody(runner, "vb_app_runner_dispatch_webui"), /vb_lua_app_dispatch_webui/);
    assert.match(install, /webui_handler/);
    assert.match(install, /register_handler\("\/app\/\*",\s*HTTP_GET,\s*webui_handler\)/);
    assert.match(install, /register_handler\("\/app\/\*",\s*HTTP_POST,\s*webui_handler\)/);
    assert.match(install, /req->content_len/);
    assert.match(install, /httpd_req_recv/);
    assert.match(install, /vb_app_runner_dispatch_webui/);
    assert.match(install, /HTTPD_404_NOT_FOUND/);
  });

  it("exposes the last Lua runner result for launcher failure feedback", () => {
    const header = readRequired(runnerHeaderPath);
    const runner = readRequired(runnerSourcePath);

    assert.match(header, /vb_app_runner_last_status/);
    assert.match(header, /vb_app_runner_last_message/);
    assert.match(header, /vb_app_runner_note_launch_failure/);
    assert.match(runner, /last_message/);
    assert.match(runner, /vb_app_runner_last_status/);
    assert.match(runner, /vb_app_runner_last_message/);
    assert.match(runner, /strlcpy\(s_runner_state\.last_message/);
    assert.match(runner, /vb_app_runner_note_launch_failure/);
    assert.match(runner, /s_runner_state\.lifecycle_state\s*=\s*VB_APP_RUNNER_STATE_FAILED/);
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
    assert.match(installService, /match_uri_without_query/);
    assert.match(installService, /uri\[i\]\s*==\s*'\?'/);
    assert.match(installService, /httpd_uri_match_wildcard\(reference_uri,\s*uri,\s*path_len\)/);
    assert.match(installService, /config\.uri_match_fn\s*=\s*match_uri_without_query/);
    assert.doesNotMatch(installService, /config\.uri_match_fn\s*=\s*httpd_uri_match_wildcard/);
    assert.match(installService, /launch_deferred_task/);
    assert.match(installService, /heap_caps_calloc\(1,\s*sizeof\(\*job\),\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.match(installService, /heap_caps_free\(job\)/);
    assert.match(installService, /xTaskCreatePinnedToCoreWithCaps\(launch_deferred_task/);
    assert.match(installService, /xTaskCreatePinnedToCoreWithCaps\([\s\S]*launch_deferred_task[\s\S]*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT/);
    assert.doesNotMatch(installService, /xTaskCreatePinnedToCore\(launch_deferred_task/);
    assert.match(installService, /scan_err\s*=\s*vb_app_registry_scan\(s_context->registry\)/);
    assert.match(installService, /scan_err\s*!=\s*ESP_OK/);
    assert.doesNotMatch(installService, /scan_err\s*!=\s*ESP_OK\s*&&\s*scan_err\s*!=\s*ESP_ERR_NOT_FOUND/);
    assert.match(installService, /send_json\(req,\s*body\)[\s\S]*return\s+ESP_OK/);
    assert.match(installService, /selected_index/);
    assert.match(installService, /queue_launch_after_response\(s_context->registry,\s*selected_index\)/);
    assert.match(installService, /static void http_launch_before_start\(void \*user_data\)[\s\S]*vb_launcher_ui_note_async_launch\(\)/);
    assert.match(installService, /const vb_app_runner_launch_options_t options = \{[\s\S]*\.before_start = http_launch_before_start/);
    assert.match(installService, /launch_deferred_task[\s\S]*vb_app_runner_launch_async_with_options\(entry,\s*&options\)/);
    assert.doesNotMatch(installService, /launch_deferred_task[\s\S]*vb_app_runner_launch_async_from_registry\(&job->registry,\s*job->selected_index\)/);
    assert.doesNotMatch(installService, /launch_handler[\s\S]*vb_app_runner_launch_async_from_registry\(s_context->registry,\s*selected_index\)/);
    assert.doesNotMatch(installService, /vb_app_runner_launch_async\(&selected_app\)/);
    assert.doesNotMatch(installService, /vb_app_runner_launch_async_with_options\(&selected_app,\s*&launch_options\)/);
    assert.match(source, /vb_app_runner_is_running/);
    assert.match(source, /vb_app_runner_current_state_name/);
    assert.match(source, /vb_app_runner_last_message/);
    assert.match(source, /Failed:/);
    assert.match(source, /Stopped/);
    assert.doesNotMatch(source, /launcher inactive; BOOT long press: stop app/);
    assert.doesNotMatch(source, /if \(vb_app_runner_is_running\(\)\) \{\s*ESP_LOGI\(TAG,\s*"launcher inactive; BOOT long press: stop app"/);
    assert.match(source, /xTaskCreatePinnedToCoreWithCaps\(return_to_launcher_task/);
    assert.match(source, /"vb_return",\s*8192/);
    assert.match(source, /MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT/);
  });

  it("gives heavier migrated apps enough time to stop before switching", () => {
    const runnerHeader = readRequired(runnerHeaderPath);
    const installService = readRequired(installServiceSourcePath);
    const launcher = readRequired(launcherSourcePath);

    const stopTimeoutMatch = runnerHeader.match(/VB_APP_RUNNER_STOP_TIMEOUT_MS\s+(\d+)/);
    assert.ok(stopTimeoutMatch, "runner stop timeout constant is declared");
    assert.ok(Number(stopTimeoutMatch[1]) >= 15000, "heavy Lua apps need at least 15s to unwind during stop");
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
    assert.match(source, /\\"native_abi_version\\":\\"%s\\"/);
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

  it("defers timers created inside timer callbacks to a later scheduler pass", () => {
    const header = readRequired(luaTmrHeaderPath);
    const source = readRequired(luaTmrSourcePath);

    assert.match(header, /uint32_t\s+generation/);
    assert.match(source, /typedef struct \{\s+int index;\s+uint32_t generation;/);
    assert.match(source, /handle->generation\s*=\s*timer->generation/);
    assert.match(source, /timer->generation != handle->generation/);
    assert.match(source, /state->generation\+\+/);
    assert.match(source, /const\s+uint32_t\s+run_generation\s*=\s*state->generation/);
    assert.match(source, /timer->generation\s*>\s*run_generation/);
  });

  it("releases one-shot timer slots after their callback runs", () => {
    const source = readRequired(luaTmrSourcePath);

    assert.match(source, /static void release_timer_slot\(lua_State \*L,\s*vb_lua_tmr_state_t \*state,\s*vb_lua_timer_t \*timer\)/);
    assert.match(source, /release_timer_slot\(L,\s*state,\s*timer\)/);
    assert.match(source, /timer->mode == TMR_ALARM_SINGLE[\s\S]*release_timer_slot\(L,\s*state,\s*timer\)/);
    assert.match(source, /timer->mode == TMR_ALARM_SEMI[\s\S]*timer->active = false/);
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

  it("exposes a narrow HTTP key injection smoke hook for active Lua apps", () => {
    const installService = readRequired(installServiceSourcePath);

    assert.match(installService, /#include\s+"lua_key\.h"/);
    assert.match(installService, /static\s+esp_err_t\s+input_key_handler\(httpd_req_t\s+\*req\)/);
    assert.match(installService, /parse_key_code/);
    assert.match(installService, /parse_key_event/);
    assert.match(installService, /vb_app_runner_enqueue_key\(code,\s*event\)/);
    assert.match(installService, /register_handler\("\/input\/key",\s*HTTP_POST,\s*input_key_handler\)/);
    assert.match(installService, /injected/);
    assert.doesNotMatch(installService, /atoi\(.*code/);
    assert.doesNotMatch(installService, /atoi\(.*event/);
  });

  it("exposes a read-only app file endpoint for smoke artifacts", () => {
    const installService = readRequired(installServiceSourcePath);

    assert.match(installService, /static\s+esp_err_t\s+app_file_handler\(httpd_req_t\s+\*req\)/);
    assert.match(installService, /static\s+esp_err_t\s+sd_file_handler\(httpd_req_t\s+\*req\)/);
    assert.match(installService, /camera_sd_service_pause_preview/);
    assert.match(installService, /camera_sd_service_resume_preview/);
    assert.match(installService, /#include\s+"freertos\/semphr\.h"/);
    assert.match(installService, /s_camera_sd_service_lock/);
    assert.match(installService, /xSemaphoreCreateMutex\(\)/);
    assert.match(installService, /xSemaphoreTake\(s_camera_sd_service_lock,\s*portMAX_DELAY\)/);
    assert.match(installService, /xSemaphoreGive\(s_camera_sd_service_lock\)/);
    assert.match(installService, /vb_camera_sd_service_guard_t/);
    assert.match(installService, /#include\s+"board_lckfb_szpi_s3\.h"/);
    assert.match(installService, /vb_board_camera_preview_mode\(&preview_width,\s*&preview_height\)/);
    assert.match(installService, /vb_board_camera_standby\(\)/);
    assert.match(installService, /vb_board_camera_preview_start_low_memory\(\)/);
    assert.match(installService, /launch using cached app registry after scan failed/);
    assert.match(functionBody(installService, "launch_handler"), /scan_err != ESP_ERR_NOT_FOUND \|\| s_context->registry->stored_app_count == 0/);
    assert.match(installService, /vb_camera_sd_service_guard_t\s+camera_guard\s*=\s*camera_sd_service_pause_preview\(\)/);
    assert.match(installService, /camera_sd_service_resume_preview\(camera_guard\)/);
    assert.match(installService, /rescan_handler[\s\S]*camera_sd_service_pause_preview\(\)/);
    assert.match(installService, /rescan_handler[\s\S]*camera_sd_service_resume_preview\(camera_guard\)/);
    assert.match(installService, /register_handler\("\/apps\/file",\s*HTTP_GET,\s*app_file_handler\)/);
    assert.match(installService, /register_handler\("\/sd\/file",\s*HTTP_GET,\s*sd_file_handler\)/);
    assert.match(installService, /get_query_value\(req,\s*"app"/);
    assert.match(installService, /get_query_value\(req,\s*"path"/);
    assert.match(installService, /static\s+bool\s+is_sd_data_file_path\(const\s+char\s+\*path\)/);
    assert.match(installService, /is_sd_data_file_path\(path\)/);
    assert.match(installService, /reject_unsafe_path\(app\)/);
    assert.match(installService, /reject_unsafe_path\(path\)/);
    assert.match(installService, /fopen\(full_path,\s*"rb"\)/);
    assert.match(installService, /httpd_resp_send_chunk/);
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

  it("registers a Lua IMU module backed by the board QMI8658 sensor", () => {
    const boardHeader = readRequired(boardHeaderPath);
    const boardSource = readRequired(boardSourcePath);
    const runner = readRequired(runnerSourcePath);
    const imuHeader = readRequired(luaImuHeaderPath);
    const imuSource = readRequired(luaImuSourcePath);
    const validator = readRequired(join(repoRoot, "tools/app-validator/index.mjs"));
    const cmake = readRequired(cmakePath);

    assert.match(boardHeader, /vb_board_imu_sample_t/);
    assert.match(boardHeader, /vb_board_imu_available/);
    assert.match(boardHeader, /vb_board_imu_read/);
    assert.match(boardSource, /VB_QMI8658_ADDR\s+0x6A/);
    assert.match(boardSource, /VB_QMI8658_WHO_AM_I/);
    assert.match(boardSource, /qmi8658_init/);
    assert.match(boardSource, /qmi8658_write\(VB_QMI8658_CTRL7,\s*0x03\)/);
    assert.match(boardSource, /qmi8658_write\(VB_QMI8658_CTRL2,\s*0x95\)/);
    assert.match(boardSource, /qmi8658_write\(VB_QMI8658_CTRL3,\s*0xd5\)/);
    assert.match(boardSource, /vb_board_imu_read/);
    assert.match(imuHeader, /vb_lua_imu_state_t/);
    assert.match(imuHeader, /vb_lua_imu_process_pending/);
    assert.match(imuSource, /"on",\s*imu_on/);
    assert.match(imuSource, /"off",\s*imu_off/);
    assert.match(imuSource, /"read",\s*imu_read/);
    assert.match(imuSource, /"state",\s*imu_state/);
    assert.match(imuSource, /"push",\s*imu_push/);
    assert.match(runner, /#include "lua_imu\.h"/);
    assert.match(runner, /vb_lua_imu_init\(&runtime\.imu\)/);
    assert.match(runner, /vb_lua_imu_set_available\(&runtime\.imu,\s*vb_board_imu_available\(\)\)/);
    assert.match(runner, /vb_lua_imu_register\(L,\s*&runtime\.imu\)/);
    assert.match(runner, /vb_lua_imu_process_pending\(L,\s*&runtime->imu\)/);
    assert.match(cmake, /lua_imu\.c/);
    assert.match(validator, /"imu\.on"/);
    assert.match(validator, /"imu\.read"/);
  });

  it("registers a Lua camera module backed by the board GC2145 camera", () => {
    const boardHeader = readRequired(boardHeaderPath);
    const boardSource = readRequired(boardSourcePath);
    const runner = readRequired(runnerSourcePath);
    const cameraHeader = readRequired(join(firmwareRoot, "main/lua_camera.h"));
    const cameraSource = readRequired(join(firmwareRoot, "main/lua_camera.c"));
    const validator = readRequired(join(repoRoot, "tools/app-validator/index.mjs"));
    const projectCmake = readRequired(projectCmakePath);
    const cmake = readRequired(cmakePath);
    const installService = readRequired(installServiceSourcePath);
    const cameraPatch = readRequired(esp32CameraPatchPath);
    const manifest = readRequired(join(firmwareRoot, "main/idf_component.yml"));
    const sdkconfigDefaults = readRequired(sdkconfigDefaultsPath);
    const smokeInfo = readRequired(smokeCameraInfoPath);
    const smokeSource = readRequired(smokeCameraSourcePath);

    assert.match(manifest, /espressif\/esp32-camera:\s*"\^2\.1\.4"/);
    assert.match(sdkconfigDefaults, /CONFIG_SCCB_HARDWARE_I2C_DRIVER_LEGACY=y/);
    assert.doesNotMatch(sdkconfigDefaults, /CONFIG_SCCB_HARDWARE_I2C_DRIVER_NEW=y/);
    assert.match(sdkconfigDefaults, /CONFIG_GC2145_SUPPORT=y/);
    assert.match(sdkconfigDefaults, /CONFIG_CAMERA_DMA_BUFFER_SIZE_MAX=8192/);
    assert.doesNotMatch(sdkconfigDefaults, /CONFIG_CAMERA_PSRAM_DMA=y/);
    assert.match(sdkconfigDefaults, /# CONFIG_CAMERA_PSRAM_DMA is not set/);
    assert.match(sdkconfigDefaults, /# CONFIG_CAMERA_CORE0 is not set/);
    assert.match(sdkconfigDefaults, /CONFIG_CAMERA_CORE1=y/);
    assert.match(sdkconfigDefaults, /CONFIG_SPIRAM_ALLOW_STACK_EXTERNAL_MEMORY=y/);
    assert.match(sdkconfigDefaults, /CONFIG_FREERTOS_TASK_CREATE_ALLOW_EXT_MEM=y/);
    assert.match(projectCmake, /patch_esp32_camera_runtime\.cmake/);
    assert.match(cameraPatch, /managed_components\/espressif__esp32-camera\/driver\/cam_hal\.c/);
    assert.match(cameraPatch, /managed_components\/espressif__esp32-camera\/target\/esp32s3\/ll_cam\.c/);
    assert.match(cameraPatch, /queue_size\s*<\s*4/);
    assert.match(cameraPatch, /#include \\"freertos\/idf_additions\.h\\"/);
    assert.match(cameraPatch, /xTaskCreatePinnedToCoreWithCaps\(cam_task/);
    assert.match(cameraPatch, /MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT/);
    assert.match(cameraPatch, /vTaskDeleteWithCaps\(cam_obj->task_handle\)/);
    assert.match(cameraPatch, /Runtime low-memory RGB path/);
    assert.match(cameraPatch, /under 1536 bytes/);
    assert.match(cameraPatch, /runtime_node_max\s*=\s*640 \/ cam->dma_bytes_per_item/);
    assert.match(cameraPatch, /runtime_dma_half_buffer_limit/);
    assert.match(cameraPatch, /dma_half_buffer_max\s*=\s*runtime_dma_half_buffer_limit/);
    assert.match(cmake, /lua_camera\.c/);
    assert.match(cmake, /espressif__esp32-camera/);
    assert.match(boardHeader, /VB_CAMERA_XCLK\s+GPIO_NUM_5/);
    assert.match(boardHeader, /VB_CAMERA_D7\s+GPIO_NUM_9/);
    assert.match(boardHeader, /VB_CAMERA_D6\s+GPIO_NUM_4/);
    assert.match(boardHeader, /VB_CAMERA_D5\s+GPIO_NUM_6/);
    assert.match(boardHeader, /VB_CAMERA_D4\s+GPIO_NUM_15/);
    assert.match(boardHeader, /VB_CAMERA_D3\s+GPIO_NUM_17/);
    assert.match(boardHeader, /VB_CAMERA_D2\s+GPIO_NUM_8/);
    assert.match(boardHeader, /VB_CAMERA_D1\s+GPIO_NUM_18/);
    assert.match(boardHeader, /VB_CAMERA_D0\s+GPIO_NUM_16/);
    assert.match(boardHeader, /VB_CAMERA_VSYNC\s+GPIO_NUM_3/);
    assert.match(boardHeader, /VB_CAMERA_HREF\s+GPIO_NUM_46/);
    assert.match(boardHeader, /VB_CAMERA_PCLK\s+GPIO_NUM_7/);
    assert.match(boardHeader, /VB_CAMERA_XCLK_FREQ_HZ\s+12000000/);
    assert.match(boardHeader, /vb_board_camera_frame_t/);
    assert.match(boardHeader, /vb_board_camera_start/);
    assert.match(boardHeader, /vb_board_camera_preview_start/);
    assert.match(boardHeader, /vb_board_camera_preview_stop/);
    assert.match(boardHeader, /vb_board_camera_preview_mode/);
    assert.match(boardHeader, /vb_board_camera_preview_start_low_memory/);
    assert.match(boardHeader, /vb_board_camera_capture/);
    assert.match(boardHeader, /vb_board_camera_draw/);
    assert.match(boardHeader, /owns_buffer/);
    assert.match(boardHeader, /vb_board_camera_reserve_internal_dma/);
    assert.match(boardHeader, /vb_board_camera_release_internal_dma_reserve/);
    assert.match(boardHeader, /vb_board_camera_return/);
    assert.match(boardHeader, /vb_board_camera_standby/);
    assert.match(boardHeader, /vb_board_camera_stop/);
    assert.match(boardSource, /#include\s+"esp_camera\.h"/);
    assert.match(boardSource, /VB_PCA9557_DVP_PWDN_BIT/);
    assert.match(boardSource, /pca9557_set_output\(VB_PCA9557_DVP_PWDN_BIT,\s*false\)/);
    assert.match(boardSource, /pca9557_set_output\(VB_PCA9557_DVP_PWDN_BIT,\s*true\)/);
    assert.match(boardSource, /\.pin_xclk\s*=\s*VB_CAMERA_XCLK/);
    assert.match(boardSource, /\.pin_d7\s*=\s*VB_CAMERA_D7/);
    assert.match(boardSource, /\.pin_pclk\s*=\s*VB_CAMERA_PCLK/);
    assert.match(boardSource, /\.xclk_freq_hz\s*=\s*VB_CAMERA_XCLK_FREQ_HZ/);
    assert.match(boardSource, /\.pixel_format\s*=\s*PIXFORMAT_RGB565/);
    assert.match(boardSource, /frame_size\s*=\s*FRAMESIZE_QQVGA/);
    assert.match(boardSource, /\.frame_size\s*=\s*frame_size/);
    assert.match(boardSource, /\.fb_count\s*=\s*2/);
    assert.match(boardSource, /GC2145_PID/);
    assert.match(boardSource, /esp_camera_fb_get/);
    assert.match(boardSource, /esp_camera_fb_return/);
    assert.match(boardSource, /esp_camera_deinit/);
    assert.match(boardSource, /s_camera_preview_task/);
    assert.match(boardSource, /s_camera_snapshot_requested/);
    assert.match(boardSource, /s_camera_snapshot_ready/);
    assert.match(boardSource, /s_camera_preview_stop_waiter/);
    assert.match(boardSource, /s_camera_latest_frame_lock/);
    assert.match(boardSource, /s_camera_latest_frame_buf/);
    assert.match(boardSource, /s_camera_latest_frame_valid/);
    assert.match(boardSource, /s_camera_dma_reserve/);
    assert.match(boardSource, /heap_caps_malloc\(size,\s*MALLOC_CAP_DMA\s*\|\s*MALLOC_CAP_INTERNAL\)/);
    assert.match(boardSource, /vb_board_camera_release_internal_dma_reserve\(\);/);
    assert.match(boardSource, /vb_board_camera_clone_latest_frame/);
    assert.match(boardSource, /vb_board_camera_store_latest_frame/);
    assert.match(boardSource, /vb_board_camera_clear_latest_frame/);
    assert.match(boardSource, /vb_board_camera_clone_latest_frame\(frame\)/);
    assert.match(boardSource, /vb_board_camera_store_latest_frame\(fb\)/);
    assert.match(boardSource, /for\s*\(int\s+i\s*=\s*0;\s*i\s*<\s*500\s*&&\s*s_camera_snapshot_requested;\s*i\+\+\)/);
    assert.match(boardSource, /heap_caps_malloc\(len,\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.match(boardSource, /heap_caps_malloc\(fb->len,\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.match(boardSource, /\.owns_buffer\s*=\s*true/);
    assert.match(boardSource, /vb_board_camera_preview_task/);
    assert.match(boardSource, /VB_CAMERA_PREVIEW_MODE_QVGA_DIRECT/);
    assert.match(boardSource, /VB_CAMERA_PREVIEW_MODE_QQVGA_SCALED/);
    assert.match(boardSource, /xTaskCreatePinnedToCoreWithCaps/);
    assert.match(boardSource, /MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT/);
    assert.match(boardSource, /vb_board_camera_preview_start/);
    assert.match(boardSource, /vb_board_camera_preview_start_low_memory/);
    assert.match(boardSource, /vb_board_camera_preview_stop/);
    assert.match(boardSource, /ulTaskNotifyTake\(pdTRUE,\s*pdMS_TO_TICKS\(1000\)\)/);
    assert.match(boardSource, /xTaskNotifyGive\(stop_waiter\)/);
    assert.match(boardSource, /if\s*\(s_camera_preview_stop_requested\)\s*\{\s*esp_camera_fb_return\(fb\);\s*break;/);
    assert.match(boardSource, /vb_board_camera_preview_start_mode\(VB_CAMERA_PREVIEW_MODE_QVGA_DIRECT\)/);
    assert.match(boardSource, /vb_board_camera_preview_start_mode\(VB_CAMERA_PREVIEW_MODE_QQVGA_SCALED\)/);
    assert.match(boardSource, /qvga-direct/);
    assert.match(boardSource, /qqvga-scaled/);
    assert.match(boardSource, /width\s*=\s*VB_LCD_H_RES\s*\/\s*2/);
    assert.match(boardSource, /height\s*=\s*VB_LCD_V_RES\s*\/\s*2/);
    assert.match(boardSource, /width\s*=\s*VB_LCD_H_RES/);
    assert.match(boardSource, /height\s*=\s*VB_LCD_V_RES/);
    assert.match(boardSource, /vb_board_camera_start\(width,\s*height,\s*"rgb565"\)/);
    assert.match(boardSource, /vb_board_camera_preview_probe_frame/);
    assert.match(boardSource, /preview probe failed/);
    assert.match(boardSource, /s_camera_display_taken/);
    assert.match(boardSource, /vb_board_display_takeover\(\)/);
    assert.match(boardSource, /vb_board_display_release_takeover\(\)/);
    assert.match(boardSource, /vb_board_lcd_wait_for_queued_color/);
    assert.match(boardSource, /s_camera_direct_draw_disabled/);
    assert.match(boardSource, /s_camera_overlay_enabled/);
    assert.match(boardSource, /s_camera_overlay_dirty/);
    assert.match(boardSource, /vb_board_camera_overlay_set/);
    assert.match(boardSource, /vb_board_camera_draw_overlay/);
    assert.match(boardSource, /if\s*\(!s_camera_overlay_dirty\)\s*\{\s*return\s+ESP_OK;\s*\}/);
    assert.match(boardSource, /VB_CAMERA_OVERLAY_THUMB_W/);
    assert.match(boardSource, /vb_board_camera_draw_latest_thumb/);
    assert.match(boardSource, /vb_board_camera_draw_overlay_rect\(x,\s*y,\s*VB_CAMERA_OVERLAY_THUMB_W,\s*VB_CAMERA_OVERLAY_THUMB_H/);
    assert.doesNotMatch(boardSource, /for\s*\(uint16_t\s+thumb_x/);
    assert.doesNotMatch(boardSource, /const\s+uint16_t\s+thumb_y/);
    assert.doesNotMatch(boardSource, /thumb_x\s*\+\s*thumb_y\)\s*%\s*9/);
    assert.doesNotMatch(boardSource, /thumb_x\s*>=\s*VB_CAMERA_OVERLAY_THUMB_W\s*-\s*10/);
    assert.doesNotMatch(boardSource, /const\s+uint16_t\s+accent\s*=\s*s_camera_latest_frame_valid/);
    assert.match(boardSource, /vb_board_camera_draw_status_chip/);
    assert.match(boardSource, /vb_board_camera_draw_overlay_rect\(x,\s*y,\s*VB_CAMERA_OVERLAY_STATUS_W,\s*VB_CAMERA_OVERLAY_STATUS_H/);
    assert.doesNotMatch(boardSource, /for\s*\(uint16_t\s+chip_x/);
    assert.doesNotMatch(boardSource, /const\s+uint16_t\s+chip_y/);
    assert.doesNotMatch(boardSource, /const\s+uint16_t\s+dot\s*=/);
    assert.match(boardSource, /vb_board_camera_draw_shutter_button/);
    assert.match(boardSource, /VB_CAMERA_OVERLAY_SHUTTER_HIT_X/);
    assert.match(boardSource, /VB_CAMERA_OVERLAY_SHUTTER_HIT_Y/);
    assert.match(boardSource, /vb_board_camera_draw_overlay\(\)/);
    assert.match(boardSource, /if\s*\(!s_camera_overlay_enabled\s*&&\s*!s_camera_direct_draw_disabled\s*&&\s*frame->width\s*==\s*VB_LCD_H_RES/);
    assert.match(boardSource, /VB_LCD_V_RES\s*-\s*VB_CAMERA_OVERLAY_BAR_H/);
    assert.match(boardSource, /draw_height/);
    assert.match(boardSource, /draw_src_height/);
    assert.match(boardSource, /s_camera_direct_draw_disabled\s*=\s*true/);
    assert.match(boardSource, /vb_board_camera_draw_rgb565_scaled_2x/);
    assert.match(boardSource, /vb_board_camera_draw_rgb565_striped/);
    assert.match(boardSource, /s_camera_lcd_rows/);
    assert.match(boardSource, /DMA_ATTR\s+uint16_t\s+s_camera_lcd_rows/);
    assert.match(boardSource, /frame->width\s*==\s*VB_LCD_H_RES\s*\/\s*2/);
    assert.match(boardSource, /frame->height\s*==\s*VB_LCD_V_RES\s*\/\s*2/);
    assert.doesNotMatch(boardSource, /#define\s+VB_CAMERA_LCD_STRIPE_ROWS/);
    assert.match(boardSource, /VB_CAMERA_LCD_STRIPE_ROWS/);
    assert.match(boardSource, /src_rows_per_batch\s*=\s*VB_CAMERA_LCD_STRIPE_ROWS\s*\/\s*2/);
    assert.match(boardSource, /if\s*\(src_y\s*>\s*0\)/);
    assert.match(boardSource, /vb_board_draw_rgb565\(0,\s*src_y\s*\*\s*2,\s*VB_LCD_H_RES,\s*batch_src_rows\s*\*\s*2/);
    assert.match(boardSource, /vb_board_draw_rgb565\(0,\s*y,\s*VB_LCD_H_RES,\s*stripe_height/);
    assert.match(cameraHeader, /vb_lua_camera_state_t/);
    assert.match(cameraHeader, /vb_lua_camera_init/);
    assert.match(cameraHeader, /vb_lua_camera_register/);
    assert.match(cameraHeader, /vb_lua_camera_cleanup/);
    assert.match(cameraSource, /"start",\s*camera_start/);
    assert.match(cameraSource, /"capture",\s*camera_capture/);
    assert.match(cameraSource, /"clone",\s*camera_clone/);
    assert.match(cameraSource, /"overlay",\s*camera_overlay/);
    assert.match(cameraSource, /"preview_start_low",\s*camera_preview_start_low/);
    assert.match(cameraSource, /static\s+bool\s+has_frame/);
    assert.match(cameraSource, /if\s*\(!has_frame\(&state->held_frame\)\)/);
    assert.doesNotMatch(cameraSource, /held_frame\.driver_frame\s*==\s*NULL\s*\|\|/);
    assert.match(cameraSource, /owned_frame_buf/);
    assert.match(cameraSource, /heap_caps_malloc\(state->held_frame\.len,\s*MALLOC_CAP_SPIRAM\s*\|\s*MALLOC_CAP_8BIT\)/);
    assert.match(cameraSource, /"preview_start",\s*camera_preview_start/);
    assert.match(cameraSource, /"preview_stop",\s*camera_preview_stop/);
    assert.match(cameraSource, /"save",\s*camera_save/);
    assert.match(cameraSource, /"release",\s*camera_release/);
    assert.match(cameraSource, /"stop",\s*camera_stop/);
    assert.match(cameraSource, /"status",\s*camera_status/);
    assert.match(cameraSource, /VB_LUA_FILE_APP_DIR_REGISTRY_KEY\s+"vb_file_app_dir"/);
    assert.match(cameraSource, /fwrite\(frame->buf/);
    assert.match(cameraSource, /camera_save_bmp_rgb565/);
    assert.match(cameraSource, /path_has_suffix_ci\(path,\s*"\.bmp"\)/);
    assert.match(cameraSource, /'B'/);
    assert.match(cameraSource, /'M'/);
    assert.match(cameraSource, /bmp_row_stride/);
    assert.match(cameraSource, /bits per pixel/i);
    assert.match(cameraSource, /vb_board_camera_draw/);
    assert.match(cameraSource, /preview_mode/);
    assert.match(cameraSource, /preview_width/);
    assert.match(cameraSource, /preview_height/);
    assert.match(runner, /#include "lua_camera\.h"/);
    assert.match(runner, /vb_lua_camera_state_t\s+camera/);
    assert.match(runner, /app_has_capability\([^)]+"camera"/);
    assert.match(runner, /prewarm_camera_if_needed/);
    assert.match(functionBody(runner, "preload_lua_file"), /attempt\s*<\s*3/);
    assert.match(functionBody(runner, "preload_lua_file"), /vTaskDelay\(pdMS_TO_TICKS\(20\)\)/);
    assert.match(runner, /if\s*\(strcmp\(entry->id,\s*"camera"\)\s*==\s*0\)\s*\{\s*return false;/);
    assert.doesNotMatch(functionBody(runner, "prewarm_camera_if_needed"), /vb_board_camera_reserve_internal_dma/);
    assert.match(functionBody(boardSource, "vb_board_camera_start"), /vb_board_camera_reserve_internal_dma\(1536\)/);
    assert.match(functionBody(boardSource, "vb_board_camera_start"), /vb_board_camera_release_internal_dma_reserve\(\);\s*err = esp_camera_init\(&config\)/);
    assert.match(boardSource, /void\s+vb_board_camera_standby\(void\)/);
    assert.doesNotMatch(functionBody(boardSource, "vb_board_camera_standby"), /esp_camera_deinit/);
    assert.match(functionBody(boardSource, "vb_board_camera_stop"), /vb_board_camera_standby\(\)/);
    assert.match(functionBody(boardSource, "vb_board_camera_stop"), /esp_camera_deinit\(\)/);
    assert.doesNotMatch(runner, /starting low-memory camera preview before Lua task/);
    assert.match(runner, /starting camera preview before Lua task/);
    assert.match(runner, /vb_board_camera_preview_start\(\)/);
    assert.match(runner, /vb_webui_request_t/);
    assert.match(runner, /s_webui_queue/);
    assert.match(runner, /vb_lua_tmr_set_poll_callback\(&runtime\.tmr,\s*vb_lua_runner_poll,\s*&runtime\)/);
    assert.match(runner, /xQueueSend\(s_webui_queue/);
    assert.match(runner, /xQueueReceive\(s_webui_queue/);
    assert.doesNotMatch(functionBody(runner, "vb_app_runner_dispatch_webui"), /vb_lua_app_dispatch_webui/);
    assert.match(runner, /vb_lua_camera_init\(&runtime\.camera\)/);
    assert.match(runner, /vb_lua_camera_register\(L,\s*&runtime\.camera\)/);
    assert.match(functionBody(cameraSource, "vb_lua_camera_cleanup"), /vb_board_camera_stop\(\)/);
    assert.match(installService, /vb_board_camera_standby\(\)/);
    assert.match(runner, /vb_lua_camera_cleanup\(L,\s*&runtime->camera\)/);
    assert.match(validator, /"camera\.start"/);
    assert.match(validator, /"camera\.preview_start"/);
    assert.match(validator, /"camera\.preview_stop"/);
    assert.match(validator, /"camera\.capture"/);
    assert.match(validator, /"camera\.draw"/);
    assert.match(validator, /"camera\.save"/);
    assert.match(validator, /capability:\s*"camera"/);
    assert.match(smokeInfo, /name\s*=\s*smoke_camera/);
    assert.match(smokeInfo, /capabilities\s*=\s*lvgl,timer,file,camera/);
    assert.match(smokeSource, /camera\.start/);
    assert.match(smokeSource, /width\s*=\s*320/);
    assert.match(smokeSource, /height\s*=\s*240/);
    assert.match(smokeSource, /camera\.preview_start/);
    assert.match(smokeSource, /camera\.preview_stop/);
    assert.match(smokeSource, /camera\.capture/);
    assert.match(smokeSource, /camera\.save\(frame,\s*"frame\.rgb565"\)/);
    assert.match(smokeSource, /local function capture_once/);
    assert.match(smokeSource, /camera\.release/);
    assert.match(smokeSource, /camera\.stop/);
    assert.match(boardSource, /GC2145 camera ready/);
    assert.match(functionBody(boardSource, "vb_board_camera_start"), /esp_camera_set_psram_mode\(false\)/);
    assert.match(smokeSource, /camera_ready/);
    assert.match(smokeSource, /captures/);
    assert.match(smokeSource, /frame_bytes/);
    assert.match(smokeSource, /saved_frame/);
    assert.match(smokeSource, /save_error/);
    assert.match(smokeSource, /preview/);
    assert.match(smokeSource, /preview_mode/);
    assert.match(smokeSource, /preview_width/);
    assert.match(smokeSource, /preview_height/);
    assert.match(smokeSource, /preview_active/);
    assert.match(smokeSource, /if preview_active then\s+return\s+end/);
    assert.match(smokeSource, /capture_error/);
    assert.match(smokeSource, /preview_error/);
  });

  it("ships Camera as a real Runtime capture app", () => {
    const info = readRequired(cameraAppInfoPath);
    const source = readRequired(cameraAppSourcePath);

    assert.match(info, /name\s*=\s*camera/);
    assert.match(info, /entry\s*=\s*main\.lua/);
    assert.match(info, /allow_webui\s*=\s*true/);
    assert.match(info, /capabilities\s*=\s*lvgl,timer,input,file,camera,webui/);
    assert.match(source, /APP\.PHOTO_DIR\s*=\s*"\/sd\/data\/camera\/photos"/);
    assert.match(source, /file\.mkdir\("\/sd\/data"\)/);
    assert.match(source, /file\.mkdir\("\/sd\/data\/camera"\)/);
    assert.match(source, /file\.mkdir\(APP\.PHOTO_DIR\)/);
    assert.match(source, /local function clear_lvgl_for_camera_preview\(\)/);
    assert.match(luaFunctionBody(source, "clear_lvgl_for_camera_preview"), /lv_obj_clean\(root\)/);
    assert.match(source, /local function try_start_preview\(\)/);
    assert.match(luaFunctionBody(source, "try_start_preview"), /camera and \(camera\.preview_start_low or camera\.preview_start\)/);
    assert.match(luaFunctionBody(source, "start_preview"), /try_start_preview\(\)/);
    assert.doesNotMatch(luaFunctionBody(source, "start_preview"), /camera\.stop\(\)/);
    assert.match(luaFunctionBody(source, "start_preview"), /clear_lvgl_for_camera_preview\(\)/);
    assert.match(source, /camera\.preview_start_low/);
    assert.match(source, /camera\.preview_start/);
    assert.match(source, /camera\.overlay\(true\)/);
    assert.match(source, /camera\.stop\(\)/);
    assert.match(source, /camera\.capture\(\)/);
    assert.match(source, /camera\.clone\(frame\)/);
    assert.match(luaFunctionBody(source, "capture_photo"), /camera\.stop\(\)/);
    assert.match(source, /local function set_overlay\(enabled\)/);
    assert.match(luaFunctionBody(source, "capture_photo"), /set_overlay\(false\)/);
    assert.match(source, /camera\.save\(cloned,\s*path\)/);
    assert.match(source, /camera\.release_clone\(cloned\)/);
    assert.match(source, /\.bmp/);
    assert.match(source, /camera\.release\(frame\)/);
    assert.match(source, /camera\.stop\(\)/);
    assert.match(source, /pending_capture/);
    const luaCamera = readRequired(join(firmwareRoot, "main/lua_camera.c"));
    assert.match(luaCamera, /#include "lvgl\.h"/);
    assert.match(luaCamera, /lv_color_t color = \{ \.full = pixel \}/);
    assert.match(luaCamera, /LV_COLOR_GET_R\(color\)/);
    assert.match(luaCamera, /LV_COLOR_GET_G\(color\)/);
    assert.match(luaCamera, /LV_COLOR_GET_B\(color\)/);
    assert.match(source, /local function request_capture\(trigger\)/);
    assert.match(luaFunctionBody(source, "route_capture"), /request_capture\("web"\)/);
    assert.doesNotMatch(luaFunctionBody(source, "route_capture"), /capture_photo\("web"\)/);
    assert.match(luaFunctionBody(source, "route_capture"), /status\s*=\s*queued and 202 or 409/);
    assert.match(luaFunctionBody(source, "route_capture"), /\\"queued\\":/);
    assert.match(source, /local function parse_query\(query\)/);
    assert.match(source, /local function is_photo_name\(name\)/);
    assert.match(source, /name:match\("\^capture_%d\+%\.bmp\$"\)/);
    assert.match(source, /photos\s*=\s*\{\}/);
    assert.match(source, /if APP\.preview then\s+return APP\.photos\s+end/);
    assert.match(source, /local function remember_photo\(name,\s*size\)/);
    assert.match(source, /local function forget_photo\(name\)/);
    assert.match(source, /remember_photo\(filename,\s*APP\.last_bytes\)/);
    assert.match(source, /forget_photo\(name\)/);
    assert.match(source, /local function delete_photo_by_name\(name\)/);
    assert.match(luaFunctionBody(source, "delete_photo_by_name"), /local was_preview = APP\.preview/);
    assert.match(luaFunctionBody(source, "delete_photo_by_name"), /camera\.stop\(\)/);
    assert.match(luaFunctionBody(source, "delete_photo_by_name"), /file\.remove\(APP\.PHOTO_DIR \.\. "\/" \.\. name\)/);
    assert.match(luaFunctionBody(source, "delete_photo_by_name"), /forget_photo\(name\)/);
    assert.match(luaFunctionBody(source, "delete_photo_by_name"), /APP\.gallery_index\s*=\s*wrap_gallery_index\(APP\.gallery_index\)/);
    assert.match(luaFunctionBody(source, "delete_photo_by_name"), /if was_preview then\s+start_preview\(\)\s+end/);
    assert.match(source, /pending_delete/);
    assert.match(source, /local function request_delete\(name\)/);
    assert.match(source, /local function standby_for_runtime_stop\(\)/);
    assert.match(luaFunctionBody(source, "stop_camera"), /set_overlay\(false\)/);
    assert.match(luaFunctionBody(source, "stop_camera"), /camera\.stop\(\)/);
    assert.match(luaFunctionBody(source, "standby_for_runtime_stop"), /stop_camera\(\)/);
    assert.match(source, /local function handle_runtime_stop\(\)/);
    assert.match(luaFunctionBody(source, "handle_runtime_stop"), /standby_for_runtime_stop\(\)/);
    assert.doesNotMatch(luaFunctionBody(source, "handle_runtime_stop"), /app\.exit/);
    assert.match(source, /if app and app\.exiting and app\.exiting\(\) then[\s\S]*handle_runtime_stop\(\)[\s\S]*return/);
    assert.match(source, /MAX_WEB_PHOTOS\s*=\s*1/);
    assert.match(source, /local function photos_json\(photos,\s*limit\)/);
    assert.match(luaFunctionBody(source, "photos_json"), /if index > max_items then/);
    assert.match(luaFunctionBody(source, "photos_json"), /delete_url/);
    assert.match(luaFunctionBody(source, "photos_json"), /json_escape\(delete_url\(photo\.name\)\)/);
    assert.match(source, /local function route_photos\(_req\)/);
    assert.match(luaFunctionBody(source, "route_photos"), /shown = math\.min\(#photos,\s*APP\.MAX_WEB_PHOTOS\)/);
    assert.match(luaFunctionBody(source, "route_photos"), /photos_json\(photos,\s*shown\)/);
    assert.match(source, /local function route_delete\(req\)/);
    assert.match(luaFunctionBody(source, "route_delete"), /request_delete\(name\)/);
    assert.doesNotMatch(luaFunctionBody(source, "route_delete"), /delete_photo_by_name\(name\)/);
    assert.match(luaFunctionBody(source, "route_delete"), /status\s*=\s*queued and 202 or 409/);
    assert.match(source, /APP\.pending_delete ~= ""/);
    assert.match(source, /delete_photo_by_name\(name\)/);
    assert.match(source, /key\.on\(function\(evt_code,\s*evt_type/);
    assert.match(source, /evt_code\s*~=\s*key\.HOME/);
    assert.match(source, /request_capture\("home"\)/);
    assert.match(source, /touch\.on/);
    assert.match(source, /local function touch_hits_shutter\(x,\s*y\)/);
    assert.match(source, /local function touch_hits_gallery_thumb\(x,\s*y\)/);
    assert.match(source, /SHUTTER_HIT_X/);
    assert.match(source, /SHUTTER_HIT_Y/);
    assert.match(source, /SHUTTER_HIT_W/);
    assert.match(source, /SHUTTER_HIT_H/);
    assert.match(source, /GALLERY_THUMB_HIT_X/);
    assert.match(source, /GALLERY_THUMB_HIT_Y/);
    assert.match(source, /GALLERY_DELETE_HIT_X/);
    assert.match(source, /local function touch_hits_gallery_delete\(x,\s*y\)/);
    assert.match(source, /CAMERA_PHOTO_W\s*=\s*160/);
    assert.match(source, /CAMERA_PHOTO_H\s*=\s*120/);
    assert.match(source, /local function show_gallery\(\)/);
    assert.match(luaFunctionBody(source, "show_gallery"), /stop_camera\(\)/);
    assert.match(luaFunctionBody(source, "show_gallery"), /lv_img_create\(root\)/);
    assert.match(source, /local function center_gallery_image\(\)/);
    assert.match(luaFunctionBody(source, "center_gallery_image"), /lv_obj_set_pos\(APP\.ui\.gallery_image,\s*x,\s*y\)/);
    assert.match(luaFunctionBody(source, "center_gallery_image"), /lv_obj_set_size\(APP\.ui\.gallery_image,\s*APP\.CAMERA_PHOTO_W,\s*APP\.CAMERA_PHOTO_H\)/);
    assert.match(luaFunctionBody(source, "show_gallery"), /center_gallery_image\(\)/);
    assert.match(luaFunctionBody(source, "draw_gallery_current"), /lv_img_set_src\(APP\.ui\.gallery_image,\s*gallery_photo_src\(name\)\)/);
    assert.match(luaFunctionBody(source, "draw_gallery_current"), /set_label\(APP\.ui\.gallery_delete,\s*"Delete"\)/);
    assert.match(luaFunctionBody(source, "show_gallery"), /draw_gallery_current\(\)/);
    assert.doesNotMatch(luaFunctionBody(source, "show_gallery"), /lv_img_set_zoom\(APP\.ui\.gallery_image,\s*512\)/);
    assert.match(source, /local function leave_gallery\(\)/);
    assert.match(luaFunctionBody(source, "leave_gallery"), /start_preview\(\)/);
    assert.match(source, /local function move_gallery\(delta\)/);
    assert.match(source, /if APP\.mode == "gallery" then/);
    assert.match(source, /move_gallery\(-1\)/);
    assert.match(source, /move_gallery\(1\)/);
    assert.match(source, /leave_gallery\(\)/);
    assert.match(source, /delete_current_gallery_photo\(\)/);
    assert.match(source, /show_gallery\(\)/);
    assert.match(source, /if evt == touch\.UP and touch_hits_shutter\(x,\s*y\) then/);
    assert.match(source, /request_capture\("touch"\)/);
    assert.match(source, /app\.set_home_exit\(false\)/);
    assert.match(source, /app\.set_webui\(true\)/);
    assert.match(source, /app\.route\("\/",\s*dispatch_route\)/);
    assert.match(source, /app\.route\("\/api",\s*dispatch_route\)/);
    assert.match(source, /app\.route\("\/photos",\s*dispatch_route\)/);
    assert.match(source, /app\.route\("\/capture",\s*dispatch_route\)/);
    assert.match(source, /app\.route\("\/delete",\s*dispatch_route\)/);
    assert.match(source, /\/sd\/file\?path=data\/camera\/photos\//);
    assert.match(source, /download_url\(photo\.name\)/);
    assert.match(source, /delete_url\(photo\.name\)/);
    assert.match(luaFunctionBody(source, "route_index"), /local actions = "<p>No photos<\/p>"/);
    assert.doesNotMatch(luaFunctionBody(source, "route_index"), /<table>/);
    assert.doesNotMatch(source, /if app and app\.exiting[\s\S]*stop_camera\(\)/);
    assert.match(source, /if APP\.pending_capture ~= "" and not APP\.capturing then/);
    assert.match(source, /capture_photo\(trigger\)/);
    assert.match(source, /metrics\.json/);
    assert.doesNotMatch(source, /LV_ALIGN_BOTTOM_MID/);
  });

  it("keeps enough HTTP handler slots for install, app, and delete routes", () => {
    const installService = readRequired(installServiceSourcePath);

    assert.match(
      installService,
      /config\.max_uri_handlers\s*=\s*(?:2[0-9]|[3-9][0-9]);/,
    );
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
    assert.match(source, /file_listdir/);
    assert.match(source, /file_open/);
    assert.match(source, /file_stat/);
    assert.match(source, /file_mkdir/);
    assert.match(source, /file_remove/);
    assert.match(source, /file_rename/);
    assert.match(source, /file_rmdir/);
    assert.match(source, /file_putcontents/);
    assert.match(source, /file_handle_write/);
    assert.match(source, /file_handle_seek/);
    assert.match(source, /file_handle_flush/);
    assert.match(source, /getcontents/);
    assert.match(source, /listdir/);
    assert.match(source, /VB_SD_MOUNT_POINT/);
    assert.match(source, /VB_APPS_PATH/);
    assert.match(source, /VB_LUA_FILE_DATA_PREFIX/);
    assert.match(source, /file data path escapes app sandbox/);
    assert.match(source, /allow_data_write/);
    assert.match(source, /allow_photos_camera_photo_write/);
    assert.match(source, /strcmp\(app_id,\s*"photos"\)\s*!=\s*0/);
    assert.match(source, /camera\/photos\//);
    assert.match(source, /is_camera_photo_name/);
    assert.match(source, /strcmp\(cursor,\s*"\.bmp"\)\s*==\s*0/);
    assert.match(source, /strcmp\(path,\s*"\/sd\/data"\)\s*==\s*0/);
    assert.match(source, /relative\[app_id_len\]\s*==\s*'\\0'\s*\|\|\s*relative\[app_id_len\]\s*==\s*'\/'/);
    assert.match(source, /strncmp\(path,\s*VB_LUA_FILE_DATA_PREFIX/);
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
    assert.match(httpSource, /http_cubicserver_get/);
    assert.match(httpSource, /get_timeout\(L,\s*options_index\)/);
    assert.doesNotMatch(httpSource, /perform_get_url\(full_url,\s*VB_HTTP_DEFAULT_TIMEOUT_MS/);
    assert.match(httpSource, /luaL_error\(L,\s*"cubicserver base_url missing"/);
    assert.doesNotMatch(httpSource, /snprintf\(base_url,\s*sizeof\(base_url\),\s*"%s",\s*VB_HTTP_CUBICSERVER_BASE_URL\)/);
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

  it("keeps Lua HTTP callback dispatch protected while request execution is still synchronous", () => {
    const httpSource = readRequired(luaHttpSourcePath);

    assert.match(httpSource, /static void call_callback/);
    assert.match(httpSource, /lua_pcall\(L,\s*2,\s*0,\s*0\)/);
    assert.match(httpSource, /ESP_LOGW\(TAG,\s*"http callback failed:/);

    const callbackBody = httpSource.match(/static void call_callback\([\s\S]*?\n\}/);
    assert.ok(callbackBody, "call_callback body is present");
    assert.doesNotMatch(callbackBody[0], /lua_call\(L,\s*2,\s*0\)/);

    assert.match(httpSource, /esp_http_client_perform\(client\)/);
    assert.doesNotMatch(httpSource, /xTaskCreate/);
  });

  it("registers a sys Lua module for runtime version and display brightness", () => {
    const runner = readRequired(runnerSourcePath);
    const cmake = readRequired(cmakePath);
    const sysHeader = readRequired(luaSysHeaderPath);
    const sysSource = readRequired(luaSysSourcePath);
    const versionHeader = readRequired(runtimeVersionHeaderPath);
    const service = readRequired(installServiceSourcePath);
    const boardHeader = readRequired(boardHeaderPath);
    const boardSource = readRequired(boardSourcePath);

    assert.match(cmake, /lua_sys\.c/);
    assert.match(runner, /lua_sys\.h/);
    assert.match(runner, /vb_lua_sys_register\(L\)/);
    assert.match(runner, /vb_lua_sys_register\(L\)[\s\S]*vb_lua_time_register\(L\)/);
    assert.match(sysHeader, /vb_lua_sys_register/);
    assert.match(sysSource, /#include "board_lckfb_szpi_s3\.h"/);
    assert.match(sysSource, /#include "runtime_version\.h"/);
    assert.match(sysSource, /sys_version/);
    assert.match(sysSource, /sys_getbrightness/);
    assert.match(sysSource, /sys_setbrightness/);
    assert.match(sysSource, /VB_RUNTIME_VERSION/);
    assert.match(sysSource, /vb_board_get_backlight_percent/);
    assert.match(sysSource, /vb_board_set_backlight_percent/);
    assert.match(sysSource, /lua_setglobal\(L,\s*"sys"\)/);
    assert.match(versionHeader, /VB_RUNTIME_VERSION\s+"0\.1\.0"/);
    assert.match(service, /#include "runtime_version\.h"/);
    assert.doesNotMatch(service, /#define VB_RUNTIME_VERSION "0\.1\.0"/);
    assert.match(boardHeader, /vb_board_set_backlight_percent/);
    assert.match(boardHeader, /vb_board_get_backlight_percent/);
    assert.match(boardSource, /s_backlight_percent/);
    assert.match(boardSource, /level < 0 \|\| level > 100/);
    assert.match(boardSource, /ledc_set_duty\(LEDC_LOW_SPEED_MODE,\s*LEDC_CHANNEL_0,\s*duty\)/);
  });

  it("keeps weather cubicserver requests below the app stop timeout", () => {
    const weatherSource = readRequired(weatherSourcePath);
    const runnerHeader = readRequired(runnerHeaderPath);

    const stopTimeoutMatch = runnerHeader.match(/VB_APP_RUNNER_STOP_TIMEOUT_MS\s+(\d+)/);
    assert.ok(stopTimeoutMatch, "runner stop timeout constant is declared");
    const stopTimeoutMs = Number(stopTimeoutMatch[1]);

    const weatherTimeoutMatch = weatherSource.match(/WEATHER_HTTP_TIMEOUT_MS\s*=\s*(\d+)/);
    assert.ok(weatherTimeoutMatch, "weather declares an explicit HTTP timeout");
    const weatherTimeoutMs = Number(weatherTimeoutMatch[1]);

    assert.ok(weatherTimeoutMs > 0, "weather HTTP timeout is positive");
    assert.ok(
      weatherTimeoutMs < stopTimeoutMs,
      `weather HTTP timeout ${weatherTimeoutMs}ms must stay below app stop timeout ${stopTimeoutMs}ms`,
    );
    assert.match(weatherSource, /CUBICSERVER_CONFIG_PATH\s*=\s*"\/sd\/runtime\/cubicserver\.json"/);
    assert.match(weatherSource, /file\.exists\(APP\.CUBICSERVER_CONFIG_PATH\)/);
    assert.match(weatherSource, /APP\.state\.last_error\s*=\s*"Cubic config missing"/);
    assert.match(weatherSource, /http\.cubicserver\.get\(url,\s*\{\s*timeout_ms\s*=\s*APP\.WEATHER_HTTP_TIMEOUT_MS\s*\}/);
  });

  it("defaults weather to Shanghai and writes fetch results to metrics", () => {
    const weatherSource = readRequired(weatherSourcePath);

    assert.match(weatherSource, /WEATHER_LOCATION\s*=\s*"101020100"/);
    assert.match(weatherSource, /CITY_NAME\s*=\s*"Shanghai"/);
    assert.match(weatherSource, /\\"temp\\":/);
    assert.match(weatherSource, /\\"text\\":/);
    assert.match(weatherSource, /\\"humidity\\":/);
    assert.match(weatherSource, /\\"wind_speed\\":/);
    assert.match(weatherSource, /\\"last_http_code\\":/);
    assert.match(weatherSource, /\\"last_update_ms\\":/);
    assert.match(weatherSource, /parse_weather_body\(status_code,\s*plain\)\s+render_weather\(\)\s+write_metrics\(\)/);
    assert.match(weatherSource, /APP\.state\.last_error\s*=\s*"Cubic config missing"[\s\S]*write_metrics\(\)/);
    assert.match(weatherSource, /APP\.state\.last_error\s*=\s*"Cubic HTTP missing"[\s\S]*write_metrics\(\)/);
  });

  it("renders weather Celsius without relying on a missing single-glyph unit", () => {
    const weatherSource = readRequired(weatherSourcePath);

    assert.match(weatherSource, /local CELSIUS_FORECAST = "C"/);
    assert.match(weatherSource, /local function create_degree_mark\(parent,\s*x,\s*y,\s*color\)/);
    assert.match(weatherSource, /lv_obj_set_style_bg_opa,\s*id,\s*0,\s*MAIN_STYLE/);
    assert.match(weatherSource, /lv_obj_set_style_border_width,\s*id,\s*2,\s*MAIN_STYLE/);
    assert.match(weatherSource, /local TEMP_VALUE_X = 212/);
    assert.match(weatherSource, /local TEMP_UNIT_X = 238/);
    assert.match(weatherSource, /call\(lv_obj_set_pos,\s*APP\.ui\.temp_value_label,\s*TEMP_VALUE_X,\s*100\)/);
    assert.match(weatherSource, /APP\.ui\.temp_value_label = create_label\(now_page,\s*"--",\s*FONT_34,\s*C\.text,\s*TEMP_VALUE_X,\s*100,\s*0,\s*ALIGN_LEFT\)/);
    assert.match(weatherSource, /APP\.ui\.temp_degree_mark = create_degree_mark\(now_page,\s*TEMP_UNIT_X,\s*103,\s*C\.text\)/);
    assert.match(weatherSource, /APP\.ui\.temp_unit_label = create_label\(now_page,\s*"C",\s*FONT_16,\s*C\.text,\s*TEMP_UNIT_X \+ 10,\s*100,\s*24,\s*ALIGN_LEFT\)/);
    assert.match(weatherSource, /local function set_temp_value\(value\)/);
    assert.match(weatherSource, /set_temp_value\(format_temp_value_text\(APP\.state\.temp\)\)/);
    assert.match(weatherSource, /set_label_text\(APP\.ui\.temp_unit_label,\s*"C"\)/);
    assert.doesNotMatch(weatherSource, /local function temp_value_x\(text\)/);
    assert.doesNotMatch(weatherSource, /create_label\(now_page,\s*"--",\s*FONT_34,\s*C\.text,\s*172,\s*100,\s*104,\s*ALIGN_RIGHT\)/);
    assert.doesNotMatch(weatherSource, /APP\.ui\.temp_label = create_label/);
    assert.doesNotMatch(weatherSource, /local CELSIUS = "\\226\\132\\131"/);
    assert.match(weatherSource, /return "--"/);
    assert.match(weatherSource, /return tostring\(n\)/);
    assert.match(weatherSource, /return rounded_int_text\(max_temp\) \.\. "\/" \.\. rounded_int_text\(min_temp\) \.\. CELSIUS_FORECAST/);
  });

  it("keeps stale real weather visible across transient fetch failures", () => {
    const weatherSource = readRequired(weatherSourcePath);

    assert.match(weatherSource, /local function has_cached_weather\(\)/);
    assert.match(weatherSource, /APP\.state\.last_update_ms or 0\) > 0/);
    assert.match(weatherSource, /if not has_cached_weather\(\) then\s+APP\.state\.valid = false\s+end/);
    assert.match(weatherSource, /APP\.state\.last_error = tostring\(err\)/);
    assert.match(weatherSource, /render_weather\(\)\s+write_metrics\(\)\s+return/);
  });

  it("defers weather network startup until the app can observe stop requests", () => {
    const weatherSource = readRequired(weatherSourcePath);

    assert.match(weatherSource, /APP\.timers\.initial_fetch\s*=\s*tmr\.create\(\)/);
    assert.match(weatherSource, /APP\.timers\.initial_fetch:alarm\(APP\.INITIAL_FETCH_DELAY_MS,\s*tmr\.ALARM_SINGLE/);
    assert.match(weatherSource, /if not APP\.running or maybe_stop_for_exit\(\) then return end\s+request_weather\(\)/);

    const initialDelayMatch = weatherSource.match(/INITIAL_FETCH_DELAY_MS\s*=\s*(\d+)/);
    assert.ok(initialDelayMatch, "weather declares an initial fetch delay");
    assert.ok(Number(initialDelayMatch[1]) >= 1000, "weather leaves a stop window before the first network request");

    assert.match(weatherSource, /UI_BOOT_DELAY_MS\s*=\s*\d+/);
    assert.match(weatherSource, /local function init_startup_shell\(\)/);
    assert.match(weatherSource, /local function stage_full_ui\(\)/);
    assert.match(weatherSource, /local function stage_fonts\(\)/);
    assert.match(weatherSource, /local function stage_assets\(\)/);
    assert.match(weatherSource, /local function stage_boot_step\(\)/);
    assert.match(weatherSource, /APP\.state\.boot_stage\s*=\s*\(APP\.state\.boot_stage or 0\)\s*\+\s*1/);
    assert.match(weatherSource, /APP\.timers\.stage_boot\s*=\s*tmr\.create\(\)/);
    assert.match(weatherSource, /APP\.timers\.stage_boot:alarm\(APP\.UI_BOOT_DELAY_MS,\s*tmr\.ALARM_AUTO/);
    assert.match(weatherSource, /if not stage_boot_step\(\) then/);
    assert.match(weatherSource, /APP\.timers\.stage_boot:stop\(\)/);
    assert.match(weatherSource, /APP\.timers\.stage_boot:unregister\(\)/);
    assert.match(weatherSource, /APP\.state\.boot_stage == 1[\s\S]*stage_full_ui\(\)/);
    assert.match(weatherSource, /APP\.state\.boot_stage == 2[\s\S]*stage_fonts\(\)/);
    assert.match(weatherSource, /APP\.state\.boot_stage == 3[\s\S]*stage_assets\(\)/);
    assert.match(weatherSource, /assets_ready\s*=\s*false/);
    assert.match(weatherSource, /fonts_ready\s*=\s*false/);
    assert.match(weatherSource, /boot_stage\s*=\s*0/);
    assert.match(weatherSource, /background_pending\s*=\s*false/);
    assert.match(weatherSource, /METRICS_PATH\s*=\s*"metrics\.json"/);
    assert.match(weatherSource, /local function write_metrics\(\)/);
    assert.match(weatherSource, /file\.write\(APP\.METRICS_PATH/);
    assert.match(weatherSource, /\\"ui_ready\\":/);
    assert.match(weatherSource, /\\"fonts_ready\\":/);
    assert.match(weatherSource, /\\"assets_ready\\":/);
    assert.match(weatherSource, /\\"visual_assets_ready\\":/);
    assert.match(weatherSource, /\\"visual_asset_attempts\\":/);
    assert.match(weatherSource, /\\"visual_asset_error\\":/);
    assert.match(weatherSource, /\\"background_ready\\":/);
    assert.match(weatherSource, /\\"background_attempts\\":/);
    assert.match(weatherSource, /\\"background_error\\":/);
    assert.match(weatherSource, /\\"boot_stage\\":/);
    assert.match(weatherSource, /stage_full_ui\(\)[\s\S]*write_metrics\(\)/);
    assert.match(weatherSource, /stage_fonts\(\)[\s\S]*write_metrics\(\)/);
    assert.match(weatherSource, /stage_assets\(\)[\s\S]*write_metrics\(\)/);
    assert.match(weatherSource, /stage_assets\(\)[\s\S]*APP\.state\.last_error\s*=\s*"assets ready"/);
    assert.match(weatherSource, /local function lazy_load_visual_assets\(\)/);
    assert.match(weatherSource, /lazy_load_visual_assets\(\)[\s\S]*APP\.state\.visual_assets_ready\s*=\s*true/);
    assert.match(weatherSource, /local function lazy_load_background\(\)/);
    const backgroundBody = weatherSource.match(/local function lazy_load_background\(\)([\s\S]*?)\n    end\n\n    local function schedule_background_load\(\)/);
    assert.ok(backgroundBody, "weather lazy background body is present");
    assert.match(backgroundBody[1], /APP\.state\.background_error\s*=\s*"loading"/);
    assert.match(backgroundBody[1], /lv_canvas_load_bmp\(APP\.ui\.bg_canvas,\s*background_asset_path\(weather_kind\(\)\)\)/);
    assert.match(backgroundBody[1], /APP\.state\.background_ready\s*=\s*true/);
    assert.doesNotMatch(backgroundBody[1], /lv_obj_set_style_bg_color/);
    assert.match(weatherSource, /local function schedule_background_load\(\)/);
    assert.match(weatherSource, /APP\.state\.background_error\s*=\s*"queued"/);
    assert.match(weatherSource, /APP\.timers\.stage_boot\s*=\s*nil\s+end\s+APP\.state\.background_pending\s*=\s*true/);
    assert.match(weatherSource, /APP\.state\.background_pending\s*=\s*false\s+schedule_background_load\(\)[\s\S]*lazy_load_background\(\)/);
    assert.doesNotMatch(weatherSource, /APP\.timers\.background\s*=/);
    assert.doesNotMatch(weatherSource, /timer:alarm\(APP\.BACKGROUND_LOAD_DELAY_MS/);
    assert.match(weatherSource, /stage_assets\(\)[\s\S]*lazy_load_visual_assets\(\)/);
    const stageAssetsBody = weatherSource.match(/local function stage_assets\(\)([\s\S]*?)\n    end\n\n    local function stage_boot_step\(\)/);
    assert.ok(stageAssetsBody, "weather stage_assets body is present");
    assert.doesNotMatch(stageAssetsBody[1], /init_ui\(\)/);
    assert.doesNotMatch(stageAssetsBody[1], /asset_path\("bg"/);
    assert.doesNotMatch(stageAssetsBody[1], /lazy_load_background\(\)/);
    assert.match(weatherSource, /stop_reason ~= "reload" and not APP\.state\.assets_ready[\s\S]*release_startup_page\(\)/);
    assert.match(weatherSource, /stop_reason ~= "reload" and not APP\.state\.assets_ready[\s\S]*clear_root\(\)/);
    assert.match(weatherSource, /if not APP\.state\.fonts_ready then\s+release_fonts\(\)/);

    const bootSequence = weatherSource.match(/init_time_module\(\)\s+init_startup_shell\(\)[\s\S]*bind_input\(\)\s+start_timers\(\)/);
    assert.ok(bootSequence, "weather boot sequence is present");
    assert.doesNotMatch(bootSequence[0], /init_ui\(\)/);
    assert.doesNotMatch(bootSequence[0], /render_weather\(\)/);
    assert.doesNotMatch(bootSequence[0], /render_forecast\(\)/);
    assert.doesNotMatch(bootSequence[0], /request_weather\(\)/);
    assert.match(bootSequence[0], /bind_input\(\)\s+start_timers\(\)/);
  });

  it("documents the standard workflow for new runtime apps", () => {
    const guide = readRequired(newAppGuidePath);
    const readme = readRequired(join(repoRoot, "README.md"));

    assert.match(readme, /docs\/new-app-development-guide\.md/);
    assert.match(guide, /# New App Development Guide/);
    assert.match(guide, /app\.info/);
    assert.match(guide, /main\.lua/);
    assert.match(guide, /capabilities/);
    assert.match(guide, /lvgl/);
    assert.match(guide, /timer/);
    assert.match(guide, /input/);
    assert.match(guide, /network/);
    assert.match(guide, /file/);
    assert.match(guide, /audio/);
    assert.match(guide, /Image Assets/);
    assert.match(guide, /Fonts/);
    assert.match(guide, /LV_FONT_COMMON_CN_13/);
    assert.match(guide, /Runtime Native Interfaces/);
    assert.match(guide, /i2s\.record_file/);
    assert.match(guide, /i2s\.play_file/);
    assert.match(guide, /\/sdcard\/apps\/<app_id>/);
    assert.match(guide, /dofile\(APP_FILE_DIR \.\. "\/lib\/voice_audio\.lua"\)/);
    assert.match(guide, /voice_audio\.record_bridge_pcm/);
    assert.match(guide, /voice_audio\.post_bridge_chat/);
    assert.match(guide, /desktop-bridge/);
    assert.match(guide, /npm run package:app/);
    assert.match(guide, /npm run upload:app/);
    assert.match(guide, /npm run launch:app/);
    assert.match(guide, /metrics\.json/);
    assert.match(guide, /npm test/);
    assert.match(guide, /idf\.py build/);
  });

  it("keeps Voice AI on the shared audio helper contract", () => {
    const voiceAi = readRequired(voiceAiSourcePath);
    const helper = readRequired(voiceAudioHelperPath);

    assert.match(voiceAi, /APP_FILE_DIR\s*=\s*"\/sdcard\/apps\/voice_ai"/);
    assert.match(voiceAi, /dofile\(APP\.APP_FILE_DIR \.\. "\/lib\/voice_audio\.lua"\)/);
    assert.match(voiceAi, /voice_audio\.record_bridge_pcm/);
    assert.match(voiceAi, /voice_audio\.post_bridge_chat/);
    assert.match(voiceAi, /voice_audio\.max_bridge_pcm_bytes/);
    assert.doesNotMatch(voiceAi, /local function downsample_capture_chunk_to_16k_mono/);
    assert.doesNotMatch(voiceAi, /local function downsample_capture_file_to_16k_mono/);
    assert.doesNotMatch(voiceAi, /local function read_voice_capture_file/);
    assert.doesNotMatch(voiceAi, /local function read_i16_le/);
    assert.doesNotMatch(voiceAi, /local function i16_to_bytes/);

    assert.match(helper, /local M = \{\}/);
    assert.match(helper, /function M\.max_bridge_pcm_bytes/);
    assert.match(helper, /function M\.record_bridge_pcm/);
    assert.match(helper, /function M\.post_bridge_chat/);
    assert.match(helper, /function M\.downsample_capture_file_to_16k_mono/);
    assert.match(helper, /i2s\.record_file/);
    assert.match(helper, /http\.post/);
    assert.match(helper, /\["Content-Type"\]\s*=\s*"application\/octet-stream"/);
    assert.match(helper, /\["X-Audio-Format"\]\s*=\s*"pcm_s16le"/);
    assert.match(helper, /\["X-Sample-Rate"\]/);
    assert.match(helper, /return M/);
  });

  it("tracks migrated app runtime API gaps before hardware runs", () => {
    const http = readRequired(luaHttpSourcePath);
    const sjson = readRequired(luaSjsonSourcePath);
    const canvas = readRequired(luaLvglCanvasSourcePath);
    const widgetSource = readRequired(luaLvglWidgetsSourcePath);
    const weather = readRequired(weatherSourcePath);
    const btc = readRequired(btcSourcePath);
    const voiceAiInfo = readRequired(voiceAiInfoPath);
    const voiceAi = readRequired(voiceAiSourcePath);
    const voiceAiFontSource = readRequired(voiceAiFontSourcePath);
    const voiceAiSmokeTool = readRequired(voiceAiSmokeToolPath);
    const voiceAiSmokeTest = readRequired(voiceAiSmokeTestPath);
    const nesgame = readRequired(nesgameSourcePath);

    assert.match(weather, /http\.cubicserver\.get/);
    assert.match(http, /http_cubicserver_get/);
    assert.match(http, /VB_HTTP_CUBICSERVER_CONFIG_PATH\s+"\/sdcard\/runtime\/cubicserver\.json"/);
    assert.match(http, /load_cubicserver_base_url/);
    assert.match(http, /cJSON_GetObjectItem\(root,\s*"base_url"\)/);
    assert.match(http, /lua_setfield\(L,\s*-2,\s*"cubicserver"\)/);
    assert.match(http, /apply_headers/);
    assert.match(http, /esp_http_client_set_header\(client,\s*key,\s*value\)/);
    assert.match(http, /lua_isfunction\(L,\s*3\)/);
    assert.match(http, /lua_isfunction\(L,\s*4\)/);
    assert.match(http, /call_callback/);
    assert.match(http, /lua_pcall\(L,\s*2,\s*0,\s*0\)/);

    assert.match(weather, /json\.decode/);
    assert.match(btc, /json\.decode/);
    assert.match(btc, /http\.get/);
    assert.match(btc, /metrics\.json/);
    assert.match(btc, /BASE_URL\s*=\s*"https:\/\/data-api\.binance\.vision"/);
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
    assert.match(voiceAi, /USE_GIF\s*=\s*false/);
    assert.match(voiceAi, /reply\s*=\s*"短按开始"/);
    assert.match(voiceAi, /UI\.action_key\s*=\s*label\(root,\s*18,\s*82,\s*90,\s*28,\s*"\[HOME\]"/);
    assert.match(voiceAi, /UI\.action_text\s*=\s*label\(root,\s*10,\s*116,\s*106,\s*22,\s*"短按录音"/);
    assert.doesNotMatch(voiceAi, /UI\.media_panel/);
    assert.doesNotMatch(voiceAi, /UI\.line\s*=\s*lv_obj_create\(root\)/);
    assert.doesNotMatch(voiceAi, /BASE OK|MEDIA OFF/);
    assert.match(voiceAi, /local\s+root\s*=\s*lv_scr_act\(\)/);
    assert.doesNotMatch(voiceAi, /lv_obj_create\(nil\)/);
    assert.match(readRequired(sdkconfigDefaultsPath), /CONFIG_LV_USE_GIF=y/);
    assert.match(readRequired(sdkconfigDefaultsPath), /CONFIG_LV_USE_PNG=y/);
    assert.match(readRequired(join(firmwareRoot, "sdkconfig")), /CONFIG_LV_USE_PNG=y/);
    assert.match(widgetSource, /lv_gif_create/);
    assert.match(widgetSource, /"lv_gif_create"/);
    assert.match(widgetSource, /lv_gif_set_src/);
    assert.match(widgetSource, /"lv_gif_set_src"/);

    assert.match(voiceAi, /key\.SHORT/);
    assert.match(voiceAi, /key\.EXIT/);
    assert.match(voiceAi, /voice_audio\.post_bridge_chat\(APP\.config\.bridge_url,\s*raw/);
    assert.match(readRequired(voiceAudioHelperPath), /http\.post\(base \.\. "\/api\/chat"/);
    assert.match(readRequired(voiceAudioHelperPath), /\["Content-Type"\]\s*=\s*"application\/octet-stream"/);
    assert.match(voiceAi, /http\.get\(bridge_url\("\/api\/result\?id="/);
    assert.match(voiceAi, /metrics\.json/);
    assert.match(voiceAi, /submit_count/);
    assert.match(voiceAi, /home_events/);
    assert.match(voiceAi, /last_key_event/);
    assert.match(voiceAi, /init_stage/);
    assert.match(voiceAi, /metrics_error/);
    assert.match(voiceAi, /font_loaded/);
    assert.match(voiceAi, /font_handle/);
    assert.match(voiceAi, /font_src/);
    assert.match(voiceAi, /font_error/);
    assert.match(voiceAi, /S\.font_loaded = true/);
    assert.match(voiceAi, /S\.font_error = ok and \("invalid handle " \.\. tostring\(handle\)\) or tostring\(handle\)/);
    assert.match(voiceAi, /local FONT_COMMON_CN = rawget\(_G,\s*"LV_FONT_COMMON_CN_13"\)/);
    assert.match(voiceAi, /FONT_CJK = FONT_COMMON_CN/);
    assert.match(voiceAi, /FONT_CJK = rawget\(_G,\s*"LV_FONT_VOICE_AI_13"\)/);
    assert.match(voiceAi, /FONT_CJK = rawget\(_G,\s*"LV_FONT_SIMSUN_16_CJK"\)/);
    assert.match(voiceAi, /APP\.font_cn = FONT_CJK/);
    assert.match(voiceAi, /S\.font_src = \(FONT_CJK == FONT_COMMON_CN\) and "builtin:LV_FONT_COMMON_CN_13" or "builtin:LV_FONT_VOICE_AI_13"/);
    assert.doesNotMatch(voiceAi, /APP\.font_cn = load_font_chain\(\{/);
    assert.doesNotMatch(voiceAi, /"\/sd\/apps\/voice_ai\/font\/voice_ui_13\.bin"/);
    assert.doesNotMatch(voiceAi, /"\/sd\/apps\/voice_ai\/font\/msyh_cn_13\.bin"/);
    assert.doesNotMatch(voiceAi, /"\/sd\/apps\/weather\/font\/weather_ui_12\.bin"/);
    assert.doesNotMatch(voiceAi, /APP\.font_cn = load_font_ref\("\/sd\/apps\/weather\/font\/weather_ui_12\.bin"/);
    assert.match(voiceAi, /use_gif/);
    assert.match(voiceAi, /gif_visible/);
    assert.match(voiceAi, /gif_state/);
    assert.match(voiceAi, /gif_src/);
    assert.match(voiceAi, /S\.shown_gif_src/);
    assert.match(voiceAi, /last_i2s_error/);
    assert.match(voiceAi, /CAPTURE_RATE\s*=\s*48000/);
    assert.match(voiceAi, /CAPTURE_CHANNELS\s*=\s*2/);
    assert.match(voiceAi, /CAPTURE_PATH\s*=\s*"capture\.raw"/);
    assert.match(voiceAiInfo, /shared\.libs = voice_audio/);
    assert.match(voiceAi, /voice_audio\.record_bridge_pcm\(\{/);
    assert.match(voiceAi, /voice_audio\.post_bridge_chat\(APP\.config\.bridge_url,\s*raw/);
    assert.match(voiceAi, /voice_audio\.max_bridge_pcm_bytes/);
    assert.doesNotMatch(voiceAi, /i2s\.read\(/);
    assert.doesNotMatch(voiceAi, /downsample_left_48k_stereo_to_16k_mono/);
    assert.doesNotMatch(voiceAi, /local function downsample_capture_file_to_16k_mono/);
    assert.doesNotMatch(voiceAi, /local function downsample_capture_chunk_to_16k_mono/);
    assert.doesNotMatch(voiceAi, /local function read_voice_capture_file/);
    assert.doesNotMatch(voiceAi, /raw_tail/);
    assert.doesNotMatch(voiceAi, /RECORD_POLL_MS/);
    assert.match(voiceAi, /capture_rate\s*=\s*APP\.CAPTURE_RATE/);
    assert.match(voiceAi, /capture_channels\s*=\s*APP\.CAPTURE_CHANNELS/);
    assert.doesNotMatch(voiceAi, /channel\s*=\s*i2s\.CHANNEL_ONLY_LEFT/);
    assert.match(voiceAi, /MAX_RECORD_BYTES\s*=\s*98304/);
    assert.match(voiceAi, /local max_record_bytes[\s\S]*max_record_bytes\s*=\s*function\(\)/);
    assert.doesNotMatch(voiceAi, /record_stopping = false/);
    assert.doesNotMatch(voiceAi, /if S\.record_stopping then return end/);
    assert.doesNotMatch(voiceAi, /S\.record_stopping = true/);
    assert.match(voiceAi, /ignore_record_until_ms/);
    assert.match(voiceAi, /if S\.mode == "recording" then\s+return/);
    assert.match(voiceAi, /now < \(S\.ignore_record_until_ms or 0\)/);
    assert.match(voiceAi, /submit_audio\(raw\)\s*raw\s*=\s*nil\s*if type\(collectgarbage\) == "function" then collectgarbage\("collect"\) end/);
    assert.match(voiceAi, /last_http_code/);
    assert.match(voiceAi, /local function show_pending_reply\(\)[\s\S]*set_mode\("reply"\)\s*write_metrics\(\)/);
    assert.match(readRequired(voiceAiCharsetPath), /\./);
    assert.match(voiceAiFontSource, /--symbols [^\n]*\./);
    assert.match(voiceAi, /DEFAULT_BRIDGE_URL\s*=\s*"http:\/\/192\.168\.1\.26:8790"/);
    assert.match(voiceAi, /local function load_config\(\)[\s\S]*return true, "default"/);
    assert.match(voiceAi, /set_init_stage\("load_config"\)/);
    assert.match(voiceAi, /local function finish_boot\(\)[\s\S]*set_init_stage\("ready"\)\s*write_metrics\(\)/);
    assert.match(voiceAi, /local function schedule_boot\(\)/);
    assert.match(voiceAi, /APP\.boot_timer:alarm\(50,\s*tmr\.ALARM_SINGLE/);
    assert.match(voiceAi, /set_init_stage\("scheduled_boot",\s*true\)\s*schedule_boot\(\)/);
    assert.doesNotMatch(voiceAi, /set_init_stage\("build_ui"\)\s*build_ui\(\)\s*set_init_stage\("start_timers"\)\s*start_timers\(\)\s*set_init_stage\("update_ui"\)\s*update_ui\(\)\s*set_init_stage\("ready"\)\s*write_metrics\(\)\s*$/);
    assert.doesNotMatch(voiceAi, /set_init_stage\("load_config", true\)/);
    assert.doesNotMatch(voiceAi, /file\.open\("config\.json", "r"\)/);
    assert.doesNotMatch(voiceAi, /file\.read\("config\.json"\)/);
    assert.doesNotMatch(voiceAi, /handle:read\(1024\)/);
    assert.match(voiceAi, /pcall\(load_config\)/);
    assert.doesNotMatch(voiceAi, /getcontents\(APP\.APP_DIR \.\. "\/config\.json"\)/);
    assert.match(voiceAiSmokeTool, /--require-gif/);
    assert.match(voiceAiSmokeTool, /--require-font/);
    assert.match(voiceAiSmokeTool, /hasVisibleGifMetrics/);
    assert.match(voiceAiSmokeTool, /hasLoadedFontMetrics/);
    assert.match(voiceAiSmokeTool, /gif_visible/);
    assert.match(voiceAiSmokeTool, /font_loaded/);
    assert.match(voiceAiSmokeTest, /can require voice_ai to expose an enabled visible GIF in metrics before recording/);
    assert.match(voiceAiSmokeTest, /can require voice_ai to expose a loaded custom font in metrics before recording/);
    assert.match(voiceAiSmokeTest, /fails when GIF metrics are required but not visible/);
    assert.match(voiceAiSmokeTest, /fails when font metrics are required but not loaded/);
    assert.match(readRequired(luaKeySourcePath), /SHORT/);
    assert.match(readRequired(luaKeySourcePath), /EXIT/);

    assert.match(nesgame, /gamepad\.state/);
    assert.match(nesgame, /nes\./);
    assert.match(readRequired(cmakePath), /lua_gamepad\.c/);
    assert.doesNotMatch(readRequired(cmakePath), /lua_nes\.c/);
  });

  it("exposes first-slice migrated app performance metrics", () => {
    const weather = readRequired(weatherSourcePath);
    const photos = readRequired(photosSourcePath);
    const voiceAi = readRequired(voiceAiSourcePath);

    for (const [name, source] of [
      ["weather", weather],
      ["photos", photos],
      ["voice_ai", voiceAi],
    ]) {
      assert.match(source, /perf_first_paint_ms/, `${name} exposes first paint metric`);
      assert.match(source, /perf_ready_ms/, `${name} exposes ready metric`);
      assert.match(source, /perf_resource_ms/, `${name} exposes resource metric`);
      assert.match(source, /perf_http_ms/, `${name} exposes HTTP metric`);
      assert.match(source, /perf_timer_max_ms/, `${name} exposes timer max metric`);
      assert.match(source, /perf_stop_requested/, `${name} exposes stop metric`);
      assert.match(source, /perf_last_error/, `${name} exposes performance error metric`);
      assert.match(source, /local function mark_perf_timer/, `${name} tracks timer callback duration`);
    }

    assert.match(weather, /APP\.perf\.started_ms\s*=\s*now_ms\(\)/);
    assert.match(photos, /APP\.perf\.started_ms\s*=\s*now_ms\(\)/);
    assert.match(voiceAi, /APP\.perf\.started_ms\s*=\s*now_ms\(\)/);
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
    assert.match(runner, /vb_lua_gamepad_register\(L,\s*&runtime\.gamepad\)/);
  });

  it("queues HTTP gamepad smoke injection through the active Lua runner", () => {
    const header = readRequired(luaGamepadHeaderPath);
    const source = readRequired(luaGamepadSourcePath);
    const runnerHeader = readRequired(runnerHeaderPath);
    const runner = readRequired(runnerSourcePath);
    const installService = readRequired(installServiceSourcePath);

    assert.match(header, /typedef\s+struct\s+\{[\s\S]*buttons_mask[\s\S]*address\[32\][\s\S]*\}\s+vb_lua_gamepad_pending_state_t/);
    assert.match(header, /void\s+vb_lua_gamepad_init/);
    assert.match(header, /esp_err_t\s+vb_lua_gamepad_enqueue/);
    assert.match(header, /int\s+vb_lua_gamepad_process_pending/);
    assert.match(source, /xQueueCreate\(VB_LUA_GAMEPAD_QUEUE_DEPTH,\s*sizeof\(vb_lua_gamepad_pending_state_t\)\)/);
    assert.match(source, /vb_lua_gamepad_pending_state_t\s+queued\s*=\s*\*pending/);
    assert.match(source, /xQueueSend\(queue,\s*&queued,\s*0\)/);
    assert.match(source, /xQueueReceive\(queue,\s*&pending,\s*0\)/);
    assert.match(source, /push_state_table/);
    assert.match(runnerHeader, /vb_app_runner_enqueue_gamepad/);
    assert.match(runner, /vb_lua_gamepad_state_t\s+gamepad/);
    assert.match(runner, /vb_lua_gamepad_init\(&runtime\.gamepad\)/);
    assert.match(runner, /vb_lua_gamepad_register\(L,\s*&runtime\.gamepad\)/);
    assert.match(runner, /vb_lua_gamepad_process_pending\(L,\s*&runtime->gamepad\)/);
    assert.match(runner, /vb_app_runner_enqueue_gamepad\(const\s+vb_lua_gamepad_pending_state_t\s+\*state\)/);
    assert.match(runner, /vb_lua_gamepad_enqueue\(&runtime->gamepad,\s*state\)/);
    assert.match(runner, /vb_lua_gamepad_cleanup\(L,\s*&runtime->gamepad\)/);
    assert.match(installService, /#include\s+"lua_gamepad\.h"/);
    assert.match(installService, /static\s+esp_err_t\s+input_gamepad_handler\(httpd_req_t\s+\*req\)/);
    assert.match(installService, /parse_bool_query/);
    assert.match(installService, /parse_int_query/);
    assert.match(installService, /vb_app_runner_enqueue_gamepad\(&state\)/);
    assert.match(installService, /register_handler\("\/input\/gamepad",\s*HTTP_POST,\s*input_gamepad_handler\)/);
    assert.doesNotMatch(installService, /atoi\(.*buttons/);
  });

  it("registers a Lua I2S recording and playback module for Voice AI", () => {
    const header = readRequired(luaI2sHeaderPath);
    const source = readRequired(luaI2sSourcePath);
    const cmake = readRequired(cmakePath);
    const runner = readRequired(runnerSourcePath);

    assert.match(cmake, /lua_i2s\.c/);
    assert.match(header, /vb_lua_i2s_register/);
    assert.match(source, /i2s_start/);
    assert.match(source, /i2s_read/);
    assert.match(source, /i2s_write/);
    assert.match(source, /i2s_record_file/);
    assert.match(source, /i2s_play_file/);
    assert.match(source, /i2s_stop/);
    assert.match(source, /i2s_status/);
    assert.match(source, /MODE_MASTER/);
    assert.match(source, /MODE_RX/);
    assert.match(source, /CHANNEL_ONLY_LEFT/);
    assert.match(source, /FORMAT_I2S/);
    assert.match(source, /\/sdcard\/runtime\/i2s\.json/);
    assert.match(source, /board_lckfb_szpi_s3\.h/);
    assert.match(source, /vb_board_audio_prepare\(want_rx,\s*want_tx,\s*rate,\s*bits[\s\S]*next_rx_uses_tdm/);
    assert.match(source, /i2s_channel_read/);
    assert.match(source, /i2s_channel_write/);
    assert.match(source, /resolve_app_file_path/);
    assert.match(source, /esp_timer_get_time/);
    assert.match(source, /resample_step_q32/);
    assert.match(source, /next_source_frame_q32/);
    assert.doesNotMatch(source, /int\s+downsample\s*=\s*in_rate\s*\/\s*out_rate/);
    assert.match(source, /heap_caps_malloc\(\(size_t\)chunk_bytes,\s*MALLOC_CAP_8BIT\)/);
    assert.doesNotMatch(source, /i2s play_file buffer alloc failed[\s\S]*MALLOC_CAP_INTERNAL \| MALLOC_CAP_8BIT/);
    assert.match(source, /VB_LUA_FILE_APP_DIR_REGISTRY_KEY\s+"vb_file_app_dir"/);
    assert.match(source, /"record_file",\s*i2s_record_file/);
    assert.match(source, /"play_file",\s*i2s_play_file/);
    assert.match(source, /i2s_channel_disable/);
    assert.match(source, /#include\s+"driver\/i2s_tdm\.h"/);
    assert.match(source, /init_rx_tdm/);
    assert.match(source, /I2S_TDM_PHILIPS_SLOT_DEFAULT_CONFIG/);
    assert.match(source, /I2S_TDM_SLOT0\s*\|\s*I2S_TDM_SLOT1/);
    assert.match(source, /table_bool_tristate\(L,\s*"tdm"\)/);
    assert.match(source, /next_rx_uses_tdm\s*=\s*want_rx\s*&&\s*!want_tx\s*&&\s*channel\s*==\s*VB_LUA_I2S_CHANNEL_STEREO\s*&&\s*rx_tdm_mode\s*!=\s*0/);
    assert.match(source, /lua_setfield\(L,\s*-2,\s*"rx_tdm"\)/);
    assert.match(source, /dout_pin/);
    assert.match(source, /mclk_pin/);
    assert.match(source, /tx_bytes/);
    assert.match(source, /stop_port\(port\)/);
    assert.doesNotMatch(source, /if \(port->started\) \{\s*lua_pushboolean\(L,\s*true\);\s*return 1;\s*\}/);

    const i2sWriteBody = source.match(/static int i2s_write\(lua_State \*L\)[\s\S]*?\n}\n\nint vb_i2s_tx_stream_begin/);
    assert.ok(i2sWriteBody, "i2s_write body is present");
    assert.match(i2sWriteBody[0], /i2s_channel_write\(port->tx,\s*data,\s*len,\s*&written,\s*pdMS_TO_TICKS\(timeout_ms\)\)/);
    assert.match(i2sWriteBody[0], /port->writes\+\+/);
    assert.match(i2sWriteBody[0], /port->tx_bytes\s*\+=\s*written/);
    assert.doesNotMatch(i2sWriteBody[0], /vb_i2s_tx_stream_write/);

    const stopPortBody = source.match(/static void stop_port\(vb_lua_i2s_port_t \*port\)[\s\S]*?\n}\n\nstatic int i2s_stop/);
    assert.ok(stopPortBody, "stop_port body is present");
    assert.match(stopPortBody[0], /ptrdiff_t\s+port_id\s*=\s*port\s*-\s*s_i2s/);
    assert.match(stopPortBody[0], /s_tx_streams\[port_id\]\.in_use\s*=\s*false/);
    assert.match(runner, /#include\s+"lua_i2s\.h"/);
    assert.match(runner, /vb_lua_i2s_register\(L\)/);
  });

  it("prepares LCKFB audio codecs and amplifier before runtime I2S use", () => {
    const boardHeader = readRequired(join(firmwareRoot, "main/board_lckfb_szpi_s3.h"));
    const boardSource = readRequired(join(firmwareRoot, "main/board_lckfb_szpi_s3.c"));
    const manifest = readRequired(join(firmwareRoot, "main/idf_component.yml"));

    assert.match(manifest, /espressif\/es7210:\s*"\^1\.0\.0"/);
    assert.match(manifest, /espressif\/es8311:\s*"\^1\.0\.0"/);
    assert.match(boardHeader, /VB_PCA9557_PA_EN_BIT\s+BIT\(1\)/);
    assert.match(boardHeader, /vb_board_audio_prepare\(bool want_rx,\s*bool want_tx,\s*uint32_t sample_rate[\s\S]*bool rx_tdm/);
    assert.match(boardSource, /#include\s+"es7210\.h"/);
    assert.match(boardSource, /#include\s+"es8311\.h"/);
    assert.match(boardSource, /static uint8_t\s+s_pca9557_output\s*=\s*VB_PCA9557_LCD_CS_BIT\s*\|\s*VB_PCA9557_DVP_PWDN_BIT/);
    assert.match(boardSource, /pca9557_set_output\(VB_PCA9557_PA_EN_BIT,\s*true\)/);
    assert.match(boardSource, /es8311_create\(VB_I2C_PORT,\s*ES8311_ADDRRES_0\)/);
    assert.match(boardSource, /es8311_voice_volume_set\(handle,\s*70,\s*NULL\)/);
    assert.match(boardSource, /es7210_new_codec\(&i2c_config,\s*&handle\)/);
    assert.match(boardSource, /\.i2c_addr\s*=\s*0x41/);
    assert.match(boardSource, /\.flags\.tdm_enable\s*=\s*tdm_enable/);
    assert.match(boardSource, /s_es7210_tdm/);
    assert.doesNotMatch(boardSource, /s_es7210_ready\s*&&\s*s_es7210_sample_rate\s*==\s*sample_rate\s*&&\s*s_es7210_bits\s*==\s*bits\s*&&\s*s_es7210_tdm\s*==\s*tdm_enable[\s\S]*return ESP_OK/);
    assert.match(boardSource, /I2S_MCLK_MULTIPLE_256/);
    assert.match(boardSource, /ES7210_MIC_GAIN_30DB/);
    assert.match(boardSource, /vb_board_audio_prepare\(bool want_rx,\s*bool want_tx[\s\S]*bool rx_tdm/);
  });

  it("routes NES host audio writes through the runtime I2S TX helper", () => {
    const i2sHeader = readRequired(luaI2sHeaderPath);
    const i2sSource = readRequired(luaI2sSourcePath);
    const nesHostShim = readRequired(join(firmwareRoot, "main/nes_host_v1_shim.c"));
    const nesAudioOut = readRequired(join(repoRoot, "modules/nes/audio/nes_audio_out.cpp"));
    const nesAudioOutHeader = readRequired(join(repoRoot, "modules/nes/audio/nes_audio_out.h"));

    assert.match(i2sHeader, /vb_i2s_tx_stream_begin/);
    assert.match(i2sHeader, /vb_i2s_tx_stream_write/);
    assert.match(i2sHeader, /vb_i2s_tx_stream_end/);
    assert.match(i2sSource, /i2s_channel_write/);
    assert.match(i2sSource, /VB_I2S_TX_STREAM_DMA_COUNT\s+2/);
    assert.match(i2sSource, /VB_I2S_TX_STREAM_DMA_LEN\s+64/);
    assert.match(i2sSource, /VB_I2S_TX_STREAM_ERR_NEW_CHANNEL\s+10000/);
    assert.match(i2sSource, /VB_I2S_TX_STREAM_ERR_INIT_STD\s+20000/);
    assert.match(i2sSource, /VB_I2S_TX_STREAM_ERR_ENABLE\s+30000/);
    assert.match(i2sSource, /encode_tx_stream_error\(esp_err_t err,\s*int stage\)/);
    assert.match(i2sSource, /encode_tx_stream_error\(err,\s*VB_I2S_TX_STREAM_ERR_NEW_CHANNEL\)/);
    assert.match(i2sSource, /encode_tx_stream_error\(err,\s*failure_stage\)/);
    assert.match(nesHostShim, /#include\s+"lua_i2s\.h"/);
    assert.match(nesHostShim, /vb_i2s_tx_stream_begin\(/);
    assert.match(nesHostShim, /vb_i2s_tx_stream_begin\(0,/);
    assert.match(nesHostShim, /s_last_audio_begin_error/);
    assert.match(i2sSource, /s_tx_streams\[VB_I2S_MAX_PORTS\]/);
    assert.doesNotMatch(i2sSource, /vb_i2s_tx_stream_begin[\s\S]*?heap_caps_calloc/);
    assert.match(nesHostShim, /vb_i2s_tx_stream_write\(stream,\s*samples,\s*bytes,\s*&written,\s*20\)/);
    assert.match(nesHostShim, /vb_i2s_tx_stream_end\(/);
    assert.match(nesAudioOutHeader, /m_host_zero_write_streak/);
    assert.match(nesAudioOut, /host audio unsupported: "\)\s*\+\s*String\(ret\)/);
    assert.match(nesAudioOut, /attempts\s*<\s*3/);
    assert.match(nesAudioOut, /m_dropped_bytes\s*\+=\s*\(uint32_t\)\(bytes\s*-\s*offset\)/);
    assert.match(nesAudioOut, /\+\+m_host_zero_write_streak\s*<\s*16/);
    assert.match(nesAudioOut, /setFailure\("host audio write failed"\);[\s\S]*return false;/);
    assert.match(nesHostShim, /strcmp\(name,\s*"nes_apu"\)\s*==\s*0/);
    assert.match(nesHostShim, /else[\s\S]*xTaskCreatePinnedToCore\([^;]*core/);
    assert.doesNotMatch(nesHostShim, /\(void\)core;/);
    const nesVideoOut = readRequired(join(repoRoot, "modules/nes/video/nes_video_out.cpp"));
    assert.match(nesVideoOut, /String\("push display pixels failed: "\)\s*\+\s*String\(ret\)/);
    const coreBridge = readRequired(join(repoRoot, "modules/nes/runtime/nes_core_bridge.cpp"));
    assert.match(coreBridge, /beginAudioOutput\(\)/);
    assert.match(coreBridge, /setStage\(StageCartridgeBegin[\s\S]*beginAudioOutput\(\)[\s\S]*setStage\(StageVideoBegin/);
    assert.match(coreBridge, /m_bus->cpu\.apu\.setAudioSink\(audioSinkCallback,\s*this\)/);
    assert.doesNotMatch(nesHostShim, /static int32_t shim_audio_begin[\s\S]*?\(void\)desc;[\s\S]*?\(void\)out_stream;[\s\S]*?return MODULE_ERR_UNSUPPORTED;/);
    assert.doesNotMatch(nesHostShim, /static int32_t shim_audio_write[\s\S]*?\(void\)samples;[\s\S]*?\(void\)bytes;[\s\S]*?return MODULE_ERR_UNSUPPORTED;/);
    assert.doesNotMatch(nesHostShim, /static int32_t shim_audio_end[\s\S]*?\(void\)stream;[\s\S]*?return MODULE_ERR_UNSUPPORTED;/);
  });

  it("resets the NES display stream when a new frame starts with an unfinished stream", () => {
    const nesVideoOut = readRequired(join(repoRoot, "modules/nes/video/nes_video_out.cpp"));
    const submitBody = nesVideoOut.match(/bool NesVideoOut::submitTransferChunk[\s\S]*?void NesVideoOut::cancelTransferChunk/);
    assert.ok(submitBody, "NesVideoOut::submitTransferChunk body is present");
    assert.match(submitBody[0], /start_row\s*==\s*0[\s\S]*m_stream_active[\s\S]*dmaWait\(err\)/);
    assert.ok(
      submitBody[0].indexOf("start_row == 0") < submitBody[0].indexOf("pushPixelsDMA"),
      "new-frame stream reset happens before pushing pixels",
    );
  });

  it("closes the NES ROM file handle after successful PSRAM preload", () => {
    const cartridge = readRequired(join(repoRoot, "modules/nes/core/cartridge.cpp"));
    assert.match(
      cartridge,
      /if\s*\(preload_result\s*==\s*RomPreloadResult::Success\)\s*\{\s*rom\.close\(\);\s*\}/,
    );
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
    assert.match(main, /vb_runtime_wifi_load_config_from_sd\(&wifi_config\)/);
    assert.match(main, /vb_runtime_wifi_start_config\(&wifi_config\)/);
    assert.doesNotMatch(main, /vb_board_camera_reserve_internal_dma/);
    assert.match(
      main,
      /vb_board_start_storage\(&board\)[\s\S]*vb_runtime_wifi_load_config_from_sd\(&wifi_config\)[\s\S]*vb_board_unmount_sd\(&board\)[\s\S]*vb_runtime_wifi_start_config\(&wifi_config\)[\s\S]*vb_board_mount_sd\(&board\)[\s\S]*vb_board_start_display\(&board\)[\s\S]*vb_install_service_start\(&s_install_context\)/,
    );
  });

  it("registers a minimal LVGL Lua surface", () => {
    const header = readRequired(luaLvglHeaderPath);
    const source = readRequired(luaLvglSourcePath);
    const internal = readRequired(luaLvglInternalHeaderPath);
    const fsSource = readRequired(luaLvglFsSourcePath);
    const widgetSource = readRequired(luaLvglWidgetsSourcePath);
    const voiceAiFontSource = readRequired(voiceAiFontSourcePath);
    const commonCnFontSource = readRequired(commonCnFontSourcePath);
    const sdkconfig = readRequired(join(firmwareRoot, "sdkconfig"));
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
    assert.match(widgetSource, /vb_lua_lvgl_font_from_ref/);
    assert.match(widgetSource, /VB_LVGL_FONT_SIMSUN_16_CJK_REF\s+\(-16016\)/);
    assert.match(widgetSource, /VB_LVGL_FONT_COMMON_CN_13_REF\s+\(-13014\)/);
    assert.match(widgetSource, /VB_LVGL_FONT_VOICE_AI_13_REF\s+\(-13013\)/);
    assert.match(widgetSource, /LV_FONT_DECLARE\(vb_font_common_cn_13\)/);
    assert.match(widgetSource, /LV_FONT_DECLARE\(vb_font_voice_ai_13\)/);
    assert.match(widgetSource, /case VB_LVGL_FONT_COMMON_CN_13_REF:[\s\S]*return &vb_font_common_cn_13/);
    assert.match(widgetSource, /case VB_LVGL_FONT_VOICE_AI_13_REF:[\s\S]*return &vb_font_voice_ai_13/);
    assert.match(widgetSource, /vb_lua_lvgl_common_cn_13_font_ref/);
    assert.match(widgetSource, /vb_lua_lvgl_voice_ai_13_font_ref/);
    assert.match(commonCnFontSource, /--symbols [^\n]*℃/);
    assert.match(commonCnFontSource, /--symbols [^\n]*\./);
    assert.match(commonCnFontSource, /--no-compress/);
    assert.match(commonCnFontSource, /--no-prefilter/);
    assert.match(commonCnFontSource, /\.bitmap_format\s*=\s*0/);
    assert.match(voiceAiFontSource, /--no-compress/);
    assert.match(voiceAiFontSource, /--no-prefilter/);
    assert.match(voiceAiFontSource, /\.bitmap_format\s*=\s*0/);
    assert.doesNotMatch(sdkconfig, /CONFIG_LV_USE_FONT_COMPRESSED=y/);
    assert.match(widgetSource, /case VB_LVGL_FONT_SIMSUN_16_CJK_REF:[\s\S]*return &lv_font_simsun_16_cjk/);
    assert.match(widgetSource, /vb_lua_lvgl_simsun_16_cjk_font_ref/);
    assert.match(readRequired(join(firmwareRoot, "main/CMakeLists.txt")), /"vb_font_common_cn_13\.c"/);
    assert.match(readRequired(join(firmwareRoot, "main/CMakeLists.txt")), /"vb_font_voice_ai_13\.c"/);
    assert.match(readRequired(join(firmwareRoot, "main/lua_lvgl.c")), /lua_setglobal\(L,\s*"LV_FONT_COMMON_CN_13"\)/);
    assert.match(readRequired(join(firmwareRoot, "main/lua_lvgl.c")), /lua_setglobal\(L,\s*"LV_FONT_VOICE_AI_13"\)/);
    assert.match(readRequired(join(firmwareRoot, "main/lua_lvgl.c")), /lua_setglobal\(L,\s*"LV_FONT_SIMSUN_16_CJK"\)/);
    assert.match(widgetSource, /case 10:[\s\S]*lv_font_montserrat_10/);
    assert.match(widgetSource, /case 12:[\s\S]*lv_font_montserrat_12/);
    assert.match(widgetSource, /case 14:[\s\S]*lv_font_montserrat_14/);
    assert.match(widgetSource, /case 16:[\s\S]*lv_font_montserrat_16/);
    assert.match(widgetSource, /case 28:[\s\S]*lv_font_montserrat_28/);
    assert.match(widgetSource, /const lv_font_t \*font = vb_lua_lvgl_font_from_ref\(font_ref\);/);
    assert.doesNotMatch(widgetSource, /\(void\)font;\s*lvgl_port_lock\(0\);[\s\S]*?lv_obj_set_style_text_font\(object,\s*LV_FONT_DEFAULT,\s*selector\);/);
    assert.match(readRequired(sdkconfigDefaultsPath), /CONFIG_LV_FONT_SIMSUN_16_CJK=y/);
    assert.match(readRequired(sdkconfigDefaultsPath), /CONFIG_LV_FONT_DEFAULT_SIMSUN_16_CJK=y/);
    assert.match(readRequired(join(firmwareRoot, "sdkconfig")), /CONFIG_LV_FONT_SIMSUN_16_CJK=y/);
    assert.match(readRequired(join(firmwareRoot, "sdkconfig")), /CONFIG_LV_FONT_DEFAULT_SIMSUN_16_CJK=y/);
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
    assert.match(widgetSource, /vb_lua_lvgl_resolve_asset_path\(path,\s*resolved,\s*sizeof\(resolved\)\)/);
    assert.match(widgetSource, /lv_font_t \*font = lv_font_load\(resolved\);/);
    assert.match(widgetSource, /lua_pushinteger\(L,\s*\(lua_Integer\)\(uintptr_t\)font\);/);
    assert.match(widgetSource, /lv_font_free\(\(lv_font_t \*\)\(uintptr_t\)font_ref\);/);
    assert.doesNotMatch(widgetSource, /static int l_lv_font_load[\s\S]*?lua_pushinteger\(L,\s*0\);[\s\S]*?return 1;/);
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

  it("keeps LVGL BMP decoding usable for streamed weather backgrounds", () => {
    const defaults = readRequired(sdkconfigDefaultsPath);
    const bmpSource = readRequired(lvglBmpSourcePath);
    const bmpPatch = readRequired(lvglBmpPatchPath);
    const projectCmake = readRequired(projectCmakePath);
    const weatherSource = readRequired(weatherSourcePath);

    assert.match(defaults, /CONFIG_LV_COLOR_16_SWAP=y/);
    assert.match(defaults, /CONFIG_LV_USE_BMP=y/);
    assert.match(projectCmake, /patch_lvgl_bmp_runtime\.cmake/);
    assert.match(bmpPatch, /VB_LVGL_BMP_SOURCE/);
    assert.match(bmpPatch, /b\.bpp != 16 && b\.bpp != 24/);
    assert.match(bmpPatch, /if\(b->bpp == 24\)/);
    assert.match(bmpPatch, /lv_color_make\(bgr\[2\], bgr\[1\], bgr\[0\]\)/);
    assert.match(bmpSource, /lv_fs_open\(&b\.f,\s*dsc->src,\s*LV_FS_MODE_RD\)/);
    assert.match(bmpSource, /if\(res != LV_FS_RES_OK\) return LV_RES_INV;/);
    assert.doesNotMatch(bmpSource, /if\(res == LV_RES_OK\) return LV_RES_INV;/);
    assert.match(bmpSource, /LV_COLOR_DEPTH == 16 && \(b\.bpp != 16 && b\.bpp != 24\)/);
    assert.match(bmpSource, /b->bpp == 24/);
    assert.match(bmpSource, /lv_color_make/);
    assert.match(bmpSource, /dsc->img_data = NULL;/);
    assert.match(bmpSource, /static lv_res_t decoder_read_line/);
    assert.match(bmpSource, /lv_fs_seek\(&b->f,\s*p,\s*LV_FS_SEEK_SET\)/);
    assert.match(bmpSource, /lv_fs_read\(&b->f,\s*buf,\s*len \* \(b->bpp \/ 8\),\s*NULL\)/);

    assert.match(weatherSource, /local function background_asset_path\(kind\)/);
    assert.match(weatherSource, /APP\.ASSET_DIR \.\. "\/bg\/" \.\. tostring\(kind or "partly"\) \.\. "\.bmp"/);
    const canvasSource = readRequired(luaLvglCanvasSourcePath);
    assert.match(canvasSource, /static int l_lv_canvas_load_bmp\(lua_State \*L\)/);
    assert.match(canvasSource, /vb_lua_lvgl_resolve_asset_path\(src,\s*resolved,\s*sizeof\(resolved\)\)/);
    assert.match(canvasSource, /fread\(header,\s*1,\s*sizeof\(header\),\s*file\)/);
    assert.match(canvasSource, /heap_caps_malloc\(sizeof\(s_canvas_buffer\),\s*MALLOC_CAP_SPIRAM \| MALLOC_CAP_8BIT\)/);
    assert.match(canvasSource, /lv_color_make/);
    assert.match(canvasSource, /memcpy\(s_canvas_buffer,\s*scratch,\s*sizeof\(s_canvas_buffer\)\)/);
    assert.match(canvasSource, /lv_obj_invalidate\(canvas\)/);
    assert.match(canvasSource, /"lv_canvas_load_bmp"/);
    assert.match(weatherSource, /APP\.ui\.bg_canvas\s*=\s*lv_canvas_create\(root,\s*APP\.SCREEN_W,\s*APP\.SCREEN_H\)/);

    const backgroundBody = weatherSource.match(/local function lazy_load_background\(\)([\s\S]*?)\n    end\n\n    local function schedule_background_load\(\)/);
    assert.ok(backgroundBody, "weather lazy background body is present");
    assert.match(backgroundBody[1], /APP\.state\.background_error\s*=\s*"loading"/);
    assert.match(backgroundBody[1], /lv_canvas_load_bmp\(APP\.ui\.bg_canvas,\s*background_asset_path\(weather_kind\(\)\)\)/);
    assert.match(backgroundBody[1], /APP\.state\.background_ready\s*=\s*true/);
    assert.doesNotMatch(backgroundBody[1], /APP\.state\.background_error\s*=\s*"probe"/);
    assert.doesNotMatch(backgroundBody[1], /asset_path\("bg"/);
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
    assert.match(info, /capabilities\s*=\s*lvgl,timer,input,file/);
    assert.match(source, /key\.on\(function\(evt_code,\s*evt_type,\s*ts_ms\)/);
    assert.match(source, /key\.push\(key\.LEFT/);
    assert.match(source, /key\.push\(key\.RIGHT/);
    assert.match(source, /pcall\(key\.repeat_start,\s*key\.UP/);
    assert.match(source, /pcall\(key\.repeat_stop,\s*key\.UP/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /event_counts/);
    assert.match(source, /UP:LONG_REPEAT/);
    assert.match(source, /UP:LONG_END/);
    assert.match(source, /app\.exiting\(\)/);
    assert.match(source, /timer:stop\(\)/);
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

  it("ships an IMU sensor smoke app", () => {
    const info = readRequired(smokeImuInfoPath);
    const source = readRequired(smokeImuSourcePath);

    assert.match(info, /name\s*=\s*smoke_imu/);
    assert.match(info, /capabilities\s*=\s*lvgl,timer,input,file/);
    assert.match(source, /imu\.state\(\)/);
    assert.match(source, /imu\.on\(function\(sample\)/);
    assert.match(source, /imu\.read\(\)/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /available/);
    assert.match(source, /roll/);
    assert.match(source, /pitch/);
  });

  it("ships a gamepad compatibility smoke app", () => {
    const info = readRequired(smokeGamepadInfoPath);
    const source = readRequired(smokeGamepadSourcePath);

    assert.match(info, /name\s*=\s*smoke_gamepad/);
    assert.match(info, /capabilities\s*=\s*lvgl,timer,input,file/);
    assert.match(source, /gamepad\.start/);
    assert.match(source, /gamepad\.on\(gamepad\.EVT_CONNECTING/);
    assert.match(source, /gamepad\.on\(gamepad\.EVT_CONNECTED/);
    assert.match(source, /gamepad\.on\(gamepad\.EVT_DISCONNECTED/);
    assert.match(source, /gamepad\.on\(gamepad\.EVT_UPDATE/);
    assert.match(source, /gamepad\.push_state/);
    assert.match(source, /gamepad\.state/);
    assert.match(source, /gamepad\.BTN_XBOX/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /buttons_mask/);
    assert.match(source, /xbox_seen/);
    assert.match(source, /left_seen/);
    assert.match(source, /right_seen/);
    assert.match(source, /pair_events/);
    assert.match(source, /last_address/);
    assert.match(source, /local\s+connect_failed\s*=\s*0/);
    assert.match(source, /gamepad\.on\(gamepad\.EVT_CONNECT_FAILED/);
    assert.match(source, /connect_failed\s*=\s*connect_failed\s*\+\s*1/);
    assert.match(source, /connect_failed\\":%d/);
  });

  it("ships an I2S recording smoke app", () => {
    const info = readRequired(smokeI2sInfoPath);
    const source = readRequired(smokeI2sSourcePath);

    assert.match(info, /name\s*=\s*smoke_i2s/);
    assert.match(info, /capabilities\s*=\s*lvgl,timer,audio/);
    assert.match(source, /i2s\.start/);
    assert.match(source, /i2s\.read/);
    assert.match(source, /i2s\.write/);
    assert.match(source, /i2s\.status/);
    assert.match(source, /i2s\.stop/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /tx_bytes/);
    assert.match(source, /writes/);
    assert.match(source, /file\.write/);
  });

  it("ships a file smoke app", () => {
    const info = readRequired(smokeFileInfoPath);
    const source = readRequired(smokeFileSourcePath);
    const config = readRequired(smokeFileConfigPath);
    const fileModule = readRequired(luaFileSourcePath);

    assert.match(info, /name\s*=\s*smoke_file/);
    assert.match(info, /capabilities\s*=\s*file/);
    assert.match(source, /file\.exists\("config\.json"\)/);
    assert.match(source, /file\.read\("config\.json"\)/);
    assert.match(source, /file\.list\("\."\)/);
    assert.match(source, /file\.write\("runtime-state\.txt"/);
    assert.match(source, /file\.open\("config\.json",\s*"r"\)/);
    assert.match(source, /smoke file ok/);
    assert.match(config, /"city"\s*:\s*"Shanghai"/);
    assert.match(fileModule, /log_file_error/);
    assert.match(fileModule, /log_file_errno/);
    assert.match(fileModule, /file app dir unavailable/);
    assert.match(fileModule, /file path escapes app sandbox/);
    assert.match(fileModule, /file write only supports app-local paths/);
    assert.match(fileModule, /file path must be app-relative or \/sd\//);
    assert.match(fileModule, /file path too long/);
    assert.match(fileModule, /read-open/);
    assert.match(fileModule, /read-seek/);
    assert.match(fileModule, /read-size/);
    assert.match(fileModule, /write-open/);
    assert.match(fileModule, /list-open/);
  });

  it("ships an asset path smoke app", () => {
    const info = readRequired(smokeAssetsInfoPath);
    const source = readRequired(smokeAssetsSourcePath);
    const image = readRequired(smokeAssetsImagePath);
    const fsSource = readRequired(luaLvglFsSourcePath);

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
    assert.match(fsSource, /resolve asset failed path=%s detail=invalid or traversal/);
    assert.match(fsSource, /resolve asset failed path=%s detail=unsupported absolute path/);
    assert.match(fsSource, /resolve asset failed path=%s detail=invalid asset path/);
  });

  it("ships a visual smoke app with a real BMP asset and common widgets", () => {
    const info = readRequired(smokeVisualInfoPath);
    const source = readRequired(smokeVisualSourcePath);
    const bmp = readFileSync(smokeVisualBmpPath);
    const canvasSource = readRequired(luaLvglCanvasSourcePath);
    const widgetSource = readRequired(luaLvglWidgetsSourcePath);

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
    assert.match(canvasSource, /resolve bmp source failed path=%s detail=invalid BMP source path/);
    assert.match(canvasSource, /resolve bmp source failed path=%s detail=unsupported BMP format/);
    assert.match(canvasSource, /resolve bmp source failed path=%s detail=BMP row too large/);
    assert.match(canvasSource, /resolve bmp source failed path=%s detail=BMP canvas buffer allocation failed/);
    assert.match(canvasSource, /open bmp failed path=%s detail=%s/);
    assert.match(canvasSource, /read bmp failed path=%s detail=header read failed/);
    assert.match(canvasSource, /read bmp failed path=%s detail=pixel read failed/);
    assert.match(widgetSource, /resolve image source failed path=%s detail=invalid image source path/);
    assert.match(widgetSource, /resolve gif source failed path=%s detail=invalid gif source path/);
    assert.match(widgetSource, /resolve font source failed path=%s detail=invalid font source path/);
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

  it("ships the Phase 3 LVGL widgets smoke app", () => {
    const info = readRequired(smokeLvglWidgetsInfoPath);
    const source = readRequired(smokeLvglWidgetsSourcePath);
    const bmp = readFileSync(smokeLvglWidgetsBmpPath);

    assert.match(info, /name\s*=\s*smoke_lvgl_widgets/);
    assert.match(info, /capabilities\s*=\s*lvgl,file,timer/);
    assert.equal(bmp.subarray(0, 2).toString("ascii"), "BM");
    assert.match(source, /lv_resolve_asset_path\("assets\/icon\.bmp"\)/);
    assert.match(source, /lv_asset_exists\(APP\.icon_path\)/);
    assert.match(source, /lv_label_create\(root\)/);
    assert.match(source, /lv_img_create\(root\)/);
    assert.match(source, /lv_img_set_src\(image,\s*APP\.icon_path\)/);
    assert.match(source, /lv_obj_set_pos\(image,\s*18,\s*46\)/);
    assert.match(source, /lv_btn_create\(root\)/);
    assert.match(source, /lv_bar_create\(root\)/);
    assert.match(source, /lv_bar_set_range\(bar,\s*0,\s*100\)/);
    assert.match(source, /lv_bar_set_value\(APP\.ui\.bar,\s*APP\.progress,\s*LV_ANIM_ON\)/);
    assert.match(source, /lv_obj_add_flag\(hidden,\s*LV_OBJ_FLAG_HIDDEN\)/);
    assert.match(source, /lv_label_set_long_mode\(status,\s*LV_LABEL_LONG_CLIP\)/);
    assert.match(source, /tmr\.create\(\)/);
    assert.match(source, /alarm\(50,\s*tmr\.ALARM_SINGLE\s*or\s*0,\s*function\(\)/);
    assert.match(source, /file\.write\(APP\.METRICS_PATH,\s*body\)/);
    assert.match(source, /"boot_error":/);
    assert.match(source, /APP\.boot_error\s*=\s*tostring\(err\s*or\s*"boot failed"\)/);
    assert.match(source, /smoke lvgl widgets ok/);
  });

  it("ships the Phase 3 LVGL style smoke app", () => {
    const info = readRequired(smokeLvglStyleInfoPath);
    const source = readRequired(smokeLvglStyleSourcePath);

    assert.match(info, /name\s*=\s*smoke_lvgl_style/);
    assert.match(info, /capabilities\s*=\s*lvgl,file,timer/);
    assert.match(source, /LV_PART_MAIN/);
    assert.match(source, /LV_STATE_DEFAULT/);
    assert.match(source, /lv_obj_set_style_opa\(card,\s*238,\s*MAIN\)/);
    assert.match(source, /lv_obj_set_style_bg_opa\(card,\s*235,\s*MAIN\)/);
    assert.match(source, /lv_obj_set_style_border_opa\(card,\s*160,\s*MAIN\)/);
    assert.match(source, /lv_obj_set_style_text_font\(title,\s*FONT_16,\s*MAIN\)/);
    assert.match(source, /lv_obj_set_style_text_font\(metric,\s*FONT_28,\s*MAIN\)/);
    assert.match(source, /lv_obj_set_style_text_align\(metric,\s*TEXT_CENTER,\s*MAIN\)/);
    assert.match(source, /lv_label_set_long_mode\(detail,\s*LONG_WRAP\)/);
    assert.match(source, /rawget\(_G,\s*"lv_label_set_recolor"\)/);
    assert.match(source, /alarm\(50,\s*tmr\.ALARM_SINGLE\s*or\s*0,\s*function\(\)/);
    assert.match(source, /file\.write\(APP\.METRICS_PATH,\s*body\)/);
    assert.match(source, /"boot_error":/);
    assert.match(source, /APP\.boot_error\s*=\s*tostring\(err\s*or\s*"boot failed"\)/);
    assert.match(source, /smoke lvgl style ok/);
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
    assert.match(info, /capabilities = lvgl,file,timer,input/);
    assert.match(source, /FLUID_PENDANT_APP/);
    assert.match(source, /lv_canvas_create/);
    assert.match(source, /lv_canvas_draw_rect/);
    assert.match(source, /lv_label_create/);
    assert.match(source, /time_getlocal_fn/);
    assert.match(source, /tmr\.create/);
    assert.match(source, /APP\.init_viper_engine/);
    assert.match(source, /HAS_VIPER_ACCEL/);
    assert.match(source, /TICK_MS\s*=\s*HAS_VIPER_ACCEL\s+and\s+25\s+or\s+50/);
    assert.match(source, /NUMBER_OF_PARTICLES\s*=\s*HAS_VIPER_ACCEL\s+and\s+220\s+or\s+120/);
    assert.match(source, /GRID_ITER\s*=\s*HAS_VIPER_ACCEL\s+and\s+6\s+or\s+3/);
    assert.match(source, /runtime_imu/);
    assert.match(source, /pcall_fn\(runtime_imu\.on/);
    assert.match(source, /if ok then\s+APP\.imu_state\.registered = true/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /metrics_generation/);
    assert.match(source, /imu_events/);
    assert.match(source, /tick_max_ms/);
    assert.match(source, /draw_avg_ms/);
    assert.doesNotMatch(source, /draw_cell_span/);
    assert.doesNotMatch(source, /queue_span/);
    assert.doesNotMatch(source, /draw_spans/);
    assert.doesNotMatch(source, /app_on_fn/);
    assert.doesNotMatch(source, /app_on_fn,\s*"imu"/);
    assert.ok(font.length > 0);
  });

  it("ships BTC as a minimal upstream network price migration", () => {
    const info = readRequired(btcInfoPath);
    const source = readRequired(btcSourcePath);

    assert.match(info, /name = BTC/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,network,timer,file/);
    assert.match(source, /BTC_APP/);
    assert.match(source, /SYMBOL\s*=\s*"BTCUSDT"/);
    assert.match(source, /data-api\.binance\.vision/);
    assert.match(source, /CONFIG_PATH\s*=\s*"config\.json"/);
    assert.match(source, /local function load_config\(\)/);
    assert.match(source, /cfg\.base_url/);
    assert.match(source, /cfg\.symbol/);
    assert.match(source, /http\.get/);
    assert.match(source, /json\.decode/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /network_attempts/);
    assert.match(source, /price_ready/);
    assert.match(source, /tmr\.create/);
    assert.doesNotMatch(source, /lv_canvas_create/);
  });

  it("ships Settings as a minimal upstream device settings migration", () => {
    const info = readRequired(settingsInfoPath);
    const source = readRequired(settingsSourcePath);

    assert.match(info, /name = Settings/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,timer,input,file/);
    assert.match(source, /SETTINGS_APP/);
    assert.match(source, /selected_index/);
    assert.match(source, /brightness/);
    assert.match(source, /key\.on/);
    assert.match(source, /key\.off/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /settings_ready/);
    assert.match(source, /selection_changes/);
    assert.match(source, /tmr\.create/);
    assert.doesNotMatch(source, /wifi\.mode/);
    assert.doesNotMatch(source, /gamepad\.start/);
    assert.doesNotMatch(source, /app\.set_webui/);
  });

  it("ships HW Monitor as a minimal upstream host metrics migration", () => {
    const info = readRequired(hwmonInfoPath);
    const source = readRequired(hwmonSourcePath);
    const config = readRequired(hwmonConfigPath);

    assert.match(info, /name = HW Monitor/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,network,timer,file/);
    assert.match(source, /HWMON_APP/);
    assert.match(source, /CONFIG_PATH\s*=\s*"config\.json"/);
    assert.match(source, /DEFAULT_STATE_URL/);
    assert.match(source, /local function load_config\(\)/);
    assert.match(source, /http\.get/);
    assert.match(source, /json\.decode/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /hwmon_ready/);
    assert.match(source, /fetch_attempts/);
    assert.match(source, /cpu_usage/);
    assert.match(source, /gpu_usage/);
    assert.match(source, /mem_usage/);
    assert.match(source, /tmr\.create/);
    assert.match(source, /app\.exiting\(\)/);
    assert.match(config, /"state_url"/);
    assert.doesNotMatch(source, /httpd\./);
    assert.doesNotMatch(source, /app\.set_webui/);
    assert.doesNotMatch(source, /app\.route_base/);
  });

  it("ships Spectrum as a minimal real-audio visualizer migration", () => {
    const info = readRequired(spectrumInfoPath);
    const source = readRequired(spectrumSourcePath);

    assert.match(info, /name = Spectrum/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,timer,input,file,audio/);
    assert.match(source, /SPECTRUM_APP/);
    assert.match(source, /audio_started/);
    assert.match(source, /audio_reads/);
    assert.match(source, /band_levels/);
    assert.match(source, /band_frequencies/);
    assert.match(source, /goertzel_power/);
    assert.match(source, /FRAME_BYTES\s*=\s*512/);
    assert.match(source, /WINDOW_SAMPLES\s*=\s*128/);
    assert.match(source, /i2s\.start/);
    assert.match(source, /i2s\.read/);
    assert.match(source, /TICK_MS\s*=\s*500/);
    assert.doesNotMatch(source, /TICK_MS\s*=\s*40/);
    assert.match(source, /RENDER_EVERY_FRAMES\s*=\s*2/);
    assert.match(source, /I2S_READ_TIMEOUT_MS\s*=\s*0/);
    assert.doesNotMatch(source, /I2S_READ_TIMEOUT_MS\s*=\s*20/);
    assert.match(source, /app and app\.exiting and app\.exiting\(\)/);
    assert.match(source, /lv_obj_create/);
    assert.match(source, /APP\.ui\.spectrum/);
    assert.match(source, /local function bar_text\(\)/);
    assert.doesNotMatch(source, /init_bars_step/);
    assert.doesNotMatch(source, /APP\.bars/);
    assert.doesNotMatch(source, /APP\.bar_x/);
    assert.doesNotMatch(source, /lv_obj_set_height/);
    assert.match(source, /lv_obj_set_pos/);
    assert.doesNotMatch(source, /lv_obj_get_x/);
    assert.match(source, /key\.on/);
    assert.match(source, /key\.off/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /audio_ready/);
    assert.match(source, /timer_error/);
    assert.match(source, /tick_phase/);
    assert.match(source, /tick_count/);
    assert.match(source, /local function tick_frame\(\)/);
    assert.match(source, /pcall\(tick_frame\)/);
    assert.match(source, /frames/);
    assert.match(source, /mode_changes/);
    assert.match(source, /tmr\.create/);
    assert.match(source, /app\.exiting\(\)/);
    assert.doesNotMatch(source, /spectrum\./);
    assert.doesNotMatch(source, /synthetic_bins/);
    assert.doesNotMatch(source, /lv_canvas_create/);
    assert.doesNotMatch(source, /lv_canvas_draw_line/);
    assert.doesNotMatch(source, /lv_canvas_draw_polyline/);
  });

  it("ships Audio Loopback as an on-device record and playback diagnostic", () => {
    const info = readRequired(audioLoopbackInfoPath);
    const source = readRequired(audioLoopbackSourcePath);

    assert.match(info, /name = Audio Loopback/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,timer,input,file,audio/);
    assert.match(source, /AUDIO_LOOPBACK_APP/);
    assert.match(source, /app\.set_home_exit\(false\)/);
    assert.match(source, /key\.on\(key\.HOME/);
    assert.match(source, /CAPTURE_MODES/);
    assert.match(source, /name\s*=\s*"tdm48"/);
    assert.match(source, /name\s*=\s*"tdm16"/);
    assert.match(source, /rate\s*=\s*48000/);
    assert.match(source, /rate\s*=\s*16000/);
    assert.match(source, /PLAYBACK_RATE\s*=\s*16000/);
    assert.match(source, /RECORD_SECONDS\s*=\s*2/);
    assert.match(source, /CAPTURE_PATH\s*=\s*"capture\.raw"/);
    assert.match(source, /BITS\s*=\s*16/);
    assert.match(source, /CHANNELS\s*=\s*2/);
    assert.match(source, /CHUNK_BYTES\s*=\s*4096/);
    assert.match(source, /IO_TIMEOUT_MS\s*=\s*1000/);
    assert.match(source, /PLAYBACK_GAIN\s*=\s*3/);
    assert.match(source, /record_elapsed_ms/);
    assert.match(source, /effective_sample_rate/);
    assert.match(source, /read_ms/);
    assert.match(source, /write_ms/);
    assert.match(source, /expected_record_bytes/);
    assert.match(source, /i2s\.record_file\(APP\.I2S_ID,\s*APP\.CAPTURE_PATH/);
    assert.match(source, /i2s\.play_file\(APP\.I2S_ID,\s*APP\.CAPTURE_PATH/);
    assert.match(source, /tdm\s*=\s*true,[\s\S]*buffer_count\s*=\s*2,[\s\S]*buffer_len\s*=\s*128/);
    assert.match(source, /target_bytes\s*=\s*capture_target_bytes\(capture_mode\)/);
    assert.match(source, /PLAYBACK_PROFILES/);
    assert.match(source, /tdm48-left/);
    assert.match(source, /tdm48-right/);
    assert.match(source, /tdm48-mix/);
    assert.match(source, /tdm16-left/);
    assert.match(source, /tdm16-right/);
    assert.match(source, /tdm16-mix/);
    assert.ok(
      source.indexOf("tdm48-left") < source.indexOf("tdm16-left"),
      "Audio Loopback should test 48 kHz TDM before 16 kHz TDM"
    );
    assert.match(source, /select\s*=\s*profile\.channel/);
    assert.match(source, /source_rate\s*=\s*S\.effective_sample_rate > 0 and S\.effective_sample_rate or capture_mode\.rate/);
    assert.match(source, /channel\s*=\s*i2s\.CHANNEL_STEREO/);
    assert.match(source, /MAX_RECORD_BYTES\s*=\s*384000/);
    assert.match(source, /peak_abs/);
    assert.match(source, /rms_abs/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /Short HOME: native record\/play profile/);
    assert.doesNotMatch(source, /i2s\.read\(/);
    assert.doesNotMatch(source, /i2s\.write\(/);
    assert.doesNotMatch(source, /i2s\.start\(/);
    assert.doesNotMatch(source, /tmr\.create\(\)/);
    assert.doesNotMatch(source, /http\./);
  });

  it("ships Codex Buddy as a deterministic desktop bridge migration", () => {
    const info = readRequired(codexBuddyInfoPath);
    const source = readRequired(codexBuddySourcePath);
    const config = readRequired(codexBuddyConfigPath);
    const manifest = readRequired(codexBuddyAssetManifestPath);
    const requiredGifs = [
      "sleep.gif",
      "idle_0.gif",
      "busy.gif",
      "attention.gif",
      "celebrate.gif",
      "dizzy.gif",
      "heart.gif",
    ];

    assert.match(info, /name = Codex Buddy/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,network,timer,input,file/);
    assert.match(source, /CODEX_BUDDY_APP/);
    assert.match(source, /APP_DIR\s*=\s*"\/sd\/apps\/codex_buddy"/);
    assert.match(source, /CONFIG_PATH\s*=\s*"config\.json"/);
    assert.match(source, /DEFAULT_BRIDGE_URL/);
    assert.match(source, /local function load_config\(\)/);
    assert.match(source, /http\.get\(state_url\(\)/);
    assert.match(source, /http\.post\(permission_url\(\)/);
    assert.match(source, /json\.decode/);
    assert.match(source, /lv_gif_create/);
    assert.match(source, /lv_gif_set_src/);
    assert.match(source, /assets\/bufo/);
    assert.match(source, /key\.on/);
    assert.match(source, /key\.off/);
    assert.match(source, /app\.set_home_exit\(false\)/);
    assert.match(source, /app\.set_home_exit\(true\)/);
    assert.match(source, /tmr\.create/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /buddy_ready/);
    assert.match(source, /online/);
    assert.match(source, /polls/);
    assert.match(source, /last_http_code/);
    assert.match(source, /pet_state/);
    assert.match(source, /gif_visible/);
    assert.match(source, /gif_state/);
    assert.match(source, /prompt_seen/);
    assert.match(source, /permission_posts/);
    assert.match(source, /app\.exiting\(\)/);
    assert.match(config, /"bridge_url"/);
    for (const gif of requiredGifs) {
      assert.match(manifest, new RegExp(`"${gif}"`));
      assert.equal(existsSync(join(repoRoot, "apps/codex_buddy/assets/bufo", gif)), true, `${gif} should exist`);
    }
    assert.doesNotMatch(source, /httpd\./);
    assert.doesNotMatch(source, /lv_canvas_create/);
  });

  it("ships Videos as a minimal GIF playlist migration", () => {
    const info = readRequired(videosInfoPath);
    const source = readRequired(videosSourcePath);

    assert.match(info, /name = Videos/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,timer,input,file/);
    assert.match(source, /VIDEOS_APP/);
    assert.match(source, /APP_DIR\s*=\s*"\/sd\/apps\/videos"/);
    assert.match(source, /VIDEO_DIR\s*=\s*"videos"/);
    assert.match(source, /file\.listdir/);
    assert.match(source, /lv_gif_create/);
    assert.match(source, /lv_gif_set_src/);
    assert.match(source, /key\.on/);
    assert.match(source, /key\.off/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /videos_ready/);
    assert.match(source, /gif_count/);
    assert.match(source, /selection_changes/);
    assert.match(source, /tmr\.create/);
    assert.match(source, /app\.exiting\(\)/);
    assert.doesNotMatch(source, /http\./);
    assert.doesNotMatch(source, /app\.set_webui/);
  });

  it("ships Photos as a minimal image playlist migration", () => {
    const info = readRequired(photosInfoPath);
    const source = readRequired(photosSourcePath);

    assert.match(info, /name = Photos/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,timer,input,file,webui/);
    assert.match(info, /allow_webui = true/);
    assert.match(source, /PHOTOS_APP/);
    assert.match(source, /APP_DIR\s*=\s*"\/sd\/apps\/photos"/);
    assert.match(source, /PHOTO_DIR\s*=\s*"photos"/);
    assert.match(source, /CAMERA_PHOTO_DIR\s*=\s*"\/sd\/data\/camera\/photos"/);
    assert.match(source, /file\.listdir/);
    assert.match(source, /scan_images_from\(APP\.CAMERA_PHOTO_DIR,\s*"Camera"\)/);
    assert.match(source, /scan_images_from\(APP\.PHOTO_DIR,\s*"Photos"\)/);
    assert.match(source, /entry\.src/);
    assert.match(source, /S:\/data\/camera\/photos\//);
    assert.match(source, /lv_img_create/);
    assert.match(source, /lv_img_set_src/);
    assert.match(source, /CAMERA_PHOTO_W\s*=\s*160/);
    assert.match(source, /CAMERA_PHOTO_H\s*=\s*120/);
    assert.match(source, /center_image_for_entry\(entry\)/);
    assert.match(source, /lv_obj_set_pos\(APP\.ui\.image,\s*x,\s*y\)/);
    assert.match(source, /lv_obj_set_size\(APP\.ui\.image,\s*w,\s*h\)/);
    assert.doesNotMatch(source, /lv_obj_set_pos\(APP\.ui\.image,\s*96,\s*54\)/);
    assert.doesNotMatch(source, /lv_obj_set_size\(APP\.ui\.image,\s*128,\s*128\)/);
    assert.match(source, /key\.on/);
    assert.match(source, /key\.off/);
    assert.match(source, /local function delete_current_camera_photo\(\)/);
    assert.match(luaFunctionBody(source, "delete_current_camera_photo"), /entry\.source ~= "Camera"/);
    assert.match(luaFunctionBody(source, "delete_current_camera_photo"), /file\.remove\(APP\.CAMERA_PHOTO_DIR \.\. "\/" \.\. entry\.name\)/);
    assert.match(luaFunctionBody(source, "delete_current_camera_photo"), /APP\.images = scan_images\(\)/);
    assert.match(source, /local function route_delete_current\(_req\)/);
    assert.match(luaFunctionBody(source, "route_delete_current"), /delete_current_camera_photo\(\)/);
    assert.match(source, /app\.route\("\/delete_current",\s*dispatch_route\)/);
    assert.match(source, /app\.set_home_exit\(false\)/);
    assert.match(source, /app\.set_home_exit\(true\)/);
    assert.match(source, /metrics\.json/);
    assert.match(luaFunctionBody(source, "write_metrics"), /file\.putcontents\(APP\.METRICS_PATH,\s*body\)/);
    assert.match(luaFunctionBody(source, "write_metrics"), /file\.write\(APP\.METRICS_PATH,\s*body\)/);
    assert.match(source, /photos_ready/);
    assert.match(source, /image_count/);
    assert.match(source, /selection_changes/);
    assert.match(source, /tmr\.create/);
    assert.match(source, /app\.exiting\(\)/);
    assert.doesNotMatch(source, /lv_canvas_draw_img/);
    assert.doesNotMatch(source, /http\./);
    assert.match(source, /app\.set_webui\(true\)/);
  });

  it("ships Plane as a minimal sprite game migration", () => {
    const info = readRequired(planeInfoPath);
    const source = readRequired(planeSourcePath);

    assert.match(info, /name = Plane/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,timer,input,file/);
    assert.match(source, /PLANE_APP/);
    assert.match(source, /APP_DIR\s*=\s*"\/sd\/apps\/plane"/);
    assert.match(source, /ASSET_DIR\s*=\s*"assets"/);
    assert.match(source, /lv_img_create/);
    assert.match(source, /lv_img_set_src/);
    assert.match(source, /key\.on/);
    assert.match(source, /key\.off/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /plane_ready/);
    assert.match(source, /frames/);
    assert.match(source, /shots/);
    assert.match(source, /player_x/);
    assert.match(source, /tmr\.create/);
    assert.match(source, /app\.exiting\(\)/);
    assert.doesNotMatch(source, /app\.on\(["']imu["']/);
    assert.doesNotMatch(source, /lv_canvas_draw_img/);
    assert.doesNotMatch(source, /http\./);
    assert.doesNotMatch(source, /app\.set_webui/);
  });

  it("ships LV Benchmark as a minimal runtime benchmark migration", () => {
    const info = readRequired(lvBenchmarkInfoPath);
    const source = readRequired(lvBenchmarkSourcePath);

    assert.match(info, /name = LV Benchmark/);
    assert.match(info, /entry = main\.lua/);
    assert.match(info, /capabilities = lvgl,timer,file/);
    assert.match(source, /LV_BENCHMARK_APP/);
    assert.match(source, /APP_DIR\s*=\s*"\/sd\/apps\/lv-benchmark"/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /benchmark_ready/);
    assert.match(source, /frames/);
    assert.match(source, /scene_count/);
    assert.match(source, /rects/);
    assert.match(source, /labels/);
    assert.match(source, /arcs/);
    assert.match(source, /lv_obj_create/);
    assert.match(source, /lv_label_create/);
    assert.match(source, /lv_arc_create/);
    assert.match(source, /lv_arc_set_value/);
    assert.match(source, /lv_img_create/);
    assert.match(source, /lv_img_set_angle/);
    assert.match(source, /tmr\.create/);
    assert.match(source, /app\.exiting\(\)/);
    assert.doesNotMatch(source, /lv_line_create/);
    assert.doesNotMatch(source, /lv_table_create/);
    assert.doesNotMatch(source, /lv_obj_set_flex_flow/);
    assert.doesNotMatch(source, /lv_lvgl_monitor_/);
  });

  it("ships Mini Claw as a WebUI agent service migration", () => {
    const info = readRequired(miniClawInfoPath);
    const source = readRequired(miniClawSourcePath);

    assert.match(info, /name\s*=\s*Mini Claw/);
    assert.match(info, /kind\s*=\s*service/);
    assert.match(info, /allow_webui\s*=\s*true/);
    assert.match(source, /MINI_CLAW_APP/);
    assert.match(source, /app\.route_base\(\)/);
    assert.match(source, /app\.set_webui\(true\)/);
    assert.match(source, /app\.route\(["']\/["']/);
    assert.match(source, /app\.route\(["']\/api["']/);
    assert.match(source, /route_api/);
    assert.match(source, /route_index/);
    assert.match(source, /sys\.setbrightness/);
    assert.match(source, /http\.post/);
    assert.match(source, /http\.get/);
    assert.match(source, /tmr\.create\(\)/);
    assert.match(source, /:alarm\(APP\.config\.wechat_poll_ms\s+or\s+3500,\s*tmr\.ALARM_AUTO,/);
    assert.doesNotMatch(source, /:alarm\(APP\.config\.wechat_poll_ms\s+or\s+3500,\s*1,/);
    assert.doesNotMatch(source, /\bhttpd\./);
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
    assert.match(info, /capabilities\s*=\s*lvgl,timer,module,native,file/);
    assert.match(source, /local\s+nes\s*=\s*require\(["']nes["']\)/);
    assert.match(source, /nes\.state\(\)/);
    assert.match(source, /nes\.start\(/);
    assert.match(source, /nes\.read_audio/);
    assert.match(source, /nes\.input\.set_mask/);
    assert.match(source, /\/sdcard\/apps\/smoke_nes\/roms\/smoke\.nes/);
    assert.match(source, /fps\s*=\s*60/);
    assert.match(source, /task_stack\s*=\s*12288/);
    assert.match(source, /task_priority\s*=\s*3/);
    assert.match(source, /task_core\s*=\s*-1/);
    assert.match(source, /transfer_rows\s*=\s*16/);
    assert.match(source, /audio\s*=\s*\{/);
    assert.match(source, /enabled\s*=\s*true/);
    assert.match(source, /lua_fallback\s*=\s*false/);
    assert.match(source, /sample_rate\s*=\s*22050/);
    assert.match(source, /channels\s*=\s*1/);
    assert.match(source, /bits_per_sample\s*=\s*16/);
    assert.match(source, /queue_bytes\s*=\s*32768/);
    assert.doesNotMatch(source, /target_fps\s*=\s*60/);
    assert.doesNotMatch(source, /task_stack_bytes\s*=\s*6144/);
    assert.doesNotMatch(source, /audio_task_stack_bytes\s*=\s*8192/);
    assert.doesNotMatch(source, /audio_enabled\s*=\s*true/);
    assert.doesNotMatch(source, /audio_lua_fallback\s*=\s*false/);
    assert.match(source, /metrics_timer/);
    assert.match(source, /tmr\.ALARM_AUTO/);
    assert.match(source, /alarm\(1000,\s*tmr\.ALARM_AUTO/);
    assert.match(source, /metrics\.json/);
    assert.match(source, /rom_present/);
    assert.match(source, /started/);
    assert.match(source, /rendered_frames/);
    assert.match(source, /host_gamepad_active/);
    assert.match(source, /host_gamepad_mask/);
    assert.match(source, /running_state and running_state\.host_gamepad_mask/);
    assert.match(source, /core_frames/);
    assert.match(source, /audio_bytes/);
    assert.match(source, /audio_written_bytes/);
    assert.match(source, /local\s+pcm_bytes\s*=\s*pcm\s+and\s+#pcm\s+or\s+0/);
    assert.match(source, /local\s+audio_bytes\s*=\s*pcm_bytes\s*>\s*0\s*and\s*pcm_bytes\s*or\s*audio_written_bytes\s*or\s*audio_queued_bytes\s*or\s*0/);
    assert.doesNotMatch(source, /local\s+audio_bytes\s*=\s*pcm\s+and\s+#pcm\s+or\s*audio_written_bytes/);
    assert.match(source, /audio_apu_task_present/);
    assert.match(source, /audio_apu_task_started/);
    assert.match(source, /audio_apu_task_ret/);
    assert.match(source, /audio_apu_ticks/);
    assert.match(source, /audio_sink_calls/);
    assert.match(source, /audio_queued_bytes/);
    assert.match(source, /core_last_error/);
    assert.match(source, /open rom failed/);
    assert.match(source, /retry_start_timer/);
    assert.match(source, /tmr\.ALARM_SINGLE/);
    assert.match(source, /try_start\(1\)/);
    assert.match(readRequired(join(repoRoot, "tools/nes-smoke/index.mjs")), /--require-host-gamepad-mask/);
    assert.match(readRequired(join(repoRoot, "tools/nes-smoke/index.mjs")), /\/input\/gamepad/);
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
    assert.match(info, /capabilities\s*=\s*lvgl,timer,input,file/);
    assert.match(source, /app\.list\(\)/);
    assert.match(source, /app\.rescan\(\)/);
    assert.match(source, /app\.current\(\)/);
    assert.match(source, /app\.exiting\(\)/);
    assert.match(source, /type\(app\.exit\)\s*==\s*["']function["']/);
    assert.match(source, /type\(app\.launch\)\s*==\s*["']function["']/);
    assert.match(source, /type\(app\.set_home_exit\)\s*==\s*["']function["']/);
    assert.match(source, /app\.set_home_exit\(false\)/);
    assert.match(source, /app\.set_home_exit\(true\)/);
    assert.match(source, /type\(app\.route_base\)\s*==\s*["']function["']/);
    assert.match(source, /type\(app\.set_webui\)\s*==\s*["']function["']/);
    assert.match(source, /type\(app\.route\)\s*==\s*["']function["']/);
    assert.match(source, /app\.set_webui\(true\)/);
    assert.match(source, /app\.route\(["']\/api\/ping["']/);
    assert.match(source, /webui_requests/);
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
