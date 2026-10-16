import type { ReactNode } from "react";

/**
 * A small outlined label beside text: 12px `muted-ink` in a 1px `border` with `md` radius. One
 * component so the drawer's Headless badge and the open items' kind tags can't drift apart.
 */
export function Badge({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-md border px-1.5 text-label text-muted-foreground"
      title={title}
    >
      {children}
    </span>
  );
}
