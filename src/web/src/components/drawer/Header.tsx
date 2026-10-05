import type { Project, Section, SessionDetail } from "@shared/api.ts";
import { Check, ChevronDown, ChevronUp, GitBranch, SquareTerminal, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useCopy } from "@/hooks/useCopy.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { projectColor } from "@/lib/colors.ts";
import { resumeCommand } from "@/lib/shell.ts";
import { SectionTime } from "./SectionTime.tsx";

/**
 * The drawer's pinned heading. It does not scroll, so it stays clear which work this is even deep
 * in the conversation. The first line holds where the work happened and the controls, leaving the
 * full width below for the headline.
 */
export function DrawerHeader({
  session,
  section,
  onClose,
  onPrev,
  onNext,
}: {
  session: SessionDetail | undefined;
  section: Section | null;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  return (
    <header className="shrink-0 border-b px-4 pt-2 pb-4">
      <div className="flex h-9 items-center gap-2">
        <div className="min-w-0 flex-1">
          {session && (
            <ProjectLine project={session.project} label={session.label} branch={session.branch} />
          )}
        </div>
        <DrawerControls session={session} onClose={onClose} onPrev={onPrev} onNext={onNext} />
      </div>
      {session && <DetailHeader session={session} section={section} />}
    </header>
  );
}

/** Copy the resume command, step to the previous / next work, and close. */
function DrawerControls({
  session,
  onClose,
  onPrev,
  onNext,
}: {
  session: SessionDetail | undefined;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const t = drawerMessages();
  return (
    <div className="-mr-1.5 flex shrink-0 items-center">
      {session && <ResumeButton session={session} />}
      <IconButton label={t.prev} onClick={onPrev}>
        <ChevronUp />
      </IconButton>
      <IconButton label={t.next} onClick={onNext}>
        <ChevronDown />
      </IconButton>
      <IconButton label={t.close} onClick={onClose}>
        <X />
      </IconButton>
    </div>
  );
}

/** A labelled ghost icon button. A null handler disables it (at either end of the work list). */
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (() => void) | null;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick ?? undefined}
      disabled={!onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

/**
 * Copies `cd <dir> && claude --resume <id>`. Looking back usually ends in picking the work up again,
 * and Kairos never runs anything itself, so the command goes to the user's own terminal.
 */
function ResumeButton({ session: s }: { session: SessionDetail }) {
  const t = drawerMessages();
  const [state, copy] = useCopy();
  const label =
    state === "copied"
      ? t.copiedResume
      : state === "failed"
        ? formatMessages().copyFailed
        : t.copyResume;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => copy(resumeCommand(s.id, s.launchCwd))}
      aria-label={label}
      title={label}
    >
      {state === "copied" ? <Check className="text-primary" /> : <SquareTerminal />}
      {/* Announce the result; the icon change alone is silent */}
      <span className="sr-only" aria-live="polite">
        {state === "idle" ? "" : label}
      </span>
    </Button>
  );
}

/** Fits project, worktree and branch on one line. Long parts are truncated; the tooltip has the full text. */
function ProjectLine({
  project,
  label,
  branch,
}: {
  project: Project | null;
  label: string | null;
  branch: string | null;
}) {
  const showBranch = branch && branch !== "HEAD";
  return (
    <p
      className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs"
      title={[project?.repo, project?.path, label, showBranch ? branch : null]
        .filter(Boolean)
        .join("\n")}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: projectColor(project) }}
      />
      <span className="shrink-0 font-medium text-foreground">
        {project?.name ?? drawerMessages().unknownProject}
      </span>
      {label && (
        <>
          <span aria-hidden>/</span>
          <span className="min-w-0 truncate">{label}</span>
        </>
      )}
      {showBranch && (
        <span className="ml-1 inline-flex min-w-0 shrink items-center gap-1">
          <GitBranch className="size-3 shrink-0" />
          <span className="truncate font-mono text-[11px]">{branch}</span>
        </span>
      )}
    </p>
  );
}

/** The headline of the selected section, the session title when it differs, and when it happened. */
function DetailHeader({
  session: s,
  section,
}: {
  session: SessionDetail;
  section: Section | null;
}) {
  const headline = section?.headline ?? s.title;
  return (
    // The colored line on the left ties this detail to its block on the calendar
    <div className="mt-1 border-l-[3px] pl-3" style={{ borderColor: projectColor(s.project) }}>
      <h2
        className="line-clamp-2 text-balance font-semibold text-[17px] leading-snug tracking-tight"
        title={headline}
      >
        {headline}
      </h2>
      {section && section.headline !== s.title && (
        <p className="mt-0.5 line-clamp-1 text-muted-foreground text-xs" title={s.title}>
          {s.title}
        </p>
      )}
      {section && <SectionTime session={s} section={section} />}
    </div>
  );
}
