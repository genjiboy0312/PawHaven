import { itemIcon } from '../../ui/itemIcon';
import { CharacterPresets, type CharacterPreset } from '../../animals/CharacterPresets';
import { bindAria, bindText, onLanguageChange, t } from '../../settings/i18n';
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { OUTFIT_TABS, type OutfitState, type OutfitTab } from '../../animals/OutfitState';
import { Scene } from './Scene';
import { wearableItem } from '../../animals/Wearables';
import { speechSkinItem } from '../../animals/SpeechSkins';

export interface PetChoice { config: AnimalConfig; name: string; thumbnail: string }
interface CharacterOptions { beforeClose?: () => Promise<void>; subscribe?: (callback: () => void) => () => void; onLookChanged?: (look: CharacterPreset) => void; presets?: CharacterPresets; pets?: PetChoice[]; onPetChanged?: (config: AnimalConfig) => void; owns?: (category: OutfitTab, index: number) => boolean }
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
  private readonly presetStates: HTMLSpanElement[] = [];
  private readonly save = document.createElement('button');
  private readonly localeOff: () => void;
  private readonly feedback = document.createElement('p');
  private tab: typeof CHARACTER_TABS[number] = 'Pets';
  private readonly unsubscribe?: () => void;
  private elapsed = 0;
  private reaction = 0;
  private closing = false;

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
    close.type = 'button'; close.className = 'character-close'; close.textContent = '×'; bindAria(close, 'close');
    close.addEventListener('click', () => {
      if (this.closing || this.destroyed) return;
      if (!options.beforeClose) { onClose(); return; }
      this.closing = true; close.disabled = true; this.panel.inert = true;
      bindText(this.feedback, 'sync.saving');
      void options.beforeClose().then(() => { if (!this.destroyed) onClose(); }).catch(() => {
        if (!this.destroyed) bindText(this.feedback, 'sync.offline');
      }).finally(() => {
        if (!this.destroyed) { this.closing = false; close.disabled = false; this.panel.inert = false; }
      });
    }, { signal: this.abort.signal });
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
      const state = document.createElement('span'); state.className = 'preset-state';
      button.append(label, number, state); this.presetStates.push(state);
      button.addEventListener('click', () => this.loadPreset(slot), { signal: this.abort.signal });
      this.presetButtons.push(button); presets.append(button);
    }
    const save = this.save; save.type = 'button'; save.className = 'preset-save'; bindText(save, 'save');
    save.addEventListener('click', () => {
      this.presets.save(this.activePreset, { petId: this.pet.config.id, outfit: this.outfit });
      bindText(this.feedback, 'presetSaved'); this.refreshPresets();
    }, { signal: this.abort.signal });
    presets.append(save);
    this.feedback.className = 'preset-feedback'; this.feedback.setAttribute('role', 'status');
    this.panel.append(close, this.tabs, this.inventory, presets, this.feedback);
    this.refreshPresets();
    document.querySelector('#app')?.append(this.panel);
    this.unsubscribe = options.subscribe?.(() => this.refresh());
    this.localeOff = onLanguageChange(() => this.refreshPresets());
    this.refresh(); this.update(0);
  }
  private refresh(): void {
    this.refreshPresets();
    for (const [index, button] of Array.from(this.tabs.children).entries()) {
      button.setAttribute('aria-pressed', String(CHARACTER_TABS[index] === this.tab));
    }
    this.inventory.replaceChildren(); this.inventory.scrollTop = 0;
    if (this.tab === 'Pets') { this.renderPets(); return; }
    const category = this.tab;
    for (let index = 0; index <= 20; index++) {
      if (index && this.options.owns && !this.options.owns(category, index)) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'outfit-slot';
      if (index === 0) bindText(button, 'none');
      else {
        button.append(itemIcon(category, index));
      }
      const item=wearableItem(category,index) ?? speechSkinItem(category,index);
      button.setAttribute('aria-label', index === 0 ? t('none') : item?t(item.name):t(category) + ' ' + index);
      button.setAttribute('data-item', String(index));
      button.setAttribute('aria-pressed', String(this.outfit[category] === index));
      // The handler lives on its short-lived slot; discarding the slot releases it.
      button.addEventListener('click', () => {
        this.outfit[category] = index; this.notifyLook(); this.reaction = 1.5; bindText(this.feedback, 'presetUnsaved');
        for (const slot of Array.from(this.inventory.children)) {
          slot.setAttribute('aria-pressed', String(Number(slot.getAttribute('data-item')) === index));
        }
        this.refreshPresets();
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
      if (pet.config.id === 'corgi' || pet.config.id === 'myeongrang') bindText(name, pet.config.id);
      const check = document.createElement('span'); check.className = 'pet-check'; check.textContent = '✓'; check.hidden = pet.config.id !== this.pet.config.id;
      button.append(portrait, name, check);
      button.addEventListener('click', () => { this.selectPet(pet); bindText(this.feedback, 'presetUnsaved'); this.refresh(); });
      this.inventory.append(button);
    }
  }
  private selectPet(pet: PetChoice): void {
    if (pet.config.id !== this.pet.config.id) {
      this.preview.removeChildren().forEach(child => child.destroy({ children: true })); this.animation.sleepMark.destroy();
      this.animation = new AnimalAnimationController(pet.config);
      this.preview.addChild(this.animation.sprite, this.animation.welcomeMark);
    }
    this.pet = pet; this.options.onPetChanged?.(pet.config); this.notifyLook(); this.reaction = 1.5; this.refreshPresets();
  }
  private notifyLook(): void { this.options.onLookChanged?.({ petId: this.pet.config.id, outfit: { ...this.outfit } }); }
  private loadPreset(slot: number): void {
    this.activePreset = slot; this.presets.selectedSlot = slot;
    const saved = this.presets.load(slot);
    if (!saved) bindText(this.feedback, 'presetEmpty');
    else {
      const pet = this.pets.find(pet => pet.config.id === saved.petId);
      if (!pet) bindText(this.feedback, 'petUnavailable');
      else { Object.assign(this.outfit, saved.outfit); OUTFIT_TABS.forEach(category => { if (this.options.owns && !this.options.owns(category, this.outfit[category])) this.outfit[category] = 0; }); this.selectPet(pet); bindText(this.feedback, 'presetLoaded'); this.refresh(); }
    }
    this.refreshPresets();
  }
  private refreshPresets(): void {
    this.presetButtons.forEach((button, slot) => {
      const saved = this.presets.load(slot);
      const matches = !!saved && saved.petId === this.pet.config.id && OUTFIT_TABS.every(category => saved.outfit[category] === this.outfit[category]);
      button.setAttribute('aria-pressed', String(slot === this.activePreset));
      button.setAttribute('data-saved', String(!!saved));
      button.setAttribute('data-applied', String(slot === this.activePreset && matches));
      const state = !saved ? 'presetSlotEmpty' : slot === this.activePreset ? matches ? 'presetSlotCurrent' : 'presetSlotEdited' : 'presetSlotStored';
      bindText(this.presetStates[slot]!, state);
      button.setAttribute('aria-label', `${t('preset')} ${slot + 1} · ${t(state)}`);
    });
    this.save.setAttribute('aria-label', `${t('save')} · ${t('preset')} ${this.activePreset + 1}`);
  }
  resize(_width: number, _height: number): void {}
  override update(seconds: number): void {
    this.elapsed += seconds; this.reaction = Math.max(0, this.reaction - seconds);
    const emote = this.reaction > 0 || this.elapsed % 10 >= 8;
    const speech = this.tab === 'Etc' && speechSkinItem('Etc', this.outfit.Etc)
      ? { message: t('speechSkinPreview'), remaining: 1 } : undefined;
    this.animation.update(emote ? 'EMOTE' : 'IDLE', this.elapsed, 1, 0, 0, seconds, undefined, undefined, speech);
    if (speech) { this.animation.welcomeMark.scale.set(.55); this.animation.welcomeMark.position.set(0,-200); }
  }
  override destroy(options?: DestroyOptions): void {
    this.unsubscribe?.(); this.localeOff(); this.abort.abort(); this.panel.remove(); super.destroy(options);
    this.animation.sleepMark.destroy();
  }
}
