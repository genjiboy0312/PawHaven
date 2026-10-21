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

test('title has no corgi, opens one autonomous lobby, and all seven menu placeholders are inert', async () => {
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
      ['character', 'home', 'quest', 'friends', 'shop', 'settings', 'play']);
    assert.deepEqual(menus.map((item) => item.children[1].textContent),
      ['Character', 'Home', 'Quest', 'Friends', 'Shop', 'Settings', 'Play']);
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
const flatCourse = [{ x: 0, width: 2850, top: 0, bottom: -300 }];
test('dummy course takes ten seconds and returns only after victory and fade', () => {
  const run = new DummyRun(flatCourse);
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
  const run = new DummyRun(flatCourse);
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
    getAttribute(key) { return this.attributes.get(key) ?? null; }
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
  let returns = 0; const daily = new ShopState();
  try {
    manager.show(new LobbyScene(config, () => manager.show(new PlayScene(config, () => {
      returns++; daily.completeRun(); manager.show(new LobbyScene(config, undefined, true));
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
    const world = app.stage.children[0].children[1], player = world.children.at(-1);
    assert.equal(world.scale.x, 0.78); assert.equal(world.scale.y, 0.78);
    assert.ok(Math.abs(world.y + 390 * world.scale.y - 365) < 0.001);
    // First attempt deliberately misses the gap; failure must not award Victory or keep held input.
    const warmup = [560, 1260]; let warmupJump = 0, reset = false;
    for (let i = 0; i < 2200; i++) {
      if (warmupJump < warmup.length && player.x >= warmup[warmupJump]) {
        window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code: 'Space' })); warmupJump++;
      }
      manager.update(1 / 60);
      if (warmupJump === 2 && player.x === 120) { reset = true; break; }
    }
    assert.equal(reset, true); assert.equal(returns, 0); assert.equal(runHud.children[3].hidden, true);
    assert.equal(daily.dailyQuests[1].progress, 0);
    manager.update(0.2); assert.equal(player.x, 120); assert.equal(player.y, 390);
    window.dispatchEvent(down);
    const takeoffs = [560, 1260, 2190, 3210, 3760, 4390, 5410]; let nextJump = 0;
    for (let i = 0; i < 2200; i++) {
      if (nextJump < takeoffs.length && player.x >= takeoffs[nextJump]) {
        const jump = Object.assign(new Event('keydown', { cancelable: true }), { code: 'Space' });
        window.dispatchEvent(jump); nextJump++;
      }
      manager.update(1 / 60);
      if (!runHud.children[3].hidden) break;
    }
    assert.equal(runHud.children[3].hidden, false);
    assert.equal(world.scale.x, 0.78); assert.equal(world.scale.y, 0.78);
    app.stage.children[0].back.dispatchEvent(new Event('click'));
    for (let i = 0; i < 120; i++) manager.update(1 / 60);
    assert.equal(returns, 1);
    assert.equal(daily.dailyQuests[1].progress, 1);
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
  const run = new DummyRun(flatCourse), baseline = new DummyRun(flatCourse);
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
test('dash has a forward impulse, decays, locks direction and is consistent across frame rates', () => {
  const run = new DummyRun(flatCourse);
  run.startDash();
  assert.equal(run.horizontalVelocity, 1100);
  const start = run.x;
  run.update(0.05, -1);
  assert.equal(run.direction, 1);
  assert.ok(run.x - start > run.speed * 0.05 * 3);
  const fast = run.horizontalVelocity;
  run.update(0.05, 0);
  assert.ok(run.horizontalVelocity < fast && run.horizontalVelocity > run.speed);
  const other = new DummyRun(flatCourse); other.startDash();
  for (let i = 0; i < 6; i++) other.update(1 / 60, 0);
  assert.ok(Math.abs(run.x - other.x) < 1e-8);
  const left = new DummyRun(flatCourse); left.x = 500; left.direction = -1; left.startDash(); left.update(0.1, 1);
  assert.ok(left.x < 500); assert.equal(left.direction, -1);
});

test('clean action cells retain padding and their aligned trim fits the logical canvas', async () => {
  const map = JSON.parse(await readFile(new URL('../public/assets/characters/corgi/clean-frames.json', import.meta.url), 'utf8'));
  const png = await readFile(new URL('../public/assets/characters/corgi/corgi-actions-clean.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), map.width); assert.equal(png.readUInt32BE(20), map.height);
  for (const frames of Object.values(map.actions)) {
    assert.equal(frames.length, 4);
    for (const frame of frames) {
      assert.equal(frame.width, map.cellWidth); assert.equal(frame.height, map.cellHeight);
      assert.ok(frame.opaqueBounds.left >= 8 && frame.opaqueBounds.top >= 8);
      assert.ok(frame.opaqueBounds.right <= frame.width - 8 && frame.opaqueBounds.bottom <= frame.height - 8);
      const trimX = 256 - frame.center, trimY = 400 - frame.baseline;
      assert.ok(trimX >= 0 && trimX + frame.width <= 512);
      assert.ok(trimY >= 0 && trimY + frame.height <= 512);
      assert.equal(trimY + frame.baseline, 400); // paws keep their ground anchor
    }
  }
});

test('padded clips change their foot anchor and lobby idle restores the old anchor', () => {
  const frames = Array(4).fill(Texture.WHITE);
  const controller = new AnimalAnimationController({ id: 'padded', speed: 90, scale: 1,
    animations: { idle: { frames, fps: 3 }, jump: { frames, fps: 8, anchorY: 400 / 512 } } });
  controller.update('JUMP', 0.5, 1, 0.5);
  assert.equal(controller.sprite.currentFrame, 1);
  assert.equal(controller.sprite.anchor.y, 400 / 512);
  controller.update('LAND', 0.1, 1, 0.5);
  assert.equal(controller.sprite.currentFrame, 3);
  controller.update('IDLE', 0, 1);
  assert.equal(controller.sprite.anchor.y, 1);
  destroyAnimationController(controller);
});
test('raster effects follow action frames, mirror direction and clear with dash afterimages', async () => {
  const { AnimalEffects } = await importTs('../src/animals/AnimalEffects.ts', import.meta.url);
  const { Sprite } = await import('pixi.js');
  const frames = Array.from({ length: 4 }, () => new Texture({ source: Texture.WHITE.source }));
  const effect = new AnimalEffects({ attack: frames, skill: frames });
  const body = new Sprite(Texture.WHITE); body.anchor.set(0.5, 0.78); body.scale.set(-0.8, 0.8);
  effect.update('attack', 0.5, 1, body, 0);
  assert.equal(effect.children[1].texture, frames[2]);
  assert.equal(effect.children[1].visible, true);
  assert.equal(effect.children[0].visible, false);
  effect.update('skill', 0.25, -1, body, -800);
  assert.equal(effect.children[0].texture, frames[1]);
  assert.ok(effect.children[0].x > 0 && effect.children[0].scale.x < 0);
  for (const ghost of effect.ghosts) {
    assert.equal(ghost.visible, true); assert.equal(ghost.texture, body.texture);
    assert.ok(ghost.x > body.x); assert.ok(ghost.alpha > 0 && ghost.alpha < 0.2);
    assert.equal(ghost.anchor.y, body.anchor.y); assert.equal(ghost.scale.x, body.scale.x);
  }
  effect.update('attack', 1, -1, body, 0);
  assert.equal(effect.children[1].texture, frames[3]);
  effect.update('idle', 0, 1, body, 0);
  assert.ok(effect.children.every(sprite => !sprite.visible));
  assert.ok(effect.ghosts.every(sprite => !sprite.visible));
  effect.destroy({ children: true }); effect.ghosts.forEach(ghost => ghost.destroy()); body.destroy();
  frames.forEach(texture => texture.destroy(false));
});

test('pixel VFX map uses four complete isolated cells per action and an RGBA source', async () => {
  const map = JSON.parse(await readFile(new URL('../public/assets/characters/corgi/effect-frames.json', import.meta.url), 'utf8'));
  const png = await readFile(new URL('../public/assets/characters/corgi/corgi-pixel-effects.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), map.width); assert.equal(png.readUInt32BE(20), map.height);
  assert.equal(png[25], 6);
  for (const key of ['attack', 'skill']) {
    assert.equal(map[key].length, 4);
    for (const frame of map[key]) {
      assert.ok(frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0);
      assert.ok(frame.x + frame.width <= map.width && frame.y + frame.height <= map.height);
    }
  }
});
test('Character opens a stationary preview, keeps category selection without equipping dummy shapes and returns to the shared lobby', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); style = { setProperty() {} };
    classList = { add() {} }; scrollTop = 0;
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
    replaceChildren(...items) { this.children.forEach(item => { item.parent = undefined; }); this.children = []; this.append(...items); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document;
  const host = new Element('main');
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host };
  const { Container } = await import('pixi.js');
  const { createOutfit } = await importTs('../src/animals/OutfitState.ts', import.meta.url);
  const { CharacterScene } = await importTs('../src/game/scenes/CharacterScene.ts', import.meta.url);
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const { SceneManager } = await importTs('../src/game/SceneManager.ts', import.meta.url);
  const app = { stage: new Container(), screen: { width: 960, height: 540 } }, manager = new SceneManager(app);
  const config = { id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 }, emote: { frames: Array(8).fill(Texture.WHITE), fps: 4 } } };
  const { CharacterPresets } = await importTs('../src/animals/CharacterPresets.ts', import.meta.url);
  const presets = new CharacterPresets();
  const { CharacterSelection } = await importTs('../src/animals/CharacterSelection.ts', import.meta.url);
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const selection = new CharacterSelection(storage);
  const outfit = createOutfit(); let returns = 0;
  config.wardrobe = { outfit, santaHat: Texture.WHITE };
  for (const animation of Object.values(config.animations)) animation.head = animation.frames.map(() => ({ x: 18, y: -170, width: 88 }));
  const lobby = () => manager.show(new LobbyScene(config, undefined, true, () => {
    manager.show(new CharacterScene(config, outfit, () => { returns++; lobby(); }, { presets, onLookChanged: value => selection.save(value) }));
  }));
  try {
    lobby();
    const character = host.children[0].children[0].children[0];
    assert.equal(character.disabled, false);
    character.dispatchEvent(new Event('click'));
    const scene = app.stage.children[0], panel = host.children[0], tabs = panel.children[1], inventory = panel.children[2];
    assert.deepEqual(tabs.children.map(button => button.textContent), ['Pets', 'Hat', 'Body', 'Acc', 'Etc']);
    assert.equal(inventory.children.length, 1);
    assert.equal(inventory.children[0].children[0].className, 'pet-portrait');
    assert.equal(inventory.children[0].children[2].hidden, false);
    inventory.children[0].dispatchEvent(new Event('click'));
    tabs.children[1].dispatchEvent(new Event('click'));
    assert.equal(inventory.children.length, 21);
    assert.equal(inventory.children[1].children[0].className, 'outfit-object');
    assert.equal(inventory.children[1].children[0].src, './assets/items/santa-hat.png');
    assert.equal(scene.children[1].children.length, 2);
    inventory.children[1].dispatchEvent(new Event('click')); manager.update(0.01);
    assert.equal(scene.children[1].children[0].children[0].visible, true);
    inventory.children[0].dispatchEvent(new Event('click')); manager.update(0.01);
    assert.equal(scene.children[1].children[0].children[0].visible, false);
    inventory.children[3].dispatchEvent(new Event('click')); assert.equal(outfit.Hat, 3);
    assert.equal(new CharacterSelection(storage).current.outfit.Hat, 3);
    const presetRow = panel.children[3];
    assert.equal(presetRow.children.length, 4);
    presetRow.children[2].dispatchEvent(new Event('click')); assert.equal(outfit.Hat, 3);
    assert.equal(new CharacterSelection(storage).current.outfit.Hat, 3);
    assert.equal(presets.load(2), null);
    assert.equal(presetRow.children[2].children[2].textContent, 'Empty');
    assert.equal(presetRow.children[3].getAttribute('aria-label'), 'Save · Preset 3');
    presetRow.children[3].dispatchEvent(new Event('click')); assert.equal(presets.load(2).outfit.Hat, 3);
    assert.equal(presetRow.children[2].getAttribute('data-applied'), 'true');
    assert.equal(presetRow.children[2].children[2].textContent, 'Applied');
    inventory.children[4].dispatchEvent(new Event('click')); assert.equal(outfit.Hat, 4);
    assert.equal(presetRow.children[2].getAttribute('data-applied'), 'false');
    assert.equal(presetRow.children[2].children[2].textContent, 'Edited');
    assert.equal(presets.load(2).outfit.Hat, 3);
    presetRow.children[2].dispatchEvent(new Event('click')); assert.equal(outfit.Hat, 3);
    assert.equal(new CharacterSelection(storage).current.outfit.Hat, 3);
    assert.equal(inventory.children[3].attributes.get('aria-pressed'), 'true');
    tabs.children[2].dispatchEvent(new Event('click'));
    inventory.children[2].dispatchEvent(new Event('click')); assert.equal(outfit.Body, 2);
    tabs.children[1].dispatchEvent(new Event('click'));
    assert.equal(inventory.children[3].attributes.get('aria-pressed'), 'true');
    inventory.children[0].dispatchEvent(new Event('click')); assert.equal(outfit.Hat, 0);
    const preview = scene.children[1], x = preview.x, y = preview.y;
    const textures = new Set();
    for (let frame = 0; frame < 660; frame++) { manager.update(1 / 60); textures.add(preview.children[0].textures); }
    assert.equal(preview.x, x); assert.equal(preview.y, y); assert.equal(textures.size, 2);
    panel.children[0].dispatchEvent(new Event('click'));
    assert.equal(returns, 1); assert.equal(scene.destroyed, true); assert.equal(host.children.length, 1);
    const pet = app.stage.children[0].children.find(child => child.label === 'corgi');
    assert.equal(pet.welcoming, false); assert.equal(pet.children.length, 3);
    host.children[0].children[0].children[0].dispatchEvent(new Event('click'));
    host.children[0].children[1].children[2].dispatchEvent(new Event('click'));
    assert.equal(host.children[0].children[2].children[2].attributes.get('aria-pressed'), 'true');
    assert.equal(host.children[0].children[3].children[2].attributes.get('aria-pressed'), 'true');
    const other = { ...config, id: 'test-pet' }, changes = [];
    const multi = new CharacterScene(config, outfit, () => {}, { presets,
      pets: [{ config, name: 'Corgi', thumbnail: './corgi.png' }, { config: other, name: 'Test pet', thumbnail: './test.png' }],
      onPetChanged: pet => changes.push(pet.id), onLookChanged: look => selection.save(look) });
    manager.show(multi);
    const oldSprite = multi.children[1].children[0], petGrid = host.children[0].children[2];
    petGrid.children[1].dispatchEvent(new Event('click'));
    assert.equal(oldSprite.destroyed, true); assert.equal(changes.at(-1), 'test-pet');
    assert.equal(new CharacterSelection(storage).current.petId, 'test-pet');
    host.children[0].children[3].children[3].dispatchEvent(new Event('click'));
    assert.equal(presets.load(2).petId, 'test-pet');
    petGrid.children[0].dispatchEvent(new Event('click')); assert.equal(changes.at(-1), 'corgi');
    host.children[0].children[3].children[2].dispatchEvent(new Event('click'));
    assert.equal(changes.at(-1), 'test-pet');
    assert.equal(new CharacterSelection(storage).current.petId, 'test-pet');
    assert.equal(petGrid.children[1].attributes.get('aria-pressed'), 'true');
    manager.destroy(); assert.equal(host.children.length, 0);
  } finally {
    manager.destroy(); app.stage.destroy();
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
const { GameSettings, GAME_SETTINGS_KEY } = await importTs('../src/settings/GameSettings.ts', import.meta.url);
const { setLanguage, t } = await importTs('../src/settings/i18n.ts', import.meta.url);
const { SoundSettings, SOUND_STORAGE_KEY } = await importTs('../src/settings/SoundSettings.ts', import.meta.url);
test('sound preferences persist safely, clamp bad values, and tolerate blocked storage', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = new SoundSettings(storage);
  store.volume('master', 0.42); store.volume('bgm', 2); store.volume('sfx', -1); store.mute(true);
  assert.deepEqual(new SoundSettings(storage).current, { master: 0.42, bgm: 1, sfx: 0, muted: true });
  const copy = store.current; copy.master = 1; assert.equal(store.current.master, 0.42);
  store.volume('master', NaN); assert.equal(store.current.master, 0.42);
  values.set(SOUND_STORAGE_KEY, 'broken'); assert.equal(new SoundSettings(storage).current.master, 0.8);
  values.set(SOUND_STORAGE_KEY, '{"master":"bad","bgm":0.3,"muted":"yes"}');
  assert.deepEqual(new SoundSettings(storage).current, { master: 0.8, bgm: 0.3, sfx: 0.7, muted: false });
  const blocked = new SoundSettings({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  blocked.volume('sfx', 0.25); assert.equal(blocked.current.sfx, 0.25);
});

test('Settings overlays a live run, pauses controls, applies sound values, restores focus and resumes safely', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); style = {}; inert = false;
    classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
    replaceChildren(...items) { this.children.forEach(item => { item.parent = undefined; }); this.children = []; this.append(...items); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); this.parent = undefined; }
    get isConnected() { return this.tag === 'main' || !!this.parent?.isConnected; }
    focus() { document.activeElement = this; }
    querySelectorAll() {
      const result = []; const walk = node => { for (const item of node.children) { if (['button', 'input', 'a'].includes(item.tag) && !item.disabled) result.push(item); walk(item); } };
      walk(this); return result;
    }
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window, oldHTMLElement = globalThis.HTMLElement;
  const host = new Element('main');
  globalThis.HTMLElement = Element;
  globalThis.document = Object.assign(new EventTarget(), { createElement: tag => new Element(tag), querySelector: () => host, activeElement: undefined, documentElement: {},
    querySelectorAll: selector => {
      const result = [], attribute = selector.slice(1, -1);
      const walk = node => { for (const item of node.children) { if (item.attributes.has(attribute)) result.push(item); walk(item); } };
      walk(host); return result;
    } });
  globalThis.window = new EventTarget();
  const { Container } = await import('pixi.js');
  const { SceneManager } = await importTs('../src/game/SceneManager.ts', import.meta.url);
  const { PlayScene } = await importTs('../src/game/scenes/PlayScene.ts', import.meta.url);
  const { SettingsPopup } = await importTs('../src/ui/SettingsPopup.ts', import.meta.url);
  const app = { stage: new Container(), screen: { width: 960, height: 540 } }, manager = new SceneManager(app);
  const store = new SoundSettings(), applied = [], sounds = [];
  const gamePreferences = new GameSettings(), gameApplied = [];
  const popup = new SettingsPopup(store, { apply: value => applied.push(value), play: value => sounds.push(value) }, paused => manager.setPaused(paused), gamePreferences, value => gameApplied.push(value));
  const config = { id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 }, walk: { frames: Array(8).fill(Texture.WHITE), fps: 8 } } };
  const key = code => { const event = new Event('keydown', { cancelable: true }); Object.defineProperty(event, 'code', { value: code }); window.dispatchEvent(event); return event; };
  try {
    const scene = new PlayScene(config, () => assert.fail('paused run must not finish'), { open: () => popup.open(), sound: kind => sounds.push(kind), preferences: () => gamePreferences.current });
    manager.show(scene);
    const hud = host.children[0], pet = scene.children[1].children.at(-1), settings = hud.children[2];
    assert.equal(settings.disabled, false);
    key('ArrowRight'); manager.update(0.2); const x = pet.x;
    settings.dispatchEvent(Object.assign(new Event('pointerdown', { cancelable: true }), { button: 0 }));
    assert.equal(popup.opened, false);
    settings.dispatchEvent(new Event('pointerup'));
    settings.dispatchEvent(new Event('click'));
    assert.equal(popup.opened, true); assert.equal(host.children.length, 2); assert.equal(hud.inert, true);
    popup.open(); assert.equal(host.children.length, 2);
    const overlay = host.children[1], panel = overlay.children[0], close = panel.children[1], tabs = panel.children[2], content = panel.children[3];
    assert.equal(panel.attributes.get('role'), 'dialog'); assert.equal(document.activeElement, close);
    assert.deepEqual(tabs.children.map(button => button.textContent), ['Sound', 'Controls', 'Display', 'Language', 'Account', 'About']);
    overlay.dispatchEvent(new Event('pointerup'));
    overlay.dispatchEvent(new Event('click'));
    assert.equal(popup.opened, true); // release/click from the opening tap must not dismiss it
    key('Space'); hud.children[1].children[2].dispatchEvent(Object.assign(new Event('pointerdown', { cancelable: true }), { button: 0 }));
    manager.update(30); assert.equal(pet.x, x); assert.equal(pet.y, 390); assert.ok(!sounds.includes('jump'));
    const slider = content.children[0].children[1]; slider.value = '35'; slider.dispatchEvent(new Event('input'));
    assert.equal(store.current.master, 0.35); assert.equal(applied.at(-1).master, 0.35);
    const mute = content.children[3].children[0]; mute.checked = true; mute.dispatchEvent(new Event('change')); assert.equal(applied.at(-1).muted, true);
    content.children[4].children[0].dispatchEvent(new Event('click')); assert.equal(sounds.at(-1), 'bgm');
    tabs.children[1].dispatchEvent(new Event('click'));
    const size = content.children[0].children[1]; size.value = '110'; size.dispatchEvent(new Event('input'));
    assert.equal(gamePreferences.current.controlSize, 1.1);
    const left = content.children[1].children[0]; left.checked = true; left.dispatchEvent(new Event('change'));
    assert.equal(gameApplied.at(-1).leftHanded, true);
    tabs.children[2].dispatchEvent(new Event('click'));
    const effects = content.children[0].children[0]; effects.checked = false; effects.dispatchEvent(new Event('change'));
    assert.equal(gamePreferences.current.effects, false);
    const camera = content.children[1].children[0]; camera.checked = false; camera.dispatchEvent(new Event('change'));
    assert.equal(gamePreferences.current.smoothCamera, false);
    tabs.children[3].dispatchEvent(new Event('click'));
    content.children[0].dispatchEvent(new Event('click'));
    assert.equal(gamePreferences.current.language, 'ko'); assert.equal(t('settings'), '설정');
    assert.equal(settings.textContent, '설정'); assert.equal(panel.children[0].textContent, '설정');
    assert.equal(tabs.children[3].textContent, '언어'); assert.equal(document.documentElement.lang, 'ko');
    assert.ok(scene.children[1].children.some(child => child.text === '도착'));
    content.children[1].dispatchEvent(new Event('click'));
    assert.equal(settings.textContent, 'Settings'); assert.equal(document.documentElement.lang, 'en');
    tabs.children[5].dispatchEvent(new Event('click')); assert.ok(content.children[1].textContent.includes('0.1.0'));
    const feedback = content.children.at(-1);
    assert.equal(feedback.tag, 'a'); assert.equal(feedback.textContent, 'Send Feedback');
    assert.equal(feedback.getAttribute('href'), 'mailto:genjiman0312@gmail.com?subject=%5BPawHaven%20Feedback%5D');
    assert.equal(content.children.at(-2).textContent, 'genjiman0312@gmail.com');
    assert.ok(content.children[3].textContent.includes('bugs'));
    const aboutControls = panel.querySelectorAll(); assert.equal(aboutControls.at(-1), feedback);
    feedback.focus();
    overlay.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Tab' }));
    assert.equal(document.activeElement, close);
    setLanguage('ko'); assert.equal(feedback.textContent, '피드백 보내기');
    setLanguage('en');
    tabs.children[4].dispatchEvent(new Event('click'));
    assert.equal(content.children[0].textContent, 'Playing as Guest'); assert.equal(content.children[2].disabled, true);
    tabs.children[0].dispatchEvent(new Event('click')); assert.equal(content.children[0].children[1].value, '35');
    const controls = panel.querySelectorAll(); controls.at(-1).focus();
    const tab = new Event('keydown', { cancelable: true }); Object.defineProperty(tab, 'key', { value: 'Tab' }); overlay.dispatchEvent(tab);
    assert.equal(document.activeElement, close);
    const escape = new Event('keydown', { cancelable: true }); Object.defineProperty(escape, 'key', { value: 'Escape' }); overlay.dispatchEvent(escape);
    assert.equal(popup.opened, false); assert.equal(host.children.length, 1); assert.equal(hud.inert, false); assert.equal(document.activeElement, settings);
    manager.update(0.1); assert.equal(pet.x, x); // held input was cleared
    assert.equal(pet.children.at(-1).visible, false); // effects setting reaches the renderer
    key('Space'); assert.equal(sounds.at(-1), 'jump');
    manager.update(0.1); assert.ok(pet.y < 390);
    popup.open();
    host.children[1].dispatchEvent(new Event('pointerdown'));
    host.children[1].dispatchEvent(new Event('pointerup'));
    assert.equal(popup.opened, false); // a deliberate backdrop tap still closes
    popup.open(); popup.destroy(); assert.equal(hud.inert, false);
    manager.destroy(); assert.equal(host.children.length, 0);
  } finally {
    popup.destroy(); manager.destroy(); app.stage.destroy(); setLanguage('en');
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = oldHTMLElement;
  }
});
test('game preferences persist language, controls and display with safe defaults', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = new GameSettings(storage);
  store.update({ language: 'ko', controlSize: 1.1, leftHanded: true, vibration: true, effects: false, smoothCamera: false });
  assert.deepEqual(new GameSettings(storage).current, { language: 'ko', controlSize: 1.1, leftHanded: true, vibration: true, effects: false, smoothCamera: false });
  store.update({ controlSize: 4 }); assert.equal(store.current.controlSize, 1.2);
  store.update({ controlSize: -2 }); assert.equal(store.current.controlSize, 0.8);
  store.update({ controlSize: NaN }); assert.equal(store.current.controlSize, 0.8);
  values.set(GAME_SETTINGS_KEY, '{"language":"invalid","controlSize":"bad","effects":"false"}');
  assert.equal(new GameSettings(storage).current.language, 'en'); assert.equal(new GameSettings(storage).current.effects, true);
  values.set(GAME_SETTINGS_KEY, 'bad'); assert.equal(new GameSettings(storage).current.controlSize, 1);
  const blocked = new GameSettings({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  blocked.update({ language: 'ko' }); assert.equal(blocked.current.language, 'ko');
});
test('three global presets deep-copy pet and outfit, survive reload, and reject bad slots/data', async () => {
  const { CharacterPresets, PRESET_STORAGE_KEY } = await importTs('../src/animals/CharacterPresets.ts', import.meta.url);
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const presets = new CharacterPresets(storage);
  const current = { petId: 'corgi', outfit: { Hat: 2, Body: 3, Acc: 4, Etc: 0 } };
  assert.equal(presets.load(0), null);
  assert.equal(presets.save(0, current), true);
  current.outfit.Hat = 9; assert.equal(presets.load(0).outfit.Hat, 2);
  const loaded = presets.load(0); loaded.outfit.Body = 8; assert.equal(presets.load(0).outfit.Body, 3);
  assert.equal(presets.save(1, { ...current, petId: 'tuxedo-cat' }), true);
  assert.equal(presets.save(2, current), true);
  const reloaded = new CharacterPresets(storage);
  assert.equal(reloaded.load(0).petId, 'corgi'); assert.equal(reloaded.load(1).petId, 'tuxedo-cat');
  assert.equal(reloaded.load(2).outfit.Hat, 9);
  assert.equal(reloaded.save(3, current), false); assert.equal(reloaded.load(-1), null); assert.equal(reloaded.load(3), null);
  assert.equal(reloaded.save(1, { petId: 'corgi', outfit: { Hat: 999 } }), false);
  values.set(PRESET_STORAGE_KEY, JSON.stringify([current, { petId: 'x', outfit: {} }, null, current]));
  assert.equal(new CharacterPresets(storage).load(1), null); assert.equal(new CharacterPresets(storage).load(3), null);
  values.set(PRESET_STORAGE_KEY, '{broken'); assert.equal(new CharacterPresets(storage).load(0), null);
  const blocked = new CharacterPresets({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  assert.equal(blocked.save(0, current), true); assert.equal(blocked.load(0).outfit.Hat, 9);
});
const { ShopState, SHOP_STORAGE_KEY } = await importTs('../src/shop/ShopState.ts', import.meta.url);
test('prototype purchases charge once, appear as owned, persist, and stop on insufficient coins', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const state = new ShopState(storage);
  assert.equal(state.coins, 1000); assert.equal(state.owns('Hat', 1), true);
  assert.equal(state.buy('Hat', 2), 'purchased'); assert.equal(state.coins, 925);
  assert.equal(state.buy('Hat', 2), 'owned'); assert.equal(state.coins, 925);
  assert.equal(new ShopState(storage).owns('Hat', 2), true); assert.equal(new ShopState(storage).coins, 925);
  for (let index = 3; index <= 20; index++) state.buy('Hat', index);
  const balance = state.coins;
  assert.equal(state.buy('Body', 20), 'insufficient'); assert.equal(state.coins, balance);
  assert.equal(state.buy('Hat', -1), 'invalid'); assert.equal(state.buy('bad', 2), 'invalid');
  values.set(SHOP_STORAGE_KEY, 'bad'); assert.equal(new ShopState(storage).coins, 1000);
  const blocked = new ShopState({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  assert.equal(blocked.buy('Body', 2), 'purchased'); assert.equal(blocked.owns('Body', 2), true);
});
test('pass eligibility, XP cap and claimed rewards stay shared and survive reload', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const state = new ShopState(storage);
  assert.equal(state.canClaim(1, false), true); assert.equal(state.claim(1, true), false);
  assert.equal(state.claim(2, false), false); assert.equal(state.claim(1, false), true);
  assert.equal(state.claim(1, false), false); assert.equal(state.coins, 1020);
  state.unlockPass(); state.unlockPass(); assert.equal(state.coins, 1020);
  assert.equal(state.claim(1, true), true); assert.equal(state.coins, 1060);
  state.completeRun(); assert.equal(state.level, 2); assert.equal(state.canClaim(2, true), true);
  for (let i = 0; i < 10; i++) state.completeRun();
  assert.equal(state.xp, 400); assert.equal(state.level, 5); assert.equal(state.claim(6, false), false);
  const restored = new ShopState(storage); assert.equal(restored.hasPass, true);
  assert.equal(restored.isClaimed(1, true), true); assert.equal(restored.claim(1, true), false);
  assert.equal(restored.xp, 400); assert.equal(restored.coins, 1060);
});

test('Shop and Quest link pass purchase and rewards, and bought items appear in Character inventory', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); style = {}; inert = false; scrollTop = 0; classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    replaceChildren(...items) { this.children.forEach(item => { item.parent = undefined; }); this.children = []; this.append(...items); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); this.parent = undefined; }
    get isConnected() { return this.tag === 'main' || !!this.parent?.isConnected; }
    focus() { document.activeElement = this; }
    querySelector(selector) { return this.children.flatMap(item => [item, ...item.all()]).find(item => (item.className ?? '').split(' ').includes(selector.slice(1))) ?? null; }
    all() { return this.children.flatMap(item => [item, ...item.all()]); }
    querySelectorAll() { return this.all().filter(item => item.tag === 'button' && !item.disabled); }
  }
  const oldDocument = globalThis.document, oldHTMLElement = globalThis.HTMLElement;
  const host = new Element('main'); globalThis.HTMLElement = Element;
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host };
  const { Container } = await import('pixi.js');
  const { SceneManager } = await importTs('../src/game/SceneManager.ts', import.meta.url);
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const { ShopScene } = await importTs('../src/game/scenes/ShopScene.ts', import.meta.url);
  const { CharacterScene } = await importTs('../src/game/scenes/CharacterScene.ts', import.meta.url);
  const { QuestPopup } = await importTs('../src/ui/QuestPopup.ts', import.meta.url);
  const state = new ShopState(), app = { stage: new Container(), screen: { width: 960, height: 540 } }, manager = new SceneManager(app);
  const config = { id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 }, emote: { frames: Array(8).fill(Texture.WHITE), fps: 4 } } };
  const showShop = (tab = 'Style') => manager.show(new ShopScene(config, state, lobby, () => { lobby(); quest.open('seasonPass'); }, tab));
  const lobby = () => manager.show(new LobbyScene(config, undefined, true, undefined, undefined, { shop: () => showShop(), quest: () => quest.open() }));
  const quest = new QuestPopup(state, paused => manager.setPaused(paused), () => showShop('Pass'));
  const click = node => node.dispatchEvent(new Event('click'));
  try {
    lobby(); const utilities = host.children[0].children[1]; assert.equal(utilities.children[0].disabled, false); assert.equal(utilities.children[2].disabled, false);
    click(utilities.children[2]);
    let panel = host.children[0], content = panel.children[4];
    assert.equal(panel.children[2].textContent, 'Coins: 1000');
    assert.equal(content.children[1].children.length, 20);
    click(content.children[1].children[1]); click(content.children[2].children[1]);
    assert.equal(state.coins, 925); assert.equal(state.owns('Hat', 2), true); assert.equal(content.children[2].children[1].disabled, true);
    click(panel.children[3].children[2]);
    assert.equal(content.children[0].children[3].textContent, 'Test unlock · Free');
    click(content.children[1]); // Shop -> Quest pass
    let overlay = host.children[1], pass = overlay.children[0].children[3].children[0];
    assert.equal(pass.children[3].textContent, 'Go to Shop');
    click(pass.children[3]); // Quest -> Shop pass
    assert.equal(host.children.length, 1);
    panel = host.children[0]; content = panel.children[4];
    click(content.children[0].children[3]); assert.equal(state.hasPass, true);
    assert.equal(content.children[0].children[3].disabled, true);
    click(content.children[1]);
    overlay = host.children[1]; pass = overlay.children[0].children[3].children[0];
    click(pass.children[4].children[0].children[1]); assert.equal(state.coins, 945);
    pass = overlay.children[0].children[3].children[0]; click(pass.children[4].children[0].children[2]); assert.equal(state.coins, 985);
    assert.equal(state.claim(1, true), false);
    quest.close(); assert.equal(host.children.length, 1);
    const outfit = { Hat: 0, Body: 0, Acc: 0, Etc: 0 };
    manager.show(new CharacterScene(config, outfit, lobby, { owns: (category, index) => state.owns(category, index) }));
    panel = host.children[0]; click(panel.children[1].children[1]);
    assert.equal(panel.children[2].children.length, 3); // None, starter, purchased
    click(panel.children[2].children[2]); assert.equal(outfit.Hat, 2);
    manager.destroy(); assert.equal(host.children.length, 0);
  } finally {
    quest.destroy(); manager.destroy(); app.stage.destroy();
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = oldHTMLElement;
  }
});
const { HomeState, HOME_STORAGE_KEY } = await importTs('../src/home/HomeState.ts', import.meta.url);
test('Home prototype selections persist with validation and storage failure fallback', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const home = new HomeState(storage);
  home.select('Background', 2); home.select('Floor', 3); home.place('Furniture', 1); home.place('Etc', 4);
  assert.deepEqual(new HomeState(storage).current, { Background: 2, Floor: 3 });
  const copy = home.current; copy.Floor = 0; assert.equal(home.current.Floor, 3);
  assert.equal(home.select('Floor', 99), false); assert.equal(home.select('bad', 1), false);
  assert.equal(home.place('Furniture', -1), undefined); assert.equal(home.place('Etc', 1.2), undefined);
  values.set(HOME_STORAGE_KEY, '{"Background":100,"Floor":2,"Furniture":"1"}');
  assert.deepEqual(new HomeState(storage).current, { Background: 0, Floor: 2 });
  values.set(HOME_STORAGE_KEY, 'broken'); assert.equal(new HomeState(storage).current.Background, 0);
  const blocked = new HomeState({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  assert.ok(blocked.place('Etc', 2)); assert.equal(blocked.items[0].option, 2);
});

test('Home beside Character opens a pet-free map editor and returns the same edited map to lobby', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); style = {}; classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document, host = new Element('main');
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host };
  const { Container } = await import('pixi.js');
  const { SceneManager } = await importTs('../src/game/SceneManager.ts', import.meta.url);
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const { HomeScene } = await importTs('../src/game/scenes/HomeScene.ts', import.meta.url);
  const home = new HomeState(), app = { stage: new Container(), screen: { width: 960, height: 540 } }, manager = new SceneManager(app);
  const config = { id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 } } };
  const lobby = () => manager.show(new LobbyScene(config, undefined, true, undefined, undefined, undefined,
    { state: home, open: () => manager.show(new HomeScene(home, lobby)) }));
  const click = node => node.dispatchEvent(new Event('click'));
  try {
    lobby(); const left = host.children[0].children[0];
    assert.deepEqual(left.children.map(button => button.attributes.get('data-menu')), ['character', 'home']);
    assert.equal(left.children[1].disabled, false); click(left.children[1]);
    const scene = app.stage.children[0], panel = host.children[0], tabs = panel.children[3], inventory = panel.children[4];
    assert.equal(scene.children.length, 1); assert.equal(scene.children[0].label, 'lobby-map');
    assert.deepEqual(tabs.children.map(button => button.textContent), ['Background', 'Floor', 'Furniture', 'Etc']);
    assert.equal(inventory.children.length, 4); click(inventory.children[2]); assert.equal(home.current.Background, 2);
    click(tabs.children[1]); click(inventory.children[3]); assert.equal(home.current.Floor, 3);
    click(tabs.children[2]); assert.equal(inventory.children.length, 4); click(inventory.children[0]);
    assert.equal(home.items[0].option, 1);
    click(tabs.children[3]); click(inventory.children[0]); assert.equal(home.items[1].option, 1);
    const previewPosition = scene.children[0].objects.children.map(child => [child.label, child.x, child.y]);
    assert.equal(scene.children[0].objects.children.length, 2);
    click(panel.children[1]); assert.equal(scene.destroyed, true); assert.equal(host.children.length, 1);
    const map = app.stage.children[0].children[0], pet = app.stage.children[0].children.find(item => item.label === 'corgi');
    assert.deepEqual(map.objects.children.map(child => [child.label, child.x, child.y]), previewPosition);
    assert.equal(pet.welcoming, false);
    click(host.children[0].children[0].children[1]);
    click(host.children[0].children[3].children[3]);
    assert.equal(host.children[0].children[4].children[0].children.at(-1).textContent, '2');
    click(host.children[0].children[6].children[1]); click(host.children[0].children[7]); assert.equal(home.remaining('Etc', 1), 3);
    manager.destroy(); assert.equal(host.children.length, 0);
  } finally {
    manager.destroy(); app.stage.destroy();
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
test('petting debounces rapid input, restarts motion on retouch and resumes autonomous movement', () => {
  const animal = new Animal({ id: 'corgi', speed: 90, scale: 0.62,
    animations: { idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 },
      walk: { frames: Array(8).fill(Texture.WHITE), fps: 8 },
      emote: { frames: Array(8).fill(Texture.WHITE), fps: 4 } } }, seededRandom(42));
  try {
    animal.setBounds(960, 390);
    animal.startWelcome(); assert.equal(animal.pet(), false);
    for (let i = 0; i < 1000; i++) animal.update(1 / 60);
    animal.resumeAutonomy();
    const x = animal.x;
    assert.equal(animal.pet(), true); assert.equal(animal.state, 'EMOTE');
    for (let i = 0; i < 10; i++) assert.equal(animal.pet(), false);
    const message = animal.children[2].text;
    animal.update(0.81); assert.ok(animal.children[0].currentFrame > 0);
    assert.equal(animal.pet(), true); assert.equal(animal.children[0].currentFrame, 0);
    assert.notEqual(animal.children[2].text, message); assert.equal(animal.children[2].reactionText, '♪');
    animal.update(0.4); assert.equal(animal.x, x); assert.equal(animal.state, 'EMOTE');
    animal.update(6); assert.equal(animal.state, 'IDLE'); assert.equal(animal.mode, 'auto');
    const states = new Set();
    for (let i = 0; i < 7200; i++) {
      animal.update(1 / 60); states.add(animal.state);

    }
    assert.ok(states.has('WANDER')); assert.ok(states.has('JUMP'));
    assert.equal(animal.play('walk'), true); assert.equal(animal.pet(), false);
  } finally { animal.destroy({ children: true }); }
});

test('lobby body taps react independently of HUD, respect pause and release listeners on exit', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document, host = new Element('main');
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host };
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const scene = new LobbyScene({ id: 'corgi', speed: 90, scale: 0.62,
    animations: { idle: { frames: [Texture.WHITE], fps: 3 }, emote: { frames: Array(8).fill(Texture.WHITE), fps: 4 } } }, undefined, true);
  try {
    scene.resize(960, 540);
    const pet = scene.children.find(child => child.label === 'corgi');
    assert.equal(pet.eventMode, 'static'); assert.equal(pet.hitArea.contains(0, -60), true);
    assert.equal(pet.hitArea.contains(300, -60), false);
    pet.emit('pointerdown', { button: 2 }); assert.equal(pet.state, 'IDLE');
    scene.setPaused(true); pet.emit('pointerdown', { button: 0 }); assert.equal(pet.state, 'IDLE');
    scene.setPaused(false); pet.emit('pointerdown', { button: 0 }); assert.equal(pet.state, 'EMOTE');
    scene.update(0.5); const frame = pet.children[0].currentFrame;
    for (const group of host.children[0].children) for (const button of group.children) button.dispatchEvent(new Event('click'));
    scene.setPaused(true); scene.update(10); assert.equal(pet.children[0].currentFrame, frame);
    scene.setPaused(false); scene.update(7); assert.equal(pet.state, 'IDLE');
    scene.destroy({ children: true }); assert.equal(pet.listenerCount('pointerdown'), 0); assert.equal(host.children.length, 0);
  } finally {
    if (!scene.destroyed) scene.destroy({ children: true });
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('joystick supports rotated multitouch and does not clear held keyboard movement on release', async () => {
  class Element extends EventTarget {
    children = []; style = {}; attributes = new Map(); classList = { add() {}, contains: () => rotated }; captured = new Set();
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
    getBoundingClientRect() { return { left: 10, top: 10, width: 100, height: 100 }; }
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) { this.captured.delete(id); this.dispatchEvent(Object.assign(new Event('lostpointercapture'), { pointerId: id })); }
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window, host = new Element('main');
  globalThis.document = Object.assign(new EventTarget(), { createElement: tag => new Element(tag), querySelector: () => host });
  let rotated = false;
  globalThis.window = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: rotated }) });
  const { PlayScene } = await importTs('../src/game/scenes/PlayScene.ts', import.meta.url);
  const scene = new PlayScene({ id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: [Texture.WHITE], fps: 3 } } }, () => {});
  const pointer = (element, type, id, x = 60, y = 60, button = 0) => element.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId: id, clientX: x, clientY: y, button }));
  const key = (type, code) => window.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code }));
  try {
    const hud = host.children[0], stick = hud.children[0], jump = hud.children[1].children[2];
    const pet = scene.children[1].children.at(-1); scene.resize(960, 540);
    pointer(stick, 'pointerdown', 1, 90); scene.update(0.1); assert.ok(pet.x > 120);
    const x = pet.x; pointer(stick, 'pointermove', 2, 30); scene.update(0.1); assert.ok(pet.x > x);
    pointer(jump, 'pointerdown', 2); scene.update(0.1); assert.ok(pet.y < 390);
    key('keydown', 'ArrowRight'); pointer(stick, 'pointerup', 1);
    const released = pet.x; scene.update(0.1); assert.ok(pet.x > released); assert.equal(stick.captured.size, 0);
    key('keyup', 'ArrowRight');
    rotated = true; pointer(stick, 'pointerdown', 3, 60, 90);
    const before = pet.x; scene.update(0.1); assert.ok(pet.x > before);
    pointer(stick, 'pointercancel', 3); const stopped = pet.x; scene.update(0.1); assert.equal(pet.x, stopped);
    pointer(stick, 'pointerdown', 4, 60, 30); scene.setPaused(true); scene.update(1); assert.equal(pet.x, stopped);
    scene.setPaused(false); scene.update(0.1); assert.equal(pet.x, stopped); assert.equal(stick.captured.size, 0);
    pointer(stick, 'pointerdown', 5, 60, 90); window.dispatchEvent(new Event('resize'));
    scene.update(0.1); assert.equal(pet.x, stopped);
    pointer(stick, 'pointerdown', 6, 60, 90); scene.destroy({ children: true }); assert.equal(stick.captured.size, 0);
    assert.equal(host.children.length, 0);
  } finally {
    if (!scene.destroyed) scene.destroy({ children: true });
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});
test('training terrain blocks running and dash from either side and permits jumping onto a platform', () => {
  const run = new DummyRun();
  run.update(2, 1); assert.equal(run.x, 480 - run.halfWidth); assert.equal(run.height, 0);
  run.startDash(); run.update(0.4, 1); assert.equal(run.x, 480 - run.halfWidth);
  run.jump();
  let landed = false;
  for (let i = 0; i < 120; i++) {
    run.update(1 / 120, i < 30 ? 1 : 0);
    if (run.grounded && run.height === 36) landed = true;
  }
  assert.equal(landed, true); assert.equal(run.height, 36);
  run.jump(); run.update(0.2, 0); assert.ok(run.height > 36);
  const back = new DummyRun(); back.x = 620; back.direction = -1;
  back.startDash(); back.update(0.4, -1); assert.equal(back.x, 550 + back.halfWidth);
});

test('gap prevents midair jumps/dashes, preserves aerial attack and resets a failed run', () => {
  const run = new DummyRun(); run.x = 1170;
  run.update(0.35, 1); assert.ok(run.height < 0); assert.equal(run.grounded, false);
  const velocity = run.velocity; run.jump(); run.startDash();
  assert.equal(run.velocity, velocity); assert.equal(run.dash, 0);
  run.startAttack(); assert.equal(run.action(1), 'attack');
  run.update(1, 0);
  assert.equal(run.respawns, 1); assert.equal(run.x, run.start); assert.equal(run.height, 0);
  assert.equal(run.attack, 0); assert.equal(run.dashCooldown, 0); assert.equal(run.velocity, 0); assert.equal(run.won, false);
  run.jump(); assert.equal(run.velocity, 440);
});

test('training route completes with four jumps across frame rates and returns once after victory', () => {
  for (const fps of [30, 60, 120]) {
    const run = new DummyRun(), launches = [400, 710, 1120, 1740]; let next = 0;
    for (let i = 0; i < 13 * fps && !run.won; i++) {
      if (next < launches.length && run.x >= launches[next]) { run.jump(); next++; }
      run.update(1 / fps, 1);
    }
    assert.equal(run.respawns, 0, `no retry at ${fps} FPS`); assert.equal(run.won, true, `complete at ${fps} FPS`);
    assert.equal(run.x, run.finish); assert.equal(run.height, 0);
    run.update(2, -1); assert.equal(run.returnReady, true); assert.equal(run.x, run.finish);
  }
});
test('Santa hat follows every animation frame and body transform, shared selection and saved presets', async () => {
  const heads = JSON.parse(await readFile(new URL('../public/assets/characters/corgi/head-anchors.json', import.meta.url), 'utf8'));
  const { createOutfit } = await importTs('../src/animals/OutfitState.ts', import.meta.url);
  const { CharacterPresets } = await importTs('../src/animals/CharacterPresets.ts', import.meta.url);
  const outfit = createOutfit();
  const animations = Object.fromEntries(Object.entries(heads).map(([key, head]) => [key, {
    frames: Array(head.length).fill(Texture.WHITE), fps: 4, head,
    ...(head.length === 4 || key === 'fall' || key === 'land' ? { scale: 212 / 164, anchorY: 400 / 512 } : {}),
  }]));
  const config = { id: 'corgi', speed: 90, scale: 0.62, animations, wardrobe: { santaHat: Texture.WHITE, outfit } };
  const views = Array.from({ length: 3 }, () => new AnimalAnimationController(config));
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try {
    views.forEach(view => { view.update('IDLE', 0, 1); assert.equal(view.hat.visible, false); });
    outfit.Hat = 1;
    new CharacterPresets(storage).save(1, { petId: 'corgi', outfit });
    for (const view of views) for (const [action, head] of Object.entries(heads)) {
      assert.equal(head.length, ['idle', 'walk', 'emote'].includes(action) ? 8 : ['fall', 'land'].includes(action) ? 1 : 4);
      for (let frame = 0; frame < head.length; frame++) {
        for (const direction of [-1, 1]) {
          view.update('IDLE', 0, direction, 0, 0, 0, action, (frame + 0.1) / head.length);
          assert.equal(view.hat.visible, true); assert.equal(view.hat.parent, view.sprite);
          assert.equal(view.hat.x, head[frame].x); assert.equal(view.hat.y, head[frame].y + 5 / (config.scale * (animations[action].scale ?? 1)));
          assert.ok(Number.isFinite(view.hat.y) && view.hat.y < 0);
          assert.equal(Math.sign(view.sprite.scale.x), direction);
          assert.equal(view.hat.texture, Texture.WHITE);
        }
      }
    }
    views[0].update('JUMP', 0.5, 1, 0.5, 48);
    assert.equal(views[0].hat.parent.y, -48);
    outfit.Hat = 0;
    views.forEach(view => { view.update('IDLE', 0, 1); assert.equal(view.hat.visible, false); });
    Object.assign(outfit, new CharacterPresets(storage).load(1).outfit);
    views.forEach(view => { view.update('IDLE', 0, 1); assert.equal(view.hat.visible, true); });
    outfit.Hat = 2; views[0].update('IDLE', 0, 1); assert.equal(views[0].hat.visible, false);
    views[0].sprite.destroy({ children: true }); assert.equal(views[0].hat.destroyed, true);
    assert.equal(Texture.WHITE.destroyed, false);
  } finally {
    views.forEach(view => { if (!view.sprite.destroyed) view.sprite.destroy({ children: true }); view.sleepMark.destroy(); view.welcomeMark.destroy(); });
  }
});
test('Home stock persists, recovers on removal, validates saves and migrates old placements once', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  values.set(HOME_STORAGE_KEY, '{"Furniture":4,"Etc":1,"Floor":2,"placements":{"Furniture":{"x":0.4,"y":0.8}}}');
  const home = new HomeState(storage), original = home.items[0].id;
  assert.equal(home.remaining('Furniture', 4), 2); assert.equal(home.remaining('Etc', 1), 2);
  assert.equal(home.items[0].x, 0.4); assert.equal(home.items[1].x, 0.47);
  const second = home.place('Furniture', 4), third = home.place('Furniture', 4);
  assert.ok(second !== original && third !== second); assert.equal(home.remaining('Furniture', 4), 0);
  assert.equal(home.place('Furniture', 4), undefined); assert.equal(home.items.length, 4);
  assert.equal(home.move(second, 8, -9), true); assert.equal(home.items.find(item => item.id === second).x, 0.90);
  assert.equal(home.items[0].x, 0.4);
  assert.deepEqual(new HomeState(storage).items, home.items); assert.equal(new HomeState(storage).current.Floor, 2);
  const copy = home.items; copy[0].x = 0; assert.equal(home.items[0].x, 0.4);
  assert.equal(home.move(999, 0.3, 0.7), false); assert.equal(home.move(original, NaN, 0.7), false);
  assert.equal(home.remove(second), true); assert.equal(home.remove(second), false); assert.equal(home.remaining('Furniture', 4), 1);
  home.remove(original); home.remove(third); assert.equal(home.remaining('Furniture', 4), 3);
  assert.equal(new HomeState(storage).items.some(item => item.tab === 'Furniture'), false);
  values.set(HOME_STORAGE_KEY, JSON.stringify({ version: 2, items: [
    { id: 1, tab: 'Furniture', option: 4, x: 0.3, y: 0.7 }, { id: 1, tab: 'Furniture', option: 4, x: 0.4, y: 0.8 },
    ...[2, 3, 4, 5].map(id => ({ id, tab: 'Furniture', option: 4, x: 8, y: -9 })),
    { id: 9, tab: 'Floor', option: 1, x: 0.3, y: 0.7 }, { id: 10, tab: 'Etc', option: 0, x: 0.3, y: 0.7 },
    { id: 11, tab: 'Etc', option: 1, x: 'bad', y: 0.7 },
  ] }));
  const repaired = new HomeState(storage); assert.equal(repaired.items.length, 3); assert.equal(repaired.remaining('Furniture', 4), 0);
  assert.equal(repaired.items[1].y, 0.62); assert.ok(repaired.place('Etc', 1) > 3);
  const blocked = new HomeState({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  const id = blocked.place('Furniture', 4); assert.equal(blocked.move(id, 0.5, 0.8), true); assert.equal(blocked.items[0].x, 0.5);
});
test('Home drag/drop saves only on release, handles rotation/cancel, removal and shared lobby positions', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); style = {}; classList = { add() {}, contains: () => rotated }; captured = new Set();
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
    focus() {}
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) { this.captured.delete(id); this.dispatchEvent(Object.assign(new Event('lostpointercapture'), { pointerId: id })); }
    getBoundingClientRect() { return { left: 10, top: 20, width: rotated ? 540 : 960, height: rotated ? 960 : 540 }; }
  }
  let rotated = false, writes = 0;
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes++; values.set(key, value); } };
  values.set(HOME_STORAGE_KEY, '{"Furniture":4,"Etc":1}');
  const home = new HomeState(storage);
  const oldDocument = globalThis.document, oldWindow = globalThis.window, host = new Element('main');
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host };
  globalThis.window = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: rotated }) });
  const { HomeScene } = await importTs('../src/game/scenes/HomeScene.ts', import.meta.url);
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const textures = { background: Texture.WHITE, floor: Texture.WHITE, cushion: Texture.WHITE };
  const scene = new HomeScene(home, () => {}, textures); scene.resize(960, 540);
  const pointer = (element, type, id, x, y) => element.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), {
    pointerId: id, button: 0, clientX: rotated ? 10 + (1 - y) * 540 : 10 + x * 960, clientY: rotated ? 20 + x * 960 : 20 + y * 540,
  }));
  try {
    const panel = host.children[0], layer = panel.children[6], remove = panel.children[7], map = scene.children[0];
    assert.equal(map.children[1].visible, true); assert.equal(map.children[2].visible, true);
    panel.children[4].children[1].dispatchEvent(new Event('click'));
    assert.equal(map.children[1].visible, false); assert.equal(map.children[2].visible, true);
    panel.children[4].children[0].dispatchEvent(new Event('click'));
    const furniture = layer.children[0], etc = layer.children[1];
    const before = writes;
    pointer(furniture, 'pointerdown', 1, 0.21, 0.7); pointer(furniture, 'pointermove', 2, 0.1, 0.62);
    assert.equal(map.objects.children.find(child => child.label === '1').x, 0.21 * 960);
    pointer(furniture, 'pointermove', 1, 0.4, 0.8);
    assert.ok(Math.abs(map.objects.children.find(child => child.label === '1').x - 384) < 0.001); assert.equal(writes, before);
    assert.equal(home.items.find(item => item.id === 1).x, 0.21); assert.equal(remove.hidden, false);
    pointer(furniture, 'pointerup', 1, 0.4, 0.8);
    pointer(furniture, 'pointerdown', 8, 0.4, 0.8);
    pointer(furniture, 'pointermove', 8, 0.86, 0.8); pointer(furniture, 'pointerup', 8, 0.86, 0.8);
    assert.ok(Math.abs(new HomeState(storage).items.find(item => item.id === 1).x - 0.86) < 0.000001);
    pointer(furniture, 'pointerdown', 9, 0.86, 0.8);
    pointer(furniture, 'pointermove', 9, 0.4, 0.8); pointer(furniture, 'pointerup', 9, 0.4, 0.8);
    assert.equal(writes, before + 3); assert.equal(furniture.captured.size, 0);
    assert.ok(Math.abs(new HomeState(storage).items.find(item => item.id === 1).x - 0.4) < 0.000001);
    pointer(furniture, 'pointerdown', 3, 0.4, 0.8); pointer(furniture, 'pointermove', 3, 8, -4);
    assert.equal(map.objects.children.find(child => child.label === '1').x, 0.90 * 960); pointer(furniture, 'pointercancel', 3, 8, -4);
    assert.ok(Math.abs(map.objects.children.find(child => child.label === '1').x - 384) < 0.001); assert.equal(writes, before + 3);
    rotated = true;
    pointer(etc, 'pointerdown', 4, 0.47, 0.7); pointer(etc, 'pointermove', 4, 0.3, 0.85); pointer(etc, 'pointerup', 4, 0.3, 0.85);
    assert.ok(Math.abs(home.items.find(item => item.id === 2).y - 0.85) < 0.000001); assert.ok(Math.abs(map.objects.children.find(child => child.label === '2').x - 288) < 0.001);
    pointer(etc, 'pointerdown', 5, 0.3, 0.85); pointer(etc, 'pointermove', 5, 0.5, 0.7);
    window.dispatchEvent(new Event('resize')); assert.ok(Math.abs(map.objects.children.find(child => child.label === '2').x - 288) < 0.001); assert.equal(etc.captured.size, 0);
    const key = Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowLeft' }); etc.dispatchEvent(key);
    assert.ok(map.objects.children.find(child => child.label === '2').x < 288);
    remove.dispatchEvent(new Event('click')); assert.equal(home.items.some(item => item.id === 2), false); assert.equal(map.objects.children.some(child => child.label === '2'), false);
    assert.equal(home.items[0].option, 4);
    panel.children[3].children[2].dispatchEvent(new Event('click'));
    const inventory = panel.children[4];
    assert.equal(inventory.children[3].children.at(-1).textContent, '2');
    inventory.children[3].dispatchEvent(new Event('click'));
    inventory.children[3].dispatchEvent(new Event('click'));
    assert.equal(home.remaining('Furniture', 4), 0); assert.equal(inventory.children[3].disabled, true);
    assert.equal(inventory.children[3].children.at(-1).textContent, '0');
    assert.equal(inventory.children[0].children.at(-1).textContent, '3');
    inventory.children[3].dispatchEvent(new Event('click')); assert.equal(home.items.length, 3);
    const copy = home.items.find(item => item.id !== 1), copyButton = layer.children.find(button => Number(button.getAttribute('data-placement')) === copy.id);
    pointer(copyButton, 'pointerdown', 8, copy.x, copy.y); pointer(copyButton, 'pointermove', 8, 0.52, 0.84); pointer(copyButton, 'pointerup', 8, 0.52, 0.84);
    assert.ok(Math.abs(home.items.find(item => item.id === copy.id).x - 0.52) < 0.000001);
    assert.ok(Math.abs(home.items.find(item => item.id === 1).x - 0.4) < 0.000001);
    const removed = home.items.find(item => item.id !== 1 && item.id !== copy.id);
    layer.children.find(button => Number(button.getAttribute('data-placement')) === removed.id).dispatchEvent(new Event('click'));
    remove.dispatchEvent(new Event('click'));
    assert.equal(home.remaining('Furniture', 4), 1); assert.equal(inventory.children[3].disabled, false);
    assert.equal(inventory.children[3].children.at(-1).textContent, '1');
    assert.equal(home.items.length, 2); assert.equal(map.objects.children.length, 2);
    scene.destroy({ children: true }); assert.equal(Texture.WHITE.destroyed, false);
    const config = { id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: [Texture.WHITE], fps: 3 } } };
    const lobby = new LobbyScene(config, undefined, true, undefined, undefined, undefined, { state: new HomeState(storage), textures, open() {} });
    lobby.resize(960, 540);
    assert.ok(Math.abs(lobby.children[0].objects.children.find(child => child.label === '1').x - 384) < 0.001); assert.equal(lobby.children[0].objects.children.length, 2);
    lobby.destroy({ children: true }); assert.equal(host.children.length, 0);
  } finally {
    if (!scene.destroyed) scene.destroy({ children: true });
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});
test('Myeongrang cells fit their real PNGs, preserve padding and reuse Corgi effects without body substitution', async () => {
  const map = JSON.parse(await readFile(new URL('../public/assets/characters/myeongrang/frames.json', import.meta.url), 'utf8'));
  const { TextureSource } = await import('pixi.js');
  const { createMyeongrang } = await importTs('../src/animals/createMyeongrang.ts', import.meta.url);
  const atlases = {};
  for (const [key, source] of Object.entries(map.sources)) {
    const bytes = await readFile(new URL('../public/assets/characters/myeongrang/' + source.file, import.meta.url));
    assert.equal(bytes.readUInt32BE(16), source.width); assert.equal(bytes.readUInt32BE(20), source.height); assert.equal(bytes[25], 6);
    atlases[key] = new Texture({ source: new TextureSource({ width: source.width, height: source.height }) });
  }
  const outfit = { Hat: 1, Body: 0, Acc: 0, Etc: 0 };
  const shared = { effects: { attack: [Texture.WHITE], skill: [Texture.WHITE] }, wardrobe: { outfit, santaHat: Texture.WHITE } };
  const config = createMyeongrang(atlases, map, shared), controller = new AnimalAnimationController(config);
  try {
    assert.equal(config.id, 'myeongrang'); assert.equal(config.effects, shared.effects); assert.equal(config.wardrobe, shared.wardrobe);
    const fixedBodyRect = [controller.bodyHitArea.x, controller.bodyHitArea.y, controller.bodyHitArea.width, controller.bodyHitArea.height];
    assert.deepEqual(config.animations.fall.frames, config.animations.jump.frames.slice(2, 3));
    assert.deepEqual(config.animations.land.frames, config.animations.jump.frames.slice(3));
    for (const [key, clip] of Object.entries(map.actions)) {
      assert.equal(clip.frames.length, key === 'idle' ? 8 : 4);
      const seen = new Set();
      for (const [i, frame] of clip.frames.entries()) {
        assert.ok(frame.borderAlphaMax <= 8); assert.ok(frame.width > 0 && frame.height > 0);
        const texture = config.animations[key].frames[i];
        assert.ok(texture.trim.x >= 0 && texture.trim.y >= 0);
        assert.ok(texture.trim.right <= texture.orig.width && texture.trim.bottom <= texture.orig.height);
        for (const direction of [-1, 1]) {
          controller.update('IDLE', 0, direction, 0, 0, 0, key, (i + 0.1) / clip.frames.length);
          assert.equal(controller.sprite.texture, texture); assert.equal(controller.hat.visible, true);
          assert.equal(Math.sign(controller.sprite.scale.x), direction); seen.add(controller.sprite.texture);
          const b = config.animations[key].bodyBounds[i], hit = controller.bodyHitArea;
          assert.deepEqual([hit.x, hit.y, hit.width, hit.height], fixedBodyRect);
          assert.ok(hit.width >= Math.max(120, b.width * Math.abs(controller.sprite.scale.x)) + 112 - 0.001);
          assert.ok(hit.height >= Math.max(128, b.height * controller.sprite.scale.y) + 112 - 0.001);
          assert.ok(hit.width >= 232 && hit.height >= 240);
          const centre = (b.x + b.width / 2) * controller.sprite.scale.x;
          assert.ok(hit.contains(centre + b.width * Math.abs(controller.sprite.scale.x) / 2 + 48,
            (b.y + b.height / 2) * controller.sprite.scale.y));
          assert.ok(hit.contains(centre, (b.y + b.height / 2) * controller.sprite.scale.y));
          assert.equal(hit.contains(centre + 400, -50), false);
        }
      }
      assert.equal(seen.size, clip.frames.length);
    }
    const broken = structuredClone(map); broken.actions.run.frames[0].x = 99999;
    assert.throws(() => createMyeongrang(atlases, broken, shared), /atlas cell/);
  } finally {
    controller.sprite.destroy({ children: true }); controller.sleepMark.destroy(); controller.welcomeMark.destroy();
    new Set(Object.values(config.animations).flatMap(clip => clip.frames)).forEach(texture => texture.destroy(false));
    Object.values(atlases).forEach(texture => texture.destroy(true));
  }
});

test('Myeongrang selection reaches lobby, game body/VFX and presets, and Corgi can still be selected', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); style = {}; classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window, host = new Element('main');
  globalThis.document = Object.assign(new EventTarget(), { createElement: tag => new Element(tag), querySelector: () => host });
  globalThis.window = new EventTarget();
  const { Container, TextureSource } = await import('pixi.js');
  const { createMyeongrang } = await importTs('../src/animals/createMyeongrang.ts', import.meta.url);
  const { CharacterPresets } = await importTs('../src/animals/CharacterPresets.ts', import.meta.url);
  const { CharacterScene } = await importTs('../src/game/scenes/CharacterScene.ts', import.meta.url);
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const { PlayScene } = await importTs('../src/game/scenes/PlayScene.ts', import.meta.url);
  const { SceneManager } = await importTs('../src/game/SceneManager.ts', import.meta.url);
  const map = JSON.parse(await readFile(new URL('../public/assets/characters/myeongrang/frames.json', import.meta.url), 'utf8'));
  const atlases = Object.fromEntries(Object.entries(map.sources).map(([key, source]) => [key, new Texture({ source: new TextureSource({ width: source.width, height: source.height }) })]));
  const outfit = { Hat: 1, Body: 0, Acc: 0, Etc: 0 }, presets = new CharacterPresets();
  const corgi = { id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: [Texture.WHITE], fps: 3 } },
    effects: { attack: [Texture.WHITE], skill: [Texture.WHITE] }, wardrobe: { santaHat: Texture.WHITE, outfit } };
  const myeongrang = createMyeongrang(atlases, map, corgi);
  let active = corgi;
  const manager = new SceneManager({ stage: new Container(), screen: { width: 960, height: 540 } });
  let scene;
  const character = () => { scene = new CharacterScene(active, outfit, lobby, { presets,
    pets: [{ config: corgi, name: 'Corgi', thumbnail: './corgi.png' }, { config: myeongrang, name: 'Myeongrang', thumbnail: './idle.png' }],
    onPetChanged: config => { active = config; } }); manager.show(scene); };
  const lobby = () => { scene = new LobbyScene(active, () => { scene = new PlayScene(active, lobby); manager.show(scene); }, true, character); manager.show(scene); };
  const key = code => window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code }));
  try {
    character(); host.children[0].children[2].children[1].dispatchEvent(new Event('click'));
    assert.equal(active.id, 'myeongrang'); manager.update(0.1);
    assert.equal(scene.children[1].children[0].texture.source, atlases.daily.source);
    host.children[0].children[3].children[3].dispatchEvent(new Event('click'));
    assert.equal(presets.load(0).petId, 'myeongrang');
    host.children[0].children[0].dispatchEvent(new Event('click'));
    const animal = scene.children.find(child => child.label === 'myeongrang');
    assert.ok(animal); animal.play('walk'); manager.update(0.1);
    assert.equal(animal.children[0].texture.source, atlases.daily.source);
    host.children[0].children[2].children[0].dispatchEvent(new Event('click'));
    const pet = scene.children[1].children.at(-1);
    key('Space'); manager.update(0.1); assert.equal(pet.children[3].texture.source, atlases.combat.source);
    key('KeyJ'); manager.update(0.05); assert.ok(myeongrang.animations.attack.frames.includes(pet.children[3].texture));
    manager.update(1); key('ShiftLeft'); manager.update(0.05);
    assert.ok(myeongrang.animations.skill.frames.includes(pet.children[3].texture));
    assert.equal(pet.children[0].texture.source, atlases.combat.source); // dash afterimage uses Myeongrang body
    assert.equal(pet.children[0].visible, true);
    character(); host.children[0].children[2].children[0].dispatchEvent(new Event('click')); assert.equal(active.id, 'corgi');
    host.children[0].children[3].children[0].dispatchEvent(new Event('click')); assert.equal(active.id, 'myeongrang');
    host.children[0].children[0].dispatchEvent(new Event('click')); assert.ok(scene.children.some(child => child.label === 'myeongrang'));
    manager.destroy(); assert.equal(host.children.length, 0); assert.equal(Texture.WHITE.destroyed, false);
  } finally {
    manager.destroy();
    new Set(Object.values(myeongrang.animations).flatMap(clip => clip.frames)).forEach(texture => texture.destroy(false));
    Object.values(atlases).forEach(texture => texture.destroy(true));
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

test('Myeongrang preserves approved Idle size and matches motion body coverage to Idle in both directions', async () => {
  const map = JSON.parse(await readFile(new URL('../public/assets/characters/myeongrang/frames.json', import.meta.url), 'utf8'));
  // Approved Idle and its texture placement are unchanged; it is the only size reference.
  assert.equal(map.actions.idle.scale, 212 / 409);
  assert.equal(map.actions.idle.frames.length, 8);
  const idleAreas = map.actions.idle.frames.map(frame => frame.opaqueArea).sort((a, b) => a - b);
  const idleCoverage = idleAreas[Math.floor(idleAreas.length / 2)] * map.actions.idle.scale ** 2 * 0.62 ** 2;
  const animations = Object.fromEntries(Object.entries(map.actions).map(([key, clip]) => [key, {
    frames: clip.frames.map(() => new Texture({ source: Texture.WHITE.source })), fps: clip.fps, scale: clip.scale,
  }]));
  const controller = new AnimalAnimationController({ id: 'myeongrang', speed: 90, scale: 0.62, animations });
  try {
    for (const direction of [-1, 1]) for (const key of ['idle', 'walk', 'idle', 'run', 'idle', 'attack', 'idle', 'skill', 'idle', 'jump', 'emote', 'idle']) {
      const clip = map.actions[key];
      for (const [index, frame] of clip.frames.entries()) {
        controller.update('IDLE', 0, direction, 0, 0, 0, key, (index + 0.1) / clip.frames.length);
        assert.equal(controller.sprite.scale.x, direction * 0.62 * clip.scale);
        assert.equal(controller.sprite.scale.y, 0.62 * clip.scale); assert.equal(controller.sprite.y, 0);
        assert.ok(frame.opaqueArea > 0);
        if (key !== 'idle') {
          const visibleCoverage = frame.opaqueArea * Math.abs(controller.sprite.scale.x * controller.sprite.scale.y);
          assert.ok(visibleCoverage <= idleCoverage + 0.000001, `${key} frame ${index} grows larger than Idle`);
        }
      }
    }
  } finally {
    controller.sprite.destroy({ children: true }); controller.sleepMark.destroy(); controller.welcomeMark.destroy();
    Object.values(animations).flatMap(clip => clip.frames).forEach(texture => texture.destroy(false));
  }
});
test('speech bubbles pop, fade, reset on symbol changes and keep greetings visible', async () => {
  const { SpeechBubble } = await importTs('../src/animals/SpeechBubble.ts', import.meta.url);
  const bubble = new SpeechBubble();
  const children = [...bubble.children];
  try {
    bubble.present('?', 0);
    assert.equal(bubble.text, '?'); assert.equal(bubble.visible, true);
    assert.equal(bubble.alpha, 1); assert.equal(bubble.scale.x, 0.9);
    bubble.present('?', 0.15); assert.equal(bubble.scale.x, 1);
    bubble.present('?', 0.85); assert.ok(bubble.alpha > 0 && bubble.alpha < 1);
    bubble.present('?', 0.2); assert.equal(bubble.visible, false);
    bubble.present('♪', 0.1); assert.equal(bubble.visible, true); assert.equal(bubble.alpha, 1);
    bubble.present('Welcome!', 0, true); bubble.present('Welcome!', 10, true);
    assert.equal(bubble.visible, true); assert.equal(bubble.alpha, 1);
    bubble.present('오늘도 고생 많았어.', 0, false, 5, 0.1);
    const fade = bubble.alpha;
    bubble.present('You did well today.', 0, false, 5, 0.1);
    assert.equal(bubble.alpha, fade); // changing language must not restart the reading/fade clock
    bubble.present('', 0); assert.equal(bubble.visible, false);
  } finally { bubble.destroy(); }
  assert.ok(children.every(child => child.destroyed));
  assert.equal(Texture.WHITE.destroyed, false);
});

test('fixed play zoom shows more course and retains screen running/dash speed without accelerating action timers', async () => {
  const { PLAY_ZOOM, cameraTarget } = await importTs('../src/game/PlayCamera.ts', import.meta.url);
  assert.equal(PLAY_ZOOM, 0.78);
  assert.ok(960 / PLAY_ZOOM > 1200);
  assert.equal(cameraTarget(120, 2850), 0);
  assert.ok(Math.abs((900 - cameraTarget(900, 2850)) * PLAY_ZOOM - 288) < 0.001);
  assert.ok(Math.abs((2850 - cameraTarget(2520, 2850)) * PLAY_ZOOM - 960) < 0.001);
  for (const direction of [-1, 1]) {
    const baseline = new DummyRun(flatCourse), zoomed = new DummyRun(flatCourse, 1 / PLAY_ZOOM);
    baseline.x = zoomed.x = 600;
    baseline.direction = zoomed.direction = direction;
    baseline.update(0.2, direction); zoomed.update(0.2, direction);
    assert.ok(Math.abs((zoomed.x - 600) * PLAY_ZOOM - (baseline.x - 600)) < 0.001);
    const baseStart = baseline.x, zoomStart = zoomed.x;
    baseline.startDash(); zoomed.startDash();
    baseline.update(0.15, direction); zoomed.update(0.15, direction);
    assert.ok(Math.abs((zoomed.x - zoomStart) * PLAY_ZOOM - (baseline.x - baseStart)) < 0.001);
    assert.equal(zoomed.dash, baseline.dash);
    baseline.update(0.3, 0); zoomed.update(0.3, 0);
    baseline.jump(); zoomed.jump(); baseline.startAttack(); zoomed.startAttack();
    baseline.update(0.2, 0); zoomed.update(0.2, 0);
    assert.equal(zoomed.height, baseline.height); assert.equal(zoomed.attack, baseline.attack);
  }
});
test('healing dialogue never repeats consecutively and locks its text until reading ends', async () => {
  const { HealingDialogue, HEALING_LINES } = await importTs('../src/animals/HealingDialogue.ts', import.meta.url);
  for (const random of [() => 0, () => 0.999999, seededRandom(17), () => NaN]) {
    const dialogue = new HealingDialogue(random); let previous;
    for (let count = 0; count < 20; count++) {
      setLanguage('ko');
      assert.equal(dialogue.start(), true);
      const korean = dialogue.message, index = HEALING_LINES.findIndex(line => line.ko === korean);
      assert.ok(index >= 0); assert.notEqual(index, previous); previous = index;
      assert.ok(dialogue.duration >= 4.5 && dialogue.duration <= 7);
      assert.equal(dialogue.start(), false); assert.equal(dialogue.message, korean);
      dialogue.update(NaN); dialogue.update(-1); assert.equal(dialogue.active, true);
      dialogue.update(dialogue.duration / 2);
      setLanguage('en'); assert.equal(dialogue.message, HEALING_LINES[index].en);
      dialogue.update(dialogue.duration / 2 + 0.001);
      assert.equal(dialogue.active, false); assert.equal(dialogue.message, '');
    }
    dialogue.start(); dialogue.clear(); assert.equal(dialogue.active, false);
  }
  setLanguage('en');
});

test('healing speech keeps semantic breaks, fits in two or three lines and remains inside viewport edges', async () => {
  const { SpeechBubble, wrapSpeech } = await importTs('../src/animals/SpeechBubble.ts', import.meta.url);
  const { HEALING_LINES } = await importTs('../src/animals/HealingDialogue.ts', import.meta.url);
  const bubble = new SpeechBubble();
  try {
    for (const translation of HEALING_LINES) for (const message of Object.values(translation)) {
      const wrapped = wrapSpeech(message), lines = wrapped.split('\n');
      assert.ok(lines.length >= 2 && lines.length <= 3, wrapped);
      assert.equal(wrapped.replace(/\s/g, ''), message.replace(/\s/g, ''));
      for (const line of lines) assert.ok(Array.from(line).reduce((width, c) => width + (c === ' ' ? 5 : c.charCodeAt(0) > 255 ? 18 : 10), 0) <= 272);
      bubble.present(message, 0, false, 5);
      assert.equal(bubble.displayText, wrapped);
      for (const x of [0, 100, 480, 860, 960]) {
        bubble.position.set(0, -200); bubble.fitToViewport(x, 180, 960, 540);
        const halfWidth = Math.max(...lines.map(line => Array.from(line).reduce((width, c) => width + (c === ' ' ? 5 : c.charCodeAt(0) > 255 ? 18 : 10), 24))) / 2;
        assert.ok(x + bubble.x - halfWidth >= 12);
        assert.ok(x + bubble.x + halfWidth <= 948);
        assert.ok(180 + bubble.y - bubble.halfHeight >= 12);
      }
      bubble.present(message, 4.8, false, 5); assert.ok(bubble.alpha > 0 && bubble.alpha < 1);
      bubble.present(message, 0.21, false, 5); assert.equal(bubble.visible, false);
    }
    assert.ok(wrapSpeech('아주긴닉네임'.repeat(6)).split('\n').length > 1);
    assert.equal(wrapSpeech('Rest well.\nSee you tomorrow.'), 'Rest well.\nSee you tomorrow.');
  } finally { bubble.destroy(); }
});

test('pet dialogue stays still, survives resizing/language changes, ignores spam and resumes autonomy', () => {
  const animal = new Animal({ id: 'myeongrang', speed: 90, scale: 0.62, animations: {
    idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 },
    emote: { frames: Array(8).fill(Texture.WHITE), fps: 4 },
    walk: { frames: Array(8).fill(Texture.WHITE), fps: 8 },
  } }, () => 0);
  try {
    animal.setBounds(960, 390); setLanguage('ko');
    assert.equal(animal.pet(), true);
    const bubble = animal.children[2], message = bubble.text, x = animal.x;
    assert.ok(message.includes('오늘도')); assert.equal(animal.pet(), false);
    animal.update(2.35); assert.equal(animal.x, x); assert.equal(animal.state, 'EMOTE');
    assert.equal(bubble.text, message); assert.ok(animal.children[0].currentFrame > 0);
    const firstReaction = animal.children[2].reactionText;
    assert.equal(animal.pet(), true); assert.equal(animal.children[0].currentFrame, 0);
    assert.notEqual(animal.children[2].reactionText, firstReaction); assert.notEqual(bubble.text, message);
    const changedMessage = bubble.text; animal.setBounds(390, 280); animal.update(0); assert.equal(bubble.text, changedMessage);
    setLanguage('en'); animal.update(0); assert.ok(bubble.text.includes('today'));
    assert.equal(animal.pet(), false);
    animal.update(6); assert.equal(animal.state, 'IDLE'); assert.equal(bubble.visible, false);
    assert.equal(animal.pet(), true); assert.notEqual(bubble.text, changedMessage);
    animal.play('idle'); assert.equal(bubble.visible, false);
  } finally { animal.destroy({ children: true }); setLanguage('en'); }
});
test('touches refresh both dialogue and reaction after 0.8 seconds, while spam changes neither', () => {
  const animal = new Animal({ id: 'myeongrang', speed: 90, scale: 0.62, animations: {
    idle: { frames: [Texture.WHITE], fps: 3 }, emote: { frames: Array(8).fill(Texture.WHITE), fps: 4 },
  } }, () => 0);
  try {
    animal.setBounds(960, 390); assert.equal(animal.pet(), true);
    const bubble = animal.speechBubble;
    for (let i = 0; i < 10; i++) {
      const message = bubble.text, symbol = bubble.reactionText;
      animal.update(0.4); assert.equal(animal.pet(), false);
      assert.equal(bubble.text, message); assert.equal(bubble.reactionText, symbol);
      animal.update(0.41); assert.equal(animal.pet(), true);
      assert.notEqual(bubble.text, message); assert.notEqual(bubble.reactionText, symbol);
      assert.equal(animal.children[0].currentFrame, 0); assert.equal(bubble.visible, true);
    }
    animal.update(7); assert.equal(bubble.visible, false); assert.equal(animal.state, 'IDLE');
    assert.equal(animal.pet(), true);
    assert.equal(animal.hitArea.contains(bubble.x, bubble.y), false);
  } finally { animal.destroy({ children: true }); }
});

test('lobby floor roaming visits both axes and stays clear of the Play control at varied frame rates', () => {
  for (const fps of [30, 60, 120]) {
    const machine = new AnimalStateMachine(90, CORGI_BEHAVIOR, seededRandom(170));
    machine.setBounds(100, 860); machine.setFloor(960, 540, 390);
    let low = machine.y, high = machine.y, left = machine.x, right = machine.x;
    for (let i = 0; i < fps * 240; i++) {
      const oldX = machine.x, oldY = machine.y;
      machine.update(1 / fps);
      assert.ok(Math.hypot(machine.x - oldX, (machine.y - oldY) / 0.65) <= 90 / fps + 0.001);
      low = Math.min(low, machine.y); high = Math.max(high, machine.y);
      left = Math.min(left, machine.x); right = Math.max(right, machine.x);
      assert.ok(machine.x >= 100 && machine.x <= 860);
      assert.ok(machine.y >= 540 * 0.62 && machine.y <= 540 * 0.86);
      assert.ok(machine.x <= 960 * 0.8 || machine.y <= 540 * 0.7);
    }
    assert.ok(high - low > 80); assert.ok(right - left > 200);
    machine.setBounds(60, 330); machine.setFloor(390, 300, 216);
    machine.update(0);
    assert.ok(machine.y >= 186 && machine.y <= 258);
  }
});
const cushionProfile = {
  durations: { IDLE: [0.1, 0.1], REST: [0.4, 0.4], SLEEP: [0.6, 0.6], EMOTE: [1, 1] },
  weights: { REST: 1 }, wanderDistance: [80, 80],
};
function cushionMachine() {
  const machine = new AnimalStateMachine(90, cushionProfile, () => 0.5);
  machine.setBounds(100, 860); machine.setFloor(960, 540, 390);
  return machine;
}
function advanceUntil(machine, condition, seconds = 20, fps = 60) {
  for (let i = 0; i < seconds * fps && !condition(); i++) machine.update(1 / fps);
  assert.ok(condition(), 'state=' + machine.state + ', cushion=' + machine.restingCushion);
}
test('cushions select a usable nearby target, approach, rest, sleep and release without immediate looping', () => {
  for (const fps of [30, 60, 120]) {
    const machine = cushionMachine();
    machine.setCushions([{ id: 1, x: 240, y: 390, depth: 398 }, { id: 2, x: 620, y: 350, depth: 358 },
      { id: 3, x: 850, y: 450, depth: 458 }]);
    advanceUntil(machine, () => machine.cushionActivity === 'rest', 20, fps);
    assert.equal(machine.restingCushion, 2);
    assert.ok(Math.abs(machine.x - 620) < 0.001); assert.ok(Math.abs(machine.y - 350) < 0.001);
    assert.equal(machine.depth, 358.5);
    advanceUntil(machine, () => machine.state === 'SLEEP', 2, fps);
    advanceUntil(machine, () => machine.restingCushion === undefined, 2, fps);
    machine.update(0.2); assert.equal(machine.restingCushion, undefined);
  }
});
test('moving/removing a cushion retargets an approach and interrupts rest without teleporting the animal', () => {
  const machine = cushionMachine();
  machine.setCushions([{ id: 8, x: 200, y: 400, depth: 408 }]);
  advanceUntil(machine, () => machine.cushionActivity === 'approach');
  machine.update(0.3);
  machine.setCushions([{ id: 8, x: 400, y: 450, depth: 458 }]);
  advanceUntil(machine, () => machine.cushionActivity === 'rest');
  assert.ok(Math.abs(machine.x - 400) < 0.001); assert.equal(machine.y, 450);
  const position = [machine.x, machine.y];
  machine.setCushions([{ id: 8, x: 250, y: 400, depth: 408 }]);
  assert.equal(machine.restingCushion, undefined); assert.equal(machine.state, 'IDLE');
  assert.deepEqual([machine.x, machine.y], position);
  const other = cushionMachine();
  other.setCushions([{ id: 9, x: 200, y: 400, depth: 408 }]);
  advanceUntil(other, () => other.cushionActivity === 'approach');
  other.setCushions([]); assert.equal(other.restingCushion, undefined); assert.equal(other.state, 'IDLE');
  for (let i = 0; i < 1000; i++) other.update(1 / 60);
  assert.equal(other.restingCushion, undefined);
});
test('both pets wake on touch and refresh dialogue and the internal reaction together', () => {
  for (const id of ['corgi', 'myeongrang']) {
    const animal = new Animal({ id, speed: 90, scale: 0.62, behavior: cushionProfile, animations: {
      idle: { frames: Array(8).fill(Texture.WHITE), fps: 3 },
      walk: { frames: Array(8).fill(Texture.WHITE), fps: 8 },
      emote: { frames: Array(8).fill(Texture.WHITE), fps: 4 },
    } }, () => 0.5);
    try {
      animal.setBounds(960, 388.8, 540);
      animal.setHome(960, 540, [{ id: 12, tab: 'Furniture', option: 4, x: 0.4, y: 0.75 }]);
      advanceUntil(animal, () => animal.state === 'SLEEP');
      assert.equal(animal.cushionId, 12); assert.ok(animal.floorDepth > 405);
      const position = [animal.x, animal.y];
      assert.equal(animal.pet(), true); assert.equal(animal.state, 'EMOTE'); assert.equal(animal.cushionId, undefined);
      assert.deepEqual([animal.x, animal.y], position);
      assert.equal(animal.children.length, 3);
      const bubble = animal.speechBubble, message = bubble.text, height = bubble.halfHeight;
      assert.equal(bubble.reactionText, '♡');
      animal.update(0.81); assert.equal(animal.pet(), true);
      assert.notEqual(bubble.text, message); assert.equal(bubble.reactionText, '♪'); assert.ok(bubble.halfHeight >= height - 13);
      animal.update(7); assert.equal(bubble.visible, false);
    } finally { animal.destroy({ children: true }); }
  }
});
test('lobby depth layers share furniture/animal ordering, keep speech above objects and track Home edits', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); classList = { add() {} };
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document, host = new Element();
  globalThis.document = { createElement: () => new Element(), querySelector: () => host };
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const home = new HomeState(), id = home.place('Furniture', 4); home.move(id, 0.4, 0.75);
  const scene = new LobbyScene({ id: 'myeongrang', speed: 90, scale: 0.62, behavior: cushionProfile,
    animations: { idle: { frames: [Texture.WHITE], fps: 3 }, walk: { frames: [Texture.WHITE], fps: 8 } } },
    undefined, true, undefined, undefined, undefined, { state: home, open() {} });
  try {
    scene.resize(960, 540);
    const animal = scene.children.find(child => child.label === 'myeongrang');
    const [map, , , depth, expressions] = scene.children;
    const cushion = map.objects.children.find(child => child.label === String(id));
    advanceUntil(scene, () => animal.state === 'SLEEP');
    assert.ok(depth.renderLayerChildren.indexOf(animal) > depth.renderLayerChildren.indexOf(cushion));
    assert.equal(animal.speechBubble.parent, animal);
    assert.equal(animal.speechBubble.parentRenderLayer, expressions);
    const snapshot = [animal.x, animal.y, animal.state];
    scene.setPaused(true); scene.update(50); animal.emit('pointerdown', { button: 0 });
    assert.deepEqual([animal.x, animal.y, animal.state], snapshot);
    scene.setPaused(false); animal.emit('pointerdown', { button: 0 }); assert.equal(animal.state, 'EMOTE');
    home.move(id, 0.5, 0.85); scene.update(0);
    assert.ok(depth.renderLayerChildren.indexOf(animal) < depth.renderLayerChildren.indexOf(cushion));
    home.remove(id); scene.update(0);
    assert.equal(cushion.destroyed, true); assert.equal(depth.renderLayerChildren.includes(cushion), false);
    assert.equal(animal.cushionId, undefined);
    scene.destroy({ children: true });
    assert.equal(host.children.length, 0); assert.equal(expressions.renderLayerChildren.length, 0);
    assert.equal(Texture.WHITE.destroyed, false);
  } finally {
    if (!scene.destroyed) scene.destroy({ children: true });
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
test('last applied character restores locally independently of presets and validates ownership/storage', async () => {
  const { CharacterSelection, CHARACTER_STORAGE_KEY } = await importTs('../src/animals/CharacterSelection.ts', import.meta.url);
  const { CharacterPresets } = await importTs('../src/animals/CharacterPresets.ts', import.meta.url);
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const current = new CharacterSelection(storage), presets = new CharacterPresets(storage);
  assert.equal(current.current.petId, 'corgi');
  const look = { petId: 'myeongrang', outfit: { Hat: 1, Body: 1, Acc: 0, Etc: 0 } };
  presets.save(0, { petId: 'corgi', outfit: { Hat: 0, Body: 0, Acc: 0, Etc: 0 } });
  assert.equal(current.save(look), true);
  look.outfit.Hat = 20;
  const restored = new CharacterSelection(storage).restore(['corgi', 'myeongrang'], (_key, index) => index <= 1);
  assert.equal(restored.petId, 'myeongrang'); assert.equal(restored.outfit.Hat, 1);
  restored.outfit.Hat = 0; assert.equal(current.current.outfit.Hat, 1);
  assert.equal(new CharacterPresets(storage).load(0).petId, 'corgi');
  assert.equal(new CharacterPresets(storage).load(0).outfit.Hat, 0);
  assert.equal(current.save({ petId: 'x', outfit: { Hat: -1, Body: 0, Acc: 0, Etc: 0 } }), false);
  values.set(CHARACTER_STORAGE_KEY, JSON.stringify({ petId: 'unavailable-pet', outfit: { Hat: 20, Body: 1, Acc: 0, Etc: 0 } }));
  const repaired = new CharacterSelection(storage).restore(['corgi', 'myeongrang'], (_key, index) => index <= 1);
  assert.equal(repaired.petId, 'corgi'); assert.equal(repaired.outfit.Hat, 0); assert.equal(repaired.outfit.Body, 1);
  assert.deepEqual(new CharacterSelection(storage).current, repaired);
  for (const corrupt of ['{', 'null', '{"petId":"myeongrang","outfit":{}}']) {
    values.set(CHARACTER_STORAGE_KEY, corrupt);
    assert.equal(new CharacterSelection(storage).current.petId, 'corgi');
  }
  const blocked = new CharacterSelection({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  assert.equal(blocked.save({ petId: 'myeongrang', outfit: { Hat: 1, Body: 0, Acc: 0, Etc: 0 } }), true);
  assert.equal(blocked.current.petId, 'myeongrang');
});
test('daily quests persist cooldown/progress, grant coins once and feed existing Shop purchases', () => {
  let now = new Date(2026, 9, 17, 12).getTime();
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let state = new ShopState(storage, () => now);
  assert.equal(state.claimDaily('pet'), false);
  assert.equal(state.claimDaily('missing'), false);
  assert.equal(state.recordPet(), true); assert.equal(state.recordPet(), false);
  now += 9999; state = new ShopState(storage, () => now); assert.equal(state.recordPet(), false);
  now++; assert.equal(state.recordPet(), true);
  now += 10000; assert.equal(state.recordPet(), true); assert.equal(state.recordPet(), false);
  assert.equal(state.dailyQuests[0].progress, 3); assert.equal(state.dailyQuests[0].canClaim, true);
  assert.equal(state.coins, 1000); assert.equal(state.claimDaily('pet'), true); assert.equal(state.coins, 1050);
  assert.equal(state.claimDaily('pet'), false);
  state = new ShopState(storage, () => now); assert.equal(state.claimDaily('pet'), false); assert.equal(state.coins, 1050);
  for (let i = 0; i < 8; i++) state.completeRun();
  assert.equal(state.xp, 400); assert.equal(state.dailyQuests[1].progress, 1);
  assert.equal(state.claimDaily('run'), true); assert.equal(state.coins, 1150);
  assert.equal(state.buy('Hat', 2), 'purchased'); assert.equal(state.coins, 1075);
  const restored = new ShopState(storage, () => now);
  assert.equal(restored.owns('Hat', 2), true); assert.equal(restored.coins, 1075);
  assert.equal(restored.dailyQuests.every(quest => quest.claimed), true);
});

test('daily local midnight resets both quests while preserving purchases/pass and protects a claimed day on clock rollback', () => {
  let now = new Date(2026, 9, 17, 23, 59, 59).getTime();
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const state = new ShopState(storage, () => now);
  state.buy('Body', 2); state.completeRun(); state.claimDaily('run'); state.recordPet();
  const coins = state.coins, xp = state.xp;
  now += 1000; state.refreshDaily();
  assert.deepEqual(state.dailyQuests.map(quest => [quest.progress, quest.claimed]), [[0, false], [0, false]]);
  assert.equal(state.coins, coins); assert.equal(state.xp, xp); assert.equal(state.owns('Body', 2), true);
  assert.equal(state.recordPet(), true); // new day's cooldown is independent
  state.completeRun(); assert.equal(state.claimDaily('run'), true);
  now -= 86400000;
  const restored = new ShopState(storage, () => now); restored.refreshDaily();
  assert.equal(restored.dailyQuests[1].claimed, true); assert.equal(restored.claimDaily('run'), false);
  now += 86400000 * 3;
  const later = new ShopState(storage, () => now); assert.equal(later.dailyQuests[1].progress, 0);
  later.completeRun(); assert.equal(later.dailyQuests[1].canClaim, true); // works with pass XP already earned
});

test('daily migration rejects malformed progress/claims and storage failure preserves session rewards', () => {
  const now = new Date(2026, 9, 17, 12).getTime();
  const old = { coins: 900, xp: 400, premium: true, items: ['Hat:2'], claimed: ['free-1'] };
  const values = new Map([[SHOP_STORAGE_KEY, JSON.stringify(old)]]), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const legacy = new ShopState(storage, () => now);
  assert.equal(legacy.coins, 900); assert.equal(legacy.owns('Hat', 2), true);
  legacy.completeRun(); assert.equal(legacy.dailyQuests[1].canClaim, true); assert.equal(legacy.xp, 400);
  values.set(SHOP_STORAGE_KEY, JSON.stringify({ ...old, daily: { day: '2026-10-17', pet: -2, run: '1', claimed: ['pet', 'run'], lastPet: 'bad' } }));
  const repaired = new ShopState(storage, () => now);
  assert.deepEqual(repaired.dailyQuests.map(q => [q.progress, q.claimed]), [[0, false], [0, false]]);
  assert.equal(repaired.recordPet(), true);
  values.set(SHOP_STORAGE_KEY, JSON.stringify({ ...old, daily: { day: '2026-02-30', pet: 3, run: 1, claimed: ['pet', 'run'] } }));
  assert.equal(new ShopState(storage, () => now).dailyQuests[0].progress, 0);
  const blocked = new ShopState({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }, () => now);
  blocked.completeRun(); assert.equal(blocked.claimDaily('run'), true); assert.equal(blocked.claimDaily('run'), false);
  assert.equal(blocked.coins, 1100);
});

test('lobby valid touches count Daily, Quest claims update coins, translate and stop timers on close', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); inert = false; classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
    replaceChildren(...items) { this.children.forEach(item => { item.parent = undefined; }); this.children = []; this.append(...items); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); this.parent = undefined; }
    focus() { document.activeElement = this; }
    get isConnected() { return this.tag === 'main' || !!this.parent?.isConnected; }
    querySelectorAll() { const result = []; const walk = node => node.children.forEach(item => { if (item.tag === 'button' && !item.disabled) result.push(item); walk(item); }); walk(this); return result; }
  }
  const oldDocument = globalThis.document, oldHTMLElement = globalThis.HTMLElement, host = new Element('main');
  globalThis.HTMLElement = Element;
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host, activeElement: undefined };
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const { QuestPopup } = await importTs('../src/ui/QuestPopup.ts', import.meta.url);
  let now = new Date(2026, 9, 17, 12).getTime();
  const state = new ShopState(undefined, () => now);
  const scene = new LobbyScene({ id: 'myeongrang', speed: 90, scale: 0.62,
    animations: { idle: { frames: [Texture.WHITE], fps: 3 }, emote: { frames: [Texture.WHITE], fps: 4 } } },
    undefined, true, undefined, undefined, { shop() {}, quest() {}, pet: () => state.recordPet() });
  const popup = new QuestPopup(state, value => scene.setPaused(value), () => {});
  try {
    scene.resize(960, 540);
    const pet = scene.children.find(child => child.label === 'myeongrang');
    const touch = () => pet.emit('pointerdown', { button: 0 });
    pet.emit('pointerdown', { button: 2 }); assert.equal(state.dailyQuests[0].progress, 0);
    touch(); touch(); assert.equal(state.dailyQuests[0].progress, 1);
    scene.update(0.2); touch(); assert.equal(state.dailyQuests[0].progress, 1);
    for (let i = 0; i < 2; i++) { now += 10000; scene.update(0.81); touch(); }
    assert.equal(state.dailyQuests[0].progress, 3);
    popup.open(); popup.open(); assert.equal(host.children.length, 2);
    const panel = host.children[1].children[0], content = panel.children[3];
    assert.equal(content.children.length, 4);
    assert.equal(content.children[2].children[1].disabled, false);
    assert.equal(content.children[2].children[1].getAttribute('data-reward-ready'), 'true');
    assert.equal(panel.children[2].children[0].getAttribute('data-reward-ready'), 'true');
    assert.equal(content.children[3].children[1].disabled, true);
    content.children[2].children[1].dispatchEvent(new Event('click'));
    assert.equal(state.coins, 1050); assert.equal(content.children[2].children[1].disabled, true);
    assert.equal(content.children[2].children[1].getAttribute('data-reward-ready'), 'false');
    assert.equal(content.children[2].children[1].getAttribute('data-claimed'), 'true');
    assert.equal(panel.children[2].children[0].getAttribute('data-reward-ready'), 'false');
    assert.equal(document.activeElement, content);
    setLanguage('ko'); assert.equal(content.children[2].children[0].children[0].textContent, '오늘의 교감');
    assert.equal(content.children[2].children[1].textContent, '수령 완료');
    now += 86400000; state.refreshDaily();
    assert.equal(content.children[2].children[0].children[2].textContent.startsWith('0/3'), true);
    touch(); assert.equal(state.dailyQuests[0].progress, 0); // paused popup blocks input
    panel.children[2].children[1].dispatchEvent(new Event('click'));
    assert.equal(content.children[0].textContent, '주간 퀘스트는 준비 중이에요.');
    popup.close(); assert.equal(host.children.length, 1);
    popup.destroy(); scene.destroy({ children: true });
  } finally {
    popup.destroy(); if (!scene.destroyed) scene.destroy({ children: true }); setLanguage('en');
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = oldHTMLElement;
  }
});
test('Friends opens as an accessible paused lobby overlay and Quest badge clears after reward collection', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); inert = false; classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    replaceChildren(...items) { this.children.forEach(item => { item.parent = undefined; }); this.children = []; this.append(...items); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); this.parent = undefined; }
    get isConnected() { return this.tag === 'main' || !!this.parent?.isConnected; }
    focus() { document.activeElement = this; }
    querySelectorAll() { const controls = []; const walk = node => node.children.forEach(item => { if (item.tag === 'button' && !item.disabled) controls.push(item); walk(item); }); walk(this); return controls; }
  }
  const oldDocument = globalThis.document, oldHTMLElement = globalThis.HTMLElement;
  const host = new Element('main'); globalThis.HTMLElement = Element;
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host, activeElement: undefined };
  const { FriendsPopup } = await importTs('../src/ui/FriendsPopup.ts', import.meta.url);
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const state = new ShopState(); state.claim(1, false);
  let scene; const friends = new FriendsPopup(value => scene.setPaused(value));
  scene = new LobbyScene({ id: 'myeongrang', speed: 90, scale: 0.62,
    animations: { idle: { frames: [Texture.WHITE], fps: 3 } } }, undefined, true, undefined, undefined,
    { shop() {}, quest() {}, friends: () => friends.open(), rewards: () => state.hasQuestRewards });
  try {
    scene.resize(960, 540);
    const hud = host.children[0], questButton = hud.children[1].children[0], friendButton = hud.children[1].children[1];
    assert.equal(questButton.getAttribute('data-reward-ready'), 'false');
    state.completeRun(); scene.update(0);
    assert.equal(questButton.getAttribute('data-reward-ready'), 'true');
    assert.equal(questButton.getAttribute('data-i18n-aria'), 'questRewardReady');
    state.claimDaily('run'); assert.equal(state.hasQuestRewards, true); // newly unlocked pass tier
    state.claim(2, false); scene.update(0);
    assert.equal(questButton.getAttribute('data-reward-ready'), 'false');
    assert.equal(friendButton.disabled, false); friendButton.focus(); friendButton.dispatchEvent(new Event('click'));
    friends.open(); assert.equal(host.children.length, 2); assert.equal(hud.inert, true);
    const animal = scene.children.find(child => child.label === 'myeongrang'), position = [animal.x, animal.y];
    scene.update(20); animal.emit('pointerdown', { button: 0 });
    assert.deepEqual([animal.x, animal.y], position); assert.equal(animal.state, 'IDLE');
    const overlay = host.children[1], panel = overlay.children[0], tabs = panel.children[2], content = panel.children[3];
    assert.equal(panel.getAttribute('role'), 'dialog');
    assert.deepEqual(tabs.children.map(button => button.textContent), ['Friends', 'Add Friend', 'Requests']);
    assert.equal(content.children[1].textContent, 'Your friends will appear here.');
    overlay.dispatchEvent(new Event('pointerup')); assert.equal(host.children.length, 2);
    tabs.children[1].dispatchEvent(new Event('click')); assert.equal(content.children[1].disabled, true);
    tabs.children[2].dispatchEvent(new Event('click')); assert.equal(content.children[1].textContent, 'No friend requests yet.');
    setLanguage('ko'); assert.equal(content.children[1].textContent, '아직 받은 친구 요청이 없어요.');
    const controls = panel.querySelectorAll(); controls.at(-1).focus();
    overlay.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Tab' }));
    assert.equal(document.activeElement, panel.children[1]);
    overlay.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
    assert.equal(host.children.length, 1); assert.equal(hud.inert, false); assert.equal(document.activeElement, friendButton);
    friendButton.dispatchEvent(new Event('click'));
    host.children[1].dispatchEvent(new Event('pointerdown')); host.children[1].dispatchEvent(new Event('pointerup'));
    assert.equal(host.children.length, 1);
    friends.destroy(); scene.destroy({ children: true }); assert.equal(host.children.length, 0);
  } finally {
    friends.destroy(); if (!scene.destroyed) scene.destroy({ children: true }); setLanguage('en');
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = oldHTMLElement;
  }
});
test('loading typography keeps one caption and cleans DOM when boot/preload scenes end', async () => {
  class Element {
    children = []; attributes = new Map();
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document, host = new Element();
  globalThis.document = { createElement: () => new Element(), querySelector: () => host };
  const { BootScene } = await importTs('../src/game/scenes/BootScene.ts', import.meta.url);
  const { PreloadScene } = await importTs('../src/game/scenes/PreloadScene.ts', import.meta.url);
  const boot = new BootScene();
  try {
    assert.equal(host.children.length, 1); assert.equal(host.children[0].textContent, 'Paw Haven');
    boot.resize(960, 540); boot.destroy({ children: true }); assert.equal(host.children.length, 0);
    const preload = new PreloadScene();
    try {
      const caption = host.children[0]; assert.equal(caption.attributes.get('role'), 'status');
      assert.equal(caption.textContent, t('loading'));
      preload.setProgress(0.5); preload.resize(960, 540); preload.setProgress(1);
      assert.equal(host.children.length, 1); assert.equal(host.children[0], caption);
      assert.equal(preload.children.length, 1); // only the progress graphic is rendered in Pixi
    } finally { preload.destroy({ children: true }); }
    assert.equal(host.children.length, 0);
  } finally {
    if (!boot.destroyed) boot.destroy({ children: true });
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
test('both pets accept DOM body taps after Play victory returns to Lobby, including airborne roaming', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); style = {}; classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
    hasPointerCapture() { return false; }
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window, host = new Element('main');
  globalThis.document = Object.assign(new EventTarget(), { createElement: tag => new Element(tag), querySelector: () => host });
  globalThis.window = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) });
  const { Container } = await import('pixi.js');
  const { SceneManager } = await importTs('../src/game/SceneManager.ts', import.meta.url);
  const { LobbyScene } = await importTs('../src/game/scenes/LobbyScene.ts', import.meta.url);
  const { PlayScene } = await importTs('../src/game/scenes/PlayScene.ts', import.meta.url);
  const app = { stage: new Container(), screen: { width: 960, height: 540 } }, manager = new SceneManager(app);
  const down = target => target.dispatchEvent(Object.assign(new Event('pointerdown', { cancelable: true }), { button: 0 }));
  try {
    for (const id of ['corgi', 'myeongrang']) {
      const config = { id, speed: 90, scale: 0.62, behavior: {
        ...CORGI_BEHAVIOR, durations: { ...CORGI_BEHAVIOR.durations, IDLE: [0.1, 0.1] }, weights: { JUMP: 1 },
      }, animations: {
        idle: { frames: [Texture.WHITE], fps: 3 }, jump: { frames: [Texture.WHITE], fps: 6 },
        emote: { frames: [Texture.WHITE], fps: 4 },
      } };
      let scene;
      const lobby = () => { scene = new LobbyScene(config, () => {
        manager.show(new PlayScene(config, lobby));
      }, true); manager.show(scene); };
      lobby();
      const oldTarget = host.children[0].children.at(-1);
      down(oldTarget); assert.equal(scene.children.find(child => child.label === id).speechBubble.visible, true);
      host.children[0].children[2].children[0].dispatchEvent(new Event('click'));
      const play = app.stage.children[0];
      play.run.x = play.run.finish; manager.update(0.05); assert.equal(play.run.won, true);
      play.back.dispatchEvent(new Event('click'));
      manager.update(2); assert.equal(play.destroyed, true); assert.equal(host.children.length, 1);
      const pet = scene.children.find(child => child.label === id), target = host.children[0].children.at(-1);
      assert.notEqual(target, oldTarget); assert.equal(target.disabled, false);
      assert.match(target.attributes.get('style'), /left:.*%;top:.*%;width:.*%;height:.*%/);
      down(oldTarget); assert.equal(pet.speechBubble.visible, false); // old listener was aborted
      down(target); assert.equal(pet.speechBubble.visible, true); assert.equal(pet.state, 'EMOTE');
      const message = pet.speechBubble.text;
      manager.update(0.4); down(target); assert.equal(pet.speechBubble.text, message);
      manager.update(0.41); down(target); assert.notEqual(pet.speechBubble.text, message);
      manager.setPaused(true); manager.update(1); const paused = pet.speechBubble.text;
      down(target); assert.equal(pet.speechBubble.text, paused); manager.setPaused(false);
      manager.update(7); manager.update(0.2); assert.equal(pet.state, 'JUMP');
      down(target); assert.equal(pet.state, 'EMOTE'); assert.equal(pet.speechBubble.visible, true);
      app.screen = { width: 480, height: 270 }; manager.resize(); manager.update(0);
      assert.match(target.attributes.get('style'), /width:/); app.screen = { width: 960, height: 540 };
    }
  } finally {
    manager.destroy(); app.stage.destroy();
    assert.equal(host.children.length, 0);
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

test('every enabled lobby menu plays one shared click before its action', async () => {
  class Element extends EventTarget {
    children = []; attributes = new Map(); classList = { add() {} };
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document, host = new Element();
  globalThis.document = { createElement: () => new Element(), querySelector: () => host };
  const { LobbyHud } = await importTs('../src/ui/LobbyHud.ts', import.meta.url);
  const events = [], action = id => () => events.push(id);
  const hud = new LobbyHud(action('play'), false, action('character'), action('settings'),
    { shop: action('shop'), quest: action('quest'), friends: action('friends'), click: action('sound') }, action('home'));
  try {
    for (const group of hud.element.children) for (const button of group.children) {
      const id = button.attributes.get('data-menu');
      if (!id) continue;
      const start = events.length; button.dispatchEvent(new Event('click'));
      assert.deepEqual(events.slice(start), ['sound', id]);
    }
    const disabled = hud.element.children[1].children[0]; disabled.disabled = true;
    const count = events.filter(item => item === 'sound').length;
    disabled.dispatchEvent(new Event('click'));
    assert.equal(events.filter(item => item === 'sound').length, count);
  } finally {
    hud.destroy();
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('adventure course takes 20–30 seconds, activates a safe checkpoint and freezes the finish record', async () => {
  const { ADVENTURE_COURSE, ADVENTURE_FINISH, ADVENTURE_CHECKPOINT, ADVENTURE_TARGETS } = await importTs('../src/game/AdventureCourse.ts', import.meta.url);
  for (const fps of [30, 60, 120]) {
    const run = new DummyRun(ADVENTURE_COURSE, 1 / 0.78, {
      finish: ADVENTURE_FINISH, checkpoint: ADVENTURE_CHECKPOINT, targets: ADVENTURE_TARGETS, manualReturn: true,
    });
    const jumps = [560, 1260, 2190, 3210, 3760, 4390, 5410]; let next = 0;
    for (let i = 0; i < fps * 35 && !run.won; i++) {
      if (next < jumps.length && run.x >= jumps[next]) { run.jump(); next++; }
      run.update(1 / fps, 1);
    }
    assert.equal(run.won, true); assert.equal(run.respawns, 0);
    assert.equal(run.checkpoint, ADVENTURE_CHECKPOINT);
    assert.ok(run.elapsed >= 20 && run.elapsed <= 30, String(run.elapsed));
    const record = run.elapsed;
    run.update(5, 1); assert.equal(run.elapsed, record); assert.equal(run.returnReady, false); assert.equal(run.fade, 0);
    run.leave(); run.update(0.41, 0); assert.equal(run.returnReady, true); assert.equal(run.fade, 1);
  }
  const run = new DummyRun(ADVENTURE_COURSE, 1, { checkpoint: ADVENTURE_CHECKPOINT, finish: ADVENTURE_FINISH });
  run.x = ADVENTURE_CHECKPOINT; run.update(0.01, 0);
  run.x = 4550; run.height = -200; run.update(0.01, 0);
  assert.equal(run.respawns, 1); assert.equal(run.x, ADVENTURE_CHECKPOINT); assert.equal(run.grounded, true);
  assert.ok(run.elapsed > 0);
});

test('practice targets require an attack in range and facing direction, and never grant coins', () => {
  const create = () => new DummyRun(flatCourse, 1, { targets: [500] });
  const run = create(); run.x = 410;
  run.update(0.1, 0); assert.equal(run.targets[0].broken, false);
  run.direction = -1; run.startAttack(); run.update(0.5, 0); assert.equal(run.targets[0].broken, false);
  run.direction = 1; run.startAttack(); run.update(0.1, 0); assert.equal(run.targets[0].broken, true);
  run.update(1, 0); assert.equal(run.targets.filter(target => target.broken).length, 1);
  const high = create(); high.x = 410; high.height = 150; high.startAttack(); high.update(0.01, 0);
  assert.equal(high.targets[0].broken, false);
  const dash = create(); dash.x = 410; dash.startDash(); dash.update(0.1, 0);
  assert.equal(dash.targets[0].broken, false);
});

test('results submit completion once, wait for a choice and recover from a rejected retry', async () => {
  const { PlayScene } = await importTs('../src/game/scenes/PlayScene.ts', import.meta.url);
  class Element extends EventTarget {
    children = []; attributes = new Map(); style = {}; classList = { add() {} };
    append(...items) { this.children.push(...items); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() {}
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  const host = new Element();
  globalThis.document = Object.assign(new EventTarget(), { createElement: () => new Element(), querySelector: () => host });
  globalThis.window = new EventTarget();
  let completed = 0, returned = 0, retries = 0, scene;
  try {
    scene = new PlayScene({ id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: [Texture.WHITE], fps: 3 } } },
      () => returned++, { open() {}, complete() { completed++; }, retry: async () => { retries++; throw Error('offline'); } });
    scene.run.x = scene.run.finish; scene.update(0.01); scene.update(3);
    assert.equal(completed, 1); assert.equal(returned, 0); assert.equal(scene.result.hidden, false);
    scene.retry.dispatchEvent(new Event('click')); scene.retry.dispatchEvent(new Event('click'));
    scene.update(0.41);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(retries, 1); assert.equal(scene.retry.disabled, false);
    scene.update(0.1); assert.match(scene.stats.textContent, /Could not start/);
    scene.back.dispatchEvent(new Event('click')); scene.update(0.41); scene.update(1);
    assert.equal(returned, 1); assert.equal(completed, 1);
  } finally {
    scene?.destroy({ children: true });
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

test('healing dialogue personalizes selected lines, uses a separate name line and preserves guest translations', async () => {
  const { HealingDialogue, HEALING_LINES } = await importTs('../src/animals/HealingDialogue.ts', import.meta.url);
  let nickname = '명랑아빠';
  const dialogue = new HealingDialogue(() => 0, () => nickname);
  try {
    setLanguage('ko'); dialogue.start();
    assert.equal(dialogue.message.split('\n')[0], '명랑아빠님,');
    assert.ok(dialogue.message.includes('오늘도 고생 많았어요.'));
    const remaining = dialogue.remainingTime;
    setLanguage('en'); assert.equal(dialogue.message.split('\n')[0], '명랑아빠,');
    assert.equal(dialogue.remainingTime, remaining);
    nickname = null; assert.equal(dialogue.message, HEALING_LINES[0].en);
    nickname = 'NewFriend'; assert.equal(dialogue.message.split('\n')[0], 'NewFriend,');
    dialogue.start(true); assert.equal(dialogue.message, HEALING_LINES[1].en);
    for (const invalid of ['', '  ', '<script>', 'a'.repeat(17)]) {
      nickname = invalid; const fallback = new HealingDialogue(() => 0, () => nickname); fallback.start();
      assert.equal(fallback.message, HEALING_LINES[0].en);
    }
    const beforeUpdate = dialogue.remainingTime; dialogue.update(0.5); assert.equal(dialogue.remainingTime, beforeUpdate - 0.5);
  } finally { setLanguage('en'); }
});

test('both animals render the current nickname, retain long Korean names and keep touch cooldowns', () => {
  const longName = '가나다라마바사아자차카타파하가나';
  for (const id of ['corgi', 'myeongrang']) {
    let nickname = longName;
    const animal = new Animal({ id, speed: 90, scale: 0.62, animations: {
      idle: { frames: [Texture.WHITE], fps: 3 }, emote: { frames: [Texture.WHITE], fps: 3 },
    } }, () => 0, () => nickname);
    try {
      setLanguage('ko'); animal.setBounds(960, 390); animal.pet();
      const bubble = animal.speechBubble, message = bubble.text;
      assert.ok(message.startsWith(longName + '님,\n'));
      assert.ok(bubble.displayText.replace(/\s/g, '').includes(longName + '님,'));
      assert.ok(Number.isFinite(bubble.x) && Number.isFinite(bubble.y));
      assert.equal(animal.pet(), false); assert.equal(bubble.text, message);
      nickname = null; animal.update(0.1); assert.ok(!bubble.text.includes(longName));
      assert.equal(bubble.visible, true);
    } finally { animal.destroy({ children: true }); setLanguage('en'); }
  }
});
