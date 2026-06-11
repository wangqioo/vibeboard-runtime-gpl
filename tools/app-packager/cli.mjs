#!/usr/bin/env node
import { relative } from "node:path";
import { packageApp } from "./index.mjs";

function usage() {
  console.error("Usage: npm run package:app -- <app-dir>");
  console.error("Example: npm run package:app -- apps/weather");
}

const [appDir] = process.argv.slice(2);

if (!appDir || appDir === "-h" || appDir === "--help") {
  usage();
  process.exit(appDir ? 0 : 1);
}

try {
  const result = packageApp({ appDir });
  console.log(`packaged ${result.appId}`);
  console.log(`output ${relative(process.cwd(), result.outputPath)}`);
  console.log(`install ${result.manifest.install.sdPath}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
