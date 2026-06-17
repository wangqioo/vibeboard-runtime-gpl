# Upstream Map

## Imported Snapshots

| Path | Source | Purpose |
| --- | --- | --- |
| `upstream/holocubic-apps/` | `https://github.com/clocteck/holocubic-apps` | Lua/LVGL apps and docs. |
| `upstream/holocubic-nes-esp32/` | `https://github.com/clocteck/holocubic-nes-esp32` | NES native dynamic module. |

## Curated Demo Sources

| Demo | Source path | Local path |
| --- | --- | --- |
| Weather | `upstream/holocubic-apps/weather/` | `apps/weather/` |
| Voice AI | `upstream/holocubic-apps/voice_ai/` | `apps/voice_ai/` |
| NES game | `upstream/holocubic-apps/nesgame/` | `apps/nesgame/` |
| NES module | `upstream/holocubic-nes-esp32/` | `modules/nes/` |
| Matrix Rain | `upstream/holocubic-apps/MatrixRain/` | `apps/matrix_rain/` |
| Nixie Clock | `upstream/holocubic-apps/NixieClock/` | `apps/nixie_clock/` |
| Clock | `upstream/holocubic-apps/clock/` | `apps/clock/` |
| ConwayLife | `upstream/holocubic-apps/ConwayLife/` | `apps/conway_life/` |
| FluidPendant | `upstream/holocubic-apps/FluidPendant/` | `apps/fluid_pendant/` |

## Current Migration Queue

| Upstream app | Target local path | Notes |
| --- | --- | --- |
| 2048 or another light interactive app | TBD | Next candidate after display-app board verification; expected to drive Lua touch/key input work. |

## License

Both upstream projects are GPL-3.0. This repository is GPL-3.0-only.
