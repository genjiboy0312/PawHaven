import type { CommerceState } from '../shop/CommerceState';
import { onLanguageChange, t } from '../settings/i18n';
import { coinAmount } from './CoinAmount';
import { commerceStatus } from './CommerceStatus';

/** Uses the commerce observer so a retried receipt updates an open result. */
export class RunRewardPanel {
  readonly element = document.createElement('div');
  private readonly unsubscribe: () => void;
  private readonly localeOff: () => void;
  constructor(private readonly state: CommerceState, private readonly progress: () => { collected: number; total: number }, private readonly mode: 'single' | 'race' = 'single') {
    this.element.className = 'run-reward-summary'; this.element.setAttribute('role','status');
    this.unsubscribe = state.subscribe(() => this.render()); this.localeOff = onLanguageChange(() => this.render()); this.render();
  }
  private render(): void {
    const { collected, total } = this.progress(), receipt = this.state.runReward;
    const count = document.createElement('p'); count.textContent = `${t('runCoins')}: ${collected} / ${total}`;
    const reward = document.createElement('p'); reward.className = 'run-reward-credit';
    const ready = this.mode === 'race' ? this.state.raceRewardsReady : this.state.runRewardsReady;
    if (receipt?.status === 'confirmed') coinAmount(reward, receipt.coins ?? 0, { prefix: t('runRewardEarned') + ': +' });
    else reward.textContent = t(receipt?.status === 'notFinished' ? 'runRewardDNF' : receipt?.status === 'rejected' ? 'economyRunRejected' : receipt?.status === 'unavailable' || !ready ? 'runRewardSetup' : 'runRewardPending');
    const balance = document.createElement('p'); coinAmount(balance, this.state.entitlementsKnown ? this.state.coins : '—', { prefix: t('runRewardBalance') + ': ' });
    this.element.replaceChildren(count, reward, balance);
    const status = commerceStatus(this.state); if (status) this.element.append(status);
  }
  destroy(): void { this.unsubscribe(); this.localeOff(); this.element.remove(); }
}
