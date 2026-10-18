import { cn } from "@/lib/utils.ts";

/**
 * A key as printed on a key cap ("t", "←", "⌘K"), beside what it does in the shortcut list and
 * the palette's rows. The hints inside a field or a menu item (the search field's "/", a view's
 * key in its dropdown) stay smaller and quieter, as asides to the control they sit in.
 */
export function KeyCap({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      className={cn(
        "min-w-6 rounded border bg-muted px-1.5 text-center font-num text-label leading-5",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
