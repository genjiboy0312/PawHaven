import { onLanguageChange, t } from '../settings/i18n';
import type { CommerceState } from '../shop/CommerceState';
import { coinAmount } from './CoinAmount';
import { commerceStatus } from './CommerceStatus';

interface PurchaseItem {
  name: () => string; icon: () => HTMLElement; price: number;
  available: () => boolean; fulfilled: () => boolean;
  buy: () => string | Promise<string>; purchased: () => void;
}
/** One confirmation view for outfit and furniture purchases; the existing wallet owns all mutations. */
export class PurchasePopup {
  private overlay?: HTMLElement;
  private submitting = false;
  private attempted = false;
  private unsubscribe?: () => void;
  private localeOff?: () => void;
  private abort?: AbortController;
  private blocked: { element: HTMLElement; inert: boolean }[] = [];
  private opener?: HTMLElement;
  private refresh = (): void => {};
  constructor(private readonly state: CommerceState, private readonly shop: HTMLElement) {}

  open(item: PurchaseItem): void {
    if (this.overlay || !this.state.ready || !item.available() || this.state.coins < item.price) return;
    const host = document.querySelector<HTMLElement>('#app'); if (!host) return;
    this.attempted = false; this.submitting = false; this.abort = new AbortController();
    const signal = this.abort.signal;
    this.opener = typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.blocked = Array.from(host.children).filter((node): node is HTMLElement => typeof HTMLElement !== 'undefined' && node instanceof HTMLElement).map(element => ({ element, inert: element.inert }));
    this.blocked.forEach(entry => { entry.element.inert = true; });
    const overlay = document.createElement('div'); overlay.className = 'settings-overlay purchase-overlay'; this.overlay = overlay;
    const panel = document.createElement('section'); panel.className = 'settings-panel purchase-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    const title = document.createElement('h2');
    const art = document.createElement('div'); art.className = 'purchase-art'; art.append(item.icon());
    const name = document.createElement('strong'); name.className = 'purchase-name';
    const quantity = document.createElement('p'); quantity.className = 'purchase-quantity';
    const price = document.createElement('p'); const after = document.createElement('p'); after.className = 'purchase-after';
    after.setAttribute('role', 'status'); after.setAttribute('aria-live', 'polite');
    const details = document.createElement('div'); details.className = 'purchase-details'; details.append(art, name, quantity, price, after);
    const status = document.createElement('div'); status.className = 'purchase-status';
    const actions = document.createElement('div'); actions.className = 'purchase-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'commerce-primary purchase-cancel';
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'commerce-primary purchase-confirm';
    actions.append(cancel, confirm); panel.append(title, details, status, actions); overlay.append(panel); host.append(overlay);
    const complete = (): void => { if (this.overlay !== overlay) return; item.purchased(); this.close(true); };
    this.refresh = () => {
      if (!this.overlay) return;
      if (this.attempted && this.state.entitlementsKnown && item.fulfilled()) { complete(); return; }
      title.textContent = t('purchaseTitle'); panel.setAttribute('aria-label', title.textContent);
      name.textContent = item.name(); quantity.textContent = `${t('purchaseQuantity')}: 1`;
      coinAmount(price, item.price);
      const remaining = this.state.entitlementsKnown ? this.state.coins - item.price : undefined;
      if (remaining === undefined) coinAmount(after, '—', { prefix: t('purchaseAfter') + ': ' });
      else if (remaining < 0) after.textContent = t('notEnoughCoins');
      else coinAmount(after, remaining, { prefix: t('purchaseAfter') + ': ' });
      confirm.disabled = this.submitting || !this.state.ready || !item.available() || remaining === undefined || remaining < 0;
      cancel.disabled = this.submitting;
      confirm.textContent = t(this.submitting ? 'economyWorking' : 'purchaseConfirm'); cancel.textContent = t('purchaseCancel');
      status.replaceChildren(); const connection = commerceStatus(this.state); if (connection) status.append(connection);
    };
    cancel.addEventListener('click', () => this.close(), { signal });
    confirm.addEventListener('click', () => {
      if (confirm.disabled || this.submitting || !this.state.ready || !item.available() || this.state.coins < item.price) return;
      this.submitting = true; this.attempted = true; this.refresh();
      void Promise.resolve().then(() => this.overlay === overlay ? item.buy() : 'invalid').then(result => {
        if (this.overlay !== overlay) return;
        if (result === 'purchased') complete();
        else { this.submitting = false; this.refresh(); }
      }).catch(() => { if (this.overlay === overlay) { this.submitting = false; this.refresh(); } });
    }, { signal });
    let backdrop = false;
    overlay.addEventListener('pointerdown', event => { backdrop = event.target === overlay; }, { signal });
    overlay.addEventListener('pointerup', event => { if (backdrop && event.target === overlay) this.close(); backdrop = false; }, { signal });
    overlay.addEventListener('pointercancel', () => { backdrop = false; }, { signal });
    panel.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled)'));
      if (!controls.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }, { signal });
    this.unsubscribe = this.state.subscribe(this.refresh); this.localeOff = onLanguageChange(this.refresh);
    this.refresh(); cancel.focus();
  }

  close(force = false): void {
    if (!this.overlay || (this.submitting && !force)) return;
    this.unsubscribe?.(); this.localeOff?.(); this.abort?.abort(); this.overlay.remove(); this.overlay = undefined;
    this.blocked.forEach(entry => { entry.element.inert = entry.inert; }); this.blocked = []; this.submitting = false;
    if (this.opener?.isConnected) this.opener.focus();
    else this.shop.querySelector<HTMLElement>('.shop-purchase')?.querySelector<HTMLElement>('.commerce-primary')?.focus();
    this.opener = undefined; this.refresh = () => {};
  }
  destroy(): void { this.close(true); }
}
