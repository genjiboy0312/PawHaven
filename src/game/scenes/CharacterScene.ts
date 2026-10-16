import { CharacterPresets } from '../../animals/CharacterPresets';
import { bindAria, bindText, t } from '../../settings/i18n';
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { OUTFIT_TABS, outfitColor, type OutfitState, type OutfitTab } from '../../animals/OutfitState';
import { Scene } from './Scene';

const ITEM_ICONS: Record<OutfitTab, string> = {
  Hat: '<path d="M16 37h32L43 25H23z"/><path d="M9 39q23-9 46 0v5H9z"/>',
  Body: '<path d="m20 16-11 12 9 8 4-5v22h20V31l4 5 9-8-11-12-7 6H27z"/>',
  Acc: '<path d="M19 16q-7 22 13 35 20-13 13-35" fill="none" stroke="currentColor" stroke-width="4"/><path d="m32 35 8 8-8 9-8-9z"/>',
  Etc: '<path d="m32 32-22-13v26zm0 0 22-13v26z"/><circle cx="32" cy="32" r="6"/>',
};

export interface PetChoice { config: AnimalConfig; name: string; thumbnail: string }
interface CharacterOptions { presets?: CharacterPresets; pets?: PetChoice[]; onPetChanged?: (config: AnimalConfig) => void }
const CHARACTER_TABS = ['Pets', ...OUTFIT_TABS] as const;

export class CharacterScene extends Scene {
  private readonly preview = new Container();
  private animation: AnimalAnimationController;
  private readonly panel = document.createElement('section');
  private readonly tabs = document.createElement('nav');
  private readonly inventory = document.createElement('div');
  private readonly abort = new AbortController();
  private readonly presets: CharacterPresets;
  private readonly pets: PetChoice[];
  private pet: PetChoice;
  private activePreset = 0;
  private readonly presetButtons: HTMLButtonElement[] = [];
  private readonly feedback = document.createElement('p');
  private tab: typeof CHARACTER_TABS[number] = 'Pets';
  private elapsed = 0;
  private reaction = 0;

  constructor(config: AnimalConfig, private readonly outfit: OutfitState, onClose: () => void, private readonly options: CharacterOptions = {}) {
    super();
    this.presets = options.presets ?? new CharacterPresets();
    this.activePreset = this.presets.selectedSlot;
    this.pets = options.pets?.length ? options.pets : [{ config, name: 'corgi', thumbnail: './assets/characters/corgi/corgi-idle-walk.png' }];
    this.pet = this.pets.find(pet => pet.config.id === config.id) ?? this.pets[0];
    this.animation = new AnimalAnimationController(this.pet.config);
    this.addChild(new Graphics().rect(0, 0, 960, 540).fill('#edf0df')
      .ellipse(235, 395, 150, 28).fill('#d5ddc8'), this.preview);
    this.preview.position.set(235, 385);
    this.preview.scale.set(1.45);
    this.preview.addChild(this.animation.sprite, this.animation.welcomeMark);
    this.panel.className = 'character-screen';
    bindAria(this.panel, 'customize');
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'character-close'; bindText(close, 'close');
    close.addEventListener('click', onClose, { once: true, signal: this.abort.signal });
    this.tabs.className = 'outfit-tabs'; bindAria(this.tabs, 'categories');
    for (const tab of CHARACTER_TABS) {
      const button = document.createElement('button');
      button.type = 'button'; bindText(button, tab);
      button.addEventListener('click', () => { this.tab = tab; this.refresh(); }, { signal: this.abort.signal });
      this.tabs.append(button);
    }
    this.inventory.className = 'outfit-inventory';
    bindAria(this.inventory, 'items');
    const presets = document.createElement('div'); presets.className = 'character-presets';
    for (let slot = 0; slot < 3; slot++) {
      const button = document.createElement('button'); button.type = 'button';
      const label = document.createElement('span'); bindText(label, 'preset');
      const number = document.createElement('span'); number.textContent = ' ' + (slot + 1);
      button.append(label, number);
      button.addEventListener('click', () => this.loadPreset(slot), { signal: this.abort.signal });
      this.presetButtons.push(button); presets.append(button);
    }
    const save = document.createElement('button'); save.type = 'button'; bindText(save, 'save');
    save.addEventListener('click', () => {
      this.presets.save(this.activePreset, { petId: this.pet.config.id, outfit: this.outfit });
      bindText(this.feedback, 'presetSaved'); this.refreshPresets();
    }, { signal: this.abort.signal });
    presets.append(save);
    this.feedback.className = 'preset-feedback'; this.feedback.setAttribute('role', 'status');
    this.panel.append(close, this.tabs, this.inventory, presets, this.feedback);
    this.refreshPresets();
    document.querySelector('#app')?.append(this.panel);
    this.refresh(); this.update(0);
  }
  private refresh(): void {
    for (const [index, button] of Array.from(this.tabs.children).entries()) {
      button.setAttribute('aria-pressed', String(CHARACTER_TABS[index] === this.tab));
    }
    this.inventory.replaceChildren(); this.inventory.scrollTop = 0;
    if (this.tab === 'Pets') { this.renderPets(); return; }
    const category = this.tab;
    for (let index = 0; index <= 20; index++) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'outfit-slot';
      if (index === 0) bindText(button, 'none');
      else {
        const image = document.createElement('img');
        image.className = 'outfit-object'; image.alt = '';
        const color = '#' + outfitColor(index).toString(16).padStart(6, '0');
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="${color}" color="${color}" stroke="#727970" stroke-width="1.5" stroke-linejoin="round">${ITEM_ICONS[category]}</svg>`);
        button.append(image);
      }
      button.setAttribute('aria-label', index === 0 ? t('none') : t(category) + ' ' + index);
      button.setAttribute('aria-pressed', String(this.outfit[category] === index));
      // The handler lives on its short-lived slot; discarding the slot releases it.
      button.addEventListener('click', () => {
        this.outfit[category] = index; this.reaction = 1.5; bindText(this.feedback, 'presetUnsaved');
        for (const [item, slot] of Array.from(this.inventory.children).entries()) {
          slot.setAttribute('aria-pressed', String(item === index));
        }
      });
      this.inventory.append(button);
    }
  }
  private renderPets(): void {
    for (const pet of this.pets) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit-slot pet-slot';
      button.setAttribute('aria-pressed', String(pet.config.id === this.pet.config.id));
      const portrait = document.createElement('span'); portrait.className = 'pet-portrait';
      const texture = pet.config.animations.idle!.frames[0], frame = texture.frame;
      portrait.style.backgroundImage = 'url("' + pet.thumbnail + '")';
      portrait.style.width = (frame.width / frame.height * 9) + 'cqh';
      portrait.style.backgroundSize = `${texture.source.width / frame.height * 9}cqh ${texture.source.height / frame.height * 9}cqh`;
      portrait.style.backgroundPosition = `${-frame.x / frame.height * 9}cqh ${-frame.y / frame.height * 9}cqh`;
      const name = document.createElement('span'); name.className = 'pet-name'; name.textContent = pet.name;
      if (pet.config.id === 'corgi') bindText(name, 'corgi');
      const check = document.createElement('span'); check.className = 'pet-check'; check.textContent = '✓'; check.hidden = pet.config.id !== this.pet.config.id;
      button.append(portrait, name, check);
      button.addEventListener('click', () => { this.selectPet(pet); bindText(this.feedback, 'presetUnsaved'); this.refresh(); });
      this.inventory.append(button);
    }
  }
  private selectPet(pet: PetChoice): void {
    if (pet.config.id !== this.pet.config.id) {
      this.preview.removeChildren().forEach(child => child.destroy()); this.animation.sleepMark.destroy();
      this.animation = new AnimalAnimationController(pet.config);
      this.preview.addChild(this.animation.sprite, this.animation.welcomeMark);
    }
    this.pet = pet; this.options.onPetChanged?.(pet.config); this.reaction = 1.5;
  }
  private loadPreset(slot: number): void {
    this.activePreset = slot; this.presets.selectedSlot = slot;
    const saved = this.presets.load(slot);
    if (!saved) bindText(this.feedback, 'presetEmpty');
    else {
      const pet = this.pets.find(pet => pet.config.id === saved.petId);
      if (!pet) bindText(this.feedback, 'petUnavailable');
      else { Object.assign(this.outfit, saved.outfit); this.selectPet(pet); bindText(this.feedback, 'presetLoaded'); this.refresh(); }
    }
    this.refreshPresets();
  }
  private refreshPresets(): void {
    this.presetButtons.forEach((button, slot) => {
      button.setAttribute('aria-pressed', String(slot === this.activePreset));
      button.setAttribute('data-saved', String(!!this.presets.load(slot)));
    });
  }
  resize(_width: number, _height: number): void {}
  override update(seconds: number): void {
    this.elapsed += seconds; this.reaction = Math.max(0, this.reaction - seconds);
    const emote = this.reaction > 0 || this.elapsed % 10 >= 8;
    this.animation.update(emote ? 'EMOTE' : 'IDLE', this.elapsed, 1, 0, 0, seconds);
  }
  override destroy(options?: DestroyOptions): void {
    this.abort.abort(); this.panel.remove(); super.destroy(options);
    this.animation.sleepMark.destroy();
  }
}