import { createElement } from "react";
import { BrowserSnapshot } from "./browser-snapshot";
import { BrowserChromeBar } from "./browser-chrome-bar";
import { EmptyBrowserMessage } from "./empty-browser-message";
import { useBrowserStore } from "#/stores/browser-store";

function LocalPreview({ url }: { url: string }) {
  // Electron <webview>: renders the page on the customer's own machine,
  // so localhost/dev-server URLs work exactly like the local workspace.
  return createElement("webview", {
    src: url,
    className: "h-full w-full bg-white",
    allowpopups: true,
    partition: "persist:novapreview",
  });
}

export function BrowserPanel() {
  const { url, screenshotSrc, mode, localUrl } = useBrowserStore();
  const isLocal = mode === "local" && Boolean(localUrl);
  const hasPage = isLocal || Boolean(screenshotSrc);

  const imgSrc = screenshotSrc?.startsWith("data:image/png;base64,")
    ? screenshotSrc
    : `data:image/png;base64,${screenshotSrc ?? ""}`;

  return (
    <div className="flex h-full min-h-0 w-full flex-col text-[var(--oh-muted)]">
      <BrowserChromeBar url={url} hasPage={hasPage} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hide bg-[var(--oh-surface)]">
        {isLocal ? (
          <LocalPreview url={localUrl} />
        ) : screenshotSrc ? (
          <BrowserSnapshot src={imgSrc} />
        ) : (
          <EmptyBrowserMessage />
        )}
      </div>
    </div>
  );
}
