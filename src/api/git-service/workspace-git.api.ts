/**
 * Dorj Agent: per-file accept/revert and checkpoints on the user's workspace
 * (nova-platform agent-server routes under /api/git, run on the customer's PC
 * through the sidecar bridge). Cursor phase 1, items 2 and 3.
 */
import { getAgentServerClientOptions } from "../agent-server-client-options";

export interface Checkpoint {
  id: string;
  label: string;
  at: number | null;
}

async function call<T>(
  conversationUrl: string | null | undefined,
  sessionApiKey: string | null | undefined,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { host, apiKey } = getAgentServerClientOptions({
    conversationUrl,
    sessionApiKey,
  });
  const res = await fetch(`${host}/api/git${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-Session-API-Key": apiKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // keep statusText
    }
    throw new Error(String(detail));
  }
  return (await res.json()) as T;
}

type Conn = {
  conversationUrl: string | null | undefined;
  sessionApiKey: string | null | undefined;
};

export const WorkspaceGit = {
  accept: (c: Conn, path: string) =>
    call(c.conversationUrl, c.sessionApiKey, "POST", "/accept", { path }),
  revert: (c: Conn, path: string) =>
    call(c.conversationUrl, c.sessionApiKey, "POST", "/revert", { path }),
  listCheckpoints: (c: Conn, path: string) =>
    call<Checkpoint[]>(
      c.conversationUrl,
      c.sessionApiKey,
      "GET",
      `/checkpoints?path=${encodeURIComponent(path)}`,
    ),
  createCheckpoint: (c: Conn, path: string, label: string) =>
    call<Checkpoint>(
      c.conversationUrl,
      c.sessionApiKey,
      "POST",
      "/checkpoints",
      {
        path,
        label,
      },
    ),
  restoreCheckpoint: (c: Conn, path: string, id: string) =>
    call<{ removed: string[]; undo: string }>(
      c.conversationUrl,
      c.sessionApiKey,
      "POST",
      "/checkpoints/restore",
      { path, id },
    ),
};

/** Join the repo path and a repo-relative file path with the workspace's separator. */
export function joinWorkspacePath(root: string, rel: string): string {
  const win = /^[A-Za-z]:[\\/]/.test(root);
  const sep = win ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${sep}${win ? rel.replace(/\//g, "\\") : rel}`;
}
