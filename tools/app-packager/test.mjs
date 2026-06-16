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
  packageApp,
  packageDemoApps,
  slugifyAppId
} from "./index.mjs";

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
      assert.equal(manifest.schema, "vibeboard-runtime-app-package@1");
      assert.equal(manifest.appId, "weather");
      assert.equal(manifest.name, "weather");
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
});

describe("packageDemoApps", () => {
  it("packages the demo apps", () => {
    const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
    const result = packageDemoApps({ repoRoot });
    assert.deepEqual(result.map((item) => item.appId).sort(), [
      "demo_auto_snake",
      "demo_digital_clock",
      "demo_focus_timer",
      "demo_lucky_card",
      "demo_neon_dash",
      "demo_night_light",
      "demo_pixel_pet",
      "demo_space_dash",
      "demo_terminal_status",
      "holocubic_analog_clock",
      "holocubic_matrix_rain",
      "holocubic_nixie_clock",
      "nesgame",
      "smoke_canvas",
      "voice_ai",
      "weather"
    ]);
  });
});
