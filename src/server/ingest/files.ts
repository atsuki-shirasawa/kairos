import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Kind of a file under the projects directory, with the IDs its path encodes. */
export type LogFile =
  | { kind: "session"; sessionId: string }
  | { kind: "subagent"; sessionId: string; agentId: string }
  | { kind: "subagent-meta"; sessionId: string; agentId: string };

/** Determines the file kind from its path relative to the projects directory. */
export function classifyPath(projectsDir: string, path: string): LogFile | null {
  const parts = relative(projectsDir, path).split(sep);
  if (parts.length === 2 && parts[1]?.endsWith(".jsonl")) {
    return { kind: "session", sessionId: parts[1].slice(0, -".jsonl".length) };
  }
  if (parts.length === 4 && parts[2] === "subagents" && parts[1]) {
    const m = /^agent-(.+?)(\.jsonl|\.meta\.json)$/.exec(parts[3] ?? "");
    if (m?.[1]) {
      const kind = m[2] === ".jsonl" ? "subagent" : "subagent-meta";
      return { kind, sessionId: parts[1], agentId: m[1] };
    }
  }
  return null;
}

/**
 * Log files to ingest under `projectsDir`: main session files first, then subagent logs and their
 * meta files, each group in name order.
 */
export function listFiles(projectsDir: string): string[] {
  if (!existsSync(projectsDir)) return [];
  const main: string[] = [];
  const sub: string[] = [];
  for (const proj of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!proj.isDirectory()) continue;
    const projDir = join(projectsDir, proj.name);
    for (const entry of readdirSync(projDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) main.push(join(projDir, entry.name));
      if (entry.isDirectory()) sub.push(...subagentFiles(join(projDir, entry.name)));
    }
  }
  return [...main.sort(), ...sub.sort()];
}

/** The subagent logs and meta files of one session directory (`<session>/subagents/`). */
export function subagentFiles(sessionDir: string): string[] {
  const subDir = join(sessionDir, "subagents");
  if (!existsSync(subDir)) return [];
  return readdirSync(subDir)
    .filter((f) => f.endsWith(".jsonl") || f.endsWith(".meta.json"))
    .map((f) => join(subDir, f));
}
