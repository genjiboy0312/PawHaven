import type { SupabaseClient } from '@supabase/supabase-js';
import type { Room, Pose } from './RoomClient';
export interface StreamPose { id:string;pose:Pose;at:number }
export type RoomStream=(room:Room,receive:(value:unknown)=>void,status:(connected:boolean)=>void)=>()=>void;

/** Receive-only, private per-round channel. Only the database broadcasts poses. */
export function roomStream(client:SupabaseClient,owner:string):RoomStream{
  return(room,receive,status)=>{
    let closed=false,channel:ReturnType<SupabaseClient['channel']>|undefined;
    void(async()=>{
      try{
        const session=await client.auth.getSession();if(closed)return;
        if(session.error||session.data.session?.user.id!==owner)throw Error('owner_changed');
        await client.realtime.setAuth();if(closed)return;
        channel=client.channel(`paw-room:${room.id}:${room.round}`,{config:{private:true}})
          .on('broadcast',{event:'pose'},event=>{if(!closed)receive(event.payload);})
          .subscribe(value=>{if(!closed)status(value==='SUBSCRIBED');});
      }catch{if(!closed)status(false);}
    })();
    return()=>{closed=true;if(channel)void client.removeChannel(channel).catch(()=>{});};
  };
}
