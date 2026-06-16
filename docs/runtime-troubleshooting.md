# Runtime Troubleshooting Runbook

更新时间：2026-06-16

这份记录用于下次板子再次出现 `/apps` 解析失败、`ESP_ERR_NO_MEM`、HTTP 连接被重置、Lua task 栈溢出，或者扩展 app catalog 后不稳定时快速定位。

核心原则：不要只根据 Mac 侧报错改代码。必须同时看三类证据：

- HTTP 返回：`/status`、`/apps`、`/launch`、`/stop`。
- 串口日志：panic、stack overflow、重启原因、Lua runtime 错误。
- 最近改动：app 数量、registry 容量、HTTP response 构造、task stack、Lua task 局部变量。

## Quick Triage

| 现象 | 第一检查 | 常见层级 | 下一步 |
| --- | --- | --- | --- |
| `/apps` JSON parse error，错误位置接近 1024 | `curl -s "$BOARD/apps"` 看原始响应 | HTTP install service | 查 `install_service.c` 是否又使用固定小 buffer 拼 JSON |
| `/launch` 返回 `500 ESP_ERR_NO_MEM` | 看响应 body 和串口 | task/heap allocation | 查 Lua task stack 是否申请在 internal RAM，查 PSRAM stack 创建 |
| `npm run launch:app` 报 `ECONNRESET` | 立刻看串口 | panic/reboot/stack overflow | 找 `***ERROR***`、Guru Meditation、reset reason |
| 串口显示 `stack overflow in task vb_lua_launch` | 查 `app_runner.c` | Lua task 栈局部变量过大 | 搜索 `vb_app_registry_result_t`、大数组、长路径 buffer |
| 串口显示 HTTPD 相关 task 溢出 | 查 `install_service.c` | HTTP handler stack | 看 endpoint handler 是否做了大局部变量或递归 |
| app 屏幕显示 `Runtime update required` | 查 app 的 missing runtime 字段 | 预期占位入口 | 去 migration matrix 看缺什么 runtime slice |
| Lua 报 `module 'lvgl' not found` | 查 `lua_lvgl.c` module table | Lua module compatibility | 确认 `require("lvgl")` 是否注册，模型是否调用未开放 API |
| Lua 报 `attempt to call a nil value` | 查具体函数名 | 未开放 LVGL/Lua API | 更新 capability docs，不要假装 app 层能补 firmware binding |

常用环境变量：

```bash
BOARD=http://192.168.1.32:8080
```

常用 HTTP 检查：

```bash
curl -s "$BOARD/status"
node -e "fetch('$BOARD/apps').then(r=>r.text()).then(t=>{console.log(t.length); JSON.parse(t); console.log('apps json ok')})"
npm run launch:app -- "$BOARD" demo_digital_clock
npm run launch:app -- "$BOARD" holocubic_2048
curl -s -X POST "$BOARD/stop"
```

常用静态检查：

```bash
rg -n "char body\\[1024\\]|httpd_resp_send_chunk|VB_APP_REGISTRY_MAX_APPS" firmware/vibeboard_runtime/main
rg -n "xTaskCreatePinnedToCore|xTaskCreatePinnedToCoreWithCaps|vTaskDeleteWithCaps|vb_app_registry_result_t app" firmware/vibeboard_runtime/main/app_runner.c
npm run test:firmware-static
```

串口 monitor：

```bash
cd firmware/vibeboard_runtime
source /Users/wq/esp-idf/export.sh
python /Users/wq/esp-idf/tools/idf.py -p /dev/cu.usbmodem111301 monitor --no-reset
```

退出 monitor：`Ctrl+]`。

## Incident: Expanded Holocubic Catalog Failures

日期：2026-06-16

触发条件：

- Holocubic 全量本地目录基线加入后，SD 上 app 数量明显增加。
- Runtime registry 容量从 32 扩展到 64。
- `/apps` response 变长。
- Lua launch path 仍有旧的内存假设。

### Failure 1: `/apps` JSON 被截断

现象：

```text
Bad control character in string literal in JSON at position 1022
```

原始响应在接近 1024 字节处被截断，类似：

```text
{"id":"holocubic_2048","name":"Holocubic 20]}
```

根因：

- `apps_handler` 用固定 `char body[1024]` 拼接完整 app 列表。
- 扩展 catalog 后响应超过 1024 字节。
- HTTP 返回了不完整 JSON，Mac 侧解析失败。

修复：

- `/apps` 改为 chunked JSON streaming。
- 每个 app 单独格式化为小 `item` buffer。
- 发送开头 `{"apps":[`，逐项发送，最后发送 `]}\n` 和终止 chunk。

防复发 guardrail：

- `tools/firmware-static-check/test.mjs` 禁止 `apps_handler` 中重新出现固定 `char body[1024]`。
- 静态测试要求 `httpd_resp_send_chunk`、最终 `NULL, 0` chunk。

下次处理：

1. 先保存原始响应长度和截断位置。
2. 如果错误位置接近固定 buffer 边界，优先查 HTTP response 拼接。
3. 不要通过减少 app 数绕过问题；app 数量增长是预期能力。

### Failure 2: `/launch` 返回 `500 ESP_ERR_NO_MEM`

现象：

```text
npm run launch:app -- http://192.168.1.32:8080 demo_digital_clock
Launch demo_digital_clock failed after 3 attempts: 500 ESP_ERR_NO_MEM
```

根因：

- app registry 扩容后，runtime 常驻内存和启动路径压力增加。
- Lua app task 仍通过普通 `xTaskCreatePinnedToCore` 请求 32 KB internal RAM stack。
- internal RAM 不一定能提供连续大块 task stack，导致 task 创建失败。

修复：

- Lua app task 优先使用 `xTaskCreatePinnedToCoreWithCaps(..., MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)`。
- 如果 PSRAM 分配失败，再尝试 internal RAM caps fallback。
- 使用 caps 创建的 task 退出时必须用 `vTaskDeleteWithCaps(NULL)`。

防复发 guardrail：

- 静态测试要求 app runner 使用 `xTaskCreatePinnedToCoreWithCaps`。
- 静态测试要求使用 `MALLOC_CAP_SPIRAM` 和 `vTaskDeleteWithCaps`。

下次处理：

1. 如果 HTTP 500 body 是 `ESP_ERR_NO_MEM`，先判断是否是 task creation 阶段，不要直接归因给 Lua app。
2. 查最近是否增加了 registry 容量、常驻 buffer、HTTP handler、LVGL canvas buffer。
3. 查 task stack 创建 API 和 delete API 是否配套。

### Failure 3: `vb_lua_launch` task 栈溢出

现象：

PSRAM stack 修复后，`ESP_ERR_NO_MEM` 消失，但 launch 出现连接重置。串口暴露真正剩余问题：

```text
***ERROR*** A stack overflow in task vb_lua_launch has been detected.
```

根因：

- `lua_async_task` 在 Lua task 栈上构造了完整 `vb_app_registry_result_t app`。
- `vb_app_registry_result_t` 内含 `apps[VB_APP_REGISTRY_MAX_APPS]`。
- registry 从 32 扩到 64 后，这个局部结构体变成几十 KB 级别。
- Lua task stack 只有 32 KB，局部 registry 副本直接压垮栈。

修复：

- Lua launch context 改成小结构：

```c
typedef struct {
    char name[VB_APP_NAME_MAX];
    char dir[VB_APP_PATH_MAX];
    char path[VB_APP_PATH_MAX];
} vb_lua_app_context_t;
```

- 启动时只复制当前 app 需要的 `name`、`dir`、`path`。
- `lua_file` 注册改为直接接收 app dir，而不是依赖完整 registry result。

防复发 guardrail：

- 静态测试禁止 `app_runner.c` 重新出现 `vb_app_registry_result_t app;` 这种 Lua task 栈局部变量。
- 静态测试要求存在 `vb_lua_app_context_t`。

下次处理：

1. HTTP 客户端看到 `ECONNRESET` 时，不要只查网络；这通常表示板子 panic 或重启了。
2. 先看串口 task 名称。`vb_lua_launch` 指向 Lua runner，HTTPD task 指向 install service。
3. 搜索大栈对象：

```bash
rg -n "vb_app_registry_result_t|char .*\\[[0-9]{3,}|\\[[A-Z0-9_]+\\]" firmware/vibeboard_runtime/main/app_runner.c
```

4. 扩容任何 `MAX_*` 后，要审计所有按该上限分配的局部变量。

## Why The Problems Appeared Together

这些不是一个单点 bug，而是同一次扩容暴露了三类旧假设：

1. HTTP 层假设 app list 小于 1024 字节。
2. FreeRTOS task 层假设 internal RAM 足够放 Lua app stack。
3. Lua runner 层假设完整 registry result 可以放在 task stack 上。

扩展 Holocubic catalog 后，app 数量、JSON 长度、registry 结构体大小同时增加，所以问题按顺序浮现：

```text
app list 变长
  -> /apps 固定 buffer 截断
  -> 修复后 launch 走得更远
  -> task stack allocation 暴露 ESP_ERR_NO_MEM
  -> PSRAM stack 修复后 launch 继续走
  -> 大局部 registry 副本暴露 vb_lua_launch stack overflow
```

这类问题的经验：第一个错误修好后，必须继续跑原始链路直到 launch/stop/switch 都通过，因为前一个故障可能挡住了后面的故障。

## Regression Checks

扩展 app catalog、registry 上限、HTTP endpoint、Lua runner、LVGL canvas 之后，至少跑：

```bash
npm run test:firmware-static
npm run validate:apps
npm run package:demos
git diff --check
```

有板子时再跑：

```bash
curl -s "$BOARD/status"
node -e "fetch('$BOARD/apps').then(r=>r.text()).then(t=>{console.log(t.length); JSON.parse(t); console.log('ok')})"
npm run launch:app -- "$BOARD" demo_digital_clock
npm run launch:app -- "$BOARD" holocubic_2048
curl -s -X POST "$BOARD/stop"
curl -s "$BOARD/status"
```

如果这组检查失败，先按 Quick Triage 定位，不要直接改 app 代码。

## Rules For Future Runtime Expansion

- 不要用固定小 buffer 构造会随 app 数、文件数、日志数增长的 HTTP 响应。
- 不要在 FreeRTOS task 栈上放完整 registry、完整 file list、大 JSON、大 canvas buffer。
- 不要把 `VB_APP_REGISTRY_MAX_APPS`、路径长度、文件数量上限变更当成无风险常量调整。
- 不要混用 `xTaskCreatePinnedToCoreWithCaps` 和普通 `vTaskDelete`。
- 不要把 `Runtime update required` 占位 app 当成迁移失败；它是为了防止 unsupported API 直接崩溃。
- 不要通过删 app、降 catalog 数量来掩盖容量问题；VibeBoard runtime 的目标就是能承载多个 demo、smoke app 和 Holocubic catalog。

