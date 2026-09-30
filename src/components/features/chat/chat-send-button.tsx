import { ArrowUp } from "lucide-react";
import { cn } from "#/utils/utils";

export interface ChatSendButtonProps {
  buttonClassName: string;
  handleSubmit: () => void;
  disabled: boolean;
}

/**
 * Filled send control: uses foreground fill + background-colored icon so light
 * mode reads as black circle / white arrow, and dark mode inverts cleanly.
 */
export function ChatSendButton({
  buttonClassName,
  handleSubmit,
  disabled,
}: ChatSendButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center justify-center rounded-full size-8 border-0",
        disabled
          ? "cursor-not-allowed bg-[color-mix(in_srgb,var(--oh-foreground)_28%,transparent)] text-[var(--oh-background)]"
          : "cursor-pointer bg-[var(--oh-foreground)] text-[var(--oh-background)] hover:opacity-90",
        buttonClassName,
      )}
      data-name="arrow-up-circle-fill"
      data-testid="submit-button"
      onClick={handleSubmit}
      disabled={disabled}
      aria-disabled={disabled}
    >
      <ArrowUp className="w-4 h-4" strokeWidth={2.5} aria-hidden />
    </button>
  );
}
