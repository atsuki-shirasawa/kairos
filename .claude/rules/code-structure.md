---
paths:
  - "src/**"
---

# Code structure

Readability, maintainability and single responsibility come first. Choose code that the next reader understands without the history over code that is short or clever.

## One responsibility per unit

- A function, component, hook or module does one thing you can name in a few words. If its name needs "and", or its JSDoc lists several jobs, split it
- A comment that explains *what* a step does means the step deserves a name: extract it into a documented function (or component / hook) and let the name say it. Inline comments stay for *why*: a constraint, a log-format quirk, a trade-off
- Keep each function at one level of abstraction: an orchestrating function reads as a list of named steps, and the details live in the steps

## Signals to split

None of these is a hard limit; each one asks you to check whether the unit does more than one thing.

- A function over ~50 lines, or a component over ~150 lines
- Nesting deeper than ~3 levels. Prefer early returns and extracted predicates
- More than ~4 parameters, or a boolean parameter that switches between two behaviours (make two functions, or pass an options object with named fields)
- A file over ~300 lines that mixes domains. Split it by domain, not by kind of code
- The same few lines in two places. Extract once the second copy appears; when server, CLI and web share it, it goes in `src/shared/`

## Where logic lives

- **Server**: SQL stays in the query and store modules; API handlers parse input, call one query or action, and shape the response. Row → API type mapping happens in one place per type
- **Ingest**: reading, classifying, storing and deriving stay separate steps (`reader` → `classify` → `ingester` → `segments`); don't let one reach into another's job
- **Web**: a component renders. Derived state, sorting, filtering, layout maths and formatting are pure functions in `src/web/src/lib/` (testable in `tests/web` without a DOM); effects and data fetching go in a named custom hook. Split a component that renders several distinct regions into subcomponents
- **CLI**: parsing, dispatch and each command's work are separate; rendering goes through `views.ts`
- Push I/O (DB, filesystem, process, clock) to the edges and pass values in, so the core can be tested without it

## Problems this codebase has had

These came up in a code audit. Don't reintroduce them.

- **A façade that grows into a god module.** A class meant as "read queries" collected usage maths, title rules, search, pagination and a write, and other features imported helpers from it. That reverses the layers. A façade only delegates; helpers live in their domain module, and features import them from there
- **The same DTO mapped in two places.** When two endpoints return the same shape (a calendar block and a drawer section, say), one mapper builds it. Two inline mappers drift apart as soon as a field is added
- **One fact defined in several places.** A CLI flag listed in five places, with help text parsed by regex as the allowlist; the same constant on server and web; the same type under two names; the same SQL condition repeated across modules; domain rules like "open at the period's end", "is this project hidden" or the PR-number regex rewritten in web, CLI and server; three copies of local-date helpers; magic time literals (`60_000`) instead of named units. Define it once (in `src/shared/` if layers share it) and derive the rest from it. Two constants that "must stay equal" according to a comment should be one constant
- **Implicit string contracts between layers.** The UI regex-parsed note text and error messages that the server wrote, and the CLI built UI URLs that the web app parsed on its own. When one side writes text or URLs that the other side reads, both use the same exported builder and matcher, and a test checks the round trip
- **Importing a big module for one helper.** If most importers want only one part of a module (day clipping, but not column packing), that part is its own module. Put a type with the concept it describes, not with whatever file used it first (a view type doesn't belong in the date helpers)
- **Commands that read module globals.** A function takes what it needs as parameters or a typed context, so you can call and test it on its own
- **Validators that print and exit.** Helpers return a value or throw a typed error, and only the entry point turns errors into output and exit codes. Validate input once at the boundary into a typed value, so later code doesn't re-check it and comment on why
- **Pure logic hidden in private methods.** If logic only reaches tests through HTTP or a subprocess, extract and export it so a table-driven unit test can cover it
- **Loading a whole object to check that it exists.** Use a cheap existence check
- **Bypassing the shared helper.** Raw ANSI escapes outside `style.ts`, ad-hoc visibility rules outside `visibility.ts`, hard-coded query keys instead of the `keys` helper. If you need something the helper lacks, add it there
- **Hidden dependencies through unrelated modules.** If a status bar imports a colour from the help table, the colour belongs in a shared module. Likewise, when two features use the same code (the live page and summaries both reading tool calls, say), it moves to a neutral module rather than one feature importing the other's internals. Don't create import cycles
- **A mode flag branched on throughout a function.** If `mode === "title"` (or an options flag like `{ tasks: true }`) changes several steps, give each mode its own function or a strategy object. A flag that changes two unrelated things at once becomes two functions
- **Two hand-written copies of the same state machine.** Parallel queues, pending sets and error maps for two job kinds become one small generic structure used twice
- **A boolean result that callers decode.** If callers compare error strings to learn what happened, return a result type (`{ status: "saved" | "skipped" | "failed" }`)
- **Walls of positional arguments.** A 7-parameter function or a 13-value positional SQL call invites ordering bugs. Pass an object and use named SQL parameters (`$id`); type prepared statements so callers don't need `as` casts
- **Side effects hidden in defaults or unrelated calls.** No DB query in a default parameter, and no maintenance step (like rebuilding derived data) buried inside a scan. Call it by name from the caller
- **Bare string kinds repeated in TS and SQL.** Message kinds, `closed_by` values and similar live in one union with named groups, and SQL lists are built from them
- **One concept with many names, or one name with many meanings.** Pick one domain noun and use it in tables, types, files and docs. Two helpers called `clip` or `oneLine` must do the same thing, so put them in one shared module
- **The same UI rule written per view, drifting apart.** "Is this block dim / still working / selected, which project is it" was answered separately in the calendar, month grid, list and live page, and the answers stopped matching. A rule about a domain object is one function in `lib/`; a view that needs a variant passes a named option. Before writing a condition inline, search for an existing helper (one existed and was re-implemented anyway)
- **Props that only pass through.** A component taking 20+ props, most of them handed straight to children, and the same props type re-declared by several views. Group related props into objects (`period`, `search`, `menu`), export one shared props type, and pass a domain object instead of ten values derived from it
- **A shared piece living in another component's file.** A tooltip used by three views was exported from one view's file; a general DOM hook was defined inside a component file. Shared components and hooks get their own files, and repeated hook patterns (ResizeObserver measuring, say) become one hook
- **Side effects during render or inside a state updater.** Render stays pure (no mutating a running variable across the loop; derive the list first), and URL writes or other effects don't run inside a `setState` updater, which React may call twice
- **Hand-kept copies of a list.** The menu's shortcut list copied the key map, and its comment went stale. Derive display lists from the source definition
- **Tests in the wrong file.** Each module's tests live in its own test file under `tests/`, mirroring `src/`, so moving a module moves its tests with it

## Refactoring

- A refactoring doesn't change behaviour. Keep it in its own commit, separate from feature or fix commits
- Make sure tests cover the code before you move it; add them first when they don't
- A move doesn't excuse missing JSDoc: every new export still gets one
