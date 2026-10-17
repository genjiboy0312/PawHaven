import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTs } from './load-typescript.mjs';
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Node.js' }, configurable: true });
const { AccountStorage, normalizeSnapshot } = await importTs('../src/account/AccountStorage.ts', import.meta.url);
const { AccountService } = await importTs('../src/account/AccountService.ts', import.meta.url);
const { CharacterSelection, CHARACTER_STORAGE_KEY } = await importTs('../src/animals/CharacterSelection.ts', import.meta.url);
const { CharacterPresets } = await importTs('../src/animals/CharacterPresets.ts', import.meta.url);
const { HomeState } = await importTs('../src/home/HomeState.ts', import.meta.url);
const disk = () => { const entries = new Map(); return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }; };
const session = id => ({ user: { id, email: id + '@example.com' } });
const look = petId => ({ petId, outfit: { Hat: 1, Body: 0, Acc: 0, Etc: 0 } });
const change = (store, id) => new CharacterSelection(store).save(look(id));
function fakeClient(shared = new Map(), id = 'a') {
  const api = {
    session: id ? session(id) : null, failure: null, calls: [], profiles: new Map(), hold: null,
    auth: {
      getSession: async () => ({ data: { session: api.session } }),
      onAuthStateChange: fn => { api.authChanged = fn; return { data: { subscription: { unsubscribe() { api.unsubscribed = true; } } } }; },
      signInWithOAuth: async input => {
        api.calls.push(['oauth', input]);
        if (api.hold) await api.hold;
        return { data: { provider: 'google', url: 'https://accounts.google.com/' }, error: api.failure };
      },
      signInWithPassword: async input => { api.calls.push(['login', input]); return { data: { session: session('a') }, error: api.failure }; },
      signUp: async input => { api.calls.push(['signup', input]); return { data: { session: null }, error: api.failure }; },
      signOut: async input => { api.calls.push(['logout', input]); return { error: null }; },
    },
    from: table => ({
      select: () => ({ eq: (_key, user) => ({
        maybeSingle: async () => {
          if (api.hold) await api.hold;
          return { data: structuredClone(table === 'player_saves' ? shared.get(user) ?? null : api.profiles.get(user) ?? null), error: api.failure };
        },
      }) }),
    }),
    rpc: async (fn, params) => {
      api.calls.push([fn, params]);
      if (api.hold) await api.hold;
      if (api.failure) return { data: null, error: api.failure };
      if (fn === 'claim_player_nickname') return { data: params.new_nickname, error: null };
      const user = api.session?.user.id ?? 'a', row = shared.get(user);
      if ((row?.revision ?? 0) !== params.expected_revision) return { data: null, error: { code: '40001' } };
      const revision = (row?.revision ?? 0) + 1;
      shared.set(user, { snapshot: structuredClone(params.state), revision });
      return { data: revision, error: null };
    },
  };
  return api;
}

test('account buckets preserve the original guest, isolate accounts, and normalize cosmetics only', () => {
  const persistent = disk(), store = new AccountStorage(persistent);
  change(store, 'myeongrang');
  new CharacterPresets(store).save(2, look('myeongrang'));
  const home = new HomeState(store); home.select('Background', 2); home.place('Furniture', 4);
  const guest = store.snapshot();
  store.owner = 'a'; assert.equal(store.snapshot().character.petId, 'corgi');
  store.apply(guest); change(store, 'myeongrang');
  store.owner = 'b'; assert.equal(store.snapshot().home.items.length, 0);
  store.setItem('pawhaven.shop.prototype.v1', '{"coins":123}');
  store.owner = 'a'; assert.equal(store.getItem('pawhaven.shop.prototype.v1'), null);
  assert.equal(store.snapshot().presets[2].petId, 'myeongrang');
  store.owner = null; assert.deepEqual(store.snapshot(), guest);
  assert.equal(JSON.parse(persistent.getItem(CHARACTER_STORAGE_KEY)).petId, 'myeongrang');
  const dirty = { ...guest, coins: 999999, presets: Array(10).fill(look('myeongrang')),
    home: { ...guest.home, Background: 9999, items: Array(30).fill({ id: 1, tab: 'Furniture', option: 4, x: 100, y: -10 }) } };
  const clean = normalizeSnapshot(dirty);
  assert.equal(clean.coins, undefined); assert.equal(clean.presets.length, 3);
  assert.equal(clean.home.Background, 0); assert.equal(clean.home.items.length, 1);
  assert.deepEqual([clean.home.items[0].x, clean.home.items[0].y], [0.9, 0.62]);
  assert.throws(() => normalizeSnapshot({ version: 99 }), /invalid_save/);
  const blocked = new AccountStorage({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  change(blocked, 'myeongrang'); assert.equal(blocked.snapshot().character.petId, 'myeongrang');
});

test('first cloud connection starts isolated, explicit import copies guest cosmetics, and logout restores guest', async () => {
  const remote = new Map(), client = fakeClient(remote), store = new AccountStorage(disk());
  change(store, 'myeongrang'); const guest = store.snapshot();
  const service = new AccountService(store, client);
  try {
    await service.initialize(); assert.equal(service.user.id, 'a'); assert.equal(service.status, 'saved');
    assert.equal(store.snapshot().character.petId, 'corgi');
    await service.importGuest();
    assert.deepEqual(remote.get('a').snapshot, guest); assert.equal(store.meta.dirty, false);
    await service.claimNickname('명랑이친구'); assert.equal(service.nickname, '명랑이친구');
    await assert.rejects(() => service.claimNickname('<script>'), /invalid_nickname/);
    await service.logout(); assert.equal(service.user, null); assert.equal(store.owner, null);
    assert.deepEqual(store.snapshot(), guest);
    assert.deepEqual(client.calls.find(call => call[0] === 'logout')[1], { scope: 'local' });
  } finally { service.destroy(); }
  assert.equal(client.unsubscribed, true);
});

test('cloud revision conflicts preserve device edits and require explicit remote load', async () => {
  const initial = new AccountStorage().snapshot(), remote = new Map([['a', { snapshot: initial, revision: 1 }]]);
  const left = new AccountService(new AccountStorage(disk()), fakeClient(remote));
  const right = new AccountService(new AccountStorage(disk()), fakeClient(remote));
  try {
    await left.initialize(); await right.initialize();
    change(left.storage, 'myeongrang'); await left.save(); assert.equal(remote.get('a').revision, 2);
    const home = new HomeState(right.storage); home.select('Background', 3);
    const device = right.storage.snapshot();
    await right.save(); assert.equal(right.status, 'conflict');
    assert.deepEqual(right.storage.snapshot(), device); assert.equal(right.storage.meta.dirty, true);
    assert.equal(remote.get('a').snapshot.home.Background, 0);
    await right.load(true); assert.equal(right.status, 'saved');
    assert.equal(right.storage.snapshot().character.petId, 'myeongrang');
    assert.equal(right.storage.snapshot().home.Background, 0);
  } finally { left.destroy(); right.destroy(); }
});

test('offline edits survive restart and cannot overwrite a newer remote revision', async () => {
  const persistent = disk(), remote = new Map([['a', { snapshot: new AccountStorage().snapshot(), revision: 1 }]]);
  const client = fakeClient(remote), first = new AccountService(new AccountStorage(persistent), client);
  await first.initialize(); change(first.storage, 'myeongrang'); client.failure = { code: 'network' };
  await first.save(); assert.equal(first.status, 'offline'); assert.equal(first.storage.meta.dirty, true); first.destroy();
  remote.get('a').revision = 2;
  const second = new AccountService(new AccountStorage(persistent), fakeClient(remote));
  try {
    await second.initialize(); assert.equal(second.status, 'conflict');
    assert.equal(second.storage.snapshot().character.petId, 'myeongrang');
    await second.save(); assert.equal(remote.get('a').revision, 2);
  } finally { second.destroy(); }
});

test('pending local edits are retained and uploaded when the remote revision is unchanged', async () => {
  const persistent = disk(), remote = new Map([['a', { snapshot: new AccountStorage().snapshot(), revision: 1 }]]);
  const store = new AccountStorage(persistent); store.owner = 'a'; store.setMeta({ revision: 1, dirty: false }); change(store, 'myeongrang');
  const service = new AccountService(new AccountStorage(persistent), fakeClient(remote));
  try {
    await service.initialize(); assert.equal(service.storage.snapshot().character.petId, 'myeongrang');
    await service.save(); assert.equal(remote.get('a').snapshot.character.petId, 'myeongrang');
    assert.equal(service.storage.meta.dirty, false);
  } finally { service.destroy(); }
});

test('edits during an upload remain dirty and the next save includes them', async () => {
  const remote = new Map(), client = fakeClient(remote), service = new AccountService(new AccountStorage(disk()), client);
  try {
    await service.initialize(); await service.save();
    let release; client.hold = new Promise(resolve => { release = resolve; });
    change(service.storage, 'myeongrang');
    const pending = service.save();
    new HomeState(service.storage).select('Background', 2);
    release(); await pending; client.hold = null;
    assert.equal(service.storage.meta.dirty, true);
    await service.save();
    assert.equal(remote.get('a').snapshot.home.Background, 2); assert.equal(service.storage.meta.dirty, false);
  } finally { service.destroy(); }
});

test('missing schema and auth errors are surfaced without losing guest data or issuing writes', async () => {
  const store = new AccountStorage(disk()); change(store, 'myeongrang');
  const client = fakeClient(); client.failure = { code: 'PGRST205' };
  const service = new AccountService(store, client);
  try {
    await service.initialize(); assert.equal(service.status, 'setup');
    await service.save(); assert.equal(client.calls.length, 0);
    assert.equal(store.snapshot(null).character.petId, 'myeongrang');
    client.failure = { code: 'invalid_credentials' };
    await assert.rejects(() => service.login('a@example.com', 'wrong'));
    assert.equal(service.user.id, 'a');
  } finally { service.destroy(); }
});

test('signup waits for email confirmation and supplies the exact return URL', async () => {
  const client = fakeClient(new Map(), null), service = new AccountService(new AccountStorage(), client);
  try {
    await service.initialize();
    assert.equal(await service.signup(' a@example.com ', 'long-password', 'https://genjiboy0312.github.io/PawHaven/'), true);
    assert.equal(service.user, null);
    assert.deepEqual(client.calls.at(-1), ['signup', { email: 'a@example.com', password: 'long-password',
      options: { emailRedirectTo: 'https://genjiboy0312.github.io/PawHaven/' } }]);
  } finally { service.destroy(); }
});

test('destroyed account cannot apply an outstanding cloud response', async () => {
  const remote = new Map([['a', { snapshot: new AccountStorage().snapshot(), revision: 1 }]]);
  const client = fakeClient(remote), store = new AccountStorage(disk()), service = new AccountService(store, client);
  await service.initialize(); change(store, 'myeongrang');
  let release; client.hold = new Promise(resolve => { release = resolve; });
  const load = service.load(true); service.destroy(); release(); await load;
  assert.equal(store.snapshot().character.petId, 'myeongrang'); assert.equal(store.meta.dirty, true);
});

test('rebuilding local models during login does not masquerade as user edits or block cloud restore', async () => {
  const cloud = new AccountStorage(); change(cloud, 'myeongrang');
  const remote = new Map([['a', { snapshot: cloud.snapshot(), revision: 3 }]]);
  const service = new AccountService(new AccountStorage(disk()), fakeClient(remote));
  const remove = service.onLoaded(() => {
    new CharacterSelection(service.storage).restore(['corgi', 'myeongrang'], () => true);
  });
  try {
    await service.initialize();
    assert.equal(service.status, 'saved'); assert.equal(service.storage.meta.dirty, false);
    assert.equal(service.storage.snapshot().character.petId, 'myeongrang');
    assert.equal(remote.get('a').revision, 3);
  } finally { remove(); service.destroy(); }
});

test('account panel enables cloud actions after loading, translates, prevents duplicate requests, and cleans subscriptions', async () => {
  const { AccountPanel } = await importTs('../src/ui/AccountPanel.ts', import.meta.url);
  const { setLanguage } = await importTs('../src/settings/i18n.ts', import.meta.url);
  class Element extends EventTarget {
    children = []; attributes = new Map(); classList = { add() {}, remove() {} }; value = ''; disabled = false;
    constructor(tag) { super(); this.tag = tag; }
    append(...items) { this.children.push(...items); }
    replaceChildren() { this.children = []; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    reportValidity() { return this.value.length > 0; }
  }
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag), querySelectorAll: () => [] };
  const remote = new Map(), client = fakeClient(remote), service = new AccountService(new AccountStorage(disk()), client);
  const host = new Element('div'); let panel;
  try {
    await service.initialize(); setLanguage('ko');
    panel = new AccountPanel(host, service);
    const button = key => host.children.find(item => item.attributes.get('data-account-action') === key);
    assert.equal(button('accountSave').disabled, false); assert.equal(button('accountImport').disabled, false);
    service.status = 'loading'; service.setBusy(false);
    assert.equal(button('accountSave').disabled, true);
    service.status = 'saved'; service.setBusy(false);
    assert.equal(button('accountSave').disabled, false);
    service.setBusy(true); assert.equal(button('accountLogout').disabled, true);
    assert.equal(host.children[0].textContent, '처리 중이에요…');
    service.setBusy(false);
    let release; client.hold = new Promise(resolve => { release = resolve; });
    const before = client.calls.length, saveButton = button('accountSave');
    saveButton.dispatchEvent(new Event('click')); saveButton.dispatchEvent(new Event('click'));
    assert.equal(client.calls.length, before + 1); assert.equal(service.busy, true);
    release(); await new Promise(resolve => setImmediate(resolve)); client.hold = null;
    assert.equal(service.busy, false);
    panel.destroy(); panel = undefined;
    const count = host.children.length; service.setBusy(true); assert.equal(host.children.length, count);
  } finally {
    panel?.destroy(); service.destroy(); setLanguage('en');
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test('Google OAuth uses the game path, clears callback fragments and query, and preserves guest data', async () => {
  const client = fakeClient(new Map(), null), store = new AccountStorage(disk());
  change(store, 'myeongrang'); const guest = store.snapshot();
  const service = new AccountService(store, client);
  try {
    await service.initialize();
    for (const base of ['https://genjiboy0312.github.io/PawHaven/', 'http://localhost:5173/']) {
      await service.loginGoogle(base + '?old=query#access_token=stale');
      assert.deepEqual(client.calls.at(-1), ['oauth', {
        provider: 'google', options: { redirectTo: base, queryParams: { prompt: 'select_account' } },
      }]);
    }
    assert.equal(service.user, null); assert.equal(store.owner, null);
    assert.deepEqual(store.snapshot(), guest);
    client.failure = { code: 'provider_disabled' };
    await assert.rejects(() => service.loginGoogle('https://genjiboy0312.github.io/PawHaven/'),
      error => error.code === 'provider_disabled');
    assert.deepEqual(store.snapshot(), guest);
  } finally { service.destroy(); }
  const unavailable = new AccountService(new AccountStorage(disk()));
  try { await assert.rejects(() => unavailable.loginGoogle('https://example.com/'), /account_unavailable/); }
  finally { unavailable.destroy(); }
});

test('Google account panel accepts empty email fields, blocks duplicate clicks and shows errors safely', async () => {
  const { AccountPanel } = await importTs('../src/ui/AccountPanel.ts', import.meta.url);
  const { setLanguage } = await importTs('../src/settings/i18n.ts', import.meta.url);
  class Element extends EventTarget {
    children = []; attributes = new Map(); classList = { add() {}, remove() {} }; value = '';
    append(...items) { this.children.push(...items); }
    replaceChildren() { this.children = []; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    reportValidity() { throw Error('Google must not validate email or password'); }
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  globalThis.document = { createElement: () => new Element(), querySelectorAll: () => [] };
  globalThis.window = { location: { href: 'https://genjiboy0312.github.io/PawHaven/' } };
  const client = fakeClient(new Map(), null), service = new AccountService(new AccountStorage(disk()), client);
  let panel;
  try {
    await service.initialize(); setLanguage('ko');
    const host = new Element(); panel = new AccountPanel(host, service);
    const google = host.children.find(item => item.getAttribute('data-account-action') === 'accountGoogle');
    assert.equal(google.textContent, 'Google로 로그인');
    let release; client.hold = new Promise(resolve => { release = resolve; });
    client.failure = { message: 'private OAuth diagnostic must not be displayed' };
    google.dispatchEvent(new Event('click')); google.dispatchEvent(new Event('click'));
    assert.equal(client.calls.length, 1); assert.equal(google.disabled, true);
    release(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(service.busy, false); assert.equal(google.disabled, false);
    assert.ok(host.children[1].textContent.length > 0);
    assert.ok(!host.children[1].textContent.includes('private OAuth'));
  } finally {
    panel?.destroy(); service.destroy(); setLanguage('en');
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});
