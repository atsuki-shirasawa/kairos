---
name: ship-local
description: Verifies and builds the changes, then restarts the kairos server running in the background to deploy them to the local everyday environment.
disable-model-invocation: true
---

# Deploy to the local Kairos

1. Run `bun run check`. If it fails, stop here and report the failure (don't build or restart)
2. `bun run build` (rebuilds `dist/web`)
3. `kairos restart`
4. Verify
   - `kairos status` shows it's running, with the PID
   - `curl -s http://127.0.0.1:4319/api/health` returns `"name":"kairos"`
   - Ingest runs right after start, so check that the tail of `~/Library/Logs/kairos/server.log` has no errors
5. If the change bumped `PARSER_VERSION` / `DERIVED_VERSION`, mention that a re-ingest / recomputation will run

If the `kairos` command isn't found, the README's "Setup" (`bun link`) hasn't been done. Don't run `bun link` on your own; tell the user.
