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
  for (const homeItems of [{ 'Furniture:5': 21 }, { 'Furniture:1': 1 }, { 'Etc:8': 3 }, { 'Furniture:05': 1 }, []]) {
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
    all() { return this.children.flatMap(item => [item, ...item.all()]); }
    querySelector(selector) { return this.all().find(item => item.className?.split(' ').includes(selector.slice(1))); }
    querySelectorAll() { return this.all().filter(item => item.tag === 'button' && !item.disabled); }
    focus() { document.activeElement = this; }
    get isConnected() { return this.tag === 'main' || !!this.parent?.isConnected; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
  }
  const oldDocument = globalThis.document, oldHTMLElement = globalThis.HTMLElement, host = new Element('main');
  globalThis.HTMLElement = Element;
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host };
  const api = new EconomyClient(rpc(A), uuid), state = new ServerShopState(api);
  const values = new Map(), home = new HomeState({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, (tab, index) => state.homeOwned(tab, index));
  let shop, editor, lobby;
  const sofa = new Texture({ source: new TextureSource({ width: 1042, height: 407 }) });
  const textures = { background: Texture.WHITE, floor: Texture.WHITE, cushion: Texture.WHITE, sofa };
  try {
    await idle(api);
    editor = new HomeScene(home, () => {}, textures);
    host.children[0].children[3].children[2].dispatchEvent(new Event('click'));
    assert.equal(host.children[0].children[4].children.length, 4);
    assert.equal(host.children[0].children[4].children.some(item => item.getAttribute('aria-label')?.includes('Black & White Pet Sofa')), false);
    editor.destroy({ children: true });
    shop = new ShopScene({ id: 'corgi', speed: 90, scale: 0.62, animations: { idle: { frames: [Texture.WHITE], fps: 3 } } }, state, () => {}, () => {});
    const panel = host.children[0];
    assert.deepEqual(panel.children[3].children.map(tab => tab.textContent), ['Style', 'Furniture', 'Pass']);
    panel.children[3].children[1].dispatchEvent(new Event('click'));
    const content = panel.children[4]; assert.equal(content.children[1].children.length, 5);
    assert.equal(content.children[1].children[4].children[0].children[0].src, './assets/home/pet-sofa-black-white.png');
    const buy = content.children[2].children[1]; buy.dispatchEvent(new Event('click')); buy.dispatchEvent(new Event('click'));
    assert.equal(state.coins, 1000); assert.equal(host.children.length, 2); assert.equal(panel.inert, true);
    assert.match(host.querySelector('.purchase-after').textContent, /750/);
    host.querySelector('.purchase-cancel').dispatchEvent(new Event('click'));
    assert.equal(state.coins, 1000); assert.equal(state.homeOwned('Furniture', 5), 0); assert.equal(panel.inert, undefined);
    buy.dispatchEvent(new Event('click'));
    const confirm = host.querySelector('.purchase-confirm'); confirm.dispatchEvent(new Event('click')); confirm.dispatchEvent(new Event('click'));
    await new Promise(resolve => setImmediate(resolve)); await idle(api); assert.equal(state.coins, 750); assert.equal(state.homeOwned('Furniture', 5), 1);
    assert.equal(host.children.length, 1);
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
    editor = new HomeScene(home, () => {}, textures);
    host.children[0].children[3].children[2].dispatchEvent(new Event('click'));
    assert.equal(host.children[0].children[4].children.length, 5);
    assert.equal(host.children[0].children[4].children[4].disabled, true);
    assert.equal(host.children[0].children[4].children[4].children[1].textContent, '0');
    editor.destroy({ children: true });
    lobby = new LobbyMap(textures); lobby.draw(960, 540, home.current, home.items);
    assert.equal(lobby.objects.children[0].x, 720); assert.equal(lobby.objects.children[0].children[1].texture, sofa);
    home.remove(home.items[0].id); assert.equal(home.remaining('Furniture', 5), 1); assert.equal(state.homeOwned('Furniture', 5), 1);
    const original = await readFile(new URL('../Resources/Pet_Sofa_Black_White_Prototype.png', import.meta.url));
    assert.deepEqual(await readFile(new URL('../public/assets/home/pet-sofa-black-white.png', import.meta.url)), original);
    assert.deepEqual(await readFile(new URL('../public/assets/items/gold-coin.png', import.meta.url)), await readFile(new URL('../Resources/Gold_Coin_Prototype.png', import.meta.url)));
  } finally {
    if (shop && !shop.destroyed) shop.destroy({ children: true }); if (editor && !editor.destroyed) editor.destroy({ children: true });
    lobby?.destroy({ children: true }); sofa.destroy(true); state.destroy();
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = oldHTMLElement;
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

function purchaseDom() {
  class Element extends EventTarget {
    children = []; className = ''; attributes = new Map(); inert = false; style = {};
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    all() { return this.children.flatMap(item => [item, ...item.all()]); }
    querySelector(selector) { return this.all().find(item => item.className.split(' ').includes(selector.slice(1))); }
    querySelectorAll() { return this.all().filter(item => item.tag === 'button' && !item.disabled); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); this.parent = undefined; }
    focus() { document.activeElement = this; }
    get isConnected() { return this.tag === 'main' || !!this.parent?.isConnected; }
  }
  const oldDocument = globalThis.document, oldHTMLElement = globalThis.HTMLElement;
  const host = new Element('main'), shop = new Element('section'), opener = new Element('button'); shop.append(opener); host.append(shop);
  globalThis.HTMLElement = Element;
  globalThis.document = { createElement: tag => new Element(tag), querySelector: () => host, querySelectorAll: () => [], activeElement: opener };
  return { host, shop, opener, restore() {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = oldHTMLElement;
  } };
}

test('purchase confirmation cancels safely, tracks live balance and language, and removes its input lock and subscriptions', async () => {
  const { PurchasePopup } = await importTs('../src/ui/PurchasePopup.ts', import.meta.url);
  const { ShopState } = await importTs('../src/shop/ShopState.ts', import.meta.url);
  const { setLanguage } = await importTs('../src/settings/i18n.ts', import.meta.url);
  const env = purchaseDom(), state = new ShopState(), popup = new PurchasePopup(state, env.shop);
  let bought = 0;
  const item = { name: () => 'Sofa', icon: () => document.createElement('img'), price: 250,
    available: () => state.homeOwned('Furniture', 5) < 20, fulfilled: () => state.homeOwned('Furniture', 5) > 0,
    buy: () => { bought++; return state.buyHome('Furniture', 5); }, purchased() {} };
  try {
    popup.open(item); assert.equal(state.coins, 1000); assert.equal(env.shop.inert, true);
    const cancel = env.host.querySelector('.purchase-cancel'); assert.equal(document.activeElement, cancel);
    const escape = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
    env.host.querySelector('.purchase-panel').dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true); assert.equal(env.host.children.length, 1); assert.equal(env.shop.inert, false); assert.equal(document.activeElement, env.opener);
    popup.open(item); state.buyHome('Etc', 1); assert.match(env.host.querySelector('.purchase-after').textContent, /625/);
    setLanguage('ko'); assert.equal(env.host.querySelector('.purchase-confirm').textContent, '구매');
    assert.match(env.host.querySelector('.purchase-after').textContent, /구매 후 잔액/);
    for (let i = 0; i < 3; i++) state.buyHome('Furniture', 5);
    const confirm = env.host.querySelector('.purchase-confirm'); assert.equal(confirm.disabled, true);
    confirm.dispatchEvent(new Event('click')); await new Promise(resolve => setImmediate(resolve)); assert.equal(bought, 0); assert.equal(state.coins, 125);
    popup.destroy(); assert.equal(env.shop.inert, false); assert.equal(env.host.children.length, 1);
    state.completeRun(); assert.equal(env.host.children.length, 1);
    const original = await readFile(new URL('../Resources/PawHaven_Myeongrang_Icon.png', import.meta.url));
    assert.deepEqual(await readFile(new URL('../public/assets/icons/myeongrang.png', import.meta.url)), original);
    assert.equal(original.readUInt32BE(16), original.readUInt32BE(20));
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8'); assert.match(html, /rel="icon"[^>]*myeongrang/); assert.match(html, /rel="apple-touch-icon"[^>]*myeongrang/);
    const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
    assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
    for (const size of [192, 512]) {
      const packaged = await readFile(new URL(`../public/assets/icons/myeongrang-${size}.png`, import.meta.url));
      assert.deepEqual(packaged, await readFile(new URL(`../Resources/PawHaven_Myeongrang_Icon_${size}.png`, import.meta.url)));
      assert.equal(packaged.readUInt32BE(16), size); assert.equal(packaged.readUInt32BE(20), size);
    }
  } finally { popup.destroy(); setLanguage('en'); state.destroy(); env.restore(); }
});

test('purchase confirmation reconciles a lost server response once and ignores confirmation destroyed before dispatch', async () => {
  const { PurchasePopup } = await importTs('../src/ui/PurchasePopup.ts', import.meta.url);
  const env = purchaseDom(), requests = []; let lose = true, purchased = 0;
  const api = new EconomyClient(async request => {
    const result = await rpc(A)(request);
    if (request.p_action === 'buy_home') { requests.push(request); if (lose) { lose = false; throw Error('lost response'); } }
    return result;
  }, uuid), state = new ServerShopState(api), popup = new PurchasePopup(state, env.shop);
  const item = initial => ({ name: () => 'Sofa', icon: () => document.createElement('img'), price: 250,
    available: () => state.homeShopReady && state.homeOwned('Furniture', 5) < 20,
    fulfilled: () => state.homeOwned('Furniture', 5) > initial, buy: () => state.buyHome('Furniture', 5), purchased: () => { purchased++; } });
  try {
    await idle(api); popup.open(item(0));
    const confirm = env.host.querySelector('.purchase-confirm'); confirm.dispatchEvent(new Event('click')); confirm.dispatchEvent(new Event('click'));
    assert.equal(confirm.disabled, true);
    await new Promise(resolve => setImmediate(resolve)); await idle(api); await new Promise(resolve => setImmediate(resolve));
    assert.equal(api.connection, 'offline'); assert.equal(purchased, 0); assert.equal(state.coins, 1000); assert.equal(env.host.querySelector('.purchase-confirm').disabled, true);
    await api.retry(); await idle(api); assert.equal(state.coins, 750); assert.equal(state.homeOwned('Furniture', 5), 1);
    assert.equal(purchased, 1); assert.equal(env.host.children.length, 1); assert.equal(env.shop.inert, false);
    assert.equal(requests.length, 2); assert.equal(requests[0].p_request_id, requests[1].p_request_id);
    popup.open(item(1)); env.host.querySelector('.purchase-confirm').dispatchEvent(new Event('click')); popup.destroy();
    await new Promise(resolve => setImmediate(resolve)); await idle(api); assert.equal(requests.length, 2); assert.equal(state.homeOwned('Furniture', 5), 1);
  } finally { popup.destroy(); await idle(api); state.destroy(); env.restore(); }
});

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

test('Shop try-on never equips on selection, cancellation or purchase; explicit Equip saves once without another charge',async()=>{
  Object.defineProperty(globalThis,'navigator',{value:{userAgent:'Node.js'},configurable:true});
  const {Texture}=await import('pixi.js');const {ShopScene}=await importTs('../src/game/scenes/ShopScene.ts',import.meta.url);
  const {ShopState}=await importTs('../src/shop/ShopState.ts',import.meta.url);const {CharacterSelection}=await importTs('../src/animals/CharacterSelection.ts',import.meta.url);
  class Element extends EventTarget{
    children=[];style={};attributes=new Map();classList={add(){}};
    append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
    replaceChildren(...items){this.children=[];this.append(...items);}
    setAttribute(k,v){this.attributes.set(k,v);}getAttribute(k){return this.attributes.get(k)??null;}
    querySelector(s){return this.children.find(c=>c.className?.split(' ').includes(s.slice(1)))??this.children.map(c=>c.querySelector(s)).find(Boolean);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
    focus(){}get isConnected(){return !!this.parent;}
  }
  const previous=globalThis.document,host=new Element();globalThis.document={createElement:()=>new Element(),querySelector:()=>host};
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},selection=new CharacterSelection(storage);
  const state=new ShopState();state.items.clear();const outfit={Hat:0,Body:0,Acc:0,Etc:0};let saves=0,scene;
  const config={id:'myeongrang',speed:90,scale:.62,wardrobe:{santaHat:Texture.WHITE,topHat:Texture.WHITE,bowTie:Texture.WHITE,outfit},animations:{idle:{frames:[Texture.WHITE],fps:3,head:[{x:0,y:-1,width:1}],neck:[{x:0,y:-.3,width:.5}]}}};
  const click=e=>e.dispatchEvent(new Event('click'));
  try{
    scene=new ShopScene(config,state,()=>{},()=>{},'Style',(category,index)=>{outfit[category]=index;selection.save({petId:config.id,outfit});saves++;});
    const panel=host.children[0],content=panel.children[4],action=()=>content.children[2].children[1];
    assert.equal(scene.animation.hat.visible,true);assert.equal(outfit.Hat,0);assert.equal(state.owns('Hat',1),false);assert.equal(state.coins,1000);assert.equal(saves,0);
    click(content.children[0].children[1]);assert.equal(scene.animation.hat.visible,false);assert.equal(outfit.Hat,0);
    click(content.children[0].children[0]);assert.equal(scene.animation.hat.visible,true);
    click(action());click(host.querySelector('.purchase-cancel'));assert.equal(state.coins,1000);assert.equal(outfit.Hat,0);
    click(action());click(host.querySelector('.purchase-confirm'));await new Promise(r=>setImmediate(r));
    assert.equal(state.owns('Hat',1),true);assert.equal(state.coins,925);assert.equal(outfit.Hat,0);assert.equal(saves,0);assert.equal(action().textContent,'Equip');assert.equal(content.children[2].children[0].children[1].textContent,'Owned');
    click(panel.children[3].children[1]);assert.equal(scene.previewOutfit.Hat,0);click(panel.children[3].children[0]);
    const equip=action();click(equip);click(equip);assert.equal(outfit.Hat,1);assert.equal(saves,1);assert.equal(state.coins,925);assert.equal(action().textContent,'Equipped');assert.equal(action().disabled,true);
    assert.equal(new CharacterSelection(storage).current.outfit.Hat,1);
    click(content.children[1].children[1]);assert.equal(scene.animation.hat.label,'topHat');assert.equal(outfit.Hat,1);
    click(action());click(host.querySelector('.purchase-confirm'));await new Promise(r=>setImmediate(r));assert.equal(outfit.Hat,1);click(action());assert.equal(outfit.Hat,2);
    click(content.children[0].children[2]);click(content.children[1].children[1]);assert.equal(scene.animation.accessory.visible,true);assert.equal(outfit.Acc,0);
    click(action());click(host.querySelector('.purchase-confirm'));await new Promise(r=>setImmediate(r));assert.equal(outfit.Acc,0);click(action());assert.equal(outfit.Acc,2);assert.equal(outfit.Hat,2);assert.equal(state.coins,775);assert.equal(saves,3);
    assert.deepEqual(new CharacterSelection(storage).current.outfit,outfit);
    scene.destroy({children:true});scene=undefined;assert.equal(config.wardrobe.santaHat.destroyed,false);
  }finally{scene?.destroy({children:true});if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('server Shop blocks unfinished listings and preserves existing ownership without sending a purchase', async () => {
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
    assert.ok(host.children[0].children[2].className.split(' ').includes('coin-amount'));
    assert.equal(content.children[2].children[1].getAttribute('data-purchase-state'), 'loading');
    assert.equal(content.children[2].children[1].disabled, true);
    assert.equal(content.children[1].children[0].getAttribute('data-owned'), 'false');
    release(); await idle(api);
    assert.equal(content.children[1].children[0].getAttribute('data-owned'), 'true');
    assert.equal(content.children[2].children[1].getAttribute('data-purchase-state'), 'owned');
    assert.equal(content.children[2].children[0].children[0].textContent, 'Santa Hat');
    content.children[1].scrollTop = 77;
    content.children[1].children[2].dispatchEvent(new Event('click'));
    const buy = content.children[2].children[1]; assert.equal(buy.disabled, true); assert.equal(buy.getAttribute('data-purchase-state'), 'comingSoon');
    buy.dispatchEvent(new Event('click'));
    await idle(api);
    assert.equal(state.coins, 1000); assert.equal(state.owns('Hat', 3), false);
    assert.equal((await db.query("select count(*) as n from public.economy_requests where command='buy'")).rows[0].n, 0);
    await command(A, 'buy', { category: 'Hat', index: 3 }); // Pre-existing entitlement loaded from another session.
    await api.execute('load'); await idle(api);
    assert.equal(state.coins, 925); assert.equal(state.owns('Hat', 3), true);
    assert.equal(content.children[2].children[1].disabled, true);
    assert.equal(content.children[2].children[1].getAttribute('data-purchase-state'), 'comingSoon');
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
