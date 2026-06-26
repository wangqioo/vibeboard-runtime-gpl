import { pathToFileURL } from "node:url";
import { sendRequest } from "../app-uploader/index.mjs";

const DEFAULT_BOARD_URL = "http://192.168.1.32:8080";
const DEFAULT_APP_ID = "smoke_nes";
const DEFAULT_ROM_PATH = "roms/smoke.nes";

function usage() {
  console.error("Usage: node tools/nes-rom-smoke/index.mjs [--board <url>] [--app smoke_nes] [--path roms/smoke.nes]");
  console.error("Options:");
  console.error("  --board <url>  Board base URL, default http://192.168.1.32:8080");
  console.error("  --app <id>     App id whose app-local ROM path should receive the ROM, default smoke_nes");
  console.error("  --path <path>  App-local ROM path, default roms/smoke.nes");
  console.error("  --no-upload    Generate and report ROM metadata without uploading");
}

function assertSafeRelativePath(path, label) {
  if (!path || path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`Unsafe ${label}: ${path}`);
  }
}

export function createSmokeNesRom() {
  const headerSize = 16;
  const prgSize = 16 * 1024;
  const chrSize = 8 * 1024;
  const rom = Buffer.alloc(headerSize + prgSize + chrSize, 0);

  rom[0] = 0x4e;
  rom[1] = 0x45;
  rom[2] = 0x53;
  rom[3] = 0x1a;
  rom[4] = 1;
  rom[5] = 1;
  rom[6] = 0;
  rom[7] = 0;

  const prgStart = headerSize;
  const program = [
    0xa9, 0x01, 0x8d, 0x15, 0x40,
    0xa9, 0x30, 0x8d, 0x00, 0x40,
    0xa9, 0xfd, 0x8d, 0x02, 0x40,
    0xa9, 0x08, 0x8d, 0x03, 0x40,
    0x4c, 0x15, 0x80,
  ];
  rom.set(program, prgStart);

  const vectorBase = prgStart + prgSize - 6;
  for (let i = 0; i < 3; i++) {
    rom[vectorBase + i * 2] = 0x00;
    rom[vectorBase + i * 2 + 1] = 0x80;
  }

  const chrStart = prgStart + prgSize;
  for (let tile = 0; tile < 256; tile++) {
    const offset = chrStart + tile * 16;
    const pattern = tile % 2 === 0 ? 0xaa : 0x55;
    for (let row = 0; row < 8; row++) {
      rom[offset + row] = pattern;
      rom[offset + 8 + row] = row % 2 === 0 ? 0x00 : 0xff;
    }
  }

  return rom;
}

export function parseNesRomSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    boardUrl: DEFAULT_BOARD_URL,
    appId: DEFAULT_APP_ID,
    romPath: DEFAULT_ROM_PATH,
    upload: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--board") {
      options.boardUrl = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--board=")) {
      options.boardUrl = arg.slice("--board=".length);
      continue;
    }
    if (arg === "--app") {
      options.appId = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--app=")) {
      options.appId = arg.slice("--app=".length);
      continue;
    }
    if (arg === "--path") {
      options.romPath = argv[++i] || "";
      continue;
    }
    if (arg.startsWith("--path=")) {
      options.romPath = arg.slice("--path=".length);
      continue;
    }
    if (arg === "--no-upload") {
      options.upload = false;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.help) {
    if (!options.boardUrl) throw new Error("--board is required");
    assertSafeRelativePath(options.appId, "app id");
    assertSafeRelativePath(options.romPath, "ROM path");
  }

  return options;
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function encodeRelativePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function uploadSmokeNesRom({
  boardUrl = DEFAULT_BOARD_URL,
  appId = DEFAULT_APP_ID,
  romPath = DEFAULT_ROM_PATH,
  requestImpl = sendRequest,
} = {}) {
  if (!boardUrl) throw new Error("boardUrl is required");
  assertSafeRelativePath(appId, "app id");
  assertSafeRelativePath(romPath, "ROM path");

  const rom = createSmokeNesRom();
  const baseUrl = normalizeBaseUrl(boardUrl);
  const stopResponse = await requestImpl(`${baseUrl}/stop`, Buffer.alloc(0), { method: "POST" });
  if (!stopResponse.ok) {
    throw new Error(`stop before ROM upload failed: ${stopResponse.status} ${stopResponse.text || ""}`.trim());
  }
  const url = `${baseUrl}/install?app=${encodeURIComponent(appId)}&path=${encodeRelativePath(romPath)}`;
  const response = await requestImpl(url, rom, { method: "POST", timeoutMs: 30000 });
  if (!response.ok) {
    throw new Error(`upload ROM failed: ${response.status} ${response.text || ""}`.trim());
  }
  return {
    appId,
    path: romPath,
    bytes: rom.length,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseNesRomSmokeArgs();
    if (options.help) {
      usage();
      process.exit(0);
    }
    if (!options.upload) {
      const rom = createSmokeNesRom();
      console.log(`nes smoke rom ok: bytes=${rom.length} mapper=0 prg=1 chr=1 upload=false`);
    } else {
      const result = await uploadSmokeNesRom(options);
      console.log(`nes smoke rom uploaded: app=${result.appId} path=${result.path} bytes=${result.bytes}`);
    }
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
  }
}
