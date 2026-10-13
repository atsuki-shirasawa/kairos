import { useState } from "react";
import {
  useFocusWhenOverlaid,
  useScrollTopOnChange,
} from "@/components/drawer/useDrawerEffects.ts";
import { useSession } from "@/hooks/queries.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { selectedSection } from "@/lib/drawer.ts";
import type { BlockRef, RunPosition } from "@/lib/navigation.ts";
import { cn } from "@/lib/utils.ts";
import { Detail } from "./drawer/Detail.tsx";
import { DrawerHeader } from "./drawer/Header.tsx";

interface Props {
  id: string;
  /** Start of the selected section. null means the last section. */
  at: number | null;
  onClose: () => void;
  onSelect: (id: string, at: number | null) => void;
  /** Move to the previous / next work in time order. null at either end. */
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  /** The burst of headless runs the open block belongs to (drawn as one mark), if any. */
  run: RunPosition | null;
  /** Opens another run of that burst. */
  onRun: (run: BlockRef) => void;
  /**
   * Float over the content between `lg` and `xl` instead of pushing it aside. The week and month
   * views' seven columns can't spare the drawer's width at laptop sizes; the rest reflow fine.
   */
  overlay: boolean;
}

/** The detail pane on the right. The heading stays pinned; below it: summary → session flow → outcomes → conversation → numbers. */
export function SessionDrawer({
  id,
  at,
  onClose,
  onSelect,
  onPrev,
  onNext,
  run,
  onRun,
  overlay,
}: Props) {
  const t = drawerMessages();
  const { data, isPending, isError, error } = useSession(id);
  // The conversation is long, so it starts collapsed; the numbers start open. Either choice holds
  // until the drawer closes (so moving with j / k keeps the same view for comparison)
  const [showConversation, setShowConversation] = useState(false);
  const [showNumbers, setShowNumbers] = useState(true);
  const section = data ? selectedSection(data.sections, at) : null;
  const asideRef = useFocusWhenOverlaid<HTMLElement>();
  const scrollRef = useScrollTopOnChange<HTMLDivElement>(`${id}@${at}`, showConversation);

  return (
    <>
      {/* Only when overlaid on narrow screens: dim the backdrop and close on outside click */}
      <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={onClose} aria-hidden />
      <aside
        ref={asideRef}
        tabIndex={-1}
        className={cn(
          "flex w-full shrink-0 flex-col border-l bg-card outline-none",
          "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:max-w-md max-lg:shadow-2xl",
          "lg:w-[26rem] xl:w-[30rem]",
          // No backdrop here: the visible blocks stay clickable to switch sessions
          overlay &&
            "lg:max-xl:absolute lg:max-xl:inset-y-0 lg:max-xl:right-0 lg:max-xl:z-30 lg:max-xl:shadow-2xl",
        )}
        aria-label={t.ariaDetail}
      >
        <DrawerHeader
          session={data}
          section={section}
          onClose={onClose}
          onPrev={onPrev}
          onNext={onNext}
          run={run}
          onRun={onRun}
        />
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-10"
          data-drawer-scroll
        >
          {isPending && <p className="text-muted-foreground text-sm">{t.loading}</p>}
          {isError && <p className="text-destructive text-sm">{t.loadFailed(error.message)}</p>}
          {data && (
            <Detail
              key={data.id}
              session={data}
              section={section}
              onSelect={onSelect}
              showConversation={showConversation}
              onShowConversation={setShowConversation}
              showNumbers={showNumbers}
              onShowNumbers={setShowNumbers}
            />
          )}
        </div>
      </aside>
    </>
  );
}
