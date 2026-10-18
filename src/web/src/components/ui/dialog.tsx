import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils.ts";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTitle({ ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" {...props} />;
}

function DialogDescription({ ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" {...props} />;
}

function DialogContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/30 duration-100 data-closed:animate-out data-open:animate-in"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "data-closed:fade-out-0 data-closed:zoom-out-95 data-open:fade-in-0 data-open:zoom-in-95 fixed z-50 flex flex-col overflow-hidden rounded-lg bg-popover text-body text-popover-foreground shadow-2xl outline-hidden ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in",
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogContent, DialogDescription, DialogTitle };
