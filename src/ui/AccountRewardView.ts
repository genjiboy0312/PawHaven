import {accountProgress,type AccountRunReward} from '../account/AccountProgress';
import {t} from '../settings/i18n';
/** Passive shared single/race view. Its owner observes state; stable DOM avoids animation replays. */
export class AccountRewardView {
 readonly element=document.createElement('section');
 private heading=document.createElement('div');private amount=document.createElement('span');private level=document.createElement('span');
 private bar=document.createElement('div');private fill=document.createElement('span');private detail=document.createElement('span');private gift=document.createElement('p');
 private shown?:AccountRunReward;
 constructor(){
  this.element.className='account-run-reward';this.element.hidden=true;
  this.heading.className='account-run-heading';this.amount.className='account-run-amount';
  this.bar.className='lobby-profile-bar';this.bar.setAttribute('role','progressbar');this.fill.className='lobby-profile-fill';this.bar.append(this.fill);
  this.detail.className='account-run-detail';this.gift.className='account-run-gift';
  this.heading.append(this.amount,this.level);this.element.append(this.heading,this.bar,this.detail,this.gift);
 }
 render(reward?:AccountRunReward){
  this.element.hidden=!reward;if(!reward)return;
  const before=accountProgress(reward.beforeXP),after=accountProgress(reward.afterXP),changed=after.level>before.level;
  this.amount.textContent=`EXP +${reward.afterXP-reward.beforeXP}`;
  this.level.textContent=changed?`Lv. ${before.level} → Lv. ${after.level}`:`Lv. ${after.level}`;
  this.detail.textContent=after.max?'MAX':`${after.current} / ${after.required} EXP`;
  this.bar.setAttribute('aria-label',t('accountXP'));this.bar.setAttribute('aria-valuemin','0');this.bar.setAttribute('aria-valuemax',String(after.required));this.bar.setAttribute('aria-valuenow',String(after.current));
  if(this.shown!==reward){
   this.fill.style.setProperty('--xp-from',before.percent+'%');this.fill.style.setProperty('--xp-to',after.percent+'%');this.fill.style.width=after.percent+'%';
   this.fill.className='lobby-profile-fill '+(changed&&!after.max?'account-xp-level':'account-xp-gain');this.shown=reward;
  }
  this.gift.hidden=!reward.levelUp;
  if(reward.levelUp)this.gift.textContent=t('accountLevelUp')+'  '+t('profileReward').replace('{coins}',String(reward.levelUp.coins)).replace('{snacks}',String(reward.levelUp.snacks));
 }
}
