import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, normalize, relative } from "node:path";

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

  if (metadata.entry) {
    const normalizedEntry = normalize(metadata.entry);
    if (
      isAbsolute(normalizedEntry) ||
      normalizedEntry === ".." ||
      normalizedEntry.startsWith("../") ||
      normalizedEntry.includes("/../")
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
        if (
          resolvedRelativeEntry === ".." ||
          resolvedRelativeEntry.startsWith("../") ||
          isAbsolute(resolvedRelativeEntry)
        ) {
          errors.push("Entry path must stay inside the app directory");
        } else if (!statSync(entryPath).isFile()) {
          errors.push(`Entry path is not a file: ${metadata.entry}`);
        }
      }
    }
  }

  const capabilities = metadata.capabilities
    ? metadata.capabilities.split(",").map((item) => item.trim()).filter(Boolean)
    : [];

  if (metadata.kind === "service" && !capabilities.includes("service")) {
    warnings.push("Service apps should declare capabilities = service");
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
