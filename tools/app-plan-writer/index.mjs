import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep
} from "node:path";
import { packageApp, slugifyAppId } from "../app-packager/index.mjs";
import { validateAppDirectory } from "../app-validator/index.mjs";

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function normalizeCapabilities(capabilities) {
  if (capabilities === undefined) return [];
  if (!Array.isArray(capabilities)) {
    throw new Error("app.capabilities must be an array when provided");
  }
  return capabilities.map((capability, index) =>
    requireString(capability, `app.capabilities[${index}]`).trim()
  );
}

function buildAppInfo(app, capabilities) {
  const lines = [
    `name = ${app.name.trim()}`,
    `entry = ${app.entry.trim()}`,
    `description = ${app.description.trim()}`
  ];
  if (capabilities.length > 0) {
    lines.push(`capabilities = ${capabilities.join(",")}`);
  }
  return `${lines.join("\n")}\n`;
}

function assertSafeRelativePath(filePath, label) {
  const normalized = normalize(requireString(filePath, label));
  if (
    isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith(`..${sep}`) ||
    normalized.includes(`${sep}..${sep}`)
  ) {
    throw new Error(`${label} must stay inside the app directory`);
  }
  return normalized;
}

function assertInsideDirectory(rootDir, targetPath, label) {
  const rel = relative(rootDir, targetPath);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} must stay inside the app directory`);
  }
}

function parsePlan(plan) {
  assertObject(plan, "plan");
  assertObject(plan.app, "plan.app");

  const app = {
    name: requireString(plan.app.name, "app.name"),
    entry: assertSafeRelativePath(plan.app.entry, "app.entry"),
    description: requireString(plan.app.description, "app.description")
  };
  const capabilities = normalizeCapabilities(plan.app.capabilities);

  if (!Array.isArray(plan.files)) {
    throw new Error("plan.files must be an array");
  }

  const files = plan.files.map((file, index) => {
    assertObject(file, `files[${index}]`);
    return {
      path: assertSafeRelativePath(file.path, `files[${index}].path`),
      type: typeof file.type === "string" ? file.type : "text",
      content: requireString(file.content, `files[${index}].content`)
    };
  });

  return { app, capabilities, files };
}

function writePlanFiles(appDir, parsedPlan) {
  for (const file of parsedPlan.files) {
    if (file.path === "app.info") continue;

    const targetPath = resolve(appDir, file.path);
    assertInsideDirectory(appDir, targetPath, `files path ${file.path}`);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, file.content);
  }

  writeFileSync(join(appDir, "app.info"), buildAppInfo(parsedPlan.app, parsedPlan.capabilities));
}

export function writeAppPlanObject({
  repoRoot = process.cwd(),
  plan,
  outputRoot = "generated/apps",
  packageOutput = false
}) {
  const absoluteRepoRoot = resolve(repoRoot);
  const parsedPlan = parsePlan(plan);
  const appId = slugifyAppId(parsedPlan.app.name);
  const absoluteOutputRoot = resolve(absoluteRepoRoot, outputRoot);
  const appDir = resolve(absoluteOutputRoot, appId);

  assertInsideDirectory(absoluteRepoRoot, absoluteOutputRoot, "outputRoot");
  assertInsideDirectory(absoluteRepoRoot, appDir, "appDir");

  rmSync(appDir, { recursive: true, force: true });
  mkdirSync(appDir, { recursive: true });

  try {
    writePlanFiles(appDir, parsedPlan);
    const validation = validateAppDirectory(appDir);
    if (!validation.ok) {
      throw new Error(`Generated app validation failed: ${validation.errors.join("; ")}`);
    }

    const packageResult = packageOutput
      ? packageApp({ repoRoot: absoluteRepoRoot, appDir })
      : null;

    return {
      appId,
      appDir,
      validation,
      packageResult
    };
  } catch (error) {
    rmSync(appDir, { recursive: true, force: true });
    throw error;
  }
}

export function writeAppPlan({
  repoRoot = process.cwd(),
  planPath,
  outputRoot = "generated/apps",
  packageOutput = false
}) {
  if (!planPath) throw new Error("planPath is required");
  if (!existsSync(planPath)) throw new Error(`Plan file does not exist: ${planPath}`);

  const text = readFileSync(planPath, "utf8");
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON plan ${basename(planPath)}: ${error.message}`);
  }

  return writeAppPlanObject({
    repoRoot,
    plan,
    outputRoot,
    packageOutput
  });
}
