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

export const DEMO_APP_DIRS = ["apps/weather", "apps/voice_ai", "apps/nesgame"];
export const PACKAGE_SCHEMA = "vibeboard-runtime-app-package@1";

const SKIP_NAMES = new Set([".DS_Store", "manifest.json"]);
const SKIP_DIRS = new Set([".cache", "tmp", "dist"]);

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

function movePackageIntoPlace(tmpPath, outputPath) {
  rmSync(outputPath, { recursive: true, force: true });
  mkdirSync(dirname(outputPath), { recursive: true });

  try {
    renameSync(tmpPath, outputPath);
  } catch (error) {
    if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
    rmSync(outputPath, { recursive: true, force: true });
    renameSync(tmpPath, outputPath);
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
  writeInstallNotes(tmpPath, validation.metadata, appId);

  const manifest = {
    schema: PACKAGE_SCHEMA,
    appId,
    sourcePath: relative(absoluteRepoRoot, absoluteAppDir).split(sep).join("/"),
    outputPath: relative(absoluteRepoRoot, outputPath).split(sep).join("/"),
    name: validation.metadata.name,
    entry: validation.metadata.entry,
    description: validation.metadata.description,
    capabilities: validation.capabilities,
    files: listFiles(tmpPath),
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
