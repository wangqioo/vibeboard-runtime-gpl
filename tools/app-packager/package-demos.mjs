#!/usr/bin/env node
import { relative } from "node:path";
import { packageDemoApps } from "./index.mjs";

try {
  const results = packageDemoApps();
  for (const result of results) {
    console.log(`${result.appId} -> ${relative(process.cwd(), result.outputPath)}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
