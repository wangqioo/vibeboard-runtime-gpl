# VibeBoard Runtime GPL 开发计划

更新时间：2026-07-03

## 一句话目标

把 ESP32-S3 小屏开发从“每个应用都要写固件、编译、烧录”改成：

```text
一次烧录稳定 Runtime 固件
  -> AI 生成 Lua/LVGL App 包
  -> 工具验证和打包
  -> 复制或上传到 SD 卡
  -> Runtime 扫描并执行 App
```

普通 App 迭代不重新烧录；底层驱动、Lua 模块、LVGL 绑定、上传服务、Native ABI 变化仍然需要固件开发和重新烧录。

## 当前真实阶段

当前项目已经进入 **真机最小 Runtime 闭环已跑通** 阶段。

已经不是单纯的文件整理项目。当前已经在立创 ESP32-S3 小屏设备上验证：

- ESP32-S3 启动、PSRAM、LCD、背光、LVGL、SD 卡挂载；
- 从 `/sdcard/apps` 扫描 App；
- 读取 `app.info`；
- 执行 SD 卡上的 `main.lua`；
- Lua `print()` 输出到 ESP-IDF 串口日志；
- Lua 调用最小 LVGL 绑定画 UI；
- `set_interval(ms, callback)` 驱动简单动态刷新；
- `apps/smoke_ui` 天气卡片已用旧版 `set_interval` loop 真机显示，城市为 `Shanghai`，`Updated 00s` 标签能刷新。
- NodeMCU 风格 `tmr` 已实现，并通过 `apps/smoke_timer` 在真机串口验证自动定时器、单次定时器、状态读取、注销、timer loop idle 和 `Lua app ok`。
- `file` 模块、LVGL `S:` 资源路径、定位、flags、label long mode 已通过 `apps/smoke_file` 和 `apps/smoke_assets` 真机串口验证。
- BMP 解码、按钮、进度条和动画值更新已通过 `apps/smoke_visual` 上板串口验证；BMP 文件路径解析成功，进度值持续刷新。BMP 视觉显示是否正确仍需肉眼确认屏幕。
- WiFi、HTTP、JSON、NTP/time 最小 Lua 模块已实现并完成真机 smoke；`apps/smoke_network` 已读取 SD 卡 `wifi.json`，连接 `1-306`，拿到 `192.168.1.32`，并完成 HTTP 200。
- 最小 HTTP 安装服务已实现并上板验证：`POST /install?app=<id>&path=<relative>` 可以把文件写入 `/sdcard/apps/<id>/`；`GET /status`、`GET /apps`、`POST /rescan` 已验证。
- 免拔 SD 的上传和远程启动闭环已跑通：`npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_visual_remote` 上传并确认 App，`POST /launch?app=smoke_visual_remote` 返回 `200 OK`，串口确认从 `/sdcard/apps/smoke_visual_remote` 启动并持续刷新进度。
- 原生设备 Launcher 已真机验证：开机进入 `VibeBoard Apps` 列表，不再自动运行第一个 App；触摸点击可启动 App，BOOT 短按可切换选中项，BOOT 长按可启动选中 App。
- 受控 App stop/switch 已真机验证：远程 `/launch` 和设备 Launcher 都复用同一条 runner 生命周期，切换时会请求旧 App 停止并等待退出。
- Phase 5B Launcher 收尾已真机验证：屏幕 Stop/Refresh、停止后回到 Launcher、失败后回到 Launcher、屏幕错误提示和 BOOT 长按停止路径都已实现。
- `/status.state` 生命周期状态已真机验证：`idle`、`running`、受控 stop 回到 `idle`、故意失败后的 `failed`、以及失败后重新启动 `smoke_network` 恢复到 `idle`。
- `apps/smoke_fail` 已加入仓库并上板验证，可稳定触发 Lua error，用于失败状态和错误恢复测试。
- App 启动后再按 BOOT 造成 stale LVGL pointer 的崩溃已修复并真机验证；Launcher 交出屏幕后会忽略 BOOT 短按/长按，不再触碰旧控件。
- App registry 会过滤缺少入口文件的 App；例如 `raw_upload/main.lua` 不存在时不会进入可启动列表。
- 网络运行时让固件超过默认 1MB app 分区，当前已切换到自定义 4MB factory app 分区。
- Lua App manager 的 `app.list()`、`app.rescan()` 和 `app.launch()` 已完成真机 handoff 验证：`smoke_app_manager` 能看到 App 列表，并通过软件 HOME 事件交接到 `smoke_key`。2026-06-22 已新增 `npm run app-manager:smoke`，可自动启动 `smoke_app_manager` 并轮询到 `current_app=smoke_key`。
- Lua `sys` 模块已完成首个 Runtime 版本/背光桥切片：`sys.version()` 返回共享的 `runtime_version.h` 常量，`sys.getbrightness()` / `sys.setbrightness(level)` 连接板级背光 helper。当前证据是 `npm run test:firmware-static -- --test-name-pattern "sys Lua module"`、ESP-IDF build，以及 `mini_claw` WebUI POST brightness board smoke 返回 `{"ok":true,"level":30}`；屏幕亮度肉眼/相机变化仍需后续物理 QA。
- Lua VM 已改为 PSRAM allocator，Lua App 运行期间 `/status` 和 `/stop` 仍可响应；这修复了 handoff 后 HTTP 连接被 reset 的内存压力问题。
- Lua 脚本在创建 Lua task 前预读到 PSRAM，避免 Lua task 内直接 SD 文件 IO 导致的崩溃/读失败路径。
- 2026-06-29 启动 post-v0.1 性能基线首个切片：Lua HTTP callback dispatch 已改为 `lua_pcall` 保护路径，但 HTTP 请求执行仍按本切片设计保持同步；`weather`、`photos`、`voice_ai` 已在各自 `metrics.json` 中加入 `perf_first_paint_ms`、`perf_ready_ms`、`perf_resource_ms`、`perf_http_ms`、`perf_timer_max_ms`、`perf_stop_requested` 和 `perf_last_error`。本轮是可比较指标基线，不代表启动/动画卡顿已经解决；下一步仍是异步 HTTP、资源调度和真机指标对比。
- 2026-07-03 Camera/Photos 用户闭环已进入当前基线：`apps/camera` 通过 Runtime camera 模块启动实时预览、拍照保存 BMP 到 `/sd/data/camera/photos`、提供 `/app/api` / `/app/photos` / `/app/capture`，并在设备端提供相册浏览/删除；standalone `apps/photos` 也已能显示同一批实拍 BMP。用户已确认拍照不再退回 Launcher，相机内相册和系统 Photos 应用均能正常显示照片。
- 2026-07-03 音频/Voice AI 当前基线也已从 mock/metrics 推进到物理路径：用户确认扬声器 440 Hz tone 可听，文件式录音/回放经过通道和采样率调校后可用，`apps/voice_ai` 已通过本机桌面 bridge 的 local Apple Speech 路径完成真实语音识别并把结果显示回设备。剩余不是基础链路，而是云 STT/LLM provider 凭证/端点、隐私日志、长时间音频 soak、生产级增益/噪声和弱网/无 bridge 体验。
- 2026-06-22 新增窄口 HTTP 输入 smoke hook：`POST /input/key?code=<LEFT|RIGHT|UP|DOWN|HOME|EXIT|START>&event=<SHORT|LONG_START|LONG_REPEAT|LONG_END>`。该接口只接受白名单名称，复用 `vb_app_runner_enqueue_key`，不直接调用 Lua。已重新构建并刷入 `/dev/cu.usbmodem112301`，板端验证空闲时返回 `400 no active app`，`smoke_key` 运行时 LEFT/HOME 注入返回 `ok`，HOME 通过正常 Lua runner 默认退出路径让 app 回到 idle。
- 2026-06-23 继续把输入 smoke 自动化做成可回归证据：`apps/smoke_key` 现在声明 `file` capability，写出 `metrics.json` 事件计数，并让 `key.repeat_start(key.UP, 250, 500)` 跨 timer tick 运行，避免立即 stop 导致 `LONG_REPEAT` 不稳定。`tools/input-smoke` 新增 active app 启动等待、`--metrics-polls` 和 `--require-event CODE:EVENT`，可直接要求 `UP:LONG_REPEAT` / `UP:LONG_END` 出现在 app metrics。第一次板端复测暴露旧版 `smoke_key` 卡在 `state=stopping`；修复后 app 在 `app.exiting()` 时停止 timer。重启 Runtime、上传新版 app 后，`npm run input:smoke -- --board http://192.168.1.32:8080 --app smoke_key --key LEFT:SHORT --expect-state running --delay-ms 500 --metrics-polls 14 --require-event UP:LONG_REPEAT --require-event UP:LONG_END` 返回 `input smoke ok: smoke_key 1 keys final=running metrics_count=9`，随后 `/stop` 返回 `{"ok":true,"stopped":true}`，最终 `/status` 回到 `state=idle`。
- 2026-06-22 修复一次真实回归：`vb_app_registry_scan()` 原本在确认 `/sdcard/apps` 可打开前会先清空传入 registry，短暂扫描失败会导致 `/status.app_count=0`、`/apps=[]`、上传 commit 失败。现在扫描先写入 PSRAM/heap 临时 registry，只有扫描成功后才覆盖缓存；同时避免把 32-entry registry 放到任务栈上导致启动重启。修复后已刷入 `/dev/cu.usbmodem111301`，`/status`、`/apps`、`/rescan`、stop 后 `/apps` 均保持 `app_count=31`。
- 2026-06-22 修复 `/launch` 冷启动响应超时：HTTP handler 现在只完成校验、必要 stop 和 launch job 排队，然后先返回 JSON；Lua 脚本预读和高优先级 app task 创建改由短延迟后台任务执行，避免重 app 启动抢占 HTTP 响应路径。修复后重新构建并刷入 `/dev/cu.usbmodem111301`，`npm run gamepad:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-delay-ms 3000 --metrics-polls 16 --interval-ms 500 --require-updates 2 --require-connected --require-xbox` 返回 `gamepad smoke ok`，不再出现 `/launch` 8 秒超时；停止后 `/status` 仍保持 `app_count=31,state=idle`。
- 2026-06-23 新增窄口 HTTP gamepad 注入 smoke hook：`POST /input/gamepad?...` 只把白名单 gamepad 状态排队到 active Lua runner，由 runner 的 input poll 在 Lua 线程内派发 `gamepad` 事件。`npm run gamepad:smoke` 新增 `--inject-gamepad`、`--inject-buttons`、`--inject-address`、`--inject-lx/--inject-ly` 和 `--inject-dpad-up`。本地先确认 RED：工具不识别 `--inject-gamepad` 且不会调用 `/input/gamepad`；实现后 `npm run test:gamepad-smoke`、`npm run test:firmware-static -- --test-name-pattern "gamepad"` 和 `idf.py build` 通过。重刷当前 Runtime 后，`curl /status` 返回 `app_count=32,state=idle`；`npm run gamepad:smoke -- --board http://192.168.1.32:8080 --inject-gamepad --require-updates 1 --require-connected --require-xbox --metrics-polls 12 --polls 12 --interval-ms 500` 返回 `gamepad smoke ok: smoke_gamepad state=running current_app=smoke_gamepad polls=2 connected=true updates=2 xbox=true buttons=256`，最终 `/status` 回到 idle。注意：`npm run device:check` 会通过 esptool 探测芯片并可能触发串口 reset，刚复位后的 HTTP 检查可能超时；当前以单独 `curl /status` 和 smoke 命令作为 Runtime 可用性证据。
- 2026-06-24 继续补 gamepad 生命周期自动化：`apps/smoke_gamepad` metrics 新增 `connect_failed` 计数，`npm run gamepad:smoke` 新增 `--inject-disconnect`、`--require-disconnects <n>` 和 `--require-connect-failed <n>`，可以验证 active Lua runner 收到连接、更新、断开这条完整软件事件链。TDD RED 先暴露工具不识别新参数且不会发第二个 disconnected 注入；实现后 `npm run test:gamepad-smoke`、`npm run test:firmware-static -- --test-name-pattern "gamepad"`、`npm run test:validator` 通过。板端上传新版 `smoke_gamepad` 后，手动读取 metrics 显示 `updates=7,connects=2,disconnects=1,connect_failed=0`；随后 `npm run gamepad:smoke -- --board http://192.168.1.32:8080 --inject-gamepad --inject-disconnect --require-updates 2 --require-disconnects 1 --metrics-delay-ms 1000 --metrics-polls 20 --polls 12 --interval-ms 500` 返回 `gamepad smoke ok: ... updates=8 disconnects=1 connect_failed=0 xbox=true buttons=0`。这仍是 synthetic HTTP smoke，不等于真实 BLE/Xbox discovery 或 native gamepad host。
- 2026-06-23 继续补 Voice AI GIF smoke 和大应用启动内存稳定性：`apps/voice_ai` 的 `metrics.json` 现在暴露 `use_gif`、`gif_visible`、`gif_state`、`gif_src`，`npm run voice-ai:smoke` 新增 `--require-gif`。第一次板端复测暴露 `/launch?app=voice_ai` 在上传大资源包后返回 `500 ESP_ERR_NO_MEM`；根因是 deferred launch task 仍使用普通 FreeRTOS 内部 RAM 栈，且 heap-caps 分配的 job 用 `free` 释放。当前已把 HTTP deferred launch task 改为 `xTaskCreatePinnedToCoreWithCaps(..., MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)`，job 清理改为 `heap_caps_free`，并加静态回归。重新构建并刷入 `/dev/cu.usbmodem111301` 后，`npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1800 --ready-polls 80 --polls 35 --interval-ms 500 --min-audio-bytes 1024 --require-gif` 返回 `voice-ai smoke ok: audio=4096 chats=0->1 state=running current_app=voice_ai gif=idle reply=我已收到录音：收到 4096 字节音频，约 0.1 秒`。这证明 mock bridge 录音上传回复和 GIF 选择/可见 metrics 已通过板端自动化；真实 provider、凭证策略和肉眼 GIF 动画确认仍未完成。
- 2026-06-23 继续补 I2S TX/playback 底座：Lua `i2s` 模块新增 `dout_pin` 配置、`i2s.write(port, data, timeout_ms)`、`tx_started`、`writes`、`tx_bytes`，并修复旧的 `port->started` 早退导致从 RX-only 切到 RX+TX 时复用旧 channel 的问题。`apps/smoke_i2s` 现在优先启动 RX+TX，写出 RX/TX metrics；没有 `dout_pin` 时会降级到 RX-only 并把原因写进 `last_error`。`npm run i2s:smoke` 新增 `--require-write`、active app 等待和 stale metrics 过滤；本地 `npm run test:i2s-smoke`、`npm run test:firmware-static -- --test-name-pattern I2S`、`npm run test:validator`、`node tools/app-validator/validate-demo-apps.mjs`、`npm run package:app -- apps/smoke_i2s`、`git diff --check` 通过。板端上传新版 `smoke_i2s` 后，`npm run i2s:smoke -- --board http://192.168.1.32:8080 --polls 20 --interval-ms 500 --require-reads --require-nonzero --require-write` 返回 `i2s smoke ok: smoke_i2s started=true reads=1 bytes=1536 nonzero=1536 writes=1 tx_bytes=512 error= polls=9`，随后 `/stop` 返回 `{"ok":true,"stopped":true}`。这证明 I2S TX driver 写入和 metrics，不等于真实扬声器/ES8311 codec 外放已经完成。
- 2026-06-24 继续把 I2S playback smoke 从一次 TX 写入推进到持续 tone 写入：`tools/i2s-smoke` 新增 `--require-tone-writes <n>`，`apps/smoke_i2s` 写出 `tone_hz/tone_writes/phase` metrics，并改为低 DMA 的 TX-only 440Hz 16-bit 方波 smoke，避免当前内存预算下 RX+TX 同时开 channel 时出现 `ESP_ERR_NO_MEM`。板端第一次定位时串口发现残留 `nes_core` 任务持续触发 WDT，并导致 SD 读 `not enough mem` / `/launch` 返回 `ESP_ERR_NOT_FOUND`；通过 `POST /reboot` 清掉残留任务后，重新上传 `smoke_i2s`，`npm run i2s:smoke -- --board http://192.168.1.32:8080 --polls 20 --interval-ms 500 --require-write --require-tone-writes 8` 返回 `i2s smoke ok: smoke_i2s started=true reads=18 bytes=0 nonzero=0 writes=18 tx_bytes=4608 tone_hz=440 tone_writes=18 error= polls=1`，随后 `/stop` 返回 `{"ok":true,"stopped":true}`。这证明持续 I2S TX sample 写入和机器可回归 metrics；仍不证明 ES8311 codec、功放或扬声器听感。
- 2026-06-24 修复 NES/native module 退出清理：Lua runner 的 `cleanup_lua_runtime()` 现在会调用 `vb_lua_native_module_cleanup(L)`，`lua_native_module` 进一步调用 `vb_nes_native_module_cleanup()`，由 NES adapter 对静态 `s_nes_module.core_runtime` 执行 `nes_core_stop(..., force=1)` 和 `nes_core_destroy(...)`，避免 App 外部 stop/切换/异常退出时依赖 Lua app 主动 `nes.stop()`。新增静态回归 `cleans up native module state when a Lua app exits`，本地 `npm run test:firmware-static -- --test-name-pattern "cleans up native module state"`、`npm run test:firmware-static -- --test-name-pattern "NES|native module|I2S"`、`npm run test:nes-smoke`、`npm run test:nes-rom-smoke`、`npm run test:nesgame-smoke`、`npm run test:i2s-smoke` 和 `idf.py build` 通过。修复固件刷入 `/dev/cu.usbmodem111301` 后，先跑 `npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 60 --interval-ms 500 --require-rom --require-frame-growth 120 --require-audio-backend host` 返回 `nes smoke ok: ... frames=12->138 frame_growth=126 backend=host audio_error=`；随后 `/stop` 返回 `{"ok":true,"stopped":true}`，不重启直接启动 `smoke_i2s`，`metrics.json` 达到 `tone_writes=26,tx_bytes=6656,last_error=""`，串口没有再出现 `task_wdt CPU 0: nes_core`。这证明 NES/native stop cleanup 已不再污染后续 I2S 硬件 smoke。
- 2026-06-24 继续加固 I2S smoke 工具可靠性：`tools/i2s-smoke` 现在在 `/launch` 响应发生临时 transport reset 时，会先用 `/status` 证明目标 app 已经进入 `state=running,current_app=smoke_i2s`，只有确认 active 后才继续读取 `metrics.json`；如果目标 app 没有 active，仍保留原始 launch 错误。新增测试 `continues when launch response resets after the app was queued and becomes active`，本地 `npm run test:i2s-smoke` 返回 16/16 pass。随后用加固后的命令跑板端 `npm run i2s:smoke -- --board http://192.168.1.32:8080 --polls 20 --interval-ms 500 --require-write --require-tone-writes 8` 返回 `i2s smoke ok: ... writes=28 tx_bytes=7168 tone_writes=28`，`POST /stop` 后 `/status` 回到 `state=idle,app_count=32`。这减少后续音频/NES 链路板端 smoke 的偶发假失败；它本身不新增 ES8311/扬声器听感证据。
- 2026-06-25 输入和 App manager 机器回归复跑通过：`npm run input:smoke -- --app smoke_key --key LEFT:SHORT --expect-state running --metrics-polls 14 --require-event UP:LONG_REPEAT --require-event UP:LONG_END` 返回 `input smoke ok`，`npm run gamepad:smoke -- --inject-gamepad --inject-disconnect --require-updates 2 --require-disconnects 1` 返回 `updates=3,disconnects=1,connect_failed=0,xbox=true`，`npm run app-manager:smoke` 返回 `smoke_app_manager->smoke_key`。每次 smoke 后 `/stop` 均成功，最终 `/status` 回到 `idle`。这继续证明 synthetic HTTP key/gamepad 注入、timer-backed key repeat metrics 和 Lua app-manager handoff；物理 BOOT-to-Lua HOME、真实触摸坐标、硬件来源长按 repeat 和真实 BLE/Xbox 仍需单独上板观察。
- 2026-06-24/25 继续推进 Voice AI command-provider 上板路径：bridge `/health` 和 `/debug/stats` 现在暴露 `provider`，`tools/voice-ai-smoke` 新增 `--require-bridge-provider <name>`，并修复“pre-launch stale metrics 与新 ready metrics 文本完全相同”导致的假超时。`voice_ai` 启动阶段不再在 `load_config` 最早期写 `metrics.json`，而是在 UI ready 后写入，避免启动时过早 SD 写。重新烧录 `/dev/cu.usbmodem111301`、上传 `voice_ai` 后，板端 metrics 返回 `init_stage=ready,use_gif=true,gif_visible=true,gif_src=/apps/voice_ai/assets/buddy/idle_0.gif`，`npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1800 --ready-polls 120 --polls 35 --interval-ms 500 --min-audio-bytes 1024 --require-gif --require-bridge-provider command` 返回 `voice-ai smoke ok: audio=6144 chats=0->1 state=running current_app=voice_ai gif=idle reply=`。这证明非 mock command provider 边界已经上板收到音频；但当前测试命令返回空 transcript/reply，app metrics 记录 `last_http_code=500`，所以真实 OpenAI wrapper/凭证和成功回复内容仍未完成。
- 2026-06-25 复跑 Voice AI/I2S sweep：bridge `/health` 返回 `provider=command`，`npm run i2s:smoke -- --require-write --require-tone-writes 8` 返回 `tone_writes=13,tx_bytes=3328`。本轮修复两个工具/app lifecycle 问题：`tools/i2s-smoke` 接受 target app 的 fresh passing metrics 来覆盖短暂 `state=starting`，并把 active wait 加长；`apps/voice_ai` 把 heavy `build_ui/start_timers/update_ui/ready` 放入 50 ms one-shot boot timer，避免顶层 ready metrics 写出后 runner 还没进入 timer/input loop，导致 HTTP HOME 注入不触发 `key.on`。验证：`npm run test:i2s-smoke` 17/17、`npm run test:voice-ai-smoke` 14/14、`npm run test:firmware-static -- --test-name-pattern "tracks migrated app runtime API gaps"` 83/83 通过；上传新版 `voice_ai` 后，`npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1200 --ready-polls 60 --polls 30 --interval-ms 500 --require-gif --require-font --require-bridge-provider command --min-audio-bytes 1` 返回 `voice-ai smoke ok: audio=6144 chats=3->4 state=running current_app=voice_ai gif=idle font=loaded reply=`，stop 回 `idle`。这证明板端 PCM 到 command bridge、GIF/font readiness 和 HOME 输入路径已闭环；空 `reply=` 仍表示真实 provider wrapper/凭证/成功回复内容未完成，ES8311 扬声器和 GIF 肉眼动画也未物理验证。
- 2026-06-25 Voice AI open-file budget 收口：最新 board smoke 在 `voice_ai` 运行时开始稳定暴露 `metrics=null` 和 `/apps/file` 404。根因是 SD VFS 只给了 8 个同时打开文件，而 `voice_ai` 需要同时维持字体、GIF、install service 读写和 smoke 诊断文件。已把 `VB_SD_MAX_OPEN_FILES` 提到 16，并把 `board_lckfb_szpi_s3.c` 的 mount config 改为共享该常量；`npm run test:firmware-static -- --test-name-pattern "keeps enough SD open files for runtime apps with live assets"`、`idf.py build` 和 `/dev/cu.usbmodem111301` flash 通过，最新 `vibeboard_runtime.bin` 大小为 `0x1b7580`，4MB app 分区剩余 57%。重新上传/运行 `voice_ai` 后，`npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://127.0.0.1:8790 --record-ms 1800 --ready-polls 120 --polls 35 --interval-ms 500 --min-audio-bytes 1024 --require-gif --require-bridge-provider command` 返回 `voice-ai smoke ok: audio=1536 chats=0->1 state=running current_app=voice_ai gif=idle font=loaded reply=reply:transcript:2048`，并且在 app 运行时直接读取 `metrics.json`、`main.lua` 和 `app.info` 都成功。最终 `/stop` 回到 `idle`。这把 Voice AI 从“能启动但运行时读不到 app 文件”推进到 board-verified command-provider transcript/reply；真实 provider STT 端点和肉眼 GIF 动画仍是后续事项。
- 2026-06-25 部署/config 产品化 sweep：第一次 `device:web:smoke` 用 `127.0.0.1:8790` 时实际打到 Voice bridge，改用 `npm run device:web -- --port 8791` 后又暴露当前 SD 上已有 32 个可见 App，而 `VB_APP_REGISTRY_MAX_APPS=32` 会让新上传的 `web_ui_smoke` 只计入 `/rescan app_count=33`、不进入 `/apps` stored list，导致 web/uploader confirmation 失败。已把 registry stored 上限提升到 48，仍通过 heap/PSRAM registry buffer 避免回到栈/静态 DRAM；`npm run test:firmware-static -- --test-name-pattern "keeps expanded app registry buffers out of static DRAM|scans the board app directory"` 83/83、`idf.py build` 通过，刷入 `/dev/cu.usbmodem111301` 后 `npm run device:web:smoke -- --base http://127.0.0.1:8791` 返回 `device web smoke ok: launched and deleted web_ui_smoke`。同轮 `npm run upload:interrupted-smoke -- http://192.168.1.32:8080 interrupted_upload_smoke` 返回 interrupted app absent；`npm run runtime:config:smoke -- --reboot --expect-app-count 32 ... i2s '{"bclk_pin":1,"ws_pin":2,"din_pin":3,"dout_pin":4,...}'` 返回 `runtime config smoke ok: i2s state=idle runtime=0.1.0 polls=2`。真实 WiFi credential write/reboot smoke 未跑，因为本 checkout 没有新本地 WiFi 凭证文件，只有 placeholder `apps/smoke_network/wifi.example.json`。
- 2026-06-25 release readiness audit 已完成当前机器可验证收口：`npm run test:firmware-static` 83/83、`npm run test:validator` 20/20、`npm run test:packager` 8/8、`git diff --check` 均通过。Validator 期间只修正了 `apps/weather` capability drift 预期，让测试承认当前 `capabilities = lvgl,network,timer,input,file` 与 Weather 的 `file.*` metrics/config 读写事实一致。该轮 ESP-IDF build 已通过并刷入板子，当时 `vibeboard_runtime.bin` 大小 `0x1b6660`，4MB app 分区剩余 57%；后续 Voice AI open-file 修复后的最新 flash 大小为 `0x1b7580`。Release artifact 路径为 `build/bootloader/bootloader.bin`、`build/partition_table/partition-table.bin`、`build/vibeboard_runtime.bin` 和 `build/flash_args`。审计结束时板端 `/status` 为 `state=idle,app_count=32,runtime_version=0.1.0,lua_api_version=0.1.0,lvgl_api_version=0.1.0,native_abi_version=vibeboard-native-module-abi@1`。后续又跑了完整 `npm test`，覆盖 validator、upstream map、AI contract、packager、uploader、plan writer、firmware static、device-check、device-web、input/lifecycle/NES/gamepad/I2S/Voice/App-manager smoke 工具和 voice bridge 单测，全部通过。剩余未声明完成的都是人工/外设/凭证或明确延期范围：资源 App/Weather/Voice AI 的肉眼视觉 QA、ES8311/扬声器听感、真实 BLE/Xbox 输入、真实 Voice AI provider 成功回复、新 WiFi 凭证写入重启、完整动态 ELF loader、长时间真实 NES 游戏 soak 和完整上游生态覆盖。
- 2026-06-25 Spectrum 从合成 bins 推进到真实 I2S RX + Lua Goertzel bands 的板端机器验证。初版 real-audio canvas/bar-object renderer 会让 runner 卡在 startup/render 或 `tick_bars`，表现为 `metrics.json` 停在 `frames=0/1` 且 stop 超时；诊断字段 `tick_phase/tick_count/read_attempts/last_pcm_bytes` 把卡点定位到 LVGL 多对象条形图创建/更新。最终实现改成低风险单 `lv_label` 频谱文本 visualizer，保留真实 `i2s.start/read`、`FRAME_BYTES=512`、`WINDOW_SAMPLES=128`、`I2S_READ_TIMEOUT_MS=0` 和 32 个 Goertzel band metrics。验证：目标 static guard 先 RED 再 GREEN，`npm run package:app -- apps/spectrum` 通过；上传后 `npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app spectrum --allow-starting --polls 80 --interval-ms 500 --metrics-polls 60 --metrics-interval-ms 500 --require-metrics audio_ready=true --require-metrics band_count=32 --require-metrics 'frames>=3' --require-metrics 'audio_reads>=1' --require-metrics 'audio_bytes>=1' --stop --stop-polls 80 --stop-interval-ms 500` 返回 `lifecycle smoke ok: spectrum state=running current_app=spectrum polls=2 stop_state=idle ... metrics={"audio_ready":true,"frames":3,...,"audio_reads":4,"audio_bytes":1024,...,"tick_phase":"tick_render","tick_count":3}`。这证明 Spectrum 的真实 I2S analyzer 机器路径和 clean stop；仍不等于物理麦克风响应照片、可听输出或上游完整 FFT/spectrum module。
- 2026-06-25 继续迁移 `upstream/holocubic-apps/codex_buddy` 到 `apps/codex_buddy`，保留本地 Codex Buddy bridge 合约 `GET /state` / `POST /permission`、`assets/bufo` GIF 状态包、`config.json` bridge URL、`metrics.json` 和 HOME/LEFT/RIGHT 权限决策输入。第一次 cold smoke 暴露两类真实 Runtime 适配问题：未 guard 的 `lv_gif_create(root)` 会在 UI ready 前卡住/退出，HOME 默认被 runner 拦截导致 Lua 收不到权限键；修复后 GIF 创建改为 `pcall` guarded path，app active 期间调用 `app.set_home_exit(false)`，并把 per-key handler 包成 `function(evt_type) handle_key(key.HOME, evt_type) end` 以匹配 Runtime `key.on(code, cb)` 的 `(event,timestamp)` 形状。验证：`npm run test:firmware-static -- --test-name-pattern "ships Codex Buddy as a deterministic desktop bridge migration"` 98/98、`npm run package:app -- apps/codex_buddy` 通过；用 `python3 upstream/holocubic-apps/tools/codex_buddy_bridge/server.py --host 0.0.0.0 --port 8788 --state-file tmp/codex-buddy-state.json` 提供 deterministic `attention` prompt 后，上传新版 App，`npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app codex_buddy --polls 80 --interval-ms 500 --metrics-polls 80 --metrics-interval-ms 500 --require-metrics buddy_ready=true --require-metrics online=true --require-metrics pet_state=attention --require-metrics prompt_seen=true --require-metrics gif_visible=true --require-metrics gif_state=attention --require-metrics 'polls>=1' --stop --stop-polls 80 --stop-interval-ms 500` 返回 `state=running,current_app=codex_buddy,...,gif_state=attention,prompt_seen=true` 并 stop 回 idle；随后手动 `POST /input/key?code=HOME&event=SHORT` 后 metrics 返回 `permission_posts=1,last_permission_decision="once",last_permission_status=200,last_key="HOME"`，`/stop` 回 idle。这证明 Codex Buddy 的机器可验证 bridge/GIF/input permission slice；仍不等于真实 Codex session 日志 UI 长时间运行、相机确认 GIF 动画或实际 IDE 审批生效。
- 2026-06-25 真实 provider wrapper 本机诊断推进一轮：本机环境已有 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL`，配置的 OpenAI-compatible base URL 能访问 `/models`，但用 `say` 生成中文语音、`ffmpeg` 转 16 kHz mono PCM 后跑 `desktop-bridge/server.mjs --provider command --once-file ...`，`voice:openai:transcribe` 访问 `/audio/transcriptions` 得到 `HTTP 404 text/plain: 404 page not found`；单独跑 `voice:openai:reply` 访问 `/responses` 得到 `HTTP 502 text/html; charset=UTF-8`。这说明当前剩余 provider 卡点不是 board 录音或 bridge JSON 协议，而是所选兼容服务没有暴露 wrapper 需要的音频转写端点，也不能作为当前 wrapper 的 Responses API 端点；已修 `desktop-bridge/openai-voice-commands.mjs` 的非 JSON 响应诊断，错误现在包含 endpoint label、HTTP 状态、content-type 和响应预览，`server.mjs` 也不再在运行时 provider 错误后附加 usage 噪音。验证：`npm run test:voice-bridge` 18/18 通过。
- 2026-06-25 真实 provider reply 兼容性继续收口：同一个 OpenAI-compatible base URL 的 `/chat/completions` 可用，但默认 `gpt-4.1-mini` 被该服务拒绝；`/models` 暴露 `gpt-5.4-mini` 后，用 `OPENAI_REPLY_MODEL=gpt-5.4-mini` 复测 `/chat/completions` 返回 200。已用 TDD 给 `desktop-bridge/openai-voice-commands.mjs` 增加 `OPENAI_REPLY_ENDPOINT=chat_completions` 模式，默认仍走 `/responses`，显式配置时走 `/chat/completions` 并解析 `choices[].message.content`。本机真实命令 `printf ... | OPENAI_REPLY_ENDPOINT=chat_completions OPENAI_REPLY_MODEL=gpt-5.4-mini node desktop-bridge/openai-voice-commands.mjs reply` 返回 `{"reply":"VibeBoard 语音回复端点可用。","ui_code":""}`，`npm run test:voice-bridge` 更新为 19/19 通过。现在 Voice AI provider 剩余卡点进一步缩小为 STT/audio transcription：当前 base URL 仍不提供 `/audio/transcriptions`，所以还不能完成真实录音 transcript + reply 的板端回合。
- 2026-06-25 staged install commit 回滚语义已从“先删旧 App 再 rename 新 stage”加固为同文件系统 backup/restore 流程：`/install/commit` 在 manifest hash 校验通过后，若正式 App 目录已存在，会先把旧目录 rename 到 `/sdcard/.vibeboard-staging/<stage>.rollback`，再把 staged 目录 rename 到正式目录；新目录替换失败时会尽量把 rollback 目录 rename 回正式 App 路径，替换成功后清理 rollback。新增静态回归先 RED 后 GREEN，锁住 backup-before-replace、restore-on-failure、success cleanup，以及禁止紧邻 stage rename 前 `remove_tree(app_path)`。验证：`npm run test:firmware-static` 103/103、`git diff --check`、`source /Users/wq/esp-idf/export.sh >/tmp/vibeboard-idf-export.log && idf.py build` 通过；最新 `vibeboard_runtime.bin` 大小 `0x1b81e0`，4MB app 分区剩余 57%。随后刷入 `/dev/cu.usbmodem111301`，板端 `/status` 恢复为 `sd=true,app_count=45,state=idle`；临时 `rollback_smoke` v1 staged upload/commit 成功，读回 `app.info` 为 v1，再用 v2 覆盖同一 app id，读回 `app.info` 和 `main.lua` 均为 v2，最后 `POST /apps/delete?app=rollback_smoke` 返回 `{"ok":true,"deleted":"rollback_smoke"}`，`app_count` 回到 45 且 `/apps/file?...rollback_smoke...` 返回 404。这证明正常 replacement commit 经过新 rollback 路径不退化；故障注入/断电类 rollback restore 仍由静态回归覆盖，待后续更低层 SD 故障注入板端验证。
- 2026-06-25 Weather 可见大背景机器闭环：直接 deferred `lv_img_set_src` 指向 320x240 PNG/BMP 都能让 timer 从 `scheduled/0` 推进到 `background_attempts=1`，但会停在 `background_error="loading"`；串口诊断确认 `lv_canvas_load_bmp` 已完成 open/header/format/alloc 后在 `LVGL task` 栈溢出。已改为 320x240 RGB565 BMP 背景资产 + `lv_canvas_load_bmp`（PSRAM scratch 解码、短 LVGL lock 内 memcpy/invalidate），并把 LVGL port task stack 提到 8192。固件重新 build/flash 后，`npm run device:check` 通过，上传 Weather 43 个文件，`npm run lifecycle:smoke ... --require-metrics background_ready=true --require-metrics background_attempts=1 --require-metrics background_error= --stop` 返回 `background_ready=true,background_attempts=1,background_error=""` 且 stop 回 `idle`。后续 Weather 剩余是拍照/肉眼确认颜色、比例、字体和布局，不再是 timer/decode 机器 gate。
- 2026-06-24/25 现场照片暴露了显示资源质量问题：屏幕上的多个小方框属于字体缺字或 `lv_font_load` fallback 后不覆盖当前中文文案；大色块更可能是图片/GIF/PNG 资源路径、格式、色深或解码失败后的占位绘制。后续定位确认还有一类固件级内存根因：LVGL 自定义内存仍落回 `stdlib.h`/`malloc`，显示对象、GIF、字体等小块分配会挤占内部 RAM，切换 `2048 -> voice_ai` 后可能触发 `sdmmc_read_sectors: not enough mem, err=0x101`，导致 SD 图片/字体/GIF 读不出来。已新增 `lvgl_runtime_alloc.*`，让 LVGL alloc/realloc 优先走 `MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT`，内部 RAM 只兜底；`CMakeLists.txt` 把 allocator 源文件、include path 和 `LV_MEM_CUSTOM_ALLOC/FREE/REALLOC` 注入 `lvgl__lvgl` 目标，`sdkconfig.defaults`/`sdkconfig` 使用 `CONFIG_LV_MEM_CUSTOM_INCLUDE="lvgl_runtime_alloc.h"`。验证：`npm run test:firmware-static -- --test-name-pattern "reserves internal DMA memory"`、`idf.py build` 通过，刷入 `/dev/cu.usbmodem111301` 后 Runtime 在 `http://192.168.1.32:8080` 返回 `app_count=32`；从 `2048` 直接切到 `voice_ai` 后，`metrics.json` 达到 `font_loaded=true,gif_visible=true,gif_src=/apps/voice_ai/assets/buddy/idle_0.gif`，完整 `npm run voice-ai:smoke -- --board http://192.168.1.32:8080 --bridge http://192.168.1.26:8790 --record-ms 1200 --ready-polls 60 --polls 30 --interval-ms 500 --require-gif --require-font --require-bridge-provider command --min-audio-bytes 1` 返回 `voice-ai smoke ok: audio=5120 chats=2->3 state=running current_app=voice_ai gif=idle font=loaded reply=`。剩余不是这条内存 bug，而是资源型 App 的肉眼验收：NixieClock/Clock/Voice AI 等仍需要拍照/截图确认字符覆盖、图片比例、色深和动画视觉。
- 2026-06-24 继续定位同一张现场照片：代码层确认 `sdkconfig.defaults` 早已声明 `CONFIG_LV_USE_PNG=y`，但实际参与构建的 `firmware/vibeboard_runtime/sdkconfig` 仍是 `# CONFIG_LV_USE_PNG is not set`，所以 `nixie_clock`、`clock`、`weather`、`voice_ai` 等 PNG 资源型 App 有可能在板上出现图片不显示或占位色块。照片里的小方框还对应另一条根因：默认 LVGL 字体仍是 Montserrat 14，只覆盖拉丁字符；未显式应用自定义中文字体的标签会显示占位方框。已把 `sdkconfig.defaults` 和实际 `sdkconfig` 同步为 `CONFIG_LV_USE_PNG=y`、`CONFIG_LV_FONT_SIMSUN_16_CJK=y`、`CONFIG_LV_FONT_DEFAULT_SIMSUN_16_CJK=y`，并在 `tools/firmware-static-check` 加 guardrail，防止 defaults 与实际配置再次漂移。验证：`npm run test:firmware-static` 78/78 通过；非沙箱 ESP-IDF build 通过，`vibeboard_runtime.bin` 大小 `0x1b61b0`，4MB app 分区剩余 `0x249e50`（57%）。本轮刷写 `/dev/cu.usbmodem111301` 失败在 macOS 串口 `Operation not permitted` / port busy，不是编译问题；因此这条修复目前是 build-verified，仍需下次重新烧录后拍照确认 PNG 资源和默认中文 glyph 是否真正恢复。
- 2026-06-24 后续硬件恢复：重新用非沙箱 ESP-IDF flash 成功打开 `/dev/cu.usbmodem111301`，识别目标 ESP32-S3 `MAC 10:51:db:80:e2:e8`，并刷入 PNG/CJK 新固件，`vibeboard_runtime.bin` 仍为 `0x1b61b0`、分区剩余 57%，bootloader/app/partition table 均 `Hash of data verified`。重启后 `curl /status` 返回 `app_count=32,state=idle,last_status=ESP_OK`。这把 PNG/CJK 修复从 build-verified 推进到 flashed；但还没有完成资源型 App 的拍照/肉眼确认，所以 `nixie_clock`、`clock`、`weather`、`voice_ai` 的 PNG 和默认中文 glyph 仍需视觉验收。
- 2026-06-25 资源/显示类 App 机器生命周期 sweep 已推进一轮：`npm run package:demos` 通过，随后 `matrix_rain`、`nixie_clock`、`clock`、`conway_life`、`fluid_pendant`、`smoke_controls` 均通过 `npm run lifecycle:smoke -- --stop`，最终 stop 回 `idle`。本轮同时补了两个回归：`tools/lifecycle-smoke` 对 `/launch` 或 `/status` 的瞬时 `ECONNRESET` 不再立即失败，而是继续用 `/status` 证明目标 App 是否已 active；`apps/fluid_pendant` 把可选 `app.on("imu", ...)` 注册包进 `pcall`，避免当前 Runtime 尚未支持 IMU event 时启动失败。验证：`npm run test:lifecycle-smoke` 10/10 通过，`npm run test:firmware-static -- --test-name-pattern "FluidPendant"` 83/83 通过，`git diff --check` 干净。这证明上述资源/显示类 App 的 launch/status/stop 机器生命周期，不替代 PNG/glyph/布局/动画的肉眼视觉验收。
- 2026-06-24 继续补 native gamepad host API：`lua_gamepad` 现在暴露 `vb_lua_gamepad_snapshot()`，`vb_module_host_api_t` 新增 `gamepad.snapshot`，NES v1 shim 在 `module_gamepad_api_t.state_mask(player)` 中把 Lua/HTTP 注入状态映射为 module ABI 的 A/B/SELECT/START/方向/L/R/HOME/MENU，`nes_native_adapter` 会在 host gamepad active 时把 module mask 映射到 NES core mask，并在 `nes.state()` 暴露 `host_gamepad_mask` / `host_gamepad_active`。新增静态回归 `bridges Lua gamepad state into the native NES host API`，验证 `module_abi.h`、host API、shim 和 adapter 同步；`npm run test:firmware-static` 78/78 通过，`idf.py build` 通过，生成 `vibeboard_runtime.bin` 大小 `0x188e90`，4MB app 分区剩余约 62%。这把 native gamepad host 基础桥推进到 build-verified；仍需重刷 Runtime 后用 `smoke_nes`/`nesgame` 增加板端 metrics smoke，并接真实 BLE/Xbox 输入源。
- 2026-06-24 native gamepad host API 上板补证：刷入最新固件后重新打包并上传 `apps/smoke_nes`，`npm run nes:rom:smoke -- --board http://192.168.1.32:8080 --app smoke_nes --path roms/smoke.nes` 上传 legal mapper-0 smoke ROM。第一次运行 `npm run nes:smoke -- --require-host-gamepad-mask` 暴露板上旧 `weather` 卡在 `state=stopping,current_app=weather`，`/stop` 返回 `app stop timeout`，通过 `/reboot` 恢复到 idle；这是新的 app lifecycle 待修缺口。恢复后重跑 `npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 60 --interval-ms 500 --require-rom --require-frame-growth 120 --inject-gamepad --inject-buttons 1 --inject-dpad-right --require-host-gamepad-mask` 返回 `nes smoke ok: ... frames=11->140 frame_growth=129 backend=host host_gamepad=129 audio_error=`；读取 `/apps/file?app=smoke_nes&path=metrics.json` 得到 `host_gamepad_active=true,host_gamepad_mask=129,rendered_frames=826,audio_backend="host"`。这证明 HTTP/Lua gamepad 状态已经进入 native NES host API 和 NES core input mask。仍未证明真实 BLE/Xbox 输入源。
- 2026-06-23 后续把 NES host audio 从 Lua fallback 继续往真实输出方向推进：新增共享 C helper `vb_i2s_tx_stream_begin/write/end`，让 Lua `i2s.write` 和 native module host audio 共用同一条 I2S TX 底座；`nes_host_v1_shim.c` 的 `module_audio_api_t.begin/write/end` 现在调用该 helper，不再直接返回 `MODULE_ERR_UNSUPPORTED`。`apps/smoke_nes` 增加 `audio_requested/audio_backend/audio_error` metrics，`npm run nes:smoke` 增加 `--require-audio-backend`。第一次板端 host-audio smoke 失败在 `audio_requested=true,audio_backend=none,audio_error="create nes apu task failed"`；单纯增加 `audio_task_stack_bytes` 没解决，最终根因定位到 `nes_apu` 额外任务消耗内部栈资源。当前 v1 host shim 会只把 `nes_apu` 用 `xTaskCreatePinnedToCoreWithCaps(..., MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)` 创建并用 `vTaskDeleteWithCaps` 删除，主 `nes_core` 任务仍保持内部栈。重刷 `/dev/cu.usbmodem111301`、重新上传 `smoke_nes` 和合法 ROM 后，`npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 60 --interval-ms 500 --require-rom --require-frame-growth 120 --require-audio-backend host` 返回 `nes smoke ok: ... frames=11->137 frame_growth=126 audio=0 backend=host audio_error=`。这证明 NES host audio backend 和 I2S TX native 边界已 board-verified；仍没有 ES8311/扬声器听感证据。
- 2026-06-25 继续收口 NES host-audio 稳定性：合法 smoke ROM 现在会写 NES APU pulse channel，`smoke_nes`/native adapter 暴露 `audio_apu_task_*`、`audio_apu_ticks`、`audio_sink_*` 和 `audio_written_bytes` metrics。诊断确认 `nes_apu` 仍需要 PSRAM stack，但不能强制 pin 到另一颗 core；`xTaskCreatePinnedToCoreWithCaps(..., tskNO_AFFINITY, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)` 才能让任务真正进入 entrypoint。host I2S write 现在容忍短暂 DMA backpressure/zero-write streak 并计数 dropped bytes，APU loop 按 sample-rate cadence 节流，避免音频任务过量抢占导致 frame-growth 下降。重刷后 `npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 30 --metrics-polls 140 --interval-ms 500 --require-rom --require-frame-growth 1600 --require-audio-bytes 128 --require-audio-backend host` 返回 `frames=26->1632,frame_growth=1606,audio=65024,backend=host,audio_error=`；随后不重启跑 `npm run i2s:smoke -- --require-write --require-tone-writes 8` 返回 `tone_writes=8,tx_bytes=2048`。这证明 NES native frame growth、APU-to-host-I2S 写入和 stop 后 I2S 复用已闭环；阈值从 1800 调整为 1600，说明当前仍不宣称满 60fps/真实游戏性能。另修 `apps/nesgame`：BLE/gamepad service 改为 one-shot timer deferred start，避免顶层 `gamepad.start()` 卡住 runner 让 `/status` 长期停在 `starting`；重新上传并清掉旧实例后，`npm run nesgame:smoke -- --require-frame-growth 120 --inject-gamepad` 返回 `state=running,frames=26->148,frame_growth=122,backend=host,gamepad_mask=16`，stop 回 `idle`。2026-06-25 还把 `tools/nes-smoke` 收口到 `metrics.json` 文件快照，并将 `smoke_nes` 从 WebUI 路由切回纯 file/native smoke，避免 `/app/metrics` 在高频轮询下重入 active Lua state。板端复验返回 `nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=2 rom=true started=true frames=4715 frame_growth=0 samples=1 frames=4715->4715 audio=63744 backend=host host_gamepad=0 audio_error=`。剩余 NES 缺口是物理扬声器听感、真实 BLE/Xbox 输入、屏幕/UX 肉眼观察和更长真实 ROM soak。
- 2026-06-25 晚些时候在 staged rollback 固件刷入后重跑 NES host-audio baseline，发现当前板端不应继续沿用“1600 frame growth 已恢复”的最新状态判断。先重跑 extended soak（`--metrics-polls 260 --require-frame-growth 3200`）失败为 `expected smoke_nes ROM-backed metrics; last metrics null`；诊断发现当时板端 `smoke_nes` 包没有当前 `metrics.json`，重新打包上传 `apps/smoke_nes` 和合法 ROM 后，原 baseline 命令 `--metrics-polls 140 --require-frame-growth 1600 --require-audio-bytes 128 --require-audio-backend host` 能读到 ROM/host-audio metrics，但只增长 `1394` 帧，低于 1600 gate，末尾 metrics 为 `rendered_frames=1412,audio_backend="host",audio_error="",audio_bytes=19840,audio_dropped_bytes=59008`。再用较低 `--require-frame-growth 1200` 尝试建立当前基线时，HTTP metrics 读取出现 `ECONNRESET`；停止后板端回到 `state=idle,app_count=45`，但 `metrics.json` 会残留旧 running 字段，不能作为完成证据。结论：当前 NES legal-ROM host-audio 路径仍能启动、写 host audio 并 clean stop，但 1600-frame baseline 和更长 soak 需要重新诊断，重点看 metrics 文件读取可靠性、host-audio drop/backpressure、APU 调度和 smoke 采样窗口；不要把旧 1606 帧记录当成最新已恢复证据。

当前还不是完整 Cubic Lua/HoloCubic 运行时。相对上游成熟度，当前约为 **90% 到 93%**：核心方向、文件/资源、基础控件、定时器、网络 API、免拔 SD 部署、原生 Launcher、基础 App 生命周期、manifest v2、staged install/delete、48-entry 可见 App registry、板端 staged manifest 文件 hash 校验、staged replacement rollback 正常路径板端验证、浏览器管理 UI、Weather 迁移、首批上游显示类 App 迁移、第一轮 key-driven App 迁移、Lua App manager handoff、可机器验证的 key repeat metrics、Voice AI mock/command bridge 端到端录音上传、Voice AI GIF/font metrics smoke、I2S RX 非零 PCM + 持续 TX tone 写入 smoke、NES APU 到 host I2S 的 board smoke、NES/native runner cleanup、`nesgame` selector-to-ROM + synthetic gamepad 注入路径、native gamepad host API 板端 synthetic smoke，以及 PNG 解码/默认 CJK 字体固件配置已完成刷机验证；当前重刷后 NES legal-ROM host-audio 1600-frame baseline 未复现，需重新诊断；`weather` 过重启动/停止拆分、资源阶段 `metrics.json`、小图标懒加载 metrics、timer/background metrics gate、320x240 BMP canvas 大背景加载、以及 `lifecycle-smoke --require-metrics` 已通过板端验证。完整应用生态、更多 LVGL 覆盖、真机视觉 QA、真实 AI 服务商接入、Voice AI GIF 肉眼动画验证、真实 BLE/Xbox 输入源、ES8311/扬声器硬件音频输出、staged rollback 故障注入和长时间真实游戏 soak 仍需继续补齐。

## 当前完成清单与后续路线

### 已经做完并真机验证

底层板级 Runtime：

- 立创 ESP32-S3 板可以启动 ESP-IDF Runtime；
- PSRAM、ST7789 LCD、背光、LVGL task 已跑通；
- SD 卡挂载到 `/sdcard`，并且不会在挂载失败时自动格式化；
- Runtime 固件已切到 4MB app 分区，能容纳网络、Lua、LVGL 和安装服务。

SD App 执行链路：

- Runtime 扫描 `/sdcard/apps`；
- 读取每个 App 的 `app.info`；
- 根据 `entry = main.lua` 找到入口脚本；
- 创建 Lua VM，注册 Runtime API，然后执行 SD 卡上的 Lua App；
- 串口日志可看到 Lua `print()` 输出；
- `smoke_ui`、`smoke_timer`、`smoke_file`、`smoke_assets`、`smoke_visual`、`smoke_network` 都已经作为不同能力的 smoke app 使用。

Lua/NodeMCU 兼容能力：

- `tmr` 核心 API 已实现：`tmr.create`、`timer:alarm`、`timer:start`、`timer:stop`、`timer:unregister`、`timer:state`、`timer:interval`、`tmr.now`、`tmr.time`；
- `file` 最小 API 已实现：读取 app-local 配置、列目录、文件句柄读写、app-local 写入；2026-06-26 又补了 app-local `stat`、`mkdir`、`remove`、`rename`、`rmdir`、`putcontents` 和 `file.listdir` 结构化条目，方便 `mini_claw`/`devtools` 类 App 继续向上游文件管理能力靠拢；
- `wifi`、`http`、`sjson`、`time` 最小 API 已真机验证；
- `set_interval` 作为早期兼容层保留，但主要方向已经转向 `tmr`。
- `app.list`、`app.rescan`、`app.current`、`app.exiting`、`app.launch`、`app.exit`、`app.set_home_exit`、`app.on` 已实现；`smoke_app_manager -> smoke_key` 软件 HOME handoff 已真机验证。
- Lua VM 内存已优先走 PSRAM，减少 Lua App 运行时对 WiFi/LwIP/HTTP 所需内部 RAM 的挤压。

LVGL 能力：

- 基础对象、label、container、尺寸、定位、颜色、边框、圆角、padding、对齐已可用；
- `S:` SD 文件系统、app-local 资源路径解析、`lv_img_*` 最小图片 API 已可用；
- BMP 解码已启用；
- button、bar、进度值更新等常用 widget 已通过 `smoke_visual` 验证。

免拔 SD 的部署链路：

- 板端 HTTP 服务监听 `8080`；
- `POST /install?app=<id>&path=<relative>` 可写入 `/sdcard/apps/<id>/...`；
- `GET /status` 可查看 SD、App 数量和服务状态；
- `GET /apps` 可列出已安装 App；
- `POST /rescan` 可重新扫描 SD App；
- `POST /launch?app=<id>` 可远程启动指定 App；
- `POST /install?app=<id>&path=<relative>&stage=<stage>` 可写入 staging 目录；
- `POST /install/commit?app=<id>&stage=<stage>` 可提交 staged App 并替换正式目录；
- staged App 如果包含 `manifest.json`，commit 前会逐个校验 `files[]` 里的文件大小和 SHA-256，校验失败会拒绝提交并保留旧 App；
- `POST /install/abort?stage=<stage>` 可丢弃 staged 上传；
- `POST /apps/delete?app=<id>` 可删除未运行的 App；
- `/status` 已返回 runtime、Lua API、LVGL API、package schema 和 native ABI 版本信息；
- Mac 工具已支持：

```bash
npm run package:app -- apps/smoke_visual
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_visual_remote
npm run launch:app -- http://192.168.1.32:8080 smoke_visual_remote
npm run input:smoke -- --app smoke_key --key LEFT:SHORT --key HOME:SHORT --expect-state idle
```

设备端启动链路：

- 开机显示原生 `VibeBoard Apps` 列表，而不是自动运行第一个 App；
- 触摸点击列表项可启动对应 App；
- BOOT 短按选择列表项，BOOT 长按启动选中 App；
- 启动前会复用 `app_runner` stop/switch 生命周期；
- 缺少入口文件的 App 会被跳过，避免启动时才报错。

验证和文档：

- `npm test` 已覆盖 validator、packager、AI contract、uploader、plan writer、firmware static check、input smoke 工具、NES smoke 工具、gamepad smoke 工具；
- `idf.py build` 已通过；
- `/dev/cu.usbmodem112301` 是本轮识别到的 ESP32-S3 板串口；该物理板会被用户的其他 ESP32 项目复用，不能假设长期保留 VibeBoard Runtime 固件；
- `docs/device-bringup.md` 记录了每次真机证据；
- `docs/runtime-capabilities.md` 维护 Runtime API 的实现/验证状态。

上游 HoloCubic 迁移：

- `apps/matrix_rain` 已从 `upstream/holocubic-apps/MatrixRain/` 迁移，补齐最小 LVGL canvas 绑定和相关常量；
- `apps/nixie_clock` 已从 `upstream/holocubic-apps/NixieClock/` 迁移，补齐 PNG 解码配置、`time.getlocal()`、图片抗锯齿和样式清理绑定；
- `apps/clock` 已从 `upstream/holocubic-apps/clock/` 迁移，补齐图片旋转、pivot、zoom 和文本样式绑定；
- `apps/conway_life` 已从 `upstream/holocubic-apps/ConwayLife/` 迁移，补齐 font fallback 兼容和本地字体资源路径适配；
- `apps/fluid_pendant` 已从 `upstream/holocubic-apps/FluidPendant/` 迁移，复用 canvas/time/timer 兼容路径；
- `apps/2048` 已从 `upstream/holocubic-apps/2048/` 迁移，补齐最小 Lua `key` 模块、`millis()` 兼容、LVGL 透明度/渐变/阴影/对象删除/置顶/属性动画绑定，并在 App 内对退出事件增加双次确认；
- `apps/weather` 已完成第一轮迁移：`json` alias、`http.cubicserver.get`、Cubicserver runtime config、gzip 移除策略、轻量 LVGL 面板替代小 canvas blur，并已用本地 Cubicserver mock 完成上板 HTTP 生命周期验证。2026-06-24/25 又修复了几个生命周期风险：`http.cubicserver.get(path, opts, callback)` 支持 `timeout_ms`，缺 `/sdcard/runtime/cubicserver.json` 时快速失败而不是回退到会阻塞的 `cubicserver.local`，`weather` 会先检查 `/sd/runtime/cubicserver.json` 并显示 `"Cubic config missing"`，runner 只在 Lua script 进入 timer loop 前标记 `running`，`VB_APP_RUNNER_STOP_TIMEOUT_MS` 提高到 15000 ms。照片里“只有色块/小方框、图片和部分文字没出来”的直接工程原因分两类：字体/PNG 配置与 LVGL 资源解码路径会导致资源缺失，另一个是 `weather` 原先在启动和停止路径同步加载/释放字体、背景图和图标，导致状态卡在 `starting` 或 `stopping`。当前已把 `weather` 改为轻量首屏 + 单个 `stage_boot` timer 串行推进 UI、字体和轻量 assets gate，并在资源加载后 stop 时跳过同步销毁大资源，避免 `/stop` 被 LVGL 清理阻塞。板端验证已通过：`npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --stop --stop-polls 35 --stop-interval-ms 500` 返回 `lifecycle smoke ok`，手动启动后等待 3 秒再 `POST /stop` 返回 `{"ok":true,"stopped":true}`，最终 `/status` 回到 `state=idle`。最新收尾又让 `weather` 写出 `metrics.json`，包含 `ui_ready/fonts_ready/assets_ready/visual_assets_ready/visual_asset_attempts/visual_asset_error/background_ready/background_attempts/background_error/boot_stage/startup_visible/last_error/forecast_error`，并让 `tools/lifecycle-smoke` 支持 `--require-metrics`、`--metrics-polls` 和 `--metrics-interval-ms`；板端上传小图标懒加载版后，`npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app weather --polls 35 --interval-ms 500 --metrics-polls 30 --metrics-interval-ms 500 --require-metrics ui_ready=true --require-metrics fonts_ready=true --require-metrics assets_ready=true --require-metrics visual_assets_ready=true --require-metrics visual_asset_attempts=1 --require-metrics boot_stage=3 --stop --stop-polls 35 --stop-interval-ms 500` 返回 `lifecycle smoke ok ... stop_state=idle ... metrics={"ui_ready":true,"fonts_ready":true,"assets_ready":true,"visual_assets_ready":true,"visual_asset_attempts":1,"visual_asset_error":"","boot_stage":3,...}`。中间一次实验也证明不能在 assets 阶段同步重建完整 PNG UI，否则会卡在 `assets loading` 并让 Runtime 停在 `state=stopping`；当前只在 assets 阶段懒加载主天气图标和 precip/humidity/wind 三个小图标。后续加入大背景时先定位到 `background_error="scheduled"`、`background_attempts=0` 的 timer 调度问题；已修复 `firmware/vibeboard_runtime/main/lua_tmr.c`，用 generation-checked timer handle 避免复用槽位被旧 handle 写回，回调内创建的 timer 推迟到下一轮 scheduler pass，one-shot timer 回调后释放槽位。更窄的负验证证明直接 deferred `lv_img_set_src` 指向 320x240 PNG/BMP 会推进到 `background_attempts=1`，但停在 `background_ready=false, background_error="loading"`。最终串口诊断显示 `lv_canvas_load_bmp` 已完成 open/header/format/alloc 后在 `LVGL task` 栈溢出；落地修复为 16-bit 320x240 RGB565 BMP 背景资产、`lv_canvas_load_bmp` PSRAM scratch 解码、短 LVGL lock 内复制到 canvas 并 invalidate，同时把 LVGL task stack 提到 8192。修复固件刷入 `/dev/cu.usbmodem111301` 后，先跑 `npm run device:check`，再上传 Weather 43 个文件，最终 `npm run lifecycle:smoke ... --require-metrics background_ready=true --require-metrics background_attempts=1 --require-metrics background_error= --stop` 返回 `lifecycle smoke ok ... metrics={"background_ready":true,"background_attempts":1,"background_error":"","boot_stage":3,...}` 且 stop 回到 `idle`。随后删除未再引用的 8 个 PNG 背景，Weather assets 从约 2.2M 降到 1.2M，上传文件数从 43 降到 37；重新 `device:check`、上传和同一 background metrics smoke 仍通过。结论：Weather 大背景的机器 gate 和包体清理已闭环；下一步只剩拍照/肉眼确认背景颜色、缩放、字体和布局质量；
- `apps/voice_ai` 的 mock bridge 端到端核心链路已 board-verified：I2S RX Lua 模块、LVGL GIF widget、`json` alias、`app.exit`、Lua HTTP callback/headers 兼容、以及 provider-neutral `desktop-bridge/server.mjs`。bridge 已有 `mock` 和 `command` provider 边界，`command` 通过 JSON stdin/stdout 调本地 STT/LLM 包装命令；`--once-file <pcm>` 已能在无板状态下用同一 provider pipeline 验证本地 PCM、metadata、JSON 输出和错误处理。2026-06-22 修复 `voice_ai` 启动阶段配置读取阻塞、HOME 绑定时序、I2S 停止前同步 drain，并新增 `GET /debug/stats` 与 `npm run voice-ai:smoke`。板端证据为 `voice-ai smoke ok: audio=2048 chats=0->1 state=running current_app=voice_ai reply=我已收到录音：收到 2048 字节音频，约 0.0 秒`。2026-06-23 又补了 `--require-gif` 板端 metrics smoke 和 command provider 隐私边界：STT/transcribe 命令收到 `audio_base64`，LLM/reply 命令默认只收到 transcript/metadata，只有显式设置 `VOICE_BRIDGE_REPLY_INCLUDE_AUDIO=1` 才会收到原始音频。2026-06-24 新增 OpenAI-compatible command wrapper：`npm run voice:openai:transcribe` 会把 PCM 包成 WAV 并调用 `/v1/audio/transcriptions`，`npm run voice:openai:reply` 默认用 transcript-only 输入调用 `/v1/responses`，也可用 `OPENAI_REPLY_ENDPOINT=chat_completions` 调 `/v1/chat/completions`；该 wrapper 已用 mocked HTTP 单元测试覆盖，并用当前兼容 base URL + `gpt-5.4-mini` 验证过真实 Chat Completions reply。真实 provider 上板回合仍卡在 STT/audio transcription 端点，`use_gif=true` 的 GIF 动画肉眼视觉仍待验证；
- `apps/nesgame` / `apps/smoke_nes` 的第一轮 native 路径已进入 board-verified ROM smoke：native manifest loader、静态 NES adapter、host API v1 shim、上游 NES C++ core 链接、ROM iNES header 校验、`nes.start(path, opts)`、`nes.state()`、`nes.input.*`、`nes.read_audio([max_bytes])`。`nes.start` 已兼容迁移 App 使用的 `frame_width/frame_height/center_on_screen/audio_ringbuf_samples` 等字段，`nes.state` 也补了 `rendered_frames` 兼容别名。2026-06-22 先通过无 ROM smoke 验证 `open rom failed` 可机器读取，随后新增 `npm run nes:rom:smoke` 生成合法 mapper-0 iNES 测试 ROM并上传到 `/sdcard/apps/smoke_nes/roms/smoke.nes`。本轮修复了 v1 shim 声明 stream API 但 `setAddrWindow/pushPixelsDMA` 返回 unsupported、NES task stack 被错误抬到 16KB、NES/LVGL 同时刷 LCD SPI 的总线竞争、以及 `smoke_nes` 只写一次 metrics 导致无法证明持续运行。进一步诊断发现 12 帧后 `push display pixels failed` 的底层原因为 `lvgl_port_lock(100ms)` 超时；当前已在 native display acquire/release 期间用 `vb_board_display_takeover()` / `vb_board_display_release_takeover()` 暂停并恢复 LVGL tick，让 NES 独占 panel。2026-06-23 用户报告“一直在重启”后，串口抓到 `task_wdt` 报 `IDLE0` 超时，当前运行任务为 `nes_core` / `nes_apu`，backtrace 分别落在 `NesCoreRuntime::taskLoop()` 的 `m_bus->clock()` 和 `NesCoreRuntime::apuTaskLoop()` 的 `bus->cpu.apu.clock()`；已新增 `nes_port_yield()` 并在主帧循环和 APU 批处理循环中显式让出调度，同时加了 `keeps NES core and APU tasks watchdog-friendly during long soaks` 静态回归。修复固件已刷入 `/dev/cu.usbmodem111301`，重新上传合法 ROM 后 `npm run nes:smoke -- --board http://192.168.1.32:8080 --polls 8 --metrics-polls 120 --interval-ms 500 --require-rom --require-frame-growth 1800 --require-audio-bytes 128` 返回 `nes smoke ok: smoke_nes state=running current_app=smoke_nes polls=2 rom=true started=true frames=1816 frame_growth=1804 samples=118 frames=12->1816 audio=1024`，随后 `/stop` 成功，最终 `/status` 回到 `state=idle,app_count=31`。同日 `apps/nesgame` 补了 app-local ROM fallback、`metrics.json`、LVGL align fallback、Lua `update_metrics` 前置声明、以及 `file.listdir` 字符串项/沙箱相对目录兼容；重新上传 `nesgame` 和合法 ROM 到 `roms/smoke.nes` 后，选择器 metrics 返回 `rom_count=1,selected_index=1,rom_path=/sdcard/apps/nesgame/roms/smoke.nes`，注入 `UP/LONG_START` 后返回 `screen_mode=running,started=true,running=true,frames=433->722`。随后新增 `npm run nesgame:smoke`，把 ROM 上传、`nesgame` 启动、selector metrics、`/input/key` 启动 ROM、running metrics 帧增长合成可复跑自动化，并纳入 `npm test`。2026-06-23 后续又让 `nesgame` metrics 暴露 `last_gamepad_buttons` / `last_gamepad_mask`，并让 `npm run nesgame:smoke -- --inject-gamepad` 通过 `/input/gamepad` 在选择页确认 ROM、在运行态注入 dpad/right + A；板端返回 `frames=12->138,frame_growth=126,gamepad_mask=24`，随后 `/stop` 成功。这证明合法 ROM 能启动、持续渲染，完整 `nesgame` 选择器到 ROM 启动链路能上板跑通，并且 `nesgame` 能消费 runner gamepad 事件并转换成 NES 输入 mask；硬件音频输出、真实 BLE/Xbox/native gamepad、更长真实游戏压力测试和 physical UX 观察仍待上板；
- `tools/app-packager` 的 demo 打包列表已包含 `matrix_rain`、`nixie_clock`、`clock`、`conway_life`、`fluid_pendant`、`smoke_key` 和 `2048`；
- 这些迁移已通过静态测试、packager 测试、总测试、`git diff --check` 和 ESP-IDF build；2026-06-17 已重新烧录固件并修复启动期 `main` 栈溢出、HTTP handler 数量不足和 LVGL flush 等待触发 watchdog 的问题。
- 2026-06-19 重新连接正确 ESP32-S3 板后，临时刷回 VibeBoard Runtime 并验证 `/status`、chunked `/apps`、`2048` staged upload/list/launch 闭环；同日修复 LVGL SPI DMA internal-memory 压力、HTTPD stack 分配到 PSRAM、`/apps` 大列表 JSON 截断、Lua runner task stack 分配到 PSRAM、SDMMC/FATFS 内部 DMA 内存不足、以及 `2048` 对 no-arg batch 和小尺寸 canvas 的误用。后续真机验证又暴露 `lvgl object table full`，已改成复用释放后的对象槽、删除对象子树时同步清理 Lua 句柄表，并把对象句柄上限提高到 128；重刷后 `2048` 持续约 90 秒 HTTP 状态保持 `running,last_status=ESP_OK`。用户随后确认屏幕显示、真实触摸滑动和双次退出手势行为正常。
- 2026-06-21 再次上板修复 Runtime WiFi 启动内存问题：串口确认旧路径在 `nvs_flash_init()` 阶段因最大内部连续块不足返回 `ESP_ERR_NO_MEM`；当前固件关闭 WiFi NVS 与 PHY calibration NVS 存储，改为启动时 full PHY calibration，并保留 WiFi/LwIP 优先用 PSRAM。重刷后日志显示 `wifi:config NVS flash: disabled`、`WiFi/LWIP prefer SPIRAM`、`runtime sta got ip 192.168.1.32`；同时修复 `/status.native_abi_version` 少引号导致的非法 JSON，`npm run device:check` 已能识别 Runtime。
- 2026-06-21 继续修复 Lua app manager 和 HTTP 稳定性：`/launch?app=smoke_app_manager` 现在向 runner 传完整 registry 快照和 selected index；`app.list/app.rescan` 使用缓存 registry，避免 Lua 运行中扫 SD；`lua_newstate` 改为 PSRAM allocator，修复 Lua App 运行后 HTTP `/status`/`/stop` 连接 reset。最终上板证据为 `smoke_app_manager` 看到 25 个 App，`app.launch("smoke_key")` 返回 true，handoff 后 `/status` 显示 `current_app=smoke_key,last_status=ESP_OK`，`/stop` 返回 `{"ok":true,"stopped":true}`。2026-06-22 已把该流程标准化为 `npm run app-manager:smoke`，本轮板端输出为 `app-manager smoke ok: smoke_app_manager->smoke_key state=running current_app=smoke_key polls=5`。
- 已新增第一版真实输入桥：触摸任务只把滑动事件入队，Lua runner 在 Lua/timer loop 中 drain 到 `key.on` 回调；`2048` 触摸滑动已由用户在真机确认通过。
- 已新增 `apps/smoke_key` 作为通用 key 输入 smoke：屏幕显示最近输入事件，定时通过 `key.push()` 注入 LEFT/RIGHT，并通过 `key.repeat_start/stop()` 自触发 LONG_START/LONG_REPEAT/LONG_END。2026-06-23 已把它升级为机器可读 metrics smoke，`npm run input:smoke` 可要求 `UP:LONG_REPEAT` / `UP:LONG_END` 出现在 `/apps/file?app=smoke_key&path=metrics.json`，并已在板端验证停止后回到 idle。
- 已新增 `npm run device:check` 作为共享 ESP32 板的非破坏性 preflight；不会自动擦写或烧录，只报告候选串口、ESP32-S3 识别和 Runtime HTTP 状态。
- 硬件注意事项：当前 ESP32-S3 物理板不是 VibeBoard 专用测试板，用户会烧录其他项目固件；每次做 VibeBoard 真机验证前都要先确认当前固件，必要时临时重烧 VibeBoard Runtime，测完记录板上保留的固件状态。

### 现在能用到什么程度

当前已经可以做这类事情：

```text
AI 生成一个受限 Lua/LVGL App
  -> 工具校验和打包
  -> Wi-Fi 上传到板子 SD 卡
  -> Runtime 重扫 App
  -> HTTP 远程启动
  -> 屏幕运行这个 Lua/LVGL App
```

这已经达到了“Runtime 一次烧录，App 快速迭代不用每次烧录固件”的核心验证目标。

但当前还不是面向普通用户的完整产品：

- 已经有可用的 Launcher、生命周期、浏览器管理 UI 和 staged install/delete，但还需要长期稳定性回归和更完整的错误恢复体验；
- HTTP `/launch` 冷启动超时已在 2026-06-22 修复：重 app 启动被延迟到后台任务，handler 会先返回 `{"ok":true,"launched":...}`。`smoke_gamepad` metrics 回归已证明之前的 `/launch` 8 秒超时不再出现；后续仍要用更多重 App 回归 stop/switch 超时窗口；
- Runtime-owned WiFi/Cubicserver/I2S 配置已经可以通过 `POST /runtime/config?name=wifi|cubicserver|i2s` 和 `npm run runtime:config` 写入 SD；当前板已从 `/sdcard/runtime/wifi.json` 启动联网。2026-06-22 已新增 `npm run runtime:config:smoke` 并用 I2S JSON 验证板端接受 `/sdcard/runtime/i2s.json` 写入后 `/status` 仍为 `state=idle,runtime=0.1.0`；2026-06-23 新增受控 `POST /reboot` 和 `runtime:config:smoke --reboot`，重刷后 `npm run runtime:config:smoke -- --reboot --reboot-polls 45 --reboot-delay-ms 1000 http://192.168.1.32:8080 i2s ...` 返回 `runtime config smoke ok: i2s state=idle runtime=0.1.0 polls=2`，证明配置写入后可自动重启并等 Runtime HTTP 恢复；同日新增 `/apps/file` 只读 artifact 端点和 `npm run i2s:smoke`，并在板端验证 `smoke_i2s` 新一轮 `started=true,reads=1,bytes=2048,nonzero=2048`。后续又补 `i2s.write`/`dout_pin`/TX metrics，`npm run i2s:smoke -- --require-write` 已返回 `writes=1,tx_bytes=512`。`runtime:config:smoke` 现在还支持 `--expect-app-count <n>` 和 `--expect-ip <ip>`，让真实 WiFi 凭证写入+重启 smoke 可以断言回来的就是预期 Runtime/网络实例。`voice_ai` mock bridge 短按录音上传回复也已通过 `npm run voice-ai:smoke` 板端验证。仍需继续的是用真实本地 WiFi 配置跑一轮“工具写入一份新 WiFi 配置后重启联网”的完整 smoke、生产 STT/LLM wrapper、真实 provider 凭证接入和 GIF 渲染目视验证；
- Lua 侧已有 `app.list()` / `app.rescan()` / `app.current()` / `app.exiting()` / `app.exit([reason])` / `app.launch(id)` / `app.set_home_exit(enabled)` / `app.on("exit"|"launch"|"stop", cb)`；`app.launch(id)` 采用非重入 handoff，当前 App 先请求退出，runner 清理当前 Lua state 后再异步启动目标 App，并在请求 handoff 时派发 `launch` 事件；`app.exit([reason])` 会派发 `stop` 事件；`app.set_home_exit(false)` 允许 `voice_ai`、`nesgame` 这类 App 接管 HOME/EXIT 输入而不触发 runner 默认退出；Launcher inactive 时的物理 BOOT 短按/长按已 build-verified 为 Lua `key.HOME` short/long-start 转发，默认 HOME/EXIT 退出语义仍保留；`apps/smoke_app_manager` 已能通过一次软件 HOME 短按自动触发 `app.launch("smoke_key")`，并显示 stop/launch/exit 生命周期事件计数，方便后续上板 smoke。该能力已 build-verified，真实物理 BOOT-to-Lua HOME 仍待 smoke；
- 还不能直接运行完整上游 HoloCubic 全量 App，只能按 App 驱动逐个补兼容层；
- LVGL 绑定已新增第一批常用控件 slice：slider、list、switch、dropdown、textarea、roller、arc 的创建和最小 setter/getter 已 build-verified。2026-06-22 `apps/smoke_controls` 已通过通用 `npm run lifecycle:smoke -- --app smoke_controls` 完成板端上传、启动、`state=running,current_app=smoke_controls` 和停止回 idle 的生命周期验证；flex/grid、字体和 canvas 高级效果仍不足，`smoke_controls` 每个控件的真实屏幕渲染还需人工目视 smoke；
- 触摸滑动到 Lua `key.on` 的第一版已通过 `2048` 真机验证；Lua `touch.on/off/push` 坐标事件模块和 `apps/smoke_touch` 已通过板端生命周期 smoke：上传、启动、保持 `state=running,current_app=smoke_touch`、停止回 idle。Lua `gamepad` 兼容层已能用 `push_state` 软件注入连接/断开/更新生命周期事件，`apps/smoke_gamepad` 可显示这些事件，并写出 `metrics.json`。2026-06-23 已新增 Runtime 级 `/input/gamepad` HTTP smoke hook 和 `npm run gamepad:smoke -- --inject-gamepad`，板端验证注入后 metrics 达到 `connected=true,updates=2,xbox=true,buttons=256`，证明非 Lua 内部调用的 gamepad 事件也能通过 runner 输入队列进入 active App。2026-06-24 又把该 smoke 扩展为 connect -> update -> disconnect 生命周期门槛，板端验证达到 `updates=8,disconnects=1,connect_failed=0`。它仍是 smoke hook，不等于真实 BLE/Xbox。物理 BOOT 到 active Lua app 的 `key.HOME` short/long-start 转发已 build-verified；`key.repeat_start/stop()` 已能通过 runtime timer 生成 LONG_START/LONG_REPEAT/LONG_END。还没有真实 BLE/Xbox、BOOT 转发上板记录、硬件来源长按 repeat、`smoke_touch` 的真实坐标显示还需要上板记录；
- Native NES 已经 board-verified 到合法 ROM 持续跑帧路径，并有 `npm run nes:rom:smoke` 生成/上传合法 mapper-0 iNES 测试 ROM、`npm run nes:smoke -- --require-rom --require-frame-growth <n>` 自动验证 `smoke_nes` 的 `rom_present/started/running/rendered_frames` 和帧增长，也有 `npm run nesgame:smoke` 自动验证 `nesgame` 的 app-local ROM、选择器和启动键路径。当前证据从短测升级到约一分钟 soak：最新 watchdog 修复后返回 `samples=118,frames=12->1816,frame_growth=1804,audio=1024`，所以合法 ROM 启动、持续显示路径、NES core/APU 任务调度让步和 Lua fallback PCM 读取已通过；`nesgame:smoke --inject-gamepad` 又证明了 HTTP gamepad 注入能启动 ROM 并在运行态产生 NES 输入 mask。NES host audio shim 已通过 `--require-audio-backend host` 板端 smoke，证明 host backend 可创建并运行；硬件扬声器/ES8311 输出、真实 BLE/Xbox/native gamepad、更长真实游戏压力测试和 physical UX 观察仍未完成；
- Voice AI 已有本地 bridge skeleton、command provider 边界、一次性 PCM 文件调试入口、OpenAI-compatible STT/LLM command wrapper、I2S/GIF build verification、设备端 `http.post(url, opts, raw_body, callback)` / `http.get(url, opts, callback)` 所需 headers/callback 兼容，以及 `voice_ai` 上传/启动、HTTP HOME 短按、I2S 录音、上传到 mock bridge、收到回复的上板证据；`smoke_i2s` 已在板端证明 Lua I2S RX 能读到非零 PCM，并且 TX driver 写入能通过 `writes/tx_bytes` metrics 自动验证。native module host audio 也已通过同一条 I2S TX helper 完成 `backend=host` 板端 smoke。command provider 已有测试覆盖的隐私边界：reply wrapper 默认 transcript-only，显式 `VOICE_BRIDGE_REPLY_INCLUDE_AUDIO=1` 才传原始音频。真实凭证接入、真实 command provider 上板回合、ES8311/扬声器真实外放、以及 `use_gif=true` 的 GIF/UI 肉眼视觉回归还没完成；
- Runtime/API/App schema 版本兼容已经有基础元数据；工具侧现在会拒绝包内普通 Lua 文件里直接调用当前 Runtime 未暴露的 LVGL API，并返回 `Runtime update required: unsupported LVGL API <name>`；也会拒绝 `requires.runtime`、`requires.luaApi`、`requires.lvglApi` 或 `requires.nativeAbi` 高于当前 Runtime 的 App；第一版 Lua 模块 API 白名单也已覆盖 `app`、`file`、`gamepad`、`http`、`i2s`、`json`、`key`、`sjson`、`time`、`tmr`、`touch`、`wifi` 的直接调用，能在打包前拒绝 `Runtime update required: unsupported Lua API <module.fn>`；capability guardrail 现在会把 `key.*`、`touch.*` 和 `gamepad.*` 都归入 `capabilities = input`，并覆盖包内 helper Lua 文件；`docs/ai-generation-contract.md` 也已经列出从 validator/C 绑定同步检查的第一版 LVGL UI 白名单；validator 的 API 扫描已升级为会跳过 Lua 注释、单双引号字符串和长字符串的词法扫描第一版，避免把示例文字误判为真实调用。后续如果引入依赖，再考虑完整 Lua AST 解析。

### 下一阶段必须补的核心能力

第一优先级：继续按上游 App 驱动补 Runtime API，而不是一次性盲补所有绑定。

- 每次选择一个上游 App；
- 先列出 Lua 模块和 `lv_*` API；
- 先写静态测试锁定缺口；
- 再补最小 Runtime 绑定和本地 App 包；
- 最后跑 package、firmware static、总测试、`git diff --check` 和 ESP-IDF build；
- 有硬件时再补真机屏幕验证记录。

第二优先级：把已完成的 Launcher/生命周期做长期回归，而不是重新做 Launcher。

- Stop/Refresh/返回 Launcher/启动失败详情已经实现并上板验证；
- 后续重点是用更多迁移 App 回归 stop/switch/失败恢复；
- 确认 `tmr` loop、文件句柄、LVGL 对象和事件 handler 在切换时持续保持清晰清理边界；
- 当前 App 出错时已经能回到 Launcher，后续继续改善错误文字和用户操作路径。

第三优先级：输入事件。

- 暴露 FT6336 touch 给 Lua；**第一版坐标事件 `touch.on/off/push` 已 build-verified，真实坐标显示待上板。**
- 已有 `key.on(...)` / `key.off(...)` / `key.push(...)` 兼容层，可支持上游 key-driven App 的软件触发和 API 形状；
- 触摸滑动到 `key` 队列桥接已通过 `2048` 真机验证；`smoke_touch` 已通过板端 launch/status 生命周期 smoke，`gamepad` 软件生命周期事件已通过 `smoke_gamepad` 板端 launch/status smoke 具备可跑证据，BOOT-to-Lua HOME 转发和 Lua timer-backed repeat helper 已 build-verified；下一步人工观察 `smoke_touch` 的真实坐标标签、用 `smoke_key` 观察 LONG_START/LONG_REPEAT/LONG_END、用 `app.set_home_exit(false)` App 做物理 BOOT 短按/长按转发 smoke，上板后继续补真实 BLE/Xbox 和硬件来源长按 repeat；
- 新增 `/input/key` HTTP smoke hook 后，后续可以自动化验证 active Lua app 的 key path；`npm run input:smoke -- --app <id> --key CODE:EVENT [--key CODE:EVENT ...] --expect-state <state>` 会串起 `/launch -> /input/key -> /status`，例如 `smoke_key` 可验证 `LEFT:SHORT` 和 `HOME:SHORT` 后回到 idle，`voice_ai` 可验证 `HOME:SHORT` 后仍保持 running；但它不是用户交互 API，也不能替代物理 BOOT、真实触摸和 gamepad 硬件验证；
- 给按钮、列表、Launcher 选择提供真实交互；
- 已新增 `apps/smoke_key` 显示最近 key 事件，`apps/smoke_touch` 显示触摸坐标和点击状态；
- 验证快速点击不会导致 Lua/LVGL 崩溃。

第四优先级：扩展 LVGL/API 覆盖。

- 常用控件第一批已 board lifecycle-verified：list、arc、switch、dropdown、textarea、roller、slider 对应的 `apps/smoke_controls` 已可上板启动并保持 running；下一步人工目视确认每个控件渲染正确，再根据迁移 App 需求补事件回调、更多样式和控件细节；
- 补常用样式：font、opacity、shadow、line、flex/grid 基础；
- 补图片/字体资源加载的稳定路径；
- “AI 可以生成的 UI API 白名单”第一版已建立在 `docs/ai-generation-contract.md`，并通过 `npm run test:ai-contract` 校验它和 validator 从 C 绑定读出的 LVGL 符号不漂移；
- 工具侧已能在 App entry 和 helper Lua 文件中直接调用未暴露 LVGL API、未暴露 Runtime Lua 模块 API，或声明高于当前 Runtime 的版本/ABI 要求时提前报 `Runtime update required`；API/capability 扫描已能跳过 Lua 注释和字符串；后续再视需要升级到完整 Lua AST 解析。

第五优先级：设备端 App 管理。

- Lua 侧 `app.list()`、`app.current()`、`app.rescan()`、`app.exiting()`、`app.exit([reason])`、`app.launch(id)`、`app.set_home_exit(enabled)`、`app.on("exit"|"launch"|"stop", cb)` 已 build-verified；
- HTTP 删除 App、staged upload + commit/abort、浏览器端管理 UI、Runtime-owned WiFi/Cubicserver config write、Runtime/API/App schema 版本查询、不兼容 App 拒绝启动、工具侧 App 包 hash preflight、工具侧版本/ABI 要求拒绝、以及板端 staged manifest 文件 hash 校验已完成第一版；
- 后续补 `apps/smoke_app_manager` 上板 handoff smoke、`POST /runtime/config?name=wifi` 写入后重启联网 smoke、staged manifest hash 失败场景真机 smoke、以及更完整的升级提示 UI。

第六优先级：迁移 App 的性能和卡顿优化。

2026-06-26 记录：用户反馈多个移植 App 的体感速度比上游慢、偶发卡顿。这个问题不能简单归因于“我们是 Runtime + Web 替换架构”，因为上游 Cubic/HoloCubic 同样支持 Runtime + SD/Lua App + WebUI/HTTP 替换；后续应把差异聚焦到兼容层成熟度、API 覆盖、资源加载、调度和热点路径实现。

- 先建立可测指标，再做优化：首屏耗时、资源加载耗时、timer callback 耗时、LVGL object 数量、SD file open/read 次数与耗时、metrics 写入频率、display tick/frame 变化、stop/switch 延迟；
- 优先抽样 3 个用户体感明显的 App 做对照，例如 `weather`、`photos`、`nesgame`，或 `voice_ai`/`spectrum` 这类资源和实时性更重的 App；
- 对比上游能力缺口：上游有更完整的 `httpd`/`websocket`/app event/LVGL 绑定，以及 `viper` 这类热点函数优化路径；我们当前很多移植 App 可能用多步 Lua 逻辑、轮询、轻量替代 UI 或 staged boot 绕过缺口；
- 重点检查资源路径：图片/GIF/PNG/BMP 解码、字体加载、PSRAM/SDMMC DMA 内存、SD 读放大、资源格式转换和首次渲染顺序；
- 重点检查调度路径：Lua timer、LVGL lock、display takeover、HTTPD、WiFi、SD、metrics 写入和 native task 之间是否互相抢占；
- 优化结论必须用上板指标或 smoke/soak 数据闭环，避免只凭主观感觉或单点代码判断。

2026-07-06 SD 读取专项结论：立创官方教程确认本板是 SDMMC 1-bit，不是 4-bit；Runtime 的引脚和挂载策略已与官方例程一致。新增 `/debug/sd-bench` 后，Weather `storm.bmp` 153666 字节在 20 MHz 下直读约 151-155 ms，在 40 MHz `SDMMC_FREQ_HIGHSPEED` 下直读约 119-124 ms，约 1.2 MB/s。HTTP `/apps/file` 已从固定 512B 栈缓冲改为内部 DMA 动态缓冲，默认 4KB，并用 `X-VibeBoard-File-Chunk` 暴露实际块大小；固定 16KB 在真机上会因内部 DMA 连续块不足失败，所以不能作为默认。最新端到端 HTTP 下载同一 BMP 仍约 1.13-1.34 秒，说明后续网页/远程资源慢要继续拆 HTTP/WiFi、解码转换、LVGL 锁和首屏调度，不能只归因于 SD 卡物理读取。

第七优先级：上游兼容和高级能力。

- `weather` 已完成第一轮迁移和本地 Cubicserver mock 上板验证，后续只在需要时恢复更丰富 canvas/blur 视觉；
- `voice_ai` 的 mock/command-provider board smoke 已能在干净启动和 `2048 -> voice_ai` 切换路径下录音并上传 PCM；2026-06-24 又补齐了真实 `lv_font_load/lv_font_free` 绑定、`lv_obj_set_style_text_font` 字体句柄应用、`font_loaded/font_handle/font_src/font_error` metrics，以及 `tools/voice-ai-smoke --require-font`。2026-06-24/25 进一步把 LVGL 分配器迁到 PSRAM 优先，修复切换后 SDMMC DMA 内存不足造成的 GIF/字体/图片加载失败风险。OpenAI-compatible command wrapper 的本机诊断已证明当前配置的 base URL 有 `/models`；`/responses` 不可用但 `/chat/completions` 已可用并通过 `OPENAI_REPLY_ENDPOINT=chat_completions` + `gpt-5.4-mini` 真实返回 reply，剩余 provider 端到端卡点是 `/audio/transcriptions` 返回 404。当前临时使用 `/sd/apps/weather/font/weather_ui_12.bin` 小字体以避开 175KB 中文字库造成的 LVGL/SD 内存压力；下一步是真实 provider 成功 transcript/reply、GIF 上板肉眼视觉、ES8311/扬声器真实外放、完整中文字体内存策略、以及真实 provider 端到端语音回合；
- 资源显示问题已拆成三条：中文小方框的一部分根因是默认 Montserrat 字体缺 CJK glyph，已把实际固件配置改为默认 SimSun CJK 并 build-verified；应用自定义字体的绑定/样式路径已在 `voice_ai` metrics 证明可加载，但仍要逐个 App 目视确认；图片/GIF/PNG 大色块的一部分根因是实际 `sdkconfig` 未启用 PNG，已同步配置并 build-verified。`weather` 另有 app 级生命周期根因：同步加载/销毁图片、字体和多 screen 会让 HTTP stop 等不到 Lua 回调返回；当前已用轻量首屏、单 timer staged boot、资源加载后轻量 stop 解决自动化生命周期，剩余还需要用照片/肉眼确认 decode 返回值、资源格式、色深、布局比例和动画视觉；
- NES/native module ABI 已进入合法 ROM 持续帧增长、Lua fallback PCM board smoke 和 `audio_backend=host` board smoke，Lua I2S TX driver 写入也已可验证；下一步是把 NES/Voice AI 音频接到真实 codec/speaker、真实 gamepad-native、完整 `nesgame` UI 和更长时间显示压力测试逐项上板；
- 不要绕过硬件证据直接宣称 Voice AI 或 NES 完成。

### 推荐最近三个开发切片

1. **NES 长时间显示、音频和输入收敛**

   目标是把已经能短时持续跑帧的合法 ROM smoke 变成可长期玩的 NES 体验。

   验收：

   - 继续使用 `npm run nes:rom:smoke` 上传合法测试 ROM 到 `/sdcard/apps/smoke_nes/roms/smoke.nes`；
   - `npm run nes:smoke -- --require-rom --require-frame-growth 1800 --require-audio-bytes 128 --metrics-polls 120 --interval-ms 500` 稳定返回 `rom=true started=true frame_growth>=1800 audio>=128`；
   - `npm run nesgame:smoke -- --board http://192.168.1.32:8080 --require-frame-growth 120` 能复跑 `apps/nesgame` 选择器从 app-local `roms/` 扫到合法 ROM，并通过 `UP/LONG_START` 进入 `screen_mode=running`、帧数持续增长；
   - 串口不再出现 LCD SPI bus busy / DMA buffer allocation 错误；
   - 补硬件音频输出；Lua PCM fallback 已用 `audio=1024` 验证，I2S TX driver 写入已用 `tx_bytes=512` 验证，持续 TX-only 440Hz tone 写入已用 `tone_writes=18,tx_bytes=4608` 验证，NES host audio shim 已用 `backend=host` 板端 smoke 验证，但 ES8311/扬声器听感仍未验证；
  - native gamepad host API 基础桥已 build-verified；下一步把 `host_gamepad_mask/active` 纳入 `smoke_nes` 或 `nesgame` 板端 metrics smoke，并继续接真实 BLE/Xbox 输入源。

2. **真实输入事件接入**

   目标是把已经通过 `2048` 验证的触摸滑动到 `key` 队列桥接扩成独立输入 smoke，并继续补物理按键。

   验收：

   - `apps/2048` 能通过触摸滑动触发上下左右；**已由用户真机确认。**
   - `apps/smoke_key` 能显示 `key.push(...)` 注入的 LEFT/RIGHT 事件；
   - `apps/smoke_touch` 能显示真实触摸坐标事件；
   - 事件 handler 在 App 停止/切换时清理；
   - 快速输入不会导致 Lua/LVGL 崩溃。

3. **Voice AI 端到端 smoke**

   目标是把 build-verified 的 `voice_ai` 支撑能力连成真机闭环。

   验收：

   - `/sdcard/runtime/i2s.json` 通过 `npm run runtime:config -- <board-url> i2s <json-file|-|json>` 写入真实麦克风引脚；
   - `apps/smoke_i2s` 能录到非零 PCM；
   - `desktop-bridge/server.mjs --provider mock` 能被板端访问，`--provider command` 能通过本地 STT/LLM wrapper 返回 `transcript`、`reply` 和可选 `ui_code`；
   - `apps/voice_ai` 能录音、上传、拿到 bridge 回复并更新 UI；
   - GIF buddy 动画在屏幕上可见。

## 项目边界

项目路径：

```text
/Users/wq/vibeboard-runtime-gpl
```

许可证边界：

- 本项目是 GPL-3.0-only。
- 本项目直接吸收 `clocteck/holocubic-apps` 和 `clocteck/holocubic-nes-esp32`。
- 原 `/Users/wq/VibeBoard` 仍保持独立 MIT 项目，不混入 GPL 源码。
- 如需互通，只通过文档链接、网络 API、进程边界或构建产物，不复制 GPL 源码到 MIT 仓库。

硬件边界：

- 当前目标板：立创 ESP32-S3 小屏板，320x240 ST7789，FT6336 触摸，SD 卡槽。
- 当前已识别 ESP32-S3 串口：`/dev/cu.usbmodem112301`。注意该板会被用户其他 ESP32 项目复用，真机验证前必须重新确认并临时烧录 VibeBoard Runtime。
- 官方示例源码参考：`/Users/wq/Downloads/szpi-s3-esp`。

## 上游参考结论

上游也是同一类架构：

```text
Runtime 固件
  -> 注册 Lua VM、NodeMCU 风格模块、LVGL 绑定、App 管理器
  -> SD 卡放 /sd/apps/<app>/app.info + main.lua + assets
  -> Lua App 调 Runtime API
  -> 必要时从 /sd/modules 加载 Native .so 模块
```

我们已经吸收：

```text
upstream/holocubic-apps/
upstream/holocubic-nes-esp32/
```

上游能力重点：

- App 包结构：`app.info + main.lua`；
- 文件路径：`/sd/...`；
- 全局 Lua 模块：`tmr`、`wifi`、`http`、`file`、`app`、`key`、`nes` 等；
- Lua UI：全局 `lv_*` 函数和 LVGL 常量；
- NES：Lua App 调用 `/sd/modules/nes.so` 动态模块。

我们的策略不是盲目复制上游，而是在立创 ESP32-S3 板上重做一版 VibeBoard Runtime，优先保证：

- 真机可控；
- AI 生成成功率高；
- App API 面小而稳定；
- 缺能力时明确返回 `Runtime update required`；
- 每个阶段都有测试和真机日志证据。

## 已完成

### 1. 仓库和授权边界

已建立独立 GPL 仓库：

```text
vibeboard-runtime-gpl/
  LICENSE
  NOTICE.md
  README.md
  docs/
  upstream/
  apps/
  modules/
  tools/
  firmware/
```

已写明：

- GPL 来源；
- 与原 MIT VibeBoard 的边界；
- 上游导入路径；
- App 层和 Runtime 层的区别。

### 2. 上游源码吸收

已导入：

```text
upstream/holocubic-apps/
upstream/holocubic-nes-esp32/
```

已整理首批 VibeBoard-facing App：

```text
apps/weather/
apps/voice_ai/
apps/nesgame/
modules/nes/
```

这些 App 目前主要作为能力目标和兼容性样本，不能默认认为已经在我们 Runtime 上可运行。

### 3. App 包工具链

已实现：

```text
tools/app-validator/
tools/app-packager/
tools/app-plan-writer/
```

当前能力：

- 校验 `app.info`；
- 校验 `name`、`entry`、`description`；
- 拒绝 entry 路径逃逸；
- 检查 restricted API 和 `capabilities` 声明；
- 打包 App 到 `dist/apps/<app-id>/`；
- 从 AI package plan JSON 写入 `generated/apps/<app-id>/`；
- 可选继续打包生成部署目录。

当前命令：

```bash
npm test
npm run validate:apps
npm run package:app -- apps/weather
npm run package:demos
npm run write:app-plan -- plan.json
npm run write:app-plan -- plan.json --package
```

### 4. 真机 Runtime 最小闭环

已实现 ESP-IDF Runtime：

```text
firmware/vibeboard_runtime/
```

核心文件：

```text
main/board_lckfb_szpi_s3.c
main/app_registry.c
main/app_runner.c
main/lua_lvgl.c
main/lua_lvgl_fs.c
main/lua_lvgl_widgets.c
main/main.c
```

当前 Runtime 能力：

- 初始化 I2C、PCA9557、ST7789、LVGL、FT6336 touch、SD 卡；
- 正确处理立创板反相背光；
- 挂载 SD 到 `/sdcard`；
- 扫描 `/sdcard/apps`；
- 找到第一个包含 `app.info` 的 App；
- 读取 `name` 和 `entry`；
- 创建 Lua VM；
- 注册 `print()`；
- 注册 `tmr` 和兼容层 `set_interval(ms, callback)`；
- 注册拆分后的 LVGL 绑定；
- 注册 LVGL `S:` SD 文件系统；
- 启用 BMP 解码器；
- 执行 `/sdcard/apps/<app>/main.lua`。

已真机验证的 App：

```text
apps/smoke_ui/
```

旧版 `set_interval` 真机验证日志关键线：

```text
app_registry: found 1 apps
Lua app start: smoke_ui
weather card dynamic ok
Lua interval loop start: 1 timers
weather card tick 1
weather card tick 2
weather card tick 3
Lua interval loop done
Lua app ok
VibeBoard Runtime ready: sd=ok apps=1 lua=ok
```

## 当前不能假装已经完成的部分

这些能力还没有完成或还缺外部证据：

- `weather` 已迁移并通过大背景 BMP、字体、UI 阶段和 stop 生命周期板端 smoke；仍缺长期联网/多天气态人工视觉复核；
- `voice_ai` 已有 mock/command provider 和音频上传路径板端证据；仍缺真实 STT provider、ES8311/功放可听输出和物理 GIF 体验验证；
- `nesgame` 已可加载 app-local ROM 并板端跑合法 ROM smoke；仍缺真实 BLE/Xbox 输入、硬件音频输出、长时间真实游戏压力测试和 physical UX 观察；
- `wifi`、`http`、`sjson`、`time` 已真机验证最小路径；
- Lua 可用的 `key`/`touch`/`gamepad` 模块已实现到软件注入和 lifecycle smoke 层级；仍缺真实触摸坐标、BOOT-to-Lua HOME 和真实手柄输入的完整人工证据；
- 原生屏幕 Launcher、触摸选择、BOOT 备用选择、受控 App 切换、返回 Launcher、屏幕停止/刷新和屏幕错误恢复已经完成 Phase 5B 验收；
- HTTP 上传、列表、重扫、远程启动、受控停止/切换、staged install、commit/abort、delete 和本地 device-web 管理页已完成第一版；仍缺浏览器直接选择本地包上传、日志摘要和更严格回滚语义；
- 图片、PNG/BMP、canvas、字体 fallback/加载和一批常用 LVGL 图片/文本样式绑定已补齐；完整上游控件覆盖仍不足；
- Native `.so` 动态加载仍未作为目标实现；当前采用静态 native facade + app-local `.vbn` manifest；
- `tmr` 事件循环已经从固定 8 秒 smoke loop 改为 timer-driven loop，并支持 stop/switch 停止请求；timer-backed lifecycle 已覆盖到 Weather 延迟背景加载和受控停止路径。

## 与上游差距表

| 能力 | 上游状态 | 我们当前状态 | 优先级 |
| --- | --- | --- | --- |
| SD App 包结构 | 成熟 | 已跑通最小版 | 已完成基础 |
| Lua VM | 成熟 | 已集成 | 已完成基础 |
| LVGL 绑定 | 覆盖较广 | 最小控件/样式/图片/按钮/进度条/canvas 已跑通或 build-verified，覆盖仍远小于上游 | P1 |
| 定时器 | `tmr` | 核心 API 已真机 smoke，生命周期还需 Launcher 补齐 | P0 |
| 文件模块 | `file` | 最小 API 已真机 smoke；App-local 读写和资源路径已可用 | P0 |
| 网络 | `wifi/http/net/mqtt` | `wifi`/`http` 最小 API 已 board-verified，`net`/`mqtt` 未做 | P1 |
| JSON | `sjson` | `decode`/`encode` 已 board-verified | P1 |
| 时间/NTP | `time` | `get`/`getlocal`/`settimezone`/`initntp` 已实现，核心联网路径已 board-verified | P1 |
| App 管理 | `app` 模块 | HTTP `/launch`、`/stop`、`/rescan`、staged install/delete 已可用；Lua `app.list/rescan/launch/stop` 已通过 handoff smoke 覆盖 | P1 |
| 输入 | `key`/`touch`/`gamepad` 事件 | Lua 模块和软件注入已实现；触摸滑动到 key 已板端验证；真实坐标/BOOT HOME/实体手柄仍需人工验证 | P1 |
| 资源 | 图片/字体/资产路径 | App-local 路径、`lv_img_*`、BMP/PNG、canvas、字体 fallback/加载已板端驱动验证；完整控件覆盖仍按 App 需求补 | P1 |
| Web 安装卸载 | 有路线 | HTTP staged install/delete + 本地 device-web proxy smoke 已板端验证；浏览器直接选择本地包/日志摘要仍待产品化 | P2 |
| Native 模块 | NES `.so` | 静态 native facade + app-local `.vbn` manifest 已跑 NES smoke；动态 `.so` ABI 仍不是当前实现 | P3 |

## 总体开发原则

1. 先补 Runtime API，再追 App 数量。
2. 每补一个 Runtime 能力，都必须有：
   - 静态测试；
   - 最小 Lua smoke App；
   - 真机构建；
   - 真机串口日志；
   - 必要时屏幕确认。
3. 上游 App 不能直接全量搬上来就算完成，必须按能力拆解。
4. AI 生成 App 只能使用已声明的 Runtime API。
5. 遇到缺失底层能力，工具和文档都应明确提示：

```text
Runtime update required
```

## Phase 0：状态校准和质量护栏

目标：让文档、测试、构建脚本和真实状态一致。

任务：

- 更新 README 和 `docs/development-plan.md`，把项目状态从“文件级打包”改为“真机最小 Runtime 已跑通”。
- 增加 Runtime capability matrix 文档，列出每个 Lua API 是否已实现、是否真机验证。
- 把真机验证命令收敛成固定脚本或文档块。
- 确保 `npm test` 覆盖：
  - app validator；
  - upstream map；
  - AI contract；
  - packager；
  - plan writer；
  - firmware static check。
- 对 `firmware/vibeboard_runtime` 增加静态检查，防止背光反相、SD 路径、Lua 栈大小等关键点回退。

验收标准：

- `npm test` 通过；
- `idf.py build` 通过；
- 文档不再出现“不能生成可烧录 Runtime 固件”这类过期表述；
- `docs/device-bringup.md` 记录当前 smoke_ui 真机证据。

## Phase 1：生产级 Lua 事件循环和 `tmr`

目标：把当前 smoke 用的 `set_interval` 升级为更接近上游的事件模型，并提供 NodeMCU 风格 `tmr`。

状态：核心代码已完成，`npm test`、`idf.py build`、真机刷写和 `apps/smoke_timer` SD smoke 已通过；完整 App 生命周期停止信号仍需在 Launcher 阶段补齐。

状态：最小 `file` API 已实现，`apps/smoke_file` 已新增，`npm run package:app -- apps/smoke_file`、`idf.py build`、刷机和真机 SD smoke 已通过。`apps/smoke_assets`、`lv_resolve_asset_path()`、`lv_asset_exists()`、`lv_img_create()`、`lv_img_set_src()`、高频位置/flag/label long mode 绑定和 LVGL `S:` 文件系统驱动已真机 smoke；真实图片/字体解码仍待补齐。

已新增或修改：

```text
firmware/vibeboard_runtime/main/app_runner.c
firmware/vibeboard_runtime/main/lua_tmr.c
firmware/vibeboard_runtime/main/lua_tmr.h
firmware/vibeboard_runtime/main/CMakeLists.txt
apps/smoke_timer/
tools/firmware-static-check/test.mjs
docs/runtime-capabilities.md
```

任务：

1. 抽出 Lua runtime context，避免 `app_runner.c` 继续膨胀。
2. 实现 `tmr.create()`。
3. 实现 `timer:alarm(interval_ms, mode, callback)`。
4. 实现常量：

```lua
tmr.ALARM_SINGLE
tmr.ALARM_AUTO
tmr.ALARM_SEMI
```

5. 实现：

```lua
tmr.now()
tmr.time()
timer:stop()
timer:unregister()
timer:state()
timer:interval(ms)
```

6. 把 `set_interval` 改成兼容层，内部调用 `tmr`，或者标记为 VibeBoard 扩展 API。
7. 事件循环不能固定 8 秒退出；需要支持 App 生命周期停止信号。
8. 增加 `apps/smoke_timer`，验证单次定时器和循环定时器。

验收标准：

- `apps/smoke_ui` 仍能显示并刷新；
- `apps/smoke_timer` 能打印至少 5 次 tick；
- 串口能看到 `tmr` 自动定时器持续运行；
- App 出错时 Lua VM 能退出并释放定时器；
- `npm test` 和 `idf.py build` 通过。

## Phase 2：文件和资源系统

目标：让 Lua App 能稳定读取 SD 卡上的配置、图片、字体和本地资源。

需要新增或修改：

```text
firmware/vibeboard_runtime/main/lua_file.c
firmware/vibeboard_runtime/main/lua_file.h
firmware/vibeboard_runtime/main/lua_lvgl.c
apps/smoke_file/
apps/smoke_assets/
docs/app-package-format.md
docs/runtime-capabilities.md
tools/app-validator/
```

任务：

1. 实现 `file` 模块最小集合：

```lua
file.exists(path)
file.open(path, mode)
file.read(path)
file.write(path, data)
file.list(path)
```

2. 路径统一规则：

```text
/sd/...       -> /sdcard/...
S:/...        -> LVGL drive path
relative path -> 当前 App 目录内路径
```

3. 加入 App sandbox：默认禁止 Lua 逃逸到 App 目录外，`/sd/...` 目前只开放只读解析，写入先限制在当前 App 目录内。
4. 扩展 validator：使用 `file.` 必须声明 `capabilities = file`。
5. 增加 `apps/smoke_file`，验证读写小配置文件。
6. 增加 `apps/smoke_assets`，验证读取 App-local asset。
7. 给 LVGL 增加最小图片/字体加载路线，优先支持上游 App 常用路径转换。

验收标准：

- [x] Lua 能读取 `/sd/apps/smoke_file/config.json`；
- [x] Lua 能列出当前 App 目录；
- [x] 未声明 `file` capability 的 App 被 validator 拒绝；
- [x] 真机 SD 文件读写不破坏 App 包；
- [x] 错误路径有明确日志；
- [x] App-local 资源路径解析和 LVGL `S:` 文件系统驱动真机 smoke；
- [x] 高频 LVGL 位置、flag、label long mode 绑定真机 smoke；
- [x] `apps/smoke_assets` 真机 smoke；
- [x] PNG/BMP/SJPG 或 LVGL bin 图片解码；
- [x] App-local 字体资源加载路线。

2026-06-25 补充收口：`file` 模块和 LVGL 资源入口现在对错误路径会打出明确串口日志；`lv_canvas_load_bmp` 已覆盖 320x240 BMP 解码与失败分支；`lv_font_load` / `lv_font_free` 已支持 app-local 字体资源加载，并被现有 `weather`、`voice_ai`、`conway_life`、`2048` 相关实现和静态测试覆盖。

## Phase 3：LVGL 绑定扩展

目标：从“能画天气卡片”提升到“能支撑上游普通 UI App”。

需要新增或修改：

```text
firmware/vibeboard_runtime/main/lua_lvgl.c
firmware/vibeboard_runtime/main/lua_lvgl.h
apps/smoke_lvgl_widgets/
apps/smoke_lvgl_style/
docs/runtime-capabilities.md
```

优先实现：

- `lv_img_create`
- `lv_img_set_src`
- `lv_obj_set_pos`
- `lv_obj_set_x`
- `lv_obj_set_y`
- `lv_obj_add_flag`
- `lv_obj_clear_flag`
- `lv_obj_set_style_opa`
- `lv_obj_set_style_text_font`
- `lv_label_set_long_mode`
- `lv_label_set_recolor`
- `lv_bar_create`
- `lv_bar_set_value`
- `lv_btn_create`
- `lv_canvas_create` 可后置

常量补齐：

- 常用 `LV_ALIGN_*`
- 常用 `LV_PART_*`
- 常用 `LV_STATE_*`
- 常用 `LV_LABEL_LONG_*`
- 常用颜色、透明度、flag 常量

工程要求：

- 不能只堆一个巨大 `lua_lvgl.c`；
- 当绑定继续增长时，拆成：

```text
lua_lvgl_core.c
lua_lvgl_label.c
lua_lvgl_obj.c
lua_lvgl_img.c
lua_lvgl_style.c
```

验收标准：

- [x] `apps/smoke_lvgl_widgets` 已新增，覆盖 label、button、bar、app-local BMP image 和 timer-driven bar 更新；静态测试覆盖，并写出 `metrics.json` / `boot_error` 便于板端诊断；板端 lifecycle 已通过，视觉 smoke 待跑；
- [x] `apps/smoke_lvgl_style` 已新增，覆盖 opa/text font/text align/label long mode/style selector，并用可选探测记录 `lv_label_set_recolor` 缺口；静态测试覆盖，并写出 `metrics.json` / `boot_error` 便于板端诊断；板端 lifecycle 已通过，视觉 smoke 待跑；
- `apps/weather` 的 UI 部分能至少进入首屏，不因缺基础控件直接失败；
- LVGL 对象表支持足够数量对象，且对象清理后不会引用悬空指针；
- 每个新增绑定都记录在 `docs/runtime-capabilities.md`。

2026-06-25 补充：Phase 3 已有的绑定实现已经拆在 `lua_lvgl.c`、`lua_lvgl_widgets.c`、`lua_lvgl_canvas.c`、`lua_lvgl_fs.c`，不是继续堆单个巨大 `lua_lvgl.c`。本次补齐了计划中显式点名的 `apps/smoke_lvgl_widgets/` 和 `apps/smoke_lvgl_style/` 两个回归样本，并在 `docs/runtime-capabilities.md` 记录为 build/static verified。两个 app 都已改成 50 ms one-shot deferred boot + `metrics.json`，并新增 `boot_error`，避免 deferred boot 失败时只留下 `ready=false`。本地证据为 `npm run test:firmware-static` 102/102、`npm run test:uploader` 42/42、两个 `npm run package:app` 成功和 `git diff --check` 通过。板端第一次尝试 `smoke_lvgl_widgets` 时暴露瞬态 SD apps/staging 状态：`/rescan` 返回 `ESP_ERR_NOT_FOUND`，`/apps/file?app=smoke_lvgl_widgets&path=main.lua` 返回 404，而 `/apps` 仍来自缓存；新版 uploader 进一步把假确认暴露为 `Upload app.info failed after 3 attempts: 500 mkdir failed`。为避免这类假确认，`tools/app-uploader` 现在在 `/apps` 命中后还会读回 `app.info`，`/launch` 源码也改为在 `vb_app_registry_scan()` 返回 `ESP_ERR_NOT_FOUND` 时拒绝启动而不是继续使用缓存 registry。执行 `POST /stop` 和 `POST /reboot` 后，`/rescan` 恢复为 `{"ok":true,"app_count":45}`，`/apps/file` 能读回 app 文件，两个包重新上传并通过严格读回确认。随后 `npm run lifecycle:smoke -- --app smoke_lvgl_widgets --allow-starting --require-metrics ready=true --require-metrics boot_error= --require-metrics 'bar_value>=0' --stop` 返回 `ready=true,boot_error="",icon_path="S:/apps/smoke_lvgl_widgets/assets/icon.bmp",bar_value=20` 并 stop 回 idle；`npm run lifecycle:smoke -- --app smoke_lvgl_style --allow-starting --require-metrics ready=true --require-metrics boot_error= --require-metrics 'pulse>=0' --stop` 返回 `ready=true,boot_error="",pulse=0,recolor_supported=false,title_font=16,metric_font=28,badge_font=10` 并 stop 回 idle。Phase 3 机器 lifecycle gate 已闭环，剩余是物理屏幕/照片确认 widgets 和 style 实际渲染质量。

## Phase 4：WiFi、HTTP、JSON、时间

目标：让天气和 AI bridge 这类联网 App 有运行基础。

当前状态：首批 `wifi`、`http`、`sjson`、`time` 模块已实现并完成真机联网 smoke；能力状态是 board-verified。设备已通过 SD 卡 `wifi.json` 连接 `1-306`，拿到 `192.168.1.32`，并对 `http://httpbin.org/get` 完成 HTTP 200。

已完成：

- `wifi.mode("sta")`、`wifi.start()`、`wifi.sta.config({ ssid = ..., password = ... })`、`wifi.sta.connect()`、`wifi.sta.getip()`；
- WiFi 初始化前自动初始化 NVS，必要时处理 NVS 页/版本错误；
- `http.get(url)`、`http.post(url, opts_or_body, body)` 同步 HTTP client；
- `sjson.decode(text)`、`sjson.encode(table)`；
- `time.settimezone(...)`、`time.initntp(...)`、`time.get()`；
- `apps/smoke_network` 读取 app-local `wifi.json`，无配置时只做 JSON/time smoke 并打印清晰提示；
- 自定义 4MB factory app 分区，避免网络固件超过 ESP-IDF 默认 1MB 分区。
- 修复 `time.initntp()` 和安装服务在 `esp_netif` 未初始化时触发 `Invalid mbox` 的启动崩溃。
- WiFi STA 关闭省电模式 `WIFI_PS_NONE`，让板子作为局域网 HTTP 服务端时更稳定。

需要新增或修改：

```text
firmware/vibeboard_runtime/main/lua_wifi.c
firmware/vibeboard_runtime/main/lua_http.c
firmware/vibeboard_runtime/main/lua_sjson.c
firmware/vibeboard_runtime/main/lua_time.c
apps/smoke_network/
apps/smoke_http_json/
docs/runtime-capabilities.md
docs/device-bringup.md
```

任务：

1. `wifi` 最小能力：

```lua
wifi.mode("sta")
wifi.start()
wifi.sta.config({ ssid = "...", password = "..." })
wifi.sta.connect()
wifi.sta.getip()
```

后续待补：`wifi.sta.on("got_ip", callback)`。

2. WiFi 配置来源先用 SD 卡 App 本地配置：

```text
/sdcard/apps/smoke_network/wifi.json
```

3. `http` 最小能力：

```lua
http.get(url)
http.post(url, opts_or_body, body)
```

4. `sjson` 最小能力：

```lua
sjson.decode(text)
sjson.encode(table)
```

5. `time` 最小能力：

```lua
time.get()
time.settimezone("CST-8")
time.initntp("pool.ntp.org")
```

6. 增加网络 smoke App：

```text
apps/smoke_network/
```

后续可再拆 `apps/smoke_http_json/` 做纯 HTTP/JSON 回归样本。

验收标准：

- 设备能从 SD App 目录读取 WiFi 配置并联网；
- 串口打印 IP；
- `http.get` 能请求一个固定测试接口；
- `sjson.decode` 能解析响应；
- `apps/weather` 能走到真实请求或明确网络错误状态；
- 无 WiFi 配置时，屏幕和串口都有可理解错误，不崩溃。

## Phase 5：App 生命周期和 Launcher

目标：从“开机跑第一个 App”升级为“可列出、启动、退出、切换 App”。

Phase 5 现在拆成两段：

- **Phase 5A 已验收：原生 Launcher MVP 和基础 stop/switch。**
- **Phase 5B 已完成第一轮：返回 Launcher、屏幕停止/刷新/错误提示、上传可靠性、Lua 侧 App manager API build verification。**

需要新增或修改：

```text
firmware/vibeboard_runtime/main/app_registry.c
firmware/vibeboard_runtime/main/app_runner.c
firmware/vibeboard_runtime/main/lua_app.c
firmware/vibeboard_runtime/main/launcher.c
firmware/vibeboard_runtime/main/launcher.h
apps/smoke_app_manager/
docs/runtime-capabilities.md
```

实际实现采用 `launcher_ui.c` / `launcher_ui.h` 的原生 LVGL Launcher，而不是 `apps/launcher/` Lua App。原因是当前阶段需要稳定的系统级 app-selection screen；Lua 侧 `app.*` manager API 已作为 App 内能力实现，`apps/smoke_app_manager` 用于后续上板 smoke。

任务：

1. Registry 支持多个 App，不只记录第一个。**已完成并真机验证。**
2. 增加 App metadata：

```text
id
name
entry
description
capabilities
path
```

3. 实现 `app` 模块最小集合。**后移到 Phase 5B；当前原生 Launcher 不依赖它。**

```lua
app.list()
app.current()
app.launch(id)
app.rescan()
app.exiting()
app.on(event, callback)
```

4. 实现 App 生命周期。**HTTP `/status.state` 和屏幕端 Stop/Refresh/失败反馈/返回 Launcher 已完成第一轮真机验证。**

```text
start
running
exit requested
cleanup
stopped
```

5. 做最小 Launcher UI。**已完成并真机验证。**

- 显示 App 列表；
- 点击或按键启动 App；
- 返回 Launcher；**已验收。**
- App 失败时显示错误。**已验收。**

验收标准：

- SD 卡放多个 App 时，Launcher 能列出；**已验收。**
- 能从 Launcher 启动 App；**已验收，触摸点击和 BOOT 长按均可启动。**
- 能退出 App 回到 Launcher；**已验收。**
- `app.rescan()` 能识别新复制的 App；**HTTP `/rescan` 已验收，Lua `app.rescan()` 已通过 `smoke_app_manager` 板端 handoff smoke 间接覆盖。**
- App 崩溃不会导致整个 Runtime 崩溃。**已通过 `apps/smoke_fail` 真机验证，屏幕错误恢复体验已验收。**

## Phase 6：触摸、按键和输入事件

目标：把硬件输入暴露给 Lua，让 App 可以交互。

当前状态：`key.on/off/push/repeat_start/repeat_stop` 已覆盖软件注入和 timer-backed LONG_START/LONG_REPEAT/LONG_END，其中触摸滑动到 key 的路径已通过 `2048` 真机验证；`touch.on/off/push` 坐标事件模块、`gamepad.state/start/stop/on/off/rescan/push_state` 兼容模块、`apps/smoke_touch` 和 `apps/smoke_gamepad` 已 build-verified，`smoke_touch` lifecycle 已板端验证。native host 侧也已能通过 `vb_module_host_api_t.gamepad.snapshot` 和 NES v1 `gamepad.state_mask(player)` 读取 Lua/HTTP 注入的 gamepad 状态，`smoke_nes` 已板端验证 synthetic host gamepad metrics（`host_gamepad_active=true,host_gamepad_mask=129`）。Launcher inactive 时的物理 BOOT 短按/长按到 active Lua app `key.HOME` short/long-start 转发也已 build-verified。真实触摸坐标显示、BOOT 转发屏幕/串口证据、硬件来源长按 repeat 和真实 BLE/Xbox gamepad 仍待上板。

需要新增或修改：

```text
firmware/vibeboard_runtime/main/lua_key.c
firmware/vibeboard_runtime/main/lua_touch.c
firmware/vibeboard_runtime/main/lua_gamepad.c
firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.c
apps/smoke_key/
apps/smoke_touch/
apps/smoke_gamepad/
```

任务：

1. 把 FT6336 touch 事件接到 Lua。**触摸滑动到 `key` 已 board-verified，原始坐标到 `touch` 已 build-verified。**
2. 实现：

```lua
touch.on(function(evt, x, y, ts_ms) end)
touch.off()
touch.push(touch.DOWN, x, y)
```

3. 如果板子有可用按键，增加 `key` 模块：

```lua
key.on(function(code, event, ts_ms) end)
key.off()
key.push(key.LEFT, key.SHORT)
```

4. 事件回调必须在 Lua runtime 线程安全执行，不能直接从中断或 LVGL 回调乱入 Lua VM。**已通过 runner 输入队列和 Lua/timer loop drain 实现。**

验收标准：

- `apps/smoke_touch` 能显示当前触摸坐标；**board lifecycle-verified，真实坐标数值仍需人工触摸观察。**
- 点击 Launcher 列表能启动 App；**已验收。**
- 快速点击不会导致 Lua panic；**2048 手势路径已验收，`smoke_touch` 启停生命周期已上板，原始坐标快速点击仍需人工观察。**
- App 退出时事件 handler 被解绑。**key/touch cleanup 已实现并有静态测试覆盖。**

## Phase 7：设备端安装、卸载和免拔 SD 部署

目标：减少反复拔插 SD 卡，让 App 可以通过网络或 USB 辅助工具安装。

当前状态：HTTP 安装服务、远程启动、staged install/commit/abort、delete、版本状态字段和本地 device-web 管理页已完成第一版实现。它不是最终完整 API，但已经证明 Runtime 可以在板端接收文件、写入 staging、提交到正式 App 目录、重扫 App、删除未运行 App，并按 app id 启动已安装 App；本地 Web proxy 已能查看状态/App 列表、启动/停止、rescan，并通过 stop-first flow 删除临时 App。

已完成：

- 固件启动 `install_service`，监听 `8080`；
- `POST /install?app=<id>&path=<relative>` 写入 `/sdcard/apps/<id>/<relative>`；
- `POST /install?app=<id>&path=<relative>&stage=<stage>` 写入 `/sdcard/.vibeboard-staging/<stage>/<relative>`；
- `POST /install/commit?app=<id>&stage=<stage>` 将 staged 目录提交到 `/sdcard/apps/<id>/`；
- `POST /install/abort?stage=<stage>` 删除 staged 目录；
- `POST /apps/delete?app=<id>` 删除未运行 App；
- `GET /status` 返回 SD、App 数量、第一个 App 和安装服务状态；
- `GET /status` 返回 runtime version、Lua API version、LVGL API version、package schema 和 native ABI version；
- `GET /apps` 返回当前 registry 里保存的 App 列表；
- `/apps` 返回 manifest v2 派生 metadata，包括 schema、version、kind、capabilities 和 compatible；
- `POST /rescan` 重新扫描 `/sdcard/apps` 并返回最新 App 数量；
- `POST /launch?app=<id>` 重新扫描 registry，并异步启动指定 App；
- 拒绝空路径、绝对路径和 `..` 路径逃逸；
- 自动创建父目录；
- `tools/app-uploader` 默认使用 Node 原生 HTTP，并默认走 staged upload + commit；
- `tools/app-uploader --legacy-direct` 保留旧 direct upload 作为 fallback；
- `npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_visual_remote` 已上传并确认 `smoke_visual_remote`；
- `npm run launch:app -- http://192.168.1.32:8080 smoke_visual_remote` 已连到板端；同一 App 已运行时会拒绝重复启动，启动另一个 App 时会走受控 stop/switch；
- 原始 HTTP POST 从 Mac 写入 `raw_upload/app.info` 后，下一次启动日志显示 `app_registry: found 2 apps`。
- 真机 raw HTTP 验证：`/status`、`/apps`、`/rescan`、`/launch` 均返回预期结果。

当前限制：

- 浏览器 UI 已有本地 device-web proxy 和 `device:web:smoke`；仍缺浏览器直接选择本地 App 包上传、设备日志摘要和最终产品化 UI；
- staging commit 目前是实用替换流程，不是严格文件系统级原子 rename；
- 原始固件 delete 仍只删除未运行 App；`tools/app-uploader` 和 device-web 已编排 stop-first delete flow；
- `/launch` 已支持受控切换，`/status.state` 已完成 idle/running/failed/stop/recovery 真机验证；屏幕端错误恢复已在 Phase 5B 验收；
- staged install/delete 已通过本地测试、固件构建、`upload:interrupted-smoke` 板端 abort 验证和 `device:web:smoke` 板端删除临时 App 验证。

需要新增或修改：

```text
firmware/vibeboard_runtime/main/install_service.c
firmware/vibeboard_runtime/main/lua_httpd.c
web-console/
tools/device-deployer/
docs/deployment-flow.md
```

第一版只做局域网 HTTP，不同时做 BLE/USB/远程隧道。

任务：

1. Runtime 暴露安装接口：

```text
GET  /status       # first slice done
GET  /apps         # first slice done
POST /rescan       # first slice done
POST /install?app=<id>&path=<path>&stage=<stage>    # done
POST /install/commit?app=<id>&stage=<stage>         # done
POST /install/abort?stage=<stage>                   # done
POST /apps/delete?app=<id>                          # done
```

2. 安装采用临时目录。**已完成第一版。**

```text
/sdcard/.vibeboard-staging/<stage>/
```

3. commit 成功后替换正式目录。**已完成第一版。**

```text
/sdcard/apps/<app-id>/
```

4. 失败时尽量保留旧 App。**工具默认 staged upload；固件 commit 已改成同文件系统 rollback backup/restore，正常 replacement commit 已刷机验证，故障注入板端验证仍待补。**
5. Web Console 支持：

- 查看状态、App 列表、安装结果；**本地 device-web 已完成第一版。**
- 启动、停止、删除 App、触发 rescan；**本地 device-web + 板端 smoke 已验收。**
- 选择本地 App 包并从浏览器上传；**待产品化。**
- 查看设备日志摘要；**待产品化。**

验收标准：

- 不拔 SD 卡也能安装 `smoke_ui`；
- 上传中断不会破坏旧版本；
- 上传后 Launcher 能 rescan 出新 App；
- 安装失败有明确错误；
- 工具链仍保留手动 SD 复制路径作为 fallback。

## Phase 8：AI 生成闭环

目标：让 AI 生成的 App 从 JSON plan 到设备运行形成闭环。

需要新增或修改：

```text
docs/ai-generation-contract.md
tools/app-plan-writer/
tools/app-validator/
tools/app-packager/
web-console/
generated/apps/
```

任务：

1. 明确 AI 只生成 package plan，不直接写设备。
2. plan writer 落盘为：

```text
generated/apps/<app-id>/
```

3. validator 检查：

- metadata；
- capabilities；
- forbidden API；
- 文件路径；
- 资产大小；
- 是否需要 Runtime update。

4. packager 输出：

```text
dist/apps/<app-id>/
```

5. Web Console 调设备安装接口。
6. 设备日志返回给 AI 修复循环。

验收标准：

- 给 AI 一个“做倒计时/天气卡片/番茄钟”的需求，能生成 App 包；
- 生成包能通过 validator；
- 能上传到设备；
- 能在 Launcher 中启动；
- 若 AI 使用未支持 API，工具能拒绝并提示具体缺失能力。

## Phase 9：上游 App 兼容路线

目标：逐个让上游 App 在 VibeBoard Runtime 上真实跑通。

当前状态：上游兼容路线已经开始落地。`MatrixRain`、`NixieClock`、`clock`、`ConwayLife`、`FluidPendant`、`2048`、`Weather`、`voice_ai`、`nesgame`、`BTC`、`Settings`、`hwmon`、`Spectrum`、`videos`、`photos`、`plane`、`lv-benchmark` 和 `mini_claw` 已迁移为本地 App 包，并驱动补齐了一批 LVGL/time/PNG/BMP/GIF/canvas/font-fallback/key/gamepad/audio/native/timer/network/file/webui 能力。显示类 App 已从 package/static/build 推进到一批板端 lifecycle smoke；`2048` 已保持 `state=running,current_app=2048,last_status=ESP_OK`，真实触摸滑动到 `key.on` 和双次退出确认已由用户真机确认；`Weather` 已通过大背景 BMP、字体、UI 阶段和 stop lifecycle smoke；`voice_ai` 已通过 mock/command provider 上传路径；`nesgame` 已通过合法 ROM 和 app-local ROM selector smoke；`BTC` 已通过本地 mock HTTP price metrics smoke；`Settings` 已通过 lifecycle metrics 和 HTTP key injection smoke；`hwmon` 已通过本地 mock host metrics smoke；`Spectrum` 已通过真实 I2S microphone capture、Lua Goertzel bands、单标签 visualizer metrics 和 clean-stop lifecycle smoke；`videos` 已通过 app-local GIF playlist metrics 和 HTTP key injection smoke；`photos` 已通过 app-local PNG image playlist metrics 和 HTTP key injection smoke；`plane` 已通过 app-local BMP sprite、timer game loop、HTTP key injection 和 metrics smoke；`lv-benchmark` 已通过最小 LVGL object/label/arc/image-transform/timer metrics smoke；`mini_claw` 已以 WebUI agent service 形式落地，并通过 WebUI GET/POST 与 `sys.setbrightness` 板端 smoke。仍不能把“机器 smoke 通过”写成“所有物理体验完成”：`nixie_clock`、`clock`、`weather`、`voice_ai`、`BTC`、`Settings`、`hwmon`、`Spectrum`、`videos`、`photos`、`plane`、`lv-benchmark` 等仍需要照片/可听输出/真实 provider、真实外网服务、真实 host monitor、真实音频频谱/麦克风响应观察、真实硬件控制、真实媒体体验、游戏手感或完整 benchmark 结果证据。

2026-06-25 `mini_claw` / 上游 WebUI/httpd 类 App 的前置 Runtime WebUI route bridge 已完成最小闭环：Lua 侧新增 `app.route_base()`、`app.set_webui(bool)`、`app.route(path, callback)`，固件 HTTP `/app/*` 会分发到当前 active Lua App 的 route callback；当前实现已经把 request `method` 和 `body` 一并透传给 Lua，`/app/api` 可接收 POST。这个切片已按 TDD 收口：validator 会要求 route API 声明 `webui` capability，firmware-static 覆盖 Lua API、runner dispatch、`/app/*` handler 和 `smoke_app_manager` route smoke；`idf.py build` 通过并刷入 `/dev/cu.usbmodem111301`。板端上传新版 `smoke_app_manager` 后，`GET /app/api/ping` 返回 Lua callback JSON `{"ok":true,"route":"ping","app":"smoke_app_manager"}`，`metrics.json` 记录 `webui_enabled=true,webui_registered=true,webui_requests=1,last_webui_path="/api/ping",route_base="/app"`；随后 `npm run app-manager:smoke -- --board http://192.168.1.32:8080 --polls 12 --interval-ms 500` 仍返回 `smoke_app_manager->smoke_key`，最终 `/stop` 后 `/status` 回到 `idle,app_count=41`。范围边界：当前仍是单 active App callback、短响应 body 的 bridge，未覆盖静态 WebUI assets、多路由表、auth/CORS 或完整 `mini_claw`。
2026-06-25 `mini_claw` 进一步补上 board smoke：它先前误用了 numeric timer mode `1`，在当前 Runtime 里等价于 `tmr.ALARM_SEMI`，所以轮询 timer 只触发一次就退出，导致 `/status` 卡在 `starting`。已改为 `tmr.ALARM_AUTO`，重新打包并上传后，`npm run lifecycle:smoke -- --board http://192.168.1.32:8080 --app mini_claw --allow-starting` 显示 `state=running,current_app=mini_claw`，`GET /app/api` 返回 `{"ok":true,"route":"api","method":"GET"}`，`POST /app/api` with `{"action":"brightness","level":30}` 返回 `{"ok":true,"level":30}`，`/stop` 回到 `idle`。这把 WebUI POST body 透传和 `sys.setbrightness` 的 board smoke 从 build-verified 推进到 board-verified；静态 assets/auth/CORS 仍是后续范围。

优先顺序：

1. 对已迁移 App 做人工/外设证据补齐：照片、可听输出、真实 STT、真实 BLE/Xbox 输入和长 soak；
2. 继续按上游 App 清单做 API inventory 和最小迁移；`BTC` 最小网络价格面板、`Settings` 最小设备设置面板、`hwmon` 最小 host metrics 面板、`Spectrum` 合成频谱面板、`videos` GIF playlist、`photos` PNG/BMP image playlist、`plane` sprite game、`lv-benchmark` minimal runtime benchmark、`mini_claw` WebUI agent service 和最小 WebUI route bridge 已完成；下一批自动化工作可以从 remaining upstream apps 或真实外设补证中选；
3. 对已经 machine-smoked 的 App 补长期稳定性、错误恢复和 release 记录；
4. LVGL/API 扩展继续跟随真实 App 需求，不一次性追完整上游表面。

已迁移应用：

| 上游 App | 本地路径 | 已补 Runtime 能力 | 当前验证 |
| --- | --- | --- | --- |
| `MatrixRain` | `apps/matrix_rain/` | 最小 `lv_canvas_*`、canvas draw rect、canvas frame begin/end、canvas fill bg、常用 LVGL 常量 | package/static/build + lifecycle smoke |
| `NixieClock` | `apps/nixie_clock/` | PNG 解码配置、`time.getlocal()`、`lv_obj_remove_style_all`、`lv_img_set_antialias` | package/static/build + lifecycle smoke；照片待补 |
| `clock` | `apps/clock/` | `lv_img_set_angle`、`lv_img_set_pivot`、`lv_img_set_zoom`、文本字体/透明度/对齐/字距样式 | package/static/build + lifecycle smoke；照片待补 |
| `ConwayLife` | `apps/conway_life/` | canvas draw rect、time label、`time.getlocal()`、`lv_font_load`/`lv_font_free` fallback、字体资源路径适配 | package/static/build + lifecycle smoke |
| `FluidPendant` | `apps/fluid_pendant/` | canvas draw rect、time label、`time.getlocal()`、timer loop、Viper 缺失时 Lua fallback | package/static/build + lifecycle smoke |
| `BTC` | `apps/btc/` | HTTP ticker、JSON decode、app-local config、metrics、LVGL price panel | board lifecycle smoke with local mock price；完整上游 K 线/canvas UI、真实 Binance 外网路径和照片待补 |
| `Settings` | `apps/settings/` | LVGL settings panel、key navigation、local brightness value、metrics；Runtime 已有 board-smoked `sys.setbrightness` 背光调用路径 | board lifecycle smoke + HTTP key injection metrics；Settings 接入真实背光控制 UI、真实 WiFi/gamepad 控制和照片待补 |
| `hwmon` | `apps/hwmon/` | HTTP host state fetch、JSON decode、app-local config、metrics、LVGL hardware monitor panel | board lifecycle smoke with local mock host metrics；真实 host_monitor、上游 WebUI route/httpd 和照片待补 |
| `Spectrum` | `apps/spectrum/` | real I2S microphone capture、Goertzel band analyzer、single-label LVGL visualizer、timer animation、key mode toggle、metrics | board lifecycle smoke with real I2S metrics + clean stop；物理 microphone 响应照片、上游 FFT/`spectrum` module 和更丰富视觉仍待补 |
| `videos` | `apps/videos/` | app-local GIF playlist、`lv_gif_create`/`lv_gif_set_src`、file.listdir、key navigation、metrics | board lifecycle smoke + HTTP key injection metrics；真实视频/多 GIF 媒体集和照片待补 |
| `photos` | `apps/photos/` | app-local PNG/BMP image playlist、`lv_img_create`/`lv_img_set_src`、file.listdir、key navigation、metrics；已适配 Camera 保存的 BMP 照片尺寸 | board lifecycle smoke + HTTP key injection metrics；2026-07-03 用户确认可正常显示 Camera 实拍照片；上游 canvas slideshow、多图片集和长稳照片 sweep 待补 |
| `camera` | `apps/camera/` | Runtime GC2145 preview、capture/save BMP、capture busy overlay、gallery-entry hint、on-device gallery、WebUI capture/list API、SD photo storage | 2026-07-03 board/user verified：可打开预览、拍照保存到 `/sd/data/camera/photos`、Camera 内相册显示、standalone Photos 显示；多次拍照/删除 soak、Web 下载/清理 polish 和进一步画质调优待补 |
| `plane` | `apps/plane/` | app-local BMP sprites、`lv_img_create`/`lv_img_set_src`、timer game loop、key movement/shooting、metrics | board lifecycle smoke + HTTP key injection metrics；上游 Plane War 关卡/道具/boss/IMU 控制、游戏手感和照片待补 |
| `lv-benchmark` | `apps/lv-benchmark/` | minimal LVGL benchmark panel、rect/label/arc/image transform、timer frame metrics | board lifecycle smoke + sustained frame metrics；完整上游 line/table/flex/monitor benchmark、FPS 统计和照片待补 |
| `Weather` | `apps/weather/` | WiFi/HTTP/sjson/time、PNG/BMP、canvas、font、deferred background timer、lifecycle metrics | board lifecycle smoke；多天气态照片待补 |
| `voice_ai` | `apps/voice_ai/` | audio/i2s/http bridge、file-backed recording、PCM conversion/upload、mock/command provider、local Apple Speech STT、GIF/UI 状态 | board/user verified：录音、上传、local STT、回复显示已成功；云 STT/LLM provider、长音频 soak、生产增益/噪声和 GIF 肉眼回归待补 |
| `nesgame` | `apps/nesgame/` | native facade、NES core、ROM selector、display DMA shim、gamepad host API、fallback PCM | board smoke；真实手柄/音频/长 soak 待补 |

每个 App 的迁移流程：

```text
读取上游 main.lua
  -> 列出使用的 Lua 模块和 lv_* API
  -> 对照 runtime-capabilities
  -> 缺什么补什么
  -> 写 smoke/compat 测试
  -> 真机运行
  -> 记录日志和截图/描述
```

验收标准：

- 每个 App 都有独立 bring-up 记录；
- 每个 App 都明确哪些地方保持上游兼容，哪些地方做了 VibeBoard 适配；
- 不把“能打包”误写成“能运行”；
- package/static/build 通过后，必须补真机屏幕验证才能标记为 board-verified。

## Phase 10：Native Module 和 NES

目标：验证 `.so` 动态模块作为高性能能力扩展。

已完成第一阶段：

```text
firmware/vibeboard_runtime/main/module_abi.h
firmware/vibeboard_runtime/main/native_module_loader.c
firmware/vibeboard_runtime/main/native_module_loader.h
firmware/vibeboard_runtime/main/lua_native_module.c
firmware/vibeboard_runtime/main/lua_native_module.h
apps/nesgame/
docs/native-module-abi-notes.md
```

当前状态：ABI、`require("nes")` 搜索器、app-local native manifest、静态 NES adapter、上游 NES C++ core 链接、ROM iNES header 校验、显示 DMA host shim、基础输入映射、native gamepad host API、`nes.start/state/stop/read_audio/input` Lua API、迁移字段别名和 `rendered_frames` 状态兼容都已 build/static verified。合法 mapper-0 ROM 已上板验证，且约 56 秒 smoke 返回 `samples=113,frames=26->1835,frame_growth=1809,audio=1024`，说明持续显示路径和 Lua fallback PCM 读取可跑。`apps/nesgame` 已补 app-local ROM fallback 和机器可读 metrics，并在板端验证选择器扫到 `roms/smoke.nes` 后能通过 `UP/LONG_START` 启动 ROM，帧数从 `433` 增到 `722`。synthetic HTTP/Lua gamepad 注入到 native host mask 已板端验证（`host_gamepad_active=true,host_gamepad_mask=129`）。仍缺硬件音频输出、真实 BLE/Xbox 输入源、更长真实游戏压力测试和 physical UX 观察。

后续需要新增或修改：

```text
modules/nes/
firmware/vibeboard_runtime/main/native_module_loader.c
firmware/vibeboard_runtime/main/native_host_api_*.c
apps/nesgame/
docs/native-module-abi.md
```

任务：

1. 确定 ESP-IDF、ESP-ELFLoader、工具链版本。**当前采用静态 adapter + app-local `.vbn` manifest，不依赖运行时加载 `.so`。**
2. 定义 VibeBoard Native Module ABI。**第一阶段已完成：`vibeboard-native-module-abi@1`。**
3. 编译或导入 `nes.so` / app-local native payload。**当前已改为链接上游 NES C++ core，并通过 `native/nes.vbn` 走 Runtime native facade。**
4. 部署：

```text
/sd/apps/nesgame/native/nes.vbn
/sd/apps/nesgame/
/sdcard/apps/smoke_nes/roms/smoke.nes
```

5. Lua 支持：

```lua
local nes = require("nes")
```

6. 实现 payload manifest、symbol 和 ABI 版本检查。
7. 实现错误提示：

```text
Native module ABI mismatch
Native module load failed
```

验收标准：

- `require("nes")` 能返回 core-backed Lua module；**build/static verified，并通过 `smoke_nes`/`nesgame` 板端 smoke 间接覆盖。**
- ABI 不匹配时错误清楚；**静态测试覆盖。**
- `nesgame` 至少能显示 ROM 选择或模块状态；**已真机 smoke：app-local ROM 选择器和合法 ROM 启动均通过。**
- 性能问题单独记录，不和加载能力混在一起。

## Phase 11：音频和 Voice AI

目标：让 `voice_ai` 从 UI 样本变成可用设备 App。

当前状态：I2S RX/TX、file-backed recording/playback、`i2s.write`、Voice AI mock provider、command provider 音频上传路径和本机 local Apple Speech STT 路径都有本地/板端证据；`apps/voice_ai` 能进入录音、上传、识别、回复显示 UI 状态，用户已确认设备端真实语音识别成功。ES8311/功放已有可听 tone 证据，麦克风实录质量经过通道/采样率调校后可用。仍缺生产云 STT/LLM provider 路由、凭证/隐私日志策略、长时间音频 soak、GIF/屏幕物理回归、弱网/无 bridge 人工验证，以及生产级增益/噪声调优。

需要新增或修改：

```text
firmware/vibeboard_runtime/main/lua_audio.c
firmware/vibeboard_runtime/main/lua_i2s.c
apps/voice_ai/
desktop-bridge/ 或 web-console bridge
docs/voice-ai-flow.md
```

任务：

1. 根据立创官方例程确认 ES7210/ES8311/功放/麦克风路径。**已完成基础 bring-up：440 Hz tone 可听，file-backed 录音/回放可用；生产级噪声/增益和长稳待补。**
2. 实现最小录音 API。**`audio.record_wav` 已实现并 smoke 覆盖。**
3. 实现音频文件或流式上传。**command provider 上传路径已板端验证。**
4. `voice_ai` 调桌面 bridge。**mock/command provider 和 local Apple Speech STT 已验证；云 STT provider 待产品化。**
5. bridge 返回中文回复和可选 LVGL UI snippet。**本地识别结果已能显示回设备；云 provider、UI snippet 和错误/隐私 UX 仍待产品化。**

验收标准：

- 设备能录音；
- 能把音频发到桌面 bridge；
- bridge 能返回文本；
- 屏幕能显示用户识别文本和 AI 回复；
- 无网络/无 bridge 时有明确错误状态。

## Phase 12：稳定化和发布

目标：把实验 Runtime 变成可重复烧录、可回归测试、可发布的版本。

任务：

1. 固定 sdkconfig 和 partition。
2. 生成 release 包：

```text
bootloader.bin
partition-table.bin
vibeboard_runtime.bin
flash_args
```

3. 写清楚刷机说明。
4. 增加版本号：

```text
Runtime version
API version
App package schema version
Native module ABI version
```

5. 增加兼容性检查：

- App 要求的 Runtime API 版本；
- Runtime 实际支持的 API；
- 不兼容时拒绝启动并给出原因。

验收标准：

- 新机器按文档可重复刷机；
- SD 卡放 `smoke_ui` 可直接运行；
- 版本信息能在串口和屏幕状态页看到；
- release 文档不会依赖当前聊天上下文。

## 推荐近期执行顺序

当前 Phase 5B、输入基础、设备端部署、Weather 大背景、Voice AI mock/command provider 和 NES smoke 都已有机器证据。后续不要按旧的“先补 Launcher 5B”重复排期，建议按这个顺序：

```text
1. 人工/外设验证补证：照片、可听输出、真实 STT、真实 BLE/Xbox、长 soak
2. 继续上游 App 迁移：先做 API inventory，再按缺口补 Runtime
3. 产品化 device-web：浏览器本地包上传、日志摘要、错误详情
4. 强化部署可靠性：更严格 commit/rollback、半包恢复、版本兼容拒绝
5. 发布化：release 包、刷机说明、版本矩阵、长回归
```

这样最符合当前风险：

- 当前上传、远程启动、本地 Web 管理、原生 Launcher、触摸启动、stop/switch、错误恢复和 Weather/NES/voice_ai 的机器 smoke 已经可用；
- 最大缺口已经从“基础 Runtime 能否跑”转成“真实外设/真实 provider/长期稳定性是否可证明”；
- LVGL/API 扩展要跟着真实 App 需求走，不要盲目一次性补完整上游；
- device-web、删除、staging、版本兼容已经有第一版，下一步是产品化和边界条件；
- NES、音频和 AI 语音已过最小机器路径，剩余风险集中在物理输入/输出、真实服务和长时间运行。

## 下一步具体建议

下一步开发建议按条件二选一：

- 如果板子、音箱/耳机、手柄、真实 STT provider 和拍照条件齐全，先做一轮人工/外设验证补证；
- 如果只能做自动化开发，下一步可以继续推进仍未完成的 remaining upstream App 切片，或者把 `weather` / `voice_ai` / `nesgame` / `Spectrum` 的物理证据补齐；`BTC`、`Settings`、`hwmon`、`Spectrum`、`videos`、`photos`、`plane`、`lv-benchmark`、`mini_claw` 和最小 WebUI route bridge 都已完成机器验证，其中 `Spectrum` 已切换到真实 I2S microphone capture + Goertzel bands，并通过 audio metrics + clean stop，仍待照片/真实麦克风响应观察。

当前 WebUI route bridge 状态：

- 已验证完成：`npm run test:validator`、目标 `firmware-static`、`npm run test:packager`、`idf.py build`、`npm run package:app -- apps/smoke_app_manager`、`npm run package:demos`、`git diff --check` 通过；
- 已上板完成：刷入 `/dev/cu.usbmodem111301`，上传新版 `smoke_app_manager`，`GET /app/api/ping` 返回 Lua route JSON，metrics 记录 route request，`npm run app-manager:smoke` 仍通过；
- 后续不要把这个能力扩大表述成完整 WebUI/httpd：它仍是单 active App callback、短响应 body 的最小 bridge。

自动化切片建议：

```text
1. 读取目标上游 App 的 main.lua 和资源清单；
2. 列出所有 Lua module、lv_*、资源格式和事件需求；
3. 对照 docs/runtime-capabilities.md 与 AI contract；
4. 先写失败的 validator/static/smoke 测试；
5. 只补该 App 需要的 Runtime API 或兼容 shim；
6. 打包、本地测试、必要时上板 lifecycle smoke；
7. 把验证证据回写到 development-plan、device-bringup 和 next-session-plan。
```

原因：

- `tmr`、`file`、资源路径、基础 LVGL、网络模块、免拔 SD 远程启动、Launcher lifecycle 和本地 Web 管理已经完成到可验证阶段；
- 当前最适合自动推进的工作是继续用真实 App 倒逼 API，而不是为抽象完整性补大而全绑定；
- 真实音频、真实 STT、真实手柄和照片证据需要外部条件，适合在用户确认硬件环境后集中补。

## 当前性能优化重点

Weather 背景加载已经确认不是单纯 SD 卡物理读速问题：同一张 `storm.bmp`/`storm.vbimg`
通过 `/debug/sd-bench` 约 `121-125 ms`，但 Weather 的 Lua/LVGL app 运行态背景路径仍
明显更慢。2026-07-07 的实机 probe 确认了不能通过增大静态内部 DMA 读缓冲解决：
`16 KB` 链接溢出，`8 KB`/`6 KB` 会让 LVGL 任务创建失败并重启。随后落地了
Runtime-native `.vbimg` 格式：packager 把兼容 RGB565 BMP 预转换为 `.vbimg`，Weather
优先调用 `lv_canvas_load_vbimg` 并保留 BMP fallback。板端 smoke 已证明
`perf_background_fast_path=true`，但 app 运行态仍只能拿到 `2944-4608` 字节的最大连续
内部 DMA 块，实际读块回退为 `4096`，`lv_canvas_load_vbimg` 冷读约 `610 ms`；一次 Lua
侧同文件预读后，后续 canvas 读降到约 `331 ms`。这说明 `.vbimg` 解决了资源格式/解码
契约，剩余瓶颈是 app-context SD 读取、缓存和调度。

后续资源加载优化应优先走这些方向：

- 继续保留 `.vbimg` 作为大图资源格式和 Runtime API 契约；
- 增加 Runtime 级资源 cache/prewarm，让大资源在首屏后可观测地预读一次，后续页面或
  背景切换复用缓存，而不是每个 Lua App 自己手写 loading 和探针；
- 启动完成后尝试临时 DMA scratch，失败时回退稳定 `4 KB` 缓冲，并把实际 chunk、最大
  DMA 连续块写入 metrics；
- 降低重资源体积或改资源格式，让首屏和底图加载不争抢启动期内部内存。

完成后，项目阶段可从：

```text
已可安装、可启动、可切换、可联网、可恢复并能跑代表性 App 的 Runtime
```

推进到：

```text
更多上游 App 可迁移、外设路径被真实证明、发布记录可重复的 Runtime
```
