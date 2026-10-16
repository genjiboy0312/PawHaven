import { OUTFIT_TABS, type OutfitState } from './OutfitState';
export interface CharacterPreset { petId: string; outfit: OutfitState }
export const PRESET_STORAGE_KEY = 'pawhaven.presets.v1';
function valid(value: unknown): value is CharacterPreset {
  if (!value || typeof value !== 'object') return false;
  const item = value as CharacterPreset;
  return typeof item.petId === 'string' && /^[a-z0-9_-]{1,64}$/.test(item.petId) && !!item.outfit &&
    OUTFIT_TABS.every(key => Number.isInteger(item.outfit[key]) && item.outfit[key] >= 0 && item.outfit[key] <= 20);
}
const copy = (value: CharacterPreset): CharacterPreset => ({ petId: value.petId, outfit: { ...value.outfit } });
/** Three global slots. Editing the character never overwrites a saved slot. */
export class CharacterPresets {
  selectedSlot = 0;
  private slots: (CharacterPreset | null)[] = [null, null, null];
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const saved: unknown = JSON.parse(storage?.getItem(PRESET_STORAGE_KEY) ?? 'null');
      if (Array.isArray(saved)) this.slots = [0, 1, 2].map(index => valid(saved[index]) ? copy(saved[index]) : null);
    } catch { /* A blocked or old store must not stop the character screen. */ }
  }
  load(slot: number): CharacterPreset | null {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) return null;
    const value = this.slots[slot]; return value ? copy(value) : null;
  }
  save(slot: number, value: CharacterPreset): boolean {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2 || !valid(value)) return false;
    this.slots[slot] = copy(value);
    try { this.storage?.setItem(PRESET_STORAGE_KEY, JSON.stringify(this.slots)); } catch { /* Session saves remain usable. */ }
    return true;
  }
}