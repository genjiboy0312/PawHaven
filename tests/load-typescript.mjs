import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const modules = new Map();
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
    return 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  })();
  modules.set(key, pending);
  return pending;
}
export async function importTs(path, base) {
  return import(await compiledUrl(new URL(path, base)));
}
