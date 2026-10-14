// Errors the `kairos` command ends with. Helpers and commands throw them; only the entry point
// prints them and exits, so every piece can be called and tested without ending the process.

/** Ends the command with a message on stderr and an exit code. */
export class CliError extends Error {
  /**
   * @param message What went wrong, printed as is; empty when the command already said it.
   * @param exitCode The process's exit code.
   */
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

/** A malformed command line: the reason, then where to read the right usage. */
export class UsageError extends CliError {
  /**
   * @param reason What is wrong with the command line.
   * @param command The command whose help page to point at; the overview when absent.
   */
  constructor(reason: string, command?: string) {
    super(
      `${reason}\nRun \`kairos help${command ? ` ${command}` : ""}\` to see ${command ? "its" : "the"} options.`,
    );
  }
}
