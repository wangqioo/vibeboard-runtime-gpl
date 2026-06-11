#!/usr/bin/env node
import { relative } from "node:path";
import { writeAppPlan } from "./index.mjs";

function usage() {
  console.error("Usage: npm run write:app-plan -- <plan.json> [--package]");
  console.error("Example: npm run write:app-plan -- examples/timer.json --package");
}

const args = process.argv.slice(2);
const packageOutput = args.includes("--package");
const planPath = args.find((arg) => arg !== "--package" && arg !== "-h" && arg !== "--help");

if (args.includes("-h") || args.includes("--help")) {
  usage();
  process.exit(0);
}

if (!planPath) {
  usage();
  process.exit(1);
}

try {
  const result = writeAppPlan({ planPath, packageOutput });
  console.log(`generated ${result.appId}`);
  console.log(`app ${relative(process.cwd(), result.appDir)}`);
  if (result.packageResult) {
    console.log(`package ${relative(process.cwd(), result.packageResult.outputPath)}`);
    console.log(`install ${result.packageResult.manifest.install.sdPath}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
