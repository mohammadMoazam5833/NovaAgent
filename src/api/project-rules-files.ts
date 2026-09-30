import { FileClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";

export const AGENTS_MD_FILENAME = "AGENTS.md";
export const PROJECT_MEMORY_RELATIVE_PATH = ".openhands/memory/MEMORY.md";

export function resolveProjectRulesPath(
  workingDir: string,
  kind: "agents" | "memory",
): string {
  const base = workingDir.replace(/\/+$/, "");
  return kind === "agents"
    ? `${base}/${AGENTS_MD_FILENAME}`
    : `${base}/${PROJECT_MEMORY_RELATIVE_PATH}`;
}

export async function readProjectTextFile(
  absolutePath: string,
): Promise<string | null> {
  try {
    return await new FileClient(getAgentServerClientOptions()).downloadTextFile(
      absolutePath,
    );
  } catch {
    return null;
  }
}

export async function writeProjectTextFile(
  absolutePath: string,
  content: string,
): Promise<void> {
  const fileName = absolutePath.split("/").pop() ?? "file.md";
  const destinationDir = absolutePath.slice(
    0,
    absolutePath.length - fileName.length,
  );
  await new FileClient(getAgentServerClientOptions()).uploadTextFile(
    content,
    destinationDir || "/",
    fileName,
  );
}
