import { PASS_TIERS } from '../shop/ShopState';
import type { CommerceState } from '../shop/CommerceState';
import { t } from '../settings/i18n';
import { coinAmount } from './CoinAmount';
export function passPanel(state: CommerceState, mode: 'shop' | 'quest', navigate: () => void): HTMLElement {
  const root = document.createElement('section'); root.className = 'pass-panel';
  const title = document.createElement('h3'); title.textContent = t('seasonName');
  const hint = document.createElement('p'); hint.textContent = t('seasonPrototype');
  const progress = document.createElement('p'); progress.textContent = `${t('level')} ${state.level} · ${state.xp}/400 XP`;
  const action = document.createElement('button'); action.type = 'button'; action.className = 'commerce-primary';
  action.textContent = state.hasPass ? t('passOwned') : mode === 'shop' ? t('testUnlock') : t('upgradePass');
  action.disabled = state.hasPass || !state.ready;
  action.addEventListener('click', () => { if (mode === 'shop') state.unlockPass(); else navigate(); });
  const track = document.createElement('div'); track.className = 'pass-track';
  for (let tier = 1; tier <= PASS_TIERS; tier++) {
    const column = document.createElement('article');
    const name = document.createElement('h4'); name.textContent = t('level') + ' ' + tier;
    column.append(name);
    for (const premium of [false, true]) {
      const reward = document.createElement('button'); reward.type = 'button'; reward.className = 'pass-reward';
      const status = state.isClaimed(tier, premium) ? t('claimed') : mode === 'quest' && state.canClaim(tier, premium) ? t('claim') : t('rewardPreview');
      coinAmount(reward, state.reward(tier, premium), { prefix: `${premium ? t('premiumTrack') : t('freeTrack')} · `, suffix: `\n${status}` });
      reward.setAttribute('data-reward-ready', String(mode === 'quest' && state.canClaim(tier, premium)));
      reward.disabled = mode === 'shop' || !state.canClaim(tier, premium);
      reward.addEventListener('click', () => state.claim(tier, premium)); column.append(reward);
    }
    track.append(column);
  }
  root.append(title, hint, progress, action, track); return root;
}
