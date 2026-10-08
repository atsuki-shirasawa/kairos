import { expect, test } from "bun:test";
import { serverEnv } from "../../src/cli/daemon.ts";

test("drops a Claude Code session's variables but keeps how claude logs in", () => {
  const env = serverEnv({
    PATH: "/usr/bin",
    CLAUDECODE: "1",
    CLAUDE_CODE_SESSION_ID: "abc",
    CLAUDE_CODE_ENTRYPOINT: "cli",
    CLAUDE_PROJECT_DIR: "/repo",
    CLAUDE_EFFORT: "high",
    CLAUDE_CONFIG_DIR: "/Users/me/.claude-work",
    CLAUDE_CODE_USE_BEDROCK: "1",
    CLAUDE_CODE_OAUTH_TOKEN: "token",
    CLAUDE_CODE_SKIP_BEDROCK_AUTH: "1",
    CLAUDE_CODE_API_KEY_HELPER_TTL_MS: "60000",
    CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR: "3",
    CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR: "4",
    ANTHROPIC_API_KEY: "key",
  });
  expect(Object.keys(env).sort()).toEqual([
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_API_KEY_HELPER_TTL_MS",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_SKIP_BEDROCK_AUTH",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CONFIG_DIR",
    "PATH",
  ]);
});
