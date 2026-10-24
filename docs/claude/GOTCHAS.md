# GOTCHAS.md — traps, quirks, things already tried

Read before debugging. If something here already explains the symptom, don't re-derive it.
Add an entry the moment something wastes more than ~20 min — or the moment you find a trap that clearly
would. Blunt, symptom first. Record what was **tried and didn't work**, not just the answer.

> **Seeded 2026-08-17 from a full read of the old build** (`../LogIT`). Nothing here has been re-observed in
> the rebuild — there is no rebuild yet. These are traps that are structural to the problem, so they will
> reappear unless designed against. Provenance is marked per entry.

---

## Release pipeline (observed 2026-10-24)

- **`mac.identity: "-"` does NOT ad-hoc sign on electron-builder 24.13.3.** It is the obvious thing to
  reach for and it quietly does nothing useful: `findIdentity`
  (`app-builder-lib/out/codeSign/macCodeSign.js:256`) has no special case for `"-"`, so it searches the
  keychain for a certificate *named* `-`, fails to find one, and falls through to
  `macPackager.js:195`, which skips signing entirely and returns. The build still succeeds, so the
  symptom is a shipped app that macOS refuses rather than a failed build. Ad-hoc signing on this version
  needs a custom `mac.sign` hook. (The v27 docs describe `mac.sign.identity`, a different, nested option
  that does not exist here — don't plan against them.)
- **`npm ci` cannot run in this checkout at all.** It fails with
  `EPERM: operation not permitted, rmdir ...\node_modules\.bin` because the repo lives under OneDrive,
  which holds handles on files `npm ci` wants to delete first. Nothing is wrong with the lockfile. Use
  `npm install` locally; CI runners have no pre-existing `node_modules`, so `npm ci` is correct there and
  works. Don't "fix" the lockfile chasing this.
- **A version bump leaves `package-lock.json` behind.** Editing `version` in `package.json` by hand does
  not touch the lockfile, which keeps claiming the old version in two places. `npm install
  --package-lock-only` re-syncs it. Found 2026-10-24 with the lock still on 3.1.0 after the bump to 3.2.0.
- **`workflow_dispatch` only works for workflows that exist on the DEFAULT branch.** A new workflow on a
  feature branch cannot be triggered at all — not from the Actions tab, not with `gh workflow run --ref`.
  So a release workflow cannot be smoke-tested before it reaches `main`; plan for the first real run to
  be the one that counts, or merge a dispatch-only version first.
- **GitHub Action majors move much faster than the examples you remember.** On 2026-10-24
  `actions/checkout` and `actions/setup-node` were at **v7**, `upload-artifact` at **v7** and
  `download-artifact` at **v8** — while most documentation still shows `@v4`. Writing the version from
  memory is the commonest first-run failure. Check with
  `gh api repos/actions/<name>/releases/latest --jq .tag_name` before committing a workflow.

---

## Repo layout (observed 2026-10-23)

- **`CLAUDE.md` only works at the repo root.** Claude Code auto-loads it from the working directory and
  its parents at session start; a `CLAUDE.md` anywhere else is an ordinary file that gets read only if
  something happens to open it. So the rules file cannot be tidied into `docs/claude/` with the spec,
  UPDATES and GOTCHAS — move it and a new session starts with no project rules at all, silently, with
  no warning and nothing in the transcript to show it. The symptom is a session that ignores the hard
  invariants and writes 7,500-line solutions: it never saw §4. The three companion docs are safe to move
  because `CLAUDE.md` *tells* the session to read them by path, which is an on-demand read.
- **Citations in source are names, not paths** — `FUNCTIONAL_SPEC §6`, `CLAUDE.md §5.1`,
  `GOTCHAS "..."`. That is deliberate: it is what let the companion docs move on 2026-10-23 without
  touching ~40 files across `src/` and `tests/`. Don't "fix" them into relative paths; the repo map in
  CLAUDE.md §1 is what resolves a name to a location, and paths in 40 comments would need re-editing on
  the next move.

---

## Electron rebuild (observed 2026-08-17, first build session)

- **An inline comment in `.gitignore` silently disables the rule.** `#` only starts a comment at the
  *start* of a line; `build/    # regenerated` is read as a literal pattern and matches nothing, so
  the folder stays tracked while the file *looks* correct. Caught 2026-08-17 only by auditing
  `git ls-files` before a push — `git status` was clean and gave no hint. Verify any new rule with
  `git check-ignore -v <path>`, and remember that adding a rule never untracks an already-committed
  file (`git rm --cached` does).

- **Seen once, never reproduced: a popup rendered the page title + inline reset CSS as visible text
  above the panel** (user screenshot, packaged portable exe, scaled display). Under CDP the same build
  parsed standards-mode with an intact `<head>` in every window. Mechanism unknown. Mitigated
  structurally: index.html carries no inline `<style>` (reset is bundled via `src/renderer/reset.css`)
  and nothing before `<html>`, so a recurrence can render zero visible characters. If layout ever looks
  inexplicably shifted again, attach `--remote-debugging-port` and dump `document.compatMode` +
  `document.body.textContent` before touching CSS.
- **Force-killing the app orphans the open row** (end stays empty forever; restart deliberately leaves
  it — SPEC §5.1). Fine for the app, but a debugging session that `Stop-Process`es a live instance
  plants one in the user's real log. Quit through the app when possible; own up when not.
- **`Stop-Process LogIT` kills the USER'S running app, not just your test instance.** This is their
  daily driver — they may be mid-block while you verify a build. Before killing: read today's file and
  check for an open row (empty end). If one exists, someone is actively logging; leave it alone and
  verify against a scratch data root instead. Happened 2026-08-17 while checking the 3.0.3 icon —
  their session was INACTIVE at the time, so nothing was lost, but that was luck rather than care.

- **`Documents` is OneDrive-redirected on this machine.** `app.getPath('documents')` resolves to
  `C:\Users\<you>\OneDrive\Documents`, NOT `C:\Users\<you>\Documents`. Anything that verifies log files
  from outside the app must ask Electron (or check both); a hardcoded `~/Documents` path reports
  "no file" while the app is happily writing. Cost ~15 min of "why is the file missing".
- **Sandboxed preload scripts must be CommonJS.** With `"type": "module"` in package.json the preload
  file has to be `.cjs`, or every window silently gets no `window.logit` bridge.
- **The design handoff's logo icon paints its clock hands in `--accent-ink`,** which is invisible when
  the icon itself sits on an accent-ink square (the title-bar badge). The renderer's Icon takes a
  `--logo-hands` override for surfaces that need contrast; don't "fix" it back to the handoff version.
- **Verifying the running app: launch with `--remote-debugging-port=9223`** and drive/screenshot each
  window over CDP (`http://127.0.0.1:9223/json` lists targets; every LogIT window is a `page`). Two
  traps: `Runtime.evaluate` with `awaitPromise: true` on an expression that opens/closes BrowserWindows
  can stall the whole script (fire-and-forget with `awaitPromise: false` and re-poll state instead), and
  `element.click()` returns undefined, so `?.click() ?? 'NOT FOUND'` reports failure on success.

## Time and dates

- **Times are stored without a date, so every duration is a subtraction that can go negative.** `23:45 →
  00:10` is minus 1,415 minutes. Every place that computes a duration must clamp at zero *and* the display
  layer must treat "start later than now" as "started yesterday". Old build: handled in some places, not
  all — four separate copies of the same subtraction, which is exactly why the spec says compute it once.
- **`end.replace(day=start.day + 1)` is not "tomorrow".** It throws on the 31st of a month and silently
  lies across month boundaries. The old build shipped this in its analytics date-range walk and it took a
  refactor to find. Always add a one-day delta to the date object; never arithmetic on the day field.
- **A day's file is chosen at the moment of writing, not when the block started.** A block open across
  midnight has its row in yesterday's file and gets closed there. Don't try to split it across two files —
  the spec deliberately doesn't.
- **Focus end times in the past must be rejected at validation, not at timer-arm time.** The old build
  computed a negative delay, printed a warning to stdout nobody reads, and left the session "running" with
  no timer. It never ended.

## The open row

- **"The open row" is not "the last row."** They're the same only if nothing else appended afterwards.
  Old build, verified in code: the manual-entry pane appends straight to today's file, so back-filling an
  entry while a block is open puts a *closed* row after the *open* one. From then on the last-row lookup
  returns the manual row — the open row can never be closed, and the dashboard flips to its idle look while
  a block is genuinely open. **Find the open row by scanning for an empty end time, not by taking the last
  line.** This is the single nastiest bug in the old design.
- **Rewriting the whole file to patch one row is how a day's data gets lost.** The old build re-read all
  rows, mutated the last, and rewrote the file in place; an interruption or a lock arriving mid-write
  truncates the day. Write to a temp file and swap, or append-only.
- **Deleting the open row is a real operation** (Skip, engagement timeout, exit-Skip). It removes the last
  line. It is the *only* destructive operation in the app — everything else is append or patch.

## Files, locking, encoding

- **The log file will be open in Excel.** That's the normal case, not the exotic one — the user opens their
  own logs. Writes must retry a few times with a short backoff, then surface a real error with the user's
  text echoed back. A save that fails silently is the worst outcome in the whole app.
- **On Windows, careless CSV writing doubles the line endings.** Writing `\r\n` through a text stream that
  is itself translating `\n` gives `\r\r\n`, and every second row reads as blank afterwards. Whatever the
  stack, open log files in the mode that disables newline translation and let the CSV layer emit `\r\n`.
- **Quoting is not optional.** Notes contain commas and quotes constantly ("figuring out what a CV is cuz
  this posting requires ""other""?" is a real row from the user's log). RFC 4180 both ways — writing and
  reading.
- **A missing file is a normal state, not an error.** Days with no entries have no file. Every rollup walks
  dates and must treat absent files as zero, not skip them (skipping shifts the chart) and not raise.

## Timers

- **A popup's countdown can fire after the popup is gone.** Old build symptom: closing a check-in and then
  seeing a timeout row appear in the log a few seconds later. The countdown must be stopped in the popup's
  teardown path, not only in the button handlers, because dismissal has several routes (button, window
  close, Esc, the app closing it after a successful save).
- **Restart the interval timer when the popup is *dealt with*, not when it appeared.** Otherwise a popup the
  user ignored for 55 s is followed by the next one 5 s later.
- **A 1 Hz UI tick left running on a hidden pane is a real leak.** Old build fixed this twice. Start it when
  the live element becomes visible, stop it when it hides *and* when the window closes.
- **The engagement timer is not the popup timer and must not be reset by it.** Popup timeouts are the
  evidence that nobody is there. Wiring "any timer event resets engagement" defeats the entire mechanism.

## State

- **Don't keep booleans alongside the state machine.** The old build had `logging_mode_active`,
  `focus_active`, `current_mode`, `logging_popup_open`, and `_suppress_popup` for what is really three
  states, and they could disagree. Every "why is it showing the wrong screen" bug traced back to this.
- **A strict state machine rejects self-transitions.** Old build: `transition_to(current_state)` raised.
  Handlers reached from more than one path (end-focus, error fallback, exit) must check before transitioning
  or be written so re-entry is legal. Decide which at design time.
- **Two popups must never coexist.** Every trigger path — interval fire, shortcut double-click, dashboard
  button, focus end — needs the same "is one already open?" guard. The old build had it in some paths only.

## UI behaviour

- **Closing the last window must not quit the app.** It is a background app with a floating shortcut; the
  default behaviour of most toolkits is the opposite and it will exit out from under the user.
- **The floating shortcut needs double-click, and drag must not trigger it.** A single-click activation
  fires constantly while repositioning it.
- **A shortcut positioned from screen geometry ends up off-screen** when the user unplugs a monitor. Clamp
  on every show, not just on creation.
- **Global theme switching leaks callbacks.** Any widget that registers for theme changes must unregister
  when it dies, or the next broadcast calls into a destroyed widget. Old build did this by hand in every
  class — a registry that holds weak references is the cheaper answer.

## Data and settings

- **Reading a colour writes to disk.** Colour assignment is lazy and persistent, so the first render of a
  new category name mutates and saves the settings file — from inside a paint path. It works, but know that
  it happens: a "read-only" chart render can touch the disk, and it will do it once per never-before-seen
  category name.
- **Categories in the log and categories in the library are different sets.** Free text is allowed, names
  get removed from the library, old files carry names that no longer exist. Never assume a row's category is
  in the library, and never assume a library entry appears in the log.
- **Legacy rows have `mode=inactive` and category `Break / Inactive`.** They still count as time and they
  will show up in analytics as a category. They must parse forever; they must never be written again.
- **A stored interval can be illegal.** Snap to the nearest allowed value on load and re-save, or the chip
  row renders with nothing selected and the user can't tell what the app is doing.

## Project mirror

- **A new `LogStore` is born with mirroring off, and nothing enforces otherwise.** `projectMirror`
  defaults `false` in the constructor and only flips on when something calls `setProjectMirror(true)`.
  Today that's two call sites — `main.js` at startup and `core.js`'s `logFormatChange` — and both apply
  to the one long-lived store the rest of the app shares. Any *other* `LogStore` instance quietly skips
  the setter and mirrors nothing, with no error anywhere: `mirrorToProject` just returns `MIRROR_SKIPPED`
  and moves on.
  **The live example:** `core.changeLogRoot` builds a throwaway `new LogStore(oldRoot)` purely to
  `deleteOpenRow` the carried-over block from the folder being left behind. It never gets
  `setProjectMirror` called on it. Safe today only because `deleteOpenRow` never mirrors anything — the
  code doesn't mark that as deliberate, so it reads like an oversight, not a guarantee. If a future edit
  ever had that instance write a *completed* row instead, the mirror would no-op silently.
  **The rule:** any new `LogStore` that can write a completed row (append or update-open-row) must be
  handed `setProjectMirror` from the same setting `main.js` uses, or its mirror writes vanish with
  nothing to notice.

## Testing

- **The core must be testable without a display.** The old build's only test file covered the scheduler,
  precisely because it was the one piece with no UI dependency — and that test suite is the reason the
  scheduler survived the refactor intact. Keep the state machine, the timers, and the log layer injectable
  with a fake clock; the acceptance checklist in `FUNCTIONAL_SPEC.md §13` is mostly automatable if they are.
- **Verify against the file, not the screen.** "The dashboard shows one entry" is not evidence. Open the
  day's file and read the line.
