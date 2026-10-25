import type { OutfitState } from '../animals/OutfitState';
export interface ParkMember { id:string;session:string;name:string;look?:{petId?:string;outfit?:OutfitState} }
export interface ParkMessage {id:number;user_id:string;name:string;message:string;recipient_id?:string|null;recipient_name?:string|null}
export interface ParkSnapshot {counts:number[];members?:ParkMember[];messages?:ParkMessage[]}
export interface ParkPose {x:number;y:number;height:number;direction:number;moving:boolean;seq:number}
export const PARK_CHANNELS=[1,2,3,4] as const;
export const PARK_WORLD={width:1800,height:1100,minX:80,maxX:1720,minY:600,maxY:880,spawnY:720} as const;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
/** Validate untrusted broadcast data before it reaches the scene graph. */
export function parkPose(value:unknown):ParkPose|undefined {
 const p=value as ParkPose;
 if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y??PARK_WORLD.spawnY)||!Number.isFinite(p.height)||!Number.isSafeInteger(p.seq)||p.seq<0||typeof p.moving!=='boolean'||![-1,1].includes(p.direction))return;
 return {x:clamp(p.x,PARK_WORLD.minX,PARK_WORLD.maxX),y:clamp(p.y??PARK_WORLD.spawnY,PARK_WORLD.minY,PARK_WORLD.maxY),height:clamp(p.height,0,160),direction:p.direction,moving:p.moving,seq:p.seq};
}
export function parkStep(x:number,y:number,height:number,velocity:number,axisX:number,axisY:number,dt:number){
 dt=Math.max(0,Math.min(.05,dt));
 const length=Math.max(1,Math.hypot(axisX,axisY));
 return {x:clamp(x+axisX/length*180*dt,PARK_WORLD.minX,PARK_WORLD.maxX),y:clamp(y+axisY/length*180*dt,PARK_WORLD.minY,PARK_WORLD.maxY),height:Math.max(0,height+velocity*dt),velocity:height+velocity*dt>0?velocity-1100*dt:0};
}
/** Follow the ground position, so jumping never pulls the camera toward the sky. */
export function parkCamera(x:number,y:number){return {x:clamp(x-480,0,PARK_WORLD.width-960),y:clamp(y-310,0,PARK_WORLD.height-540)};}
