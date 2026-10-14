// Terminal styles shared by the CLI's output, so help, doctor, status and search read as one tool.
// Colors are the terminal's own ANSI palette rather than fixed RGB, so they stay legible on both
// light and dark themes; only the logo (and the summarize bar) use the favicon's exact colors.

/** The styles one piece of output can use; each is the identity when color is off. */
export interface Styles {
  bold: (s: string) => string;
  /** Reference detail that should recede: placeholders, defaults, paths, links. */
  dim: (s: string) => string;
  /**
   * Section headings (`Usage`, `Options`). Bold rather than colored: the theme's yellow, the
   * logo's dusk, is too faint on a light background.
   */
  heading: (s: string) => string;
  /** Things you type: command names and flags. */
  command: (s: string) => string;
  /** What's fine, needs a look, or is broken: doctor's marks, status's dot, failure counts. */
  ok: (s: string) => string;
  warn: (s: string) => string;
  fail: (s: string) => string;
}

/** The styles, or no-ops when color is off. */
export function styles(color: boolean): Styles {
  const wrap = (code: string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    bold: wrap("1"),
    dim: wrap("2"),
    heading: wrap("1"),
    command: wrap("36"),
    ok: wrap("32"),
    warn: wrap("33"),
    fail: wrap("31"),
  };
}

/** Whether to color output: only on a terminal, and never when NO_COLOR is set. */
export function colorFor(stream: { isTTY?: boolean }): boolean {
  return Boolean(stream.isTTY) && !process.env.NO_COLOR;
}

/**
 * Splits text into lines of at most `width` columns at spaces. A word longer than the width gets
 * a line of its own rather than being cut, so paths and URLs stay copyable. Only plain spaces
 * break, so a no-break space (U+00A0) keeps words together.
 */
export function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/[ \t\n]+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
