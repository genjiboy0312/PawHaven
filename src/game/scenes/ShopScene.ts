import { petInfo, petThumbnail } from '../../animals/PetCatalog';
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import { OUTFIT_TABS, createOutfit, outfitReady, type OutfitTab } from '../../animals/OutfitState';
import { bindAria, bindText, onLanguageChange, t } from '../../settings/i18n';
import { itemPrice } from '../../shop/ShopState';
import type { CommerceState } from '../../shop/CommerceState';
import { commerceStatus } from '../../ui/CommerceStatus';
import { coinAmount } from '../../ui/CoinAmount';
import { itemIcon } from '../../ui/itemIcon';
import { passOffer } from '../../ui/PassOffer';
import { homeOptions, homePrice, homeStockLimit } from '../../home/HomeCatalog';
import { HOME_TABS, type HomeTab, type HomeState } from '../../home/HomeState';
import type { HomeTextures } from '../../home/LobbyMap';
import { HomeShopPreview } from '../../home/HomeShopPreview';
import { homeIcon, homeItemName } from '../../ui/homeIcon';
import { PurchasePopup } from '../../ui/PurchasePopup';
import { wearableItem } from '../../animals/Wearables';
import { speechSkinItem } from '../../animals/SpeechSkins';
import { Scene } from './Scene';
import type {PetChoice} from './CharacterScene';
import {paintPetPortrait} from '../../ui/PetPortrait';

const PURCHASE_LABELS = { owned: 'owned', purchased: 'shopPurchased', processing: 'economyWorking', loading: 'shopChecking', unavailable: 'shopUnavailable', available: 'buy', insufficient: 'notEnoughCoins', comingSoon: 'shopComingSoon' } as const;

export class ShopScene extends Scene {
  private readonly preview = new Container();
  private readonly animation: AnimalAnimationController;
  private readonly petPreview=new Container();
  private petAnimation?:AnimalAnimationController;
  private petChoice?:PetChoice;
  private petCategory:'petDogs'|'petCats'|'petDucks'='petDogs';
  private readonly pets:readonly PetChoice[];
  private readonly previewOutfit=createOutfit();
  private readonly previewNote=document.createElement('p');
  private readonly platform = new Graphics().ellipse(235, 395, 150, 28).fill('#d5ddc8');
  private readonly panel = document.createElement('section');
  private readonly balance = document.createElement('p');
  private readonly connection = document.createElement('div');
  private readonly content = document.createElement('div');
  private readonly tabs = document.createElement('nav');
  private readonly homePreview = document.createElement('div');
  private readonly lobbyPreview: HomeShopPreview;
  private readonly abort = new AbortController();
  private readonly unsubscribe: () => void;
  private readonly localeOff: () => void;
  private readonly purchase: PurchasePopup;
  private grid?: HTMLDivElement;
  private lastPurchase?: { category: OutfitTab; index: number };
  private category: OutfitTab = 'Hat';
  private selected = 1;
  private elapsed = 0;
  private reaction = 0;
  private homeCategory: HomeTab = 'Background';
  private homeSelected = 0;
  private tab: 'Pets' | 'Style' | 'Furniture' | 'Pass';
  constructor(private readonly config: AnimalConfig, private readonly state: CommerceState, onClose: () => void, private readonly onQuest: () => void, initial: 'Pets' | 'Style' | 'Pass' = 'Style', private readonly onEquip?: (category:OutfitTab,index:number)=>void, pets?:readonly PetChoice[], private readonly homeSource?: { state: HomeState; textures?: HomeTextures }) {
    super(); this.tab = initial;
    this.pets=pets?.length?pets:[{config,name:config.id,thumbnail:petThumbnail(config.id)}];
    this.petChoice=this.pets.find(pet=>pet.config.id===config.id)??this.pets[0];
    this.purchase = new PurchasePopup(state, this.panel);
    Object.assign(this.previewOutfit,config.wardrobe?.outfit);
    this.animation = new AnimalAnimationController({...config,wardrobe:config.wardrobe?{...config.wardrobe,outfit:this.previewOutfit}:undefined});
    this.addChild(new Graphics().rect(0, 0, 960, 540).fill('#edf0df'), this.platform, this.preview);
    this.lobbyPreview = new HomeShopPreview(homeSource?.textures); this.addChild(this.lobbyPreview);
    this.preview.position.set(235, 385); this.preview.scale.set(1.45);
    this.preview.addChild(this.animation.sprite, this.animation.welcomeMark,this.petPreview);
    this.panel.className = 'shop-screen';
    bindAria(this.panel, 'shop');
    const title = document.createElement('h2'); title.className = 'shop-title'; bindText(title, 'shop');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'character-close'; close.textContent = '×'; bindAria(close, 'close');
    close.addEventListener('click', onClose, { once: true, signal: this.abort.signal });
    this.balance.className = 'shop-balance';
    this.tabs.className = 'outfit-tabs shop-tabs';
    bindAria(this.tabs, 'shop');
    for (const tab of ['Pets', 'Style', 'Furniture', 'Pass'] as const) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, tab==='Pets'?'shopPets':tab==='Furniture'?'shopLobby':tab);
      button.setAttribute('data-shop-tab',tab);
      button.addEventListener('click', () => { this.tab = tab; this.grid = undefined; this.render(); }, { signal: this.abort.signal }); this.tabs.append(button);
    }
    this.connection.className = 'shop-connection';
    this.homePreview.className = 'shop-home-preview';
    this.previewNote.className='shop-preview-note';this.previewNote.setAttribute('role','status');
    this.panel.append(title, close, this.balance, this.tabs, this.content, this.connection, this.homePreview,this.previewNote);
    document.querySelector('#app')?.append(this.panel);
    this.unsubscribe = state.subscribe(() => this.render());
    this.localeOff = onLanguageChange(() => this.render()); this.render(); this.update(0);
  }
  private render(): void {
    Object.assign(this.previewOutfit,this.config.wardrobe?.outfit??createOutfit());
    const previewReady=this.tab==='Style'&&!!this.config.wardrobe&&outfitReady(this.category,this.selected);
    if(previewReady)this.previewOutfit[this.category]=this.selected;
    this.previewNote.hidden=!previewReady;
    this.previewNote.setAttribute('data-speech', String(previewReady && !!speechSkinItem(this.category,this.selected)));
    this.previewNote.textContent=t(this.config.wardrobe?.outfit[this.category]===this.selected?'shopEquipped':'shopPreviewOnly');
    this.update(0);
    const scroll = this.grid?.scrollTop ?? 0; this.grid = undefined;
    coinAmount(this.balance, this.state.entitlementsKnown ? this.state.coins : '—', { balance: true });
    this.balance.setAttribute('data-loading', String(!this.state.entitlementsKnown));
    this.connection.replaceChildren(); const connection = commerceStatus(this.state); if (connection) this.connection.append(connection);
    const showPet=this.tab==='Pets'&&this.pets.some(pet=>petInfo(pet.config.id)?.category===this.petCategory);
    this.preview.visible = this.platform.visible = this.tab === 'Style'||showPet;
    this.animation.sprite.visible=this.animation.welcomeMark.visible=this.tab==='Style';this.petPreview.visible=showPet;
    this.homePreview.hidden = this.tab !== 'Furniture';
    this.lobbyPreview.visible = this.tab === 'Furniture';
    Array.from(this.tabs.children).forEach((button, index) => button.setAttribute('aria-pressed', String(['Pets', 'Style', 'Furniture', 'Pass'][index] === this.tab)));
    this.content.replaceChildren(); this.content.className = this.tab === 'Pass' ? 'shop-pass' : 'shop-style';
    if(this.tab==='Pets'){this.renderPets();return;}
    if (this.tab === 'Furniture') { this.renderFurniture(scroll); return; }
    if (this.tab === 'Pass') {
      this.content.append(passOffer(this.state, this.onQuest)); return;
    }
    const categories = document.createElement('nav'); categories.className = 'outfit-tabs shop-categories';
    bindAria(categories, 'categories');
    for (const category of OUTFIT_TABS) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, category); button.setAttribute('aria-pressed', String(this.category === category));
      button.addEventListener('click', () => { this.category = category; this.selected = 1; this.grid = undefined; this.render(); }); categories.append(button);
    }
    const grid = document.createElement('div'); grid.className = 'outfit-inventory shop-grid';
    this.grid = grid; bindAria(grid, 'items');
    for (let index = 1; index <= 20; index++) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit-slot shop-slot';
      const owned = this.state.entitlementsKnown && this.state.owns(this.category, index);
      const ready = outfitReady(this.category, index);
      button.append(itemIcon(this.category, index));
      button.setAttribute('aria-label', `${this.itemName(this.category, index)} · ${!ready ? t('shopComingSoon') + (owned ? ' · ' + t('owned') : '') : owned ? t('owned') : `${itemPrice(index, this.category)} ${t('coins')}`}`);
      button.setAttribute('data-coming-soon', String(!ready));
      button.setAttribute('data-owned', String(owned));
      button.setAttribute('aria-pressed', String(this.selected === index));
      const price = document.createElement('span'); price.className = 'shop-price';
      if (!ready) price.textContent = t('shopComingSoon'); else if (owned) price.textContent = t('owned'); else coinAmount(price, itemPrice(index, this.category)); button.append(price);
      button.addEventListener('click', () => { this.selected = index; this.reaction = 1.5; this.render(); }); grid.append(button);
    }
    const footer = document.createElement('div'); footer.className = 'shop-purchase';
    const detail = document.createElement('span'); detail.className = 'shop-detail';
    const name = document.createElement('strong'); name.textContent = this.itemName(this.category, this.selected);
    const ready = outfitReady(this.category, this.selected);
    const owned = this.state.entitlementsKnown && this.state.owns(this.category, this.selected);
    const cost = document.createElement('span'); cost.className = 'shop-cost';
    if (ready && owned) cost.textContent=t('owned');
    else if (ready) coinAmount(cost, itemPrice(this.selected, this.category));
    else cost.textContent = t('shopComingSoon') + (this.state.entitlementsKnown && this.state.owns(this.category, this.selected) ? ' · ' + t('owned') : '');
    detail.append(name, cost);
    const buy = document.createElement('button'); buy.type = 'button'; buy.className = 'commerce-primary';
    const enough = this.state.coins >= itemPrice(this.selected, this.category);
    const serverReady = !speechSkinItem(this.category, this.selected) || this.state.speechSkinsReady;
    if (ready && !owned && !serverReady) cost.textContent = t('speechSkinSetup');
    const equipped=this.config.wardrobe?.outfit[this.category]===this.selected;
    const purchased = owned && this.lastPurchase?.category === this.category && this.lastPurchase.index === this.selected;
    const status = !ready ? 'comingSoon' : !this.state.entitlementsKnown ? this.state.connection === 'loading' ? 'loading' : 'unavailable'
      : owned ? purchased ? 'purchased' : 'owned' : this.state.busy || this.state.connection === 'loading' ? 'processing'
      : !this.state.ready || !serverReady ? 'unavailable' : enough ? 'available' : 'insufficient';
    buy.setAttribute('data-purchase-state', status);
    footer.setAttribute('data-purchase-state', status);
    buy.textContent = t(ready&&owned&&this.onEquip?(equipped?'shopEquipped':'shopEquip'):PURCHASE_LABELS[status]);
    buy.disabled = owned ? !ready||!this.config.wardrobe||!this.onEquip||equipped||this.state.busy : !ready||!enough||!this.state.ready||!serverReady;
    buy.addEventListener('click', () => {
      const category = this.category, index = this.selected;
      if(owned&&!this.destroyed&&!buy.disabled&&this.onEquip&&this.config.wardrobe&&this.config.wardrobe.outfit[category]!==index&&outfitReady(category,index)&&this.state.entitlementsKnown&&this.state.owns(category,index)){
        this.onEquip(category,index);this.reaction=1.5;this.render();return;
      }
      if (this.destroyed || buy.disabled || !outfitReady(category, index) || !this.state.ready || this.state.owns(category, index)) return;
      this.purchase.open({ name: () => this.itemName(category, index), icon: () => itemIcon(category, index), price: itemPrice(index, category),
        available: () => outfitReady(category, index) && (!speechSkinItem(category,index) || this.state.speechSkinsReady) && !this.state.owns(category, index), fulfilled: () => this.state.owns(category, index),
        buy: () => this.state.buy(category, index), purchased: () => this.purchased(category, index, 'purchased') });
    });
    footer.append(detail, buy); this.content.append(categories, grid, footer);
    grid.scrollTop = scroll;
  }
  private selectPet(pet:PetChoice):void{
    if(this.petAnimation&&this.petChoice?.config.id===pet.config.id)return;
    this.petPreview.removeChildren().forEach(child=>child.destroy({children:true}));this.petAnimation?.sleepMark.destroy();
    this.petChoice=pet;this.petAnimation=new AnimalAnimationController({...pet.config,wardrobe:pet.config.wardrobe?{...pet.config.wardrobe,outfit:createOutfit()}:undefined});
    this.petPreview.addChild(this.petAnimation.sprite,this.petAnimation.welcomeMark);this.elapsed=0;
  }
  private renderPets():void{
    const categories=document.createElement('nav');categories.className='outfit-tabs shop-categories';bindAria(categories,'categories');
    for(const category of ['petDogs','petCats','petDucks'] as const){const button=document.createElement('button');button.type='button';bindText(button,category);button.setAttribute('aria-pressed',String(this.petCategory===category));button.addEventListener('click',()=>{this.petCategory=category;this.render();});categories.append(button);}
    const grid=document.createElement('div');grid.className='outfit-inventory shop-grid shop-pets-grid';bindAria(grid,'Pets');this.grid=grid;
    const choices=this.pets.filter(pet=>petInfo(pet.config.id)?.category===this.petCategory);
    if(choices.length){
      if(!this.petChoice||!choices.includes(this.petChoice))this.selectPet(choices[0]!);else this.selectPet(this.petChoice);
      for(const pet of choices){
        const info=petInfo(pet.config.id)!,owned=this.state.ownsPet(pet.config.id);
        const button=document.createElement('button');button.type='button';button.className='outfit-slot shop-slot shop-pet-slot';button.setAttribute('data-pet',pet.config.id);button.setAttribute('data-owned',String(owned));button.setAttribute('aria-pressed',String(this.petChoice?.config.id===pet.config.id));
        const portrait=document.createElement('span');portrait.className='pet-portrait';paintPetPortrait(portrait,pet.config,pet.thumbnail,9);
        const name=document.createElement('span');name.className='pet-name';bindText(name,info.name);
        const price=document.createElement('span');price.className='shop-price';if(owned)bindText(price,'owned');else coinAmount(price,info.price);
        button.setAttribute('aria-label',t(info.name)+' · '+(owned?t('owned'):info.price+' '+t('coins')));button.append(portrait,name,price);
        button.addEventListener('click',()=>{this.selectPet(pet);this.reaction=1.5;this.render();});grid.append(button);
      }
    }else{const card=document.createElement('button');card.type='button';card.className='outfit-slot shop-slot shop-pet-placeholder';card.disabled=true;bindText(card,'shopComingSoon');grid.append(card);}
    const pet=choices.find(p=>p.config.id===this.petChoice?.config.id),info=pet&&petInfo(pet.config.id),owned=!!pet&&this.state.ownsPet(pet.config.id);
    const footer=document.createElement('div');footer.className='shop-purchase';const detail=document.createElement('span');detail.className='shop-detail';
    const name=document.createElement('strong');name.textContent=info?t(info.name):t(this.petCategory);
    const note=document.createElement('span');if(!info)bindText(note,'shopComingSoon');else if(owned)bindText(note,'shopPetOwnedNote');else if(!this.state.petShopReady)bindText(note,'shopPetSetup');else coinAmount(note,info.price);detail.append(name,note);
    const buy=document.createElement('button');buy.type='button';buy.className='commerce-primary';
    const enough=!!info&&this.state.coins>=info.price;
    buy.textContent=t(!info?'shopComingSoon':owned?'owned':!this.state.petShopReady?'shopUnavailable':!this.state.ready?'economyWorking':!enough?'notEnoughCoins':'buy');
    buy.disabled=!pet||owned||!this.state.petShopReady||!this.state.ready||!enough;
    buy.addEventListener('click',()=>{if(!pet||!info||buy.disabled||this.state.ownsPet(pet.config.id))return;
      this.purchase.open({name:()=>t(info.name),price:info.price,icon:()=>{const icon=document.createElement('span');icon.className='pet-portrait';paintPetPortrait(icon,pet.config,pet.thumbnail,14);return icon;},
        available:()=>this.state.petShopReady&&!this.state.ownsPet(pet.config.id),fulfilled:()=>this.state.ownsPet(pet.config.id),buy:()=>this.state.buyPet(pet.config.id),purchased:()=>{if(!this.destroyed){this.reaction=1.5;this.render();}}});
    });
    footer.append(detail,buy);this.content.append(categories,grid,footer);this.update(0);
  }
  private renderFurniture(scroll: number): void {
    const category = this.homeCategory, selected = this.homeSelected;
    this.lobbyPreview.showSelection(this.homeSource?.state, category, selected);
    this.homePreview.replaceChildren();
    const heading = document.createElement('p'); heading.textContent = homeItemName(category, selected); this.homePreview.append(heading);
    const hint = document.createElement('p'); hint.className = 'shop-home-preview-note'; bindText(hint, 'shopHomePreview'); this.homePreview.append(hint);
    const categories = document.createElement('nav'); categories.className = 'outfit-tabs shop-categories'; bindAria(categories, 'categories');
    for (const tab of HOME_TABS) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, tab); button.setAttribute('aria-pressed', String(category === tab));
      button.addEventListener('click', () => { this.homeCategory = tab; this.homeSelected = tab === 'Furniture' ? 5 : tab === 'Etc' ? 1 : 0; this.grid = undefined; this.render(); }); categories.append(button);
    }
    const grid = document.createElement('div'); grid.className = 'outfit-inventory shop-grid'; this.grid = grid; bindAria(grid, 'items');
    const reusable = category === 'Background' || category === 'Floor';
    if (reusable) grid.classList.add('shop-background-grid');
    for (let index = reusable ? 0 : 1; index < homeOptions[category]; index++) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit-slot shop-slot';
      const count = this.state.entitlementsKnown ? this.state.homeOwned(category, index) : '—';
      button.append(homeIcon(category, index)); button.setAttribute('aria-pressed', String(selected === index));
      button.setAttribute('aria-label', `${homeItemName(category, index)} · ${t('owned')}: ${count}`);
      const price = document.createElement('span'); price.className = 'shop-price';
      if (reusable && count === 1) price.textContent = t('owned'); else coinAmount(price, homePrice(category, index));
      const quantity = document.createElement('span'); quantity.className = 'home-count'; quantity.textContent = `×${count}`;
      button.append(price); if (!reusable) button.append(quantity);
      if (reusable) { const name = document.createElement('span'); name.className = 'shop-scenery-name'; name.textContent = homeItemName(category,index); button.append(name); }
      button.setAttribute('data-owned', String(count === 1 && reusable));
      button.addEventListener('click', () => { this.homeSelected = index; this.render(); }); grid.append(button);
    }
    const footer = document.createElement('div'); footer.className = 'shop-purchase';
    const detail = document.createElement('span'); detail.className = 'shop-detail';
    const name = document.createElement('strong'); name.textContent = homeItemName(category, selected);
    const cost = document.createElement('span'); cost.className = 'shop-cost'; cost.setAttribute('role', 'status');
    const known = this.state.entitlementsKnown, count = this.state.homeOwned(category, selected), price = homePrice(category, selected);
    const limit = homeStockLimit(category);
    const ready = this.state.homeShopReady && (category !== 'Background' || this.state.homeBackgroundShopReady && (selected!==4||this.state.cherrySkyReady)) && (category!=='Floor'||this.state.homeFloorShopReady);
    if (reusable && count === 1) cost.textContent = t('owned'); else coinAmount(cost, price, { suffix: reusable ? '' : ` · ${t('owned')}: ${known ? count : '—'}/${limit}` });
    detail.append(name, cost);
    const buy = document.createElement('button'); buy.type = 'button'; buy.className = 'commerce-primary';
    const status = reusable && count === 1 ? 'owned' : !known ? this.state.connection === 'loading' ? 'loading' : 'unavailable'
      : this.state.busy || this.state.connection === 'loading' ? 'processing'
      : !this.state.ready || !ready ? 'unavailable' : count >= limit ? 'limit' : this.state.coins < price ? 'insufficient' : 'available';
    buy.setAttribute('data-purchase-state', status); footer.setAttribute('data-purchase-state', status);
    buy.textContent = status === 'available' ? t(reusable ? 'buy' : 'buyOne') : status === 'limit' ? t('homeStockLimit') : t(PURCHASE_LABELS[status]);
    buy.disabled = status !== 'available';
    buy.addEventListener('click', () => {
      if (this.destroyed || buy.disabled || !this.state.ready || !ready) return;
      const owned = this.state.homeOwned(category, selected);
      this.purchase.open({ name: () => homeItemName(category, selected), icon: () => homeIcon(category, selected), price,
        available: () => this.state.homeShopReady && (category !== 'Background' || this.state.homeBackgroundShopReady && (selected!==4||this.state.cherrySkyReady)) && (category!=='Floor'||this.state.homeFloorShopReady) && this.state.homeOwned(category, selected) < limit,
        fulfilled: () => this.state.homeOwned(category, selected) > owned,
        buy: () => this.state.buyHome(category, selected), purchased: () => { if (!this.destroyed) { this.reaction = 1.5; this.render(); } } });
    });
    footer.append(detail, buy); this.content.append(categories, grid, footer); grid.scrollTop = scroll;
    if (known && !ready) { const hint = document.createElement('p'); bindText(hint, 'homeShopSetup'); this.homePreview.append(hint); }
  }
  private itemName(category: OutfitTab, index: number): string {
    const item=wearableItem(category,index) ?? speechSkinItem(category,index);
    return item?t(item.name):`${t(category)} ${String(index).padStart(2, '0')}`;
  }
  private purchased(category: OutfitTab, index: number, result: string): void {
    if (this.destroyed || result !== 'purchased') return;
    this.lastPurchase = { category, index }; this.reaction = 1.5; this.render();
  }
  resize(_width: number, _height: number): void {}
  override update(seconds: number): void {
    this.elapsed += seconds; this.reaction = Math.max(0, this.reaction - seconds);
    const speech = this.tab === 'Style' && this.category === 'Etc' && speechSkinItem('Etc', this.selected)
      ? { message: t('speechSkinPreview'), remaining: 1 } : undefined;
    this.animation.update(this.reaction > 0 ? 'EMOTE' : 'IDLE', this.elapsed, 1, 0, 0, seconds, undefined, undefined, speech);
    if (speech) { this.animation.welcomeMark.scale.set(.55); this.animation.welcomeMark.position.set(0,-200); }
    if(this.tab!=='Style')this.animation.welcomeMark.visible=false;
    if(this.petPreview.visible)this.petAnimation?.update(this.reaction>0?'EMOTE':'IDLE',this.elapsed,1,0,0,seconds);
  }
  override destroy(options?: DestroyOptions): void {
    this.purchase.destroy(); this.unsubscribe(); this.localeOff(); this.abort.abort(); this.panel.remove(); super.destroy(options); this.animation.sleepMark.destroy();this.petAnimation?.sleepMark.destroy();
  }
}
