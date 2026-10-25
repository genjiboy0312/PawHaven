import type {SupabaseClient} from '@supabase/supabase-js';
import {normalizeSnapshot} from '../account/AccountStorage';
import {HomeState,HOME_STORAGE_KEY} from '../home/HomeState';
import {HOME_MAX_STOCK} from '../home/HomeCatalog';
export function parseFriendHome(value:unknown,target:string){
 const v=value as {id?:string;nickname?:string;character?:unknown;home?:unknown};
 if(!v||v.id!==target||!v.nickname||!/^[A-Za-z0-9가-힣_]{2,16}$/.test(v.nickname))throw Error('home_unavailable');
 const saved=normalizeSnapshot({version:1,character:v.character,home:v.home,presets:[]});
 // An isolated, non-persistent view. Never apply a friend's snapshot to AccountStorage.
 const home=new HomeState({getItem:key=>key===HOME_STORAGE_KEY?JSON.stringify(saved.home):null,setItem(){}},()=>HOME_MAX_STOCK);
 return {id:target,nickname:v.nickname,character:saved.character,home};
}
export async function readFriendHome(client:SupabaseClient,owner:string,target:string,signal:AbortSignal){
 const request=new AbortController(),cancel=()=>request.abort();signal.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(cancel,12000);
 try{
  const {data,error}=await client.auth.getSession();if(error)throw error;
  if(signal.aborted||request.signal.aborted||data.session?.user.id!==owner)throw Error('account_changed');
  const result=await client.rpc('visit_friend_home',{p_target:target}).setHeader('Authorization','Bearer '+data.session.access_token).abortSignal(request.signal);
  if(result.error)throw result.error;if(request.signal.aborted||signal.aborted)throw Error('account_changed');
  return parseFriendHome(result.data,target);
 }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
