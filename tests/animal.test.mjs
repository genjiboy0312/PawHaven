import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importTs } from './load-typescript.mjs';
// PixiJS checks userAgent at module load; no renderer or DOM is used in these tests.
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Node.js' }, configurable: true });
const { Texture } = await import('pixi.js');

const { Animal } = await importTs('../src/animals/Animal.ts', import.meta.url);
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
  const { SceneManager } = await importTs('../src/game/SceneManager.ts', import.meta.url);
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

const { AnimalStateMachine } = await importTs('../src/animals/AnimalStateMachine.ts', import.meta.url);
const { ANIMAL_STATES, CORGI_BEHAVIOR } = await importTs('../src/animals/AnimalState.ts', import.meta.url);

function seededRandom(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

test('autonomy visits all five daily states and never leaves its changing bounds', () => {
  for (const seed of [1, 42, 999]) {
    const machine = new AnimalStateMachine(90, CORGI_BEHAVIOR, seededRandom(seed));
    let left = 100, right = 1180;
    machine.setBounds(left, right);
    const visited = new Set();
    for (let frame = 0; frame < 72000; frame++) {
      if (frame === 12000) { left = 93.6; right = 296.4; machine.setBounds(left, right); }
      if (frame === 24000) { left = 76.8; right = 243.2; machine.setBounds(left, right); }
      if (frame === 36000) { left = 100; right = 1180; machine.setBounds(left, right); }
      const beforeX = machine.x;
      const beforeState = machine.state;
      machine.update(1 / 60);
      visited.add(machine.state);
      assert.ok(machine.x >= left && machine.x <= right);
      assert.ok(Number.isFinite(machine.elapsed));
      if (beforeState !== 'WANDER') assert.equal(machine.x, beforeX);
    }
    assert.deepEqual([...visited].sort(), [...ANIMAL_STATES].sort());
  }
});

test('each non-idle state finishes, and clipped wander target does not stall', () => {
  for (const state of ['WANDER', 'REST', 'SLEEP', 'OBSERVE']) {
    const profile = {
      durations: { IDLE: [0.1, 0.1], REST: [0.5, 0.5], SLEEP: [1, 1], OBSERVE: [0.5, 0.5] },
      weights: { WANDER: 0, REST: 0, SLEEP: 0, OBSERVE: 0, [state]: 1 },
      wanderDistance: [80, 80],
    };
    const machine = new AnimalStateMachine(90, profile, () => 0.25);
    machine.setBounds(100, 300);
    machine.update(0.11);
    assert.equal(machine.state, state);
    if (state === 'WANDER') machine.setBounds(150, 150);
    for (let i = 0; i < 100 && machine.state !== 'IDLE'; i++) machine.update(0.02);
    assert.equal(machine.state, 'IDLE');
  }
});

test('manual controls override autonomy and can resume it without stale movement', () => {
  const machine = new AnimalStateMachine(90, CORGI_BEHAVIOR, seededRandom(12));
  machine.setBounds(80, 310);
  machine.setMode('walk');
  machine.update(0.2);
  machine.setMode('idle');
  const stopped = machine.x;
  for (let i = 0; i < 600; i++) machine.update(1 / 60);
  assert.equal(machine.x, stopped);
  assert.equal(machine.state, 'IDLE');
  machine.setMode('auto');
  const states = new Set();
  for (let i = 0; i < 18000; i++) { machine.update(1 / 60); states.add(machine.state); }
  assert.ok(states.size > 1);
  const elapsed = machine.elapsed;
  machine.update(NaN);
  machine.update(-1);
  machine.update(0);
  assert.equal(machine.elapsed, elapsed);
});

test('two instances keep independent positions and timers', () => {
  const first = new AnimalStateMachine(90, CORGI_BEHAVIOR, seededRandom(1));
  const second = new AnimalStateMachine(60, CORGI_BEHAVIOR, seededRandom(2));
  first.setBounds(100, 500);
  second.setBounds(100, 500);
  first.setMode('walk');
  first.update(0.5);
  assert.notEqual(first.x, second.x);
  assert.equal(second.state, 'IDLE');
  assert.equal(second.elapsed, 0);
});

test('sleep expression follows automatic state and clears immediately on manual movement', () => {
  const animal = new Animal({
    id: 'corgi', speed: 90, scale: 0.62,
    animations: {
      idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 },
      walk: { frames: Array(8).fill(Texture.WHITE), fps: 8 },
    },
    behavior: {
      durations: { IDLE: [0.1, 0.1], REST: [1, 1], SLEEP: [0.5, 0.5], OBSERVE: [1, 1] },
      weights: { WANDER: 0, REST: 0, SLEEP: 1, OBSERVE: 0 },
      wanderDistance: [80, 80],
    },
  }, () => 0.25);
  animal.setBounds(390, 590);
  animal.update(0.11);
  assert.equal(animal.state, 'SLEEP');
  assert.equal(animal.children[1].visible, true);
  assert.equal(animal.children[0].currentFrame, 5);
  const sleepingX = animal.x;
  animal.update(0.2);
  assert.equal(animal.x, sleepingX);
  animal.play('walk');
  assert.equal(animal.state, 'WANDER');
  assert.equal(animal.children[1].visible, false);
  animal.resumeAutonomy();
  assert.equal(animal.state, 'IDLE');
  assert.equal(animal.children[1].visible, false);
  animal.update(0.11);
  animal.update(0.51);
  assert.equal(animal.state, 'IDLE');
  assert.equal(animal.children[1].visible, false);
  animal.destroy({ children: true });
});
