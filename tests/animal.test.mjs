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
  assert.deepEqual(lobby.size, [960, 540]);
  app.screen = { width: 844, height: 390 };
  manager.resize();
  assert.deepEqual(lobby.size, [960, 540]);
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

test('autonomy visits every daily state and never leaves its changing bounds', () => {
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
      durations: { IDLE: [0.1, 0.1], REST: [1, 1], SLEEP: [3, 3], OBSERVE: [1, 1] },
      weights: { WANDER: 0, REST: 0, SLEEP: 1, OBSERVE: 0 },
      wanderDistance: [80, 80],
    },
  }, () => 0.25);
  animal.setBounds(390, 590);
  animal.update(0.11);
  assert.equal(animal.state, 'SLEEP');
  assert.equal(animal.children[1].visible, true);
  const sleepFrame = animal.children[0].currentFrame;
  const sleepingX = animal.x;
  animal.update(1.1);
  assert.notEqual(animal.children[0].currentFrame, sleepFrame);
  assert.equal(animal.x, sleepingX);
  animal.play('walk');
  assert.equal(animal.state, 'WANDER');
  assert.equal(animal.children[1].visible, false);
  animal.resumeAutonomy();
  assert.equal(animal.state, 'IDLE');
  assert.equal(animal.children[1].visible, false);
  animal.update(0.11);
  animal.update(3.01);
  assert.equal(animal.state, 'IDLE');
  assert.equal(animal.children[1].visible, false);
  animal.destroy({ children: true });
});

const { WelcomeSequence } = await importTs('../src/systems/WelcomeSequence.ts', import.meta.url);

test('welcome runs notice, approach and greet exactly once before ending', () => {
  const welcome = new WelcomeSequence(90);
  welcome.setBounds(100, 1180);
  assert.equal(welcome.start(), true);
  const spawn = welcome.x;
  assert.equal(welcome.state, 'NOTICE');
  assert.equal(welcome.start(), false);
  welcome.update(0.3);
  assert.equal(welcome.x, spawn);
  const visited = new Set([welcome.state]);
  for (let i = 0; i < 1200 && welcome.active; i++) {
    welcome.update(1 / 60);
    if (welcome.state) visited.add(welcome.state);
    assert.ok(welcome.x >= 100 && welcome.x <= 1180);
  }
  assert.deepEqual([...visited], ['NOTICE', 'APPROACH', 'GREET']);
  assert.equal(welcome.active, false);
  assert.equal(welcome.x, 640);
  assert.equal(welcome.start(), false);
  const stopped = welcome.x;
  welcome.update(30);
  assert.equal(welcome.x, stopped);
});

test('welcome target follows resize and degenerate areas do not trap approach', () => {
  const welcome = new WelcomeSequence(90);
  welcome.setBounds(100, 1180);
  welcome.start();
  welcome.update(0.9);
  welcome.update(0.3);
  welcome.setBounds(76.8, 243.2);
  for (let i = 0; i < 1200 && welcome.active; i++) {
    welcome.update(1 / 60);
    assert.ok(welcome.x >= 76.8 && welcome.x <= 243.2);
  }
  assert.equal(welcome.active, false);
  assert.equal(welcome.x, 160);
  const tiny = new WelcomeSequence(90);
  tiny.setBounds(80, 80);
  tiny.start();
  for (let i = 0; i < 600; i++) tiny.update(1 / 60);
  assert.equal(tiny.active, false);
  assert.equal(tiny.x, 80);
});

test('animal pauses daily behavior during welcome, then resumes autonomous life', () => {
  const animal = createAnimal();
  animal.setBounds(390, 590);
  assert.equal(animal.startWelcome(), true);
  assert.equal(animal.state, 'NOTICE');
  assert.equal(animal.play('walk'), false);
  animal.resumeAutonomy();
  assert.equal(animal.state, 'NOTICE');
  const greetingStates = new Set();
  for (let i = 0; i < 1200 && animal.welcoming; i++) {
    greetingStates.add(animal.state);
    animal.update(1 / 60);
    if (animal.state === 'GREET') assert.equal(animal.children[2].visible, true);
  }
  assert.deepEqual([...greetingStates], ['NOTICE', 'APPROACH', 'GREET']);
  assert.equal(animal.welcoming, false);
  assert.equal(animal.mode, 'auto');
  assert.equal(animal.state, 'IDLE');
  assert.equal(animal.children[2].visible, false);
  assert.equal(animal.children[0].pivot.y, 0);
  assert.equal(animal.children[0].rotation, 0);
  assert.equal(animal.startWelcome(), false);
  assert.equal(animal.play('walk'), true);
  animal.destroy({ children: true });
});

test('title has no corgi, opens one autonomous lobby, and all five menu placeholders are inert', async () => {
  class Element extends EventTarget {
    children = [];
    parent = undefined;
    attributes = new Map();
    classList = { add() {}, remove() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    setAttribute(name, value) { this.attributes.set(name, value); }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = undefined;
    }
  }
  const originalDocument = globalThis.document;
  const host = new Element('main');
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    querySelector: (selector) => selector === '#app' ? host : null,
  };
  const { Container } = await import('pixi.js');
  const { SceneManager } = await importTs('../src/game/SceneManager.ts', import.meta.url);
  const { TitleScene } = await importTs('../src/game/scenes/TitleScene.ts', import.meta.url);
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const app = { stage: new Container(), screen: { width: 960, height: 540 } };
  const manager = new SceneManager(app);
  let entries = 0;
  const config = {
    id: 'corgi', speed: 90, scale: 0.62,
    animations: {
      idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 },
      walk: { frames: Array(8).fill(Texture.WHITE), fps: 8 },
      jump: { frames: Array(8).fill(Texture.WHITE), fps: 8 },
      emote: { frames: Array(8).fill(Texture.WHITE), fps: 4 },
    },
  };
  try {
    const title = new TitleScene(() => { entries++; manager.show(new LobbyScene(config)); });
    manager.show(title);
    manager.update(0.1);
    assert.equal(title.children.length, 1); // background only: no character portrait
    assert.equal(host.children.length, 1);
    const start = host.children[0].children.find((element) => element.tag === 'button');
    for (let i = 0; i < 10; i++) start.dispatchEvent(new Event('click'));
    assert.equal(entries, 1);
    assert.equal(title.destroyed, true);
    assert.equal(app.stage.children.length, 1);
    assert.equal(host.children.length, 1);
    const hud = host.children[0];
    const menus = [
      ...hud.children[0].children, ...hud.children[1].children, ...hud.children[2].children,
    ];
    assert.deepEqual(menus.map((item) => item.attributes.get('data-menu')),
      ['character', 'friends', 'shop', 'settings', 'play']);
    assert.deepEqual(menus.map((item) => item.children[1].textContent),
      ['Character', 'Friends', 'Shop', 'Settings', 'Play']);
    assert.equal(hud.children[0].className, 'hud-character');
    assert.equal(hud.children[1].className, 'hud-utilities');
    assert.equal(hud.children[2].className, 'hud-play');
    for (const menu of menus) {
      assert.equal(menu.disabled, true);
      assert.equal(menu.children[0].tag, 'img');
      menu.dispatchEvent(new Event('click'));
    }
    const animal = app.stage.children[0].children.find((child) => child.label === 'corgi');
    assert.equal(animal.state, 'NOTICE');
    for (let i = 0; i < 20; i++) manager.resize();
    for (let i = 0; i < 2400; i++) manager.update(1 / 60);
    assert.equal(animal.welcoming, false);
    assert.equal(animal.mode, 'auto');
    const before = animal.state;
    for (const menu of menus) menu.dispatchEvent(new Event('click'));
    assert.equal(animal.state, before);
    manager.destroy();
    assert.equal(host.children.length, 0);
    start.dispatchEvent(new Event('click'));
    assert.equal(entries, 1);
  } finally {
    manager.destroy();
    app.stage.destroy();
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('16:9 logical viewport fits desktop, landscape and portrait without clipping', async () => {
  const { fitViewport, WORLD_WIDTH, WORLD_HEIGHT } = await importTs('../src/game/viewport.ts', import.meta.url);
  assert.equal(WORLD_WIDTH / WORLD_HEIGHT, 16 / 9);
  for (const [width, height] of [[1920, 1080], [1280, 720], [844, 390], [390, 844], [320, 568]]) {
    const view = fitViewport(width, height);
    assert.ok(view.x >= 0 && view.y >= 0);
    assert.ok(view.x + WORLD_WIDTH * view.scale <= width + 0.001);
    assert.ok(view.y + WORLD_HEIGHT * view.scale <= height + 0.001);
    assert.ok(Math.abs((WORLD_WIDTH * view.scale) / (WORLD_HEIGHT * view.scale) - 16 / 9) < 1e-12);
  }
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(html.includes('game-heading'), false);
});

test('jump follows an airborne arc, lands, and restores ground alignment', () => {
  const animal = new Animal({
    id: 'corgi', speed: 90, scale: 0.62,
    animations: {
      idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 },
      walk: { frames: Array(8).fill(Texture.WHITE), fps: 8 },
      jump: { frames: Array(8).fill(Texture.WHITE), fps: 8 },
    },
    behavior: { durations: { IDLE: [0.1, 0.1], JUMP: [1, 1], LAND: [0.2, 0.2] },
      weights: { JUMP: 1 }, wanderDistance: [80, 80] },
  }, () => 0.5);
  animal.setBounds(960, 390);
  animal.update(0.11);
  assert.equal(animal.state, 'JUMP');
  animal.update(0.5);
  assert.equal(animal.y, 390);
  assert.equal(animal.children[0].y, -48);
  assert.equal(animal.children[0].currentFrame, 3);
  animal.update(0.51);
  assert.equal(animal.state, 'LAND');
  assert.equal(animal.children[0].y, 0);
  assert.equal(animal.children[0].currentFrame, 6);
  animal.update(0.21);
  assert.equal(animal.state, 'IDLE');
  assert.equal(animal.children[0].y, 0);
  assert.equal(animal.children[0].scale.y, 0.62);
  animal.destroy({ children: true });
});

test('emote plays on its own then clears its floating expression', () => {
  const animal = new Animal({
    id: 'corgi', speed: 90, scale: 0.62,
    animations: {
      idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 },
      emote: { frames: Array(8).fill(Texture.WHITE), fps: 4 },
    },
    behavior: { durations: { IDLE: [0.1, 0.1], EMOTE: [0.3, 0.3] },
      weights: { EMOTE: 1 }, wanderDistance: [80, 80] },
  }, () => 0.5);
  animal.setBounds(960, 390);
  animal.update(0.11);
  assert.equal(animal.state, 'EMOTE');
  assert.equal(animal.children[2].visible, true);
  animal.update(0.31);
  assert.equal(animal.state, 'IDLE');
  assert.equal(animal.children[2].visible, false);
  animal.destroy({ children: true });
});

test('jump/emote atlas has eight separated frames each within the actual PNG dimensions', async () => {
  const map = JSON.parse(await readFile(new URL('../public/assets/characters/corgi/playful-frames.json', import.meta.url), 'utf8'));
  const png = await readFile(new URL('../public/assets/characters/corgi/corgi-jump-emote.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), map.width);
  assert.equal(png.readUInt32BE(20), map.height);
  for (const action of ['jump', 'emote']) {
    assert.equal(map[action].length, 8);
    for (let i = 0; i < 8; i++) {
      const frame = map[action][i];
      assert.ok(frame.width > 0 && frame.width <= 256 && frame.height > 0 && frame.height <= 256);
      assert.ok(frame.x >= 0 && frame.x + frame.width <= map.width);
      assert.ok(frame.y >= 0 && frame.y + frame.height <= map.height);
      if (i > 0) assert.ok(map[action][i - 1].x + map[action][i - 1].width < frame.x);
    }
  }
});

const { AnimalAnimationController } = await importTs('../src/animals/AnimalAnimationController.ts', import.meta.url);
function createAnimationController() {
  const frames = Array.from({ length: 8 }, () => Texture.WHITE);
  return new AnimalAnimationController({ id: 'test', speed: 90, scale: 1,
    animations: { idle: { frames, fps: 3 }, walk: { frames, fps: 8 }, emote: { frames, fps: 4 } } });
}
function destroyAnimationController(controller) {
  controller.sprite.destroy(); controller.sleepMark.destroy(); controller.welcomeMark.destroy();
}

test('rest, sleep and observe keep animating instead of holding a single frame', () => {
  for (const [state, duration] of [['REST', 3], ['SLEEP', 7], ['OBSERVE', 2]]) {
    const controller = createAnimationController();
    const seen = new Set();
    for (let i = 0; i < duration * 60; i++) {
      controller.update(state, i / 60, 1, 0, 0, 1 / 60);
      seen.add(controller.sprite.currentFrame);
    }
    assert.ok(seen.size >= 4, `${state} must keep advancing frames: ${[...seen]}`);
    destroyAnimationController(controller);
  }
});

test('shared idle playback survives behavior timer resets and independent clips restart', () => {
  const controller = createAnimationController();
  controller.update('IDLE', 1.1, 1, 0, 0, 1.1);
  assert.equal(controller.sprite.currentFrame, 3);
  for (const state of ['OBSERVE', 'REST', 'SLEEP', 'IDLE', 'NOTICE', 'GREET']) {
    controller.update(state, 0, 1);
    assert.equal(controller.sprite.currentFrame, 3, `${state} must preserve clip progress`);
  }
  controller.update('WANDER', 0, 1);
  assert.equal(controller.sprite.currentFrame, 0);
  controller.update('WANDER', 0.5, 1, 0, 0, 0.5);
  assert.equal(controller.sprite.currentFrame, 4);
  controller.update('EMOTE', 0, 1);
  assert.equal(controller.sprite.currentFrame, 0);
  controller.update('EMOTE', 1, 1, 0, 0, 1);
  assert.equal(controller.sprite.currentFrame, 4);
  destroyAnimationController(controller);
});
const { DummyRun } = await importTs('../src/game/DummyRun.ts', import.meta.url);
test('dummy course takes ten seconds and returns only after victory and fade', () => {
  const run = new DummyRun();
  for (let i = 0; i < 599; i++) run.update(1 / 60, 1);
  assert.equal(run.won, false);
  run.update(1 / 60, 1);
  assert.equal(run.won, true);
  assert.equal(run.x, run.finish);
  run.jump(); run.startDash(); run.startAttack();
  run.update(1.5, -1);
  assert.equal(run.x, run.finish);
  assert.equal(run.height, 0);
  assert.equal(run.fade, 0);
  assert.equal(run.returnReady, false);
  run.update(0.2, 0);
  assert.ok(Math.abs(run.fade - 0.5) < 0.001);
  run.update(0.21, 0);
  assert.equal(run.returnReady, true);
  assert.equal(run.fade, 1);
});
test('dummy controls jump, land, dash with cooldown and expire attack', () => {
  const run = new DummyRun();
  run.update(1, -1);
  assert.equal(run.x, run.start);
  run.jump(); run.update(0.1, 0);
  assert.ok(run.height > 0);
  const velocity = run.velocity;
  run.jump(); assert.equal(run.velocity, velocity);
  for (let i = 0; i < 90; i++) run.update(1 / 60, 0);
  assert.equal(run.height, 0);
  run.direction = 1;
  run.startDash(); run.startAttack(); run.update(0.1, 0);
  assert.ok(run.x > run.start);
  const cooldown = run.dashCooldown;
  run.startDash(); assert.equal(run.dashCooldown, cooldown);
  for (let i = 0; i < 60; i++) run.update(1 / 60, 0);
  assert.equal(run.attack, 0);
  assert.equal(run.dash, 0);
});

test('Play enters a run, victory returns once without another greeting, and scenes clean up', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); style = {}; classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
    setAttribute(key, value) { this.attributes.set(key, value); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  const host = new Element('main');
  globalThis.document = Object.assign(new EventTarget(), { createElement: tag => new Element(tag), querySelector: () => host });
  globalThis.window = new EventTarget();
  const { Container } = await import('pixi.js');
  const { SceneManager } = await importTs('../src/game/SceneManager.ts', import.meta.url);
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const { PlayScene } = await importTs('../src/game/scenes/PlayScene.ts', import.meta.url);
  const app = { stage: new Container(), screen: { width: 960, height: 540 } };
  const manager = new SceneManager(app);
  const config = { id: 'corgi', speed: 90, scale: 0.62, animations: {
    idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 }, walk: { frames: Array(8).fill(Texture.WHITE), fps: 8 },
    jump: { frames: Array(8).fill(Texture.WHITE), fps: 8 } } };
  let returns = 0;
  try {
    manager.show(new LobbyScene(config, () => manager.show(new PlayScene(config, () => {
      returns++; manager.show(new LobbyScene(config, undefined, true));
    }))));
    const playButton = host.children[0].children[2].children[0];
    assert.equal(playButton.disabled, false);
    playButton.dispatchEvent(new Event('click'));
    const runHud = host.children[0];
    assert.equal(runHud.className, 'play-hud');
    assert.deepEqual(runHud.children[1].children.map(item => item.textContent), ['Attack', 'Dash', 'Jump']);
    const down = new Event('keydown', { cancelable: true });
    Object.defineProperty(down, 'code', { value: 'ArrowRight' });
    window.dispatchEvent(down);
    for (let i = 0; i < 600; i++) manager.update(1 / 60);
    assert.equal(runHud.children[3].hidden, false);
    for (let i = 0; i < 120; i++) manager.update(1 / 60);
    assert.equal(returns, 1);
    assert.equal(host.children.length, 1);
    assert.equal(app.stage.children.length, 1);
    const pet = app.stage.children[0].children.find(item => item.label === 'corgi');
    assert.equal(pet.welcoming, false);
    assert.equal(pet.mode, 'auto');
    window.dispatchEvent(down);
    manager.destroy();
    assert.equal(host.children.length, 0);
  } finally {
    manager.destroy(); app.stage.destroy();
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});
test('air attack preserves jump physics, air dash is blocked and ground dash cannot be cancelled', () => {
  const run = new DummyRun(), baseline = new DummyRun();
  run.jump(); baseline.jump();
  run.startDash(); assert.equal(run.dash, 0); // also blocked before first airborne tick
  for (let i = 0; i < 20; i++) { run.update(1 / 60, 1); baseline.update(1 / 60, 1); }
  run.startDash(); assert.equal(run.dash, 0);
  run.startAttack(); assert.equal(run.action(1), 'attack');
  const duration = run.attack;
  run.startAttack(); assert.equal(run.attack, duration);
  for (let i = 0; i < 60; i++) {
    run.update(1 / 60, 1); baseline.update(1 / 60, 1);
    assert.equal(run.height, baseline.height); assert.equal(run.velocity, baseline.velocity);
  }
  assert.equal(run.velocity, 0); assert.equal(run.action(1), 'run');
  run.startDash(); assert.equal(run.action(1), 'skill');
  run.jump(); run.startAttack();
  assert.equal(run.velocity, 0); assert.equal(run.attack, 0);
  run.update(0.4, 0); assert.equal(run.action(0), 'idle');
});

test('game selects Run/Attack/Skill textures while lobby WANDER still uses Walk', () => {
  const animations = Object.fromEntries(['idle', 'walk', 'run', 'attack', 'skill'].map(key =>
    [key, { frames: Array(8).fill(Texture.WHITE), fps: 8 }]));
  const controller = new AnimalAnimationController({ id: 'test', speed: 90, scale: 1, animations });
  controller.update('WANDER', 0, 1, 0, 0, 0.1);
  assert.equal(controller.sprite.textures, animations.walk.frames);
  for (const action of ['run', 'attack', 'skill']) {
    controller.update('IDLE', 0, 1, 0, 0, 0, action, action === 'run' ? undefined : 0.5);
    assert.equal(controller.sprite.textures, animations[action].frames);
    if (action !== 'run') assert.equal(controller.sprite.currentFrame, 4);
  }
  destroyAnimationController(controller);
});

test('run, attack and skill atlas contains eight valid frames per row and true alpha', async () => {
  const map = JSON.parse(await readFile(new URL('../public/assets/characters/corgi/combat-frames.json', import.meta.url), 'utf8'));
  const png = await readFile(new URL('../public/assets/characters/corgi/corgi-run-attack-skill.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), map.width); assert.equal(png.readUInt32BE(20), map.height);
  assert.equal(png[25], 6); // RGBA
  for (const [row, key] of ['run', 'attack', 'skill'].entries()) {
    assert.equal(map[key].length, 8);
    for (const [col, rect] of map[key].entries()) {
      assert.ok(rect.width > 0 && rect.width <= 256 && rect.height > 0 && rect.height <= 256);
      assert.ok(rect.x >= col * 256 && rect.x + rect.width <= (col + 1) * 256);
      assert.ok(rect.y >= row * 256 && rect.y + rect.height <= (row + 1) * 256);
    }
  }
});