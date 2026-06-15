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
const luaLvglWidgetsSourcePath = join(firmwareRoot, "main/lua_lvgl_widgets.c");
const luaFileSourcePath = join(firmwareRoot, "main/lua_file.c");
const luaFileHeaderPath = join(firmwareRoot, "main/lua_file.h");
const luaHttpSourcePath = join(firmwareRoot, "main/lua_http.c");
const luaHttpHeaderPath = join(firmwareRoot, "main/lua_http.h");
const luaSjsonSourcePath = join(firmwareRoot, "main/lua_sjson.c");
const luaSjsonHeaderPath = join(firmwareRoot, "main/lua_sjson.h");
const luaTmrSourcePath = join(firmwareRoot, "main/lua_tmr.c");
const luaTmrHeaderPath = join(firmwareRoot, "main/lua_tmr.h");
const luaTimeSourcePath = join(firmwareRoot, "main/lua_time.c");
const luaTimeHeaderPath = join(firmwareRoot, "main/lua_time.h");
const luaWifiSourcePath = join(firmwareRoot, "main/lua_wifi.c");
const luaWifiHeaderPath = join(firmwareRoot, "main/lua_wifi.h");
const runtimeWifiSourcePath = join(firmwareRoot, "main/runtime_wifi.c");
const runtimeWifiHeaderPath = join(firmwareRoot, "main/runtime_wifi.h");
const cmakePath = join(firmwareRoot, "main/CMakeLists.txt");
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
const smokeNetworkInfoPath = join(repoRoot, "apps/smoke_network/app.info");
const smokeNetworkSourcePath = join(repoRoot, "apps/smoke_network/main.lua");
const smokeNetworkConfigPath = join(repoRoot, "apps/smoke_network/wifi.example.json");
const smokeFailInfoPath = join(repoRoot, "apps/smoke_fail/app.info");
const smokeFailSourcePath = join(repoRoot, "apps/smoke_fail/main.lua");
const smokeTimerInfoPath = join(repoRoot, "apps/smoke_timer/app.info");
const smokeTimerSourcePath = join(repoRoot, "apps/smoke_timer/main.lua");

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

  it("does not format SD cards during mount", () => {
    const source = readRequired(boardSourcePath);

    assert.match(source, /\.format_if_mount_failed\s*=\s*false/);
  });

  it("scans the board app directory", () => {
    const header = readRequired(registryHeaderPath);
    const source = readRequired(registrySourcePath);

    assert.match(header, /VB_APPS_PATH\s+"\/sdcard\/apps"/);
    assert.match(header, /VB_APP_REGISTRY_MAX_APPS/);
    assert.match(header, /vb_app_registry_entry_t/);
    assert.match(header, /apps\[/);
    assert.match(source, /VB_APPS_PATH/);
    assert.match(source, /app\.info/);
    assert.match(source, /stat\(app_path,\s*&st\)/);
    assert.match(source, /skip app entry that is missing/);
    assert.match(source, /result->apps/);
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
    assert.match(source, /status_handler/);
    assert.match(source, /apps_handler/);
    assert.match(source, /rescan_handler/);
    assert.match(source, /launch_handler/);
    assert.match(source, /stop_handler/);
    assert.match(source, /\/status/);
    assert.match(source, /\/apps/);
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
    assert.match(main, /static\s+vb_app_registry_result_t\s+s_apps/);
    assert.match(main, /static\s+vb_install_service_context_t\s+s_install_context/);
    assert.match(main, /vb_install_service_start\(&s_install_context\)/);
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
    assert.match(runner, /xTaskCreatePinnedToCore/);
    assert.match(runner, /vb_app_registry_entry_t/);
    assert.match(runner, /entry_to_registry/);
    assert.match(runner, /s_runner_state/);
    assert.match(runner, /stop_requested/);
    assert.match(runner, /vb_lua_tmr_set_stop_flag/);
    assert.match(runner, /luaL_newstate/);
    assert.match(runner, /luaL_openlibs/);
    assert.match(runner, /luaL_dofile/);
    assert.match(runner, /Lua app ok/);
    assert.doesNotMatch(main, /vb_app_runner_run\(&s_apps,\s*&run\)/);
    assert.match(main, /vb_launcher_ui_show\(&s_apps,\s*scan_err\)/);
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
  });

  it("exposes app runner lifecycle state through HTTP status", () => {
    const source = readRequired(installServiceSourcePath);

    assert.match(source, /vb_app_runner_current_state_name\(\)/);
    assert.match(source, /\\"state\\":\\"%s\\"/);
    assert.match(source, /\\"running\\":%s/);
    assert.match(source, /\\"current_app\\":\\"%s\\"/);
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
    assert.match(source, /vb_app_runner_wait_stopped\(1500\)/);
    assert.match(source, /vb_app_runner_launch_async/);
    assert.match(main, /#include "launcher_ui\.h"/);
    assert.match(main, /vb_launcher_ui_show\(&s_apps,\s*scan_err\)/);
    assert.doesNotMatch(main, /vb_app_runner_run\(&s_apps,\s*&run\)/);
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
    assert.match(source, /luaL_ref/);
    assert.match(source, /lua_rawgeti/);
    assert.match(source, /lua_pcall/);
    assert.match(runner, /vb_lua_tmr_register\(L,\s*&runtime\.tmr\)/);
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
    assert.match(sjsonSource, /cJSON_Parse/);
    assert.match(sjsonSource, /cJSON_PrintUnformatted/);
    assert.match(timeHeader, /vb_lua_time_register/);
    assert.match(timeSource, /time_get/);
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
    assert.match(source, /vb_lua_lvgl_widgets_register/);
    assert.match(source, /vb_lua_lvgl_fs_register/);
    assert.match(source, /vb_lua_lvgl_store_object/);
    assert.match(internal, /vb_lua_lvgl_check_object_id/);
    assert.match(internal, /vb_lua_lvgl_resolve_object/);
    assert.match(internal, /vb_lua_lvgl_store_object/);
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
    assert.match(widgetSource, /lv_obj_set_size/);
    assert.match(widgetSource, /lv_obj_set_width/);
    assert.match(widgetSource, /lv_obj_set_height/);
    assert.match(widgetSource, /lv_obj_set_pos/);
    assert.match(widgetSource, /lv_obj_set_x/);
    assert.match(widgetSource, /lv_obj_set_y/);
    assert.match(widgetSource, /lv_obj_set_style_bg_color/);
    assert.match(widgetSource, /lv_obj_set_style_text_color/);
    assert.match(widgetSource, /lv_obj_set_style_radius/);
    assert.match(widgetSource, /lv_obj_set_style_pad_all/);
    assert.match(widgetSource, /lv_obj_set_style_border_width/);
    assert.match(widgetSource, /lv_obj_set_style_border_color/);
    assert.match(widgetSource, /lv_label_create/);
    assert.match(widgetSource, /lv_label_set_text/);
    assert.match(widgetSource, /lv_label_set_long_mode/);
    assert.match(widgetSource, /lv_img_create/);
    assert.match(widgetSource, /lv_img_set_src/);
    assert.match(widgetSource, /lv_btn_create/);
    assert.match(widgetSource, /lv_bar_create/);
    assert.match(widgetSource, /lv_bar_set_value/);
    assert.match(widgetSource, /lv_bar_set_range/);
    assert.match(widgetSource, /lv_obj_add_flag/);
    assert.match(widgetSource, /lv_obj_clear_flag/);
    assert.match(widgetSource, /lv_obj_align/);
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
