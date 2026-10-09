import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.filter(entry => !entry.name.startsWith('.') && !['node_modules', 'test-results', 'playwright-report', 'assets'].includes(entry.name)).map(async entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  }));
  return groups.flat();
}
const files = await walk(root);

test('all local HTML/CSS assets and links resolve on the case-sensitive server', async () => {
  const missing = [];
  for (const file of files.filter(file => /\.(html|css)$/.test(file))) {
    const source = await readFile(file, 'utf8');
    const base = /<base\s+href="\/"/.test(source) ? root : path.dirname(file);
    const refs = [...source.matchAll(/(?:src|href|data-src)="([^"#]+)"|url\(["']?([^)'"\s]+)["']?\)/g)];
    for (const match of refs) {
      const ref = match[1] || match[2];
      if (/^(?:[a-z]+:|\/\/|#)/i.test(ref)) continue;
      const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
      const target = path.resolve(clean.startsWith('/') ? root : base, clean.replace(/^\//, ''));
      try {
        const info = await stat(target);
        if (info.isDirectory()) await stat(path.join(target, 'index.html'));
      } catch {
        missing.push(`${path.relative(root, file)} -> ${ref}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('manifest IDs are unique and all assets exist', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'assets/data/manifest.json'), 'utf8'));
  const ids = new Set();
  for (const item of [...manifest.images, ...manifest.audio]) {
    assert.ok(!ids.has(item.id), `Duplicate asset ID: ${item.id}`);
    ids.add(item.id);
    for (const src of [item.src].flat()) await stat(path.join(root, decodeURIComponent(src)));
  }
});

test('JavaScript files and inline scripts parse', async () => {
  for (const file of files.filter(file => /\.(js|mjs)$/.test(file))) {
    execFileSync(process.execPath, ['--check', file]);
  }
  for (const file of files.filter(file => file.endsWith('.html'))) {
    const html = await readFile(file, 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/type="(?:module|application\/ld\+json)"/.test(match[1])) continue;
      new vm.Script(match[2], { filename: file });
    }
  }
});

test('clean routes and HTML aliases have identical page content', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts/sync-pages.mjs'), '--check']);
});
