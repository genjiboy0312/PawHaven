import { ShopState, type DailyQuestId } from './ShopState';
import type { OutfitTab } from '../animals/OutfitState';
import type { EconomyClient } from './EconomyClient';
import { t } from '../settings/i18n';
import { homeInitialStock, type HomeProductTab } from '../home/HomeCatalog';
import type { CourseId } from '../game/CourseCatalog';
import type { RunReward } from './RunReward';

export class ServerShopState {
  private view = new ShopState();
  private runId?: string;
  private rewardRunId?: string;
  runReward?: RunReward;
  get runRewardsReady(): boolean { return this.api.result?.snapshot.runRewardsReady === true; }
  get raceRewardsReady(): boolean { return this.api.result?.snapshot.raceRewardsReady === true; }
  get dailyCoinQuestReady(): boolean { return this.api.result?.snapshot.dailyCoinQuestReady === true; }
  get boxCoinRewardsReady(): boolean { return this.api.result?.snapshot.boxCoinRewardsReady === true; }
  feedSerial=0;fedPet='';private feedRevision=-1;
  get snacksReady(){return this.api.result?.snapshot.snacksReady===true;}
  get snacks(){return this.api.result?.snapshot.snacks??0;}
  async feed(petId:string):Promise<boolean>{
    if(!this.ready||!this.snacksReady||this.snacks<=0||!['corgi','myeongrang'].includes(petId))return false;
    return (await this.api.execute('feed',{petId}))?.outcome==='fed';
  }
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  constructor(private readonly api: EconomyClient) {
    this.unsubscribe = api.subscribe(() => {
      const result = api.result;
      if (result) {
        if (result.run_id === this.rewardRunId) {
          if (result.run_reward) this.runReward = { status: 'confirmed', collected: result.run_reward.collected, coins: result.run_reward.coins };
          else if (result.outcome === 'run_rejected') this.runReward = { status: 'rejected', collected: this.runReward?.collected ?? 0 };
        }
        if(result.outcome==='fed'&&result.petId&&result.revision!==this.feedRevision){this.feedRevision=result.revision;this.feedSerial++;this.fedPet=result.petId;}
        // Freeze the local view to the server day; only the server can roll a logged-in quest day.
        const fixedDay = Date.parse(result.snapshot.daily.day + 'T00:00:00Z');
        this.view = new ShopState({ getItem: () => JSON.stringify(result.snapshot), setItem() {} }, () => fixedDay);
      }
      this.listeners.forEach(listener => listener());
    });
    void api.execute('load');
  }
  get connection() { return this.api.connection; }
  get entitlementsKnown(): boolean { return !!this.api.result; }
  get ready(): boolean { return this.api.ready; }
  get busy(): boolean { return this.api.busy; }
  get message(): string {
    if (this.api.issue) return t('economyRunRejected');
    return this.connection === 'ready' || (this.connection === 'loading' && this.api.result) ? '' : t(('economy.' + this.connection) as Parameters<typeof t>[0]);
  }
  retry(): void { void this.api.retry(); }
  async reload():Promise<void>{if(!await this.api.execute('load'))throw Error('economy_reload_failed');}
  refreshDaily(): void { this.api.refresh(); }
  get dailyQuests() { this.api.refresh(); return this.view.dailyQuests.filter(quest => quest.id !== 'coins' || this.dailyCoinQuestReady).map(quest => ({ ...quest, canClaim: this.ready && quest.canClaim })); }
  get hasDailyRewards(): boolean { this.api.refresh(); return !!this.api.result && this.view.hasDailyRewards; }
  get hasPassRewards(): boolean { return !!this.api.result && this.view.hasPassRewards; }
  get hasQuestRewards(): boolean { return this.hasDailyRewards || this.hasPassRewards; }
  get coins(): number { return this.view.coins; }
  get xp(): number { return this.view.xp; }
  get level(): number { return this.view.level; }
  get hasPass(): boolean { return this.view.hasPass; }
  get homeShopReady(): boolean { return this.api.result?.snapshot.homeShopReady === true; }
  get homeBackgroundShopReady(): boolean { return this.api.result?.snapshot.homeBackgroundShopReady === true; }
  homeOwned(tab: HomeProductTab, index: number): number { return this.homeShopReady ? this.view.homeOwned(tab, index) : homeInitialStock(tab, index); }
  async buyHome(category: HomeProductTab, index: number): Promise<'purchased' | 'limit' | 'insufficient' | 'invalid'> {
    if (!this.ready || !this.homeShopReady || category === 'Background' && !this.homeBackgroundShopReady) return 'invalid';
    const result = await this.api.execute('buy_home', { category, index });
    return result?.outcome === 'purchased' ? 'purchased' : result?.outcome === 'limit' ? 'limit' : result?.outcome === 'insufficient' ? 'insufficient' : 'invalid';
  }
  owns(category: OutfitTab, index: number): boolean { return this.view.owns(category, index); }
  async buy(category: OutfitTab, index: number): Promise<'purchased' | 'owned' | 'insufficient' | 'invalid'> {
    if (!this.ready) return 'invalid';
    const result = await this.api.execute('buy', { category, index });
    return result?.outcome === 'purchased' ? 'purchased' : result?.outcome === 'owned' ? 'owned'
      : result?.outcome === 'insufficient' ? 'insufficient' : 'invalid';
  }
  async recordPet(): Promise<boolean> {
    if (!this.ready || this.view.dailyQuests[0]!.progress >= 3) return false;
    return (await this.api.execute('pet'))?.outcome === 'recorded';
  }
  async beginRun(map: CourseId = 'garden'): Promise<boolean> {
    if (!this.ready) return false;
    const result = await this.api.execute('run_start', { map });
    this.runId = result?.run_id;
    this.rewardRunId = undefined; this.runReward = undefined;
    return !!this.runId;
  }
  async completeRun(collected = 0): Promise<void> {
    const run_id = this.runId; this.runId = undefined;
    if (!run_id) return;
    this.rewardRunId = run_id;
    this.runReward = { status: this.runRewardsReady ? 'pending' : 'unavailable', collected };
    const result = await this.api.execute('run_finish', { run_id, ...(this.runRewardsReady ? { collected } : {}) });
    if (result?.outcome === 'run_rejected' && this.rewardRunId === run_id) this.runReward = { status: 'rejected', collected };
  }
  async completeRace(room: string, round: string, collected: number, finished: boolean): Promise<void> {
    this.rewardRunId = round;
    this.runReward = { status: !finished ? 'notFinished' : this.raceRewardsReady ? 'pending' : 'unavailable', collected };
    if (!finished || !this.raceRewardsReady) { this.listeners.forEach(listener => listener()); return; }
    await this.api.execute('race_reward', { room, round, collected });
  }
  async claimDaily(id: DailyQuestId): Promise<boolean> {
    if (!this.ready || id === 'coins' && !this.dailyCoinQuestReady) return false;
    return (await this.api.execute('claim_daily', { quest: id }))?.outcome === 'claimed';
  }
  async unlockPass(): Promise<void> { if (this.ready) await this.api.execute('unlock_pass'); }
  reward(tier: number, premium: boolean): number { return this.view.reward(tier, premium); }
  isClaimed(tier: number, premium: boolean): boolean { return this.view.isClaimed(tier, premium); }
  canClaim(tier: number, premium: boolean): boolean { return this.ready && this.view.canClaim(tier, premium); }
  async claim(tier: number, premium: boolean): Promise<boolean> {
    if (!this.ready) return false;
    return (await this.api.execute('claim_pass', { tier, premium }))?.outcome === 'claimed';
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  destroy(): void { this.unsubscribe(); this.api.destroy(); this.listeners.clear(); }
}
