import { homeStockLimit, homeOptions,homeInitialStock, homeKey, validHomeProduct } from '../home/HomeCatalog';
import type { RunRewardReceipt } from './RunReward';
export interface EconomySnapshot {
  snacks?:number;snacksReady?:boolean;
  homeItems?: Record<string, number>; homeShopReady?: boolean;
  homeBackgroundShopReady?: boolean;
  runRewardsReady?: boolean;
  coins: number; xp: number; premium: boolean; items: string[]; claimed: string[];
  daily: { day: string; pet: number; run: number; claimed: ('pet' | 'run')[]; lastPet: number | null };
}
export type EconomyAction = 'load' | 'buy' | 'buy_home' | 'feed' | 'pet' | 'claim_daily' | 'claim_pass' | 'unlock_pass' | 'run_start' | 'run_finish';
export interface EconomyRequest { p_action: EconomyAction; p_request_id: string; p_payload: Record<string, unknown> }
export interface EconomyResult { snapshot: EconomySnapshot; revision: number; outcome: string; run_id?: string;petId?:string; run_reward?: RunRewardReceipt }
const integer = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;
const uniqueList = (value: unknown, max: number, valid: (item: unknown) => boolean): value is string[] =>
  Array.isArray(value) && value.length <= max && new Set(value).size === value.length && value.every(valid);
export function parseEconomyResult(input: unknown): EconomyResult {
  const result = input as EconomyResult | null, value = result?.snapshot, daily = value?.daily;
  if (!result || !value || !daily || !integer(result.revision, Number.MAX_SAFE_INTEGER) || typeof result.outcome !== 'string' ||
      !integer(value.coins, 1000000) || !integer(value.xp, 400) || typeof value.premium !== 'boolean' ||
      !uniqueList(value.items, 80, item => typeof item === 'string' && /^(Hat|Body|Acc|Etc):([1-9]|1[0-9]|20)$/.test(item)) ||
      !uniqueList(value.claimed, 10, item => typeof item === 'string' && /^(free|premium)-[1-5]$/.test(item)) ||
      typeof daily.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(daily.day) ||
      !integer(daily.pet, 3) || !integer(daily.run, 1) ||
      !uniqueList(daily.claimed, 2, item => item === 'pet' || item === 'run') ||
      (daily.lastPet !== null && !integer(daily.lastPet, Number.MAX_SAFE_INTEGER)) ||
      (result.run_id !== undefined && !/^[0-9a-f-]{36}$/i.test(result.run_id))) throw Error('invalid_economy_response');
  if (value.homeShopReady !== undefined && value.homeShopReady !== true) throw Error('invalid_economy_response');
  if (value.runRewardsReady !== undefined && value.runRewardsReady !== true) throw Error('invalid_economy_response');
  if (result.run_reward !== undefined) {
    const receipt = result.run_reward;
    if (!receipt || !value.runRewardsReady || result.outcome !== 'finished' || !result.run_id || !integer(receipt.collected,13) || receipt.bonus !== 10 || !integer(receipt.coins,23) || receipt.coins > receipt.collected + receipt.bonus) throw Error('invalid_economy_response');
  }
  if (value.homeBackgroundShopReady !== undefined && (value.homeBackgroundShopReady !== true || !value.homeShopReady)) throw Error('invalid_economy_response');
  if((value.snacksReady!==undefined&&value.snacksReady!==true)||(value.snacksReady===true&&!integer(value.snacks,99))||(value.snacks!==undefined&&!integer(value.snacks,99))||(result.petId!==undefined&&!['corgi','myeongrang'].includes(result.petId)))throw Error('invalid_economy_response');
  if (value.homeShopReady === true || value.homeItems !== undefined) {
    if (!value.homeItems || Array.isArray(value.homeItems) || typeof value.homeItems !== 'object' || Object.keys(value.homeItems).length > homeOptions.Furniture+homeOptions.Etc+homeOptions.Background-2) throw Error('invalid_economy_response');
    for (const [key, count] of Object.entries(value.homeItems)) {
      const [tab, index] = key.split(':');
      if (!validHomeProduct(tab, Number(index)) || key !== homeKey(tab, Number(index)) || !integer(count, homeStockLimit(tab)) || count < homeInitialStock(tab, Number(index))) throw Error('invalid_economy_response');
    }
  }
  return structuredClone(result);
}
