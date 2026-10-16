import { OUTFIT_TABS, type OutfitTab } from '../animals/OutfitState';
export const SHOP_STORAGE_KEY = 'pawhaven.shop.prototype.v1';
export const PASS_TIERS = 5;
export const DAILY_QUESTS = [
  { id: 'pet', title: 'dailyPet', target: 3, reward: 50 },
  { id: 'run', title: 'dailyRun', target: 1, reward: 100 },
] as const;
export type DailyQuestId = typeof DAILY_QUESTS[number]['id'];
interface DailyState { day: string; pet: number; run: number; claimed: DailyQuestId[]; lastPet: number | null }
function localDay(time: number): string {
  const date = new Date(time);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
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
  private daily: DailyState;
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>, private readonly now: () => number = Date.now) {
    this.daily = this.freshDay();
    try {
      const saved = JSON.parse(storage?.getItem(SHOP_STORAGE_KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        if (Number.isSafeInteger(saved.coins) && saved.coins >= 0 && saved.coins <= 1000000) this.balance = saved.coins;
        if (Number.isSafeInteger(saved.xp) && saved.xp >= 0 && saved.xp <= 400) this.experience = saved.xp;
        if (typeof saved.premium === 'boolean') this.premium = saved.premium;
        const day = saved.daily;
        if (day && typeof day.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.day) &&
            localDay(new Date(day.day + 'T00:00:00').getTime()) === day.day) {
          this.daily.day = day.day;
          for (const quest of DAILY_QUESTS) {
            const count = day[quest.id];
            if (Number.isInteger(count) && count >= 0) this.daily[quest.id] = Math.min(quest.target, count);
          }
          this.daily.claimed = DAILY_QUESTS.filter(quest => this.daily[quest.id] === quest.target &&
            Array.isArray(day.claimed) && day.claimed.includes(quest.id)).map(quest => quest.id);
          if (typeof day.lastPet === 'number' && Number.isFinite(day.lastPet) && day.lastPet >= 0) this.daily.lastPet = day.lastPet;
        }
        if (Array.isArray(saved.items)) saved.items.filter((id: unknown): id is string => typeof id === 'string' && validItem(id)).forEach((id: string) => this.items.add(id));
        if (Array.isArray(saved.claimed)) saved.claimed.filter((id: unknown): id is string => typeof id === 'string' && /^(free|premium)-[1-5]$/.test(id)).forEach((id: string) => this.claimed.add(id));
      }
    } catch { /* This is local prototype data; defaults work without storage. */ }
  }
  private freshDay(): DailyState { return { day: localDay(this.now()), pet: 0, run: 0, claimed: [], lastPet: null }; }
  private rollDay(): boolean {
    const today = localDay(this.now());
    // Do not reopen an already claimed day when the device clock moves backwards.
    if (today <= this.daily.day) return false;
    this.daily = this.freshDay(); return true;
  }
  refreshDaily(): void { if (this.rollDay()) this.save(); }
  get dailyQuests() {
    if (this.rollDay()) this.save(false);
    return DAILY_QUESTS.map(quest => ({ ...quest, progress: this.daily[quest.id],
      claimed: this.daily.claimed.includes(quest.id),
      canClaim: this.daily[quest.id] >= quest.target && !this.daily.claimed.includes(quest.id) }));
  }
  recordPet(): boolean {
    const rolled = this.rollDay(), now = this.now();
    if (!Number.isFinite(now) || this.daily.pet >= 3 || (this.daily.lastPet !== null && now - this.daily.lastPet < 10000)) {
      if (rolled) this.save(); return false;
    }
    this.daily.pet++; this.daily.lastPet = now; this.save(); return true;
  }
  claimDaily(id: DailyQuestId): boolean {
    const rolled = this.rollDay(), quest = DAILY_QUESTS.find(quest => quest.id === id);
    if (!quest || this.daily[id] < quest.target || this.daily.claimed.includes(id)) {
      if (rolled) this.save(); return false;
    }
    // Claim flag and coins are persisted in one storage record.
    this.daily.claimed.push(id); this.balance += quest.reward; this.save(); return true;
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
  completeRun(): void {
    const rolled = this.rollDay(), before = this.experience, progress = this.daily.run;
    this.experience = Math.min(400, this.experience + 100); this.daily.run = 1;
    if (rolled || before !== this.experience || progress !== 1) this.save();
  }
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
  private save(notify = true): void {
    try { this.storage?.setItem(SHOP_STORAGE_KEY, JSON.stringify({ coins: this.balance, xp: this.experience, premium: this.premium, items: [...this.items], claimed: [...this.claimed], daily: this.daily })); } catch { /* Keep the in-memory prototype session. */ }
    if (notify) this.listeners.forEach(callback => callback());
  }
}