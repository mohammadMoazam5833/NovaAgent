import { ArrowUp } from "lucide-react";
import { cn } from "#/utils/utils";

export interface ChatSendButtonProps {
  buttonClassName: string;
  handleSubmit: () => void;
  disabled: boolean;
}

/**
 * Theme-aware send control. Hardcoded `white` / `border-white` made the
 * button invisible on light backgrounds; use foreground tokens instead.
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
        "flex items-center justify-center rounded-full border size-8",
        disabled
          ? "cursor-not-allowed border-[color-mix(in_srgb,var(--oh-foreground)_28%,transparent)] text-[color-mix(in_srgb,var(--oh-foreground)_40%,transparent)]"
          : "cursor-pointer border-[var(--oh-foreground)] text-[var(--oh-foreground)] hover:bg-[color-mix(in_srgb,var(--oh-foreground)_10%,transparent)]",
        buttonClassName,
      )}
      data-name="arrow-up-circle-fill"
      data-testid="submit-button"
      onClick={handleSubmit}
      disabled={disabled}
      aria-disabled={disabled}
    >
      <ArrowUp className="w-4 h-4" aria-hidden />
    </button>
  );
}
