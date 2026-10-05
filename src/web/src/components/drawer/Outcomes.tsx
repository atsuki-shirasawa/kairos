import type { Artifact, Section, SessionDetail } from "@shared/api.ts";
import { ExternalLink, GitCommitHorizontal, GitPullRequest } from "lucide-react";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { prLinkParts, shortSha, splitOutcomes } from "@/lib/drawer.ts";
import { Block } from "./Block.tsx";

/** Show this many outcomes for the period up front and collapse the rest, to keep the conversation close. */
const OUTCOME_LIMIT = 5;

/** Outcomes. Those from the selected period come first; the rest of the session is collapsed. */
export function Outcomes({ session: s, section }: { session: SessionDetail; section: Section }) {
  const t = drawerMessages();
  const { here, rest } = splitOutcomes(s.prs, s.commits, section);
  return (
    <Block title={t.sectionOutcomes}>
      {here.length > 0 ? (
        <SectionOutcomes items={here} />
      ) : (
        <p className="text-muted-foreground text-sm">{t.noOutcomes}</p>
      )}
      {rest.length > 0 && (
        <details className="group mt-3">
          <summary className="cursor-pointer text-muted-foreground text-xs">
            {t.sessionOutcomes(rest.length)}
          </summary>
          <div className="mt-2">
            <ArtifactList items={rest} />
          </div>
        </details>
      )}
    </Block>
  );
}

/** The period's outcomes: the first few listed, the remainder behind "N more". */
function SectionOutcomes({ items }: { items: Artifact[] }) {
  const t = drawerMessages();
  return (
    <>
      <ArtifactList items={items.slice(0, OUTCOME_LIMIT)} />
      {items.length > OUTCOME_LIMIT && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-muted-foreground text-xs">
            {t.moreItems(items.length - OUTCOME_LIMIT)}
          </summary>
          <div className="mt-1.5">
            <ArtifactList items={items.slice(OUTCOME_LIMIT)} />
          </div>
        </details>
      )}
    </>
  );
}

/** PRs as links and commits as short SHA plus subject, one per line. */
function ArtifactList({ items }: { items: Artifact[] }) {
  return (
    <ul className="space-y-2 text-sm leading-snug">
      {items.map((a) =>
        a.kind === "pr" ? (
          <li key={a.ref} className="flex items-baseline gap-2">
            <GitPullRequest className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" />
            <PrLink artifact={a} />
          </li>
        ) : (
          <li key={a.ref} className="flex items-baseline gap-2">
            <GitCommitHorizontal className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" />
            <CommitLine artifact={a} />
          </li>
        ),
      )}
    </ul>
  );
}

/** A commit's short SHA (when known) and subject. */
function CommitLine({ artifact: a }: { artifact: Artifact }) {
  const sha = shortSha(a);
  return (
    <>
      {sha !== null && <code className="shrink-0 text-muted-foreground text-xs">{sha}</code>}
      <span className="min-w-0 break-words">{a.title}</span>
    </>
  );
}

/**
 * A PR link. The number comes from the URL and sits beside the title. PRs stored without a title
 * show their repository name as a secondary label instead.
 */
function PrLink({ artifact: a }: { artifact: Artifact }) {
  const { num, repo } = prLinkParts(a);
  return (
    <a
      href={a.ref}
      target="_blank"
      rel="noreferrer"
      className="min-w-0 break-words text-primary hover:underline"
    >
      {num && <span className="mr-1.5 font-medium font-num">#{num}</span>}
      {repo ? (
        <span className="text-muted-foreground text-xs">{repo}</span>
      ) : (
        <span>{a.title ?? a.ref}</span>
      )}
      <ExternalLink className="ml-1 inline size-3" />
    </a>
  );
}
