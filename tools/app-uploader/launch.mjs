#!/usr/bin/env node
import { createNcRequest, launchApp } from "./index.mjs";

function usage() {
  console.error("Usage: node tools/app-uploader/launch.mjs <board-url> <app-id>");
  console.error("Example: node tools/app-uploader/launch.mjs http://192.168.1.32:8080 smoke_visual_remote");
}

const [boardUrl, appId] = process.argv.slice(2);
if (!boardUrl || !appId || boardUrl === "-h" || boardUrl === "--help") {
  usage();
  process.exit(boardUrl === "-h" || boardUrl === "--help" ? 0 : 1);
}

try {
  const result = await launchApp({ boardUrl, appId, requestImpl: createNcRequest() });
  console.log(`launched ${result.launched || appId}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
