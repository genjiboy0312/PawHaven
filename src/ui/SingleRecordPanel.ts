import type { SingleRecordSync } from '../account/SingleRecordSync';
import { bindText } from '../settings/i18n';
import { ConfirmPopup } from './ConfirmPopup';

export class SingleRecordPanel {
  private readonly element = document.createElement('section');
  private readonly status = document.createElement('p');
  private readonly retry = document.createElement('button');
  private readonly imported = document.createElement('button');
  private readonly abort = new AbortController();
  private readonly unsubscribe: () => void;
  private prompt?: ConfirmPopup;
  constructor(host: HTMLElement, private readonly sync: SingleRecordSync) {
    this.element.className = 'single-record-account';
    const heading = document.createElement('h3'); bindText(heading, 'singleRecordTitle');
    this.status.setAttribute('role','status');
    this.retry.type = this.imported.type = 'button'; bindText(this.retry,'singleRecordRetry'); bindText(this.imported,'singleRecordImport');
    this.retry.addEventListener('click',()=>{void sync.sync();},{signal:this.abort.signal});
    this.imported.addEventListener('click',()=>{
      if(this.prompt||sync.busy)return;
      const close=()=>{this.prompt?.destroy();this.prompt=undefined;};
      this.prompt=new ConfirmPopup(host.closest<HTMLElement>('.settings-panel')??host,'singleRecordImport','singleRecordImportNote','singleRecordImport',()=>{close();void sync.importGuest();},close);
    },{signal:this.abort.signal});
    this.element.append(heading,this.status,this.retry,this.imported);host.append(this.element);
    this.unsubscribe=sync.subscribe(()=>this.render());this.render();
  }
  private render():void {
    bindText(this.status, this.sync.status==='saved'?'singleCloudRecords':this.sync.status==='setup'?'singleRecordSetup':this.sync.status==='offline'?'singleRecordOffline':'singleRecordsPending');
    this.retry.disabled=this.imported.disabled=this.sync.busy;
  }
  destroy():void {this.unsubscribe();this.abort.abort();this.prompt?.destroy();this.element.remove();}
}
