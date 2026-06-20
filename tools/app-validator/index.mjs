import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CAPABILITY_USAGE_PATTERNS = [
  { capability: "lvgl", pattern: /\blv_[A-Za-z0-9_]+\b|\bLV_[A-Za-z0-9_]+\b/ },
  { capability: "timer", pattern: /\btmr\s*\.|\bset_interval\s*\(/ },
  { capability: "network", pattern: /\b(?:http|net|mqtt|wifi)\s*\.|\bwebsocket\b|\binitntp\s*\(/ },
  { capability: "audio", pattern: /\bi2s\s*\./ },
  { capability: "file", pattern: /\bfile\s*\./ },
  { capability: "input", pattern: /\b(?:key|touch)\s*\./ },
  { capability: "module", pattern: /\brequire\s*\(/ }
];

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const LVGL_BINDING_SOURCE_PATHS = [
  join(repoRoot, "firmware/vibeboard_runtime/main/lua_lvgl.c"),
  join(repoRoot, "firmware/vibeboard_runtime/main/lua_lvgl_canvas.c"),
  join(repoRoot, "firmware/vibeboard_runtime/main/lua_lvgl_fs.c"),
  join(repoRoot, "firmware/vibeboard_runtime/main/lua_lvgl_widgets.c")
];

function readSupportedLvglSymbols() {
  const supported = new Set();
  for (const sourcePath of LVGL_BINDING_SOURCE_PATHS) {
    if (!existsSync(sourcePath)) continue;
    const source = readFileSync(sourcePath, "utf8");
    for (const match of source.matchAll(/lua_setglobal\(L,\s*"((?:lv|LV|ANIM)_[A-Za-z0-9_]+)"\)/g)) {
      supported.add(match[1]);
    }
    for (const match of source.matchAll(/\{\s*"((?:lv|LV|ANIM)_[A-Za-z0-9_]+)"\s*,/g)) {
      supported.add(match[1]);
    }
  }
  return supported;
}

const SUPPORTED_LVGL_SYMBOLS = readSupportedLvglSymbols();

function findUnsupportedLvglSymbols(entryContent) {
  const unsupported = new Set();
  const localSymbols = new Set(
    [...entryContent.matchAll(/\blocal\s+(lv_[A-Za-z0-9_]+)\b/g)]
      .map((match) => match[1])
  );
  const optionalSymbols = new Set(
    [...entryContent.matchAll(/\bif\s+(?:not\s+)?(lv_[A-Za-z0-9_]+)\s+then\b/g)]
      .map((match) => match[1])
  );
  for (const match of entryContent.matchAll(/\b(lv_[A-Za-z0-9_]+)\s*\(/g)) {
    const symbol = match[1];
    if (symbol.endsWith("_fn") || localSymbols.has(symbol) || optionalSymbols.has(symbol)) {
      continue;
    }
    if (!SUPPORTED_LVGL_SYMBOLS.has(symbol)) {
      unsupported.add(symbol);
    }
  }
  return [...unsupported].sort();
}

export function parseAppInfo(text) {
  const data = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (!match) {
      throw new Error(`Invalid app.info line: ${rawLine}`);
    }
    data[match[1]] = match[2].trim();
  }
  return data;
}

export function validateAppDirectory(appDir) {
  const errors = [];
  const warnings = [];
  const appInfoPath = join(appDir, "app.info");

  if (!existsSync(appInfoPath)) {
    return {
      ok: false,
      appDir,
      appName: basename(appDir),
      metadata: {},
      errors: ["Missing app.info"],
      warnings
    };
  }

  let metadata = {};
  try {
    metadata = parseAppInfo(readFileSync(appInfoPath, "utf8"));
  } catch (error) {
    errors.push(error.message);
  }

  for (const field of ["name", "entry", "description"]) {
    if (!metadata[field]) errors.push(`Missing required field: ${field}`);
  }

  let validatedEntryPath = "";
  if (metadata.entry) {
    const normalizedEntry = normalize(metadata.entry);
    const entrySegments = normalizedEntry.split(/[\\/]+/);
    if (
      isAbsolute(normalizedEntry) ||
      entrySegments.includes("..")
    ) {
      errors.push("Entry path must stay inside the app directory");
    } else {
      const entryPath = join(appDir, normalizedEntry);
      if (!existsSync(entryPath)) {
        errors.push(`Entry file does not exist: ${metadata.entry}`);
      } else {
        const resolvedAppDir = realpathSync(appDir);
        const resolvedEntryPath = realpathSync(entryPath);
        const resolvedRelativeEntry = relative(resolvedAppDir, resolvedEntryPath);
        const relativeSegments = resolvedRelativeEntry.split(sep);
        if (
          relativeSegments.includes("..") ||
          isAbsolute(resolvedRelativeEntry)
        ) {
          errors.push("Entry path must stay inside the app directory");
        } else if (!statSync(entryPath).isFile()) {
          errors.push(`Entry path is not a file: ${metadata.entry}`);
        } else {
          validatedEntryPath = entryPath;
        }
      }
    }
  }

  const capabilities = metadata.capabilities
    ? metadata.capabilities.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  const declaredCapabilities = new Set(capabilities);

  if (metadata.kind === "service" && !capabilities.includes("service")) {
    warnings.push("Service apps should declare capabilities = service");
  }

  if (validatedEntryPath) {
    const entryContent = readFileSync(validatedEntryPath, "utf8");
    for (const { capability, pattern } of CAPABILITY_USAGE_PATTERNS) {
      if (pattern.test(entryContent) && !declaredCapabilities.has(capability)) {
        errors.push(`Missing capability declaration: ${capability}`);
      }
    }
    if (declaredCapabilities.has("lvgl")) {
      for (const symbol of findUnsupportedLvglSymbols(entryContent)) {
        errors.push(`Runtime update required: unsupported LVGL API ${symbol}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    appDir,
    appName: metadata.name || basename(appDir),
    metadata,
    capabilities,
    errors,
    warnings,
    relativeEntry: metadata.entry ? relative(appDir, join(appDir, metadata.entry)) : ""
  };
}
