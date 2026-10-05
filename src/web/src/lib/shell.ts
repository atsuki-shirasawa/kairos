// Shell commands the UI hands to the user's terminal (copied, never run by Kairos).

/**
 * Quotes a word for POSIX shells. Plain words stay as they are so the command reads naturally.
 * A leading `=` is quoted too (zsh expands `=cmd` to a path).
 */
export function shellQuote(word: string): string {
  if (/^[\w./:@%+,-][\w./:@%+=,-]*$/.test(word)) return word;
  return `'${word.replaceAll("'", `'\\''`)}'`;
}

/**
 * Command that continues a session in Claude Code. `claude --resume` looks the session up under the
 * current directory's project, so it first moves to the directory the session was started in.
 * Both values come from the logs, so both are quoted.
 */
export function resumeCommand(sessionId: string, cwd: string | null): string {
  const resume = `claude --resume ${shellQuote(sessionId)}`;
  // `--` so a directory starting with "-" is not read as an option
  return cwd ? `cd -- ${shellQuote(cwd)} && ${resume}` : resume;
}
