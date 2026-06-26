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
  { capability: "webui", pattern: /\bapp\s*\.\s*(?:route_base|set_webui|route)\s*\(/ },
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

export const SUPPORTED_LVGL_SYMBOLS = readSupportedLvglSymbols();
export const SUPPORTED_LUA_API_SYMBOLS = new Set([
  "app.current",
  "app.exiting",
  "app.exit",
  "app.launch",
  "app.list",
  "app.on",
  "app.route",
  "app.route_base",
  "app.rescan",
  "app.set_webui",
  "app.set_home_exit",
  "sys.setbrightness",
  "file.exists",
  "file.getcontents",
  "file.listdir",
  "file.list",
  "file.open",
  "file.read",
  "file.mkdir",
  "file.putcontents",
  "file.remove",
  "file.rename",
  "file.rmdir",
  "file.stat",
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
  "i2s.write",
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
  "sys",
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
  "sys",
  "sjson",
  "time",
  "tmr",
  "touch",
  "wifi"
];

function isIdentStart(char) {
  return /[A-Za-z_]/.test(char || "");
}

function isIdentPart(char) {
  return /[A-Za-z0-9_]/.test(char || "");
}

function skipLuaQuotedString(source, index, quote) {
  index++;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) {
      return index + 1;
    }
    index++;
  }
  return index;
}

function skipLuaLongBracket(source, index) {
  if (source[index] !== "[") {
    return index;
  }
  let cursor = index + 1;
  while (source[cursor] === "=") {
    cursor++;
  }
  if (source[cursor] !== "[") {
    return index;
  }

  const close = `]${"=".repeat(cursor - index - 1)}]`;
  const closeIndex = source.indexOf(close, cursor + 1);
  return closeIndex === -1 ? source.length : closeIndex + close.length;
}

function skipLuaComment(source, index) {
  let cursor = index + 2;
  if (source[cursor] === "[") {
    const afterLongComment = skipLuaLongBracket(source, cursor);
    if (afterLongComment !== cursor) {
      return afterLongComment;
    }
  }

  const newline = source.indexOf("\n", cursor);
  return newline === -1 ? source.length : newline + 1;
}

function readIdentifierPath(source, index) {
  if (!isIdentStart(source[index])) {
    return null;
  }

  let cursor = index + 1;
  while (isIdentPart(source[cursor])) {
    cursor++;
  }

  let value = source.slice(index, cursor);
  while (source[cursor] === "." && isIdentStart(source[cursor + 1])) {
    cursor++;
    const segmentStart = cursor;
    cursor++;
    while (isIdentPart(source[cursor])) {
      cursor++;
    }
    value += `.${source.slice(segmentStart, cursor)}`;
  }

  return { value, end: cursor };
}

function readLuaFunctionCalls(source) {
  const calls = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "-" && next === "-") {
      index = skipLuaComment(source, index);
      continue;
    }
    if (char === "\"" || char === "'") {
      index = skipLuaQuotedString(source, index, char);
      continue;
    }
    if (char === "[") {
      const afterLongBracket = skipLuaLongBracket(source, index);
      if (afterLongBracket !== index) {
        index = afterLongBracket;
        continue;
      }
    }
    if (!isIdentStart(char) || isIdentPart(source[index - 1]) || source[index - 1] === ".") {
      index++;
      continue;
    }

    const identifier = readIdentifierPath(source, index);
    if (identifier == null) {
      index++;
      continue;
    }

    let cursor = identifier.end;
    while (/\s/.test(source[cursor] || "")) {
      cursor++;
    }
    if (source[cursor] === "(") {
      calls.push(identifier.value);
    }
    index = identifier.end;
  }

  return calls;
}

function maskLuaCommentsAndStrings(source) {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    let end = index;

    if (char === "-" && next === "-") {
      end = skipLuaComment(source, index);
    } else if (char === "\"" || char === "'") {
      end = skipLuaQuotedString(source, index, char);
    } else if (char === "[") {
      end = skipLuaLongBracket(source, index);
    }

    if (end !== index) {
      output += source.slice(index, end).replace(/[^\n]/g, " ");
      index = end;
      continue;
    }

    output += char;
    index++;
  }

  return output;
}

function findUnsupportedLvglSymbols(entryContent) {
  const codeContent = maskLuaCommentsAndStrings(entryContent);
  const unsupported = new Set();
  const localSymbols = new Set(
    [...codeContent.matchAll(/\blocal\s+(lv_[A-Za-z0-9_]+)\b/g)]
      .map((match) => match[1])
  );
  const optionalSymbols = new Set(
    [...codeContent.matchAll(/\bif\s+(?:not\s+)?(lv_[A-Za-z0-9_]+)\s+then\b/g)]
      .map((match) => match[1])
  );
  for (const symbol of readLuaFunctionCalls(entryContent)) {
    if (!symbol.startsWith("lv_")) {
      continue;
    }
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
  const codeContent = maskLuaCommentsAndStrings(entryContent);
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const guardPattern = new RegExp(`\\bif\\s+[^\\n]*\\b${escaped}\\b[^\\n]*\\bthen\\b`);
  return guardPattern.test(codeContent);
}

function findUnsupportedLuaApiSymbols(entryContent) {
  const unsupported = new Set();
  const modules = new Set(CHECKED_LUA_API_MODULES);

  for (const symbol of readLuaFunctionCalls(entryContent)) {
    const [moduleName] = symbol.split(".");
    if (!modules.has(moduleName) || !symbol.includes(".")) {
      continue;
    }
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
      const codeContent = maskLuaCommentsAndStrings(entryContent);

      for (const { capability, pattern } of CAPABILITY_USAGE_PATTERNS) {
        if (pattern.test(codeContent) && !declaredCapabilities.has(capability)) {
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
