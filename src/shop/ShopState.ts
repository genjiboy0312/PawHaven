import { OUTFIT_TABS, type OutfitTab } from '../animals/OutfitState';
export const SHOP_STORAGE_KEY = 'pawhaven.shop.prototype.v1';
export const PASS_TIERS = 5;
export const itemPrice = (index: number): number => 75 + Math.floor((index - 1) / 5) * 25;
const itemKey = (category: OutfitTab, index: number): string => category + ':' + index;
const validItem = (value: string): boolean => OUTFIT_TABS.some(tab => Array.from({ length: 20 }, (_, i) => itemKey(tab, i + 1)).includes(value));
export class ShopState {
  private balance = 1000;
  private experience = 0;
  private premium = false;
  private items = new Set<string>(OUTFIT_TABS.map(tab => itemKey(tab, 1)));
  private claimed = new Set<string>();
  private readonly listeners = new Set<() => void>();
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const saved = JSON.parse(storage?.getItem(SHOP_STORAGE_KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        if (Number.isSafeInteger(saved.coins) && saved.coins >= 0 && saved.coins <= 1000000) this.balance = saved.coins;
        if (Number.isSafeInteger(saved.xp) && saved.xp >= 0 && saved.xp <= 400) this.experience = saved.xp;
        if (typeof saved.premium === 'boolean') this.premium = saved.premium;
        if (Array.isArray(saved.items)) saved.items.filter((id: unknown): id is string => typeof id === 'string' && validItem(id)).forEach((id: string) => this.items.add(id));
        if (Array.isArray(saved.claimed)) saved.claimed.filter((id: unknown): id is string => typeof id === 'string' && /^(free|premium)-[1-5]$/.test(id)).forEach((id: string) => this.claimed.add(id));
      }
    } catch { /* This is local prototype data; defaults work without storage. */ }
  }
  get coins(): number { return this.balance; }
  get xp(): number { return this.experience; }
  get level(): number { return Math.min(PASS_TIERS, 1 + Math.floor(this.experience / 100)); }
  get hasPass(): boolean { return this.premium; }
  owns(category: OutfitTab, index: number): boolean { return index === 0 || this.items.has(itemKey(category, index)); }
  buy(category: OutfitTab, index: number): 'purchased' | 'owned' | 'insufficient' | 'invalid' {
    if (!OUTFIT_TABS.includes(category) || !Number.isInteger(index) || index < 1 || index > 20) return 'invalid';
    if (this.owns(category, index)) return 'owned';
    const price = itemPrice(index);
    if (price > this.balance) return 'insufficient';
    this.balance -= price; this.items.add(itemKey(category, index)); this.save(); return 'purchased';
  }
  unlockPass(): void { if (!this.premium) { this.premium = true; this.save(); } }
  completeRun(): void { if (this.experience < 400) { this.experience = Math.min(400, this.experience + 100); this.save(); } }
  reward(tier: number, premium: boolean): number { return tier * (premium ? 40 : 20); }
  isClaimed(tier: number, premium: boolean): boolean { return this.claimed.has((premium ? 'premium-' : 'free-') + tier); }
  canClaim(tier: number, premium: boolean): boolean {
    return Number.isInteger(tier) && tier >= 1 && tier <= PASS_TIERS && tier <= this.level && (!premium || this.premium) && !this.isClaimed(tier, premium);
  }
  claim(tier: number, premium: boolean): boolean {
    if (!this.canClaim(tier, premium)) return false;
    this.claimed.add((premium ? 'premium-' : 'free-') + tier); this.balance += this.reward(tier, premium); this.save(); return true;
  }
  subscribe(callback: () => void): () => void { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; }
  private save(): void {
    try { this.storage?.setItem(SHOP_STORAGE_KEY, JSON.stringify({ coins: this.balance, xp: this.experience, premium: this.premium, items: [...this.items], claimed: [...this.claimed] })); } catch { /* Keep the in-memory prototype session. */ }
    this.listeners.forEach(callback => callback());
  }
}