import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FaFile, FaFolder, FaBook } from "react-icons/fa";

import {
  dropdownInstantColorClassName,
  dropdownMenuListClassName,
} from "#/utils/dropdown-classes";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { MentionItem } from "#/hooks/chat/use-at-mention";

interface AtMentionMenuItemProps {
  item: MentionItem;
  isSelected: boolean;
  onSelect: (item: MentionItem) => void;
  ref?: React.Ref<HTMLButtonElement>;
}

function AtMentionMenuItem({
  item,
  isSelected,
  onSelect,
  ref,
}: AtMentionMenuItemProps) {
  const Icon =
    item.kind === "folder" ? FaFolder : item.kind === "rules" ? FaBook : FaFile;

  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={isSelected}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-[var(--oh-foreground)]",
        dropdownInstantColorClassName,
        isSelected
          ? "bg-[var(--oh-surface-raised)]"
          : "hover:bg-[var(--oh-interactive-hover)]",
      )}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect(item);
      }}
    >
      <Icon
        className="size-4 shrink-0 text-[var(--oh-muted)]"
        aria-hidden="true"
      />
      <code
        dir="ltr"
        className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--oh-foreground)]"
      >
        {item.kind === "folder" ? `${item.path}/` : item.path}
      </code>
    </button>
  );
}

interface AtMentionMenuProps {
  items: MentionItem[];
  isLoading?: boolean;
  selectedIndex: number;
  onSelect: (item: MentionItem) => void;
}

export function AtMentionMenu({
  items,
  isLoading = false,
  selectedIndex,
  onSelect,
}: AtMentionMenuProps) {
  const { t } = useTranslation("openhands");
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length);
  }, [items.length]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div
      role="listbox"
      aria-label={t(I18nKey.CHAT_INTERFACE$MENTION_FILES)}
      data-testid="at-mention-menu"
      className="absolute bottom-full start-0 z-50 mb-1 w-full overflow-y-auto rounded-[10px] border border-[var(--oh-border-subtle)] bg-[var(--oh-surface)] shadow-lg custom-scrollbar max-h-[300px]"
    >
      <div className="border-b border-[var(--oh-border-subtle)] px-3 py-2 text-xs text-[var(--oh-muted)]">
        {t(I18nKey.CHAT_INTERFACE$MENTION_FILES)}
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-3 text-sm text-[var(--oh-muted)]">
          {isLoading
            ? t(I18nKey.FILES$LOADING_FILES)
            : t(I18nKey.CHAT_INTERFACE$MENTION_NO_MATCHES)}
        </div>
      ) : (
        <div className={dropdownMenuListClassName}>
          {items.map((item, index) => (
            <AtMentionMenuItem
              key={`${item.kind}:${item.path}`}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              item={item}
              isSelected={index === selectedIndex}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
