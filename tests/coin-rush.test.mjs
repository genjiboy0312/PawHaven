import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTs } from './load-typescript.mjs';

const { DummyRun } = await importTs('../src/game/DummyRun.ts', import.meta.url);
const { COURSES } = await importTs('../src/game/CourseCatalog.ts', import.meta.url);
const { COURSE_COINS } = await importTs('../src/game/CourseCoins.ts', import.meta.url);
const { SingleRecords } = await importTs('../src/game/SingleRecords.ts', import.meta.url);
const { parseSingleRecordData } = await importTs('../src/account/SingleRecordSync.ts', import.meta.url);
const { validRunCoins } = await importTs('../src/shop/RunReward.ts', import.meta.url);
const { PLAY_ZOOM } = await importTs('../src/game/PlayCamera.ts', import.meta.url);
const map = COURSES.coinRush;

function newRound() {
  return new DummyRun(map.solids, 1 / PLAY_ZOOM, {
    collectionSeconds: map.goalSeconds,
    finish: map.finish,
    coins: COURSE_COINS.coinRush,
  });
}

test('a running and jumping route can collect all twelve coins before the deadline', () => {
  const run = newRound();
  assert.equal(run.coins.items.length, 12);
  for (const [index, platform] of run.course.entries()) {
    const coins = run.coins.items.slice(index * 2, index * 2 + 2);
    for (const coin of coins) {
      if (run.height < platform.top || coin.height - platform.top > run.bodyHeight) run.jump();
      for (let frame = 0; frame < 180 && !run.won; frame++) {
        const delta = coin.x - run.x;
        run.update(1 / 120, Math.abs(delta) < 3 ? 0 : Math.sign(delta));
        if (coin.collected && run.grounded && Math.abs(run.x - coin.x) < 4) break;
      }
      assert.ok(coin.collected, `platform ${index + 1} at ${coin.x}, ${coin.height}`);
    }
  }
  assert.equal(run.coins.collected, 12);
  assert.equal(run.won, true);
  assert.ok(run.elapsed < map.goalSeconds);
  assert.equal(run.respawns, 0);
  assert.equal(newRound().coins.collected, 0);
});

test('the far edge does not end a partial run and the deadline freezes its score', () => {
  const run = newRound();
  run.x = run.finish;
  run.height = map.solids.at(-1).top;
  run.update(.02, 0);
  assert.equal(run.won, false);

  run.x = run.coins.items[0].x;
  run.height = 0;
  run.update(.02, 0);
  assert.equal(run.coins.collected, 1);
  run.elapsed = map.goalSeconds - .001;
  run.x = run.coins.items[1].x;
  run.update(.02, 0);
  assert.equal(run.elapsed, map.goalSeconds);
  assert.equal(run.won, true);
  run.update(1, 1);
  assert.equal(run.coins.collected, 1);
});

test('a round score is not accepted as a race reward or synchronized personal time', () => {
  const data = { version: 2, times: { coinRush: 1000 }, goals: { coinRush: ['finish'] } };
  const records = new SingleRecords({ getItem: () => JSON.stringify(data), setItem() {} });
  assert.equal(records.best('coinRush'), null);
  assert.equal(records.complete('coinRush', 10, 0).newBest, false);
  assert.throws(() => parseSingleRecordData(data), /invalid_single_records/);
  assert.equal(validRunCoins('coinRush', 12), false);
});
