import {RoomChatClient} from '../multiplayer/RoomChatClient';
import type {RoomMember} from '../multiplayer/RoomClient';
import {bindAria,bindText,onLanguageChange,t} from '../settings/i18n';
import {ChatHistory} from './ChatHistory';
import {KeyboardChatDock} from './KeyboardChatDock';
/** Persistent DOM: room ready/map refreshes never replace the input or keyboard dock. */
export class RoomChatPanel {
 readonly element=document.createElement('section');
 private readonly input=document.createElement('input');private readonly log=document.createElement('div');private readonly status=document.createElement('p');private readonly send=document.createElement('button');
 private readonly history:ChatHistory;private readonly dock:KeyboardChatDock;private readonly abort=new AbortController();private readonly off:()=>void;private readonly localeOff:()=>void;
 private readonly seen=new Set<string>();private members?:Map<string,string>;
 constructor(readonly roomId:string,private readonly client:RoomChatClient){
  this.element.className='park-chat room-chat';bindAria(this.element,'roomChat');
  this.log.className='park-chat-log';this.log.setAttribute('role','log');this.log.setAttribute('aria-live','polite');
  const history=document.createElement('div');history.className='park-chat-history';const latest=document.createElement('button');latest.type='button';latest.className='park-chat-latest';bindText(latest,'parkNewMessages');history.append(this.log,latest);this.history=new ChatHistory(this.log,latest);
  const form=document.createElement('form');this.input.maxLength=100;this.input.autocomplete='off';this.input.enterKeyHint='send';bindAria(this.input,'parkMessage');this.send.type='submit';this.send.className='commerce-primary';bindText(this.send,'parkSend');form.append(this.input,this.send);
  this.status.className='room-chat-status';this.status.setAttribute('role','status');this.element.append(history,form,this.status);this.dock=new KeyboardChatDock(this.element,this.input);
  this.input.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.isComposing)event.preventDefault();if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.input.blur();this.dock.reset();}},{signal:this.abort.signal});
  form.addEventListener('submit',event=>{event.preventDefault();const draft=this.input.value;void client.send(draft).then(ok=>{if(ok&&this.input.value===draft)this.input.value='';});},{signal:this.abort.signal});
  this.off=client.subscribe(()=>this.render());this.localeOff=onLanguageChange(()=>this.render());this.render();client.start();
 }
 private render(){
  const rows:HTMLElement[]=[];for(const message of this.client.messages){if(this.seen.has(message.id))continue;this.seen.add(message.id);const row=document.createElement('p');row.textContent=message.name+': '+message.text;rows.push(row);}
  this.history.append(rows,this.log.childElementCount===0);
  // Bound IDs as well as displayed history without allowing old polling rows to replay.
  if(this.seen.size>120){const current=new Set(this.client.messages.map(m=>m.id));for(const id of this.seen)if(!current.has(id))this.seen.delete(id);}
  this.send.disabled=this.client.sending||!this.client.loaded;this.input.readOnly=this.client.sending;
  this.status.textContent=this.client.error?t(this.client.error):'';this.status.hidden=!this.client.error;
 }
 syncMembers(members:RoomMember[]){
  const next=new Map(members.map(m=>[m.id,m.name])),rows:HTMLElement[]=[];
  if(this.members){for(const [id,name]of next)if(!this.members.has(id))rows.push(this.notice(t('roomMemberJoined').replace('{name}',name)));for(const [id,name]of this.members)if(!next.has(id))rows.push(this.notice(t('roomMemberLeft').replace('{name}',name)));}
  this.members=next;this.history.append(rows);
 }
 private notice(text:string){const row=document.createElement('p');row.className='room-chat-system';row.textContent=text;return row;}
 destroy(){this.off();this.localeOff();this.abort.abort();this.dock.destroy();this.history.destroy();this.client.destroy();this.element.remove();}
}
