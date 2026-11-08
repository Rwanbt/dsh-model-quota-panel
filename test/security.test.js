import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'test']);
const SDK_ONLY_FILES = new Set(['quotas.json', 'boot.log', 'debug.json']);

/** Every source file the repository tracks (the test suite excluded). */
async function sourceFiles(directory = ROOT, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const name = relative(ROOT, absolute);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      await sourceFiles(absolute, output);
      continue;
    }
    if (SDK_ONLY_FILES.has(entry.name)) continue;
    if (name.startsWith('.')) continue;
    output.push({ name, absolute });
  }
  return output;
}

const SECRET_PATTERNS = [
  ['OpenCode key', /oc_[A-Za-z0-9]{25,}/],
  ['API key', /sk-[A-Za-z0-9]{30,}/],
  ['Anthropic OAuth token', /sk-ant-oat\d{2}-[A-Za-z0-9_-]{20,}/],
  ['GitHub OAuth token', /gho_[A-Za-z0-9]{30,}/],
  ['GitHub PAT', /ghp_[A-Za-z0-9]{30,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
  ['JWT', /eyJhbGciOi[A-Za-z0-9_-]{10,}/],
];

test('no credential-shaped string is committed', async () => {
  const files = await sourceFiles();
  assert.ok(files.length >= 8, 'the walk should see the bundle sources');
  for (const file of files) {
    const text = await readFile(file.absolute, 'utf8');
    for (const [label, pattern] of SECRET_PATTERNS) {
      assert.doesNotMatch(text, pattern, `${label} leaked into ${file.name}`);
    }
  }
});

test('no personal absolute path is committed', async () => {
  const files = await sourceFiles();
  for (const file of files) {
    const text = await readFile(file.absolute, 'utf8');
    assert.doesNotMatch(text, /C:[\\/]+Users[\\/]+[A-Za-z0-9._-]+[\\/]/i, `personal path in ${file.name}`);
    assert.doesNotMatch(text, /\/(Users|home)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\//, `personal path in ${file.name}`);
  }
});

test('runtime artefacts stay out of the repository', async () => {
  const ignore = await readFile(join(ROOT, '.gitignore'), 'utf8');
  for (const artefact of ['quotas.json', 'boot.log', 'debug.json', 'node_modules']) {
    assert.match(ignore, new RegExp(artefact.replace('.', '\\.')), `${artefact} must be ignored`);
  }
});

test('the browser bundle never embeds a credential', async () => {
  const client = await readFile(join(ROOT, 'client.js'), 'utf8');
  assert.doesNotMatch(client, /authorization/i);
  assert.doesNotMatch(client, /apiKey/i);
});
