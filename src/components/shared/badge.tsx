import { cn } from "#/utils/utils";

export function BrandBadge({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        // Use accent-foreground so light mode (dark primary) stays readable —
        // hard-coded text-black vanished on the near-black light-theme primary.
        "text-sm leading-4 font-semibold tracking-tighter rounded-full",
        "bg-primary text-[var(--oh-accent-foreground)]",
        "px-1 py-1",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
