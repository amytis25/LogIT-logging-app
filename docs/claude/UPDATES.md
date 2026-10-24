# UPDATES.md — decision log (repo root)

Reverse-chronological. Each entry = what changed, why, and what it invalidates. Newest on top.
This is the "what's true now" file; traps and dead ends live in `GOTCHAS.md`.

---

## 2026-10-24 (newest) — CI builds all three platforms into a draft release (v3.2.0)

**Change.** `.github/workflows/release.yml` builds Windows, macOS and Linux on their own runners when a
new version lands on `main`, and assembles the four artifacts into a **draft** GitHub release. Publishing
stays a manual click. Design: `docs/superpowers/specs/2026-10-24-release-pipeline-design.md`; plan:
`docs/superpowers/plans/2026-10-24-release-pipeline.md`.

**Why CI exists in a project whose §8 said not to suggest it.** Two reasons, both new. The audience
changed from one person to a class of engineering students, and **two of the three platforms cannot be
built on this machine at all** — electron-builder cannot cross-compile a `.dmg` from Windows, and its own
docs state that macOS code signing works only on macOS. The carve-out is written into `CLAUDE.md` §8 and
is deliberately narrow: the release path only. No per-push linting, no coverage, no PR gates.

**Four decisions worth recording:**

- **The gate reads *published* releases, not all releases.** A published release for the version means
  skip, which is what stops an ordinary documentation commit on `main` cutting a release — this repo took
  five doc-only commits to `main` in a single session, each of which would have produced one. An
  unpublished **draft** means build and replace it, because a draft is the author's working copy and the
  phased delivery rebuilds the same version repeatedly. `scripts/release-gate.mjs` is pure and the four
  cases are proven by `npm test`, not by pushing a commit and waiting four minutes.
- **Nothing machine-readable depends on the branch name.** The original design had the workflow fail when
  the branch name disagreed with `package.json`. That check cannot exist: work lands here by fast-forward
  merge, which leaves no record of the source branch, so enforcing it would have silently required pull
  requests. The tag, the four filenames and the gate all derive from `package.json`'s `version` instead,
  so they cannot disagree with one another.
- **Assembly requires all three builds.** A draft missing its macOS file could be published without the
  absence being noticed; one red run cannot be. There is no `continue-on-error` anywhere.
- **The `.dmg` background is generated, not drawn.** `scripts/make-icon.mjs` already rasterises the logo
  with zero dependencies, so it now also emits the window background. The cost: **no instruction text
  inside the window** — glyph rendering needs a font, which means a dependency or a hand-maintained
  binary, and both defeat the reason generation was chosen. The words moved to `dmg.title`.

**Accepted limits.** The macOS and Linux artifacts have never been launched by anyone at the time of
writing; the release notes say so per-platform, in as many words. Linux is verifiable eventually — a VM
exists — but not this cycle. The app ships unsigned on every platform: `mac.identity: "-"` does **not**
produce an ad-hoc signature on electron-builder 24 (see GOTCHAS), so ad-hoc would need a custom `sign`
hook, and that is deliberately deferred until a real Mac shows it is needed.

**Open.**
- **The wizard installer's upgrade behaviour is unverified. Owner: user.** Switching NSIS from one-click
  to a wizard can leave two installations; installing 3.2.0 over the existing 3.1.0 is the check.
- **No CI run has happened yet. Owner: user.** `workflow_dispatch` only works for workflows on the default
  branch, so the workflow must reach `main` before it can be exercised at all.
- **macOS verification is outstanding. Owner: user**, via a friend's Apple Silicon laptop 3–5 days a week.
- **The README still says macOS has "no prebuilt download".** Deliberately not changed yet — advertising
  downloads before the macOS check passes would recreate the anti-goal the design exists to prevent.

---

## 2026-10-23 — Claude's docs moved to `docs/claude/`; the repo map rewritten

**Change.** `FUNCTIONAL_SPEC.md`, `UPDATES.md` (this file) and `GOTCHAS.md` moved from the repo root to
`docs/claude/`. The top level now carries one Claude-facing file instead of four. `CLAUDE.md` §1's repo
map was rewritten, its six path-bearing references repointed, and the README's three links fixed.

**`CLAUDE.md` itself cannot move, and that is not a preference.** Claude Code auto-loads it from the
working directory at session start; anywhere else it is an ordinary file that only gets read if something
opens it. Moving it would mean sessions silently starting with no project rules — no warning, nothing in
the transcript. Recorded in `GOTCHAS.md` under "Repo layout", because the failure is invisible.

**Why `docs/claude/` rather than a top-level `claude-instructions/`.** The point was getting these off the
top level, and a new top-level folder only renames the clutter. `docs/` already held PLAN.md, the
superpowers plans and the README screenshots, so this nests under what exists.

**Source citations were deliberately left alone.** Roughly 40 comments across `src/` and `tests/` cite
these files by *name and section* — `FUNCTIONAL_SPEC §6`, `CLAUDE.md §5.1`, `GOTCHAS "end.replace(…) is
not tomorrow"`. Not one is a path, so all of them are still correct. Rewriting them would be a 40-file
diff that buys nothing, buries the move in noise, and would need redoing at the next reshuffle. The repo
map is what resolves a name to a location, and §1 now says so in as many words.

**Also fixed, since the map was being rewritten anyway.** §1 still ended with "Nothing else exists yet.
The source tree, the stack, the test layout: all unchosen." That stopped being true on 2026-08-17 and
would have misled any new session that trusted it. The map now describes the real tree: `src/main`
(core, log, settings, windows, ipc), `src/shared`, `src/preload`, `src/renderer`, `tests/`, `scripts/`.

**Invalidates:** every root-level path of the form `FUNCTIONAL_SPEC.md`, `UPDATES.md` or `GOTCHAS.md`.
Older entries in this file and the dated plans under `docs/superpowers/` still show the old locations;
they are historical snapshots and were left as written. Bare section citations remain valid everywhere.

**Open.** The root `CLAUDE.md` could be thinned to a stub that `@`-imports the rules back out of
`docs/claude/`, leaving ~12 lines at the top level. Not done: it is exactly the re-export layer §6.5 says
to delete, traded for one file's worth of tidiness. **Owner: user**, if they want it regardless.

---

## 2026-10-23 — v3.1.0 is mainline; the macOS packaging instructions corrected

**Change.** `project-csv-logging` fast-forwarded onto `main` and pushed, so per-project CSVs (v3.1.0) are
the mainline build. 111 headless tests pass on that commit, and both Windows artefacts were rebuilt from
it: `release/LogIT Setup 3.1.0.exe` (installer) and `release/LogIT 3.1.0.exe` (portable), and both are
attached to the **v3.1.0** GitHub Release (tagged at the README commit, marked Latest) — so the README's
"grab the latest from Releases" now resolves to 3.1.0 rather than 3.0.4. The README's **macOS** section
was rewritten; nothing in `src/` changed.

**Why the macOS section needed fixing.** It claimed macOS blocks the first launch of the `.dmg` you just
built. The quarantine flag is set by whatever *downloads* a file, not by the build, so a disk image built
on the machine it runs on opens normally — the right-click → **Open** dance only starts mattering once the
file has travelled to another Mac. It also said nothing about architecture, which does matter: `npm run
dist` packages for the host arch only, so a Mac build yields `LogIT-3.1.0-arm64.dmg` or
`LogIT-3.1.0.dmg` depending on the machine, and one image for both needs `--mac --universal`.

**Added rather than invented:** Xcode's command-line tools as a soft prerequisite (packaging ad-hoc-signs
the app, which Apple Silicon requires), `CSC_IDENTITY_AUTO_DISCOVERY=false` as the escape hatch when a
keychain certificate derails the build, `xattr -dr com.apple.quarantine` as the alternative to the Finder
dance, and where a Mac's data lands — `~/Documents/LogIT/` for `settings.json`, `AppLog/` wherever **LOG
ROOT** points, project CSVs under `AppLog/Projects/<Category>/<Project>.csv`.

**Invalidates:** the old README claim that a self-built `.dmg` is blocked on first launch, and the
two-command macOS recipe that skipped both `npm test` and the architecture question.

**Open.** Nobody has launched the packaged Mac app yet — unchanged from 2026-08-17, and the honesty note
in the README still says so. **Owner: user.** First two things to check there: whether the floating
shortcut stays on top across Spaces and full-screen apps, and whether closing the last window leaves the
app running in the background.

---

## 2026-08-28 — optional per-project CSVs alongside the daily log (v3.1.0)

**Change.** A second, optional logging format. With `LOG FORMAT` set to `Daily + Project` on the dashboard,
every *completed* entry is also appended to `AppLog/Projects/<Category>/<Project>.csv` — four columns,
`date,start_time,end_time,additional_notes`, with the category and project carried by the folder and file
name. `FUNCTIONAL_SPEC.md` §3.1, §3.2, §8.2 and §13 updated.

**The daily log is always written, and there is no project-only mode.** A project CSV cannot hold an open
row — the project isn't known until the block *closes* — so switching daily writes off would mean relocating
the open block into a new state file, rewriting the `ACTIVE ⟺ one open row exists` invariant (CLAUDE.md
§4.2), and giving every pane a second read path. Roughly three times the work, to delete files the user
already keeps. The mirror is additive and is never read back by the app.

**Four decisions worth recording:**

- **One completeness predicate, not per-event special cases.** A row is mirrored exactly when
  `end`, `category`, and `project` are all non-empty. That single rule delivers every required behaviour on
  its own: open rows, timeout-closed rows (no details), skipped rows, and manual entries with a blank
  project all fall out as non-mirrored without a line of special-casing. It lives in two `LogStore` methods
  — `appendRow` and `updateOpenRow` — and nowhere else.
- **A mirror failure warns in the toast, never via `notifyError`.** `notifyError` calls `showShell()`, and
  the likeliest cause of a mirror failure is the user having that project's CSV open in Excel for hours —
  which would throw the dashboard on screen at *every* check-in, against the 2026-08-17 "only the shortcut
  is on screen" decision. Nothing is lost when a mirror fails (the daily log has the entry), so the toast is
  the proportionate channel; it replaces the "Logged" confirmation rather than joining it.
- **The two failure reasons get different sentences.** A write failure names a file that exists and may free
  up on its own; an unwritable name names something only the user can fix by renaming. Telling the user a
  nonexistent file "couldn't be updated" would be a plain lie, so `savedToastText` branches on the reason.
- **Names are sanitized at the path, not restricted at the keyboard.** Categories and projects stay free
  text everywhere and in the daily log; `\ / : * ? " < > |` become `-` only when a path is built, and
  reserved device names (`CON`, `COM1`, …) gain a `_` prefix **with or without an extension** — `CON.notes`
  is reserved on Windows too. Two names that sanitize alike share a file — accepted, versus a persisted
  name→filename map in settings.

**Accepted limits.** A project CSV has no `mode` column, so it cannot distinguish focus from normal work;
analytics keep reading daily files. There is no backfill and no reconciliation — toggle the setting or lose
one mirror write to a locked file, and that project file is permanently missing those rows with nothing that
notices. The daily log is complete in every case.

**Invalidates:** nothing. The frozen six-column daily format, the folder tree, and every read path are
unchanged.

---

## 2026-08-17 — the log folder is user-choosable from the dashboard (v3.0.4)

**Change.** A `LOG FOLDER` field at the bottom of both dashboard looks shows where daily files are
written and opens the OS folder picker to move them. `FUNCTIONAL_SPEC.md §3.2` and `§8.2` updated.

**The bootstrap problem and how it's solved.** The data root used to hold both `AppLog/` and
`settings.json`, so "where do logs live?" could not itself be a setting — the app would have to read
settings to find settings. Resolved by splitting the two: **settings.json always lives at the default
root** (`Documents\LogIT`), and `logRoot` inside it points `AppLog/` anywhere. `SettingsStore` gained
`defaultRoot` + a `logRoot` getter; `LogStore` gained `setRoot()`. The log layer is still the only
thing that knows a path (CLAUDE.md §5.1) — `main.js` reads the setting and hands it over, nothing else.

**Three decisions worth recording:**

- **Existing logs are not moved.** Relocating years of the user's files on a settings click is the
  kind of destructive convenience §4.5 forbids, and a half-completed move across a locked file would
  be unrecoverable. New writes go to the new folder; the field's hint says plainly that history stays
  put and the old `AppLog/` can be moved by hand.
- **An open block is carried across.** Without this, changing folders mid-block would strand the open
  row in the old folder where `updateOpenRow` could never reach it — the block would be unclosable and
  `ACTIVE ⟺ one open row` (§4.2) would break. The row is appended to the new folder first and only
  then deleted from the old, so a failure leaves the block safe rather than lost. If the delete fails
  the user is told about the stray line instead of it being hidden.
- **Writability is probed before adopting** (create `AppLog/`, round-trip a probe file). A bad folder
  is refused up front rather than surfacing as a failed save at the next check-in.

**Invalidates:** CLAUDE.md's "Data root: `Documents\LogIT\` (`AppLog\` + `settings.json`)" — that is
now the *default*, and `AppLog/` may live elsewhere. Settings location is unchanged.

---

## 2026-08-17 — shortcut halved; real app icon on the exe and taskbar (v3.0.3)

**Change.**

- **Floating shortcut is half size:** `SHORTCUT_SIZE` 84 → 42 (window 108 → 56). The ring gap and
  stroke, corner radius, focus/pause badges, and drop shadow now all derive from that one constant, so
  the size is changeable in one place without anything drifting out of proportion. Previously the
  radius (21) and badge sizes were magic numbers that would not have survived a resize.
  `FUNCTIONAL_SPEC.md §8.9` updated.
- **The app icon is now the app's own logo mark.** `scripts/make-icon.mjs` rasterises the exact
  geometry of `Icon name="logo"` (sage rounded square + cream clock hand) to `build/icon.png` (512)
  and `build/icon.ico` (16/32/48/64/128/256), dependency-free — shapes are supersampled and the PNG
  is encoded by hand with zlib. Wired into electron-builder (`win.icon`, NSIS installer/uninstaller
  icons, `mac.icon`) and into every `BrowserWindow` so the taskbar matches. `npm run icons` runs
  automatically as part of `start` and `dist`, so the artwork can never drift from the in-app logo.

**Why generate rather than commit artwork:** the icon has exactly one definition (the logo geometry).
Hand-exporting a PNG would create a second copy that silently goes stale. `build/` is gitignored per
CLAUDE.md §10 (regenerated output is not committed).

**Invalidates:** §8.9's 84 px figure; the previous iconless build (executables showed Electron's
default icon).

---

## 2026-08-17 — the X closes a window; only Quit ends the app (v3.0.2)

**Change.** User decision: the title-bar **X** on the shell now hides that window and leaves LogIT
running (timers, open row, and the floating shortcut all untouched) — the shortcut summons it back.
**Quit** in the sidebar is the only in-app way out, still following the §5.1 exit rules (including the
`EXIT_PROMPT` popup when a row is open); Cmd+Q and system shutdown also still quit. Previously the
shell's X — and the native close route (Alt+F4) — sent a quit request. Popup X buttons already worked
this way (dismiss, per context), so behaviour is now uniform: **X closes a pane, never the program.**

`FUNCTIONAL_SPEC.md §5.1`, `§7` (dashboard triggers) and `§8.1` updated in the same change.

**Invalidates:** §5.1's "QUIT REQUESTED (sidebar Quit, or window close)" — window close is no longer a
quit trigger.

**Note.** The one window with no X is the `FOCUS_END` check-in, which by §4 must be acted on. That is
unchanged and deliberate.

---

## 2026-08-17 — second pass on shell visibility: dashboard is strictly button-only

**Change.** User re-affirmed and tightened the rule: while the interval timer runs, the ONLY thing on
screen is the floating shortcut. Esc and the X button on a check-in now dismiss without opening
anything (they used to route to "View dashboard" per the original §8.3). The shell appears only via
the explicit `View dashboard` buttons, `Submit and view dashboard`, `Cancel exit`, a save error, or
launch. Spec §8.3 updated in the same change. Version bumped to **3.0.1** so builds are
distinguishable — the round-1 fix and this one are invisible to anyone still running the identically
named 3.0.0 portable exe, which is the likely explanation for "it still pops up after an entry"
(auto-restore-after-popup only ever existed in the first 3.0.0 build).

**Invalidates:** §8.3's "Esc behaves as View dashboard".

**Open:** user confirms against `LogIT 3.0.1.exe`.

---

## 2026-08-17 — first user feedback: shell is on-demand; head-text leak hardened

**Change.**

- **The shell no longer sticks around once logging starts.** User decision after first real use:
  pressing Start logging (or Begin focus) hides the main window, and closing a popup no longer
  auto-restores it. The dashboard returns only via `View dashboard`, `Submit and view dashboard`,
  a save error, a cancelled quit, or app launch; the shortcut is the way back in.
  `FUNCTIONAL_SPEC.md §8.1` and the §7 rows are updated in this same change.
- **The `<head>` render leak is hardened away.** The user's screenshot showed the popup rendering the
  page title + reset CSS as visible text above the panel. Not reproducible under CDP inspection of the
  same packaged build (all windows parse standards-mode with an intact head), so the mechanism is
  unconfirmed — instead the possibility is removed: index.html now carries no inline `<style>` (reset
  lives in `src/renderer/reset.css`, bundled) and no markup before `<html>`. Worst case is now zero
  visible characters.
- **Countdown ring is DPI-proof:** the seconds label sits in flex flow with the ring absolutely
  positioned behind it, so display scaling can't separate them (user runs a scaled display; CDP
  screenshots render at logical resolution and hid this).

**Invalidates:** the §8.1 "re-shows when the popup closes" behaviour and the previous entry's claim
that the shell/popup hand-off was final.

**Open.** If the head-text block ever reappears (now it could only be blank space), grab it with
`--remote-debugging-port` per GOTCHAS and record the DOM; the root cause was never observed directly.

---

## 2026-08-17 — end-to-end build complete; Windows executables produced

**Change.** The full app exists and is packaged. All five phases of `docs/PLAN.md` are done:

- **Verified by automated tests (60 passing, `npm test`):** the frozen CSV contract both ways (quotes,
  commas, newlines, CRLF, literal empties), both folder layouts, open-row-by-empty-end scan, atomic
  rewrite + delete, locked-file retry; settings snapping / colour stability / library growth; every
  derived-number rule in SPEC §9; and the whole state machine — every row of the §7 event→effect table,
  all five check-in contexts, focus begin/end/interrupt/midnight-crossing, engagement (timeouts do NOT
  postpone it; focus suspends it; PAUSED resumes on user action), never-stack, restart-on-dealt-with,
  the §10 save-failure ladder (attempt counts, echo at 3, popup never closes), and all four quit paths.
- **Verified against the live app** (CDP-driven, results read from the actual files): start → check-in
  submit closes the row and opens a new one; libraries + colours grow and persist; Skip removes the open
  row; manual entry lands in a past date's file; toast fires; the shell, check-in popup, focus popup B,
  and shortcut render matching the design handoff (screenshots taken).
- **Packaged:** `release/LogIT Setup 3.0.0.exe` (installer) and `release/LogIT 3.0.0.exe` (portable),
  both launched and smoke-tested. Mac dmg builds from the same config by running `npm run dist` on a Mac.

**Not yet exercised by hand:** the interval popup appearing over other apps during a real workday, popup
timeout while genuinely away, engagement firing after a real hour, day rollover at midnight, and the
Excel-holds-the-file-locked banner flow (its logic is unit-tested; the real-Excel walk isn't). These are
the §13 checklist items that need a day of real use.

**Invalidates:** nothing; this completes the plan of record.

**Open.**
- **User: copy old `AppLog` into `Documents\LogIT\`** (note: Documents is OneDrive-redirected on this
  machine — the real path is `OneDrive\Documents\LogIT`). The legacy `CSVs/` layout is read in place.
- **User: walk FUNCTIONAL_SPEC §13 by hand** during a real day of use; file anything odd in GOTCHAS.
- **User (needs a Mac): run `npm run dist` on macOS** for the dmg.

---

## 2026-08-17 — stack chosen: Electron + React (plain JS); build begins

**Change.** The stack is decided and implementation starts, end to end, per the user's request to build
from planning through a runnable executable.

- **Runtime: Electron.** The app is a background multi-window desktop app (persistent shell, three
  always-on-top popups, a frameless floating shortcut, a toast) that must not quit when the last window
  closes, on Windows *and* macOS. Electron gives all of that first-class from one codebase.
- **Renderer: React 18 + Vite.** The design handoff is already React components; the visual layer ports
  near-verbatim. One renderer bundle serves every window (window kind chosen by query param).
- **Language: plain JavaScript (ESM) with JSDoc contract blocks** per CLAUDE.md §6.2. No TypeScript —
  consistent with §8's "don't suggest type-checker adoption".
- **Tests: `node:test`** (built-in runner, zero dependencies). Log layer, settings, derived numbers, and
  the whole state machine + scheduler run headless with an injected fake clock.
- **Packaging: electron-builder.** Windows NSIS installer + portable exe are built on this machine. The
  same config carries `mac` targets (dmg/zip); building the mac artifact requires running the same
  command on a Mac — cross-building mac binaries from Windows is not possible. Documented in README.
- **Data root: `Documents\LogIT\`** containing `AppLog\` and `settings.json`. Chosen over AppData because
  "the log is the product" — it must be visible, greppable, and survive reinstalls. The log layer and
  settings layer receive this root by injection; nothing else knows it.
- **Legacy data: read-both, no migration.** Both folder layouts (`.../MM-Month/YYYY-MM-DD.csv` and legacy
  `.../MM-Month/CSVs/YYYY-MM-DD.csv`) are read in place; the app never moves or rewrites old files. New
  writes always use the new layout. Spec §3.1 allows either approach; not touching user files is the
  deliberately conservative pick.

**Spec-vs-design conflicts resolved (spec wins per precedence §2):**

- Design shows a `5m` interval chip; spec allows exactly 10/15/20/30/45/60. Six chips built.
- Design labels EXIT_PROMPT "no countdown"; spec §7 gives it a 60 s timeout path. Timeout implemented and
  the ring shown, same as other contexts.
- Design's editor palette has 7 colours; spec §3.2 says a fixed palette of 8. Eight used.
- Design's start-logging popup copy says Skip "silences prompts for the next hour"; spec says Skip just
  restarts the interval. Copy corrected to match behaviour.
- §6 scheduler refinements (wall-clock alignment, early fire, grace period) deferred, as the spec allows.

**Invalidates:** the previous entry's "no source files until the stack is chosen" hold.

**Open.**
- **Old data move. Owner: user.** Real logs live in `../LogIT/AppLog` (legacy layout). Copy that `AppLog`
  folder into `Documents\LogIT\` and the rebuild reads it as-is. The app does not do this automatically.
- **Mac executable. Owner: user (needs a Mac).** `npm run dist` on macOS from this repo produces the dmg.

---

## 2026-08-17 — rebuild started; spec written; stack deliberately NOT chosen

**Change.** New folder, starting from behaviour rather than from the old code. Two things exist:

- `FUNCTIONAL_SPEC.md` — the complete behavioural spec, written from a full read of the old build plus the
  locked V2 logging design. Implementation-independent by design: no language, framework, or class names.
  Contains the state model, five ASM charts, the master event→effect table, per-surface detail, derived-number
  rules, edge cases, non-goals, and a hand-testable acceptance checklist.
- `design_handoff/` — the visual reference (v2.0 + v2.1 prototypes). Look and layout only.

**Why a rebuild rather than a refactor.** The old build reached ~7,500 lines for an app that appends rows to a
text file, with three dead modules, two duplicated classes, five boolean flags standing in for three states,
and four separate places that reconstructed log file paths. The logging behaviour it implements is also the
*superseded* one (see below), so a refactor would have meant rewriting the core anyway, inside a structure we
were leaving.

**The spec describes the V2 logging cycle, not the old build's.** Where they disagree, V2 wins. The full
side-by-side is `FUNCTIONAL_SPEC.md` Appendix B; the load-bearing differences:

- Details describe the block being **closed**, not the one being opened. New rows open empty.
- Skip **deletes** the open row; it no longer closes it in place.
- Timeout closes the open row with `window timed out` in notes. `mode=inactive` is never written again
  (old files still contain it and must keep parsing).
- The focus row is opened empty at session start and closed when the session actually ends — not written
  up-front with both times already filled.
- Five check-in contexts (INTERVAL / OFF_CYCLE / FOCUS_END / FOCUS_INTERRUPT / EXIT_PROMPT), each with
  different buttons and different timeout semantics.
- New: the 1-hour engagement timer, the start-logging popup, the exit prompt, required category+project.

**Invalidates:** the old build's `ARCHITECTURE.md` (a pre-refactor snapshot), its phase-status tables, and
any plan that treated v2.0 → v2.1 → v2.2 as sequential sessions on the old codebase. The v2.2 scheduler
refinements (wall-clock alignment, 30 s early fire, grace period) survive as rules in `FUNCTIONAL_SPEC.md §6`
and are safe to defer.

**Open.**
- **The stack is not chosen. Owner: user.** No source files until it is, and the choice gets its own entry
  here plus a `## Stack` section in `CLAUDE.md`. The old build's stack is one candidate, not the default.
- The log folder layout drops the `CVSs/` level (`AppLog/YYYY/MM-Month/YYYY-MM-DD.csv`). Whether the app
  migrates old files once on first launch or just reads both layouts is undecided — spec allows either.
- Nothing has been built or run. Every acceptance-checklist item is unverified.

---

## Template for new entries

```
## YYYY-MM-DD — <one-line summary>
**Change:** what.
**Why:** reason / what forced it.
**Invalidates:** what old code, doc, or assumption this kills.
**Open:** anything still unresolved + who owns it.
```
