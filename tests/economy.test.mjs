import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { importTs } from './load-typescript.mjs';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const { EconomyClient } = await importTs('../src/shop/EconomyClient.ts', import.meta.url);
const { ServerShopState } = await importTs('../src/shop/ServerShopState.ts', import.meta.url);
const { parseEconomyResult } = await importTs('../src/shop/EconomySnapshot.ts', import.meta.url);
const { economyTransport } = await importTs('../src/shop/economyTransport.ts', import.meta.url);
const db = new PGlite();
await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated, anon;");
await db.exec(await readFile(new URL('../supabase/migrations/202610170001_player_accounts.sql', import.meta.url), 'utf8'));
await db.query('insert into auth.users values($1),($2)', [A, B]);
await db.exec(await readFile(new URL('../supabase/migrations/202610170002_server_economy.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/202610210008_home_shop.sql', import.meta.url), 'utf8'));
let sequence = 0;
const uuid = () => '00000000-0000-4000-8000-' + String(++sequence).padStart(12, '0');
async function as(user, query, params = [], role = 'authenticated') {
  await db.exec('set role ' + role);
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
    return await db.query(query, params);
  } finally { await db.exec('reset role'); }
}
async function command(user, action, payload = {}, id = uuid()) {
  const result = await as(user, 'select public.economy_command($1,$2,$3::jsonb) as result', [action, id, JSON.stringify(payload)]);
  return result.rows[0].result;
}
const load = user => command(user, 'load');
async function finish(user = A) {
  const start = await command(user, 'run_start');
  await db.query("update public.economy_runs set started_at = clock_timestamp() - interval '6 seconds' where id=$1", [start.run_id]);
  return command(user, 'run_finish', { run_id: start.run_id });
}
beforeEach(async () => { await db.exec('truncate public.player_profiles, public.player_saves, public.economy_requests, public.economy_runs, public.economy_claims, public.economy_items, public.economy_home_items, public.economy_wallets'); });
after(async () => { await db.close(); });

test('furniture buys derive price and quantity on the server, isolate accounts and replay only once', async () => {
  const initial = await load(A); assert.equal(initial.snapshot.homeShopReady, true); assert.deepEqual(initial.snapshot.homeItems, {});
  const payload = { category: 'Furniture', index: 5, price: 0, quantity: 99, user_id: B }, id = uuid();
  const first = await command(A, 'buy_home', payload, id);
  assert.equal(first.snapshot.coins, 750); assert.equal(first.snapshot.homeItems['Furniture:5'], 1);
  await command(A, 'buy_home', { category: 'Furniture', index: 5 });
  const replay = await command(A, 'buy_home', payload, id);
  assert.equal(replay.snapshot.coins, 500); assert.equal(replay.snapshot.homeItems['Furniture:5'], 2);
  await assert.rejects(() => command(A, 'buy_home', { category: 'Furniture', index: 4 }, id), /request_id_reused/);
  const legacy = await command(A, 'buy_home', { category: 'Etc', index: 1 });
  assert.equal(legacy.snapshot.coins, 375); assert.equal(legacy.snapshot.homeItems['Etc:1'], 4);
  assert.deepEqual((await load(B)).snapshot.homeItems, {});
  const otherRows = await as(B, 'select * from public.economy_home_items'); assert.equal(otherRows.rows.length, 0);
  await assert.rejects(() => as(A, 'update public.economy_home_items set quantity=20'), /permission denied/);
  await assert.rejects(() => command(null, 'buy_home', { category: 'Furniture', index: 5 }));
  await db.exec(await readFile(new URL('../supabase/migrations/202610210008_home_shop.sql', import.meta.url), 'utf8'));
  assert.equal((await load(A)).snapshot.homeItems['Furniture:5'], 2);
});

test('invalid furniture, insufficient coins, full storage and rate limits cannot debit or grant stock', async () => {
  await load(A);
  for (const payload of [{ category: 'Hat', index: 5 }, { category: 'Furniture', index: 6 }, { category: 'Etc', index: 5 }, { category: 'Furniture', index: 0 }, { category: 'Furniture', index: 1.5 }]) {
    await assert.rejects(() => command(A, 'buy_home', payload));
  }
  await db.query('update public.economy_wallets set coins=10 where user_id=$1', [A]);
  const poor = await command(A, 'buy_home', { category: 'Furniture', index: 5 });
  assert.equal(poor.outcome, 'insufficient'); assert.equal(poor.snapshot.coins, 10); assert.deepEqual(poor.snapshot.homeItems, {});
  await db.query("insert into public.economy_home_items values($1,'Furniture',5,20)", [A]);
  const full = await command(A, 'buy_home', { category: 'Furniture', index: 5 });
  assert.equal(full.outcome, 'limit'); assert.equal(full.snapshot.coins, 10); assert.equal(full.snapshot.homeItems['Furniture:5'], 20);
  await db.query('update public.economy_wallets set request_count=120 where user_id=$1', [A]);
  await assert.rejects(() => command(A, 'buy_home', { category: 'Etc', index: 1 }), /rate_limited/);
  for (const homeItems of [{ 'Furniture:5': 21 }, { 'Furniture:1': 1 }, { 'Etc:5': 3 }, { 'Furniture:05': 1 }, []]) {
    assert.throws(() => parseEconomyResult({ ...poor, snapshot: { ...poor.snapshot, homeItems } }), /invalid_economy_response/);
  }
});

test('guest furniture purchases persist independently from placements and cloud normalization preserves purchased copies', async () => {
  const { ShopState } = await importTs('../src/shop/ShopState.ts', import.meta.url);
  const { HomeState } = await importTs('../src/home/HomeState.ts', import.meta.url);
  const { AccountStorage, normalizeSnapshot } = await importTs('../src/account/AccountStorage.ts', import.meta.url);
  const values = new Map(), storage = new AccountStorage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  let shop = new ShopState(storage);
  const home = new HomeState(storage, (tab, index) => shop.homeOwned(tab, index));
  assert.equal(home.place('Furniture', 5), undefined);
  assert.equal(shop.buyHome('Furniture', 5), 'purchased'); assert.equal(shop.buyHome('Furniture', 5), 'purchased');
  assert.equal(shop.coins, 500); assert.equal(home.remaining('Furniture', 5), 2);
  const first = home.place('Furniture', 5), second = home.place('Furniture', 5);
  assert.equal(home.place('Furniture', 5), undefined); assert.equal(home.remaining('Furniture', 5), 0);
  home.move(second, 0.75, 0.8); home.remove(first); assert.equal(home.remaining('Furniture', 5), 1);
  shop = new ShopState(storage); assert.equal(shop.homeOwned('Furniture', 5), 2); assert.equal(shop.coins, 500);
  assert.equal(normalizeSnapshot(storage.snapshot()).home.items[0].option, 5);
  const reloaded = new HomeState(storage, (tab, index) => shop.homeOwned(tab, index)); assert.equal(reloaded.items[0].x, 0.75);
  storage.owner = B; assert.equal(new ShopState(storage).homeOwned('Furniture', 5), 0);
  assert.equal(new HomeState(storage, () => 0).items.length, 0);
  assert.equal(shop.buyHome('Furniture', 99), 'invalid');
});

test('lost furniture purchase responses retry with the same key and keep existing outfits available before the new SQL', async () => {
  let lose = true;
  const api = new EconomyClient(async request => {
    const result = await rpc(A)(request);
    if (request.p_action === 'buy_home' && lose) { lose = false; throw Error('lost response'); }
    return result;
  }, uuid);
  const state = new ServerShopState(api);
  try {
    await idle(api); assert.equal(state.homeOwned('Furniture', 4), 3);
    assert.equal(await state.buyHome('Furniture', 5), 'invalid'); await idle(api);
    assert.equal(state.homeOwned('Furniture', 5), 0); await api.retry();
    assert.equal(state.homeOwned('Furniture', 5), 1); assert.equal(state.coins, 750);
  } finally { state.destroy(); }
  const old = await load(B); delete old.snapshot.homeShopReady; delete old.snapshot.homeItems;
  const oldApi = new EconomyClient(async () => old, uuid), legacy = new ServerShopState(oldApi);
  try {
    await idle(oldApi); assert.equal(legacy.ready, true); assert.equal(legacy.homeShopReady, false);
    assert.equal(legacy.owns('Hat', 1), true); assert.equal(await legacy.buyHome('Furniture', 5), 'invalid');
  } finally { legacy.destroy(); }
});

test('Furniture shop purchases update the Home sofa inventory and its shared lobby sprite without destroying the resource', async () => {
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Node.js' }, configurable: true });
  const { Texture, TextureSource } = await import('pixi.js');
  const { ShopScene } = await importTs('../src/game/scenes/ShopScene.ts', import.meta.url);
  const { HomeScene } = await importTs('../src/game/scenes/HomeScene.ts', import.meta.url);
  const { HomeState } = await importTs('../src/home/HomeState.ts', import.meta.url);
  const { LobbyMap } = await importTs('../src/home/LobbyMap.ts', import.meta.url);
  class Element extends EventTarget {
    children = []; attributes = new Map(); style = {}; classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    setAttribute(key,value) { this.attributes.set(key,value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document, host = new Element('main');
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host };
  const api = new EconomyClient(rpc(A), uuid), state = new ServerShopState(api);
  const values = new Map(), home = new HomeState({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, (tab, index) => state.homeOwned(tab, index));
  let shop, editor, lobby;
  const sofa = new Texture({ source: new TextureSource({ width: 1042, height: 407 }) });
  const textures = { background: Texture.WHITE, floor: Texture.WHITE, cushion: Texture.WHITE, sofa };
  try {
    await idle(api);
    shop = new ShopScene({ id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: [Texture.WHITE], fps: 3 } } }, state, () => {}, () => {});
    const panel = host.children[0];
    assert.deepEqual(panel.children[3].children.map(tab => tab.textContent), ['Style', 'Furniture', 'Pass']);
    panel.children[3].children[1].dispatchEvent(new Event('click'));
    const content = panel.children[4]; assert.equal(content.children[1].children.length, 5);
    assert.equal(content.children[1].children[4].children[0].children[0].src, './assets/home/pet-sofa-black-white.png');
    const buy = content.children[2].children[1]; buy.dispatchEvent(new Event('click')); buy.dispatchEvent(new Event('click'));
    await idle(api); assert.equal(state.coins, 750); assert.equal(state.homeOwned('Furniture', 5), 1);
    assert.equal(content.children[2].children[1].disabled, false); assert.match(content.children[2].children[0].children[1].textContent, /1\/20/);
    shop.destroy({ children: true });
    editor = new HomeScene(home, () => {}, textures); editor.resize(960, 540);
    const homePanel = host.children[0], tabs = homePanel.children[3], inventory = homePanel.children[4];
    tabs.children[2].dispatchEvent(new Event('click'));
    assert.match(inventory.children[4].getAttribute('aria-label'), /Black & White Pet Sofa/);
    assert.equal(inventory.children[4].disabled, false); inventory.children[4].dispatchEvent(new Event('click'));
    assert.equal(home.items.length, 1); assert.equal(inventory.children[4].disabled, true); assert.equal(inventory.children[4].children[1].textContent, '0');
    const rendered = editor.children[0].objects.children[0].children[1];
    assert.equal(rendered.texture, sofa); assert.equal(rendered.width, 170); assert.ok(rendered.height < 67);
    home.move(home.items[0].id, 0.75, 0.82);
    editor.destroy({ children: true }); assert.equal(sofa.destroyed, false);
    lobby = new LobbyMap(textures); lobby.draw(960, 540, home.current, home.items);
    assert.equal(lobby.objects.children[0].x, 720); assert.equal(lobby.objects.children[0].children[1].texture, sofa);
    home.remove(home.items[0].id); assert.equal(home.remaining('Furniture', 5), 1); assert.equal(state.homeOwned('Furniture', 5), 1);
    const original = await readFile(new URL('../Resources/Pet_Sofa_Black_White_Prototype.png', import.meta.url));
    assert.deepEqual(await readFile(new URL('../public/assets/home/pet-sofa-black-white.png', import.meta.url)), original);
  } finally {
    if (shop && !shop.destroyed) shop.destroy({ children: true }); if (editor && !editor.destroyed) editor.destroy({ children: true });
    lobby?.destroy({ children: true }); sofa.destroy(true); state.destroy();
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('server initializes each account once and derives prices without accepting a supplied balance', async () => {
  assert.equal((await load(A)).snapshot.coins, 1000);
  assert.equal((await load(A)).snapshot.coins, 1000);
  const result = await command(A, 'buy', { category: 'Hat', index: 2, price: 0, coins: 999999, user_id: B });
  assert.equal(result.outcome, 'purchased'); assert.equal(result.snapshot.coins, 925);
  assert.ok(result.snapshot.items.includes('Hat:2'));
  assert.equal((await load(B)).snapshot.coins, 1000);
  await assert.rejects(() => command(A, 'buy', { category: 'bad', index: -1 }));
  assert.equal((await load(A)).snapshot.coins, 925);
});

test('a replay returns the latest balance and cannot charge twice or change the original request', async () => {
  const id = uuid(), payload = { category: 'Hat', index: 2 };
  await command(A, 'buy', payload, id);
  await command(A, 'buy', { category: 'Body', index: 2 });
  const replay = await command(A, 'buy', payload, id);
  assert.equal(replay.outcome, 'purchased'); assert.equal(replay.snapshot.coins, 850);
  const owned = await command(A, 'buy', payload);
  assert.equal(owned.outcome, 'owned'); assert.equal(owned.snapshot.coins, 850);
  await assert.rejects(() => command(A, 'buy', { category: 'Hat', index: 3 }, id), /request_id_reused/);
  assert.equal((await load(A)).snapshot.coins, 850);
});

test('insufficient funds never grant an item or make a negative balance', async () => {
  await load(A);
  await db.query('update public.economy_wallets set coins=10 where user_id=$1', [A]);
  const result = await command(A, 'buy', { category: 'Body', index: 20 });
  assert.equal(result.outcome, 'insufficient'); assert.equal(result.snapshot.coins, 10);
  assert.equal(result.snapshot.items.includes('Body:20'), false);
});

test('server pet cooldown, daily cap and unique claim protect the daily reward', async () => {
  assert.equal((await command(A, 'claim_daily', { quest: 'pet' })).outcome, 'ignored');
  assert.equal((await command(A, 'pet')).snapshot.daily.pet, 1);
  assert.equal((await command(A, 'pet', { now: 9999999999999 })).snapshot.daily.pet, 1);
  for (let i = 0; i < 2; i++) {
    await db.query("update public.economy_wallets set last_pet=clock_timestamp()-interval '11 seconds' where user_id=$1", [A]);
    await command(A, 'pet');
  }
  const result = await command(A, 'claim_daily', { quest: 'pet', reward: 999999 });
  assert.equal(result.snapshot.coins, 1050); assert.equal(result.snapshot.daily.pet, 3);
  assert.equal((await command(A, 'claim_daily', { quest: 'pet' })).snapshot.coins, 1050);
  assert.equal((await command(A, 'pet')).snapshot.daily.pet, 3);
});

test('pass level and premium entitlement are checked before each one-time reward', async () => {
  assert.equal((await command(A, 'claim_pass', { tier: 2, premium: false })).outcome, 'ignored');
  assert.equal((await command(A, 'claim_pass', { tier: 1, premium: true })).outcome, 'ignored');
  const free = await command(A, 'claim_pass', { tier: 1, premium: false, reward: 999999 });
  assert.equal(free.snapshot.coins, 1020);
  assert.equal((await command(A, 'claim_pass', { tier: 1, premium: false })).snapshot.coins, 1020);
  await command(A, 'unlock_pass');
  const premium = await command(A, 'claim_pass', { tier: 1, premium: true });
  assert.equal(premium.snapshot.coins, 1060);
  assert.equal((await command(A, 'unlock_pass')).snapshot.coins, 1060);
});

test('runs need a server-issued token, sufficient time and the same user, and can award XP only once', async () => {
  const start = await command(A, 'run_start');
  assert.equal((await command(A, 'run_finish', { run_id: start.run_id })).outcome, 'run_rejected');
  await db.query("update public.economy_runs set started_at=clock_timestamp()-interval '6 seconds' where id=$1", [start.run_id]);
  assert.equal((await command(B, 'run_finish', { run_id: start.run_id })).outcome, 'run_rejected');
  const finished = await command(A, 'run_finish', { run_id: start.run_id, xp: 999999 });
  assert.equal(finished.snapshot.xp, 100); assert.equal(finished.snapshot.daily.run, 1);
  assert.equal((await command(A, 'run_finish', { run_id: start.run_id })).snapshot.xp, 100);
  assert.equal((await command(A, 'claim_daily', { quest: 'run' })).snapshot.coins, 1100);
  assert.equal((await command(A, 'claim_daily', { quest: 'run' })).snapshot.coins, 1100);
  for (let i = 0; i < 5; i++) await finish();
  assert.equal((await load(A)).snapshot.xp, 400);
});

test('expired and superseded run tokens do not grant rewards', async () => {
  const old = await command(A, 'run_start');
  const current = await command(A, 'run_start');
  await db.query("update public.economy_runs set started_at=clock_timestamp()-interval '20 minutes', expires_at=clock_timestamp()-interval '1 minute' where user_id=$1", [A]);
  for (const run_id of [old.run_id, current.run_id]) assert.equal((await command(A, 'run_finish', { run_id })).outcome, 'run_rejected');
  assert.equal((await load(A)).snapshot.xp, 0);
});

test('daily reset uses the server Korea date and cannot be shifted by a client timestamp', async () => {
  await command(A, 'pet'); await command(A, 'claim_pass', { tier: 1, premium: false });
  await db.query("update public.economy_wallets set quest_day=quest_day-1, daily_pet=3, daily_run=1 where user_id=$1", [A]);
  const result = await command(A, 'load', { day: '2000-01-01', now: 0 });
  const expected = await db.query("select (clock_timestamp() at time zone 'Asia/Seoul')::date::text as day");
  assert.equal(result.snapshot.daily.day, expected.rows[0].day);
  assert.equal(result.snapshot.daily.pet, 0); assert.equal(result.snapshot.daily.run, 0);
  assert.equal(result.snapshot.coins, 1020); assert.ok(result.snapshot.claimed.includes('free-1'));
});

test('anonymous callers and direct writes are denied, and one account cannot read another wallet', async () => {
  await load(A); await load(B);
  await assert.rejects(() => as(null, "select public.economy_command('load',$1,'{}')", [uuid()], 'anon'), /permission denied/);
  await assert.rejects(() => as(A, 'update public.economy_wallets set coins=999999'), /permission denied/);
  await assert.rejects(() => as(A, "insert into public.economy_items values($1,'Hat',2)", [A]), /permission denied/);
  const rows = await as(A, 'select user_id from public.economy_wallets');
  assert.deepEqual(rows.rows.map(row => row.user_id), [A]);
  await assert.rejects(() => as(A, 'select * from public.economy_requests'), /permission denied/);
  await assert.rejects(() => as(A, 'select pawhaven_private.economy_snapshot($1)', [B]), /permission denied/);
});

test('malformed payload and request rate limits roll back without changing a wallet', async () => {
  await load(A);
  for (const payload of [null, [], 'bad']) await assert.rejects(() => command(A, 'buy', payload));
  await db.query('update public.economy_wallets set request_count=120 where user_id=$1', [A]);
  await assert.rejects(() => command(A, 'buy', { category: 'Hat', index: 2 }), /rate_limited/);
  const result = await load(A); assert.equal(result.snapshot.coins, 1000);
  assert.equal(result.snapshot.items.includes('Hat:2'), false);
});


async function idle(api) {
  for (let i = 0; i < 1000 && api.busy; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(api.busy, false);
}
const rpc = user => request => command(user, request.p_action, request.p_payload, request.p_request_id);

test('lost purchase responses retry with the same id and restore the latest server balance', async () => {
  const calls = []; let lose = true;
  const api = new EconomyClient(async request => {
    calls.push(request);
    const result = await rpc(A)(request);
    if (request.p_action === 'buy' && lose) { lose = false; throw Error('response lost after commit'); }
    return result;
  }, uuid);
  const state = new ServerShopState(api);
  try {
    await idle(api);
    assert.equal(await state.buy('Hat', 2), 'invalid'); await idle(api);
    assert.equal(api.connection, 'offline'); assert.equal(state.ready, false); assert.equal(state.coins, 1000);
    await command(A, 'buy', { category: 'Body', index: 2 }); // another device
    await api.retry();
    assert.equal(state.coins, 850); assert.equal(state.owns('Hat', 2), true); assert.equal(state.ready, true);
    const purchases = calls.filter(call => call.p_action === 'buy');
    assert.equal(purchases.length, 2); assert.equal(purchases[0].p_request_id, purchases[1].p_request_id);
  } finally { state.destroy(); }
});

test('an interrupted earlier request does not discard a queued run finish', async () => {
  let release, block = false;
  const gate = new Promise(resolve => { release = resolve; });
  const api = new EconomyClient(async request => {
    if (request.p_action === 'pet' && block) {
      block = false; await gate; await rpc(A)(request); throw Error('response lost');
    }
    return rpc(A)(request);
  }, uuid);
  const state = new ServerShopState(api);
  try {
    await idle(api); assert.equal(await state.beginRun(), true); await idle(api);
    await db.query("update public.economy_runs set started_at=clock_timestamp()-interval '6 seconds' where user_id=$1", [A]);
    block = true;
    const pet = state.recordPet(), finish = state.completeRun();
    release(); await pet; await finish; await idle(api);
    assert.equal((await load(A)).snapshot.xp, 0);
    await api.retry();
    assert.equal(state.xp, 100); assert.equal(state.dailyQuests[1].progress, 1);
    assert.equal((await load(A)).snapshot.daily.pet, 1);
  } finally { state.destroy(); }
});

test('destroying an account adapter cannot apply its late response to a new account', async () => {
  let release, block = false;
  const gate = new Promise(resolve => { release = resolve; });
  const api = new EconomyClient(async request => {
    const result = await rpc(A)(request);
    if (request.p_action === 'buy' && block) await gate;
    return result;
  }, uuid);
  const first = new ServerShopState(api);
  await idle(api); block = true;
  const pending = first.buy('Hat', 2);
  // Wait for the real DB commit while holding the response back.
  while ((await load(A)).snapshot.coins === 1000) await new Promise(resolve => setTimeout(resolve, 1));
  first.destroy();
  const otherApi = new EconomyClient(rpc(B), uuid), other = new ServerShopState(otherApi);
  try {
    release(); await pending; await idle(otherApi);
    assert.equal(other.coins, 1000); assert.equal(other.owns('Hat', 2), false);
    assert.equal(first.coins, 1000);
  } finally { other.destroy(); }
});

test('server result validation refuses arbitrary balances without replacing the last known wallet', async () => {
  const valid = await load(A);
  for (const broken of [
    { ...valid, snapshot: { ...valid.snapshot, coins: -1 } },
    { ...valid, snapshot: { ...valid.snapshot, xp: 9999 } },
    { ...valid, snapshot: { ...valid.snapshot, items: ['Hat:999'] } },
    { ...valid, snapshot: { ...valid.snapshot, daily: { ...valid.snapshot.daily, pet: 999 } } },
  ]) assert.throws(() => parseEconomyResult(broken), /invalid_economy_response/);
  let bad = false;
  const api = new EconomyClient(async () => bad ? { snapshot: { coins: 9999 } } : valid, uuid);
  const state = new ServerShopState(api);
  try {
    await idle(api); bad = true; await api.execute('load'); await idle(api);
    assert.equal(state.coins, 1000); assert.equal(state.ready, false); assert.equal(api.connection, 'offline');
  } finally { state.destroy(); }
});

test('logged-in quest views keep the server day and poll at most once per 30 seconds', async () => {
  let now = Date.parse('2100-01-01T00:00:00Z'), loads = 0;
  const api = new EconomyClient(async request => { if (request.p_action === 'load') loads++; return rpc(A)(request); }, uuid, () => now);
  const state = new ServerShopState(api);
  try {
    await idle(api); await state.recordPet(); await idle(api);
    for (let i = 0; i < 200; i++) state.dailyQuests;
    assert.equal(loads, 1); assert.equal(state.dailyQuests[0].progress, 1);
    now += 30001;
    for (let i = 0; i < 200; i++) state.dailyQuests;
    await idle(api); assert.equal(loads, 2); assert.equal(state.dailyQuests[0].progress, 1);
  } finally { state.destroy(); }
});

test('missing economy SQL reports setup failure, keeps local prototype coins untouched, and can retry', async () => {
  const { ShopState } = await importTs('../src/shop/ShopState.ts', import.meta.url);
  const values = new Map();
  const guest = new ShopState({ getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) });
  guest.buy('Hat', 2); const saved = [...values];
  let missing = true;
  const api = new EconomyClient(async request => {
    if (missing) throw { code: 'PGRST202' };
    return rpc(A)(request);
  }, uuid);
  const state = new ServerShopState(api);
  try {
    await idle(api); assert.equal(api.connection, 'setup');
    assert.equal(await state.buy('Hat', 2), 'invalid'); assert.deepEqual([...values], saved);
    missing = false; await api.retry();
    assert.equal(state.ready, true); assert.equal(state.coins, 1000);
    assert.equal(guest.coins, 925);
  } finally { state.destroy(); }
});

test('server Shop disables pending purchases, updates owned items and never debits on a double click', async () => {
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Node.js' }, configurable: true });
  const { Texture } = await import('pixi.js');
  const { ShopScene } = await importTs('../src/game/scenes/ShopScene.ts', import.meta.url);
  class Element extends EventTarget {
    children = []; attributes = new Map(); classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    setAttribute(key,value) { this.attributes.set(key,value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    querySelector(selector) { return this.children.find(item => item.className?.split(' ').includes(selector.slice(1))); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document, host = new Element('main');
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host };
  let release; const gate = new Promise(resolve => { release = resolve; });
  const api = new EconomyClient(async request => { await gate; return rpc(A)(request); }, uuid), state = new ServerShopState(api);
  let scene;
  try {
    scene = new ShopScene({ id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: [Texture.WHITE], fps: 3 } } }, state, () => {}, () => {});
    const content = host.children[0].children[4];
    assert.match(host.children[0].children[2].textContent, /—/);
    assert.equal(content.children[2].children[1].getAttribute('data-purchase-state'), 'loading');
    assert.equal(content.children[2].children[1].disabled, true);
    assert.equal(content.children[1].children[0].getAttribute('data-owned'), 'false');
    release(); await idle(api);
    assert.equal(content.children[1].children[0].getAttribute('data-owned'), 'true');
    assert.equal(content.children[2].children[1].getAttribute('data-purchase-state'), 'owned');
    assert.equal(content.children[2].children[0].children[0].textContent, 'Santa Hat');
    content.children[1].scrollTop = 77;
    content.children[1].children[1].dispatchEvent(new Event('click'));
    const buy = content.children[2].children[1]; assert.equal(buy.disabled, false); assert.equal(buy.getAttribute('data-purchase-state'), 'available');
    buy.dispatchEvent(new Event('click'));
    const pendingBuy = content.children[2].children[1]; assert.equal(pendingBuy.disabled, true); assert.equal(pendingBuy.getAttribute('data-purchase-state'), 'processing');
    pendingBuy.dispatchEvent(new Event('click'));
    await idle(api);
    assert.equal(state.coins, 925); assert.equal(state.owns('Hat', 2), true);
    assert.equal(content.children[2].children[1].disabled, true);
    assert.equal(content.children[2].children[1].getAttribute('data-purchase-state'), 'purchased');
    assert.equal(content.children[1].scrollTop, 77);
    assert.match(host.children[0].children[2].textContent, /925/);
  } finally {
    release(); await idle(api); scene?.destroy({ children: true }); state.destroy();
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('Character inventory follows server-owned items and refreshes when a purchase is acknowledged', async () => {
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Node.js' }, configurable: true });
  const { Texture } = await import('pixi.js');
  const { CharacterScene } = await importTs('../src/game/scenes/CharacterScene.ts', import.meta.url);
  class Element extends EventTarget {
    children = []; attributes = new Map(); style = {}; classList = { add() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    setAttribute(key,value) { this.attributes.set(key,value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document, host = new Element('main');
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host };
  const api = new EconomyClient(rpc(A), uuid), state = new ServerShopState(api);
  let scene;
  try {
    await idle(api);
    const outfit = { Hat: 0, Body: 0, Acc: 0, Etc: 0 };
    scene = new CharacterScene({ id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: [Texture.WHITE], fps: 3 } } },
      outfit, () => {}, { owns: (category,index) => state.owns(category,index), subscribe: fn => state.subscribe(fn) });
    const panel = host.children[0], inventory = panel.children[2];
    panel.children[1].children[1].dispatchEvent(new Event('click'));
    assert.equal(inventory.children.some(item => item.getAttribute('data-item') === '2'), false);
    await state.buy('Hat', 2); await idle(api);
    const item = inventory.children.find(item => item.getAttribute('data-item') === '2');
    assert.ok(item); item.dispatchEvent(new Event('click')); assert.equal(outfit.Hat, 2);
    scene.destroy({ children: true }); assert.equal(host.children.length, 0);
  } finally {
    if (scene && !scene.destroyed) scene.destroy({ children: true }); state.destroy();
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('shared auth session changes cannot charge the next account for the old account request', async () => {
  let active = B, sent, calls = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: active }, access_token: 'token-' + active } }, error: null }) },
    rpc() {
      calls++; active = B;
      return {
        setHeader(name,value) { sent = [name,value]; return this; },
        abortSignal() { return Promise.resolve({ data: 'response', error: null }); },
      };
    },
  };
  const send = economyTransport(client, A), request = { p_action: 'load', p_request_id: uuid(), p_payload: {} };
  await assert.rejects(() => send(request, new AbortController().signal), error => error.code === '42501');
  assert.equal(calls, 0);
  active = A; assert.equal(await send(request, new AbortController().signal), 'response');
  assert.deepEqual(sent, ['Authorization', 'Bearer token-' + A]);
  const abort = new AbortController(); abort.abort(); active = A;
  await assert.rejects(() => send(request, abort.signal), error => error.code === '42501');
  assert.equal(calls, 1);
});

test('account SQL enforces owner-only reads and revision conflicts without changing another player', async () => {
  const state = { version: 1, character: { petId: 'myeongrang' }, presets: [], home: { version: 2 } };
  const save = (user, revision, value = state) => as(user,
    'select public.save_player_state($1,$2::jsonb) as revision', [revision, JSON.stringify(value)]);
  assert.equal((await save(A, 0)).rows[0].revision, 1);
  assert.equal((await as(B, 'select * from public.player_saves')).rows.length, 0);
  await assert.rejects(() => save(A, 0), error => error.code === '40001');
  assert.equal((await save(A, 1)).rows[0].revision, 2);
  await assert.rejects(() => save(A, 1), error => error.code === '40001');
  assert.equal((await as(A, 'select snapshot from public.player_saves')).rows[0].snapshot.character.petId, 'myeongrang');
  assert.equal((await as(B, 'update public.player_saves set revision=99 where user_id=$1 returning *', [A])).rows.length, 0);
  await assert.rejects(() => as(B, 'insert into public.player_saves(user_id,snapshot) values($1,$2::jsonb)',
    [A, JSON.stringify(state)]), error => error.code === '42501');
  await assert.rejects(() => as(null, 'select public.save_player_state(0,$1::jsonb)',
    [JSON.stringify(state)], 'anon'), error => error.code === '42501');
});

test('nickname SQL allows one free name, rejects duplicates and prevents direct profile edits', async () => {
  const claim = (user, name) => as(user, 'select public.claim_player_nickname($1) as nickname', [name]);
  assert.equal((await claim(A, '명랑이친구')).rows[0].nickname, '명랑이친구');
  await assert.rejects(() => claim(A, '다른이름'), error => error.code === 'P0001');
  await assert.rejects(() => claim(B, '명랑이친구'), error => error.code === '23505');
  await assert.rejects(() => claim(B, '<script>'), error => error.code === 'P0001');
  assert.equal((await as(B, 'select * from public.player_profiles')).rows.length, 0);
  await assert.rejects(() => as(A, "update public.player_profiles set nickname='Changed'"),
    error => error.code === '42501');
  await assert.rejects(() => as(null, "select public.claim_player_nickname('Anon')", [], 'anon'),
    error => error.code === '42501');
});
