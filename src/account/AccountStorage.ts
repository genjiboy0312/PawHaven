import { CharacterSelection, CHARACTER_STORAGE_KEY } from '../animals/CharacterSelection';
import { CharacterPresets, PRESET_STORAGE_KEY, type CharacterPreset } from '../animals/CharacterPresets';
import { HomeState, HOME_STORAGE_KEY } from '../home/HomeState';

const KEYS = [CHARACTER_STORAGE_KEY, PRESET_STORAGE_KEY, HOME_STORAGE_KEY] as const;
export interface PlayerSnapshot {
  version: 1;
  character: CharacterPreset;
  presets: ReturnType<CharacterPresets['load']>[];
  home: { version: 2; Background: number; Floor: number; items: HomeState['items'] };
}
type Disk = Pick<Storage, 'getItem' | 'setItem'>;
type Meta = { revision: number; dirty: boolean };
/** Guest keys stay unchanged; signed-in accounts never share a local save bucket. */
export class AccountStorage {
  owner: string | null = null;
  private memory = new Map<string, string>();
  private listeners = new Set<() => void>();
  private hydrating = false;
  hydrate(action: () => void): void { this.hydrating = true; try { action(); } finally { this.hydrating = false; } }
  constructor(private readonly disk?: Disk) {}
  private key(key: string, owner = this.owner): string { return owner ? 'pawhaven.account.' + owner + '.' + key : key; }
  private read(key: string): string | null {
    if (this.memory.has(key)) return this.memory.get(key)!;
    try { return this.disk?.getItem(key) ?? null; } catch { return null; }
  }
  private write(key: string, value: string): void {
    this.memory.set(key, value);
    try { this.disk?.setItem(key, value); } catch { /* Keep this session's data. */ }
  }
  getItem(key: string): string | null { return this.read(this.key(key)); }
  setItem(key: string, value: string): void {
    if (this.getItem(key) === value) return;
    this.write(this.key(key), value);
    if (!this.hydrating && this.owner && KEYS.includes(key as typeof KEYS[number])) {
      this.setMeta({ ...this.meta, dirty: true });
      this.listeners.forEach(listener => listener());
    }
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  get meta(): Meta {
    try {
      const value = JSON.parse(this.getItem('sync') ?? 'null');
      if (Number.isSafeInteger(value?.revision) && value.revision >= 0) return { revision: value.revision, dirty: value.dirty === true };
    } catch { /* Default to an unsynced account. */ }
    return { revision: 0, dirty: false };
  }
  setMeta(value: Meta): void { this.write(this.key('sync'), JSON.stringify(value)); }

  snapshot(owner = this.owner): PlayerSnapshot {
    const source = { getItem: (key: string) => this.read(this.key(key, owner)), setItem() {} };
    const home = new HomeState(source), presets = new CharacterPresets(source);
    return { version: 1, character: new CharacterSelection(source).current,
      presets: [0, 1, 2].map(index => presets.load(index)), home: { version: 2, ...home.current, items: home.items } };
  }
  apply(snapshot: PlayerSnapshot): void {
    this.write(this.key(CHARACTER_STORAGE_KEY), JSON.stringify(snapshot.character));
    this.write(this.key(PRESET_STORAGE_KEY), JSON.stringify(snapshot.presets));
    this.write(this.key(HOME_STORAGE_KEY), JSON.stringify(snapshot.home));
  }
}
/** Run remote data through the same bounded validators as local saves. */
export function normalizeSnapshot(input: unknown): PlayerSnapshot {
  const value = input as Partial<PlayerSnapshot> | null;
  if (!value || value.version !== 1 || !value.character || !Array.isArray(value.presets) || !value.home) throw Error('invalid_save');
  const values = new Map<string, string>([
    [CHARACTER_STORAGE_KEY, JSON.stringify(value.character)],
    [PRESET_STORAGE_KEY, JSON.stringify(value.presets)], [HOME_STORAGE_KEY, JSON.stringify(value.home)],
  ]);
  return new AccountStorage({ getItem: key => values.get(key) ?? null, setItem() {} }).snapshot();
}
