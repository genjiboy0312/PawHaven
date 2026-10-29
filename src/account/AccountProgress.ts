export const ACCOUNT_MAX_LEVEL=100;
export const ACCOUNT_MAX_XP=252450;
export const ACCOUNT_RUN_XP=20;
export const ACCOUNT_LEVEL_COINS=20;
export const ACCOUNT_LEVEL_SNACKS=1;
export interface AccountLevelUp {level:number;coins:number;snacks:number}
export function accountProgress(total=0){
 const xp=Number.isSafeInteger(total)?Math.max(0,Math.min(ACCOUNT_MAX_XP,total)):0;
 let level=1,current=xp,required=100;
 while(level<ACCOUNT_MAX_LEVEL&&current>=required){current-=required;level++;required=100+(level-1)*50;}
 const max=level===ACCOUNT_MAX_LEVEL;
 return {xp,level,current:max?required:current,required,percent:max?100:current/required*100,max};
}

export interface AccountRunReward {beforeXP:number;afterXP:number;levelUp?:AccountLevelUp}
/** Presentation only: wallet values still come from the validated server response. */
export function accountFinishReward(beforeXP:number,afterXP:number,levelUp?:AccountLevelUp):AccountRunReward|undefined{
 if(!Number.isSafeInteger(beforeXP)||!Number.isSafeInteger(afterXP)||afterXP<beforeXP)return;
 return {beforeXP:Math.max(beforeXP,afterXP-ACCOUNT_RUN_XP),afterXP,...(levelUp?{levelUp}: {})};
}
