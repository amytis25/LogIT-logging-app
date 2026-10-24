# Design — automated multi-platform release pipeline

Date: 2026-10-24
Status: **awaiting approval.** One assumption in §11.1 needs confirming, but does not block approval
Owner: user (amytis25)
Revision: 3 — incorporates a builder review and the author's answers to it

---

## 1. Intent — why this exists

LogIT is being given to a class of engineering students. They will find it on the repo's Releases page,
download the file for their machine, install it, and use it the way the author does. That is the whole
distribution story: no store, no installer host, no support desk.

Today that is impossible. Releases are built by hand on the author's Windows laptop, so **only Windows
artifacts exist** — and no amount of effort on that laptop will produce a macOS one, because
electron-builder cannot cross-compile a `.dmg` from Windows and its own documentation states that "macOS
Code Signing works only on macOS." A Linux artifact has never been built at all.

So the pipeline is not a convenience. It is the only mechanism by which two of the three target platforms
can be produced. That is the reason CI appears in a project whose `CLAUDE.md` §8 lists CI/CD under "don't
suggest" — the constraint changed when the audience changed from one person to a class.

The second reason is honesty at scale. One person clicking through a security warning on their own build is
a shrug. Thirty people hitting an unexplained wall is a reputation. The release page has to do the
explaining, every time, without the author retyping it.

---

## 2. Goals

1. Merging a version-named branch into `main` builds Windows, macOS and Linux artifacts with no human step.
2. Every artifact's filename states its platform and version in words a non-expert can act on.
3. All artifacts land on a **single** GitHub release, tagged `v<version>`.
4. That release is created as a **draft**. Publishing is the author's click and the only manual step.
5. The release notes explain what each file is for, state plainly what has and has not been tested, and
   route bug reports to GitHub Issues — generated from a template in the repo, not retyped.
6. The install experience is deliberate rather than default: a short Windows wizard, and a `.dmg` window
   that tells the user to drag the app to Applications.

## 3. Non-goals

- Code-signing certificates, for Windows or Apple. Several hundred dollars a year for a free tool.
- Apple notarisation ($99/yr developer account).
- Auto-update of any kind.
- Any support commitment, response time, or guarantee.
- CI beyond producing releases. No per-push linting, no coverage, no PR gates. The existing `npm test`
  runs inside the release build and nowhere else.
- A `.deb`, an `.msi`, or an App Store build.
- Publishing to any channel other than GitHub Releases.

## 4. Anti-goals — failure even if it technically works

- **A release becomes publicly downloadable without the author publishing it.** The draft gate is the
  single most important behaviour in this design.
- **A documentation commit to `main` cuts a release.** In one working session this repo received five
  doc-only commits to `main`; an ungated trigger would have produced five releases.
- **An artifact's filename disagrees with the version inside it.** A mislabelled binary in a classroom is
  unfalsifiable confusion — nobody can tell which build they are running.
- **A macOS build ships that macOS refuses to launch**, with nothing on the release page warning of it.
- **A classmate cannot tell which file to download.** Six similarly-named files is a failure of the goal
  even if all six are correct.
- **A published release is overwritten or loses assets.** Added in revision 2; see §7.3.

---

## 5. Constraints

Verified in this repository on 2026-10-24 unless noted:

- **electron-builder 24.13.3**, electron 31.7.7, Node 18+, `npm test` = 111 passing headless tests.
- `--universal` **is** supported by the installed CLI (`electron-builder --help`).
- `DmgOptions` supports `background`, `contents`, `window`, `iconSize`, `iconTextSize`, `artifactName`.
- `artifactName` is settable on every relevant target (nsis, portable, dmg, AppImage) and per-platform.
- `LinuxConfiguration.target` exists, so AppImage is available.
- **`mac.identity: "-"` does NOT produce an ad-hoc signature on this version.** `findIdentity`
  (`app-builder-lib/out/codeSign/macCodeSign.js:256`) has no special case for `"-"`; it would search the
  keychain for a certificate of that name, fail, and fall through to skipping signing entirely
  (`macPackager.js:195`). Ad-hoc signing on 24.13.3 requires a custom `mac.sign` hook.
- GitHub rewrites spaces in uploaded asset filenames as dots, which is why the existing v3.1.0 assets read
  `LogIT.Setup.3.1.0.exe`. Filenames must therefore use hyphens.
- **Work has been landing on `main` by fast-forward merge** (this is how v3.1.0 arrived), which leaves no
  merge commit and therefore **no record of the source branch name**. There is no PR history. This
  constraint drives §7.2.
- The repo is a **public personal repository**. Standard GitHub-hosted runners are free for public repos
  per GitHub's billing documentation; that documentation does not state it for macOS runners specifically,
  so **cost should be confirmed on the Actions usage page after the first run.** Standard macOS is
  $0.062/min if billed.
- The current installer is `nsis: { oneClick: true, perMachine: false }`, and **the author already has a
  one-click 3.1.0 installed on their daily-use machine.** This drives §7.8.
- **The author has Windows only.** macOS availability is an open question — see §11.1. There is no Linux
  machine and no plan to obtain one.
- `CLAUDE.md` §6.5 forbids speculative code and §8 requires phased delivery with verification gates.

---

## 6. Decisions the author made

| Area | Decision |
|---|---|
| Branch naming | Work happens on a branch named for the version it ships |
| Trigger | Landing that work on `main` |
| Release state | **Draft.** Author publishes manually |
| Automation scope | Everything up to publication, including tag and notes |
| Filenames | Named for the person downloading, all variants kept |
| Windows | Short wizard installer (not one-click) **and** a portable single file |
| macOS | One universal `.dmg` covering Apple Silicon and Intel |
| Linux | AppImage only. **Ships in the first release** with its never-launched status stated in the notes |
| `.dmg` appearance | Custom background in the project palette, with a drag-to-Applications instruction |
| Bug reports | GitHub Issues, not a form |
| Release notes | Must state what has actually been tested, per platform, honestly |

### 6.1 The approved filenames

Approved from a mockup, so these are exact and the `artifactName` strings must reproduce them:

```
LogIT-3.2.0-Windows-Installer.exe
LogIT-3.2.0-Windows-Portable.exe
LogIT-3.2.0-macOS.dmg
LogIT-3.2.0-Linux.AppImage
```

### 6.2 The approved release-notes structure

1. **Download** — one labelled line per file, each with a plain-language explanation of what it is for.
   The installer line is marked "Most people want this one." The word "portable" never appears without
   "runs straight from your Downloads folder or a USB stick; nothing is installed" attached.
2. **Security warning** — stated *before* the reader encounters it, naming both the Windows and macOS
   click-throughs, and saying why (no certificate, costs money, this is free).
3. **What this has actually been tested on** — per-platform status, in plain prose.
4. **Found a bug?** — a link to Issues, what to include, and the expectation set explicitly: "a side
   project I'm sharing because it's useful to me, not a supported product."

---

## 7. Decisions I made — my calls, not the author's

**1. Branch `3.2.0`, tag `v3.2.0`.** A branch and tag with identical names make `git checkout 3.2.0`
ambiguous, and the existing tag is already `v3.1.0`. The `v` prefix stays on tags only.

**2. The branch name carries no machine meaning — `package.json` is the only source of version truth.**
Revision 1 proposed failing the build when the branch name disagreed with `package.json`. That check cannot
exist: landing work by fast-forward merge leaves no trace of the branch name on `main` (§5), so implementing
it would force every change through a pull request or a `--no-ff` merge — a workflow change the author never
asked for, to guard something that does not need guarding. The tag, all four filenames and the release-exists
gate **all derive from the single `version` field in `package.json`**, so they cannot disagree with one
another. Anti-goal 3 is prevented by single-sourcing rather than by validation. The branch-name convention
stays, as a human habit recorded in `CLAUDE.md`, with nothing depending on it.

**3. The gate looks at *published* releases; an unpublished draft for the same version is replaced.**
Revision 1 said "skip if a release for this version exists," which would have made the project's own phased
delivery impossible — §10 expects the same version to be rebuilt several times while `.dmg` coordinates are
corrected and macOS behaviour is investigated. So: if a **published** release exists for the version in
`package.json`, the workflow exits without building, which is what keeps doc commits free and published
releases immutable. If only a **draft** exists, it is replaced, because a draft is by definition the
author's working area and has not been blessed. This is worth stating plainly: **re-running a version
discards whatever was in its draft.** That is the intended behaviour, and the protection that matters —
never touching a published release — is absolute.

**4. The release is assembled only if all three platform builds succeed.** A draft missing its macOS file
is worse than no draft, because it can be published without the absence being noticed. One red run that
produces nothing is unambiguous.

**5. macOS ships unsigned in the first release; a signing hook is added only if it proves necessary.**
§5 establishes that ad-hoc signing needs custom code on this version. Whether it is needed is unknown and
answerable in one action on a real Mac. Writing an unverifiable signing hook before knowing it is required
is the speculative code §6.5 prohibits. The notes already warn about the prompt and already mark macOS as
barely tested. If the app is *killed* rather than *warned about*, that is a finding that justifies the hook,
and the hook becomes its own change. **This call depends on §11.1.**

**6. The `.dmg` background is generated by extending `scripts/make-icon.mjs`**, which already renders the
logo from first principles with zero dependencies. No new tool, no binary asset to hand-maintain, same
palette constants, and it regenerates in CI through the existing `npm run icons`.

**7. The per-release prose lives in the repo, and the draft says so.** Two blocks are hand-written and
cannot be generated: the per-platform test status (a claim about the physical world) and a short "What's
new" (the existing v3.1.0 notes have one, and without it a student on 3.1.0 cannot tell whether upgrading
gains them anything). Both live in the template, in version control, edited on the version branch alongside
the code. Because a stale template would silently restate the previous release's claims, **the generated
draft carries a visible marker above those two blocks reminding the author to check them before
publishing** — the author is already opening the draft in order to publish, so the cost is zero and the
failure mode is removed.

**8. `perMachine` stays `false`, and upgrading over the existing one-click install is an explicit
acceptance check.** Switching NSIS from one-click to a wizard can leave a second installation and duplicate
Start-menu entries rather than upgrading. The author has a one-click 3.1.0 on their daily machine and *can*
test this, Windows being the platform they have. So it is a named check rather than a guess: install 3.2.0
over 3.1.0, confirm one entry and one copy. If it does not upgrade cleanly, the notes gain an "uninstall
3.1.0 first" line. User data is in `Documents\LogIT\` and is not at risk either way.

**9. The README is in scope, but its download claims land with the first publish — not before.** The Install
section currently says macOS has "no prebuilt download" and tells the reader to build it themselves; that
becomes false the moment a release is published, and the platform badge omits Linux. Advertising macOS and
Linux downloads *before* the macOS check passes would recreate anti-goal 4 in a second location. So the
README change is part of this work but sequenced last. To avoid the drift the reviewer flagged, the
**security-warning prose has exactly one home — the release-notes template** — and the README links to the
Releases page rather than restating it.

## 8. Left to the builder

- Workflow file layout: job names, runner labels, action versions. **Pin exact versions and confirm them
  at implementation time** — `macos-latest` has already migrated from Intel to Apple Silicon once, and
  stale action majors are the most common cause of a first-run failure.
- How the three build jobs hand their artifacts to the release-assembling job.
- Whether the release-exists gate is its own job or a step.
- `.dmg` `window` and `contents` coordinates (see §11.1 for whether these can be verified at all).
- Where the notes template file sits, and its placeholder syntax.
- Whether `npm test` runs in all three jobs or once.
- `GITHUB_TOKEN` permissions (`contents: write`), Node version pinning, and regenerating the gitignored
  `build/` assets in CI.

## 9. Required bookkeeping

Per `CLAUDE.md` §7, in the same change as the implementation:

- **`docs/claude/UPDATES.md`** — an entry recording that CI now exists, that this reverses §8's standing
  "don't suggest CI/CD" for the release path specifically, and why (the audience changed from one person to
  a class, and two of three platforms cannot be built any other way).
- **`CLAUDE.md`** — the version-branch convention belongs in the rules so future sessions follow it, with
  §7.2's note that nothing machine-readable depends on it. §8's CI/CD line needs the carve-out stated, or
  it reads as contradicting the repository it governs.
- **`docs/claude/GOTCHAS.md`** — the `mac.identity: "-"` finding from §5. Anyone reaching for ad-hoc signing
  on this version will otherwise set that option, watch signing be skipped silently, and conclude the option
  is broken.

## 10. Delivery shape

`CLAUDE.md` §8 requires phases with verification gates, and this work splits along what can be verified
where. The Windows-verifiable configuration — filenames, wizard, generated background, upgrade-over-3.1.0 —
can be proven on the author's own machine before any workflow exists. The workflow can be proven to produce
three artifacts before it is allowed to create a release. The release can be a draft before anything is
public. The macOS artifact is only trustworthy after a Mac has launched it. The README's download claims
come last.

Exact phase boundaries belong to the implementation plan, not this document.

## 11. The remaining assumption

**11.1 macOS access is assumed to be one session, on an unknown architecture.** The author has not yet
confirmed this with the friend who owns the machine, so the design proceeds on the pessimistic reading and
names what would change it.

Three parts of this design touch a Mac: confirming the app launches rather than being killed (§7.5),
checking the `.dmg` window looks right (§8), and verifying a signing hook if §7.5 shows one is needed.
**The first two cost one session between them, not two** — opening the `.dmg` and dragging the app to
Applications *is* the install step, so the window's appearance is visible for free in the same sitting that
establishes whether the app runs. Only the signing hook needs a genuine second visit, and only in the case
where the first visit reveals it is necessary. One session is therefore sufficient for the first release
under all outcomes except "unsigned app is refused," which escalates by its nature.

**What would reverse a §6 decision:** if the available Mac is **Intel**, the unsigned arm64 half of the
universal build — the half Apple Silicon is most likely to refuse outright — would ship having never been
executed, while the "tested on" block could honestly claim only Intel. In that case shipping separate
Intel and Apple Silicon `.dmg` files is the better design, because it lets the notes state a different
confidence for each, instead of one file carrying a claim that is only half true. **The builder should
confirm the architecture before implementing the macOS target**, and treat the universal build as settled
only if the answer is Apple Silicon.

### 11.2 Resolved

**Does the Linux AppImage ship in the first release?** **Yes** — author's decision, 2026-10-24. It is
attached to the first release with its never-launched status stated plainly in the notes, on the reasoning
that disclosure plus a bug-report channel beats withholding a binary that may well work. The notes block
says so in as many words: "builds. Nobody has ever launched it. You would be the first."
