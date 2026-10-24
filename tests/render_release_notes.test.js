// render_release_notes.test.js
// Description: verifies the release-notes renderer and the shipped template.
//              The notes are the only thing standing between a classmate and an
//              unexplained security warning, so the template's required sections
//              are asserted here rather than trusted — a release page that reads
//              '{{VERSION}}' or has lost its download section is a failure the
//              author would only discover after publishing.
// Inputs:  none (reads the shipped template from disk)
// Outputs: node:test results
// Created: 2026-10-24

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReleaseNotes } from '../scripts/render-release-notes.mjs';

const TEMPLATE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'release-notes-template.md'
);
const ARTIFACT_SUFFIXES = [
  'Windows-Installer.exe', 'Windows-Portable.exe', 'macOS.dmg', 'Linux.AppImage'
];

test('substitutes every version placeholder', () => {
  const out = renderReleaseNotes('LogIT-{{VERSION}}-macOS.dmg and v{{VERSION}}', '3.2.0');
  assert.equal(out, 'LogIT-3.2.0-macOS.dmg and v3.2.0');
});

test('throws when an unknown placeholder survives', () => {
  assert.throws(() => renderReleaseNotes('hello {{WHAT}}', '3.2.0'), /WHAT/);
});

test('the shipped template renders with no placeholders left', () => {
  const out = renderReleaseNotes(fs.readFileSync(TEMPLATE_PATH, 'utf8'), '3.2.0');
  assert.ok(!out.includes('{{'), 'an unsubstituted placeholder survived');
  for (const suffix of ARTIFACT_SUFFIXES) {
    assert.ok(out.includes(`LogIT-3.2.0-${suffix}`), `missing download for ${suffix}`);
  }
});

test('the template keeps the pre-publish marker and all four sections', () => {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  assert.ok(template.includes('CHECK BEFORE PUBLISHING'), 'missing the pre-publish marker');
  const headings = [
    'Download', 'What this has actually been tested on', "What's new", 'Found a bug\\?'
  ];
  for (const heading of headings) {
    assert.match(template, new RegExp(`^#+ ${heading}$`, 'm'), `missing heading: ${heading}`);
  }
});

test('the template warns about the security prompt on both platforms', () => {
  const out = renderReleaseNotes(fs.readFileSync(TEMPLATE_PATH, 'utf8'), '3.2.0');
  assert.match(out, /Run anyway/, 'missing the Windows click-through');
  assert.match(out, /right-click/i, 'missing the macOS click-through');
});
