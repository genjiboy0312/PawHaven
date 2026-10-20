import type { DestroyOptions } from 'pixi.js';
import { HOME_TABS, homeOptions, SKY_COLORS, FLOOR_COLORS, HomeState, clampPlacement, placementPoint, type PlaceableTab, type Placement, type HomeTab } from '../../home/HomeState';
import { LobbyMap, type HomeTextures } from '../../home/LobbyMap';
import { bindAria, bindText, t } from '../../settings/i18n';
import { Scene } from './Scene';

export class HomeScene extends Scene {
  private readonly map: LobbyMap;
  private readonly placements = document.createElement('div');
  private readonly remove = document.createElement('button');
  private selected?: number;
  private drag?: { id: number; pointer: number; element: HTMLButtonElement; offset: Placement; preview: Placement };
  private readonly panel = document.createElement('section');
  private readonly tabs = document.createElement('nav');
  private readonly inventory = document.createElement('div');
  private readonly abort = new AbortController();
  private tab: HomeTab = 'Background';
  private viewWidth = 960;
  private viewHeight = 540;
  constructor(private readonly state: HomeState, onClose: () => void, textures?: HomeTextures) {
    super(); this.map = new LobbyMap(textures); this.addChild(this.map);
    this.panel.className = 'home-screen'; bindAria(this.panel, 'home');
    const title = document.createElement('h2'); title.className = 'shop-title'; bindText(title, 'home');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'character-close'; bindText(close, 'close');
    close.addEventListener('click', onClose, { once: true, signal: this.abort.signal });
    const drawer = document.createElement('div'); drawer.className = 'home-drawer';
    this.tabs.className = 'outfit-tabs home-tabs';
    for (const tab of HOME_TABS) {
      const button = document.createElement('button'); button.type = 'button'; bindText(button, tab);
      button.addEventListener('click', () => { this.cancelDrag(false); this.tab = tab; this.render(); }, { signal: this.abort.signal }); this.tabs.append(button);
    }
    this.inventory.className = 'outfit-inventory home-inventory'; bindAria(this.inventory, 'items');
    const hint = document.createElement('p'); hint.className = 'home-hint'; bindText(hint, 'homeHint');
    this.placements.className = 'home-placements';
    this.remove.type = 'button'; this.remove.className = 'home-remove commerce-primary'; bindText(this.remove, 'remove');
    this.remove.addEventListener('click', () => this.removeSelected(), { signal: this.abort.signal });
    this.panel.append(title, close, drawer, this.tabs, this.inventory, hint, this.placements, this.remove);
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', () => this.cancelDrag(), { signal: this.abort.signal });
      window.addEventListener('resize', () => this.cancelDrag(), { signal: this.abort.signal });
    }
    document.querySelector('#app')?.append(this.panel); this.render();
  }
  private render(): void {
    const look = this.state.current;
    this.drawMap(); this.renderPlacements();
    Array.from(this.tabs.children).forEach((button, index) => button.setAttribute('aria-pressed', String(HOME_TABS[index] === this.tab)));
    this.inventory.replaceChildren(); this.inventory.scrollTop = 0; this.inventory.scrollLeft = 0;
    for (let index = this.tab === 'Furniture' || this.tab === 'Etc' ? 1 : 0; index < homeOptions[this.tab]; index++) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit-slot';
      const placeable = this.tab === 'Furniture' || this.tab === 'Etc';
      const count = placeable ? this.state.remaining(this.tab as PlaceableTab, index) : undefined;
      button.setAttribute('aria-label', t(this.tab) + ' ' + (placeable ? index : index + 1) + (count === undefined ? '' : ` · ${t('remaining')}: ${count}`));
      const active = placeable ? this.state.items.some(item => item.id === this.selected && item.tab === this.tab && item.option === index) : look[this.tab as 'Background' | 'Floor'] === index;
      button.setAttribute('aria-pressed', String(active));
      button.disabled = count === 0;
      if (index === 0 && (this.tab === 'Furniture' || this.tab === 'Etc')) bindText(button, 'none');
      else {
        const image = document.createElement('img'); image.className = 'outfit-object'; image.alt = '';
        const color = this.tab === 'Background' ? SKY_COLORS[index] : this.tab === 'Floor' ? FLOOR_COLORS[index] : ['#a99884', '#ad9478', '#92a382', '#b6a083', '#b8a0ac'][index];
        const shape = this.tab === 'Background' ? '<rect x="6" y="10" width="52" height="40" rx="8"/><circle cx="43" cy="22" r="6" fill="#fff8df"/>'
          : this.tab === 'Floor' ? '<ellipse cx="32" cy="37" rx="27" ry="12"/>'
          : this.tab === 'Furniture' ? '<rect x="11" y="19" width="42" height="17" rx="4"/><path d="M8 40h48M16 40v12m32-12v12"/>'
          : '<path d="M32 47V19m-7 34h14"/><circle cx="32" cy="22" r="13"/>';
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="${color}" stroke="#858d7e" stroke-width="2.5" stroke-linecap="round">${shape}</svg>`);
        const resource = this.tab === 'Background' && index === 0 ? 'garden-background.png'
          : this.tab === 'Floor' && index === 0 ? 'garden-floor.png' : this.tab === 'Furniture' && index === 4 ? 'cushion.png' : undefined;
        if (resource) { image.src = './assets/home/' + resource; image.classList.add('home-pixel-icon'); }
        button.append(image);
      }
      if (count !== undefined) {
        const quantity = document.createElement('span'); quantity.className = 'home-count'; quantity.textContent = String(count); button.append(quantity);
      }
      button.addEventListener('click', () => {
        this.cancelDrag(false);
        if (this.tab === 'Furniture' || this.tab === 'Etc') {
          const id = this.state.place(this.tab, index); if (id === undefined) return; this.selected = id;
        } else this.state.select(this.tab, index);
        this.render();
      }); this.inventory.append(button);
    }
  }
  private drawMap(): void {
    const items = this.state.items;
    if (this.drag) { const item = items.find(item => item.id === this.drag!.id); if (item) Object.assign(item, this.drag.preview); }
    this.map.draw(this.viewWidth, this.viewHeight, this.state.current, items);
    for (const element of Array.from(this.placements.children) as HTMLButtonElement[]) {
      const point = items.find(item => item.id === Number(element.getAttribute('data-placement'))); if (!point) continue;
      const tab = point.tab;
      const box = tab === 'Furniture'
        ? [[80, 110, 30], [78, 70, 30], [45, 100, 20], [70, 55, 20], [80, 65, 8]][point.option]
        : [[80, 110, 30], [50, 40, 20], [65, 5, 30], [25, 100, 20], [70, 50, 20]][point.option];
      element.style.left = `${(point.x - box[0] / 960) * 100}%`;
      element.style.width = `${box[0] * 2 / 960 * 100}%`;
      element.style.height = `${(box[1] + box[2]) / 540 * 100}%`;
      element.style.top = `${(point.y - box[1] / 540) * 100}%`;
      element.setAttribute('aria-pressed', String(point.id === this.selected));
      element.style.zIndex = String(Math.round(point.y * 100) + (point.id === this.selected ? 100 : 0));
    }
    this.remove.hidden = !items.some(item => item.id === this.selected);
  }
  private point(event: PointerEvent): Placement {
    const host = document.querySelector<HTMLElement>('#app')!;
    return placementPoint(event.clientX, event.clientY, host.getBoundingClientRect(), host.classList.contains('portrait-touch'));
  }
  private renderPlacements(): void {
    this.placements.replaceChildren();
    for (const item of this.state.items) {
      const { id, tab } = item;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'home-placement';
      button.setAttribute('data-placement', String(id)); bindAria(button, tab);
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0 || this.drag) return;
        event.preventDefault(); this.selected = id; button.focus();
        const point = this.point(event), position = this.state.items.find(item => item.id === id)!;
        this.drag = { id, pointer: event.pointerId, element: button, offset: { x: point.x - position.x, y: point.y - position.y }, preview: position };
        button.setPointerCapture(event.pointerId); this.drawMap();
      });
      button.addEventListener('pointermove', event => {
        if (!this.drag || this.drag.pointer !== event.pointerId) return;
        const point = this.point(event);
        this.drag.preview = clampPlacement(point.x - this.drag.offset.x, point.y - this.drag.offset.y); this.drawMap();
      });
      button.addEventListener('pointerup', event => {
        if (!this.drag || this.drag.pointer !== event.pointerId) return;
        const { id, preview } = this.drag; this.state.move(id, preview.x, preview.y); this.cancelDrag();
      });
      for (const name of ['pointercancel', 'lostpointercapture'] as const) button.addEventListener(name, event => { if (this.drag?.pointer === event.pointerId) this.cancelDrag(); });
      button.addEventListener('click', () => { if (this.drag) return; this.selected = id; this.drawMap(); });
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(event.key)) return;
        event.preventDefault(); this.cancelDrag(false); this.selected = id;
        if (event.key === 'Delete' || event.key === 'Backspace') { this.removeSelected(); return; }
        const point = this.state.items.find(item => item.id === id)!;
        this.state.move(id, point.x + (event.key === 'ArrowRight' ? 16 / 960 : event.key === 'ArrowLeft' ? -16 / 960 : 0), point.y + (event.key === 'ArrowDown' ? 16 / 540 : event.key === 'ArrowUp' ? -16 / 540 : 0));
        this.drawMap();
      });
      this.placements.append(button);
    }
    this.drawMap();
  }
  private removeSelected(): void {
    this.cancelDrag(false);
    if (this.selected !== undefined) this.state.remove(this.selected);
    this.selected = undefined; this.render();
  }
  private cancelDrag(redraw = true): void {
    const drag = this.drag; this.drag = undefined;
    if (drag?.element.hasPointerCapture(drag.pointer)) drag.element.releasePointerCapture(drag.pointer);
    if (redraw) this.drawMap();
  }
  resize(width: number, height: number): void { this.cancelDrag(false); this.viewWidth = width; this.viewHeight = height; this.drawMap(); }
  override destroy(options?: DestroyOptions): void { this.cancelDrag(false); this.abort.abort(); this.panel.remove(); super.destroy(options); }
}
