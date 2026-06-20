import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_APP_DIRS,
  packageApp,
  packageDemoApps,
  slugifyAppId
} from "./index.mjs";

const EXPECTED_DEMO_APP_DIRS = [
  "apps/weather",
  "apps/voice_ai",
  "apps/nesgame",
  "apps/matrix_rain",
  "apps/nixie_clock",
  "apps/clock",
  "apps/conway_life",
  "apps/fluid_pendant",
  "apps/smoke_app_manager",
  "apps/smoke_gamepad",
  "apps/smoke_i2s",
  "apps/smoke_key",
  "apps/smoke_nes",
  "apps/2048"
];

function makeTempRepo() {
  return mkdtempSync(join(tmpdir(), "vibeboard-packager-"));
}

function writeApp(root, appPath, appInfo, mainLua = "print('ok')\n") {
  const fullPath = join(root, appPath);
  mkdirSync(fullPath, { recursive: true });
  writeFileSync(join(fullPath, "app.info"), appInfo);
  writeFileSync(join(fullPath, "main.lua"), mainLua);
  return fullPath;
}

describe("slugifyAppId", () => {
  it("normalizes app ids", () => {
    assert.equal(slugifyAppId("Weather Card"), "weather-card");
    assert.equal(slugifyAppId("voice_ai"), "voice_ai");
    assert.throws(() => slugifyAppId("!!!"), /empty app id/i);
  });
});

describe("packageApp", () => {
  it("creates a package manifest and install notes", () => {
    const root = makeTempRepo();
    try {
      writeApp(
        root,
        "apps/weather",
        "name = weather\nentry = main.lua\ndescription = Weather card\ncapabilities = network\n",
        "http.get('https://example.com', {}, function() end)\n"
      );

      const result = packageApp({
        repoRoot: root,
        appDir: join(root, "apps/weather")
      });

      assert.equal(result.appId, "weather");
      const manifest = JSON.parse(readFileSync(join(result.outputPath, "manifest.json"), "utf8"));
      assert.equal(manifest.schema, "vibeboard-runtime-app-package@2");
      assert.equal(manifest.appId, "weather");
      assert.equal(manifest.name, "weather");
      assert.deepEqual(manifest.app, {
        id: "weather",
        name: "weather",
        version: "0.0.0",
        kind: "app"
      });
      assert.deepEqual(manifest.requires, {
        runtime: ">=0.1.0",
        luaApi: ">=0.1.0",
        lvglApi: ">=0.1.0",
        packageSchema: "vibeboard-runtime-app-package@2",
        nativeAbi: null,
        capabilities: ["network"]
      });
      assert.deepEqual(manifest.provides, {
        services: []
      });
      assert.deepEqual(manifest.capabilities, ["network"]);
      assert.equal(manifest.install.sdPath, "/sd/apps/weather");
      assert.ok(manifest.files.some((file) => file.path === "app.info" && file.sha256));
      assert.ok(manifest.files.some((file) => file.path === "install-notes.txt"));

      const notes = readFileSync(join(result.outputPath, "install-notes.txt"), "utf8");
      assert.match(notes, /Copy all files/);
      assert.match(notes, /does not flash firmware/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not write output when validation fails", () => {
    const root = makeTempRepo();
    try {
      writeApp(root, "apps/broken", "name = broken\nentry = missing.lua\ndescription = Broken\n");
      assert.throws(
        () => packageApp({ repoRoot: root, appDir: join(root, "apps/broken") }),
        /Entry file does not exist/
      );
      assert.throws(() => readFileSync(join(root, "dist/apps/broken/manifest.json")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects app directories outside the repo root", () => {
    const root = makeTempRepo();
    const outside = makeTempRepo();
    try {
      writeApp(outside, "app", "name = outside\nentry = main.lua\ndescription = Outside\n");
      assert.throws(
        () => packageApp({ repoRoot: root, appDir: join(outside, "app") }),
        /inside the repository/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("skips symlinked files inside the app package", () => {
    const root = makeTempRepo();
    try {
      const appPath = writeApp(root, "apps/links", "name = links\nentry = main.lua\ndescription = Links\n");
      writeFileSync(join(root, "secret.txt"), "secret");
      try {
        symlinkSync(join(root, "secret.txt"), join(appPath, "secret-link.txt"));
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return;
        throw error;
      }

      const result = packageApp({ repoRoot: root, appDir: appPath });
      const manifest = JSON.parse(readFileSync(join(result.outputPath, "manifest.json"), "utf8"));
      assert.equal(manifest.files.some((file) => file.path === "secret-link.txt"), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses app.info compatibility metadata when present", () => {
    const root = makeTempRepo();
    try {
      const appPath = writeApp(
        root,
        "apps/devtools",
        [
          "name = devtools",
          "entry = main.lua",
          "description = Device tools",
          "version = 1.2.3",
          "kind = service",
          "capabilities = file,service",
          "requires.runtime = >=0.2.0",
          "requires.luaApi = >=0.3.0",
          "requires.lvglApi = >=0.4.0",
          "requires.nativeAbi = >=2.0.2",
          "provides.services = devtools,httpd",
          ""
        ].join("\n"),
        "file.listdir('.')\n"
      );

      const result = packageApp({ repoRoot: root, appDir: appPath });
      const manifest = JSON.parse(readFileSync(join(result.outputPath, "manifest.json"), "utf8"));

      assert.deepEqual(manifest.app, {
        id: "devtools",
        name: "devtools",
        version: "1.2.3",
        kind: "service"
      });
      assert.deepEqual(manifest.requires, {
        runtime: ">=0.2.0",
        luaApi: ">=0.3.0",
        lvglApi: ">=0.4.0",
        packageSchema: "vibeboard-runtime-app-package@2",
        nativeAbi: ">=2.0.2",
        capabilities: ["file", "service"]
      });
      assert.deepEqual(manifest.provides, {
        services: ["devtools", "httpd"]
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("packageDemoApps", () => {
  it("keeps the curated package list aligned with migrated apps", () => {
    assert.deepEqual(DEMO_APP_DIRS, EXPECTED_DEMO_APP_DIRS);
  });

  it("packages the curated demo and migrated apps", () => {
    const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
    const result = packageDemoApps({ repoRoot });
    assert.deepEqual(result.map((item) => item.appId).sort(), ["2048", "clock", "conway_life", "fluid_pendant", "matrix_rain", "nesgame", "nixie_clock", "smoke_app_manager", "smoke_gamepad", "smoke_i2s", "smoke_key", "smoke_nes", "voice_ai", "weather"]);
  });
});
