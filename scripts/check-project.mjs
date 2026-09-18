// Verify the distributable without downloading assets or installing runtime dependencies.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const json = (name) => JSON.parse(fs.readFileSync(path.join(dist, name), 'utf8'));
const specs = [];
const model = json('data/manifest.json');
for (const spec of [
  model.circuit,
  model.context,
  ...json('data/realtime-manifest.json').models.map((m) => m.circuit),
])
  specs.push({ ...spec, file: 'data/' + spec.file });
for (const spec of json('assets/source-manifest.json')) specs.push(spec);
for (const spec of json('assets/pedestrians/source-manifest.json'))
  specs.push({ ...spec, file: 'assets/pedestrians/' + spec.file });
for (const spec of specs) {
  const file = path.resolve(dist, spec.file);
  assert.ok(file.startsWith(dist + path.sep));
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length, spec.bytes, spec.file + ' size');
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    spec.sha256,
    spec.file + ' SHA-256',
  );
}
for (const dir of ['dist', 'scripts'])
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (!name.endsWith('.mjs')) continue;
    const result = spawnSync(process.execPath, ['--check', path.join(root, dir, name)], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  }
const english = fs.readFileSync(path.join(dist, 'en.html'), 'utf8');
assert.ok(english.includes('lang="en"'));
const chinese = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const elementIds = (html) => [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]).sort();
assert.deepEqual(
  elementIds(english),
  elementIds(chinese),
  'English page must preserve every control',
);
const tags = (html) =>
  [...html.matchAll(/<\/?([a-z][a-z0-9]*)\b/gi)].map((m) => m[0].toLowerCase());
assert.deepEqual(tags(english), tags(chinese), 'English page must preserve the document structure');
for (const suffix of ['', '.en'])
  assert.equal(
    fs.readFileSync(
      path.join(root, suffix ? 'docs/driving-guide.en.md' : 'docs/驾驶原理.md'),
      'utf8',
    ),
    fs.readFileSync(path.join(dist, `driving-guide${suffix}.md`), 'utf8'),
  );
console.log(
  `Verified ${specs.length} pinned data/assets, JavaScript syntax, English page structure and both published guide copies.`,
);
