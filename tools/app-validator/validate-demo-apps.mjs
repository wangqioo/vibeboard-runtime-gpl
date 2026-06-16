#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validateAppDirectory } from "./index.mjs";

const demoAppNames = [
  "weather",
  "voice_ai",
  "nesgame",
  "demo_pixel_pet",
  "demo_focus_timer",
  "demo_lucky_card",
  "demo_space_dash",
  "demo_digital_clock",
  "holocubic_2048",
  "holocubic_btc",
  "holocubic_conway_life",
  "holocubic_fluid_pendant",
  "holocubic_nixie_clock",
  "holocubic_analog_clock",
  "holocubic_matrix_rain",
  "holocubic_spectrum",
  "holocubic_codex_buddy",
  "holocubic_devtools",
  "holocubic_hwmon",
  "holocubic_lv_benchmark",
  "holocubic_mini_claw",
  "holocubic_photos",
  "holocubic_plane",
  "holocubic_settings",
  "holocubic_videos",
  "demo_terminal_status",
  "demo_neon_dash",
  "demo_night_light",
  "demo_auto_snake",
  "smoke_canvas"
];

let failed = false;

for (const appName of demoAppNames) {
  const localAppDir = join("apps", appName);
  const upstreamAppDir = join("upstream", "holocubic-apps", appName);
  const appDir = existsSync(localAppDir) ? localAppDir : upstreamAppDir;
  const result = validateAppDirectory(appDir);

  if (result.ok) {
    console.log(`ok ${appDir} (${result.appName})`);
    for (const warning of result.warnings) {
      console.log(`warn ${appDir}: ${warning}`);
    }
  } else {
    failed = true;
    console.error(`fail ${appDir}`);
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
  }
}

process.exit(failed ? 1 : 0);
