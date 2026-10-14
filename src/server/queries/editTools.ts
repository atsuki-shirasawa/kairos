/**
 * Tools that modify files; the tool_use text (input summary) of each is the file path. Shared by
 * the activity counts and `file:` search terms, so both count the same files.
 */
export const EDIT_TOOL_NAMES = ["Edit", "Write", "MultiEdit", "NotebookEdit"] as const;

/** `EDIT_TOOL_NAMES` as a SQL list for `tool_name IN (...)`. The names are constants, not input. */
export const EDIT_TOOLS = EDIT_TOOL_NAMES.map((name) => `'${name}'`).join(", ");
