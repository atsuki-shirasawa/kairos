import { homedir } from "node:os";
import { join } from "node:path";

/** Claude Code の設定ディレクトリ。セッションログは `<claudeDir>/projects` にある。 */
export const DEFAULT_CLAUDE_DIR = join(homedir(), ".claude");

/**
 * Kairos のデータ置き場（DB・PID・要約用の作業ディレクトリ）。
 * `KAIROS_DATA_DIR` で変えられる（テストや、別の DB で試すとき）。
 */
export const DATA_DIR =
  process.env.KAIROS_DATA_DIR ?? join(homedir(), "Library", "Application Support", "kairos");

export const DEFAULT_DB_PATH = join(DATA_DIR, "kairos.db");

/** 起動中のサーバーの PID。 */
export const PID_PATH = join(DATA_DIR, "kairos.pid");

/** バックグラウンドで起動したサーバーのログ。データ置き場を変えたときはその中に置く。 */
export const LOG_PATH = process.env.KAIROS_DATA_DIR
  ? join(DATA_DIR, "server.log")
  : join(homedir(), "Library", "Logs", "kairos", "server.log");
