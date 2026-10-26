import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { after } from 'node:test';
import { transformWithOxc } from 'vite';

const modules = new Map();
const directory = await mkdtemp(join(tmpdir(), 'paw-test-modules-'));
after(() => rm(directory, { recursive: true, force: true }));
async function compiledUrl(url) {
  const key = url.href;
  if (modules.has(key)) return modules.get(key);
  const pending = (async () => {
    const source = await readFile(url, 'utf8');
    let code = (await transformWithOxc(source, url.pathname)).code;
    // Resolve the static imports of the real application modules, including local TS dependencies.
    for (const match of [...code.matchAll(/from\s+(['"])([^'"]+)\1/g)]) {
      const specifier = match[2];
      const dependency = specifier.startsWith('.')
        ? await compiledUrl(new URL(specifier + (specifier.endsWith('.ts') ? '' : '.ts'), url))
        : import.meta.resolve(specifier);
      code = code.replace(match[0], 'from ' + JSON.stringify(dependency));
    }
    // Each dependency is emitted once. Nested data URLs copied the whole import
    // tree into every parent, making larger scene tests unnecessarily expensive.
    const file = join(directory, createHash('sha256').update(key).digest('hex') + '.mjs');
    await writeFile(file, code);
    return pathToFileURL(file).href;
  })();
  modules.set(key, pending);
  return pending;
}
export async function importTs(path, base) {
  return import(await compiledUrl(new URL(path, base)));
}
