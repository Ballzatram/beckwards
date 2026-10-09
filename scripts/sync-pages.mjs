import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const pages = (await readdir(root, { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'));
const outputs = new Map([['home.html', await readFile(path.join(root, 'index.html'), 'utf8')]]);

for (const page of pages) {
  let source;
  try {
    source = await readFile(path.join(root, `${page.name}.html`), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  outputs.set(`${page.name}/index.html`, source.replace('<head>', '<head>\n  <base href="/" />'));
}

let stale = 0;
for (const [file, content] of outputs) {
  const destination = path.join(root, file);
  if (await readFile(destination, 'utf8').catch(() => '') === content) continue;
  if (check) {
    console.error(`Page is out of sync: ${file}. Run npm run sync:pages.`);
    stale += 1;
  } else {
    await writeFile(destination, content);
    console.log(`Updated ${file}`);
  }
}
if (stale) process.exitCode = 1;
