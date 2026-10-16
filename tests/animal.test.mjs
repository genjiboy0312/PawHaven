import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
// PixiJS checks userAgent at module load; no renderer or DOM is used in these tests.
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Node.js' }, configurable: true });
const { Texture } = await import('pixi.js');

const source = (await readFile(new URL('../src/animals/Animal.ts', import.meta.url), 'utf8'))
  .replace("'pixi.js'", JSON.stringify(import.meta.resolve('pixi.js')));
const compiled = (await transformWithOxc(source, 'Animal.ts')).code;
const { Animal } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
function createAnimal() {
  return new Animal({ id: 'corgi', speed: 90, scale: 0.62,
    animations: { idle: { frames: [Texture.WHITE], fps: 3 }, walk: { frames: [Texture.WHITE], fps: 8 } } });
}

test('walk remains inside viewport, turns both directions and survives resize', () => {
  const animal = createAnimal();
  animal.setBounds(390, 590);
  animal.play('walk');
  const directions = new Set();
  for (let frame = 0; frame < 7200; frame++) {
    animal.update(1 / 60);
    assert.ok(animal.x >= 93.6 && animal.x <= 296.4);
    assert.equal(animal.y, 590);
    directions.add(Math.sign(animal.children[0].scale.x));
  }
  assert.deepEqual([...directions].sort(), [-1, 1]);
  animal.setBounds(320, 300);
  assert.ok(animal.x >= 76.8 && animal.x <= 243.2);
  assert.equal(animal.y, 300);
  animal.play('idle');
  const stopped = animal.x;
  animal.update(3);
  assert.equal(animal.x, stopped);
  assert.equal(animal.play('jump'), false);
  animal.destroy({ children: true });
  assert.equal(animal.destroyed, true);
});

test('runtime rectangles are valid, isolated and fit one normalized canvas', async () => {
  const map = JSON.parse(await readFile(new URL('../public/assets/characters/corgi/frames.json', import.meta.url), 'utf8'));
  for (const frames of Object.values(map)) {
    assert.equal(frames.length, 8);
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      assert.ok(frame.width > 0 && frame.width <= 256);
      assert.ok(frame.height > 0 && frame.height <= 240);
      assert.ok(frame.x >= 0 && frame.x + frame.width <= 1983);
      assert.ok(frame.y >= 0 && frame.y + frame.height <= 793);
      if (i > 0) assert.ok(frames[i - 1].x + frames[i - 1].width < frame.x);
    }
  }
});




test('scene replacement destroys old content and leaves no duplicate children', async () => {
  const { Container } = await import('pixi.js');
  const sceneSource = await readFile(new URL('../src/game/SceneManager.ts', import.meta.url), 'utf8');
  const sceneCode = (await transformWithOxc(sceneSource, 'SceneManager.ts')).code;
  const { SceneManager } = await import('data:text/javascript;base64,' + Buffer.from(sceneCode).toString('base64'));
  const app = { stage: new Container(), screen: { width: 390, height: 844 } };
  const manager = new SceneManager(app);
  class CheckScene extends Container {
    resize(width, height) { this.size = [width, height]; }
    update(seconds) { this.seconds = seconds; }
  }
  const boot = new CheckScene();
  manager.show(boot);
  const lobby = new CheckScene();
  manager.show(lobby);
  assert.equal(boot.destroyed, true);
  assert.equal(app.stage.children.length, 1);
  assert.deepEqual(lobby.size, [390, 844]);
  app.screen = { width: 844, height: 390 };
  manager.resize();
  assert.deepEqual(lobby.size, [844, 390]);
  manager.update(0.05);
  assert.equal(lobby.seconds, 0.05);
  manager.destroy();
  manager.destroy();
  assert.equal(lobby.destroyed, true);
  assert.equal(app.stage.children.length, 0);
  app.stage.destroy();
});
