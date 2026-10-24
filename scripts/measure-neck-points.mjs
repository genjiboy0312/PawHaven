// Neck/chest landmarks hand-picked on an 8x8 grid over each actual frame's body crop.
// This is calibration data, independent of the head attachment used by hats.
import {readFile,writeFile} from 'node:fs/promises';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const marks={
 corgi:{idle:[[5.7,5.5],[5.7,5.55],[5.7,5.5],[5.8,5.5],[5.7,5.5],[5.8,5.55],[5.7,5.5],[5.75,5.5]],walk:[[6.15,5.5],[6.1,5.45],[6.1,5.5],[6.1,5.5],[6.15,5.5],[6.1,5.5],[6.1,5.5],[6.1,5.5]],run:[[6,5.45],[5.8,4.95],[6.1,5.25],[5.9,5.1]],jump:[[5.8,4.75],[6,4.75],[6.1,4.7],[6.3,5.8]],attack:[[5.85,5.5],[5.7,5.45],[5.7,5],[5.85,5.6]],skill:[[6.3,5.6],[6.2,6.3],[6.55,6.1],[5.95,5.65]],emote:[[5.55,5.3],[5.6,5.15],[5.7,5.4],[6.05,5.8],[5.55,5.25],[5.6,5.05],[5.55,5.3],[5.8,5.5]]},
 myeongrang:{idle:[[6.15,4.9],[6.15,4.9],[6.15,4.9],[6.15,4.9],[6.15,4.9],[6.15,4.9],[6.15,4.9],[6.15,4.9]],walk:[[6.35,4.8],[6.15,4.8],[6.1,4.8],[6,4.8]],run:[[6.4,5.25],[6.15,4.85],[6.3,5.4],[6.1,4.7]],jump:[[6.12,4.55],[6.53,5],[6.31,5.03],[6.35,5.9]],attack:[[6.25,4.82],[5.96,4.85],[5.16,5.5],[6.36,5.08]],skill:[[6.25,5.6],[6.1,5.5],[6.2,5.6],[5.95,5.6]],emote:[[6.1,5.15],[6.05,5.25],[6.1,5.25],[6.15,5.2]]}
};
const round=n=>Math.round(n*100)/100;
for(const pet of ['corgi','myeongrang']){
 const base='public/assets/characters/'+pet+'/',result={};
 let clips={};
 if(pet==='corgi'){
  const basic=await read(base+'frames.json'),clean=await read(base+'clean-frames.json'),play=await read(base+'playful-frames.json');
  for(const action of ['idle','walk','emote'])clips[action]={frames:action==='emote'?play.emote:basic[action],scale:action==='emote'?212/223:1};
  for(const [action,frames]of Object.entries(clean.actions))clips[action]={frames,scale:212/164};
 }else clips=(await read(base+'frames.json')).actions;
 for(const [action,points]of Object.entries(marks[pet])){
  const clip=clips[action];if(points.length!==clip.frames.length)throw Error('Frame mismatch: '+pet+'/'+action);
  result[action]=clip.frames.map((frame,i)=>{
   const b=frame.opaqueBounds??{left:0,top:0,right:frame.width,bottom:frame.height};
   const center=frame.center??frame.width/2,baseline=frame.baseline??frame.height;
   return {x:round(b.left+(b.right-b.left)*points[i][0]/8-center),y:round(b.top+(b.bottom-b.top)*points[i][1]/8-baseline),width:round((pet==='corgi'?20:22)/(.62*clip.scale)),rotation:0};
  });
 }
 result.fall=result.jump.slice(2,3);result.land=pet==='corgi'?result.jump.slice(3):result.jump.slice(3,4);
 const json=JSON.stringify(result,null,2)+'\n';await writeFile(base+'neck-anchors.json',json);await writeFile('Resources/Actions/'+pet+'-neck-anchors.json',json);
}
