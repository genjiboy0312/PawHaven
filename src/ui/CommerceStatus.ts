import type { CommerceState } from '../shop/CommerceState';
import { t } from '../settings/i18n';
export function commerceStatus(state: CommerceState): HTMLElement | undefined {
  if (!state.message) return;
  const root = document.createElement('div'); root.className = 'commerce-status'; root.setAttribute('role','status');
  const text = document.createElement('p'); text.textContent = state.message; root.append(text);
  if (!state.busy && state.connection !== 'loading') {
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = t('economyRetry');
    retry.addEventListener('click', () => state.retry()); root.append(retry);
  }
  return root;
}
