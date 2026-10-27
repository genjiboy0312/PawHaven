import type { CommerceState } from '../shop/CommerceState';
import { PASS_TIERS } from '../shop/ShopState';
import { t } from '../settings/i18n';
import { coinAmount } from './CoinAmount';

/** Shop explains the offer; Quest retains the actual progression and claims. */
export function passOffer(state: CommerceState, viewRewards: () => void): HTMLElement {
  const root = document.createElement('section'); root.className = 'pass-offer';
  root.setAttribute('data-owned', String(state.entitlementsKnown && state.hasPass));
  const title = document.createElement('h3'); title.textContent = t('seasonName');
  const period = document.createElement('p'); period.className = 'pass-offer-period'; period.textContent = t('seasonPrototype');
  const intro = document.createElement('p'); intro.className = 'pass-offer-intro'; intro.textContent = t('passOfferIntro');
  const comparison = document.createElement('div'); comparison.className = 'pass-offer-comparison';
  for (const premium of [false, true]) {
    const card = document.createElement('article'); card.setAttribute('data-premium', String(premium));
    const heading = document.createElement('h4'); heading.textContent = t(premium ? 'premiumTrack' : 'freeTrack');
    const total = Array.from({ length: PASS_TIERS }, (_, index) => state.reward(index + 1, premium)).reduce((sum, reward) => sum + reward, 0);
    const amount = document.createElement('p'); amount.className = 'pass-offer-total'; coinAmount(amount, total, { prefix: premium ? '+' : '' });
    const detail = document.createElement('p'); detail.textContent = t(premium ? 'passOfferPremium' : 'passOfferFree').replace('{tiers}', String(PASS_TIERS));
    card.append(heading, amount, detail); comparison.append(card);
  }
  const rules = document.createElement('p'); rules.className = 'pass-offer-rules'; rules.textContent = t('passOfferRules');
  const retroactive = document.createElement('p'); retroactive.className = 'pass-offer-retroactive'; retroactive.textContent = t('passOfferRetroactive');
  const footer = document.createElement('div'); footer.className = 'pass-offer-actions';
  const price = document.createElement('span'); price.textContent = t(state.hasPass ? 'passPurchased' : 'testUnlock');
  const buy = document.createElement('button'); buy.type = 'button'; buy.className = 'commerce-primary pass-offer-buy';
  buy.textContent = t(state.hasPass ? 'passPurchased' : state.busy ? 'economyWorking' : !state.entitlementsKnown ? 'shopChecking' : 'passTestPurchase');
  buy.disabled = state.hasPass || !state.ready;
  buy.setAttribute('data-purchase-state', state.hasPass ? 'owned' : state.busy ? 'processing' : !state.entitlementsKnown ? 'loading' : state.ready ? 'available' : 'unavailable');
  buy.addEventListener('click', () => { if (state.ready && !state.hasPass) void state.unlockPass(); });
  const rewards = document.createElement('button'); rewards.type = 'button'; rewards.className = 'commerce-primary pass-offer-rewards'; rewards.textContent = t('viewPass');
  rewards.addEventListener('click', viewRewards);
  footer.append(price, buy, rewards); root.append(title, period, intro, comparison, rules, retroactive, footer); return root;
}
