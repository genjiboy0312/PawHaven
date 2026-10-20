import type { SupabaseClient } from '@supabase/supabase-js';
import type { Room, Pose } from './RoomClient';
export interface StreamPose { id:string;pose:Pose;at:number;source?:'direct';session?:string }
export type RoomStream=(room:Room,receive:(value:unknown)=>void,status:(connected:boolean)=>void,pose?:()=>Pose|undefined,fastStatus?:(ready:boolean)=>void)=>()=>void;

/** Database fallback plus actor-specific channels: RLS permits sending only as oneself. */
export function roomStream(client:SupabaseClient,owner:string):RoomStream{
  return(room,receive,status,pose,fastStatus)=>{
    let closed=false,timer:ReturnType<typeof setInterval>|undefined;
    const channels:ReturnType<SupabaseClient['channel']>[]=[],ready=new Set<string>();
    void(async()=>{
      try{
        const session=await client.auth.getSession();if(closed)return;
        if(session.error||session.data.session?.user.id!==owner)throw Error('owner_changed');
        await client.realtime.setAuth();if(closed)return;
        const topic=`paw-room:${room.id}:${room.round}`;
        const channel=client.channel(topic,{config:{private:true}})
          .on('broadcast',{event:'pose'},event=>{if(!closed)receive(event.payload);})
          .subscribe(value=>{if(!closed)status(value==='SUBSCRIBED');});
        channels.push(channel);
        if(pose){
          const members=room.members,session=globalThis.crypto?.randomUUID?.()??String(Math.random());
          let sender:ReturnType<SupabaseClient['channel']>|undefined,last='',sentAt=0;
          for(const member of members){
            const actor=client.channel(topic+':'+member.id,{config:{private:true,broadcast:{ack:false,self:false}}})
              .on('broadcast',{event:'motion'},event=>{
                if(closed||member.id===owner)return;
                const value=event.payload;
                receive({id:member.id,pose:value?.pose,at:value?.at,session:value?.session,source:'direct'});
              }).subscribe(value=>{
                if(closed)return;if(value==='SUBSCRIBED')ready.add(member.id);else ready.delete(member.id);
                fastStatus?.(ready.size===members.length&&ready.has(owner));
              });
            channels.push(actor);if(member.id===owner)sender=actor;
          }
          timer=setInterval(()=>{
            if(closed||ready.size!==members.length||!ready.has(owner)||!sender)return;
            const value=pose();if(!value)return;const now=performance.now(),encoded=JSON.stringify(value);
            if(encoded===last&&now-sentAt<300)return;last=encoded;sentAt=now;
            void sender.send({type:'broadcast',event:'motion',payload:{pose:value,at:now,session}})
              .then(result=>{if(!closed)fastStatus?.(result==='ok'&&ready.size===members.length&&ready.has(owner));}).catch(()=>{if(!closed)fastStatus?.(false);});
          },members.length<=2?50:100);
        }
      }catch{if(!closed){status(false);fastStatus?.(false);}}
    })();
    return()=>{closed=true;clearInterval(timer);for(const channel of channels)void client.removeChannel(channel).catch(()=>{});};
  };
}
