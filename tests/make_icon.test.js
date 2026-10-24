// make_icon.test.js
// Description: verifies the generated .dmg background — that the dependency-free
//              rasteriser emits a structurally valid PNG at the size the dmg
//              window is configured for, and that the @2x variant is exactly
//              double. The icon positions it must line up with cannot be checked
//              off a Mac, so size is the part that is machine-verifiable.
// Inputs:  none
// Outputs: node:test results
// Created: 2026-10-24

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DMG_BACKGROUND_HEIGHT, DMG_BACKGROUND_WIDTH, renderDmgBackground
} from '../scripts/make-icon.mjs';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR_WIDTH_OFFSET = 16;   // 8-byte signature + 4 length + 4 type
const IHDR_HEIGHT_OFFSET = 20;

test('dmg background is a valid PNG at the documented size', () => {
  const png = renderDmgBackground(DMG_BACKGROUND_WIDTH, DMG_BACKGROUND_HEIGHT);
  assert.deepEqual([...png.subarray(0, 8)], PNG_SIGNATURE);
  assert.equal(png.readUInt32BE(IHDR_WIDTH_OFFSET), DMG_BACKGROUND_WIDTH);
  assert.equal(png.readUInt32BE(IHDR_HEIGHT_OFFSET), DMG_BACKGROUND_HEIGHT);
});

test('the 2x background is exactly double', () => {
  const png = renderDmgBackground(DMG_BACKGROUND_WIDTH * 2, DMG_BACKGROUND_HEIGHT * 2);
  assert.equal(png.readUInt32BE(IHDR_WIDTH_OFFSET), 1080);
  assert.equal(png.readUInt32BE(IHDR_HEIGHT_OFFSET), 760);
});

test('importing the script writes nothing — the file writes are behind a main guard', async () => {
  // Without the guard, running the suite would regenerate build/ as a side
  // effect. Snapshot the real artefact either way: in CI `npm test` runs before
  // `npm run icons`, so build/ is usually absent and "still absent" is the
  // assertion; locally it exists and "mtime unchanged" is.
  const iconPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png'
  );
  const before = fs.existsSync(iconPath) ? fs.statSync(iconPath).mtimeMs : null;

  // A fresh module instance: the import at the top of this file is already
  // cached, so only a cache-busting specifier actually re-evaluates the module.
  await import(`../scripts/make-icon.mjs?guard-check=${Date.now()}`);

  const after = fs.existsSync(iconPath) ? fs.statSync(iconPath).mtimeMs : null;
  assert.equal(after, before, 'importing make-icon.mjs wrote to build/');
});
