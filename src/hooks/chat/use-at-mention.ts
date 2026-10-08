import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWorkspaceFiles } from "#/hooks/query/use-workspace-files";

export type MentionKind = "file" | "folder" | "rules";

export interface MentionItem {
  kind: MentionKind;
  /** Workspace-relative POSIX path. */
  path: string;
}

export interface MentionRange {
  start: number;
  end: number;
}

/** Project rules paths already managed by the Rules screen. */
const PROJECT_RULES_PATHS = new Set([
  "agents.md",
  ".openhands/memory/memory.md",
]);

export const MAX_MENTION_ITEMS = 50;

export function normalizeWorkspacePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function isUsablePath(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  return path.length > 0 && !segments.includes("..");
}

export function isProjectRulesPath(path: string): boolean {
  return PROJECT_RULES_PATHS.has(normalizeWorkspacePath(path).toLowerCase());
}

function pathDepth(path: string): number {
  return normalizeWorkspacePath(path).split("/").filter(Boolean).length - 1;
}

function compareMentionItems(left: MentionItem, right: MentionItem): number {
  const depthDiff = pathDepth(left.path) - pathDepth(right.path);
  if (depthDiff !== 0) return depthDiff;
  if (left.kind === "folder" && right.kind !== "folder") return -1;
  if (left.kind !== "folder" && right.kind === "folder") return 1;
  return left.path.localeCompare(right.path, undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

/**
 * Derive files and folder candidates from the workspace file listing. Folders
 * are inferred from file ancestors, so no extra directory API is required.
 */
export function buildMentionItems(paths: readonly string[]): MentionItem[] {
  const items = new Map<string, MentionItem>();

  paths.forEach((rawPath) => {
    const path = normalizeWorkspacePath(rawPath);
    if (!isUsablePath(path)) return;

    const fileItem: MentionItem = {
      kind: isProjectRulesPath(path) ? "rules" : "file",
      path,
    };
    items.set(path, fileItem);

    const segments = path.split("/").filter(Boolean);
    segments.pop();
    let parent = "";
    segments.forEach((segment) => {
      parent = parent ? `${parent}/${segment}` : segment;
      if (!items.has(parent)) {
        items.set(parent, { kind: "folder", path: parent });
      }
    });
  });

  return Array.from(items.values()).sort(compareMentionItems);
}

/**
 * Case-insensitive subsequence matching with a small positional score so
 * `read` ranks `README.md` above `src/remote/deploy.md`.
 */
function matchMention(
  path: string,
  query: string,
): { matches: boolean; score: number } {
  const lowerPath = path.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let pathIndex = 0;
  let score = 0;

  for (const character of lowerQuery) {
    const index = lowerPath.indexOf(character, pathIndex);
    if (index === -1) return { matches: false, score: Number.MAX_SAFE_INTEGER };
    score += index - pathIndex;
    pathIndex = index + 1;
  }

  return { matches: true, score };
}

export function filterMentionItems(
  items: readonly MentionItem[],
  query: string,
  maxRows = MAX_MENTION_ITEMS,
): MentionItem[] {
  const normalizedQuery = normalizeWorkspacePath(query);
  const isRulesQuery = normalizedQuery.toLowerCase().startsWith("rules");
  const candidates = isRulesQuery
    ? items.filter(
        (item) => item.kind === "rules" || isProjectRulesPath(item.path),
      )
    : items;

  if (!normalizedQuery || isRulesQuery) {
    return candidates.slice(0, maxRows);
  }

  return candidates
    .map((item) => ({ item, ...matchMention(item.path, normalizedQuery) }))
    .filter((entry) => entry.matches)
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return compareMentionItems(left.item, right.item);
    })
    .slice(0, maxRows)
    .map((entry) => entry.item);
}

export function buildMentionReplacement(item: MentionItem): string {
  const path = item.kind === "folder" ? `${item.path}/` : item.path;
  return `@${path} `;
}

export function replaceMentionText(
  text: string,
  range: MentionRange,
  item: MentionItem,
): { text: string; cursor: number } {
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  const replacement = buildMentionReplacement(item);
  return {
    text: text.slice(0, start) + replacement + text.slice(end),
    cursor: start + replacement.length,
  };
}

/** Get the cursor's character offset within a contentEditable element. */
function getCursorOffset(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return -1;

  const range = selection.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

function setCursorAtOffset(element: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;

  while (walker.nextNode()) {
    const currentNode = walker.currentNode as Text;
    const length = currentNode.data.length;
    if (remaining <= length) {
      range.setStart(currentNode, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
  }

  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

interface MentionQuery {
  text: string;
  start: number;
  end: number;
}

function getMentionQuery(element: HTMLDivElement): MentionQuery | null {
  const text = (element.innerText || "").replace(/[\n\r]+$/, "");
  const cursor = getCursorOffset(element);
  if (cursor < 0) return null;

  const beforeCursor = text.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@(\S*)$/);
  if (!match) return null;

  const query = match[2];
  const start = beforeCursor.length - query.length - 1;
  const trailing = text.slice(cursor).match(/^\S*/);
  const end = cursor + (trailing?.[0].length ?? 0);

  return { text: query, start, end };
}

/**
 * Workspace @mention autocomplete for the contentEditable chat composer.
 * Reuses the Files tab query so the list is cached per conversation and
 * follows the same backend-specific workspace transport.
 */
export const useAtMention = (
  chatInputRef: React.RefObject<HTMLDivElement | null>,
) => {
  const { data: workspacePaths, isLoading: isFilesLoading } =
    useWorkspaceFiles();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const mentionRangeRef = useRef<MentionRange | null>(null);

  const allItems = useMemo(
    () => buildMentionItems(workspacePaths ?? []),
    [workspacePaths],
  );
  const filteredItems = useMemo(
    () => filterMentionItems(allItems, query),
    [allItems, query],
  );

  const isMenuOpenRef = useRef(isMenuOpen);
  isMenuOpenRef.current = isMenuOpen;
  const filteredItemsRef = useRef(filteredItems);
  filteredItemsRef.current = filteredItems;
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const updateMentionMenu = useCallback(() => {
    const element = chatInputRef.current;
    const result = element ? getMentionQuery(element) : null;

    if (result) {
      setQuery(result.text);
      mentionRangeRef.current = { start: result.start, end: result.end };
      setIsMenuOpen(true);
      return;
    }

    setIsMenuOpen(false);
    setQuery("");
    mentionRangeRef.current = null;
  }, [chatInputRef]);

  const selectItem = useCallback(
    (item: MentionItem) => {
      const element = chatInputRef.current;
      const range = mentionRangeRef.current;
      if (!element || !range) return;

      const text = element.innerText || "";
      const next = replaceMentionText(text, range, item);
      element.textContent = next.text;
      setCursorAtOffset(element, next.cursor);

      setIsMenuOpen(false);
      setQuery("");
      setSelectedIndex(0);
      mentionRangeRef.current = null;
      element.dispatchEvent(new InputEvent("input", { bubbles: true }));
      element.focus();
    },
    [chatInputRef],
  );

  const handleMentionKeyDown = useCallback(
    (event: React.KeyboardEvent): boolean => {
      const items = filteredItemsRef.current;
      if (!isMenuOpenRef.current || items.length === 0) return false;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setSelectedIndex((index) =>
            index < items.length - 1 ? index + 1 : 0,
          );
          return true;
        case "ArrowUp":
          event.preventDefault();
          setSelectedIndex((index) =>
            index > 0 ? index - 1 : items.length - 1,
          );
          return true;
        case "Enter":
        case "Tab": {
          const item = items[selectedIndexRef.current];
          if (!item) return false;
          event.preventDefault();
          selectItem(item);
          return true;
        }
        case "Escape":
          event.preventDefault();
          setIsMenuOpen(false);
          return true;
        case "ArrowLeft":
        case "ArrowRight":
        case "Home":
        case "End":
          setIsMenuOpen(false);
          return false;
        default:
          return false;
      }
    },
    [selectItem],
  );

  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  return {
    isMenuOpen,
    filteredItems,
    isLoading: isFilesLoading,
    selectedIndex,
    updateMentionMenu,
    selectItem,
    handleMentionKeyDown,
    closeMenu,
  };
};
