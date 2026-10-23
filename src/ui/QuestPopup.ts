import { bindText, onLanguageChange, t } from '../settings/i18n';
import type { CommerceState } from '../shop/CommerceState';
import { commerceStatus } from './CommerceStatus';
import { passPanel } from './PassPanel';
import { coinAmount } from './CoinAmount';

export class QuestPopup {
  private overlay?: HTMLElement;
  private content?: HTMLElement;
  private tabs?: HTMLElement;
  private abort?: AbortController;
  private blocked: { element: HTMLElement; inert: boolean }[] = [];
  private previousFocus?: HTMLElement;
  private tab: 'Daily' | 'Weekly' | 'seasonPass' = 'Daily';
  private readonly unsubscribe: () => void;
  private readonly localeOff: () => void;
  private resetTimer?: ReturnType<typeof setInterval>;
  constructor(private readonly state: CommerceState, private readonly pause: (value: boolean) => void, private readonly openShop: () => void) {
    this.unsubscribe = state.subscribe(() => this.render());
    this.localeOff = onLanguageChange(() => this.render());
  }
  open(tab: 'Daily' | 'Weekly' | 'seasonPass' = 'Daily'): void {
    if (this.overlay) return;
    const host = document.querySelector<HTMLElement>('#app'); if (!host) return;
    this.state.refreshDaily();
    this.tab = tab; this.abort = new AbortController();
    this.resetTimer = setInterval(() => this.state.refreshDaily(), 1000);
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.blocked = Array.from(host.children).filter((element): element is HTMLElement => element instanceof HTMLElement).map(element => ({ element, inert: element.inert }));
    this.blocked.forEach(item => { item.element.inert = true; }); this.pause(true);
    const overlay = document.createElement('div'); overlay.className = 'settings-overlay'; this.overlay = overlay;
    const panel = document.createElement('section'); panel.className = 'settings-panel quest-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', t('quest'));
    const heading = document.createElement('h2'); bindText(heading, 'quest');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'settings-close'; close.textContent = '×'; close.setAttribute('aria-label', t('close'));
    close.addEventListener('click', () => this.close(), { signal: this.abort.signal });
    const tabs = document.createElement('nav'); this.tabs = tabs; tabs.className = 'settings-tabs';
    this.content = document.createElement('div'); this.content.className = 'settings-content quest-content'; this.content.tabIndex = -1;
    for (const tab of ['Daily', 'Weekly', 'seasonPass'] as const) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, tab);
      const update = (): void => { Array.from(tabs.children).forEach(item => item.setAttribute('aria-pressed', String(item === button))); };
      button.addEventListener('click', () => { this.tab = tab; update(); this.render(); }, { signal: this.abort.signal });
      button.setAttribute('aria-pressed', String(this.tab === tab)); tabs.append(button);
    }
    panel.append(heading, close, tabs, this.content); overlay.append(panel); host.append(overlay);
    let backdrop = false;
    overlay.addEventListener('pointerdown', event => { backdrop = event.target === overlay; }, { signal: this.abort.signal });
    overlay.addEventListener('pointerup', event => { if (backdrop && event.target === overlay) this.close(); backdrop = false; }, { signal: this.abort.signal });
    overlay.addEventListener('pointercancel', () => { backdrop = false; }, { signal: this.abort.signal });
    overlay.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key === 'Tab') {
        const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled)'));
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
      }
    }, { signal: this.abort.signal });
    this.render(); close.focus();
  }
  private render(): void {
    if (!this.content) return;
    if (this.tabs) Array.from(this.tabs.children).forEach((button, index) => button.setAttribute('data-reward-ready',
      String(index === 0 ? this.state.hasDailyRewards : index === 2 ? this.state.hasPassRewards : false)));
    this.content.replaceChildren();
    if (this.tab === 'seasonPass') this.content.append(passPanel(this.state, 'quest', () => { this.close(); this.openShop(); }));
    else if (this.tab === 'Daily') {
      const balance = document.createElement('p'); coinAmount(balance, this.state.entitlementsKnown ? this.state.coins : '—', { balance: true });
      const hint = document.createElement('p'); hint.className = 'daily-hint'; hint.textContent = t(this.state.connection === 'local' ? 'dailyReset' : 'dailyServerReset');
      this.content.append(balance, hint);
      for (const quest of this.state.dailyQuests) {
        const row = document.createElement('section'); row.className = 'daily-quest';
        const detail = document.createElement('div');
        const name = document.createElement('h3'); name.textContent = t(quest.title);
        const description = document.createElement('p'); description.textContent = t(quest.id === 'pet' ? 'dailyPetHint' : 'dailyRunHint');
        const progress = document.createElement('p'); coinAmount(progress, quest.reward, { prefix: `${quest.progress}/${quest.target} · ` });
        detail.append(name, description, progress);
        if(this.state.snacksReady){const treat=document.createElement('p');treat.className='snack-quest-reward';const art=document.createElement('img');art.src='./assets/items/pet-treat.png';art.alt='';const text=document.createElement('span');text.textContent=t('snackReward');treat.append(art,text);detail.append(treat);}
        const claim = document.createElement('button'); claim.type = 'button'; claim.className = 'commerce-primary';
        claim.textContent = t(quest.claimed ? 'claimed' : 'claim'); claim.disabled = !quest.canClaim;
        claim.setAttribute('data-reward-ready', String(quest.canClaim));
        claim.setAttribute('data-claimed', String(quest.claimed));
        row.setAttribute('data-reward-ready', String(quest.canClaim));
        claim.setAttribute('aria-label', t(quest.title) + ' · ' + claim.textContent);
        claim.addEventListener('click', () => {
          const result = this.state.claimDaily(quest.id);
          if (result instanceof Promise) void result.then(claimed => { if (claimed) this.content?.focus(); });
          else if (result) this.content?.focus();
        });
        row.append(detail, claim); this.content.append(row);
      }
    } else { const text = document.createElement('p'); text.textContent = t('weeklySoon'); this.content.append(text); }
    const status = commerceStatus(this.state); if (status) this.content.append(status);
  }
  close(): void {
    if (!this.overlay) return;
    if (this.resetTimer !== undefined) clearInterval(this.resetTimer);
    this.resetTimer = undefined;
    this.abort?.abort(); this.overlay.remove(); this.overlay = undefined; this.content = undefined; this.tabs = undefined;
    this.blocked.forEach(item => { item.element.inert = item.inert; }); this.blocked = []; this.pause(false);
    if (this.previousFocus?.isConnected) this.previousFocus.focus(); this.previousFocus = undefined;
  }
  destroy(): void { this.close(); this.unsubscribe(); this.localeOff(); }
}
