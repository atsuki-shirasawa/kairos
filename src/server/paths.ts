import { homedir } from "node:os";
import { join } from "node:path";

/** Claude Code の設定ディレクトリ。セッションログは `<claudeDir>/projects` にある。 */
export const DEFAULT_CLAUDE_DIR = join(homedir(), ".claude");

/** Kairos のデータ置き場（DB・PID・要約用の作業ディレクトリ）。 */
export const DATA_DIR = join(homedir(), "Library", "Application Support", "kairos");

export const DEFAULT_DB_PATH = join(DATA_DIR, "kairos.db");
