import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";
import { validateAppDirectory } from "../app-validator/index.mjs";

export const DEMO_APP_DIRS = [
  "apps/weather",
  "apps/voice_ai",
  "apps/nesgame",
  "apps/matrix_rain",
  "apps/nixie_clock",
  "apps/clock",
  "apps/conway_life",
  "apps/fluid_pendant",
  "apps/btc",
  "apps/settings",
  "apps/hwmon",
  "apps/spectrum",
  "apps/audio_loopback",
  "apps/videos",
  "apps/photos",
  "apps/plane",
  "apps/lv-benchmark",
  "apps/mini_claw",
  "apps/smoke_app_manager",
  "apps/smoke_controls",
  "apps/smoke_gamepad",
  "apps/smoke_i2s",
  "apps/smoke_key",
  "apps/smoke_nes",
  "apps/smoke_touch",
  "apps/2048"
];
export const PACKAGE_SCHEMA = "vibeboard-runtime-app-package@2";
export const DEFAULT_RUNTIME_REQUIREMENT = ">=0.1.0";
export const DEFAULT_LUA_API_REQUIREMENT = ">=0.1.0";
export const DEFAULT_LVGL_API_REQUIREMENT = ">=0.1.0";

const SKIP_NAMES = new Set([".DS_Store", "manifest.json"]);
const SKIP_DIRS = new Set([".cache", "tmp", "dist"]);
const VBIMG_HEADER_SIZE = 16;
const VBIMG_FORMAT_RGB565 = 1;

export function slugifyAppId(input) {
  const slug = String(input)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    throw new Error("Empty app id after slug normalization");
  }

  return slug;
}

function assertInsideRepo(repoRoot, targetPath) {
  const resolvedRoot = realpathSync(repoRoot);
  const resolvedTarget = realpathSync(targetPath);
  const rel = relative(resolvedRoot, resolvedTarget);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`App directory must be inside the repository: ${targetPath}`);
  }
  return { resolvedRoot, resolvedTarget };
}

function shouldSkipSource(direntName) {
  if (SKIP_NAMES.has(direntName)) return true;
  if (SKIP_DIRS.has(direntName)) return true;
  return false;
}

function copyAppFiles(sourceDir, outputDir) {
  function copyRecursive(currentSource, currentOutput) {
    mkdirSync(currentOutput, { recursive: true });

    for (const dirent of readdirSync(currentSource, { withFileTypes: true })) {
      if (shouldSkipSource(dirent.name)) continue;

      const sourcePath = join(currentSource, dirent.name);
      const outputPath = join(currentOutput, dirent.name);

      if (dirent.isSymbolicLink()) {
        continue;
      }

      if (dirent.isDirectory()) {
        copyRecursive(sourcePath, outputPath);
      } else if (dirent.isFile()) {
        cpSync(sourcePath, outputPath);
      }
    }
  }

  copyRecursive(sourceDir, outputDir);
}

function listFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    for (const dirent of readdirSync(currentDir, { withFileTypes: true })) {
      if (dirent.name === "manifest.json") continue;
      const fullPath = join(currentDir, dirent.name);
      if (dirent.isDirectory()) {
        walk(fullPath);
      } else if (dirent.isFile()) {
        const relPath = relative(rootDir, fullPath).split(sep).join("/");
        const content = readFileSync(fullPath);
        files.push({
          path: relPath,
          size: statSync(fullPath).size,
          sha256: createHash("sha256").update(content).digest("hex")
        });
      }
    }
  }

  walk(rootDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function digestManifestFiles(files) {
  const canonicalFiles = files.map((file) => ({
    path: file.path,
    size: file.size,
    sha256: file.sha256
  }));
  return createHash("sha256").update(`${JSON.stringify(canonicalFiles)}\n`).digest("hex");
}

function writeInstallNotes(outputDir, metadata, appId) {
  const notes = [
    "VibeBoard Runtime App Package",
    "",
    `App: ${metadata.name || appId}`,
    `Install path: /sd/apps/${appId}`,
    "",
    `Copy all files in this directory to /sd/apps/${appId} on the device storage.`,
    "This package does not flash firmware.",
    ""
  ].join("\n");
  writeFileSync(join(outputDir, "install-notes.txt"), notes);
}

function splitList(value) {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function copySharedLuaLibraries(repoRoot, metadata, outputDir) {
  const libs = splitList(metadata["shared.libs"]);
  if (libs.length === 0) return;

  const libOutputDir = join(outputDir, "lib");
  mkdirSync(libOutputDir, { recursive: true });
  for (const lib of libs) {
    if (!/^[a-zA-Z0-9_-]+$/.test(lib)) {
      throw new Error(`Invalid shared Lua library name: ${lib}`);
    }
    const sourcePath = join(repoRoot, "apps/lib", `${lib}.lua`);
    if (!existsSync(sourcePath)) {
      throw new Error(`Shared Lua library does not exist: apps/lib/${lib}.lua`);
    }
    cpSync(sourcePath, join(libOutputDir, `${lib}.lua`));
  }
}

function readBmpMetadata(buffer) {
  if (buffer.length < 54) return null;
  if (buffer.toString("ascii", 0, 2) !== "BM") return null;
  const pixelOffset = buffer.readUInt32LE(10);
  const dibHeaderSize = buffer.readUInt32LE(14);
  if (dibHeaderSize < 40 || buffer.length < 14 + dibHeaderSize) return null;

  const width = buffer.readInt32LE(18);
  const signedHeight = buffer.readInt32LE(22);
  const bpp = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  const height = Math.abs(signedHeight);
  if (width <= 0 || height <= 0 || pixelOffset >= buffer.length) return null;

  return {
    pixelOffset,
    dibHeaderSize,
    width,
    height,
    signedHeight,
    bpp,
    compression,
    topDown: signedHeight < 0
  };
}

function isRgb565Bmp(buffer) {
  const metadata = readBmpMetadata(buffer);
  if (!metadata || metadata.bpp !== 16) return false;
  const { compression } = metadata;
  if (compression === 0) return true;
  if (compression !== 3 || buffer.length < 66) return false;
  return buffer.readUInt32LE(54) === 0x0000f800 &&
    buffer.readUInt32LE(58) === 0x000007e0 &&
    buffer.readUInt32LE(62) === 0x0000001f;
}

function convertRgb565BmpToVbimg(buffer) {
  const metadata = readBmpMetadata(buffer);
  if (!metadata || !isRgb565Bmp(buffer)) {
    throw new Error("Only 16-bit RGB565 BMP assets can be converted to vbimg");
  }

  const { pixelOffset, width, signedHeight, height } = metadata;
  const rowSize = Math.ceil((16 * width) / 32) * 4;
  const pixelBytes = width * height * 2;
  if (pixelOffset + rowSize * height > buffer.length) {
    throw new Error("BMP pixel data is truncated");
  }
  if (width > 0xffff || height > 0xffff) {
    throw new Error("BMP dimensions exceed vbimg limits");
  }

  const output = Buffer.alloc(VBIMG_HEADER_SIZE + pixelBytes);
  output.write("VBIMG1", 0, "ascii");
  output.writeUInt16LE(width, 6);
  output.writeUInt16LE(height, 8);
  output.writeUInt8(VBIMG_FORMAT_RGB565, 10);
  output.writeUInt8(0, 11);
  output.writeUInt32LE(pixelBytes, 12);

  for (let y = 0; y < height; y++) {
    const sourceY = signedHeight > 0 ? height - 1 - y : y;
    const sourceStart = pixelOffset + sourceY * rowSize;
    const outputStart = VBIMG_HEADER_SIZE + y * width * 2;
    buffer.copy(output, outputStart, sourceStart, sourceStart + width * 2);
  }

  return output;
}

function bmpHasTransparentAlpha(buffer, metadata) {
  if (metadata.bpp !== 32) return false;
  const rowSize = Math.ceil((32 * metadata.width) / 32) * 4;
  if (metadata.pixelOffset + rowSize * metadata.height > buffer.length) {
    return false;
  }

  for (let y = 0; y < metadata.height; y++) {
    const rowStart = metadata.pixelOffset + y * rowSize;
    for (let x = 0; x < metadata.width; x++) {
      if (buffer[rowStart + x * 4 + 3] !== 0xff) {
        return true;
      }
    }
  }
  return false;
}

function buildBmpAlphaResource(sourcePath, outputDir, buffer, metadata) {
  const isSmallOverlay = metadata.width <= 128 && metadata.height <= 128;
  return {
    source: relative(outputDir, sourcePath).split(sep).join("/"),
    type: "image",
    role: isSmallOverlay ? "transparent-icon" : "transparent-image",
    format: "bmp-bgra-alpha",
    width: metadata.width,
    height: metadata.height,
    bpp: 32,
    alpha: true,
    transparent: bmpHasTransparentAlpha(buffer, metadata),
    topDown: metadata.topDown,
    size: buffer.length
  };
}

function preconvertRuntimeAssets(outputDir) {
  const resources = [];

  function walk(currentDir) {
    for (const dirent of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, dirent.name);
      if (dirent.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!dirent.isFile() || !dirent.name.toLowerCase().endsWith(".bmp")) {
        continue;
      }

      const source = readFileSync(fullPath);
      const metadata = readBmpMetadata(source);
      if (isRgb565Bmp(source)) {
        const vbimg = convertRgb565BmpToVbimg(source);
        const outputPath = `${fullPath.slice(0, -4)}.vbimg`;
        writeFileSync(outputPath, vbimg);
        resources.push({
          source: relative(outputDir, fullPath).split(sep).join("/"),
          output: relative(outputDir, outputPath).split(sep).join("/"),
          type: "image",
          format: "vbimg-rgb565",
          width: vbimg.readUInt16LE(6),
          height: vbimg.readUInt16LE(8),
          size: vbimg.length
        });
      } else if (metadata?.bpp === 32) {
        resources.push(buildBmpAlphaResource(fullPath, outputDir, source, metadata));
      }
    }
  }

  walk(outputDir);
  return resources.sort((a, b) => (a.output || a.source).localeCompare(b.output || b.source));
}

function buildManifestCompatibility(metadata, appId, capabilities) {
  return {
    app: {
      id: appId,
      name: metadata.name || appId,
      version: metadata.version || "0.0.0",
      kind: metadata.kind || "app"
    },
    requires: {
      runtime: metadata["requires.runtime"] || DEFAULT_RUNTIME_REQUIREMENT,
      luaApi: metadata["requires.luaApi"] || DEFAULT_LUA_API_REQUIREMENT,
      lvglApi: metadata["requires.lvglApi"] || DEFAULT_LVGL_API_REQUIREMENT,
      packageSchema: PACKAGE_SCHEMA,
      nativeAbi: metadata["requires.nativeAbi"] || null,
      capabilities
    },
    provides: {
      services: splitList(metadata["provides.services"])
    }
  };
}

function movePackageIntoPlace(tmpPath, outputPath) {
  rmSync(outputPath, { recursive: true, force: true });
  mkdirSync(dirname(outputPath), { recursive: true });

  try {
    renameSync(tmpPath, outputPath);
  } catch (error) {
    if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(error.code)) throw error;
    rmSync(outputPath, { recursive: true, force: true });
    try {
      renameSync(tmpPath, outputPath);
    } catch (retryError) {
      if (retryError.code !== "EPERM") throw retryError;
      cpSync(tmpPath, outputPath, { recursive: true });
      rmSync(tmpPath, { recursive: true, force: true });
    }
  }
}

export function packageApp({ repoRoot = process.cwd(), appDir }) {
  if (!appDir) throw new Error("appDir is required");
  if (!existsSync(appDir)) throw new Error(`App directory does not exist: ${appDir}`);

  const absoluteRepoRoot = resolve(repoRoot);
  const absoluteAppDir = resolve(appDir);
  assertInsideRepo(absoluteRepoRoot, absoluteAppDir);

  const validation = validateAppDirectory(absoluteAppDir);
  if (!validation.ok) {
    throw new Error(`App validation failed for ${appDir}: ${validation.errors.join("; ")}`);
  }

  const appId = slugifyAppId(basename(absoluteAppDir));
  const outputPath = join(absoluteRepoRoot, "dist/apps", appId);
  const tmpPath = join(absoluteRepoRoot, "dist/.tmp", `${appId}-${randomUUID()}`);

  rmSync(tmpPath, { recursive: true, force: true });
  mkdirSync(dirname(tmpPath), { recursive: true });
  copyAppFiles(absoluteAppDir, tmpPath);
  copySharedLuaLibraries(absoluteRepoRoot, validation.metadata, tmpPath);
  const resources = preconvertRuntimeAssets(tmpPath);
  writeInstallNotes(tmpPath, validation.metadata, appId);

  const compatibility = buildManifestCompatibility(validation.metadata, appId, validation.capabilities);
  const files = listFiles(tmpPath);
  const manifest = {
    schema: PACKAGE_SCHEMA,
    appId,
    sourcePath: relative(absoluteRepoRoot, absoluteAppDir).split(sep).join("/"),
    outputPath: relative(absoluteRepoRoot, outputPath).split(sep).join("/"),
    name: validation.metadata.name,
    entry: validation.metadata.entry,
    description: validation.metadata.description,
    ...compatibility,
    capabilities: validation.capabilities,
    resources,
    files,
    integrity: {
      algorithm: "sha256",
      filesDigest: digestManifestFiles(files)
    },
    install: {
      sdPath: `/sd/apps/${appId}`,
      copy: `Copy the contents of this directory to /sd/apps/${appId} on the device storage.`
    }
  };

  writeFileSync(join(tmpPath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  movePackageIntoPlace(tmpPath, outputPath);

  return { appId, outputPath, manifest };
}

export function packageDemoApps({ repoRoot = process.cwd() } = {}) {
  return DEMO_APP_DIRS.map((appDir) =>
    packageApp({ repoRoot, appDir: join(repoRoot, appDir) })
  );
}
