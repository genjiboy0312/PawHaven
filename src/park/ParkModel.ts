import type { OutfitState } from '../animals/OutfitState';
export interface ParkMember { id:string;session:string;name:string;look?:{petId?:string;outfit?:OutfitState} }
export interface ParkMessage {id:number;user_id:string;name:string;message:string}
export interface ParkSnapshot {counts:number[];members?:ParkMember[];messages?:ParkMessage[]}
export interface ParkPose {x:number;height:number;direction:number;moving:boolean;seq:number}
export const PARK_CHANNELS=[1,2,3,4] as const;
/** Validate untrusted broadcast data before it reaches the scene graph. */
export function parkPose(value:unknown):ParkPose|undefined {
 const p=value as ParkPose;
 if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.height)||!Number.isSafeInteger(p.seq)||p.seq<0||typeof p.moving!=='boolean'||![-1,1].includes(p.direction))return;
 return {x:Math.max(65,Math.min(895,p.x)),height:Math.max(0,Math.min(160,p.height)),direction:p.direction,moving:p.moving,seq:p.seq};
}
export function parkStep(x:number,height:number,velocity:number,axis:number,dt:number){
 dt=Math.max(0,Math.min(.05,dt));
 return {x:Math.max(65,Math.min(895,x+axis*180*dt)),height:Math.max(0,height+velocity*dt),velocity:height+velocity*dt>0?velocity-1100*dt:0};
}
