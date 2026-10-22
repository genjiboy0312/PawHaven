import { bindAria, onLanguageChange, t, type TextKey } from '../settings/i18n';
import { COURSES, type CourseId } from '../game/CourseCatalog';
import type { RoomClient, Room } from '../multiplayer/RoomClient';
import type { AnimalConfig } from '../animals/AnimalConfig';
import { paintPetPortrait } from './PetPortrait';
import { raceResults } from './RaceResults';
import { RoomInviteButton } from './RoomInviteButton';
type Page='mode'|'single'|'multi'|'create';
/** Reuses the existing settings overlay and commerce controls. No fake rooms/players. */
export class PlayMenuPopup {
  private overlay?:HTMLElement; private content?:HTMLElement; private title?:HTMLElement;
  private panel?:HTMLElement;private closeButton?:HTMLButtonElement;
  private page:Page='mode'; private busy=false; private launching=false;
  private abort?:AbortController; private unsubscribe?:()=>void; private localeOff?:()=>void;
  private blocked:{element:HTMLElement;inert:boolean}[]=[]; private previousFocus?:HTMLElement;
  private name='';private map:CourseId='garden';
  private singleMap:CourseId='garden';
  private signature='';
  private notice?:TextKey;
  private inviteButton?:RoomInviteButton;
  private previousRoom?:Room;
  private roomEvent?:{key:TextKey;name:string;until:number};
  private portraits:{element:HTMLElement;config:AnimalConfig;thumbnail:string}[]=[];
  private portraitTimer?:ReturnType<typeof setInterval>;
  private mapPicker?:HTMLElement;private mapPickerAbort?:AbortController;
  private pickerSingle=false;
  private pickerBlocked?:{element:HTMLElement;inert:boolean};private pickerFocus?:HTMLElement;
  constructor(private readonly pause:(value:boolean)=>void,private readonly options:{
    rooms?:RoomClient;single:(map:CourseId)=>Promise<boolean>;race:(room:Room,client:RoomClient)=>void;
    login:()=>void;dismiss:(keep:boolean)=>void;
    pets?:{config:AnimalConfig;thumbnail:string}[];
    nickname?:()=>string|null|undefined;
    best?:(map:CourseId)=>number|null;
    invitation?:{id:string;dismiss:()=>void};
    inviteHref?:string;
  }){}
  open(page:Page='mode'){
    if(this.overlay)return;this.page=page;
    const host=document.querySelector<HTMLElement>('#app');if(!host)return;
    this.abort=new AbortController();this.previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:undefined;
    this.blocked=Array.from(host.children).filter((e):e is HTMLElement=>e instanceof HTMLElement).map(element=>({element,inert:element.inert}));
    this.blocked.forEach(b=>{b.element.inert=true;});this.pause(true);
    const overlay=document.createElement('div');overlay.className='settings-overlay';this.overlay=overlay;
    const panel=document.createElement('section');this.panel=panel;panel.className='settings-panel play-menu-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');bindAria(panel,'play');
    this.title=document.createElement('h2');const close=this.button('close',()=>{if(this.page==='single')this.backToModes();else void this.exit();});this.closeButton=close;close.className='settings-close';close.textContent='×';bindAria(close,'close');
    this.content=document.createElement('div');this.content.className='settings-content play-menu-content';panel.append(this.title,close,this.content);overlay.append(panel);host.append(overlay);
    panel.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();if(this.page==='single')this.backToModes();else void this.exit();}
      if(event.key!=='Tab')return;
      const controls=Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not([hidden])'));
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
    },{signal:this.abort.signal});
    this.localeOff=onLanguageChange(()=>{this.closeMapPicker();this.render();});this.unsubscribe=this.options.rooms?.subscribe(()=>this.changed());
    if(page==='multi')this.options.rooms?.start();this.render();close.focus();
  }
  private button(key:TextKey,action:()=>void){const b=document.createElement('button');b.type='button';b.className='commerce-primary';b.textContent=t(key);b.addEventListener('click',action);return b;}
  private backToModes(){if(this.busy)return;this.page='mode';this.notice=undefined;this.render();this.content?.querySelectorAll<HTMLElement>('button:not(:disabled)')[0]?.focus();}
  private text(value:string){const p=document.createElement('p');p.textContent=value;return p;}
  private async action(run:()=>Promise<unknown>){if(this.busy)return;this.busy=true;this.render();try{await run();}catch{this.notice='multiOffline';}finally{this.busy=false;this.changed();}}
  private changed(){
    const client=this.options.rooms,room=client?.room;
    if(room&&room.id===this.options.invitation?.id)this.clearInvitation();
    const previous=this.previousRoom;
    if(room&&previous?.id===room.id){
      const left=previous.members.find(member=>!room.members.some(next=>next.id===member.id));
      const joined=room.members.find(member=>!previous.members.some(old=>old.id===member.id));
      const host=room.members.find(member=>member.id===room.host);
      if(previous.host!==room.host&&host)this.roomEvent={key:'roomHostChanged',name:host.name,until:Date.now()+6000};
      else if(left||joined)this.roomEvent={key:left?'roomMemberLeft':'roomMemberJoined',name:(left??joined)!.name,until:Date.now()+6000};
    }else this.roomEvent=undefined;
    this.previousRoom=room??undefined;
    if(this.page==='multi'&&room&&!client?.reconnecting&&!client?.error&&client?.notice!=='round'&&['countdown','playing'].includes(room.phase)&&!this.launching){
      this.launching=true;this.options.race(room,client!);this.close(true);return;
    }
    if(this.page==='create'&&room)this.page='multi';
    if(this.page==='create'&&!room&&!client?.error)return;
    if(this.roomEvent&&this.roomEvent.until<Date.now())this.roomEvent=undefined;
    const signature=this.renderSignature();
    if(signature!==this.signature)this.render();
  }
  private renderSignature(){const client=this.options.rooms;return JSON.stringify([this.page,this.busy,client?.snapshot.room,client?.snapshot.rooms,client?.listed,client?.busy,client?.error,client?.rejection,client?.reconnecting,client?.notice,this.roomEvent,this.options.invitation?.id]);}
  private clearInvitation(){this.options.invitation?.dismiss();this.options.invitation=undefined;}
  private cancelInvitation(){const button=this.button('roomInviteDismiss',()=>{this.clearInvitation();this.render();});button.setAttribute('data-recovery-control','true');return button;}
  private invitationCard(){
    const card=document.createElement('section');card.className='daily-quest room-invitation';
    const client=this.options.rooms,id=this.options.invitation!.id,item=client?.snapshot.rooms.find(room=>room.id===id);
    const title=document.createElement('h3');title.textContent=t('roomInvited');card.append(title);
    if(!client){card.append(this.text(t('multiLogin')),this.button('login',()=>{this.close(false);this.options.login();}));}
    else if(!client.listed||client.reconnecting||client.error)card.append(this.text(t('roomInviteChecking')));
    else if(!item)card.append(this.text(t('multiRoomClosed')));
    else{
      const name=document.createElement('strong');name.textContent=item.name;
      card.append(name,this.text(`${t(COURSES[item.map].title)} · ${item.count} / 4`));
      const join=this.button('joinRoom',()=>{void this.action(async()=>{await client.command('join',{},id);});});join.classList.add('room-invite-join');
      join.disabled=item.count>=4||item.phase!=='waiting';card.append(join);
      if(join.disabled)card.append(this.text(t('multiRoomFull')));
    }
    card.append(this.cancelInvitation());return card;
  }
  private stopPortraits(){clearInterval(this.portraitTimer);this.portraitTimer=undefined;this.portraits=[];}
  private animatePortraits(){
    if(!this.portraits.length)return;
    const draw=()=>{
      if(document.hidden)return;
      const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      for(const {element,config,thumbnail}of this.portraits){
        const idle=config.animations.idle;if(!idle?.frames.length)continue;
        paintPetPortrait(element,config,thumbnail,10,reduced?0:Math.floor(performance.now()/1000*idle.fps));
      }
    };
    draw();this.portraitTimer=setInterval(draw,125);
  }
  private maps(select:(map:CourseId)=>void,current?:CourseId){
    const grid=document.createElement('div');grid.className='mode-cards';
    for(const [id,map]of Object.entries(COURSES)){
      if(!map.multiplayer)continue;
      const b=this.button(map.title,()=>select(id as CourseId));b.className='commerce-primary map-card map-'+id;
      b.setAttribute('data-map',id);
      b.setAttribute('aria-pressed',String(id===current));b.append(this.text(map.seconds));b.disabled=this.busy;grid.append(b);
    }return grid;
  }
  private singleCard(id:CourseId,select?:()=>void){
    const map=COURSES[id],card=select?this.button(map.title,select):document.createElement('section');
    card.className='map-card single-map-card map-'+id+' single-map-'+id+(select?' commerce-primary':' single-map-summary');card.setAttribute('data-map',id);
    if(select)card.setAttribute('aria-pressed',String(this.singleMap===id));
    const name=document.createElement('strong');name.textContent=t(map.title);
    const description=this.text(t(map.description));description.className='single-map-description';
    const duration=this.text(t('singleExpected').replace('{time}',map.seconds));
    const best=this.options.best?.(id),record=this.text(best?`${t('singleBest')} ${(best/1000).toFixed(2)}s`:t('singleChallenge'));record.className='single-map-best';
    if(select)card.append(description,duration,record);
    else{
      const info=document.createElement('div');info.className='single-map-info';
      const heading=document.createElement('div');heading.className='single-map-heading';heading.append(name);
      const stats=document.createElement('div');stats.className='single-map-stats';stats.append(duration,record);
      info.append(heading,description,stats);card.append(info);
    }return card;
  }
  private singleMaps(){
    const change=this.button('chooseMap',()=>this.openMapPicker());change.classList.add('single-map-change');change.disabled=this.busy;
    change.textContent=t('chooseMap')+' ('+Object.keys(COURSES).length+')';change.setAttribute('aria-haspopup','dialog');change.setAttribute('aria-expanded','false');
    const actions=document.createElement('div');actions.className='single-map-actions';
    const play=this.button('play',()=>{const map=this.singleMap;void this.action(async()=>{if(await this.options.single(map))this.close(false);else this.notice='runRetryFailed';});});
    play.classList.add('single-map-play');play.disabled=this.busy;
    const card=this.singleCard(this.singleMap);card.querySelector('.single-map-heading')?.append(change);
    actions.append(play,this.text(t('singleLocalRecords')));return[card,actions];
  }
  private openMapPicker(){
    const client=this.options.rooms,room=client?.room;
    const single=this.page==='single';
    if(!this.overlay||this.mapPicker||this.busy||(!single&&(!room||room.host!==client?.owner||room.phase!=='waiting'||client.reconnecting||client.error)))return;
    this.pickerSingle=single;this.content?.querySelector('.single-map-change')?.setAttribute('aria-expanded','true');
    this.pickerFocus=this.content?.querySelector<HTMLElement>(single?'.single-map-change':'.room-change-map')??(document.activeElement instanceof HTMLElement?document.activeElement:undefined);
    const parent=this.overlay.querySelector<HTMLElement>('.play-menu-panel');
    if(parent){this.pickerBlocked={element:parent,inert:parent.inert};parent.inert=true;}
    this.mapPickerAbort=new AbortController();const overlay=document.createElement('div');overlay.className='room-map-backdrop';
    const panel=document.createElement('section');panel.className='settings-panel room-map-picker'+(single?' single-map-picker':'');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');bindAria(panel,'chooseMap');
    const heading=document.createElement('h2');heading.textContent=t('chooseMap');
    const close=this.button('close',()=>this.closeMapPicker());close.className='settings-close';close.textContent='×';bindAria(close,'close');
    let choices:HTMLElement;
    if(single){
      choices=document.createElement('div');
      for(const id of Object.keys(COURSES) as CourseId[])choices.append(this.singleCard(id,()=>{
        this.singleMap=id;this.notice=undefined;this.closeMapPicker();this.render();this.content?.querySelector<HTMLElement>('.single-map-change')?.focus();
      }));
    }else choices=this.maps(map=>{void client!.command('map',{map}).then(ok=>{if(ok)this.closeMapPicker();else this.refreshMapPicker();});},room!.map);
    choices.className='mode-cards room-map-choices'+(single?' single-map-choices':'');
    const status=this.text('');status.className='room-map-status';status.setAttribute('role','status');panel.append(heading,close,choices,status);overlay.append(panel);this.overlay.append(overlay);this.mapPicker=overlay;
    panel.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closeMapPicker();return;}
      if(event.key!=='Tab')return;
      const buttons=Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled)'));
      if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0]?.focus();}
    },{signal:this.mapPickerAbort.signal});this.refreshMapPicker();close.focus();
  }
  private refreshMapPicker(){
    if(!this.mapPicker)return;const client=this.options.rooms,room=client?.room;
    if(this.pickerSingle){if(this.page!=='single'||this.busy)this.closeMapPicker();return;}
    if(!room||room.host!==client?.owner||room.phase!=='waiting'){this.closeMapPicker();return;}
    for(const button of Array.from(this.mapPicker.querySelectorAll<HTMLButtonElement>('button'))){const map=button.getAttribute('data-map');if(map){button.disabled=client.busy||client.reconnecting||!!client.error;button.setAttribute('aria-pressed',String(map===room.map));}}
    const status=this.mapPicker.querySelector<HTMLElement>('.room-map-status');if(status)status.textContent=client.error?t('multiRejected'):client.reconnecting?t('multiReconnecting'):'';
  }
  private closeMapPicker(){
    if(!this.mapPicker)return;this.mapPickerAbort?.abort();this.mapPicker.remove();this.mapPicker=undefined;
    this.pickerSingle=false;this.content?.querySelector('.single-map-change')?.setAttribute('aria-expanded','false');
    if(this.pickerBlocked){this.pickerBlocked.element.inert=this.pickerBlocked.inert;this.pickerBlocked=undefined;}
    if(this.pickerFocus?.isConnected)this.pickerFocus.focus();else this.content?.querySelector<HTMLElement>(this.page==='single'?'.single-map-change':'.room-change-map')?.focus();
  }
  private render(){
    if(!this.content||!this.title)return;
    this.signature=this.renderSignature();this.stopPortraits();this.inviteButton?.destroy();this.inviteButton=undefined;
    const root=this.content;const oldPage=root.querySelector<HTMLElement>('.room-pages');const oldScroll=oldPage?.scrollLeft??0;
    this.panel?.setAttribute('data-page',this.page);root.classList.toggle('single-menu-content',this.page==='single');
    if(this.closeButton){this.closeButton.className='settings-close'+(this.page==='single'?' play-menu-back':'');this.closeButton.textContent=this.page==='single'?'←':'×';bindAria(this.closeButton,this.page==='single'?'back':'close');this.closeButton.disabled=this.page==='single'&&this.busy;}
    root.replaceChildren();const client=this.options.rooms,room=client?.room;
    this.title.textContent=t(this.page==='mode'?'chooseMode':this.page==='single'?'singleplayer':this.page==='create'?'createRoom':room?'waitingRoom':'multiplayer');
    if(this.page==='mode'){
      const cards=document.createElement('div');cards.className='mode-cards';
      cards.append(this.button('singleplayer',()=>{this.page='single';this.render();this.closeButton?.focus();}),this.button('multiplayer',()=>{this.page='multi';client?.start();this.changed();}));root.append(cards);
    }else if(this.page==='single')root.append(...this.singleMaps());
    else if(this.page==='multi'&&this.options.invitation&&!room)root.append(this.invitationCard());
    else if(!client){root.append(this.text(t('multiLogin')),this.button('login',()=>{this.close(false);this.options.login();}));}
    else if(this.page==='create'){
      const defaultName=()=>`${this.options.nickname?.()?.trim()||'Player '+client.owner.slice(0,4)}님의 방`;
      const input=document.createElement('input');input.maxLength=24;input.value=this.name;input.placeholder=defaultName();bindAria(input,'roomName');
      input.addEventListener('input',()=>{this.name=input.value;});root.append(input,this.maps(map=>{this.map=map;this.render();},this.map),this.button('createRoom',()=>{void this.action(async()=>{if(await client.command('create',{name:this.name.trim()||defaultName(),map:this.map}))this.page='multi';});}));
    }else if(room){
      root.append(this.text(room.name+' · '+t(COURSES[room.map].title)));
      if(room.phase==='waiting'){
        const href=this.options.inviteHref??window.location?.href;
        if(href){this.inviteButton=new RoomInviteButton(room.id,href);root.append(this.inviteButton.element);}
      }
      if(this.options.invitation){root.append(this.text(t('roomInviteLeaveFirst')),this.cancelInvitation());}
      if(room.phase==='results'){
        root.append(raceResults(room.racers,room.members,client.owner,this.options.pets?.map(pet=>pet.config)??[],true),this.text(t('raceTogether')));
        const mine=room.members.find(m=>m.id===client.owner);
        root.append(this.button('returnRoom',()=>{void client.command('return');}));
        if(mine?.returned)root.append(this.text(t('waitingOthers')));
      }else{
        const preview=document.createElement('div');preview.className='room-map-preview map-card map-'+room.map;
        preview.append(this.text(t(COURSES[room.map].title)+' · '+COURSES[room.map].seconds));
        if(room.host===client.owner){const change=this.button('chooseMap',()=>this.openMapPicker());change.className+=' room-change-map';change.disabled=room.phase!=='waiting';preview.append(change);}root.append(preview);
        const host=room.host===client.owner;const slots=document.createElement('div');slots.className='room-slots';
        for(let i=0;i<4;i++){
          const member=room.members[i],slot=document.createElement('div');slot.className='daily-quest room-player';
          if(member){
            const isHost=member.id===room.host;slot.setAttribute('data-ready',String(member.ready||isHost));
            const art=document.createElement('div');art.className='room-pet-stage';
            const portrait=document.createElement('span');portrait.className='room-pet';portrait.setAttribute('aria-hidden','true');art.append(portrait);
            const pet=this.options.pets?.find(pet=>pet.config.id===member.look.petId);if(pet)this.portraits.push({element:portrait,...pet});
            const details=document.createElement('div');details.className='room-player-info';
            const name=document.createElement('strong');name.textContent=member.name;
            const status=this.text((isHost?'♛ ':member.ready?'✓ ':'')+t(isHost?'roomHost':member.ready?'ready':'notReady'));details.append(name,status);
            slot.append(art,details);
          }else{slot.setAttribute('data-empty','true');slot.append(this.text(t('emptySeat')));}slots.append(slot);
        }
        root.append(slots);
        const allReady=room.members.length>=2&&room.members.every(member=>member.id===room.host||member.ready);
        const hint=this.text(t(room.members.length<2?'roomNeedPlayer':allReady?(host?'roomCanStart':'roomWaitingHost'):'roomNeedReady'));
        hint.className='room-start-hint';hint.setAttribute('role','status');root.append(hint);
        const mine=room.members.find(m=>m.id===client.owner);
        const start=this.button(host?'start':mine?.ready?'cancelReady':'ready',()=>{void client.command(host?'start':'ready',host?{}:{ready:!mine?.ready});});
        start.disabled=client.busy||(host&&(room.members.length<2||room.members.some(m=>m.id!==room.host&&!m.ready)))||room.phase!=='waiting';root.append(start);
      }
      root.append(this.button('leaveRoom',()=>{void this.action(async()=>{await client.command('leave');});}));
      if(client.notice==='round'&&['countdown','playing'].includes(room.phase))root.append(this.button('raceResume',()=>client.clearNotice()));
      if(this.roomEvent){const event=this.text(t(this.roomEvent.key).replace('{name}',this.roomEvent.name));event.className='room-event';event.setAttribute('role','status');root.append(event);}
    }else{
      root.append(this.button('createRoom',()=>{this.page='create';this.render();}));
      const pager=document.createElement('div');pager.className='room-pages';
      const rooms=client.snapshot.rooms;
      for(let offset=0;offset<rooms.length;offset+=4){
        const page=document.createElement('div');page.className='room-page';
        for(const item of rooms.slice(offset,offset+4)){
          const card=this.button('joinRoom',()=>{void this.action(()=>client.command('join',{},item.id));});card.className='commerce-primary room-card map-'+item.map;
          card.textContent=item.name;card.append(this.text(t(COURSES[item.map].title)),this.text(`${item.count} / 4 · ${t(item.phase==='waiting'?'roomWaiting':'roomPlaying')}`));
          card.disabled=item.phase!=='waiting'||item.count>=4||client.busy||this.busy;page.append(card);
        }pager.append(page);
      }
      if(!rooms.length)root.append(this.text(t('noRooms')));root.append(pager);pager.scrollLeft=oldScroll;
      const pages=Math.max(1,Math.ceil(rooms.length/4)),navigation=document.createElement('div');navigation.className='room-navigation';
      const status=this.text('');const update=()=>{status.textContent=`${Math.min(pages,1+Math.round(pager.scrollLeft/Math.max(1,pager.clientWidth)))} / ${pages}`;};
      navigation.append(this.button('previous',()=>pager.scrollBy({left:-pager.clientWidth,behavior:'smooth'})),status,this.button('next',()=>pager.scrollBy({left:pager.clientWidth,behavior:'smooth'})));
      pager.addEventListener('scroll',update);update();root.append(navigation);
    }
    if(client?.error||client?.reconnecting){
      const key:TextKey=client.rejection==='already_in_room'?'multiAlreadyJoined':client.rejection==='room_closed'?'multiRoomClosed':client.rejection==='room_unavailable'?'multiRoomFull':client.rejection==='auth'?'multiAuthRetry':client.error==='setup'?'multiSetup':client.error==='rejected'?'multiRejected':'multiReconnecting';
      const p=this.text(t(key));p.setAttribute('role','status');const retry=this.button('economyRetry',()=>client.reconnect());retry.setAttribute('data-recovery-control','true');root.append(p,retry);
    }
    else if(client?.notice){const p=this.text(t(client.notice==='removed'?'multiRemoved':client.notice==='round'?'multiRoundChanged':'multiRestored'));p.setAttribute('role','status');root.append(p);}
    if(this.notice)root.append(this.text(t(this.notice)));
    if(this.page!=='mode'&&this.page!=='single'&&!room){const back=this.button('back',()=>{this.page=this.page==='create'?'multi':'mode';this.render();});back.setAttribute('data-recovery-control','true');root.append(back);}
    if(this.busy||client?.busy)for(const b of Array.from(root.querySelectorAll('button')))b.disabled=true;
    if((this.page==='multi'||this.page==='create')&&(client?.error||client?.reconnecting))for(const b of Array.from(root.querySelectorAll('button')))if(b.getAttribute('data-recovery-control')!=='true')b.disabled=true;
    this.animatePortraits();
    this.refreshMapPicker();
  }
  private async exit(){if(this.busy||this.options.rooms?.busy)return;if(this.options.rooms?.room&&!this.options.rooms.error&&!this.options.rooms.reconnecting&&!await this.options.rooms.command('leave'))return;this.close(false);}
  close(keep=false){
    if(!this.overlay)return;this.closeMapPicker();this.stopPortraits();this.inviteButton?.destroy();this.inviteButton=undefined;this.unsubscribe?.();this.localeOff?.();this.abort?.abort();this.overlay.remove();this.overlay=undefined;this.content=undefined;
    this.blocked.forEach(b=>{b.element.inert=b.inert;});this.blocked=[];this.pause(false);
    if(this.previousFocus?.isConnected)this.previousFocus.focus();this.options.dismiss(keep);
  }
  destroy(){this.close(false);}
}
