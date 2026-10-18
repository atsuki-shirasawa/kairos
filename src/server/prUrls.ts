// A PR's URL and the key it is stored and asked for by (`host/owner/name` and a number), built
// and read in one place so the two always agree.
import type { PrRef } from "../shared/api.ts";
import { prNumber } from "../shared/artifacts.ts";
import { repoOfPrUrl } from "./ingest/project.ts";

/** The PR's URL, from its repository key and number. */
export function prUrl(pr: PrRef): string {
  return `https://${pr.repo}/pull/${pr.number}`;
}

/** A PR URL as its key and `owner/name`, or null when it isn't one. The inverse of `prUrl`. */
export function prOfUrl(url: string): (PrRef & { fullName: string }) | null {
  const repo = repoOfPrUrl(url);
  const number = Number(prNumber(url));
  if (!repo || !Number.isInteger(number)) return null;
  return { repo: repo.key, number, fullName: repo.fullName };
}
