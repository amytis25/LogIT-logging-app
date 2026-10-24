// release_gate.test.js
// Description: verifies the decision that keeps a published release immutable
//              and a documentation commit cheap — whether a version should be
//              built at all, given what GitHub already has. This is the whole
//              defence against anti-goals 1 and 2 of the release design, so the
//              four cases below are the contract, not a sample.
// Inputs:  none
// Outputs: node:test results
// Created: 2026-10-24

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decideRelease } from '../scripts/release-gate.mjs';

const GATE_CLI = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'release-gate.mjs'
);

test('builds when no release exists for the version', () => {
  const decision = decideRelease('3.2.0', []);
  assert.equal(decision.build, true);
  assert.equal(decision.replaceDraft, false);
});

test('skips when a PUBLISHED release exists for the version', () => {
  const decision = decideRelease('3.2.0', [{ tagName: 'v3.2.0', isDraft: false }]);
  assert.equal(decision.build, false);
});

test('builds and replaces when only a DRAFT exists for the version', () => {
  const decision = decideRelease('3.2.0', [{ tagName: 'v3.2.0', isDraft: true }]);
  assert.equal(decision.build, true);
  assert.equal(decision.replaceDraft, true);
});

test('a published release for a different version does not block', () => {
  const decision = decideRelease('3.2.0', [{ tagName: 'v3.1.0', isDraft: false }]);
  assert.equal(decision.build, true);
});

test('the CLI refuses to run without a release list, rather than assuming there is none', () => {
  // Fail-open is the one thing this gate must never do: absent input must not
  // read as "no releases exist, go ahead and build".
  const run = spawnSync(process.execPath, [GATE_CLI], { encoding: 'utf8' });
  assert.notEqual(run.status, 0, 'missing argument should be a failure, not a default');
  assert.match(`${run.stderr}${run.stdout}`, /release list/i);
});

test('every decision carries a reason for the workflow log', () => {
  for (const releases of [[], [{ tagName: 'v3.2.0', isDraft: false }], [{ tagName: 'v3.2.0', isDraft: true }]]) {
    const decision = decideRelease('3.2.0', releases);
    assert.equal(typeof decision.reason, 'string');
    assert.ok(decision.reason.includes('3.2.0'), `reason should name the version: ${decision.reason}`);
  }
});
