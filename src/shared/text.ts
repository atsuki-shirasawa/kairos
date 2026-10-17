// Text made safe to print or paste: the CLI writes it to a terminal, and the report is pasted
// wherever the user likes, so neither carries control characters from LLM output or logs.

/**
 * Drops control characters. Headlines are LLM output over log text, so a prompt injection could
 * make one carry escape sequences (OSC 52 clipboard writes, fake hyperlinks) into the terminal.
 */
export function printable(text: string): string {
  return Array.from(text, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? " " : ch;
  }).join("");
}

/** Text as one printable line: control characters and runs of whitespace become one space. */
export function printableLine(text: string): string {
  return printable(text).replace(/\s+/g, " ").trim();
}
