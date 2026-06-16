# Holocubic App Migration

更新时间：2026-06-16

目标是把 `https://github.com/clocteck/holocubic-apps.git` 中的 20 个应用逐步迁移到 VibeBoard Runtime。当前仓库里的 `upstream/holocubic-apps` 与上游 `78da33f` 一致，因此迁移工作的重点不是拉源码，而是把应用适配到当前 Runtime 的 Lua/LVGL/API 边界。

机器可读矩阵在 `docs/holocubic-app-migration.json`。它记录每个上游 app 的目标 id、迁移阶段、状态和缺失 runtime 能力。

完整功能迁移路线见 `docs/holocubic-full-port-plan.md`。这里先明确口径：

- `upstream/holocubic-apps` 是完整源码镜像；
- `apps/<target-id>` 是当前 VibeBoard runtime 可安装包；
- “本地 catalog 已补齐”只表示 20 个目标都有本地目录，能进入验证、打包、展示和启动链路；
- “完整功能移植”要求上游功能在当前板子上通过 validate、package、staged upload、launch、stop、switch 验证；
- 目前只有 `NixieClock`、`clock`、`MatrixRain` 是兼容移植完成，大部分目标仍是安全占位入口。

占位入口不是完成状态。它的目的只是避免未支持 API 在板子上崩溃，并把缺失 runtime slice 显示给用户。

## Full Local Catalog Baseline

现在 20 个上游 Holocubic 目标都已经有本地 `apps/<target-id>` 包，并进入 `validate:apps`、`package:demos` 和迁移矩阵测试。

当前分层：

- 完整兼容移植：`holocubic_nixie_clock`、`holocubic_analog_clock`、`holocubic_matrix_rain`
- 已有本地包但上游完整行为仍依赖后续 runtime：`weather`、`voice_ai`、`nesgame`
- 显式占位入口：`holocubic_2048`、`holocubic_btc`、`holocubic_conway_life`、`holocubic_fluid_pendant`、`holocubic_spectrum`、`holocubic_codex_buddy`、`holocubic_devtools`、`holocubic_hwmon`、`holocubic_lv_benchmark`、`holocubic_mini_claw`、`holocubic_photos`、`holocubic_plane`、`holocubic_settings`、`holocubic_videos`

占位入口不是伪装成已移植应用。它们启动后会显示：

```text
Runtime update required
Missing runtime: <required slice>
```

这样全量目录可以被浏览、打包、上传和启动，同时不会把缺 input、HTTP callback、media decode、native module 或完整 LVGL surface 的应用误标成完成。

## Phase 1: Safe Visual Ports

首批迁移只使用已经真机验证过的 `lvgl,timer` 子集，不依赖 PNG/GIF、canvas、输入、网络 callback 或 native module。

已迁移：

- `NixieClock` -> `apps/holocubic_nixie_clock`
- `clock` -> `apps/holocubic_analog_clock`

这两个是兼容移植版：保留上游视觉意图，但用安全 LVGL 对象重建画面，不直接使用上游 PNG 资源。这样可以先验证 app 进入当前平台的完整链路：validate、package、staged upload、launch、stop、launcher return。

## Phase 2: Canvas Screensavers

已迁移：

- `MatrixRain` -> `apps/holocubic_matrix_rain`

当前 Runtime 已补最小 canvas 子集：

- `lv_canvas_create`
- `lv_canvas_fill_bg`
- `lv_canvas_draw_rect`
- `lv_canvas_draw_text`
- `lv_canvas_frame_begin` / `lv_canvas_frame_end`
- `lv_obj_invalidate`

这个版本仍然是兼容移植版：保留上游矩阵雨的视觉意图和计时器动画，但收敛到当前可验证的 canvas API，不引入输入、网络 callback、图片解码或自由字体加载。

候选：

- `ConwayLife`
- `FluidPendant`
- `BTC`
- `hwmon` display-only

后续需要继续补并真机验证：

- `lv_canvas_draw_line`
- 可能还需要 `time.getlocal`、HTTP callback 兼容。

## Phase 3: Input Apps

候选：

- `2048`
- `settings`
- `photos`
- `videos`
- `Spectrum`
- `plane` simplified controls

需要先补并真机验证：

- `key.on`
- `key.off`
- `key.LEFT`, `key.RIGHT`, `key.UP`, `key.DOWN`
- `touch.on`
- input cleanup on app stop
- `lv_anim_start` / animation cleanup

## Phase 4: Service And WebUI Apps

候选：

- `devtools`
- `mini_claw`
- `hwmon` full mode
- `settings` full mode

需要先设计和验证：

- app-owned HTTP route lifecycle
- `app.route_base`
- `app.list`
- `app.launch`
- `app.rescan`
- broader but sandboxed file APIs

这些会影响安全边界，不能在没有测试的情况下直接开放。

## Phase 5: Bridge And AI Apps

候选：

- `codex_buddy`
- `voice_ai`
- `mini_claw` full bridge mode
- `hwmon` host bridge mode

需要先补：

- HTTP headers/timeout/callback form
- bridge health checks
- no-bridge UI fallback
- credentials/config exclusion rules
- `voice_ai` 还需要音频/I2S。

## Phase 6: Native And Benchmark Apps

候选：

- `nesgame`
- `lv-benchmark`
- high-fidelity `plane`

需要先补：

- native module policy
- module ABI/versioning
- crash containment
- gamepad/input mapping
- broad LVGL benchmark surface

## Cross-Cutting Rules

- 优先迁移能在当前硬件上稳定演示的应用。
- 优先 package-time 资源转换或对象重绘，不急着一次性打开所有图片解码器。
- 每个阶段都必须跑 `validate -> package -> staged upload -> launch -> stop -> switch app`。
- 原样上游移植和兼容移植要在矩阵里标明，不混淆。
- 不能为了某个 app 临时打开危险文件/API 权限，必须先有 smoke test 和生命周期清理。
