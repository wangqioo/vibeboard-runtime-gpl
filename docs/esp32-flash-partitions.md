# ESP32 Flash Partitions

本文说明 ESP32-S3 Flash 分区的作用，并结合当前 VibeBoard Runtime 在立创 ESP32-S3 N16R8 板上的分区布局解释每块区域在做什么。

## 当前硬件背景

当前目标板是立创 ESP32-S3 开发板，模组资源为：

```text
Flash: 16 MB
PSRAM: 8 MB
Display: 320x240 ST7789
```

VibeBoard Runtime 当前采用一个较简单的开发期分区表：

```csv
# Name,   Type, SubType, Offset,  Size, Flags
nvs,      data, nvs,     0x9000,  0x6000,
phy_init, data, phy,     0xf000,  0x1000,
factory,  app,  factory, 0x10000, 0x400000,
```

ESP32 固定还会使用 bootloader 和 partition table，所以实际启动相关区域大致是：

```text
0x0000   bootloader
0x8000   partition table
0x9000   nvs
0xf000   phy_init
0x10000  factory app firmware
```

## Bootloader

Bootloader 通常从 `0x0000` 开始。

它是芯片上电后运行的第一段用户侧启动程序，主要负责：

- 初始化基础启动环境；
- 读取 partition table；
- 找到要启动的 app 分区；
- 校验并加载 firmware；
- 跳转到应用程序入口。

烧录时常见记录：

```text
bootloader.bin at 0x0
```

如果 bootloader 损坏，设备通常无法正常启动应用。

## Partition Table

Partition table 通常位于 `0x8000`。

它是 Flash 的地图，告诉 bootloader 和 ESP-IDF：

- 有哪些分区；
- 每个分区的名字；
- 分区类型和子类型；
- 起始地址；
- 大小。

例如当前表里：

```text
factory app at 0x10000, size 0x400000
```

这意味着 bootloader 会从 `0x10000` 附近加载 factory app，最多可使用 4 MB 的 app 分区空间。

## NVS

当前配置：

```csv
nvs, data, nvs, 0x9000, 0x6000
```

NVS 是 Non-Volatile Storage，适合存放少量断电保留的 key-value 数据。

常见用途：

- WiFi 配置；
- 设备设置；
- 校准参数；
- ESP-IDF 系统组件内部状态；
- 小型业务配置。

NVS 不适合存大文件。图片、字体、Lua App、日志等大文件应放在文件系统或 SD 卡中。

## PHY Init

当前配置：

```csv
phy_init, data, phy, 0xf000, 0x1000
```

PHY 分区用于 WiFi/BLE 射频物理层相关初始化数据。

常见作用：

- RF 校准数据；
- WiFi 射频初始化参数；
- 与芯片、模组和地区配置相关的底层无线参数。

一般业务代码不直接操作这个分区。

## Factory App

当前配置：

```csv
factory, app, factory, 0x10000, 0x400000
```

这是当前 VibeBoard Runtime 固件所在的主应用分区。

其中包含：

- ESP-IDF `app_main`；
- 板级初始化；
- LCD、触摸、背光、SD、WiFi；
- LVGL；
- Lua VM；
- Lua API bindings；
- native launcher；
- app registry；
- app runner；
- HTTP install service。

当前项目将 factory app 分区设置为 4 MB，是因为网络、Lua、LVGL、HTTP 服务和 launcher 等能力叠加后，runtime 已经不适合继续放在 ESP-IDF 常见的 1 MB app 分区中。

历史构建记录中，network runtime 的固件体积为：

```text
vibeboard_runtime.bin binary size 0x16bb40 bytes
Smallest app partition is 0x400000 bytes
0x2944c0 bytes free
```

换算后大约是：

```text
runtime bin: 约 1.42 MB
factory partition: 4 MB
remaining in partition: 约 2.58 MB
```

注意：4 MB 是分区预留空间，不等于当前固件已经实际占用 4 MB。

## 当前 16 MB Flash 的剩余空间

当前分区表只声明了 bootloader、partition table、NVS、PHY 和一个 4 MB factory app。

16 MB Flash 后面还有不少未声明空间。未声明空间不会自动变成文件系统，也不会被 ESP-IDF 自动用于 OTA 或数据存储。

如果后续要产品化，可以继续扩展分区表。

## 常见可扩展分区

### OTA 分区

用于远程升级 runtime firmware。典型布局：

```csv
otadata, data, ota,   ...
ota_0,   app,  ota_0, ...
ota_1,   app,  ota_1, ...
```

工作方式：

```text
当前运行 ota_0
下载新固件到 ota_1
校验成功后切换到 ota_1
启动失败时可回滚 ota_0
```

OTA 分区适合产品化阶段，能降低远程升级固件的风险。

当前 VibeBoard Runtime 还没有启用 OTA 分区，因为现阶段重点是 runtime 本体开发和 SD App 快速迭代。

### 文件系统分区

常见类型：

```text
spiffs
littlefs
fat
storage
```

这些分区可以把 Flash 的一部分当文件系统使用，适合存放：

- 设备本地配置；
- 小资源文件；
- Web UI 静态文件；
- 日志；
- 缓存。

当前项目主要把 App 放在 SD 卡：

```text
/sdcard/apps/<app-id>
```

因此 Flash 文件系统不是当前最小闭环的刚需。

### Coredump 分区

Coredump 分区用于保存崩溃现场。

设备崩溃后，可以把异常信息、任务状态和调用栈写入 Flash，后续导出分析。产品化调试时很有价值。

### NVS Keys 分区

如果启用 NVS 加密，通常还会有 NVS keys 分区，用于保存加密密钥。

当前项目没有启用这部分。

## 为什么当前分区表保持简单

VibeBoard Runtime 当前的核心策略是：

```text
Flash 中放稳定 runtime
SD 卡中放动态 App 和资源
```

所以开发阶段只需要：

```text
bootloader
partition table
nvs
phy_init
factory runtime
```

App 本身不放在 Flash app 分区，而是放在 SD 卡：

```text
/sdcard/apps/weather
/sdcard/apps/smoke_visual
/sdcard/apps/voice_ai
```

这能让 App 修改、上传、启动都不依赖重新烧录 firmware。

## 当前布局的优点

- 简单，便于 bring-up；
- factory app 分区足够大，适合 network + Lua + LVGL runtime；
- SD 卡承担动态 App 和资源，不挤占内部 Flash；
- 适合快速验证 launcher、runner、HTTP install service 和 Lua App 流程。

## 当前布局的限制

- 没有 OTA 分区，不能安全地双槽升级 runtime firmware；
- 没有 Flash 文件系统分区，不能在内部 Flash 中存放较大资源；
- 没有 coredump 分区，崩溃后缺少持久化现场；
- 16 MB Flash 后半部分尚未声明用途；
- 如果进入产品化阶段，需要重新设计分区表。

## 后续产品化建议

如果后续要从开发验证走向产品化，可以考虑：

```text
bootloader
partition table
nvs
otadata
ota_0
ota_1
storage / littlefs
coredump
```

是否保留 4 MB app 分区，需要根据实际 runtime bin 大小和 OTA 需求决定。

如果 runtime 继续增长，双 OTA 每槽都需要能放下完整 runtime。以 16 MB Flash 来看，这仍然有空间，但需要明确规划：

- runtime 固件最大尺寸；
- 是否需要双 OTA；
- 是否需要内部文件系统；
- 是否继续依赖 SD 卡放 App；
- 是否需要 coredump；
- NVS 是否需要加密。

## 一句话总结

```text
bootloader: 负责启动
partition table: Flash 地图
nvs: 小型持久化配置
phy_init: 无线射频初始化数据
factory: 当前 VibeBoard Runtime 固件
SD 卡: 动态 App 和资源
```

当前分区设计适合开发期快速迭代。进入量产或远程升级阶段后，应扩展为包含 OTA、storage 和 coredump 的产品化布局。

