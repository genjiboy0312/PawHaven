import { t } from '../settings/i18n';

/** Shared decorative coin + readable amount. Owners retain their existing subscriptions. */
export function coinAmount(element: HTMLElement, amount: number | '—', options: { balance?: boolean; prefix?: string; suffix?: string } = {}): void {
  const classes = element.className ?? '';
  if (!classes.split(' ').includes('coin-amount')) element.className = (classes + ' coin-amount').trim();
  const value = options.balance ? `${t('coins')}: ${amount}` : `${amount} ${t('coins')}`;
  element.textContent = (options.prefix ?? '') + value + (options.suffix ?? '');
}
