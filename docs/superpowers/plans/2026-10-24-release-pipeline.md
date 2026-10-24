# Multi-platform Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bumping the version on a branch and landing it on `main` builds Windows, macOS and Linux artifacts in CI and assembles them into a single **draft** GitHub release that the author publishes by hand.

**Architecture:** The two pieces of real logic — deciding whether a version should build, and rendering the release notes — live in small pure ESM modules under `scripts/` with `node:test` coverage, because logic buried in workflow YAML cannot be tested. The YAML is orchestration only: three platform jobs that each build their own artifact, and one assembly job that runs only if all three succeeded. `package.json`'s `version` field is the single source of truth for the tag, all four filenames, and the build/skip decision, so they cannot disagree with one another.

**Tech Stack:** electron-builder 24.13.3, Electron 31.7.7, Node 18+, `node:test`, GitHub Actions (`windows-latest`, `macos-latest`, `ubuntu-latest`).

**Spec:** `docs/superpowers/specs/2026-10-24-release-pipeline-design.md`

## Global Constraints

Every task's requirements implicitly include these. Values are copied verbatim from the spec.

- **Target version for this release: `3.2.0`** (currently `3.1.0`). *My call:* minor bump, because two new platforms become available to users even though no app behaviour changes.
- **The four filenames are exact**, approved from a mockup:
  `LogIT-3.2.0-Windows-Installer.exe`, `LogIT-3.2.0-Windows-Portable.exe`, `LogIT-3.2.0-macOS.dmg`, `LogIT-3.2.0-Linux.AppImage`
- **Hyphens, never spaces, in artifact filenames.** GitHub rewrites spaces as dots on upload.
- **The release is always created as a draft.** Nothing in this plan may publish a release.
- **The gate consults published releases only.** A published release for the version means skip; a draft for the version means build and replace it.
- **Assembly requires all three platform builds to succeed.** A draft missing a platform must never exist.
- **No code signing, no notarisation, no auto-update.** `mac.identity: "-"` does *not* produce an ad-hoc signature on 24.13.3 — do not add it.
- **Branch `3.2.0`, tag `v3.2.0`.** Nothing machine-readable may depend on the branch name.
- **`build/` is gitignored.** Any job that packages must run `npm run icons` first.
- `CLAUDE.md` §6.1 and §6.2: every new source file gets a header block (Filename · Description · Inputs · Outputs · Created), and every function a Description/Inputs/Outputs block. §6.3: no hard-coded literals — named constants in one place. §6.5: no speculative code.

## Review Focus

Failure modes the spec implies that no task's happy path exercises, most likely first. Each has its test pinned to the task that owns the code.

1. **`build/` is gitignored, so a CI job that skips `npm run icons` has no icon and no `.dmg` background.** electron-builder may fall back to a default Electron icon rather than failing, shipping a release that looks like someone else's app. → Task 6, Step 3.
2. **A documentation-only commit lands on `main` after v3.2.0 is published.** Expected: the workflow exits without building. → Task 4, Step 1.
3. **One platform build fails.** Expected: no draft is assembled at all, rather than a draft quietly missing a platform. → Task 7, Step 5.
4. **The same version is re-run while its draft is still unpublished.** Expected: build, and replace the draft rather than duplicating or erroring. → Task 4, Step 1.
5. **A template placeholder survives into the published notes.** Expected: rendering fails loudly rather than a release page reading `{{VERSION}}`. → Task 5, Step 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | version, `artifactName` per target, nsis wizard flags, dmg window/contents, linux AppImage target |
| `scripts/make-icon.mjs` *(modify)* | also emits `build/dmg-background.png` and `@2x` |
| `scripts/release-gate.mjs` *(new)* | pure build/skip decision from a version + a release list |
| `scripts/render-release-notes.mjs` *(new)* | pure template → notes body, fails on unsubstituted placeholders |
| `.github/release-notes-template.md` *(new)* | the approved notes structure, with hand-edited prose blocks |
| `.github/workflows/release.yml` *(new)* | orchestration: gate, three platform builds, assembly |
| `tests/make_icon.test.js`, `tests/release_gate.test.js`, `tests/render_release_notes.test.js` *(new)* | |
| `CLAUDE.md`, `docs/claude/UPDATES.md`, `docs/claude/GOTCHAS.md`, `README.md` *(modify)* | bookkeeping required by §7 and §9 of the spec |

---

### Task 1: Artifact filenames and platform targets

**Files:**
- Modify: `package.json` (`version`, `build.win`, `build.mac`, `build.linux`, `build.nsis`, `build.portable`, `build.dmg`, `build.appImage`)

**Interfaces:**
- Consumes: nothing.
- Produces: the four exact filenames in Global Constraints. Every later task refers to these names, not to patterns.

- [ ] **Step 1: Bump `version` to `3.2.0`**

- [ ] **Step 2: Set `artifactName` on each target**

Four settings producing exactly the Global Constraints filenames, using electron-builder's `${productName}` and `${version}` macros plus literal platform words. Add `build.linux.target: ["AppImage"]` and set `build.mac.target` to `[{ "target": "dmg", "arch": "universal" }]` — `arch: "universal"` is a valid enum value on `TargetConfiguration`, so one `.dmg` covers Apple Silicon and Intel.

- [ ] **Step 3: Build locally and verify the two Windows names**

Run: `npm run dist`
Expected: `release/LogIT-3.2.0-Windows-Installer.exe` and `release/LogIT-3.2.0-Windows-Portable.exe` both exist. macOS and Linux names cannot be checked here and are verified in Task 6, Step 4.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "Name release artifacts for the person downloading them"
```

---

### Task 2: Wizard installer

**Files:**
- Modify: `package.json` (`build.nsis`)

**Interfaces:**
- Consumes: Task 1's `artifactName` for nsis.
- Produces: an installer that prompts rather than installing silently. Nothing depends on this.

- [ ] **Step 1: Replace the one-click NSIS block**

Set `oneClick: false`, `allowToChangeInstallationDirectory: true`, `createDesktopShortcut: true`, `createStartMenuShortcut: true`, `runAfterFinish: true`. Keep `perMachine: false` and both existing icon settings unchanged — `perMachine` is deliberately not touched, per spec §7.8.

- [ ] **Step 2: Build and run the installer**

Run: `npm run dist`, then launch `release/LogIT-3.2.0-Windows-Installer.exe`.
Expected: a wizard appears offering an install location and a desktop-shortcut choice, rather than a bare progress bar.

- [ ] **Step 3: Verify it upgrades over the existing 3.1.0 install**

This is the spec §7.8 acceptance check and it is manual, because it is a claim about the author's own machine. With one-click 3.1.0 already installed, complete the 3.2.0 wizard.
Expected: **one** Start-menu entry and **one** installation directory afterwards, not two. If two appear, add an "uninstall 3.1.0 first" line to the notes template in Task 5 and record the finding in `docs/claude/GOTCHAS.md`.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "Switch the Windows installer to a short wizard"
```

---

### Task 3: Generated .dmg background and window layout

**Files:**
- Modify: `scripts/make-icon.mjs`
- Modify: `package.json` (`build.dmg`)
- Test: `tests/make_icon.test.js` *(create)*

**Interfaces:**
- Consumes: the existing `renderRgba`, `encodePng`, `SAGE`, `CREAM` and `insideRoundRect` helpers already in `make-icon.mjs`.
- Produces: `build/dmg-background.png` (540×380) and `build/dmg-background@2x.png` (1080×760), via an exported `renderDmgBackground(width, height) -> Buffer` and the named constants `DMG_BACKGROUND_WIDTH` / `DMG_BACKGROUND_HEIGHT`.

**Deviation from the approved mockup:** the window carries the arrow and palette but **no instruction text** — glyph rendering needs a font, which means a dependency or a hand-maintained binary, both of which defeat the reason generation was chosen (spec §7.6). The words are recovered via `dmg.title`, which macOS shows in the window's title bar.

- [ ] **Step 1: Write the failing test**

```js
test('dmg background is a valid PNG at the documented size', () => {
  const png = renderDmgBackground(DMG_BACKGROUND_WIDTH, DMG_BACKGROUND_HEIGHT);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), DMG_BACKGROUND_WIDTH);
  assert.equal(png.readUInt32BE(20), DMG_BACKGROUND_HEIGHT);
});

test('the 2x background is exactly double', () => {
  const png = renderDmgBackground(DMG_BACKGROUND_WIDTH * 2, DMG_BACKGROUND_HEIGHT * 2);
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 760);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- tests/make_icon.test.js`
Expected: FAIL — `renderDmgBackground` is not exported.

- [ ] **Step 3: Implement `renderDmgBackground(width, height) -> Buffer` in `scripts/make-icon.mjs`**

Cream field, with a horizontally centred sage arrow — a rounded-rect shaft plus a triangular head — drawn between the two icon positions using the existing supersampled rasteriser. Add `DMG_BACKGROUND_WIDTH = 540` and `DMG_BACKGROUND_HEIGHT = 380` as named constants beside the existing `PNG_SIZE` (§6.3). Write both files at the bottom of the script alongside the existing icon writes, and log each with its name and pixel dimensions (§6.3 "label all output").

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, and the pre-existing 111 tests still pass.

- [ ] **Step 5: Configure the dmg window to match**

In `build.dmg`: `background: "build/dmg-background.png"`, `window: { width: 540, height: 380 }`, `iconSize: 96`, `title: "Drag LogIT to Applications"`, and a `contents` array placing the app at the left icon position and a `{ type: "link", path: "/Applications" }` at the right. **`x`/`y` are the centre of each icon at 1x and ignore the label**, so they must match the arrow endpoints in Step 3.

- [ ] **Step 6: Commit**

```bash
git add scripts/make-icon.mjs tests/make_icon.test.js package.json
git commit -m "Generate the dmg background from the logo script"
```

> **Verification deferred.** Whether the icons land on the arrow cannot be checked from Windows. It is Task 8's job, and being a few pixels out is expected on the first attempt.

---

### Task 4: The release gate

**Files:**
- Create: `scripts/release-gate.mjs`
- Test: `tests/release_gate.test.js` *(create)*

**Interfaces:**
- Consumes: nothing.
- Produces: `decideRelease(version, releases) -> { build: boolean, replaceDraft: boolean, reason: string }`, where `releases` is an array of `{ tagName: string, isDraft: boolean }`. Task 7 calls this through a thin CLI wrapper.

- [ ] **Step 1: Write the failing tests**

These four cases are the whole contract, and cover Review Focus 2 and 4.

```js
test('builds when no release exists for the version', () => {
  const d = decideRelease('3.2.0', []);
  assert.equal(d.build, true);
  assert.equal(d.replaceDraft, false);
});

test('skips when a PUBLISHED release exists for the version', () => {
  const d = decideRelease('3.2.0', [{ tagName: 'v3.2.0', isDraft: false }]);
  assert.equal(d.build, false);
});

test('builds and replaces when only a DRAFT exists for the version', () => {
  const d = decideRelease('3.2.0', [{ tagName: 'v3.2.0', isDraft: true }]);
  assert.equal(d.build, true);
  assert.equal(d.replaceDraft, true);
});

test('a published release for a different version does not block', () => {
  const d = decideRelease('3.2.0', [{ tagName: 'v3.1.0', isDraft: false }]);
  assert.equal(d.build, true);
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npm test -- tests/release_gate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `decideRelease` in `scripts/release-gate.mjs`**

Compare against `` `v${version}` `` using a single named constant for the tag prefix, shared with Task 7. `reason` is a human sentence for the workflow log (§6.3 "label all output").

- [ ] **Step 4: Add the CLI wrapper**

A `main` branch at the bottom of the same file that reads the version from `package.json` and a JSON release list from `process.argv[2]`, then writes `build`, `replace_draft` and `reason` to `process.env.GITHUB_OUTPUT`. One job, so it stays in this file (§6.5).

- [ ] **Step 5: Run the tests, then commit**

Run: `npm test` → Expected: PASS

```bash
git add scripts/release-gate.mjs tests/release_gate.test.js
git commit -m "Add the release gate: published releases are immutable, drafts are not"
```

---

### Task 5: Release notes template and renderer

**Files:**
- Create: `.github/release-notes-template.md`
- Create: `scripts/render-release-notes.mjs`
- Test: `tests/render_release_notes.test.js` *(create)*

**Interfaces:**
- Consumes: nothing.
- Produces: `renderReleaseNotes(template, version) -> string`, throwing on any surviving `{{…}}`. Task 7 calls it through a CLI wrapper that reads the template and writes the body to a file.

- [ ] **Step 1: Write the failing tests**

The third test is Review Focus 5.

```js
test('substitutes every version placeholder', () => {
  const out = renderReleaseNotes('LogIT-{{VERSION}}-macOS.dmg and v{{VERSION}}', '3.2.0');
  assert.equal(out, 'LogIT-3.2.0-macOS.dmg and v3.2.0');
});

test('throws when an unknown placeholder survives', () => {
  assert.throws(() => renderReleaseNotes('hello {{WHAT}}', '3.2.0'), /WHAT/);
});

test('the shipped template renders with no placeholders left', () => {
  const out = renderReleaseNotes(readFileSync(TEMPLATE_PATH, 'utf8'), '3.2.0');
  assert.ok(!out.includes('{{'));
  for (const name of ['Windows-Installer.exe', 'Windows-Portable.exe', 'macOS.dmg', 'Linux.AppImage']) {
    assert.ok(out.includes(`LogIT-3.2.0-${name}`), `missing ${name}`);
  }
});

test('the template keeps the pre-publish marker and all four sections', () => {
  const t = readFileSync(TEMPLATE_PATH, 'utf8');
  assert.ok(t.includes('CHECK BEFORE PUBLISHING'));
  for (const h of ['Download', 'What this has actually been tested on', 'What\'s new', 'Found a bug?']) {
    assert.match(t, new RegExp(`^#+ ${h.replace('?', '\\?')}$`, 'm'), `missing heading: ${h}`);
  }
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npm test -- tests/render_release_notes.test.js`
Expected: FAIL — module and template missing.

- [ ] **Step 3: Write the template**

Exactly the structure and copy approved in spec §6.2: a **Download** section with one labelled line per file (installer marked "Most people want this one", and "portable" never appearing without "runs straight from your Downloads folder or a USB stick; nothing is installed"), the security-warning paragraph, the per-platform **tested on** block, a **What's new** block, and **Found a bug?** pointing at Issues with "a side project I'm sharing because it's useful to me, not a supported product". Download links are the predictable asset URLs built from `{{VERSION}}`.

The two hand-written blocks — tested-on and what's-new — sit under a visible `<!-- CHECK BEFORE PUBLISHING -->` marker (spec §7.7). Seed the tested-on block with: Windows used daily; macOS launched and smoke-tested on one Apple Silicon machine; Linux builds but has never been launched by anyone.

- [ ] **Step 4: Implement `renderReleaseNotes` and a CLI wrapper, then run the tests**

Run: `npm test` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .github/release-notes-template.md scripts/render-release-notes.mjs tests/render_release_notes.test.js
git commit -m "Add the release-notes template and its renderer"
```

---

### Task 6: Workflow — three platform builds, artifacts only

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: Task 1's targets and filenames.
- Produces: three uploaded workflow artifacts. Task 7 adds the gate and assembly around this; no release is created yet.

- [ ] **Step 1: Write the workflow with `workflow_dispatch` only**

Three jobs — `windows-latest`, `macos-latest`, `ubuntu-latest`. Each: checkout, `setup-node` at Node 20 with npm cache, `npm ci`, `npm test`, `npm run icons`, then electron-builder for its own platform, then `upload-artifact`. **Pin every action to an exact major and confirm it is current before committing** — stale action majors are the commonest first-run failure, and `macos-latest` has already migrated from Intel to Apple Silicon once. `workflow_dispatch` only, so merging cannot trigger anything until Task 7.

- [ ] **Step 2: Grant the workflow `contents: write`**

Needed by Task 7 and harmless now.

- [ ] **Step 3: Add the icon guard**

After `npm run icons` in each packaging job, a step that fails if `build/icon.ico`, `build/icon.png` or `build/dmg-background.png` is missing. This is Review Focus 1: `build/` is gitignored, and electron-builder would otherwise package a default Electron icon without complaint.

- [ ] **Step 4: Dispatch it and verify all four artifacts**

Run the workflow from the Actions tab.
Expected: green, and the run's artifacts contain exactly `LogIT-3.2.0-Windows-Installer.exe`, `LogIT-3.2.0-Windows-Portable.exe`, `LogIT-3.2.0-macOS.dmg`, `LogIT-3.2.0-Linux.AppImage`. This is the first confirmation of the macOS and Linux filenames deferred from Task 1.

- [ ] **Step 5: Check the Actions bill**

Open the account's Actions usage page. The spec notes GitHub's docs do not state the public-repo exemption for macOS runners specifically; confirm the run was free and record the answer in the Task 9 UPDATES entry either way.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "Build all three platforms in CI, artifacts only"
```

---

### Task 7: Workflow — gate and draft release assembly

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `decideRelease` (Task 4) and `renderReleaseNotes` (Task 5) via their CLI wrappers; the three build jobs from Task 6.
- Produces: a draft release tagged `v3.2.0` carrying all four assets.

- [ ] **Step 1: Add the `push: branches: [main]` trigger and a gate job**

The gate job runs first, fetches the release list, calls `scripts/release-gate.mjs`, and exposes `build` and `replace_draft` as outputs. The three build jobs gain `needs: gate` and an `if` on its `build` output. `workflow_dispatch` stays, for forcing a run.

- [ ] **Step 2: Add the assembly job**

`needs: [windows, macos, linux]` — with no `continue-on-error` anywhere, so a single platform failure means this job never runs. That is Review Focus 3. It downloads all artifacts, renders the notes, deletes the existing draft when `replace_draft` is true, then creates the release with `--draft` and attaches the four files. **No step may publish.**

- [ ] **Step 3: Verify the happy path**

Merge the branch to `main`.
Expected: a **draft** release `v3.2.0` with four assets and rendered notes; nothing publicly visible.

- [ ] **Step 4: Verify the gate (Review Focus 2)**

Publish the draft, then push a documentation-only commit to `main`.
Expected: the workflow runs the gate, reports skip with a reason, and builds nothing. This is the anti-goal the whole design exists to prevent, so confirm it on the real repo rather than trusting Task 4's unit tests.

- [ ] **Step 5: Verify partial failure (Review Focus 3)**

On a scratch branch, break one platform's build deliberately and dispatch.
Expected: that job red, assembly skipped, **no draft created**. Revert the break.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "Assemble a draft release when the version is new"
```

---

### Task 8: macOS verification on Apple Silicon

**Files:**
- Modify: `docs/claude/GOTCHAS.md`
- Modify: `package.json` (`build.dmg.contents`) — only if coordinates need correcting

**Interfaces:**
- Consumes: the `LogIT-3.2.0-macOS.dmg` asset from Task 7's draft.
- Produces: a verdict that either clears macOS for publication or escalates to a signing hook as its own change.

This is the spec §10 gate that cannot be automated. The `.dmg` must be **downloaded** rather than copied, so Gatekeeper's quarantine flag is set the way a classmate's will be.

- [ ] **Step 1: Record the `mac.identity` finding in GOTCHAS**

Spec §9 requires it regardless of outcome: on 24.13.3, `mac.identity: "-"` searches the keychain for a certificate named `-`, fails, and silently skips signing — `findIdentity` has no ad-hoc special case (`macCodeSign.js:256`, `macPackager.js:195`). Anyone reaching for ad-hoc signing will try that option first and conclude it is broken.

- [ ] **Step 2: Open the .dmg and check the window**

Expected: icons centred on the arrow ends, title bar reading "Drag LogIT to Applications". If they are off, correct `build.dmg.contents` coordinates and rebuild — expected on a first attempt, and cheap at 3–5 days of access.

- [ ] **Step 3: Install and launch**

Drag to Applications, then open it — right-click → **Open** → **Open** if Gatekeeper prompts.
Expected: **the app launches.** If macOS instead reports it is damaged and should be moved to the Trash, that is the unsigned-arm64 refusal: stop, record it in GOTCHAS, and raise the `mac.sign` hook as its own change. Do not publish the release.

- [ ] **Step 4: Exercise the three things most likely to differ on macOS**

Expected: **Start logging** leaves only the floating shortcut on screen; the shortcut stays on top across Spaces and over a full-screen window; **closing the last window leaves the app running** (`CLAUDE.md` Stack — it must not quit). Then log one check-in and confirm the row reaches `~/Documents/LogIT/AppLog/`.

- [ ] **Step 5: Update the tested-on block and commit**

Set macOS honestly in `.github/release-notes-template.md` from what Steps 2–4 actually showed.

```bash
git add docs/claude/GOTCHAS.md .github/release-notes-template.md package.json
git commit -m "Verify the macOS build on Apple Silicon"
```

---

### Task 9: Bookkeeping and the README

**Files:**
- Modify: `CLAUDE.md` (§1 repo map, §8), `docs/claude/UPDATES.md`, `README.md`

**Interfaces:**
- Consumes: the Task 6 Step 5 billing answer and the Task 8 verdict.
- Produces: nothing other tasks use. Sequenced last because the README may not advertise downloads before Task 8 clears macOS (spec §7.9).

- [ ] **Step 1: Record the convention in `CLAUDE.md`**

Add the version-branch rule so future sessions follow it, noting that nothing machine-readable depends on the branch name. Add the §8 carve-out for the release path, with the reason — the audience changed from one person to a class, and two of three platforms cannot be built on the author's machine. Without it, §8 reads as contradicting the repository it governs. Add `.github/` to the §1 repo map.

- [ ] **Step 2: Write the `UPDATES.md` entry**

Newest on top, demoting the previous `(newest)` marker. What changed, why CI now exists, what it invalidates, and what is still open — including the Linux row, still unverified, with the VM named as the eventual route.

- [ ] **Step 3: Rewrite the README Install section**

Point all three platforms at the Releases page. Delete the "no prebuilt download" macOS paragraph and the build-it-yourself instructions as the primary path, keeping a short from-source section. **Remove the security-warning prose** — the notes template is now its only home (spec §7.9), so the README links rather than restating. Add Linux to the platform badge.

- [ ] **Step 4: Verify every markdown link still resolves**

Run the link check used earlier in this repo over all tracked `.md` files.
Expected: zero broken links.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/claude/UPDATES.md README.md
git commit -m "Record the release pipeline and point the README at Releases"
```

---

## Self-Review

**Spec coverage.** §6 decisions → Tasks 1–3, 5, 7. §6.1 filenames → Task 1, re-verified Task 6 Step 4. §6.2 notes structure → Task 5 Step 3. §7.1–7.2 branch/tag and single-sourcing → Task 4 Step 3, Task 9 Step 1. §7.3 gate → Task 4. §7.4 no partial drafts → Task 7 Step 2. §7.5 unsigned-first → Task 8 Step 3. §7.6 generated background → Task 3. §7.7 hand-edited prose and marker → Task 5 Steps 3–4, Task 8 Step 5. §7.8 upgrade check → Task 2 Step 3. §7.9 README last → Task 9. §9 bookkeeping → Task 8 Step 1, Task 9. §11.2 Linux ships untested → Task 5 Step 3. §8's open items are all assigned.

**Known gaps, deliberate.** Two deliverables have no automated test and say so: the wizard's upgrade behaviour (Task 2 Step 3) and the whole of Task 8, both of which are claims about real machines. The `.dmg` coordinates are the one thing committed before it can be verified.

**Proportion.** Roughly 200 lines of config, YAML and two small modules. Bodies are left to the implementer except where the spec fixes exact copy.
