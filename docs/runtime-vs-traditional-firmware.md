# Runtime App Mode vs Traditional Firmware

本文总结 VibeBoard Runtime 的开发模式与传统嵌入式固件开发之间的区别、优缺点和适用边界。

## 核心区别

传统嵌入式固件通常把业务功能、UI、硬件初始化和外设控制一起编译进一个 firmware 镜像：

```text
修改 C/C++ 固件代码
  -> 编译完整 firmware
  -> 烧录 flash
  -> 重启设备
  -> 验证功能
```

VibeBoard Runtime 采用的是 runtime app 模式。设备先烧录一次稳定 runtime，后续业务功能作为 SD 卡 App 安装和启动：

```text
烧录一次 VibeBoard Runtime
  -> runtime 常驻设备
  -> Lua App + app.info + assets 上传到 SD 卡
  -> runtime 扫描 /sdcard/apps
  -> launcher 或 HTTP 启动 App
```

因此，传统固件更像“每次换功能都重新刷系统”，而 VibeBoard Runtime 更像“先刷一个小型运行环境，后续安装和启动 App”。

## 架构分工

Runtime firmware 负责稳定的底层能力：

- ESP32-S3 启动和 FreeRTOS 任务；
- LCD、触摸、背光、SD 卡和 WiFi；
- LVGL 初始化和屏幕刷新；
- Lua VM；
- Lua API 绑定，例如 `lvgl`、`tmr`、`file`、`wifi`、`http`、`sjson`、`time`；
- App registry，扫描 `/sdcard/apps`；
- App runner，管理 `idle`、`starting`、`running`、`stopping`、`failed` 生命周期；
- native launcher；
- HTTP install service，例如 `/install`、`/rescan`、`/apps`、`/status`、`/launch`。

SD App 负责轻量业务和 UI：

- `app.info` 元数据；
- Lua 入口脚本；
- 图片、字体和配置文件；
- 通过 runtime 暴露的 API 绘制 UI、请求网络、读写 app-local 文件、使用定时器。

## 主要优点

### 1. 迭代速度更快

传统固件即使只是改 UI 文案、布局或图片，也常常需要重新编译和烧录。Runtime app 模式下，许多改动只需要更新 Lua 和资源文件：

```text
传统固件: 改代码 -> 编译 -> 烧录 -> 重启
Runtime App: 改 Lua/assets -> 上传 -> rescan/launch
```

这对小屏 UI、状态面板、天气卡片、设备控制面板等高频迭代场景很有价值。

### 2. App 与底层硬件解耦

App 不需要重复处理 LCD、SD、WiFi、LVGL 初始化等底层细节。Runtime 统一维护硬件和系统服务，App 只使用受控 API。

这种分工可以让同一块设备运行多个 App，而不是每个功能都重新做一份完整固件。

### 3. 更适合 AI 生成 App

AI 直接生成完整 C/C++ 固件风险较高，容易碰到底层初始化、任务调度、内存管理和驱动细节。Lua App 的边界更清晰，工具链也可以提前校验：

- `app.info` 是否完整；
- entry 文件是否存在；
- 路径是否越界；
- 是否声明了需要的 capabilities；
- 打包文件是否安全。

这让 AI 生成的小屏 App 更容易进入可测试、可安装的闭环。

### 4. 失败恢复更友好

传统单体固件里，业务逻辑写坏可能直接卡住主流程。VibeBoard Runtime 中，Lua App 由 runner 管理：

- App 可以被 stop；
- 启动失败会进入 `failed` 状态；
- runner 记录 `last_status` 和 `last_message`；
- launcher 可以在失败后重新显示；
- HTTP `/status` 可以暴露当前生命周期。

这使 runtime shell 和 app 之间有更明确的恢复边界。

### 5. 更容易产品化为 App 平台

Runtime app 模式天然支持后续扩展：

- 多 App 列表；
- App 上传和远程启动；
- App 包格式；
- 权限声明；
- Web 管理界面；
- 删除、升级、staging/commit；
- App 商店或模板库。

这些能力在传统单体固件里通常需要额外重构才能实现。

## 主要缺点

### 1. 性能和实时性不如原生固件

Lua 运行在 VM 中，App 调用 UI 或系统能力也需要经过绑定层。它适合 UI 和轻业务逻辑，不适合强实时、高频采样、精密控制或大吞吐数据处理。

例如以下场景更适合传统 C/C++ 固件：

- 电机控制；
- 高频传感器采样；
- 实时音频处理；
- 摄像头或视频流；
- 对中断响应、延迟和 jitter 敏感的任务。

### 2. App 能力受 runtime API 限制

Lua App 不能随意访问底层硬件。它只能使用 runtime 暴露的 API。

如果 runtime 没有暴露某项能力，例如 BLE、I2S、复杂触摸事件、摄像头或某个传感器驱动，就必须先修改 firmware 并重新烧录 runtime。

### 3. 系统复杂度更高

传统固件通常是一个程序控制全部逻辑。Runtime app 模式多了更多层：

- App 包格式；
- validator；
- packager；
- uploader；
- native launcher；
- runner 生命周期；
- HTTP install service；
- capabilities 和安全路径检查。

这些层让系统更灵活，但也要求更严格的工程约束和测试。

### 4. 资源开销更大

Runtime 需要同时容纳 Lua VM、LVGL、HTTP 服务、SD 文件系统、launcher 和各类 Lua 绑定。相比单一功能固件，它会占用更多 flash 和 RAM。

本项目已经因为网络和 runtime 能力启用，使用了自定义 4 MB app partition。

### 5. 调试链路更长

传统固件调试主要看 C 日志、崩溃栈和外设状态。Runtime app 模式下，问题可能出在多层之一：

- Lua App 逻辑；
- App 包内容；
- Lua binding；
- LVGL；
- runner 生命周期；
- SD 文件系统；
- HTTP 上传；
- 底层驱动。

因此需要 validator、static guardrails、smoke apps 和 board verification 一起配合。

## 适用场景

Runtime app 模式适合：

- 小屏 UI 设备；
- 桌面信息屏；
- 天气、时钟、状态面板；
- 轻量设备控制面板；
- 多 App 切换；
- UI 经常变化的产品；
- AI 生成 App；
- 希望减少烧录次数的开发流程；
- 需要远程上传和启动 App 的设备。

传统固件更适合：

- 单一功能、长期不变的量产设备；
- 强实时控制；
- 复杂底层驱动；
- 极限性能或低功耗场景；
- 高频数据采集；
- 需要直接访问硬件寄存器的业务逻辑；
- 对启动时间、内存占用和故障面要求极严的产品。

## 当前项目的取舍

VibeBoard Runtime 的目标不是替代所有传统固件开发，而是把小屏设备中变化最快的 UI 和轻业务逻辑从 firmware 中拆出来。

当前推荐边界是：

- 硬件、驱动、系统服务、Lua API 绑定仍属于 firmware；
- UI、轻业务、网络请求编排、展示逻辑属于 SD App；
- App 不直接操作硬件，只通过 runtime API；
- 需要新增底层能力时，先扩展 firmware，再让 App 使用。

一句话总结：

```text
传统固件把功能写死在 firmware 里。
VibeBoard Runtime 让 firmware 提供运行环境，把功能作为 App 动态安装和运行。
```

