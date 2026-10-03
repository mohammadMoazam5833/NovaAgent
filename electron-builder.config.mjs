/**
 * electron-builder configuration for the NovaAgent desktop app.
 *
 * `directories.app: 'electron'` tells electron-builder to use electron/package.json
 * as the app manifest (with `"main": "main.mjs"`). This sidesteps the root
 * package.json's `"main": "./dist/index.cjs"` without any afterPack patching.
 *
 * NODE_MODULES NOTE:
 *
 *   Even with zero `dependencies` in electron/package.json, electron-builder's
 *   "search for node modules" routine walks UP from directories.app looking
 *   for the first node_modules in scope. It runs `npm list --json` in the
 *   project root, gets the full hoisted tree (~342 dirs, ~600 MB: Vite,
 *   React, Monaco, HeroUI, etc.), and copies all of it into the packaged
 *   app at Resources/app/node_modules/.
 *
 *   Almost none of those packages are imported at desktop runtime — main.mjs
 *   and the launcher (dev-with-automation.mjs) use only Node built-ins. The
 *   exception is the two child-process servers: static-server.mjs imports
 *   `sirv` and ingress.mjs (via proxy-utils.mjs) imports `httpxy`. Node
 *   resolves those bare specifiers by walking UP from the script's own path,
 *   so an app tested from dist-electron/ inside a repo checkout accidentally
 *   resolves them against the repo's node_modules and works — while the same
 *   app in /Applications crashes both servers with ERR_MODULE_NOT_FOUND and
 *   the splash times out waiting for port 8000. We can't disable the search
 *   from the config (it's hardcoded in app-builder-lib), and creating an
 *   empty electron/node_modules/ doesn't help because `npm list` from the
 *   project root still reports the full hoisted tree.
 *
 *   The fix is the `afterPack` hook below: after electron-builder has
 *   finished copying files, we rm -rf the bundled Resources/app/node_modules/
 *   directory, then copy back the dependency closure of RUNTIME_PACKAGES
 *   (~200 KB). The build wastes a few seconds copying files we immediately
 *   delete, but the final artifact is correctly tiny (~10 MB vs ~600 MB).
 *
 * Packaged app layout (Resources/app/ = electron/ contents):
 *   main.mjs        ← Electron entry point
 *   loading.html    ← loading splash
 *   package.json    ← {"main":"main.mjs"} (from electron/package.json)
 *   scripts/        ← backend scripts
 *   node_modules/   ← runtime closure of RUNTIME_PACKAGES (restored by afterPack)
 *   config/         ← defaults.json
 *   build/          ← static frontend (npm run build:app output)
 *
 * The bundled uv binary (resources/bin/) lands in <Resources>/bin/ via
 * extraResources so Electron can inject it into PATH on startup.
 *
 * The bundled Node.js distribution (resources/node/) lands in
 * <Resources>/node/ via extraResources. Electron prepends its bin dir to
 * PATH at startup so backend scripts (`node scripts/ingress.mjs` etc.) and
 * stdio MCP servers spawned via `npx -y …` (Slack, GitHub, Figma, etc.)
 * can find a working node/npm/npx — the OS gives a Finder-launched .app
 * a minimal PATH (/usr/bin:/bin) that has none of those.
 */

import { cp, rm, rename, writeFile, chmod, mkdir } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

// npm packages the packaged app's child-process scripts import at runtime:
//   scripts/static-server.mjs  → sirv
//   scripts/proxy-utils.mjs    → httpxy   (imported by ingress.mjs)
// Their dependency closure is copied back into Resources/app/node_modules
// after the strip below. If a spawned script gains a new bare import, add
// the package here — a missing one crashes that service in the installed
// app with ERR_MODULE_NOT_FOUND (invisible under Finder, where stdout goes
// to /dev/null) and the splash times out waiting for port 8000.
const RUNTIME_PACKAGES = ["sirv", "httpxy"];

const repoRoot = dirname(fileURLToPath(import.meta.url));

// Root package.json is the single source of truth for the app version
// (release-please bumps it). electron/package.json is a minimal manifest
// stub pinned at 1.0.0 — `extraMetadata` below overrides its version at
// pack time so artifact names and app.getVersion() carry the released
// version instead.
const rootPackageJson = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
);

/**
 * Strip the auto-bundled node_modules from the packaged app, then restore
 * the small runtime closure of RUNTIME_PACKAGES.
 *
 * See the NODE_MODULES NOTE in the file header for the why. This is invoked
 * by electron-builder once per platform target after the unpacked directory
 * has been populated but before installer-format packaging (DMG, NSIS, deb).
 *
 * On macOS the app dir is inside a `.app` bundle; on Linux/Windows it's a
 * flat resources/ subdirectory. We resolve both shapes from
 * `context.appOutDir` + the productFilename.
 */
async function stripBundledNodeModules(context) {
  const platform = context.electronPlatformName;
  const productFilename = context.packager.appInfo.productFilename;
  const appDir =
    platform === "darwin" || platform === "mas"
      ? join(
          context.appOutDir,
          `${productFilename}.app`,
          "Contents",
          "Resources",
          "app",
        )
      : join(context.appOutDir, "resources", "app");

  const nm = join(appDir, "node_modules");
  if (existsSync(nm)) {
    // Best-effort size report so the log line shows what we saved. Skip if
    // walking the tree fails for any reason — the rm below is what matters.
    let sizeMb = null;
    try {
      sizeMb = Math.round(getDirSizeBytes(nm) / (1024 * 1024));
    } catch {}

    await rm(nm, { recursive: true, force: true });

    const rel = relative(process.cwd(), nm);
    const human = sizeMb != null ? ` (~${sizeMb} MB)` : "";
    // eslint-disable-next-line no-console -- electron-builder build log
    console.log(
      `[electron-builder] stripped bundled node_modules${human}: ${rel}`,
    );
  }

  await restoreRuntimeNodeModules(appDir);
}

/**
 * Linux AppImage / VM Chromium sandbox fix.
 *
 * Ubuntu 24.04 + AppImage cannot set SUID on the embedded `chrome-sandbox`,
 * so Chromium aborts with "SUID sandbox helper binary was found, but is not
 * configured correctly" *before* Electron main-process JS can call
 * `app.commandLine.appendSwitch("no-sandbox")`.
 *
 * Fix: delete `chrome-sandbox` and wrap the Electron binary so argv always
 * includes `--no-sandbox` / `--disable-setuid-sandbox` / `--disable-gpu`.
 */
async function disableLinuxChromiumSandbox(context) {
  if (context.electronPlatformName !== "linux") return;

  const out = context.appOutDir;
  const sandboxPath = join(out, "chrome-sandbox");
  if (existsSync(sandboxPath)) {
    await rm(sandboxPath, { force: true });
    // eslint-disable-next-line no-console -- electron-builder build log
    console.log(
      "[electron-builder] removed chrome-sandbox (AppImage/VM sandbox workaround)",
    );
  }

  const productFilename = context.packager.appInfo.productFilename;
  const candidates = [
    join(out, productFilename),
    join(out, String(productFilename).toLowerCase()),
    join(out, "novaagent"),
  ];
  const binaryPath = candidates.find(
    (p) => existsSync(p) && !p.endsWith(".bin"),
  );
  if (!binaryPath) {
    // eslint-disable-next-line no-console -- electron-builder build log
    console.warn(
      "[electron-builder] linux Electron binary not found; skip --no-sandbox wrapper",
    );
    return;
  }

  const wrappedPath = `${binaryPath}.bin`;
  if (existsSync(wrappedPath)) {
    // Idempotent if afterPack re-runs.
    return;
  }

  await rename(binaryPath, wrappedPath);
  const wrapper = `#!/bin/bash
# NovaAgent Linux launcher — Chromium sandbox cannot use SUID inside AppImage.
DIR="$(cd "$(dirname "$0")" && pwd)"
export ELECTRON_DISABLE_SANDBOX=1
export ELECTRON_NO_SANDBOX=1
exec "$DIR/$(basename "$0").bin" \\
  --no-sandbox \\
  --disable-setuid-sandbox \\
  --disable-gpu \\
  --disable-software-rasterizer \\
  "$@"
`;
  await writeFile(binaryPath, wrapper, { encoding: "utf8", mode: 0o755 });
  await chmod(binaryPath, 0o755);
  // eslint-disable-next-line no-console -- electron-builder build log
  console.log(
    `[electron-builder] wrapped ${relative(process.cwd(), binaryPath)} with --no-sandbox`,
  );
}

async function afterPackHook(context) {
  await stripBundledNodeModules(context);
  await disableLinuxChromiumSandbox(context);
}

/**
 * Ensure the .deb ships every hicolor size + a pixmaps fallback.
 * GNOME Applications menus often ignore a lone 1024×1024 icon and show a
 * generic gear instead — 16..512 must be present as novaagent.png.
 */
async function injectDebMenuIcons(buildResult) {
  const iconsDir = join(repoRoot, "electron/build-resources/icons");
  if (!existsSync(iconsDir)) {
    // eslint-disable-next-line no-console -- electron-builder build log
    console.warn("[electron-builder] icons dir missing; skip deb icon inject");
    return [];
  }

  const sizeFiles = readdirSync(iconsDir).filter((f) =>
    /^\d+x\d+\.png$/.test(f),
  );

  for (const artifactPath of buildResult.artifactPaths ?? []) {
    if (!artifactPath.endsWith(".deb")) continue;

    const work = mkdtempSync(join(tmpdir(), "novaagent-deb-icons-"));
    try {
      const extract = spawnSync("dpkg-deb", ["-R", artifactPath, work], {
        encoding: "utf8",
      });
      if (extract.status !== 0) {
        throw new Error(
          `dpkg-deb -R failed: ${extract.stderr || extract.stdout}`,
        );
      }

      for (const file of sizeFiles) {
        const sizeName = file.replace(/\.png$/, "");
        const destDir = join(
          work,
          "usr/share/icons/hicolor",
          sizeName,
          "apps",
        );
        await mkdir(destDir, { recursive: true });
        await cp(join(iconsDir, file), join(destDir, "novaagent.png"));
      }

      // Older menus / some DEs still look under pixmaps.
      const pixmapDir = join(work, "usr/share/pixmaps");
      await mkdir(pixmapDir, { recursive: true });
      const pixmapSrc = existsSync(join(iconsDir, "48x48.png"))
        ? join(iconsDir, "48x48.png")
        : join(iconsDir, "128x128.png");
      await cp(pixmapSrc, join(pixmapDir, "novaagent.png"));

      const rebuilt = `${artifactPath}.icons-fixed`;
      const build = spawnSync("dpkg-deb", ["-b", work, rebuilt], {
        encoding: "utf8",
      });
      if (build.status !== 0) {
        throw new Error(
          `dpkg-deb -b failed: ${build.stderr || build.stdout}`,
        );
      }
      await rm(artifactPath, { force: true });
      await rename(rebuilt, artifactPath);
      // eslint-disable-next-line no-console -- electron-builder build log
      console.log(
        `[electron-builder] injected ${sizeFiles.length} hicolor icons + pixmaps into ${relative(process.cwd(), artifactPath)}`,
      );
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  // Icons were patched in-place; do not re-list artifacts.
  return [];
}

/**
 * Copy the dependency closure of RUNTIME_PACKAGES from the repo's
 * node_modules into the packaged app's Resources/app/node_modules so the
 * spawned `node scripts/…` servers can resolve their bare imports outside
 * a repo checkout (see RUNTIME_PACKAGES above).
 *
 * Resolution is deliberately simple: every package (and every transitive
 * `dependencies` entry) is looked up at the repo root's flat npm tree, and
 * a miss throws so the build fails loudly instead of shipping a DMG whose
 * ingress/static-server crash on launch.
 */
async function restoreRuntimeNodeModules(appDir) {
  const rootNodeModules = join(repoRoot, "node_modules");

  // name → source dir, walking `dependencies` breadth-first.
  const packages = new Map();
  const queue = [...RUNTIME_PACKAGES];
  while (queue.length) {
    const name = queue.shift();
    if (packages.has(name)) continue;
    const srcDir = join(rootNodeModules, ...name.split("/"));
    const manifestPath = join(srcDir, "package.json");
    if (!existsSync(manifestPath)) {
      throw new Error(
        `[electron-builder] runtime package "${name}" not found in ` +
          `${rootNodeModules} — run npm install and rebuild`,
      );
    }
    packages.set(name, srcDir);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    queue.push(...Object.keys(manifest.dependencies ?? {}));
  }

  let totalBytes = 0;
  for (const [name, srcDir] of packages) {
    const destDir = join(appDir, "node_modules", ...name.split("/"));
    await cp(srcDir, destDir, { recursive: true });
    totalBytes += getDirSizeBytes(destDir);
  }

  // eslint-disable-next-line no-console -- electron-builder build log
  console.log(
    `[electron-builder] restored runtime node_modules ` +
      `(${[...packages.keys()].join(", ")}; ~${Math.round(totalBytes / 1024)} KB)`,
  );
}

function getDirSizeBytes(dir) {
  // Synchronous walk so we can run it before the rm without async juggling
  // in the hook. The directory we're sizing is always small enough (<1 GB)
  // that this is negligible compared to the rm itself.
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const next = stack.pop();
    let entries;
    try {
      entries = readdirSync(next, { withFileTypes: true });
    } catch {
      // Best-effort: skip unreadable dirs (symlink races, permission
      // errors on platform-specific node_modules subtrees, etc.). The
      // size number is only used in a build-log line, so under-counting
      // is preferable to aborting the strip.
      continue;
    }
    for (const entry of entries) {
      const p = join(next, entry.name);
      if (entry.isDirectory()) {
        stack.push(p);
      } else {
        try {
          total += statSync(p).size;
        } catch {}
      }
    }
  }
  return total;
}

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: "dev.novaagent.app",
  productName: "NovaAgent",
  copyright: "Copyright © 2026 NovaAgent",

  // Stamp the packaged app with the released version (see rootPackageJson
  // note above).
  extraMetadata: { version: rootPackageJson.version },

  // Treat electron/ as the app root. electron/package.json provides the
  // Electron entry point without touching the npm-published root package.json.
  // `buildResources` points at electron/build-resources so electron-builder
  // can auto-discover icon.png (1024×1024 NovaAgent app icon)
  // and generate the platform-specific icon.icns / icon.ico from it.
  directories: {
    app: "electron",
    output: "dist-electron",
    buildResources: "electron/build-resources",
  },

  // Do not pack into asar — scripts are spawned as child processes by
  // dev-with-automation.mjs and must exist as real files on disk.
  asar: false,

  // Skip native-module rebuild — the app has no native deps.
  npmRebuild: false,

  // Strip auto-bundled node_modules + Linux AppImage sandbox workaround.
  afterPack: afterPackHook,

  // Inject multi-size hicolor + pixmaps icons into the finished .deb so the
  // Applications menu shows the NovaAgent logo (not a generic gear).
  afterAllArtifactBuild: injectDebMenuIcons,

  // Files included in the packaged app.
  // Paths with `from` are relative to directories.app (electron/).
  // Bare globs are also relative to directories.app.
  files: [
    // electron/ base files (main.mjs, loading.html, package.json)
    "**/*",
    // Bundle the raw 1024×1024 PNG into Resources/app/build-resources/ so
    // main.mjs can set it as the BrowserWindow icon at runtime (used for the
    // Linux taskbar; macOS reads from the .icns inside the .app bundle).
    "build-resources/icon.png",
    // Scripts from project root. Mostly Node built-ins; the two spawned
    // servers additionally need RUNTIME_PACKAGES, restored into
    // Resources/app/node_modules by the afterPack hook.
    { from: "../scripts", to: "scripts", filter: ["**/*.mjs", "**/*.cjs"] },
    // Centralised version / port / path config
    { from: "../config", to: "config" },
    // Pre-built static frontend (npm run build:app output)
    { from: "../build", to: "build" },
    // Custom Python tools (canvas_ui_tool.py). dev-safe.mjs sets
    // OH_EXTRA_PYTHON_PATH to this directory so the agent-server can import
    // canvas_ui_tool at runtime. The path is computed as ../tools relative to
    // scripts/dev-safe.mjs, which resolves correctly in both dev and packaged mode.
    { from: "../tools", to: "tools" },
  ],

  // Bundled prerequisites — placed in <Resources>/ so Electron can put
  // them on PATH before starting the backend stack.
  //   bin/              — uv + uvx (downloaded by `npm run download-uv`)
  //   node/             — official Node.js distribution (`download-node`)
  //   python/           — uv-managed CPython for the target OS
  //   python-env/       — prefilled site-packages (agent-server + automation)
  //   python-runtime.json — manifest with relative interpreter path
  // `from` is relative to the project root (not directories.app).
  // build:desktop / build:desktop:win call the download scripts first.
  extraResources: [
    { from: "resources/bin/", to: "bin/", filter: ["**/*"] },
    { from: "resources/node/", to: "node/", filter: ["**/*"] },
    { from: "resources/python/", to: "python/", filter: ["**/*"] },
    { from: "resources/python-env/", to: "python-env/", filter: ["**/*"] },
    { from: "resources/python-runtime.json", to: "python-runtime.json" },
  ],

  // ── macOS ──────────────────────────────────────────────────────────────────
  //
  // Default to the native CPU arch so day-to-day `npm run build:desktop`
  // is fast (one Electron binary, one packaging pass).
  //
  // For a distributable universal build set ELECTRON_ARCH=universal:
  //   ELECTRON_ARCH=universal npm run build:desktop
  //
  // Or use the dedicated script:
  //   npm run build:desktop:universal
  //
  // CAUTION: the bundled uv/node extraResources must match the *target*
  // OS, not just the build host. Cross-packing (e.g. Linux → Windows zip)
  // requires:
  //   ELECTRON_DOWNLOAD_PLATFORM=win32 ELECTRON_DOWNLOAD_ARCH=x64 \
  //     node scripts/download-uv.mjs && node scripts/download-node.mjs
  // before electron-builder --win. Otherwise the package ships ELF
  // `uv`/`bin/node` and Windows looks for `uv.exe`/`node.exe` and fails.
  // A "universal" macOS build still ships single-arch runtimes until the
  // download scripts support multi-arch fat binaries.
  //
  mac: {
    category: "public.app-category.developer-tools",
    target: [
      {
        target: "dmg",
        arch: [
          process.env.ELECTRON_ARCH ??
            (process.arch === "arm64" ? "arm64" : "x64"),
        ],
      },
    ],
    // Icon auto-discovered from directories.buildResources/icon.png
    // (electron-builder generates icon.icns from the 1024×1024 PNG).
  },

  dmg: {
    title: "NovaAgent",
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: "link", path: "/Applications" },
    ],
    window: { width: 540, height: 380 },
    // Default is "NovaAgent-<version>-<arch>.dmg"; GitHub release assets
    // mangle spaces, so keep the asset name literal (matches the nsis
    // convention). ${version}/${arch}/${ext} are electron-builder macros.
    artifactName: "NovaAgent-${version}-${arch}.${ext}",
  },

  // ── Windows ────────────────────────────────────────────────────────────────
  win: {
    target: [
      // Full installer when Wine is available on the build host.
      { target: "nsis", arch: ["x64"] },
      // Portable folder always buildable from Linux without Wine.
      { target: "portable", arch: ["x64"] },
    ],
    icon: "icon.ico",
    // Icon auto-discovered from directories.buildResources/icon.ico / icon.png
    // (electron-builder generates icon.ico from the 1024×1024 PNG if needed).
  },

  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "NovaAgent",
    installerIcon: "icon.ico",
    uninstallerIcon: "icon.ico",
    installerHeaderIcon: "icon.ico",
    // The default artifact name is "NovaAgent Setup <version>.exe";
    // GitHub release assets mangle spaces, so ship a space-free name.
    // ${version}/${ext} are electron-builder macros, not JS interpolation.
    artifactName: "NovaAgent-Setup-${version}.${ext}",
  },

  portable: {
    artifactName: "NovaAgent-Portable-${version}.${ext}",
  },

  // ── Linux ──────────────────────────────────────────────────────────────────
  linux: {
    maintainer: "NovaAgent <novaagent@openhands.dev>",
    target: [
      // Prefer .deb for one-click install (App Center / Software).
      // AppImage remains available for portable runs.
      { target: "deb", arch: ["x64"] },
      { target: "AppImage", arch: ["x64"] },
    ],
    category: "Development",
    synopsis: "NovaAgent local coding agent",
    description:
      "NovaAgent desktop app — local AI coding agent with chat, files, terminal, and browser tools.",
    desktop: {
      entry: {
        Name: "NovaAgent",
        Comment: "Local coding agent control center",
        Categories: "Development;IDE;",
        StartupWMClass: "NovaAgent",
        Terminal: "false",
        Icon: "novaagent",
      },
    },
    // Multi-size PNGs in build-resources/icons (16..1024) so GNOME/KDE
    // Applications menus show the NovaAgent logo, not a generic placeholder.
    // Path is relative to directories.buildResources.
    icon: "icons",
    executableArgs: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
    ],
    artifactName: "NovaAgent-${version}-${arch}.${ext}",
  },

  deb: {
    depends: [
      "libgtk-3-0",
      "libnotify4",
      "libnss3",
      "libxss1",
      "libxtst6",
      "xdg-utils",
      "libatspi2.0-0",
      "libuuid1",
    ],
    // Custom script skips chmod of chrome-sandbox (removed in afterPack).
    afterInstall: "electron/build-resources/after-install.tpl",
  },

  appImage: {
    // Portable fallback; sandbox flags come from executableArgs + binary wrapper.
    executableArgs: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
    ],
  },
};

export { afterPackHook, injectDebMenuIcons };

export default config;
