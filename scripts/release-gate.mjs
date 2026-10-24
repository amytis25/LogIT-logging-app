// release-gate.mjs
// Description: decides whether a version should be built and released at all,
//              given what GitHub already has. Two anti-goals of the release
//              design meet here: a published release must never be rebuilt or
//              overwritten, and an ordinary documentation commit landing on main
//              must cost nothing. An unpublished draft is neither — it is the
//              author's working copy, so it is replaced rather than protected.
//              Pure, so the four cases that matter are provable by `npm test`
//              in a second instead of by pushing a commit and waiting.
// Inputs:  a version string ('3.2.0') and the releases GitHub reports
//          ([{ tagName, isDraft }]). As a CLI: that list as JSON in argv[2].
// Outputs: { build, replaceDraft, reason }. As a CLI: the same, written to
//          GITHUB_OUTPUT for the workflow's later jobs.
// Created: 2026-10-24

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Tags carry the prefix, branches do not — `3.2.0` and `v3.2.0` as both a
// branch and a tag would make `git checkout 3.2.0` ambiguous (design §7.1).
export const TAG_PREFIX = 'v';

// Description: the build/skip decision for one version.
// Inputs:  version — '3.2.0'; releases — [{ tagName, isDraft }]
// Outputs: { build: boolean, replaceDraft: boolean, reason: string }
export function decideRelease(version, releases) {
  const tag = `${TAG_PREFIX}${version}`;
  const existing = releases.find((release) => release.tagName === tag);
  let decision;
  if (existing === undefined) {
    decision = {
      build: true, replaceDraft: false,
      reason: `no release tagged ${tag} exists, so ${version} will be built`
    };
  } else if (existing.isDraft) {
    decision = {
      build: true, replaceDraft: true,
      reason: `an unpublished draft for ${version} exists, so it will be rebuilt and the draft replaced`
    };
  } else {
    decision = {
      build: false, replaceDraft: false,
      reason: `${tag} is already published, so ${version} will not be rebuilt`
    };
  }
  return decision;
}

// Description: CLI entry for the workflow's gate job. Reads the version from
//              package.json — the single source of version truth (design §7.2)
//              — and the release list from argv, then publishes the decision as
//              step outputs the later jobs gate on.
// Inputs:  argv[2] — the release list as JSON; GITHUB_OUTPUT in the environment
// Outputs: none (writes step outputs and one log line)
function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const { version } = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
  const decision = decideRelease(version, JSON.parse(process.argv[2] ?? '[]'));
  console.log(`release gate: ${decision.reason}`);
  const outputs = [
    `build=${decision.build}`,
    `replace_draft=${decision.replaceDraft}`,
    `version=${version}`,
    `tag=${TAG_PREFIX}${version}`,
    `reason=${decision.reason}`
  ].join('\n');
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${outputs}\n`);
  } else {
    console.log(outputs);
  }
}

// Only when run directly, so importing for the tests decides nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
