// Rasterize our code-authored UI paints; keep the SVGs as editable sources.
// Start a local headless Chrome with --remote-debugging-port=9333 first.
// node --experimental-websocket scripts/render-ui-surfaces.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('../public/assets/ui/surfaces/', import.meta.url);
const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let serial = 0;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
try {
  // Do not bake a browser's own auto-dark conversion into the resources.
  await call('Emulation.setAutoDarkModeOverride', { enabled: false });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  let count = 0;
  for (const file of (await readdir(directory)).filter(file => file.endsWith('.svg'))) {
    const svg = await readFile(new URL(file, directory), 'utf8');
    const source = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    const result = await call('Runtime.evaluate', {
      expression: `(async()=>{const image=new Image();image.src=${JSON.stringify(source)};await image.decode();const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const context=canvas.getContext('2d');context.drawImage(image,0,0,256,256);return canvas.toDataURL('image/png').split(',')[1]})()`,
      awaitPromise: true, returnByValue: true,
    });
    if (result.exceptionDetails || !result.result?.value) throw new Error('Failed to rasterize ' + file);
    await writeFile(new URL(file.replace(/\.svg$/, '.png'), directory), Buffer.from(result.result.value, 'base64'));
    count++;
  }
  console.log(`Rendered ${count} UI surfaces to ${fileURLToPath(directory)}`);
} finally { socket.close(); }
