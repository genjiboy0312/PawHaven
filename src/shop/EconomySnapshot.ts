import { homeStockLimit, homeOptions,homeInitialStock, homeKey, validHomeProduct } from '../home/HomeCatalog';
import type { RunRewardReceipt } from './RunReward';
import { MAX_COURSE_COINS } from '../game/CourseCoins';
import { isPetId } from '../animals/PetCatalog';
export interface EconomySnapshot {
  petShopReady?:boolean;pets?:string[];
  snacks?:number;snacksReady?:boolean;
  homeItems?: Record<string, number>; homeShopReady?: boolean;
  homeBackgroundShopReady?: boolean;
  homeFloorShopReady?:boolean;
  petHouseShopReady?:boolean;
  cherrySkyReady?:boolean;
  runRewardsReady?: boolean;
  raceRewardsReady?: boolean;
  dailyCoinQuestReady?: boolean;
  boxCoinRewardsReady?: boolean;
  speechSkinsReady?: boolean;
  coins: number; xp: number; premium: boolean; items: string[]; claimed: string[];
  daily: { day: string; pet: number; run: number; coins?: number; coinsClaimed?: boolean; claimed: ('pet' | 'run')[]; lastPet: number | null };
}
export type EconomyAction = 'load' | 'buy' | 'buy_pet' | 'buy_home' | 'feed' | 'pet' | 'claim_daily' | 'claim_pass' | 'unlock_pass' | 'run_start' | 'run_finish' | 'race_reward';
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
  if (value.raceRewardsReady !== undefined && value.raceRewardsReady !== true) throw Error('invalid_economy_response');
  if (value.boxCoinRewardsReady !== undefined && value.boxCoinRewardsReady !== true) throw Error('invalid_economy_response');
  if (value.speechSkinsReady !== undefined && value.speechSkinsReady !== true) throw Error('invalid_economy_response');
  if(value.petShopReady!==undefined&&(value.petShopReady!==true||!uniqueList(value.pets,3,isPetId)||!value.pets?.includes('corgi'))||value.pets!==undefined&&!uniqueList(value.pets,3,isPetId))throw Error('invalid_economy_response');
  if (value.dailyCoinQuestReady !== undefined && value.dailyCoinQuestReady !== true || daily.coins !== undefined && !integer(daily.coins,20) || daily.coinsClaimed !== undefined && typeof daily.coinsClaimed !== 'boolean' || value.dailyCoinQuestReady && (!integer(daily.coins,20) || typeof daily.coinsClaimed !== 'boolean') || daily.coinsClaimed && daily.coins !== 20) throw Error('invalid_economy_response');
  if (result.run_reward !== undefined) {
    const receipt = result.run_reward;
    if (!receipt || !value.runRewardsReady || result.outcome !== 'finished' || !result.run_id || !integer(receipt.collected,MAX_COURSE_COINS) || receipt.bonus !== 10 || !integer(receipt.coins,10+MAX_COURSE_COINS) || receipt.coins > receipt.collected + receipt.bonus) throw Error('invalid_economy_response');
  }
  if(value.petHouseShopReady!==undefined&&(value.petHouseShopReady!==true||!value.homeShopReady))throw Error('invalid_economy_response');
  if(value.homeFloorShopReady!==undefined&&(value.homeFloorShopReady!==true||!value.homeShopReady))throw Error('invalid_economy_response');
  if(value.cherrySkyReady!==undefined&&(value.cherrySkyReady!==true||!value.homeBackgroundShopReady))throw Error('invalid_economy_response');
  if (value.homeBackgroundShopReady !== undefined && (value.homeBackgroundShopReady !== true || !value.homeShopReady)) throw Error('invalid_economy_response');
  if((value.snacksReady!==undefined&&value.snacksReady!==true)||(value.snacksReady===true&&!integer(value.snacks,99))||(value.snacks!==undefined&&!integer(value.snacks,99))||(result.petId!==undefined&&!isPetId(result.petId)))throw Error('invalid_economy_response');
  if (value.homeShopReady === true || value.homeItems !== undefined) {
    if (!value.homeItems || Array.isArray(value.homeItems) || typeof value.homeItems !== 'object' || Object.keys(value.homeItems).length > homeOptions.Furniture+homeOptions.Etc+homeOptions.Background+homeOptions.Floor-2) throw Error('invalid_economy_response');
    for (const [key, count] of Object.entries(value.homeItems)) {
      const [tab, index] = key.split(':');
      if (!validHomeProduct(tab, Number(index)) || key !== homeKey(tab, Number(index)) || !integer(count, homeStockLimit(tab)) || count < homeInitialStock(tab, Number(index))) throw Error('invalid_economy_response');
    }
  }
  return structuredClone(result);
}
