# VibeBoard Runtime GPL 开发计划

更新时间：2026-06-20

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

当前还不是完整 Cubic Lua/HoloCubic 运行时。相对上游成熟度，当前约为 **65% 到 75%**：核心方向、文件/资源、基础控件、定时器、网络 API、免拔 SD 部署、原生 Launcher、基础 App 生命周期、manifest v2、staged install/delete、浏览器管理 UI、Weather 迁移、首批上游显示类 App 迁移、第一轮 key-driven App 迁移、Lua App manager 只读/退出 API、Voice AI 桥接骨架、以及 NES native/core 首个可执行路径已经进入可验证阶段；完整应用生态、更多 LVGL 覆盖、真机视觉 QA、真实麦克风/音频输出、真实 AI 服务商接入、NES ROM 上板验证和 native gamepad/audio 仍需补齐。

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
- `file` 最小 API 已实现：读取 app-local 配置、列目录、文件句柄读写、app-local 写入；
- `wifi`、`http`、`sjson`、`time` 最小 API 已真机验证；
- `set_interval` 作为早期兼容层保留，但主要方向已经转向 `tmr`。

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
- `POST /install/abort?stage=<stage>` 可丢弃 staged 上传；
- `POST /apps/delete?app=<id>` 可删除未运行的 App；
- `/status` 已返回 runtime、Lua API、LVGL API、package schema 和 native ABI 版本信息；
- Mac 工具已支持：

```bash
npm run package:app -- apps/smoke_visual
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_visual_remote
npm run launch:app -- http://192.168.1.32:8080 smoke_visual_remote
```

设备端启动链路：

- 开机显示原生 `VibeBoard Apps` 列表，而不是自动运行第一个 App；
- 触摸点击列表项可启动对应 App；
- BOOT 短按选择列表项，BOOT 长按启动选中 App；
- 启动前会复用 `app_runner` stop/switch 生命周期；
- 缺少入口文件的 App 会被跳过，避免启动时才报错。

验证和文档：

- `npm test` 已覆盖 validator、packager、AI contract、uploader、plan writer、firmware static check；
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
- `apps/weather` 已完成第一轮迁移：`json` alias、`http.cubicserver.get`、Cubicserver runtime config、gzip 移除策略、轻量 LVGL 面板替代小 canvas blur，并已用本地 Cubicserver mock 完成上板 HTTP 生命周期验证；
- `apps/voice_ai` 的第一轮支撑能力已进入 build-verified：I2S RX Lua 模块、LVGL GIF widget、`json` alias、`app.exit`、以及 provider-neutral `desktop-bridge/server.mjs`。真实麦克风采集、真实 AI 服务商和 GIF 视觉上板仍待验证；
- `apps/nesgame` / `apps/smoke_nes` 的第一轮 native 路径已进入 build-verified：native manifest loader、静态 NES adapter、host API v1 shim、上游 NES C++ core 链接、ROM iNES header 校验、`nes.start(path, opts)`、`nes.state()`、`nes.input.*`、`nes.read_audio([max_bytes])`。合法 ROM、真实显示、音频输出和 native gamepad 仍待上板；
- `tools/app-packager` 的 demo 打包列表已包含 `matrix_rain`、`nixie_clock`、`clock`、`conway_life`、`fluid_pendant`、`smoke_key` 和 `2048`；
- 这些迁移已通过静态测试、packager 测试、总测试、`git diff --check` 和 ESP-IDF build；2026-06-17 已重新烧录固件并修复启动期 `main` 栈溢出、HTTP handler 数量不足和 LVGL flush 等待触发 watchdog 的问题。
- 2026-06-19 重新连接正确 ESP32-S3 板后，临时刷回 VibeBoard Runtime 并验证 `/status`、chunked `/apps`、`2048` staged upload/list/launch 闭环；同日修复 LVGL SPI DMA internal-memory 压力、HTTPD stack 分配到 PSRAM、`/apps` 大列表 JSON 截断、Lua runner task stack 分配到 PSRAM、SDMMC/FATFS 内部 DMA 内存不足、以及 `2048` 对 no-arg batch 和小尺寸 canvas 的误用。后续真机验证又暴露 `lvgl object table full`，已改成复用释放后的对象槽、删除对象子树时同步清理 Lua 句柄表，并把对象句柄上限提高到 128；重刷后 `2048` 持续约 90 秒 HTTP 状态保持 `running,last_status=ESP_OK`。用户随后确认屏幕显示、真实触摸滑动和双次退出手势行为正常。
- 已新增第一版真实输入桥：触摸任务只把滑动事件入队，Lua runner 在 Lua/timer loop 中 drain 到 `key.on` 回调；`2048` 触摸滑动已由用户在真机确认通过。
- 已新增 `apps/smoke_key` 作为通用 key 输入 smoke：屏幕显示最近输入事件，定时通过 `key.push()` 注入 LEFT/RIGHT，后续上板用它补 2048 之外的输入回归证据。
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
- Lua 侧已有 `app.list()` / `app.rescan()` / `app.current()` / `app.exiting()` / `app.exit()`，但还没有安全的 `app.launch(id)` app-to-app handoff；
- 还不能直接运行完整上游 HoloCubic 全量 App，只能按 App 驱动逐个补兼容层；
- LVGL 绑定覆盖还不够广，尤其 list/arc/switch/dropdown/textarea/roller/slider、flex/grid、字体和 canvas 高级效果；
- 触摸滑动到 Lua `key.on` 的第一版已通过 `2048` 真机验证；还没有 BOOT/长按/repeat 的完整 Lua 输入语义，`smoke_key` 还需要补物理触摸手势的独立上板记录；
- Native NES 已经 build-verified 到核心启动路径，但还缺合法 ROM 上板、真实显示所有权压力测试、音频输出和 native gamepad；
- Voice AI 只有本地 bridge skeleton 和 I2S/GIF build verification，真实麦克风、真实 STT/LLM、凭证策略和端到端上板还没完成；
- Runtime/API/App schema 版本兼容已经有基础元数据，但还需要更严格的工具侧拒绝和升级提示。

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

- 暴露 FT6336 touch 给 Lua；
- 已有 `key.on(...)` / `key.off(...)` / `key.push(...)` 兼容层，可支持上游 key-driven App 的软件触发和 API 形状；
- 触摸滑动到 `key` 队列桥接已通过 `2048` 真机验证；下一步用 `smoke_key` 做独立输入 smoke，上板后继续补物理按键、长按、repeat 或新增 `touch.on(...)`；
- 给按钮、列表、Launcher 选择提供真实交互；
- 已新增 `apps/smoke_key` 显示最近 key 事件；后续再做 `apps/smoke_touch` 显示触摸坐标和点击状态；
- 验证快速点击不会导致 Lua/LVGL 崩溃。

第四优先级：扩展 LVGL/API 覆盖。

- 补常用控件：list、arc、switch、dropdown、textarea、roller、slider；
- 补常用样式：font、opacity、shadow、line、flex/grid 基础；
- 补图片/字体资源加载的稳定路径；
- 建立 “AI 可以生成的 UI API 白名单”；
- 让工具在 App 使用未支持 API 时提前报 `Runtime update required`。

第五优先级：设备端 App 管理。

- Lua 侧 `app.list()`、`app.current()`、`app.rescan()`、`app.exiting()`、`app.exit()` 已 build-verified；
- HTTP 删除 App、staged upload + commit/abort、浏览器端管理 UI、Runtime/API/App schema 版本查询和不兼容 App 拒绝启动已经完成第一版；
- 后续补 `app.launch(id)` 的非重入 handoff 设计、App 包 hash 校验、更严格的工具侧版本拒绝和升级提示。

第六优先级：上游兼容和高级能力。

- `weather` 已完成第一轮迁移和本地 Cubicserver mock 上板验证，后续只在需要时恢复更丰富 canvas/blur 视觉；
- `voice_ai` 下一步是麦克风真机录音、真实 STT/LLM provider、GIF 上板视觉和端到端语音回合；
- NES/native module ABI 已进入 linked-core build-verified，下一步是合法 ROM、真实显示、音频输出和 gamepad-native 逐项上板；
- 不要绕过硬件证据直接宣称 Voice AI 或 NES 完成。

### 推荐最近三个开发切片

1. **NES 合法 ROM 上板验证**

   目标是把 build-verified 的 NES core 路径变成 board-verified。

   验收：

   - 准备一个合法/public-domain iNES ROM 到 `/sdcard/nes/smoke.nes`；
   - 重新烧录 VibeBoard Runtime 后启动 `apps/smoke_nes`；
   - `nes.start(path, opts)` 返回成功，`nes.state()` 显示 core running/frames 增长；
   - 屏幕能看到 NES RGB565 输出；
   - 若没有 ROM，App 仍能显示精确 `open rom failed` 诊断。

2. **真实输入事件接入**

   目标是把已经通过 `2048` 验证的触摸滑动到 `key` 队列桥接扩成独立输入 smoke，并继续补物理按键。

   验收：

   - `apps/2048` 能通过触摸滑动触发上下左右；**已由用户真机确认。**
   - `apps/smoke_key` 能显示 `key.push(...)` 注入的 LEFT/RIGHT 事件；
   - `apps/smoke_key` 能显示真实触摸滑动转换后的 key 事件；
   - 事件 handler 在 App 停止/切换时清理；
   - 快速输入不会导致 Lua/LVGL 崩溃。

3. **Voice AI 端到端 smoke**

   目标是把 build-verified 的 `voice_ai` 支撑能力连成真机闭环。

   验收：

   - `/sdcard/runtime/i2s.json` 写入真实麦克风引脚；
   - `apps/smoke_i2s` 能录到非零 PCM；
   - `desktop-bridge/server.mjs` 能被板端访问；
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

这些能力还没有完成：

- 不能运行完整上游 `weather`；
- 不能运行完整 `voice_ai`；
- 不能运行 `nesgame`；
- `wifi`、`http`、`sjson`、`time` 已真机验证最小路径；
- 没有 Lua 可用的触摸/按键事件；
- 原生屏幕 Launcher、触摸选择、BOOT 备用选择和受控 App 切换已经完成 Phase 5A；但还没有返回 Launcher、屏幕停止/刷新和屏幕错误恢复；
- HTTP 上传、列表、重扫、远程启动、受控停止/切换、staged install、commit/abort 和 delete 已完成第一版；还没有浏览器管理 UI；
- 图片、PNG、最小 canvas 和一批常用 LVGL 图片/文本样式绑定已补齐；字体加载、动画和完整控件覆盖仍不足；
- 没有 Native `.so` 动态模块加载 ABI；
- `tmr` 事件循环已经从固定 8 秒 smoke loop 改为 timer-driven loop，并支持 stop/switch 停止请求；完整生命周期状态机要等 Phase 5B 补齐。

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
| App 管理 | `app` 模块 | HTTP `/launch`、`/stop`、`/rescan`、staged install、delete 已可用；Lua `app.*` 模块未做 | P1 |
| 输入 | `key`/事件 | touch 初始化但未暴露给 Lua | P1 |
| 资源 | 图片/字体/资产路径 | App-local 路径、`lv_img_*`、BMP/PNG、最小 canvas 已编译通过；字体加载路线仍弱 | P1 |
| Web 安装卸载 | 有路线 | HTTP staged install/delete 已实现；浏览器 UI 未做 | P2 |
| Native 模块 | NES `.so` | 源码吸收，未运行 | P3 |

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
- [ ] 错误路径有明确日志；
- [x] App-local 资源路径解析和 LVGL `S:` 文件系统驱动真机 smoke；
- [x] 高频 LVGL 位置、flag、label long mode 绑定真机 smoke；
- [x] `apps/smoke_assets` 真机 smoke；
- [ ] PNG/BMP/SJPG 或 LVGL bin 图片解码；
- [ ] App-local 字体资源加载路线。

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

- `apps/smoke_lvgl_widgets` 能显示 label、button、bar、image；
- `apps/weather` 的 UI 部分能至少进入首屏，不因缺基础控件直接失败；
- LVGL 对象表支持足够数量对象，且对象清理后不会引用悬空指针；
- 每个新增绑定都记录在 `docs/runtime-capabilities.md`。

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
- **Phase 5B 待收尾：返回 Launcher、屏幕停止/刷新/错误提示、上传可靠性、Lua 侧 App manager API。**

需要新增或修改：

```text
firmware/vibeboard_runtime/main/app_registry.c
firmware/vibeboard_runtime/main/app_runner.c
firmware/vibeboard_runtime/main/lua_app.c
firmware/vibeboard_runtime/main/launcher.c
firmware/vibeboard_runtime/main/launcher.h
apps/launcher/
docs/runtime-capabilities.md
```

实际实现采用 `launcher_ui.c` / `launcher_ui.h` 的原生 LVGL Launcher，而不是 `apps/launcher/` Lua App。原因是当前阶段需要稳定的系统级 app-selection screen；Lua Launcher 和 `app.*` API 后移到 Phase 5B。

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

4. 实现 App 生命周期。**HTTP `/status.state` 已完成第一轮真机验证；屏幕端状态反馈仍待 Phase 5B。**

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
- 返回 Launcher；**待 Phase 5B。**
- App 失败时显示错误。**待 Phase 5B。**

验收标准：

- SD 卡放多个 App 时，Launcher 能列出；**已验收。**
- 能从 Launcher 启动 App；**已验收，触摸点击和 BOOT 长按均可启动。**
- 能退出 App 回到 Launcher；**待 Phase 5B。**
- `app.rescan()` 能识别新复制的 App；**HTTP `/rescan` 已验收，Lua `app.rescan()` 待 Phase 5B。**
- App 崩溃不会导致整个 Runtime 崩溃。**已通过 `apps/smoke_fail` 真机验证；屏幕错误恢复体验待 Phase 5B。**

## Phase 6：触摸、按键和输入事件

目标：把硬件输入暴露给 Lua，让 App 可以交互。

需要新增或修改：

```text
firmware/vibeboard_runtime/main/lua_key.c
firmware/vibeboard_runtime/main/lua_touch.c
firmware/vibeboard_runtime/main/board_lckfb_szpi_s3.c
apps/smoke_touch/
apps/smoke_input/
```

任务：

1. 把 FT6336 touch 事件接到 Lua。
2. 实现：

```lua
touch.on("down", callback)
touch.on("move", callback)
touch.on("up", callback)
```

3. 如果板子有可用按键，增加 `key` 模块：

```lua
key.on("short", callback)
key.on("long", callback)
```

4. 事件回调必须在 Lua runtime 线程安全执行，不能直接从中断或 LVGL 回调乱入 Lua VM。

验收标准：

- `apps/smoke_touch` 能显示当前触摸坐标；
- 点击 Launcher 列表能启动 App；
- 快速点击不会导致 Lua panic；
- App 退出时事件 handler 被解绑。

## Phase 7：设备端安装、卸载和免拔 SD 部署

目标：减少反复拔插 SD 卡，让 App 可以通过网络或 USB 辅助工具安装。

当前状态：HTTP 安装服务、远程启动、staged install/commit/abort、delete 和版本状态字段已完成第一版实现。它不是最终完整 API，但已经证明 Runtime 可以在板端接收文件、写入 staging、提交到正式 App 目录、重扫 App、删除未运行 App，并按 app id 启动已安装 App。

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

- 还没有浏览器 UI；
- staging commit 目前是实用替换流程，不是严格文件系统级原子 rename；
- 删除运行中 App 会被拒绝；如果需要“先 stop 再 delete”的产品流程，应由工具或 Web Console 编排；
- `/launch` 已支持受控切换，`/status.state` 已完成 idle/running/failed/stop/recovery 真机验证；屏幕端错误恢复仍需 Phase 5B 收尾；
- staged install/delete 已通过本地测试和固件构建；后续仍需补一轮真机安装中断和删除恢复验证。

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

4. 失败时尽量保留旧 App。**工具默认 staged upload，减少半包被启动风险；严格回滚语义仍需强化。**
5. Web Console 支持：

- 选择本地 App 包；
- 上传；
- 查看安装结果；
- 删除 App；
- 触发 rescan；
- 查看设备日志摘要。

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

当前状态：上游兼容路线已经开始落地。`MatrixRain`、`NixieClock`、`clock`、`ConwayLife`、`FluidPendant` 和 `2048` 已迁移为本地 App 包并驱动补齐了一批 LVGL/time/PNG/canvas/font-fallback/key/animation 能力。当前验证层级是 package/static/build，加上 2026-06-19 临时 Runtime 上的 `/status`、`/apps` 和 `2048` upload/list/launch 验证；`2048` 已保持 `state=running,current_app=2048,last_status=ESP_OK`，真实触摸滑动到 `key.on` 和双次退出确认已由用户真机确认。

优先顺序：

1. 上板验证 `matrix_rain`、`nixie_clock`、`clock`、`conway_life` 和 `fluid_pendant`；
2. `2048` 或其他轻量交互 App：倒逼 touch/key Lua 输入事件；
3. `weather`：复用已实现的 WiFi/HTTP/JSON/time，补完整 UI 适配；
4. `voice_ai`：需要音频和 bridge，排在网络 UI 路线稳定之后；
5. `nesgame`：需要 Native module ABI 和 NES 动态模块，最后做。

已迁移应用：

| 上游 App | 本地路径 | 已补 Runtime 能力 | 当前验证 |
| --- | --- | --- | --- |
| `MatrixRain` | `apps/matrix_rain/` | 最小 `lv_canvas_*`、canvas draw rect、canvas frame begin/end、canvas fill bg、常用 LVGL 常量 | package/static/build |
| `NixieClock` | `apps/nixie_clock/` | PNG 解码配置、`time.getlocal()`、`lv_obj_remove_style_all`、`lv_img_set_antialias` | package/static/build |
| `clock` | `apps/clock/` | `lv_img_set_angle`、`lv_img_set_pivot`、`lv_img_set_zoom`、文本字体/透明度/对齐/字距样式 | package/static/build |
| `ConwayLife` | `apps/conway_life/` | canvas draw rect、time label、`time.getlocal()`、`lv_font_load`/`lv_font_free` fallback、字体资源路径适配 | package/static/build |
| `FluidPendant` | `apps/fluid_pendant/` | canvas draw rect、time label、`time.getlocal()`、timer loop、Viper 缺失时 Lua fallback | package/static/build |

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

第一阶段只建立 ABI、`require("nes")` 搜索器和精确失败边界；没有导入 NES 模拟器核心、显示 DMA、音频或 gamepad native host API。

后续需要新增或修改：

```text
modules/nes/
firmware/vibeboard_runtime/main/native_module_loader.c
firmware/vibeboard_runtime/main/native_host_api_*.c
apps/nesgame/
docs/native-module-abi.md
```

任务：

1. 确定 ESP-IDF、ESP-ELFLoader、工具链版本。
2. 定义 VibeBoard Native Module ABI。**第一阶段已完成：`vibeboard-native-module-abi@1`。**
3. 编译或导入 `nes.so` / app-local native payload。
4. 部署：

```text
/sd/modules/nes.so
/sd/apps/nesgame/
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

- `nes.so` 能被加载；
- ABI 不匹配时错误清楚；
- `nesgame` 至少能显示 ROM 选择或模块状态；
- 性能问题单独记录，不和加载能力混在一起。

## Phase 11：音频和 Voice AI

目标：让 `voice_ai` 从 UI 样本变成可用设备 App。

需要新增或修改：

```text
firmware/vibeboard_runtime/main/lua_audio.c
firmware/vibeboard_runtime/main/lua_i2s.c
apps/voice_ai/
desktop-bridge/ 或 web-console bridge
docs/voice-ai-flow.md
```

任务：

1. 根据立创官方例程确认 ES7210/ES8311/功放/麦克风路径。
2. 实现最小录音 API。
3. 实现音频文件或流式上传。
4. `voice_ai` 调桌面 bridge。
5. bridge 返回中文回复和可选 LVGL UI snippet。

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

短期不要直接追 NES 或完整 AI 语音。前面几条基础能力已经跑通，接下来建议按这个顺序：

```text
1. Phase 5B: Launcher 收尾交互、失败 UI 和上传可靠性
2. Phase 6: touch/key 输入事件
3. Phase 3B: 继续扩展 LVGL 绑定和 AI API 白名单
4. Phase 7B: 删除、staging/commit、浏览器管理页
5. Phase 8: Runtime/API/App schema 版本兼容
6. Phase 9+: NES、音频、AI 语音和 Native 模块
```

这样最符合当前风险：

- 当前上传、远程启动、原生 Launcher、触摸启动和基础 stop/switch 已经可用；
- 最大缺口是“运行后如何回到 Launcher、屏幕上如何停止/刷新、失败时如何可见并恢复”；
- Launcher 已是生命周期、输入事件和用户操作的共同入口；
- LVGL/API 扩展要跟着真实 App 需求走，不要盲目一次性补完整上游；
- 删除、staging、版本兼容属于产品化能力，应在基本切换模型稳定后做；
- NES、音频、AI 语音依赖更多底层能力，应该放到 Runtime 骨架稳定后。

## 下一步具体建议

下一步开发建议开一个“Phase 5B Launcher 收尾”的切片：

```text
1. 运行 App 后提供返回 Launcher 的路径；
2. 在屏幕上提供停止当前 App 的控制；
3. 在屏幕上提供刷新 App 列表的控制；
4. 把 `/status.state` 和 failure detail 显示到屏幕端；
5. 启动失败时在屏幕上显示可理解错误，并保持 Launcher 可用。
```

原因：

- `tmr`、`file`、资源路径、基础 LVGL、网络模块和免拔 SD 远程启动都已经完成到可验证阶段；
- 当前最大的结构性缺口不是上传或启动，而是“运行后怎么收回控制权、失败后怎么在屏幕上恢复”；
- 原生 Launcher 已证明底层启动能力，Phase 5B 应在同一套 runner 生命周期上补产品交互；
- Lua `app.*` API 只有在出现 Lua 桌面、App 内跳转或 App-to-App handoff 时再引入。

完成后，项目阶段可从：

```text
已可安装、可启动、可切换、可联网的 Runtime 雏形
```

推进到：

```text
可恢复、可停止、可刷新、可解释错误的最小产品化 Runtime
```
