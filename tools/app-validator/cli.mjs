#!/usr/bin/env node
import { validateAppDirectory } from "./index.mjs";

const appDirs = process.argv.slice(2);

if (appDirs.length === 0) {
  console.error("Usage: node tools/app-validator/cli.mjs <app-dir> [app-dir...]");
  process.exit(2);
}

let failed = false;

for (const appDir of appDirs) {
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
