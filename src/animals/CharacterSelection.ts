import { isCharacterPreset, type CharacterPreset } from './CharacterPresets';
import { createOutfit, OUTFIT_TABS, type OutfitTab } from './OutfitState';
export const CHARACTER_STORAGE_KEY = 'pawhaven.character.v1';
const copy = (value: CharacterPreset): CharacterPreset => ({ petId: value.petId, outfit: { ...value.outfit } });
/** Last applied look is separate from the three explicitly saved presets. */
export class CharacterSelection {
  private value: CharacterPreset = { petId: 'corgi', outfit: createOutfit() };
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const saved: unknown = JSON.parse(storage?.getItem(CHARACTER_STORAGE_KEY) ?? 'null');
      if (isCharacterPreset(saved)) this.value = copy(saved);
    } catch { /* Keep defaults when storage is corrupt or blocked. */ }
  }
  get current(): CharacterPreset { return copy(this.value); }
  save(value: CharacterPreset): boolean {
    if (!isCharacterPreset(value)) return false;
    this.value = copy(value);
    try { this.storage?.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(this.value)); } catch { /* Session state remains usable. */ }
    return true;
  }
  restore(available: readonly string[], owns: (category: OutfitTab, index: number) => boolean): CharacterPreset {
    const look = this.current;
    if (!available.includes(look.petId)) look.petId = available[0] ?? 'corgi';
    for (const key of OUTFIT_TABS) if (!owns(key, look.outfit[key])) look.outfit[key] = 0;
    this.save(look);
    return this.current;
  }
}
