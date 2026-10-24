// render-release-notes.mjs
// Description: turns the release-notes template into the body of one release by
//              substituting the version, and refuses to produce notes that still
//              contain a placeholder. The notes are the only thing standing
//              between a classmate and an unexplained security warning, so a
//              release page reading '{{VERSION}}' is a failure worth stopping
//              the build for rather than discovering after publication.
// Inputs:  the template text and a version string. As a CLI: argv[2] is the
//          path to write the rendered body to.
// Outputs: the rendered notes. As a CLI: that text written to the given path.
// Created: 2026-10-24

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VERSION_PLACEHOLDER = '{{VERSION}}';
const ANY_PLACEHOLDER = /\{\{([A-Z_]+)\}\}/;

// Description: render the notes for one version.
// Inputs:  template — the template text; version — '3.2.0'
// Outputs: the rendered notes as a string
// Throws:  when any placeholder survives substitution
export function renderReleaseNotes(template, version) {
  const rendered = template.replaceAll(VERSION_PLACEHOLDER, version);
  const survivor = rendered.match(ANY_PLACEHOLDER);
  if (survivor !== null) {
    // Early exit on a validation failure (§6.3 carve-out): continuing would
    // publish the placeholder.
    throw new Error(`unsubstituted placeholder in the release notes: ${survivor[1]}`);
  }
  return rendered;
}

// Description: CLI entry for the workflow's assembly job.
// Inputs:  argv[2] — where to write the rendered notes
// Outputs: none (writes the file and one log line)
function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const { version } = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
  const template = fs.readFileSync(path.join(here, '..', '.github', 'release-notes-template.md'), 'utf8');
  const destination = process.argv[2];
  const notes = renderReleaseNotes(template, version);
  fs.writeFileSync(destination, notes);
  console.log(`release notes: ${notes.length} chars for ${version} written to ${destination}`);
}

// Only when run directly, so importing for the tests writes nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
