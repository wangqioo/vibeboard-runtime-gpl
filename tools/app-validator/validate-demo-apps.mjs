#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validateAppDirectory } from "./index.mjs";

const demoAppNames = ["weather", "voice_ai", "nesgame"];

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
