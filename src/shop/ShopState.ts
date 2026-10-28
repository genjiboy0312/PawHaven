import { OUTFIT_TABS, type OutfitTab } from '../animals/OutfitState';
import { speechSkinItem } from '../animals/SpeechSkins';
import { isPetId, petInfo } from '../animals/PetCatalog';
import { homeStockLimit, homeInitialStock, homeKey, homePrice, validHomeProduct, type HomeProductTab } from '../home/HomeCatalog';
import type { CourseId } from '../game/CourseCatalog';
import { validRunCoins, RUN_FINISH_BONUS, type RunReward } from './RunReward';
export const SHOP_STORAGE_KEY = 'pawhaven.shop.prototype.v1';
export const PASS_TIERS = 5;
export const DAILY_QUESTS = [
  { id: 'pet', title: 'dailyPet', target: 3, reward: 50 },
  { id: 'run', title: 'dailyRun', target: 1, reward: 100 },
  { id: 'coins', title: 'dailyCoins', target: 20, reward: 50 },
] as const;
export type DailyQuestId = typeof DAILY_QUESTS[number]['id'];
interface DailyState { day: string; pet: number; run: number; coins: number; claimed: DailyQuestId[]; lastPet: number | null }
function localDay(time: number): string {
  const date = new Date(time);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
export const itemPrice = (index: number, category?: OutfitTab): number => (category && speechSkinItem(category,index)?.price) || 75 + Math.floor((index - 1) / 5) * 25;
const itemKey = (category: OutfitTab, index: number): string => category + ':' + index;
const validItem = (value: string): boolean => OUTFIT_TABS.some(tab => Array.from({ length: 20 }, (_, i) => itemKey(tab, i + 1)).includes(value));
export class ShopState {
  readonly connection = 'local';
  readonly ready = true;
  readonly entitlementsKnown = true;
  readonly homeShopReady = true;
  readonly homeBackgroundShopReady = true;
  readonly runRewardsReady = true;
  readonly raceRewardsReady = false;
  readonly dailyCoinQuestReady = true;
  readonly boxCoinRewardsReady = true;
  readonly speechSkinsReady = true;
  readonly petShopReady = true;
  private pets = new Set<string>(['corgi']);
  ownsPet(id:string):boolean{return id==='corgi'||this.pets.has(id);}
  buyPet(id:string):'purchased'|'owned'|'insufficient'|'invalid'{
    const item=petInfo(id);if(!item)return 'invalid';if(this.ownsPet(id))return 'owned';if(this.balance<item.price)return 'insufficient';
    this.balance-=item.price;this.pets.add(id);this.save();return 'purchased';
  }
  runReward?: RunReward;
  private activeRun?: CourseId;
  readonly snacksReady=true;
  private treats=0;private lastSnack:number|null=null;
  feedSerial=0;fedPet='';
  get snacks(){return this.treats;}
  feed(petId:string):boolean{
    const now=this.now();
    if(!isPetId(petId)||!this.ownsPet(petId)||!Number.isFinite(now)||this.treats<=0||this.lastSnack!==null&&now-this.lastSnack<4000)return false;
    this.treats--;this.lastSnack=now;this.feedSerial++;this.fedPet=petId;this.save();return true;
  }
  readonly busy = false;
  readonly message = '';
  retry(): void {}
  beginRun(map: CourseId = 'garden'): boolean { this.activeRun = map; this.runReward = undefined; return true; }
  destroy(): void { this.listeners.clear(); }
  private balance = 1000;
  private experience = 0;
  private premium = false;
  private items = new Set<string>(OUTFIT_TABS.map(tab => itemKey(tab, 1)));
  private claimed = new Set<string>();
  private homeItems: Record<string, number> = {};
  private readonly listeners = new Set<() => void>();
  private daily: DailyState;
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>, private readonly now: () => number = Date.now) {
    this.daily = this.freshDay();
    try {
      const saved = JSON.parse(storage?.getItem(SHOP_STORAGE_KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        if(Array.isArray(saved.pets))for(const id of saved.pets)if(isPetId(id))this.pets.add(id);
        if(Number.isSafeInteger(saved.snacks)&&saved.snacks>=0&&saved.snacks<=99)this.treats=saved.snacks;
        if(Number.isFinite(saved.lastSnack)&&saved.lastSnack>=0)this.lastSnack=saved.lastSnack;
        if (Number.isSafeInteger(saved.coins) && saved.coins >= 0 && saved.coins <= 1000000) this.balance = saved.coins;
        if (Number.isSafeInteger(saved.xp) && saved.xp >= 0 && saved.xp <= 400) this.experience = saved.xp;
        if (typeof saved.premium === 'boolean') this.premium = saved.premium;
        if (saved.homeItems && typeof saved.homeItems === 'object') for (const [key, count] of Object.entries(saved.homeItems)) {
          const [tab, index] = key.split(':');
          if (validHomeProduct(tab, Number(index)) && key === homeKey(tab, Number(index)) && Number.isInteger(count) && Number(count) >= homeInitialStock(tab, Number(index)) && Number(count) <= homeStockLimit(tab)) this.homeItems[key] = Number(count);
        }
        const day = saved.daily;
        if (day && typeof day.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.day) &&
            localDay(new Date(day.day + 'T00:00:00').getTime()) === day.day) {
          this.daily.day = day.day;
          for (const quest of DAILY_QUESTS) {
            const count = day[quest.id];
            if (Number.isInteger(count) && count >= 0) this.daily[quest.id] = Math.min(quest.target, count);
          }
          this.daily.claimed = DAILY_QUESTS.filter(quest => this.daily[quest.id] === quest.target &&
            (Array.isArray(day.claimed) && day.claimed.includes(quest.id) || quest.id === 'coins' && day.coinsClaimed === true)).map(quest => quest.id);
          if (typeof day.lastPet === 'number' && Number.isFinite(day.lastPet) && day.lastPet >= 0) this.daily.lastPet = day.lastPet;
        }
        if (Array.isArray(saved.items)) saved.items.filter((id: unknown): id is string => typeof id === 'string' && validItem(id)).forEach((id: string) => this.items.add(id));
        if (Array.isArray(saved.claimed)) saved.claimed.filter((id: unknown): id is string => typeof id === 'string' && /^(free|premium)-[1-5]$/.test(id)).forEach((id: string) => this.claimed.add(id));
      }
    } catch { /* This is local prototype data; defaults work without storage. */ }
  }
  private freshDay(): DailyState { return { day: localDay(this.now()), pet: 0, run: 0, coins: 0, claimed: [], lastPet: null }; }
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
    this.daily.claimed.push(id);if(id !== 'coins')this.treats=Math.min(99,this.treats+1);this.balance = Math.min(1000000,this.balance + quest.reward); this.save(); return true;
  }
  get hasDailyRewards(): boolean { return this.dailyQuests.some(quest => quest.canClaim); }
  get hasPassRewards(): boolean {
    return Array.from({ length: PASS_TIERS }, (_, index) => index + 1).some(tier => this.canClaim(tier, false) || this.canClaim(tier, true));
  }
  get hasQuestRewards(): boolean { return this.hasDailyRewards || this.hasPassRewards; }
  get coins(): number { return this.balance; }
  get xp(): number { return this.experience; }
  get level(): number { return Math.min(PASS_TIERS, 1 + Math.floor(this.experience / 100)); }
  get hasPass(): boolean { return this.premium; }
  homeOwned(tab: HomeProductTab, index: number): number { return validHomeProduct(tab, index) ? this.homeItems[homeKey(tab, index)] ?? homeInitialStock(tab, index) : 0; }
  buyHome(tab: HomeProductTab, index: number): 'purchased' | 'limit' | 'insufficient' | 'invalid' {
    if (!validHomeProduct(tab, index)) return 'invalid';
    const count = this.homeOwned(tab, index), price = homePrice(tab, index);
    if (count >= homeStockLimit(tab)) return 'limit';
    if (this.balance < price) return 'insufficient';
    this.balance -= price; this.homeItems[homeKey(tab, index)] = count + 1; this.save(); return 'purchased';
  }
  owns(category: OutfitTab, index: number): boolean { return index === 0 || this.items.has(itemKey(category, index)); }
  buy(category: OutfitTab, index: number): 'purchased' | 'owned' | 'insufficient' | 'invalid' {
    if (!OUTFIT_TABS.includes(category) || !Number.isInteger(index) || index < 1 || index > 20) return 'invalid';
    if (this.owns(category, index)) return 'owned';
    const price = itemPrice(index, category);
    if (price > this.balance) return 'insufficient';
    this.balance -= price; this.items.add(itemKey(category, index)); this.save(); return 'purchased';
  }
  unlockPass(): void { if (!this.premium) { this.premium = true; this.save(); } }
  completeRun(collected = 0): void {
    const rolled = this.rollDay(), before = this.experience, progress = this.daily.run;
    const map = this.activeRun; this.activeRun = undefined;
    if (map && validRunCoins(map, collected)) {
      this.daily.coins = Math.min(20,this.daily.coins + collected);
      const coins = Math.min(1000000 - this.balance, RUN_FINISH_BONUS + collected);
      this.balance += coins; this.runReward = { status: 'confirmed', collected, coins };
    }
    this.experience = Math.min(400, this.experience + 100); this.daily.run = 1;
    if (map || rolled || before !== this.experience || progress !== 1) this.save();
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
    try { this.storage?.setItem(SHOP_STORAGE_KEY, JSON.stringify({ pets:[...this.pets],snacks:this.treats,lastSnack:this.lastSnack,coins: this.balance, xp: this.experience, premium: this.premium, items: [...this.items], homeItems: this.homeItems, claimed: [...this.claimed], daily: this.daily })); } catch { /* Keep the in-memory prototype session. */ }
    if (notify) this.listeners.forEach(callback => callback());
  }
}
