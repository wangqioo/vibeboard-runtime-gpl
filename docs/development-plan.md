# VibeBoard Runtime GPL 开发计划

## 当前阶段

当前项目处于 **Phase 2A：App 文件级打包工具可用**。

这不是一个已经可以直接烧录到 ESP32-S3 的完整运行时固件。它现在的价值是把 HoloCubic/Cubic Lua 的 Lua/LVGL App 生态、NES 动态模块源码、VibeBoard 自己的 App 包规范、验证工具和文件级打包工具整理成一个独立 GPL 项目，为后续做真实设备运行时和上传闭环打底。

项目路径：

```text
/Users/wq/vibeboard-runtime-gpl
```

许可证边界：

- 本项目是 GPL-3.0-only。
- 本项目直接吸收 `clocteck/holocubic-apps` 和 `clocteck/holocubic-nes-esp32`。
- 原 `/Users/wq/VibeBoard` 仍保持独立 MIT 项目，不混入 GPL 源码。

## 已完成

### 1. 新项目骨架

已建立独立仓库：

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
  web-console/
```

已写清楚：

- 项目目标；
- GPL 许可来源；
- 与原 VibeBoard Micro 的边界；
- Phase 1 不包含完整 ESP32 runtime firmware；
- 普通 App 迭代和 runtime 固件开发的区别。

### 2. 上游源码吸收

已导入完整上游快照：

```text
upstream/holocubic-apps/
upstream/holocubic-nes-esp32/
```

相关说明：

- [upstream-map.md](upstream-map.md)
- [NOTICE.md](../NOTICE.md)

并提供了上游导入脚本：

```text
tools/import-upstream.sh
```

脚本已经做过加固：新快照下载和解压成功后才替换现有目录，避免网络失败时破坏已有上游快照。

### 3. 首批 curated demo

已从上游整理出第一批 VibeBoard-facing demo：

```text
apps/weather/
apps/voice_ai/
apps/nesgame/
modules/nes/
```

这三类 demo 分别代表：

- `weather`：普通 Lua/LVGL 网络 UI App；
- `voice_ai`：设备端 App + 桌面 AI bridge；
- `nesgame`：Lua App 调用原生 NES 模块的方向。

### 4. App 包验证器

已实现：

```text
tools/app-validator/
```

当前能验证：

- `app.info` 是否存在；
- `name`、`entry`、`description` 是否存在；
- entry 文件是否存在；
- entry 路径是否逃逸 app 目录；
- 绝对路径、`../`、symlink 逃逸是否被拒绝；
- 使用 network/audio/file/module 能力时是否声明对应 `capabilities`。

已补充 curated app capability：

```ini
apps/weather/app.info    -> capabilities = network
apps/voice_ai/app.info   -> capabilities = network,audio,file
apps/nesgame/app.info    -> capabilities = file
```

### 5. AI 生成契约

已建立：

```text
docs/ai-generation-contract.md
scripts/test-ai-contract.mjs
```

已明确：

- JSON 是 VibeBoard 工具链使用的中间生成计划；
- 真实落盘包仍然是 `app.info + Lua/assets directory`；
- `app` 元数据映射为 `app.info`；
- `files[]` 映射为 app 目录内文件；
- 需要驱动、pin map、BLE service、partition、sdkconfig、LVGL binding、native ABI 时，必须返回或报告 `Runtime update required`，不能伪装成普通 Lua App 能解决。

### 6. 当前验证命令

当前可用命令：

```bash
npm test
npm run validate:apps
```

当前状态下两条命令已通过：

- validator 测试；
- upstream map 测试；
- AI contract 测试；
- packager 测试；
- curated app 包验证。

### 7. App 文件级打包器

已实现：

```text
tools/app-packager/
```

当前能做：

- 打包单个 app 目录；
- 打包全部 curated demo；
- 打包前复用 validator；
- 拒绝 repo 外部 app 目录；
- 跳过 symlink；
- 输出 `manifest.json`；
- 输出 `install-notes.txt`；
- 把产物放入 `dist/apps/<app-id>/`。

可用命令：

```bash
npm run package:app -- apps/weather
npm run package:demos
```

产物示例：

```text
dist/apps/weather/
  app.info
  main.lua
  assets/...
  manifest.json
  install-notes.txt
```

部署含义：

```text
dist/apps/weather/* -> /sd/apps/weather/
```

这一步仍然是文件级部署包，不会烧录固件。

## 当前能用什么

现在能用的是 **项目底座和文件级开发能力**：

- 可以查看和继续整理上游 Lua/LVGL App；
- 可以验证 app 包是否满足 VibeBoard Runtime 规范；
- 可以把 curated app 打包成 `dist/apps/<app-id>/` 文件级部署包；
- 可以基于 `apps/weather`、`apps/voice_ai`、`apps/nesgame` 研究 App 包结构；
- 可以基于 `docs/ai-generation-contract.md` 让 AI 生成 app package plan；
- 可以基于 `modules/nes` 继续研究 ESP-ELFLoader 动态模块方向。

如果手头已经有兼容 Clocteck/Cubic Lua runtime 的设备，这些 app 目录可以作为手动 SD 卡部署的参考起点。

## 当前还不能用什么

现在还不能直接完成这些事情：

- 不能直接生成一个可烧录的 VibeBoard Runtime 固件；
- 不能直接把 App 从浏览器上传到 ESP32 设备；
- 不能在 VibeBoard 自己的设备 launcher 中运行这些 App；
- 不能证明 `apps/weather` 已在目标设备上真实跑通；
- 不能证明 `modules/nes/nes.so` 已在目标设备上编译、部署、加载；
- 不能替代原 `/Users/wq/VibeBoard` 的 ESP-IDF 编译/烧录流程。

## 总体路线

目标路线仍然是：

```text
一次性烧录 VibeBoard Runtime
  -> AI 生成 Lua/LVGL App 包
  -> validator 检查
  -> 浏览器/网络/SD 部署到设备
  -> launcher 加载 App
  -> 必要时加载 native .so 模块
```

普通 App 迭代不重新烧录；runtime、驱动、绑定、ABI 变化仍然需要固件开发和烧录。

## Phase 2：真实设备闭环

目标：证明至少一个 App 能在真实设备上跑起来。

### Phase 2A：文件级打包

状态：已完成基础版。

已完成：

- `package:app`；
- `package:demos`；
- package manifest；
- install notes；
- packager 测试接入 `npm test`。

剩余增强：

- 从 AI package plan 直接落盘生成 app 目录；
- manifest schema 独立文档化；
- 输出 zip/tar 包；
- 对 assets 体积、文件数量、文件名规则做更细限制。

### Phase 2B：真实设备手动部署

建议任务：

1. 选定目标设备

   确认使用哪块 ESP32-S3 小屏设备，记录屏幕、触摸/按键、SD、音频、USB 串口能力。

2. 决定 runtime 基线

   两个选择：

   - 先使用 Clocteck/Cubic Lua 固件验证 app 目录；
   - 或者开始建立 VibeBoard 自己的 ESP-IDF runtime 工程。

3. 手动部署 `apps/weather`

   目标路径：

   ```text
   /sd/apps/weather/app.info
   /sd/apps/weather/main.lua
   /sd/apps/weather/assets/...
   ```

   验证标准：

   - 设备 launcher 能看到 weather；
   - App 能启动；
   - 网络请求失败时有可理解的错误状态；
   - 串口日志可收集。

4. 写设备测试记录

   新增：

   ```text
   docs/device-bringup.md
   ```

   记录设备型号、固件版本、SD 目录结构、串口日志、成功/失败截图或描述。

## Phase 3：VibeBoard Runtime 固件

目标：开始做自己的 ESP32-S3 runtime，而不是只依赖上游固件。

建议模块：

- ESP-IDF 工程骨架；
- LVGL 初始化；
- 屏幕/输入/SD/WiFi 驱动；
- Lua VM 集成；
- NodeMCU 风格模块适配；
- LVGL Lua binding；
- app scanner；
- launcher；
- app lifecycle；
- 日志/错误上报。

第一版不追求完整复制上游能力，优先跑通：

```text
/sd/apps/<app>/app.info
/sd/apps/<app>/main.lua
```

## Phase 4：部署工具和 Web Console

目标：让“AI 写 App -> 验证 -> 上传设备”变成可用闭环。

建议任务：

- `web-console/` 做最小浏览器 UI；
- 展示 app package plan；
- 调用 validator；
- 打包 app 目录；
- 通过 runtime HTTP endpoint 上传；
- 展示上传结果和设备日志；
- 支持回滚或删除 App。

第一版可以只支持局域网 HTTP 上传，不需要同时做 USB、BLE、远程隧道。

## Phase 5：AI 生成 App 包

目标：把 VibeBoard 的 AI 生成能力接到 Runtime App 包。

建议任务：

- 让 AI 先输出 `docs/ai-generation-contract.md` 定义的 package plan；
- 由工具把 package plan 写成目录；
- 运行 validator；
- 展示错误并让 AI 修复；
- 通过 Phase 4 的上传工具部署；
- 收集设备日志后进入修复循环。

生成策略：

- 屏幕 UI、卡片、小工具、小动画、小游戏优先走 Lua/LVGL App；
- 驱动、底层协议、BLE service、分区、sdkconfig、LVGL binding、native ABI 变化走 runtime/ESP-IDF 工作流。

## Phase 6：Native Module 路线

目标：验证 `.so` 动态模块作为高性能能力扩展。

建议先从 NES 模块开始：

```text
modules/nes/
```

验证顺序：

1. 确认 ESP-IDF 和 ESP-ELFLoader 版本；
2. 编译 `nes.so`；
3. 放入设备：

   ```text
   /sd/modules/nes.so
   ```

4. 部署 `apps/nesgame`；
5. 验证 Lua `require("/sd/modules/nes.so")`；
6. 验证 ABI mismatch 时错误提示可理解。

## 风险和注意事项

### GPL 边界

本项目是 GPL-3.0-only。后续不要把本项目源码复制进原 MIT VibeBoard 仓库。

如果需要在原 VibeBoard 中引用本项目，只做：

- 文档链接；
- 进程边界调用；
- 网络 API 调用；
- 构建产物下载链接。

### Runtime 能力边界

Lua/LVGL App 不能修改底层驱动。遇到缺失能力时，应报告：

```text
Runtime update required
```

### Preview 边界

浏览器预览只能作为语义/视觉参考，不能当成真实 LVGL 硬件验证。

真实通过标准必须包括：

- app package validator 通过；
- 设备运行通过；
- 串口/日志证据；
- 必要时截图或录屏。

## 建议的下一步

下一步最小闭环建议只做一件事：

```text
选一块真实 ESP32-S3 小屏设备，手动部署 apps/weather 并记录 bring-up 结果。
```

成功后再做浏览器上传和 AI 生成。这样风险最低，也能最快证明“免重新烧录 App 迭代”这条路线是否成立。
