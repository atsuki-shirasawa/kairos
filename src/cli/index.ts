#!/usr/bin/env bun
import { serve } from "../server/serve.ts";

const USAGE = `usage: kairos <command>

commands:
  serve    サーバーを起動する`;

const [command] = process.argv.slice(2);

switch (command) {
  case "serve":
    serve();
    break;
  default:
    console.error(USAGE);
    process.exit(command ? 1 : 0);
}
