import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function recordBuild() {
  const index = await readFile('dist/index.html');
  const files = new Set(['./', './assets/characters/corgi/corgi-idle-walk.png']);
  let hasEntry = false;
  for (const [tag] of index.toString().matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const entry = tag.startsWith('<script') && /\btype="module"/.test(tag);
    const startupLink = tag.startsWith('<link') && /\brel="(?:stylesheet|modulepreload|preload|manifest)"/.test(tag);
    if (!entry && !startupLink) continue;
    const path = tag.match(/\b(?:src|href)="([^"]+)"/)?.[1];
    if (!path) continue;
    if (!path.startsWith('./')) throw Error(`Unexpected startup URL: ${path}`);
    files.add(path);
    hasEntry ||= entry;
  }
  if (!hasEntry) throw Error('Missing game entry script in dist/index.html');
  return Object.fromEntries(await Promise.all([...files].map(async path => {
    const file = path === './' ? 'index.html' : path.slice(2).split(/[?#]/, 1)[0];
    return [path, digest(await readFile('dist/' + file))];
  })));
}

async function verifyBuild(url, expected) {
  const base = new URL(url.endsWith('/') ? url : url + '/');
  const files = Object.entries(expected);
  if (!expected['./'] || files.length < 3) throw Error('Missing expected build files');
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      // Check the landing page first so an old CDN response does not trigger asset requests.
      for (const [path, hash] of files) {
        const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
        if (digest(Buffer.from(await response.arrayBuffer())) !== hash) {
          throw Error(`${path}: response differs from this build`);
        }
      }
      console.log(`Verified ${files.length} deployed files at ${base.href}`);
      return;
    } catch (error) {
      console.warn(`Pages verification ${attempt}/8: ${error.message}`);
      if (attempt === 8) throw error;
      await delay(5000);
    }
  }
}

if (process.argv[2] === 'record') {
  console.log(JSON.stringify(await recordBuild()));
} else if (process.argv[2] === 'verify') {
  await verifyBuild(process.env.PAGES_URL, JSON.parse(process.env.RELEASE_FILES));
} else {
  throw Error('Usage: node scripts/check-pages-build.mjs record|verify');
}
