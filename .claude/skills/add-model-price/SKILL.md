---
name: add-model-price
description: Adds or updates Claude model prices in src/server/pricing.ts, after finding which models in the real logs have no price yet. Use when a new Claude model ships, prices change, or the UI marks cost as unpriced.
---

# Add a model price

`PRICES` in `src/server/pricing.ts` is a hand-kept copy of the Claude API price list. A model that isn't listed has no price, so `usageOf` in `queries.ts` marks the section `unpriced` and its cost drops out of every total. Costs are a gauge of usage, not what a subscription actually pays.

## Steps

1. **Find unpriced models** in the everyday DB (read-only):
   `sqlite3 -readonly ~/Library/Application\ Support/kairos/kairos.db "SELECT model, COUNT(*), MAX(speed) FROM usage GROUP BY model ORDER BY 2 DESC"`
   Compare against `PRICES`, remembering that `priceOf` matches dated IDs (`claude-haiku-4-5-20251001`) by the longest listed prefix. Ignore non-models such as `<synthetic>`
2. **Get the official prices** for each missing or changed model: load the `claude-api` skill (it has the current price table), and confirm with the Claude pricing page when it's unclear. Never guess a price from a model's name or a neighboring version. If a model has no published price, leave it unpriced and say so
3. **Edit `PRICES`**
   - Keep the order: newest family first, then by size, a short ID after its longer versions (`claude-opus-5-5` before `claude-opus-5`)
   - `input` / `output` / `cacheRead` are USD per million tokens. Cache writes are derived (1.25x input for 5 min, 2x for 1 hour); only add a field if a model breaks that rule, and change `costOf` with it
   - `fast` is the fast-mode multiplier on the whole amount; set it only for models that support fast mode
   - Update the "as of" date in the comment above `PRICES`
4. **Tests** (`tests/server/pricing.test.ts`): add an expectation for each new model in `priceOf`, and for the cache read or fast multiplier if it differs from the existing cases
5. **Verify**: `bun run check`

No `PARSER_VERSION` / `DERIVED_VERSION` bump is needed: costs are computed when the API is queried, so they apply to old sessions as soon as the server restarts.

## Report when done

- Each model added or changed, with its prices and the source
- Models still unpriced in the real logs, and why
- That `/ship-local` makes the new costs show up in the everyday UI
