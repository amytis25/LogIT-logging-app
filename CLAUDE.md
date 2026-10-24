# CLAUDE.md — LogIT rebuild (repo root)

Project context and rules for Claude Code. Read this **and** `docs/claude/FUNCTIONAL_SPEC.md` before writing anything.
This file owns *how* we work here; the spec owns *what* the app does. They do not repeat each other.

---

## 0. What LogIT is (one paragraph)

A single-user, local-only desktop time logger that runs all day in the background and periodically asks
**"what were you just doing?"** The answer is appended to a plain-text daily log the user owns outright — no
account, no cloud, no database, ever. Three ways time gets recorded: **interval check-ins** (the default
loop), **focus sessions** (declared deep work with an end time, check-ins suspended), and **manual entries**
(retroactive back-fill on any date). Plus read-only analytics and two small library editors. The user is the
only user, uses it daily, and will keep using the log files long after the code changes.

---

## 1. Repo map — where things live

```
/                        ← you are here (the rebuild)
  CLAUDE.md              this file: rules, architecture, style, do/don't. The only
                         Claude-facing file left at the top level, because Claude Code
                         auto-loads it from the working directory — move it and nothing
                         reads it. Everything else for Claude lives in docs/claude/.
  README.md              the human-facing project page: install, design notes, layout
  .github/               release automation only — workflows/release.yml builds all three
                         platforms and assembles a DRAFT release; release-notes-template.md
                         is the body it renders. See §8 for why CI exists here at all.

  docs/claude/           written for Claude, read on demand (not auto-loaded)
    FUNCTIONAL_SPEC.md   THE SPEC — every behaviour, ASM charts, event→effect tables,
                         acceptance checklist. Source of truth for what to build.
    UPDATES.md           decision log, newest on top — the "what's true now" file
    GOTCHAS.md           traps, quirks, things already tried. Read before debugging.
  docs/PLAN.md           the original build plan, kept as history
  docs/superpowers/      per-feature design + implementation plans, dated
  docs/images/           screenshots the README embeds

  src/main/              Electron main process. No UI imports anywhere in here.
    core/                core.js (the one state machine) + scheduler.js (the timers)
    log/                 log_store.js (the only thing that builds a path), csv.js,
                         project_file.js (the pure half of the project mirror)
    settings/            settings_store.js
    main.js              entry: picks the data root, wires the layers together
    windows.js           window creation; ipc.js, queries.js  the renderer's surface
  src/shared/            constants.js, derive.js — imported from both sides
  src/preload/           preload.cjs, the IPC bridge
  src/renderer/          React: shell, four panes, popups, shortcut, widgets, theme
  tests/                 node:test suites: core, log_store, project_log, project_file,
                         settings_derive. `npm test` runs them headless.
  scripts/               make-icon.mjs — regenerates build/icon.png and build/icon.ico

  design_handoff/        visual design reference (HTML/JSX prototypes, screenshots).
                         READ-ONLY reference for look & layout. Its src/data.jsx is MOCK
                         DATA — never a behaviour source. Behaviour comes from the spec.

../LogIT/                THE OLD BUILD — read-only reference, not a base to edit.
                         Superseded behaviour is catalogued in FUNCTIONAL_SPEC Appendix B.
```

**Citations in source name the file, not its path** — `FUNCTIONAL_SPEC §6`, `CLAUDE.md §5.1`,
`GOTCHAS "end.replace(...) is not tomorrow"`. They stay correct wherever these files sit, and this
map is how you turn one into a path. Don't rewrite them into paths; that is a 40-file diff for nothing.

---

## 2. Ground-truth precedence

When sources disagree, trust in this order:

**UPDATES.md newest entry → FUNCTIONAL_SPEC.md → this file → GOTCHAS.md → older UPDATES entries →
design_handoff → the old build.**

The old build is **last** on purpose: it is where the superseded behaviour lives. If the code you're writing
contradicts the spec, the spec wins — unless the user has decided otherwise, in which case fix the spec and
record it in UPDATES.md **in the same change**. Never leave the spec lying.

---

## 3. The stack is NOT chosen yet

The spec is deliberately implementation-independent. Do **not** pick a language, UI toolkit, or test
framework silently as a side effect of writing code.

- When the choice is made, it gets an UPDATES.md entry, a `## Stack` section added to this file, and only
  then does code appear.
- Until then: design work, spec work, and plans are fair game; source files are not.
- The old build's stack is not automatically the new one. It is one option among several, with the advantage
  of known-working and the disadvantage of being what we are walking away from.

## Stack (chosen 2026-08-17 — see UPDATES.md entry for rationale)

- **Electron** (main process owns log/settings/core; multi-window UI). App is a background app:
  closing the last window must not quit it.
- **React 18 + Vite** for the renderer only. One bundle, window kind via query param.
- **Plain JavaScript (ESM) + JSDoc contract blocks.** No TypeScript.
- **`node:test`** for the headless suites (log, settings, derive, core). `npm test` runs them.
- **electron-builder** for packaging. `npm run dist` → Windows exe here; same command on a Mac → dmg.
- **Default data root: `Documents\LogIT\`**, injected into the log and settings layers by
  `src/main/main.js`. Nothing else may know it. `settings.json` always lives there; **`AppLog\`
  follows the user's `logRoot` setting** (dashboard field, added 2026-08-17) and may live anywhere.
- Layout: `src/main/` (core, log, settings, windows — no UI imports), `src/shared/` (constants,
  derived numbers — importable from both sides), `src/preload/`, `src/renderer/` (React), `tests/`.

---

## 4. Hard invariants — hold everywhere

These outrank convenience, cleanliness, and any refactor. Breaking one is a bug, not a trade-off.

1. **The log file format is frozen.** Six columns, `HH:MM`, empty fields as literal empty strings, RFC 4180
   quoting, UTF-8. Years of the user's real data are in that format and must keep parsing.
   Exact contract: `FUNCTIONAL_SPEC.md §3.1`. **A change here is out of scope — say no.**
2. **At most one open row exists at any time**, and `ACTIVE ⟺ an open row exists`. Every operation preserves
   this. If you can construct a sequence that opens two, that's the bug.
3. **A row's kind (`normal` / `focus` / `manual`) is set when the row is opened and never modified.**
4. **Never lose an entry silently.** A failed write keeps the window open, keeps the user's typed text on
   screen, and says plainly that nothing was saved. No "probably fine", no toast claiming success.
5. **Never rewrite history.** Removing a category doesn't touch logged rows. The only destructive operation
   in the whole app is deleting the *open* row (Skip / engagement timeout / exit-Skip).
6. **Popups never stack.** If one is open, further triggers are no-ops.
7. **Timeouts are not engagement.** A popup timing out must never postpone the engagement timer — it is the
   evidence nobody is there.

---

## 5. Architecture — hold this shape

```
  log layer          read / append / close / delete rows; owns the folder layout and
                     file locking. THE ONLY THING THAT KNOWS WHERE FILES LIVE.
  settings layer     load, save-on-change, interval snapping, colour assignment
  core               state machine + scheduler + the four timers. NO UI, NO CLOCK CALLS
                     it can't be handed a fake for. Testable headless.
  ─────────────────  ← everything above is verifiable without drawing a pixel
  surfaces           shell + panes, three popups, floating shortcut, toast
```

**Five rules:**

1. **Every read and write goes through the log layer.** No pane, chart, or editor builds a file path. The
   old build reconstructed paths in four separate places and they drifted — see GOTCHAS.
2. **The core never imports a UI type.** UI observes the core; the core does not know it exists.
3. **Derived numbers are computed once, in one place** (duration, elapsed, countdown, rollups —
   `FUNCTIONAL_SPEC.md §9`). Four screens showing four slightly different hour totals is the failure this
   prevents.
4. **The core is buildable and testable before any window exists.** If the state machine is right, no
   surface can corrupt the log. Build order: `FUNCTIONAL_SPEC.md Appendix A`.
5. **One state machine.** Not a set of booleans that happen to agree. The old build had five flags for three
   states and they could disagree.

---

## 6. Code style & conventions — mandatory

Language-neutral; apply the spirit in whatever we end up writing.

### 6.1 File header block (every source file)
Filename · Description (the problem it solves) · Inputs · Outputs · Created. Every file.

### 6.2 Function comment block (before every function)
Description + Inputs + Outputs. Use `none` where there are none. Don't maintain two copies of one contract —
if an interface file documents it, the implementation may point at it rather than repeat it.

### 6.3 GPS (Good Programming Style) rules
- **Descriptive names.** `open_row_start_time`, not `t` or `data`.
- **Comment the algorithm, and comment *why*** — not what the code already says.
- **No hard-coded literals.** Timer periods, the allowed interval set, the colour palette, column names,
  folder patterns: all named constants in one place. A raw `60` or `"HH:MM"` in a function body is a bug.
- **No repeated code.** A fragment used twice becomes a function.
- **One purpose per function.** If describing it needs "and", split it.
- **One return per function** (except recursion). *Carve-out:* an early exit on a validation or write
  failure, where single-return would obscure the abort.
- **Minimize `break` / `continue`** — structure the condition instead.
- **Label all output.** Logged and printed values carry their name and unit.

### 6.4 Project-specific
- **Spec references in code** where a block implements a stated rule (`// SPEC §7 FOCUS_INTERRUPT timeout`).
- **Every timer names its trigger and its reset conditions** at its definition.
- **Mark placeholders `[P]`** until implemented for real; `[V]` once verified against the acceptance
  checklist. Never leave an unmarked stub that looks finished.

### 6.5 Minimalism — this is why we are rebuilding
The old build reached 7,500 lines for an app that appends rows to a text file. Do not do that again.

- **Smallest change that fixes it.** No layers, wrappers, or config flags unasked.
- **No speculative code.** No abstraction for a case that doesn't exist yet. No "we might want to…".
- **No dead code, ever.** Not commented out, not kept "just in case", not an `archive/` folder. It's in git.
  The old build shipped three dead modules and two duplicated classes.
- **If a file grows past its one job, split it.** If a file is *only* re-exporting, delete it.
- **When debugging, fix the actual cause.** If two attempts don't fix it, stop, re-read the problem, and
  state the cause before changing more code.
- **Deleting code is a valid change.** Preferred, usually.

---

## 7. Companion files — keep current

Neither is optional bookkeeping; they are how the next session knows what this one learned.

- **`docs/claude/UPDATES.md`** — append an entry whenever a decision changes: what changed, why, what it invalidates,
  what's still open and who owns it. Newest on top. Template at the bottom of the file. If you finish a
  phase, change an approach, or the user overrules something — that's an entry.
- **`docs/claude/GOTCHAS.md`** — add an entry the moment something wastes more than ~20 minutes, *or* the moment you
  discover a trap that looks like it would. Blunt, symptom-first, so the next reader recognises it before
  re-deriving it. Includes what was **tried and didn't work**, not just the answer.

If you find yourself explaining something in chat that the next session would need, it belongs in one of
these two files instead.

---

## 8. How the user works — match this

- **Default to pushback.** Honesty over reassurance. If a plan is bad, say so. If scope is creeping, name
  it. If they're rationalising rework, point at it.
- **Phased plans with verification gates.** Big changes break into phases; each ends with a stop-and-check
  before the next begins. Don't run ahead of the gate.
- **Concrete acceptance criteria.** "It works" is not one. "Skip removes the open row and the file has one
  fewer line" is.
- **Never bundle a structural refactor with a behaviour change** in the same session. Same rule that made
  the old build's history readable.
- **Ask when ambiguous; don't guess and bury it.** A marked stub beats an invented answer.
- **Diagrams are ASCII**, not images.
- **Don't optimize for performance.** Single-user desktop app appending lines to a text file. Nothing here
  is slow.
- **Don't suggest:** type-checker adoption, logging frameworks, async, multiprocessing, DI
  frameworks, Docker, alternative DB backends, cloud anything. All real things, none right for this.
- **CI/CD was on that list until 2026-10-24, and is now carved out for exactly one thing:**
  `.github/workflows/release.yml`, which builds the macOS and Linux artifacts. That carve-out exists
  because the audience changed from one person to a class, and because two of the three platforms
  **cannot be built on this machine at all** — electron-builder cannot cross-compile a `.dmg` from
  Windows. Nothing else belongs in CI. No per-push linting, no coverage, no PR gates, no test
  matrix: suggesting those is still wrong, and `npm test` running inside the release build is the
  only automation the tests get.
- **Release work happens on a branch named for the version** (`3.2.0`); the tag carries a `v`
  (`v3.2.0`) so `git checkout 3.2.0` is never ambiguous. **Nothing machine-readable depends on the
  branch name** — `package.json`'s `version` is the single source of truth for the tag, all four
  artifact filenames, and the build-or-skip decision, so they cannot drift apart. Landing a new
  version on `main` is what cuts a release; landing anything else costs nothing.

---

## 9. Claude Code: do / don't

**Do**
- Read `docs/claude/FUNCTIONAL_SPEC.md` before implementing any behaviour — including "obvious" ones. The five popup
  contexts differ in ways that are not guessable.
- Build the log layer, settings, and core state machine before any UI (§5.4).
- Route every file read/write through the log layer (§5.1).
- Follow §6 on every file you touch or create.
- Give full working files when fixing, not fragments.
- Update `docs/claude/UPDATES.md` on a decision, `docs/claude/GOTCHAS.md` on a trap — in the same
  change, not "later".
- Say plainly when something is unverified. "Not run yet" is an acceptable status; a claim that it passes is
  not, unless it ran.

**Don't**
- Change the log file format, the column set, the time format, or the empty-field convention. Out of scope —
  say no (§4.1).
- Copy the old build's structure across because it's there. It's reference, not a base (§2).
- Treat `design_handoff/src/data.jsx` as behaviour. It is mock data for a visual prototype.
- Add a second path that writes rows, a second place that builds file paths, or a second copy of the
  duration maths.
- Introduce a state flag alongside the state machine.
- Add features the spec's §12 lists as non-goals — sync, accounts, export, OS idle detection, tray menus,
  extra themes, extra intervals.
- Leave dead code, commented-out blocks, or an `archive/` folder behind.
- Claim a phase is done without walking its part of the acceptance checklist (`FUNCTIONAL_SPEC.md §13`).

---

## 10. What is committed

Source, spec, and context are tracked; anything a tool regenerates is not.

- **Tracked on purpose:** `CLAUDE.md` and `docs/` (the spec, UPDATES, GOTCHAS, plans), source, tests.
  They are the context a collaborator needs when they open this folder in Claude Code — never ignore them.
- **Never committed:** `.claude/` (machine-local state), build/cache output, and — most importantly —
  **`AppLog/` and the settings file.** That is the user's real personal data and it does not belong in git.
- If a file you expect to commit isn't showing up, check why it's ignored before editing the ignore file.
