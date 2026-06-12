#!/usr/bin/env node
import { createNcRequest, uploadApp } from "./index.mjs";

function usage() {
  console.error("Usage: node tools/app-uploader/cli.mjs <board-url> <dist-app-dir> [app-id]");
  console.error("Example: node tools/app-uploader/cli.mjs http://192.168.1.32:8080 dist/apps/smoke_network smoke_network");
}

const [boardUrl, appDir, appId] = process.argv.slice(2);
if (!boardUrl || !appDir || boardUrl === "-h" || boardUrl === "--help") {
  usage();
  process.exit(boardUrl === "-h" || boardUrl === "--help" ? 0 : 1);
}

try {
  const result = await uploadApp({ appDir, boardUrl, appId, requestImpl: createNcRequest() });
  for (const file of result.files) {
    console.log(`uploaded ${result.appId}/${file.relativePath} ${file.size} bytes`);
  }
  console.log(`uploaded ${result.files.length} files`);
  if (result.confirmed) {
    console.log(`rescan ok; confirmed ${result.appId} in /apps`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
