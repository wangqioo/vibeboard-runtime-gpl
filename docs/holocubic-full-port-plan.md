# Holocubic Full Port Plan

更新时间：2026-06-16

目标：把 `upstream/holocubic-apps` 的上游应用从“本地可见 catalog”推进到“在当前 ESP32-S3 VibeBoard 板子上功能完整可用”。

## Current Truth

当前状态必须分清三件事：

| 层级 | 含义 | 当前状态 |
| --- | --- | --- |
| Source mirror | 上游源码是否已经进入仓库 | `upstream/holocubic-apps` 已在本仓库，实际有 20 个包含 `app.info` 的 app 目录 |
| Local catalog package | 是否有本地 `apps/<target-id>`，能 validate/package/upload/launch | 20 个目标都有本地包 |
| Full functional port | 上游功能是否在板子上完整运行，通过 launch/stop/switch 验证 | 目前只有 `NixieClock`、`clock`、`MatrixRain` 的兼容移植可算完成 |

`upstream/holocubic-apps/README.md` 当前列表提到 `FireSand`，但本地镜像的实际目录和 `app.info` 清单没有 `FireSand`。本计划按“实际存在且有 `app.info` 的 20 个 app”推进。以后重新拉上游时，需要单独审计是否新增了 `FireSand` 或其他 app。

## Why We Did Not Copy Everything As-Is

这不是“只移了几个目录”的问题。20 个目标的源码已经在 `upstream/holocubic-apps`，本地 `apps/` 也有对应入口。但完整功能不能直接复制运行，原因是当前 VibeBoard Runtime 还不是上游 Holocubic 期望的完整 NodeMCU/LVGL 兼容层。

当前 runtime 已真机验证的是窄而稳定的子集：

- `tmr`、`file`、`wifi`、`http`、`sjson`、`time` 的基础能力；
- 基础 LVGL object/label/img/button/bar；
- BMP 图片、app-local asset path；
- 最小 canvas：fill、rect、text；
- HTTP 安装/管理服务、native launcher、staged upload、stop/delete。

上游完整 app 普遍还依赖：

- `key.on/key.off`、方向键、HOME、短按/长按事件；
- 异步 `http.get/post(url, headers/options, callback)`，headers、timeout、callback 清理；
- `app.exiting/app.exit/app.on/app.list/app.launch/app.route_base/set_webui`；
- `httpd.dynamic/static/start/unregister` 这类 app-owned Web route；
- `lv_font_load/free`、PNG/GIF、snapshot、blur、zoom、`lv_canvas_draw_img`；
- 更广的 LVGL widget/style/animation surface；
- native NES/gamepad/audio/I2S/spectrum。

如果把这些 upstream Lua 直接复制到 `apps/` 并标记完成，典型结果是：

```text
attempt to index a nil value (global 'key')
attempt to call a nil value (field 'lv_canvas_draw_img')
attempt to call a nil value (field 'lv_font_load')
unsupported http callback signature
module or native object not found
```

更严重时会触发内存、task stack、资源清理或 app 切换问题。2026-06-16 的 expanded catalog 事件已经证明，catalog 扩容会同时暴露 HTTP buffer、task stack allocation、Lua task stack local object 三类问题。排障记录见 `docs/runtime-troubleshooting.md`。

所以当前做法是：

1. 先把 20 个目标都放入本地 catalog。
2. 能安全兼容移植的先做成真实可运行 app。
3. 不能完整运行的显示 `Runtime update required`，并写明缺少的 runtime slice。
4. 后续按共用 runtime 能力补齐，再逐个把占位替换为功能移植。

## Full Port Priorities

### P0: Lua Input And Cleanup

解锁：`2048`、`photos`、`videos`、`weather`、`BTC`、`settings`、`Spectrum`、`nesgame`、`plane`、`codex_buddy`、`voice_ai`。

需要实现：

- `key.on(...)`
- `key.off(...)`
- `key.LEFT`、`key.RIGHT`、`key.UP`、`key.DOWN`、`key.HOME`
- `key.START`、`key.SHORT`、`key.LONG_START`、`key.LONG_REPEAT`、`key.LONG_END`
- 可选 `touch.on(...)`
- app stop/switch 时自动解绑回调

验收 app：

- `apps/smoke_input`

验收点：

- 短按/长按能更新 label；
- 方向键事件能被 Lua 收到；
- `/stop` 后回调不再触发；
- 启动第二个 app 时没有旧回调泄漏。

### P0: HTTP Callback Compatibility

解锁：`BTC`、`weather`、`hwmon`、`mini_claw`、`codex_buddy`、`voice_ai`。

需要实现：

- `http.get(url, headers_or_options, callback)`
- `http.post(url, options, body, callback)`
- headers table；
- timeout；
- callback 参数兼容：`code, body, headers`；
- app stop/switch 时 pending callback 安全取消或丢弃；
- 保留当前同步返回 `{status, body}` 的兼容路径。

验收 app：

- `apps/smoke_http_callback`

验收点：

- GET/POST callback 正常；
- timeout 路径正常；
- stop app 后 pending callback 不触碰已销毁 Lua state。

### P1: LVGL Style, Font, Animation Expansion

解锁：`2048`、`settings`、`weather`、`BTC`、`photos`、`plane`、`lv-benchmark` 的一大部分。

优先补：

- `lv_obj_remove_style_all`
- `lv_obj_del`、`lv_obj_del_async`
- `lv_obj_get_width`、`lv_obj_get_height`
- `lv_obj_set_style_text_font`
- `lv_obj_set_style_text_opa`
- `lv_obj_set_style_text_align`
- `lv_obj_set_style_opa`
- `lv_obj_set_style_border_opa`
- `lv_obj_set_style_bg_grad_color`
- `lv_obj_set_style_bg_grad_dir`
- `lv_obj_set_style_shadow_*`
- `lv_obj_set_style_clip_corner`
- `lv_anim_start`
- `lv_anim_delete` / `lv_anim_del`
- `lv_font_load`
- `lv_font_free`
- `LV_PART_MAIN`、`LV_STATE_DEFAULT`、更多 `LV_ALIGN_*`、`LV_TEXT_ALIGN_*`

验收 app：

- `apps/smoke_lvgl_style_font_anim`

验收点：

- 加载一个 `.bin` 字体；
- 设置 text font/align/opa；
- 运行动画；
- stop 时删除动画、释放字体；
- 连续 launch/stop 三次无崩溃、无明显 heap 下降。

### P1: Canvas And Media Expansion

解锁：`BTC`、`ConwayLife`、`FluidPendant`、`hwmon` display-only、`photos`、`plane`、`voice_ai`、`codex_buddy`、`videos`。

优先补：

- `lv_canvas_draw_line`
- `lv_canvas_draw_img`
- `lv_canvas_set_px_color`
- `lv_canvas_set_px_opa`
- `lv_canvas_draw_arc` 或受控 arc helper
- PNG strategy：板端 PNG decoder 或 package-time PNG -> BMP 转换；
- GIF strategy：`lv_gif_create/lv_gif_set_src` 或 package-time GIF frame strategy；
- image resource cleanup。

验收 app：

- `apps/smoke_canvas_media`
- `apps/smoke_gif_png`

验收点：

- canvas 画线、图片、像素点；
- PNG/BMP 资源显示路径明确；
- GIF 创建、设置、清空；
- stop/switch 后资源释放。

### P1: Lua App Lifecycle API

解锁：长循环类和服务类 app，包括 `BTC`、`FluidPendant`、`ConwayLife`、`plane`、`settings`、`devtools`。

需要实现：

- `app.exiting()`
- `app.exit()`
- `app.on(event, callback)`
- `app.list()`
- `app.current()`
- `app.launch(id)`
- `app.rescan()`

验收 app：

- `apps/smoke_app_lifecycle`

验收点：

- Lua 能感知 stop requested；
- `app.exit()` 能回 launcher；
- `app.list/current/rescan` 和 `/apps`、`/status` 一致。

### P2: App-Owned HTTPD And Service APIs

解锁：`devtools`、`mini_claw`、`hwmon` full mode、`BTC` WebUI、`settings` full mode。

需要实现：

- `app.route_base()`
- `app.set_webui(...)`
- `httpd.start(...)`
- `httpd.dynamic(method, route, handler)`
- `httpd.static(route, content_type)`
- `httpd.unregister(method, route)`
- `httpd.stop()`
- route lifecycle tied to app stop/switch

验收 app：

- `apps/smoke_httpd_routes`

验收点：

- app 注册 `/app/<id>/health` 和 `/api/echo`；
- Mac `curl` 能访问；
- stop 后 route 404；
- 重复启动不会重复注册或泄漏 handler。

### P2: File Management Expansion

解锁：`devtools`、`mini_claw`、`photos`、`videos`、更完整的 settings。

需要实现：

- `file.stat`
- `file.mkdir`
- `file.rmdir`
- `file.remove`
- `file.rename`
- `file.putcontents`
- `file.fsinfo`
- `file.seek`
- `file.flush`
- `file.readline`

验收 app：

- `apps/smoke_file_mgmt`

验收点：

- app sandbox 内 mkdir/stat/rename/remove/rmdir 正常；
- 写 `/sd/apps/other` 或 `../` 必须失败；
- 公共 `/sd/photos`、`/sd/videos` 的读权限策略明确。

### P3: Native, Gamepad, Audio, NES, Spectrum

解锁：`nesgame`、`voice_ai`、`Spectrum`。

需要实现：

- native module ABI/versioning；
- `require("/sd/modules/<module>.so")` policy；
- `nes.start/stop/input/state`；
- `gamepad.start/on/state`；
- `i2s.start/read/write/stop/mute`；
- spectrum/audio event source；
- crash containment and cleanup。

验收 app：

- `apps/smoke_native_policy`
- `apps/smoke_nes_stub`
- `apps/smoke_i2s_capture`

验收点：

- 拒绝未知 ABI；
- native module 崩溃不破坏 runtime；
- input mapping 和 stop cleanup 可验证；
- audio capture 启停后释放资源。

## Per-App Port Matrix

| App | 当前本地状态 | 完整功能阻塞点 | 推荐路径 |
| --- | --- | --- | --- |
| `NixieClock` | compat port | PNG 数字管、原资源路径、app lifecycle | 保留当前重绘版；等 PNG/asset strategy 后做原资源版 |
| `clock` | compat port | PNG 背景/指针、`time.getlocal`、image zoom/angle | 保留当前重绘版；补 time/media 后回归上游资源 |
| `MatrixRain` | compat port | 原样上游仍需 app lifecycle 和对象预算复核 | 作为 canvas baseline 继续保留 |
| `ConwayLife` | placeholder | canvas、font、time/local、lifecycle | P1 canvas/font 后迁移 |
| `FluidPendant` | placeholder | canvas、font、app lifecycle | P1 canvas/font/lifecycle 后迁移 |
| `BTC` | placeholder | HTTP callback、headers、zlib、key、httpd、canvas line、font | 先做 display-only，再做行情和 WebUI |
| `hwmon` | placeholder | HTTP callback、host bridge、httpd、canvas line | 先做 display-only，再做 host bridge |
| `2048` | placeholder | key input、animation、font、snapshot/canvas img | P0 input 后做可玩简化版，P1 后补动效 |
| `settings` | placeholder | key、switch/slider、WiFi 扩展、gamepad、app manager | P0 input + P1 widgets 后做基础设置 |
| `photos` | placeholder | file list、key、animation、canvas draw image、image decoder | P1/P2 media 后做图片浏览 |
| `videos` | placeholder | GIF/video、file list、key | GIF strategy 后做 GIF browser |
| `Spectrum` | placeholder | audio/spectrum event、key、canvas line | P3 audio/spectrum 后做 |
| `plane` | placeholder | key/HOME、IMU/app event、sprite image、snapshot/blur、font | 先做简化 key 版，再考虑 IMU |
| `codex_buddy` | placeholder | HTTP callback、headers、GIF、key、bridge config、canvas line | P0 HTTP/input + GIF 后做 |
| `voice_ai` | local package, incomplete upstream behavior | I2S audio、HTTP callback、GIF、key、app lifecycle、font | P3 audio 前只能保留非完整 UI |
| `devtools` | placeholder | app manager、httpd routes、file management | P2 service/file 后做 |
| `mini_claw` | placeholder | app route/webui、HTTP callback、credentials、bridge lifecycle | P2 service + P0 HTTP 后做 |
| `lv-benchmark` | placeholder | broad LVGL surface、arc/table/line/animation/style metrics | 不作为早期目标；它是 runtime 覆盖测试 |
| `nesgame` | local package, incomplete upstream behavior | native module ABI、`nes.*`、gamepad、key | P3 native/gamepad 后做 |
| `weather` | curated local package, incomplete upstream behavior | HTTP callback、time local/ntp extras、PNG/font/media、key | 先保持 curated port，再按 P0/P1 回归上游功能 |

## Execution Order

推荐顺序：

1. `smoke_input` + `key` module。
2. `smoke_http_callback` + HTTP callback compatibility。
3. `smoke_lvgl_style_font_anim`。
4. `smoke_canvas_media`。
5. `ConwayLife`、`FluidPendant`、`BTC display-only`、`hwmon display-only`。
6. `2048`、`settings`、`photos`、`videos`。
7. `app/httpd` service API。
8. `devtools`、`mini_claw`、`hwmon full`。
9. native/audio line：`nesgame`、`voice_ai`、`Spectrum`。

每个 slice 必须记录：

```text
npm test
npm run validate:apps
npm run package:demos
npm run test:firmware-static
git diff --check
board upload/launch/stop/switch evidence
```

没有板子证据时，只能标记 `build-verified` 或 `planned`，不能标记为完整功能移植完成。

