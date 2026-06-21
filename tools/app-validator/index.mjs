import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CAPABILITY_USAGE_PATTERNS = [
  { capability: "lvgl", pattern: /\blv_[A-Za-z0-9_]+\b|\bLV_[A-Za-z0-9_]+\b/ },
  { capability: "timer", pattern: /\btmr\s*\.|\bset_interval\s*\(/ },
  { capability: "network", pattern: /\b(?:http|net|mqtt|wifi)\s*\.|\bwebsocket\b|\binitntp\s*\(/ },
  { capability: "audio", pattern: /\bi2s\s*\./ },
  { capability: "file", pattern: /\bfile\s*\./ },
  { capability: "input", pattern: /\b(?:key|touch|gamepad)\s*\./ },
  { capability: "module", pattern: /\brequire\s*\(/ }
];

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
export const CURRENT_RUNTIME_VERSION = "0.1.0";
export const CURRENT_LUA_API_VERSION = "0.1.0";
export const CURRENT_LVGL_API_VERSION = "0.1.0";
export const CURRENT_NATIVE_ABI = "vibeboard-native-module-abi@1";
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
export const SUPPORTED_LUA_API_SYMBOLS = new Set([
  "app.current",
  "app.exiting",
  "app.exit",
  "app.launch",
  "app.list",
  "app.on",
  "app.rescan",
  "app.set_home_exit",
  "file.exists",
  "file.getcontents",
  "file.listdir",
  "file.list",
  "file.open",
  "file.read",
  "file.write",
  "gamepad.off",
  "gamepad.on",
  "gamepad.push_state",
  "gamepad.rescan",
  "gamepad.start",
  "gamepad.state",
  "gamepad.stop",
  "http.cubicserver.get",
  "http.get",
  "http.post",
  "i2s.read",
  "i2s.start",
  "i2s.status",
  "i2s.stop",
  "json.decode",
  "json.encode",
  "key.off",
  "key.on",
  "key.push",
  "key.repeat_start",
  "key.repeat_stop",
  "sjson.decode",
  "sjson.encode",
  "time.get",
  "time.getlocal",
  "time.initntp",
  "time.settimezone",
  "tmr.create",
  "tmr.now",
  "tmr.time",
  "touch.off",
  "touch.on",
  "touch.push",
  "wifi.mode",
  "wifi.start",
  "wifi.sta.config",
  "wifi.sta.connect",
  "wifi.sta.getip"
]);
const CHECKED_LUA_API_MODULES = [
  "app",
  "file",
  "gamepad",
  "http",
  "i2s",
  "json",
  "key",
  "sjson",
  "time",
  "tmr",
  "touch",
  "wifi"
];

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

function isOptionalLuaApiProbe(entryContent, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const guardPattern = new RegExp(`\\bif\\s+[^\\n]*\\b${escaped}\\b[^\\n]*\\bthen\\b`);
  return guardPattern.test(entryContent);
}

function findUnsupportedLuaApiSymbols(entryContent) {
  const unsupported = new Set();
  const modulePattern = CHECKED_LUA_API_MODULES.join("|");
  const apiPattern = new RegExp(`(?<![A-Za-z0-9_\\.])((?:${modulePattern})(?:\\.[A-Za-z_][A-Za-z0-9_]*){1,2})\\s*\\(`, "g");

  for (const match of entryContent.matchAll(apiPattern)) {
    const symbol = match[1];
    if (SUPPORTED_LUA_API_SYMBOLS.has(symbol) || isOptionalLuaApiProbe(entryContent, symbol)) {
      continue;
    }
    unsupported.add(symbol);
  }
  return [...unsupported].sort();
}

function listLuaFiles(appDir) {
  const files = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".lua")) {
        files.push(fullPath);
      }
    }
  }

  walk(appDir);
  return files.sort((a, b) => relative(appDir, a).localeCompare(relative(appDir, b)));
}

function addUnique(errors, message) {
  if (!errors.includes(message)) {
    errors.push(message);
  }
}

function parseSemver(value) {
  const match = String(value).trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) return null;
  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2] || "0", 10),
    Number.parseInt(match[3] || "0", 10)
  ];
}

function compareSemver(left, right) {
  for (let index = 0; index < 3; index++) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
}

function satisfiesMinimumRequirement(requirement, currentVersion) {
  if (!requirement) return true;
  const trimmed = String(requirement).trim();
  const exact = parseSemver(trimmed);
  if (exact) {
    const current = parseSemver(currentVersion);
    return current != null && compareSemver(current, exact) === 0;
  }
  const minMatch = trimmed.match(/^>=\s*(.+)$/);
  if (!minMatch) return false;
  const minimum = parseSemver(minMatch[1]);
  const current = parseSemver(currentVersion);
  return minimum != null && current != null && compareSemver(current, minimum) >= 0;
}

function parseNativeAbiMajor(value) {
  const match = String(value).trim().match(/(?:vibeboard-native-module-abi@|>=\s*)?(\d+)(?:\.\d+){0,2}$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function satisfiesNativeAbiRequirement(requirement, currentAbi) {
  if (!requirement) return true;
  const currentMajor = parseNativeAbiMajor(currentAbi);
  const requiredMajor = parseNativeAbiMajor(requirement);
  if (currentMajor == null || requiredMajor == null) return false;
  return currentMajor >= requiredMajor;
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

  const versionRequirements = [
    ["runtime", metadata["requires.runtime"], CURRENT_RUNTIME_VERSION, satisfiesMinimumRequirement],
    ["luaApi", metadata["requires.luaApi"], CURRENT_LUA_API_VERSION, satisfiesMinimumRequirement],
    ["lvglApi", metadata["requires.lvglApi"], CURRENT_LVGL_API_VERSION, satisfiesMinimumRequirement],
    ["nativeAbi", metadata["requires.nativeAbi"], CURRENT_NATIVE_ABI, satisfiesNativeAbiRequirement]
  ];
  for (const [label, requirement, current, satisfies] of versionRequirements) {
    if (requirement && !satisfies(requirement, current)) {
      errors.push(`Runtime update required: requires ${label} ${requirement}, current ${current}`);
    }
  }

  if (validatedEntryPath) {
    const luaFiles = listLuaFiles(appDir);
    for (const luaFile of luaFiles) {
      const entryContent = readFileSync(luaFile, "utf8");

      for (const { capability, pattern } of CAPABILITY_USAGE_PATTERNS) {
        if (pattern.test(entryContent) && !declaredCapabilities.has(capability)) {
          addUnique(errors, `Missing capability declaration: ${capability}`);
        }
      }

      if (declaredCapabilities.has("lvgl")) {
        for (const symbol of findUnsupportedLvglSymbols(entryContent)) {
          addUnique(errors, `Runtime update required: unsupported LVGL API ${symbol}`);
        }
      }

      for (const symbol of findUnsupportedLuaApiSymbols(entryContent)) {
        addUnique(errors, `Runtime update required: unsupported Lua API ${symbol}`);
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
