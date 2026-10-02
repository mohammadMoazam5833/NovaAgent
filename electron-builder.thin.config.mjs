/**
 * Thin "NovaAgent Client" pack — Electron shell only.
 * Connects to a remote NovaAgent / agent-canvas server; does not ship
 * Python, uv, node runtime, or the static SPA (those live on the server).
 *
 * Build:
 *   NOVAAGENT_REMOTE_URL=https://your-server npm run build:desktop:thin
 *   NOVAAGENT_REMOTE_URL=https://your-server npm run build:desktop:thin:win
 *
 * See docs/REMOTE_THIN_CLIENT.md
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  afterPackHook,
  injectDebMenuIcons,
} from "./electron-builder.config.mjs";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const rootPackageJson = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
);

const config = {
  appId: "dev.openhands.novaagent.client",
  productName: "NovaAgent Client",
  copyright: `Copyright © ${new Date().getFullYear()} NovaAgent`,
  extraMetadata: {
    name: "novaagent-client",
    version: rootPackageJson.version,
    description:
      "NovaAgent Client — connects to a remote NovaAgent server (no local agent-server).",
  },

  directories: {
    app: "electron",
    output: "dist-electron",
    buildResources: "electron/build-resources",
  },

  asar: false,
  npmRebuild: false,
  // Shared hook strips hoisted node_modules and applies Linux sandbox fixes.
  // Thin Client does not need sirv/httpxy; the small restore is harmless.
  afterPack: afterPackHook,
  afterAllArtifactBuild: injectDebMenuIcons,

  files: [
    "main.mjs",
    "loading.html",
    "remote-url-prompt.html",
    "login-prompt.html",
    "remote-client.json",
    // Optional Hybrid bake; main.mjs resolves company LLM at startup.
    "company-llm.json",
    "package.json",
    "build-resources/icon.png",
    {
      from: "../scripts",
      to: "scripts",
      filter: [
        // main.mjs top-level-imports both URL resolvers (thin + company LLM).
        "desktop-remote-url.mjs",
        "desktop-company-llm-url.mjs",
        "local-tools-sidecar.mjs",
        "local-tools-sidecar/**/*.mjs",
        "customer-workspace-client.mjs",
        "customer-workspace/client.mjs",
        "customer-workspace/urls.mjs",
      ],
    },
  ],

  // No uv / node / python — remote server hosts the stack.
  extraResources: [],

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
  },

  dmg: {
    title: "NovaAgent Client",
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: "link", path: "/Applications" },
    ],
    window: { width: 540, height: 380 },
    artifactName: "NovaAgent-Client-${version}-${arch}.${ext}",
  },

  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "zip", arch: ["x64"] },
    ],
    icon: "icon.ico",
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "NovaAgent Client",
    installerIcon: "icon.ico",
    uninstallerIcon: "icon.ico",
    installerHeaderIcon: "icon.ico",
    artifactName: "NovaAgent-Client-Setup-${version}.${ext}",
  },

  portable: {
    artifactName: "NovaAgent-Client-Portable-${version}.${ext}",
  },

  linux: {
    maintainer: "NovaAgent <novaagent@openhands.dev>",
    target: [
      { target: "deb", arch: ["x64"] },
      { target: "AppImage", arch: ["x64"] },
    ],
    category: "Development",
    synopsis: "NovaAgent remote client",
    description:
      "NovaAgent Client connects to a remote NovaAgent server. Agent tools and workspaces run on the server, not on this machine.",
    desktop: {
      entry: {
        Name: "NovaAgent Client",
        Comment: "Connect to a remote NovaAgent server",
        Categories: "Development;IDE;",
        StartupWMClass: "NovaAgent Client",
        Terminal: "false",
        Icon: "novaagent",
      },
    },
    icon: "icons",
    executableArgs: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
    ],
    artifactName: "NovaAgent-Client-${version}-${arch}.${ext}",
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
    afterInstall: "electron/build-resources/after-install.tpl",
  },

  appImage: {
    executableArgs: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
    ],
  },
};

export default config;
