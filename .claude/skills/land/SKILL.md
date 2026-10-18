---
name: land
description: Lands finished work on main without a PR — reviews the branch, fixes the findings, then fast-forwards main and deletes the branch. Use when the user asks to review and merge finished work into main (this is a personal project; PRs aren't used).
argument-hint: "[low|medium|high|xhigh|max] [push]"
---

# Land a branch on main

This is a personal project, so finished work goes straight to main: review → fix → fast-forward merge. No PR.

**Arguments**: `$ARGUMENTS` holds at most a review level (`low`/`medium`/`high`/`xhigh`/`max`) and the word `push`, in any order. The level defaults to `medium`; pass code-review only the level, never `push`.

1. **Put the work on a branch based on the latest main**
   - `git fetch -q origin`. If local main is behind `origin/main`, fast-forward it (`git switch main && git pull -q --ff-only`)
   - Uncommitted work on main: create a branch (`feat/…`, `fix/…`, `docs/…`, `chore/…`) and commit there
   - Work already committed on main but not on origin: move it to a branch and point main back (`git branch <branch> && git branch -f main origin/main && git switch <branch>`), so `main..<branch>` holds the work to review
   - Rebase the branch onto main if main has moved past its base
   - Commit subjects follow Conventional Commits. If the work resolves an issue, put `Closes #N` in the body so the push closes it. One commit per change, unless the parts are clearly separate (e.g. code and docs)
2. **Review** — run the `code-review` skill on `main..<branch>` at the chosen level. In parallel, run each reviewer agent whose paths the branch touches; the `remind_once` calls in `.claude/hooks/rules-check.sh` are the source of truth for which paths need `security-reviewer`, `i18n-reviewer`, `design-reviewer` and `query-plan-reviewer`. Also run `structure-reviewer` whenever the branch touches `src/`
3. **Fix** — address every finding worth fixing, adding tests for the cases a finding exposed. Fold each fix into the commit it belongs to: `git commit --amend` for a single commit, or `git commit --fixup=<sha>` then `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash main` for several. Update the commit message if the approach changed. Skip a finding only with a reason you can state, and list it in the report
4. **Check** — `bun run check` must pass. If it fails, fix and repeat; never merge red
   - When the branch touches `src/web` or `scripts/screenshots`, also run `bun run visual` (if `.visual/baseline` is missing, first make one on main: `bun run visual; bun run visual --update`). A structural change must give a zero diff. For a visual change, look at every image in `.visual/diff` and say in the report what changed and whether it was intended
   - With the same paths, also run `bun run e2e` (keyboard, search, URL, Live count, SSE resync, axe ratchet). It must pass; a new axe violation is fixed, not written into the baseline
5. **Merge**
   ```sh
   git fetch -q origin
   git switch main
   git merge --ff-only <branch>
   git branch -d <branch>
   ```
   If main or `origin/main` moved since step 1, switch back, rebase the branch onto it, rerun `bun run check`, and repeat the review when the new commits touch the same files. Don't create a merge commit
   - If `bun run visual` showed intended changes, run `bun run visual --update` now, so the baseline matches main
6. **Push** — only when `$ARGUMENTS` contains `push`; otherwise say main is ahead of origin and ask. After pushing:
   - Delete the branch on origin if it was pushed earlier (`git push origin --delete <branch>`)
   - Confirm any `Closes #N` issue is closed (`gh issue view N --json state`)
7. **Report** in Japanese: the merged commit (hash, fast-forward), each finding and how it was handled (fixed / skipped and why), the check result, and whether it's pushed. If the change affects the running app, mention that `/ship-local` deploys it
