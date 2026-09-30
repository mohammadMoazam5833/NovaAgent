  mainWin = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    // App-shell background (--oh-background in src/index.css) — avoids white
    // flashes during the show → maximize repaint after the splash closes.
    backgroundColor: "#0b0e14",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Live local preview in the browser tab (<webview> renders on the
      // customer's machine, like the local workspace tools).
      webviewTag: true,
    },
  });