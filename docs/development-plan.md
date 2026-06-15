# VibeBoard Runtime GPL 开发计划

更新时间：2026-06-15

## 一句话目标

把 ESP32-S3 小屏开发从“每个应用都要写固件、编译、烧录”改成：

```text
一次烧录稳定 Runtime 固件
  -> AI 或开发者生成 Lua/LVGL App 包
  -> 工具和浏览器验证
  -> 通过 WiFi staged commit 安装到 SD 卡
  -> Runtime 扫描、启动、停止、删除 App
```

普通 App 迭代不重新烧录。只有底层驱动、Lua 模块、LVGL 绑定、上传服务、Native ABI 或 Runtime 行为变化时才需要重新构建和刷固件。

## 当前真实阶段

项目已经进入 **Runtime 产品化闭环初版已跑通** 阶段。

这已经不是单纯的 GPL 源码吸收或文件打包项目。当前在立创 ESP32-S3 小屏设备上已经验证了核心链路：

```text
ESP32-S3 runtime boot
  -> WiFi autoconnect
  -> HTTP/Web Console service on :8080
  -> SD app registry
  -> native launcher
  -> staged app upload/commit
  -> app launch/stop/delete
  -> Lua/LVGL app execution
```

最近重大更新：

- 上传已经从“逐文件直接写正式目录”升级为 `/discard -> /stage -> /commit`，失败不会污染可启动 App；
- App 删除/卸载已实现并真机验证；
- 原生 Launcher 的 Stop、Refresh、返回列表、失败反馈、BOOT 长按停止已经真机验证；
- 板子现在直接提供浏览器 Web Console；
- Web Console 里已经有浏览器直连 OpenAI 的 AI App Creator，能把模型输出的严格 JSON App 文件通过 staged commit 安装到设备。

重要边界：

- Web Console AI 的 OpenAI API key 只存在浏览器侧，不传给 ESP32；
- 浏览器 AI 生成路径已经实现和静态测试，板端页面也已验证可访问；
- 使用真实 API key 从 prompt 到 running app 的人工 smoke 还需要记录到 `docs/device-bringup.md`。

## 已完成并验证

### 1. 板级 Runtime

- ESP32-S3 启动、PSRAM、LCD、背光、LVGL task 已跑通；
- SD 卡挂载到 `/sdcard`，不会在挂载失败时自动格式化；
- FT6336 touch 已用于原生 Launcher；
- Runtime 固件已切到 4MB factory app 分区，能容纳网络、Lua、LVGL、Web Console 和安装服务。

### 2. SD App 执行链路

- Runtime 扫描 `/sdcard/apps`；
- 读取 `app.info`；
- 过滤缺少 entry 文件的坏包；
- 创建 Lua VM 并执行 SD 卡上的 `main.lua`；
- Lua `print()` 输出到 ESP-IDF 串口；
- App 出错会进入可观测的 failed 状态，不再只靠串口判断。

已用作能力 smoke 的 App：

```text
apps/smoke_ui
apps/smoke_timer
apps/smoke_file
apps/smoke_assets
apps/smoke_visual
apps/smoke_network
apps/smoke_fail
```

### 3. Lua 和 LVGL 能力

- NodeMCU 风格 `tmr` 核心 API 已真机验证；
- `file` 最小 API 已真机验证；
- `wifi`、`http`、`sjson`、`time` 最小路径已真机验证；
- 基础 LVGL 对象、label、container、尺寸、定位、颜色、边框、圆角、padding、对齐已可用；
- `S:` SD 文件系统、app-local 资源路径解析、`lv_img_*` 最小图片 API 已可用；
- BMP 解码、button、bar、进度值更新已通过 `smoke_visual` 验证。

### 4. Launcher 和生命周期

- 开机进入原生 `VibeBoard Apps` 列表，而不是自动运行第一个 App；
- 触摸点击列表项可启动 App；
- BOOT 短按选择，BOOT 长按启动；
- 运行中可以 Stop 回到 Launcher；
- Refresh 会重新扫描 SD App；
- 启动失败会显示可理解错误；
- BOOT 长按可停止运行中的 App；
- `/status.state` 已验证 `idle`、`running`、`failed` 和 stop 后回到 `idle`；
- App 启动后再按 BOOT 导致 stale LVGL pointer 的崩溃已修复。

### 5. HTTP 部署和管理服务

当前服务监听端口：

```text
http://<board-ip>:8080
```

当前 HTTP surface：

```text
GET  /
GET  /status
GET  /apps
POST /stage?app=<id>&path=<relative>
POST /commit?app=<id>
POST /discard?app=<id>
POST /install?app=<id>&path=<relative>
POST /rescan
POST /launch?app=<id>
POST /stop
POST /delete?app=<id>
```

已经真机验证：

- `GET /status`；
- `GET /apps`；
- `POST /launch`；
- `POST /stop`；
- `POST /delete`；
- staged upload/commit；
- running-app commit/delete 保护返回 `409 app is running`；
- HTTPD handler 数量和 stack size 已针对新增 endpoint 做过修复。

### 6. Mac 工具链

可用命令：

```bash
npm test
npm run validate:apps
npm run package:app -- apps/smoke_visual
npm run package:demos
npm run upload:app -- http://192.168.1.32:8080 dist/apps/smoke_visual smoke_visual_remote
npm run launch:app -- http://192.168.1.32:8080 smoke_visual_remote
npm run delete:app -- http://192.168.1.32:8080 smoke_visual_remote
npm run write:app-plan -- plan.json
npm run write:app-plan -- plan.json --package
```

`upload:app` 默认使用 staged mode。`--mode direct` 仍保留给恢复和调试。

### 7. Browser Web Console

打开：

```text
http://<board-ip>:8080/
```

已实现：

- 状态显示；
- App 列表；
- 启动 App；
- 停止当前 App；
- 删除 App；
- 选择本地 App 文件夹上传；
- AI Create App。

AI Create App 当前设计：

```text
browser prompt + OpenAI API key
  -> direct call to OpenAI Responses API
  -> strict JSON app package
  -> browser validates id/path/file types
  -> browser uploads with /discard, /stage, /commit
  -> app appears in /apps
```

这是刻意选择的第一版 AI bridge：不在 ESP32 上保存 OpenAI key，也不让 ESP32 代理模型请求。代价是 API key 会暴露给当前浏览器会话，所以只适合可信网络和开发设备。

## 当前主流程

### 本地打包上传

```text
edit app under apps/<id>
  -> npm run package:app -- apps/<id>
  -> npm run upload:app -- http://<board-ip>:8080 dist/apps/<id> <id>
  -> launch from Web Console, native launcher, or CLI
```

### 浏览器手动上传

```text
open http://<board-ip>:8080/
  -> select app folder
  -> upload
  -> staged commit
  -> launch
```

### 浏览器 AI 创建

```text
open http://<board-ip>:8080/
  -> enter OpenAI API key
  -> describe a simple app
  -> generate strict JSON files
  -> staged commit
  -> launch
```

## 当前不能假装已经完成的部分

这些仍然是缺口：

- 还没有正式 WiFi 配置入口；`/sdcard/runtime/wifi.json` 可用，但仍保留 smoke app fallback；
- Web Console AI 还需要一次真实 API-key prompt 到 running app 的人工记录；
- 浏览器 Console 还没有设备日志流、代码编辑器、版本兼容提示等高级体验；
- Lua 侧还没有 `touch.on(...)` / `key.on(...)` 输入事件 API；
- Lua 侧还没有 `app.list()` / `app.launch()` / `app.current()` 等 App manager API；
- LVGL 绑定覆盖仍然有限，不能直接运行完整上游 HoloCubic App；
- Runtime/API/App schema 还没有版本兼容机制；
- Native `.so` 模块加载 ABI 未做，NES 还不能运行；
- 音频和完整 Voice AI 仍未进入实现阶段。

## 下一阶段路线图

### Slice 1: 正式 WiFi 配置入口

目标：让新用户不依赖 `smoke_network/wifi.json` 也能让板子加入 WiFi。

候选方案：

- Mac CLI 写入 `/sdcard/runtime/wifi.json`；
- Web Console 提供 WiFi 配置表单；
- 保留 SD 文件配置，但移除 smoke app fallback。

验收：

- 文档只推荐一个正式配置路径；
- 错误 SSID/password 有清晰日志或 UI 提示；
- 新板子可以按文档接入 WiFi 并访问 `http://<board-ip>:8080/`；
- smoke app fallback 被删除或明确标成临时兼容。

### Slice 2: Web Console AI 真机 smoke

目标：把已经实现的 AI Create App 路径用真实 API key 走完，并留下证据。

验收：

- 输入一个简单需求，比如倒计时、状态卡片或番茄钟；
- 生成 `app.info` 和 `main.lua`；
- 浏览器上传走 `/discard -> /stage -> /commit`；
- `/apps` 能看到新 App；
- 启动后屏幕显示生成的 UI；
- `docs/device-bringup.md` 记录 prompt、结果、HTTP 状态和已知限制。

### Slice 3: Lua 输入事件

目标：让 AI 生成的 App 能做真实交互，而不是只靠 timer 刷新。

建议 API：

```lua
touch.on("tap", function(event)
  print(event.x, event.y)
end)

key.on("boot", function(event)
  print(event.action)
end)
```

验收：

- 新增 `apps/smoke_touch`；
- 屏幕显示当前触摸坐标和 tap 状态；
- 快速点击不崩；
- App stop/switch 后 handler 被清理；
- AI API 白名单和 validator 更新。

### Slice 4: Runtime/API/App 兼容机制

目标：让工具和设备能在启动前判断“这个 App 当前 Runtime 能不能跑”。

建议内容：

- `/status` 或新 endpoint 暴露 runtime version 和 API set；
- `app.info` 增加 `requires_runtime` 或 `requires_api`；
- `manifest.json` 记录生成时目标 API；
- commit 或 launch 前拒绝不兼容 App；
- Web Console AI prompt 自动带入当前支持 API 白名单。

验收：

- 不兼容 App 被拒绝并给出 `Runtime update required`；
- 兼容 App 仍能 staged upload 和 launch；
- 文档和测试覆盖版本字段。

## 中长期路线

### LVGL 覆盖扩展

继续补常用控件和样式：

- list、arc、switch、dropdown、textarea、roller、slider；
- font、opacity、shadow、line；
- flex/grid 基础；
- 图片和字体资源加载的稳定规则。

### Lua App Manager

暂时不做。等出现明确 Lua 桌面、App 内导航或 App-to-App handoff 需求，再实现：

```lua
app.list()
app.current()
app.launch(id)
app.rescan()
app.on(...)
```

### 上游 App 兼容

按能力逐个迁移，而不是一次性搬完整 HoloCubic App：

- 先迁移天气类纯 UI/网络 App；
- 再补需要输入、复杂控件和资源的 App；
- 最后再碰 NES/native module。

### Native Module 和 NES

在生命周期、输入事件和兼容机制稳定前不要推进。NES 依赖更复杂的 Native ABI、输入、帧率、资源和内存边界。

### 音频和 Voice AI

Voice AI 依赖音频采集、播放、网络流、权限和 UI 状态管理。应放在 Runtime 骨架更稳定之后。

## 开发原则

1. 先补 Runtime API，再追 App 数量。
2. 每个新 Runtime 能力都要有：
   - 静态测试；
   - 最小 smoke App；
   - firmware build；
   - 真机日志或屏幕证据；
   - 文档更新。
3. 上游 App 不能直接全量搬上来就算完成，必须按能力拆解。
4. AI 生成 App 只能使用已声明的 Runtime API。
5. 遇到缺失底层能力，工具和 UI 都应明确提示：

```text
Runtime update required
```

## 项目边界

项目路径：

```text
/Users/wq/vibeboard-runtime-gpl
```

许可证边界：

- 本项目是 GPL-3.0-only；
- 本项目直接吸收 `clocteck/holocubic-apps` 和 `clocteck/holocubic-nes-esp32`；
- 原 `/Users/wq/VibeBoard` 仍保持独立 MIT 项目，不混入 GPL 源码；
- 如需互通，只通过文档链接、网络 API、进程边界或构建产物，不复制 GPL 源码到 MIT 仓库。

硬件边界：

- 当前目标板：立创 ESP32-S3 小屏板，320x240 ST7789，FT6336 触摸，SD 卡槽；
- 最近验证串口：`/dev/cu.usbmodem111301`；
- 最近验证板端 IP：`192.168.1.32`；
- 官方示例源码参考：`/Users/wq/Downloads/szpi-s3-esp`。

## 最近推荐顺序

1. 正式 WiFi 配置入口。
2. Web Console AI 真实 prompt-to-running-app smoke。
3. Lua touch/key 输入事件。
4. Runtime/API/App 兼容机制。
5. 继续扩展 LVGL AI 白名单。
6. 再考虑上游 App、NES、音频和 Voice AI。
