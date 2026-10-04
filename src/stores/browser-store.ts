import { create } from "zustand";

type BrowserMode = "agent" | "local";

interface BrowserState {
  // URL of the last page the agent navigated to in the browser panel.
  url: string;
  // Base64-encoded screenshot of the browser window, when the tool provides one.
  screenshotSrc: string;
  // "agent" shows server-side screenshots; "local" renders a live webview
  // on the customer's own machine (like the workspace tools).
  mode: BrowserMode;
  localUrl: string;
}

interface BrowserStore extends BrowserState {
  setUrl: (url: string) => void;
  setScreenshotSrc: (screenshotSrc: string) => void;
  setMode: (mode: BrowserMode) => void;
  navigateLocal: (raw: string) => void;
  reset: () => void;
}

const initialState: BrowserState = {
  url: "",
  screenshotSrc: "",
  mode: "agent",
  localUrl: "",
};

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export const useBrowserStore = create<BrowserStore>((set) => ({
  ...initialState,
  setUrl: (url) => set({ url }),
  setScreenshotSrc: (screenshotSrc) => set({ screenshotSrc }),
  setMode: (mode) => set({ mode }),
  navigateLocal: (raw) => set({ mode: "local", localUrl: normalizeUrl(raw) }),
  reset: () => set(initialState),
}));
