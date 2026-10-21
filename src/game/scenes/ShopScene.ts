import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import { OUTFIT_TABS, outfitReady, type OutfitTab } from '../../animals/OutfitState';
import { bindAria, bindText, onLanguageChange, t } from '../../settings/i18n';
import { itemPrice } from '../../shop/ShopState';
import type { CommerceState } from '../../shop/CommerceState';
import { commerceStatus } from '../../ui/CommerceStatus';
import { coinAmount } from '../../ui/CoinAmount';
import { itemIcon } from '../../ui/itemIcon';
import { passPanel } from '../../ui/PassPanel';
import { homeOptions, homePrice, HOME_MAX_STOCK, type PlaceableTab } from '../../home/HomeCatalog';
import { homeIcon, homeItemName } from '../../ui/homeIcon';
import { PurchasePopup } from '../../ui/PurchasePopup';
import { Scene } from './Scene';

const PURCHASE_LABELS = { owned: 'owned', purchased: 'shopPurchased', processing: 'economyWorking', loading: 'shopChecking', unavailable: 'shopUnavailable', available: 'buy', insufficient: 'notEnoughCoins', comingSoon: 'shopComingSoon' } as const;

export class ShopScene extends Scene {
  private readonly preview = new Container();
  private readonly animation: AnimalAnimationController;
  private readonly platform = new Graphics().ellipse(235, 395, 150, 28).fill('#d5ddc8');
  private readonly panel = document.createElement('section');
  private readonly balance = document.createElement('p');
  private readonly connection = document.createElement('div');
  private readonly content = document.createElement('div');
  private readonly tabs = document.createElement('nav');
  private readonly homePreview = document.createElement('div');
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
  private homeCategory: PlaceableTab = 'Furniture';
  private homeSelected = 5;
  private tab: 'Style' | 'Furniture' | 'Pass';
  constructor(config: AnimalConfig, private readonly state: CommerceState, onClose: () => void, private readonly onQuest: () => void, initial: 'Style' | 'Pass' = 'Style') {
    super(); this.tab = initial;
    this.purchase = new PurchasePopup(state, this.panel);
    this.animation = new AnimalAnimationController(config);
    this.addChild(new Graphics().rect(0, 0, 960, 540).fill('#edf0df'), this.platform, this.preview);
    this.preview.position.set(235, 385); this.preview.scale.set(1.45);
    this.preview.addChild(this.animation.sprite, this.animation.welcomeMark);
    this.panel.className = 'shop-screen';
    bindAria(this.panel, 'shop');
    const title = document.createElement('h2'); title.className = 'shop-title'; bindText(title, 'shop');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'character-close'; close.textContent = '×'; bindAria(close, 'close');
    close.addEventListener('click', onClose, { once: true, signal: this.abort.signal });
    this.balance.className = 'shop-balance';
    this.tabs.className = 'outfit-tabs shop-tabs';
    bindAria(this.tabs, 'shop');
    for (const tab of ['Style', 'Furniture', 'Pass'] as const) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, tab);
      button.addEventListener('click', () => { this.tab = tab; this.grid = undefined; this.render(); }, { signal: this.abort.signal }); this.tabs.append(button);
    }
    this.connection.className = 'shop-connection';
    this.homePreview.className = 'shop-home-preview';
    this.panel.append(title, close, this.balance, this.tabs, this.content, this.connection, this.homePreview);
    document.querySelector('#app')?.append(this.panel);
    this.unsubscribe = state.subscribe(() => this.render());
    this.localeOff = onLanguageChange(() => this.render()); this.render(); this.update(0);
  }
  private render(): void {
    const scroll = this.grid?.scrollTop ?? 0; this.grid = undefined;
    coinAmount(this.balance, this.state.entitlementsKnown ? this.state.coins : '—', { balance: true });
    this.balance.setAttribute('data-loading', String(!this.state.entitlementsKnown));
    this.connection.replaceChildren(); const connection = commerceStatus(this.state); if (connection) this.connection.append(connection);
    this.preview.visible = this.platform.visible = this.tab === 'Style';
    this.homePreview.hidden = this.tab !== 'Furniture';
    Array.from(this.tabs.children).forEach((button, index) => button.setAttribute('aria-pressed', String(['Style', 'Furniture', 'Pass'][index] === this.tab)));
    this.content.replaceChildren(); this.content.className = this.tab === 'Pass' ? 'shop-pass' : 'shop-style';
    if (this.tab === 'Furniture') { this.renderFurniture(scroll); return; }
    if (this.tab === 'Pass') {
      this.content.append(passPanel(this.state, 'shop', this.onQuest));
      const quest = document.createElement('button'); quest.type = 'button'; quest.className = 'commerce-primary'; bindText(quest, 'viewPass');
      quest.addEventListener('click', this.onQuest); this.content.append(quest); return;
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
      button.setAttribute('aria-label', `${this.itemName(this.category, index)} · ${!ready ? t('shopComingSoon') + (owned ? ' · ' + t('owned') : '') : owned ? t('owned') : `${itemPrice(index)} ${t('coins')}`}`);
      button.setAttribute('data-coming-soon', String(!ready));
      button.setAttribute('data-owned', String(owned));
      button.setAttribute('aria-pressed', String(this.selected === index));
      const price = document.createElement('span'); price.className = 'shop-price';
      if (!ready) price.textContent = t('shopComingSoon'); else if (owned) price.textContent = t('owned'); else coinAmount(price, itemPrice(index)); button.append(price);
      button.addEventListener('click', () => { this.selected = index; this.reaction = 1.5; this.render(); }); grid.append(button);
    }
    const footer = document.createElement('div'); footer.className = 'shop-purchase';
    const detail = document.createElement('span'); detail.className = 'shop-detail';
    const name = document.createElement('strong'); name.textContent = this.itemName(this.category, this.selected);
    const ready = outfitReady(this.category, this.selected);
    const cost = document.createElement('span'); cost.className = 'shop-cost';
    if (ready) coinAmount(cost, itemPrice(this.selected));
    else cost.textContent = t('shopComingSoon') + (this.state.entitlementsKnown && this.state.owns(this.category, this.selected) ? ' · ' + t('owned') : '');
    detail.append(name, cost);
    const buy = document.createElement('button'); buy.type = 'button'; buy.className = 'commerce-primary';
    const owned = this.state.entitlementsKnown && this.state.owns(this.category, this.selected), enough = this.state.coins >= itemPrice(this.selected);
    const purchased = owned && this.lastPurchase?.category === this.category && this.lastPurchase.index === this.selected;
    const status = !ready ? 'comingSoon' : !this.state.entitlementsKnown ? this.state.connection === 'loading' ? 'loading' : 'unavailable'
      : owned ? purchased ? 'purchased' : 'owned' : this.state.busy || this.state.connection === 'loading' ? 'processing'
      : !this.state.ready ? 'unavailable' : enough ? 'available' : 'insufficient';
    buy.setAttribute('data-purchase-state', status);
    footer.setAttribute('data-purchase-state', status);
    buy.textContent = t(PURCHASE_LABELS[status]);
    buy.disabled = !ready || owned || !enough || !this.state.ready;
    buy.addEventListener('click', () => {
      const category = this.category, index = this.selected;
      if (this.destroyed || buy.disabled || !outfitReady(category, index) || !this.state.ready || this.state.owns(category, index)) return;
      this.purchase.open({ name: () => this.itemName(category, index), icon: () => itemIcon(category, index), price: itemPrice(index),
        available: () => outfitReady(category, index) && !this.state.owns(category, index), fulfilled: () => this.state.owns(category, index),
        buy: () => this.state.buy(category, index), purchased: () => this.purchased(category, index, 'purchased') });
    });
    footer.append(detail, buy); this.content.append(categories, grid, footer);
    grid.scrollTop = scroll;
  }
  private renderFurniture(scroll: number): void {
    const category = this.homeCategory, selected = this.homeSelected;
    this.homePreview.replaceChildren(homeIcon(category, selected));
    const heading = document.createElement('p'); heading.textContent = homeItemName(category, selected); this.homePreview.append(heading);
    const categories = document.createElement('nav'); categories.className = 'outfit-tabs shop-categories'; bindAria(categories, 'categories');
    for (const tab of ['Furniture', 'Etc'] as const) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, tab); button.setAttribute('aria-pressed', String(category === tab));
      button.addEventListener('click', () => { this.homeCategory = tab; this.homeSelected = tab === 'Furniture' ? 5 : 1; this.grid = undefined; this.render(); }); categories.append(button);
    }
    const grid = document.createElement('div'); grid.className = 'outfit-inventory shop-grid'; this.grid = grid; bindAria(grid, 'items');
    for (let index = 1; index < homeOptions[category]; index++) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit-slot shop-slot';
      const count = this.state.entitlementsKnown ? this.state.homeOwned(category, index) : '—';
      button.append(homeIcon(category, index)); button.setAttribute('aria-pressed', String(selected === index));
      button.setAttribute('aria-label', `${homeItemName(category, index)} · ${t('owned')}: ${count} · ${homePrice(category, index)} ${t('coins')}`);
      const price = document.createElement('span'); price.className = 'shop-price'; coinAmount(price, homePrice(category, index));
      const quantity = document.createElement('span'); quantity.className = 'home-count'; quantity.textContent = `×${count}`;
      button.append(price, quantity); button.addEventListener('click', () => { this.homeSelected = index; this.render(); }); grid.append(button);
    }
    const footer = document.createElement('div'); footer.className = 'shop-purchase';
    const detail = document.createElement('span'); detail.className = 'shop-detail';
    const name = document.createElement('strong'); name.textContent = homeItemName(category, selected);
    const cost = document.createElement('span'); cost.className = 'shop-cost'; cost.setAttribute('role', 'status');
    const known = this.state.entitlementsKnown, count = this.state.homeOwned(category, selected), price = homePrice(category, selected);
    coinAmount(cost, price, { suffix: ` · ${t('owned')}: ${known ? count : '—'}/${HOME_MAX_STOCK}` });
    detail.append(name, cost);
    const buy = document.createElement('button'); buy.type = 'button'; buy.className = 'commerce-primary';
    const status = !known ? this.state.connection === 'loading' ? 'loading' : 'unavailable'
      : this.state.busy || this.state.connection === 'loading' ? 'processing'
      : !this.state.ready || !this.state.homeShopReady ? 'unavailable' : count >= HOME_MAX_STOCK ? 'limit' : this.state.coins < price ? 'insufficient' : 'available';
    buy.setAttribute('data-purchase-state', status); footer.setAttribute('data-purchase-state', status);
    buy.textContent = status === 'available' ? t('buyOne') : status === 'limit' ? t('homeStockLimit') : t(PURCHASE_LABELS[status]);
    buy.disabled = status !== 'available';
    buy.addEventListener('click', () => {
      if (this.destroyed || buy.disabled || !this.state.ready || !this.state.homeShopReady) return;
      const owned = this.state.homeOwned(category, selected);
      this.purchase.open({ name: () => homeItemName(category, selected), icon: () => homeIcon(category, selected), price,
        available: () => this.state.homeShopReady && this.state.homeOwned(category, selected) < HOME_MAX_STOCK,
        fulfilled: () => this.state.homeOwned(category, selected) > owned,
        buy: () => this.state.buyHome(category, selected), purchased: () => { if (!this.destroyed) { this.reaction = 1.5; this.render(); } } });
    });
    footer.append(detail, buy); this.content.append(categories, grid, footer); grid.scrollTop = scroll;
    if (known && !this.state.homeShopReady) { const hint = document.createElement('p'); bindText(hint, 'homeShopSetup'); this.homePreview.append(hint); }
  }
  private itemName(category: OutfitTab, index: number): string {
    return category === 'Hat' && index === 1 ? t('santaHat') : `${t(category)} ${String(index).padStart(2, '0')}`;
  }
  private purchased(category: OutfitTab, index: number, result: string): void {
    if (this.destroyed || result !== 'purchased') return;
    this.lastPurchase = { category, index }; this.reaction = 1.5; this.render();
  }
  resize(_width: number, _height: number): void {}
  override update(seconds: number): void {
    this.elapsed += seconds; this.reaction = Math.max(0, this.reaction - seconds);
    this.animation.update(this.reaction > 0 ? 'EMOTE' : 'IDLE', this.elapsed, 1, 0, 0, seconds);
  }
  override destroy(options?: DestroyOptions): void {
    this.purchase.destroy(); this.unsubscribe(); this.localeOff(); this.abort.abort(); this.panel.remove(); super.destroy(options); this.animation.sleepMark.destroy();
  }
}
