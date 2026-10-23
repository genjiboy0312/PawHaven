/** Wait for the current cosmetic save, without letting a stalled cloud request hang admission. */
export async function prepareRoomAppearance(save:(()=>Promise<void>)|undefined,signal:AbortSignal,limit=4000):Promise<void>{
  if(!save||signal.aborted)return;
  let timer:ReturnType<typeof setTimeout>|undefined,release:()=>void=()=>{};
  const interrupted=new Promise<void>(resolve=>{release=resolve;timer=setTimeout(resolve,limit);signal.addEventListener('abort',release,{once:true});});
  try{await Promise.race([Promise.resolve().then(()=>signal.aborted?undefined:save()).catch(()=>{}),interrupted]);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',release);}
}
