import { Container, Graphics, Rectangle, type DestroyOptions } from 'pixi.js';
import { AnimalAnimationController } from '../../animals/AnimalAnimationController';
import type { AnimalConfig } from '../../animals/AnimalConfig';
import { LobbyMap, type HomeTextures } from '../../home/LobbyMap';
import { bindAria, bindText, t, type TextKey } from '../../settings/i18n';
import { backAction } from '../../ui/BackNavigation';
import { postcardPng } from '../PostcardImage';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../viewport';
import { Scene } from './Scene';

const PHOTO_X = 690;
const GROUND_Y = 394;
const WALK_SPEED = 128;
const SPOT_RADIUS = 45;
const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'];
const POSTCARD_FILENAME = 'pawhaven-walk.png';

export class PostcardScene extends Scene {
  private readonly scenery = new Container();
  private readonly actor = new Container();
  private readonly animation: AnimalAnimationController;
  private readonly hud = document.createElement('section');
  private readonly hint = document.createElement('p');
  private readonly capture = document.createElement('button');
  private readonly preview = document.createElement('div');
  private readonly image = document.createElement('img');
  private readonly download = document.createElement('a');
  private readonly share = document.createElement('button');
  private readonly shareStatus = document.createElement('p');
  private readonly back = document.createElement('button');
  private readonly abort = new AbortController();
  private readonly keys = new Set<string>();
  private touch?: { pointer: number; axis: number };
  private direction = 1;
  private elapsed = 0;
  private paused = false;
  private capturing = false;
  private previewUrl?: string;
  private shareFile?: File;
  private sharing = false;

  constructor(
    config: AnimalConfig,
    textures: HomeTextures | undefined,
    private readonly extract: (target: Container, frame: Rectangle) => HTMLCanvasElement,
    private readonly onReturn: () => void,
    private readonly shutter?: () => void,
  ) {
    super();
    const map = new LobbyMap(textures);
    map.draw(WORLD_WIDTH, WORLD_HEIGHT, { Background: 0, Floor: 0 }, [
      { id: 1, tab: 'Etc', option: 5, x: .16, y: .52 },
      { id: 2, tab: 'Etc', option: 6, x: .84, y: .59 },
      { id: 3, tab: 'Etc', option: 4, x: .57, y: .52 },
    ]);
    this.animation = new AnimalAnimationController(config);
    const shadow = new Graphics().ellipse(0, -3, 43, 8).fill({ color: '#52653c', alpha: .2 });
    this.actor.position.set(176, GROUND_Y);
    this.actor.addChild(shadow, this.animation.sprite, this.animation.sleepMark, this.animation.welcomeMark);
    this.scenery.addChild(map, this.actor);
    const marker = new Graphics()
      .ellipse(PHOTO_X, GROUND_Y, 54, 16).fill({ color: '#fff6d7', alpha: .45 })
      .ellipse(PHOTO_X, GROUND_Y, 54, 16).stroke({ color: '#fff8dd', width: 3 });
    this.addChild(this.scenery, marker);
    this.animation.update('IDLE', 0, this.direction);

    this.hud.className = 'play-hud postcard-hud';
    bindAria(this.hud, 'postcardWalk');
    const header = document.createElement('header');
    const title = document.createElement('strong');
    bindText(title, 'postcardWalk');
    const leave = this.button('returnLobby', onReturn);
    header.append(title, leave);
    this.hint.className = 'postcard-hint';
    this.hint.setAttribute('role', 'status');
    const spot = document.createElement('span');
    spot.className = 'postcard-spot';
    bindText(spot, 'postcardSpot');
    const movement = document.createElement('div');
    movement.className = 'postcard-movement';
    movement.append(this.directionButton(-1, 'postcardLeft'), this.directionButton(1, 'postcardRight'));
    this.capture.type = 'button';
    this.capture.className = 'commerce-primary postcard-capture';
    bindText(this.capture, 'postcardTake');
    this.capture.addEventListener('click', () => void this.takePhoto(), { signal: this.abort.signal });
    this.hud.append(header, this.hint, spot, movement, this.capture);

    this.preview.className = 'settings-overlay postcard-overlay';
    this.preview.hidden = true;
    const panel = document.createElement('section');
    panel.className = 'settings-panel postcard-preview';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    bindAria(panel, 'postcardWalk');
    this.image.alt = t('postcardImage');
    this.download.className = 'commerce-primary';
    this.download.download = POSTCARD_FILENAME;
    bindText(this.download, 'postcardSave');
    this.back.type = 'button';
    this.back.className = 'commerce-primary';
    bindText(this.back, 'postcardRetake');
    this.back.addEventListener('click', () => this.closePreview(), { signal: this.abort.signal });
    const actions = document.createElement('div');
    actions.className = 'postcard-preview-actions';
    this.share.type = 'button';
    this.share.className = 'commerce-primary postcard-share';
    this.share.hidden = true;
    bindText(this.share, 'postcardShare');
    this.share.addEventListener('click', () => void this.sharePostcard(), { signal: this.abort.signal });
    this.shareStatus.className = 'postcard-share-status';
    this.shareStatus.setAttribute('role', 'status');
    this.shareStatus.hidden = true;
    bindText(this.shareStatus, 'postcardShareFailed');
    actions.append(this.back, this.download, this.share);
    panel.append(this.image, actions, this.shareStatus);
    this.preview.append(panel);
    document.querySelector('#app')?.append(this.hud, this.preview);
    backAction(this.hud, onReturn);
    backAction(this.preview, () => this.closePreview());
    window.addEventListener('keydown', event => this.keyDown(event), { signal: this.abort.signal });
    window.addEventListener('keyup', event => this.keys.delete(event.code), { signal: this.abort.signal });
    window.addEventListener('blur', () => this.clearInput(), { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearInput(); }, { signal: this.abort.signal });
    this.refresh();
    leave.focus({ preventScroll: true });
  }

  private button(key: TextKey, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'commerce-primary';
    bindText(button, key);
    button.addEventListener('click', action, { signal: this.abort.signal });
    return button;
  }

  private directionButton(axis: number, key: TextKey): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'commerce-primary';
    button.textContent = axis < 0 ? '‹' : '›';
    bindAria(button, key);
    const signal = this.abort.signal;
    button.addEventListener('pointerdown', event => {
      if (!this.active || event.button !== 0 || this.touch) return;
      event.preventDefault();
      this.touch = { pointer: event.pointerId, axis };
      button.setPointerCapture(event.pointerId);
    }, { signal });
    for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      button.addEventListener(kind, event => {
        if (event.pointerId === this.touch?.pointer) this.touch = undefined;
      }, { signal });
    }
    return button;
  }

  private keyDown(event: KeyboardEvent): void {
    if (!this.preview.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); this.closePreview(); }
      if (event.key === 'Tab') {
        event.preventDefault();
        const controls = this.share.hidden || this.share.disabled
          ? [this.back, this.download] : [this.back, this.download, this.share];
        const index = controls.findIndex(control => control === document.activeElement);
        const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0)
          : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        controls[next]?.focus();
      }
      return;
    }
    if (event.key === 'Escape' && !this.paused) {
      event.preventDefault();
      this.onReturn();
      return;
    }
    if (!this.active || ![...LEFT_KEYS, ...RIGHT_KEYS].includes(event.code)) return;
    event.preventDefault();
    this.keys.add(event.code);
  }

  private get active(): boolean { return !this.paused && !this.capturing && this.preview.hidden === true; }
  private get atSpot(): boolean { return Math.abs(this.actor.x - PHOTO_X) <= SPOT_RADIUS; }
  private clearInput(): void { this.keys.clear(); this.touch = undefined; }
  private refresh(): void {
    this.capture.disabled = !this.atSpot || !this.active;
    bindText(this.hint, this.atSpot ? 'postcardReady' : 'postcardWalkHint');
  }

  private async takePhoto(): Promise<void> {
    if (!this.active || !this.atSpot) return;
    this.clearInput();
    this.capturing = true;
    this.refresh();
    this.animation.update('EMOTE', 0, this.direction, 0, 0, 0, 'emote', .4);
    try {
      const photo = this.extract(this.scenery, new Rectangle(405, 113, 540, 340));
      const blob = await postcardPng(photo, `PawHaven · ${t('postcardWalk')}`);
      if (this.destroyed) return;
      this.previewUrl = URL.createObjectURL(blob);
      this.image.src = this.download.href = this.previewUrl;
      this.prepareShare(blob);
      this.hud.inert = true;
      this.preview.hidden = false;
      (this.share.hidden || this.share.disabled ? this.download : this.share).focus();
      this.shutter?.();
    } catch {
      if (!this.destroyed) bindText(this.hint, 'postcardFailed');
    } finally {
      this.capturing = false;
      if (!this.destroyed) this.capture.disabled = !this.atSpot || !this.active;
    }
  }

  private prepareShare(blob: Blob): void {
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return;
    try {
      const file = new File([blob], POSTCARD_FILENAME, { type: 'image/png' });
      if (!navigator.canShare({ files: [file] })) return;
      this.shareFile = file;
      this.share.hidden = false;
      this.share.disabled = this.sharing;
    } catch { /* PNG download remains available. */ }
  }

  private async sharePostcard(): Promise<void> {
    const file = this.shareFile;
    if (!file || this.sharing || this.preview.hidden) return;
    this.sharing = this.share.disabled = true;
    this.shareStatus.hidden = true;
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      if (!cancelled && !this.destroyed && this.shareFile === file) this.shareStatus.hidden = false;
    } finally {
      this.sharing = false;
      if (!this.destroyed) this.share.disabled = false;
    }
  }

  private closePreview(): void {
    this.preview.hidden = true;
    this.hud.inert = false;
    this.releaseImage();
    this.refresh();
    this.capture.focus();
  }

  private releaseImage(): void {
    this.image.removeAttribute('src');
    this.download.removeAttribute('href');
    this.shareFile = undefined;
    this.share.hidden = this.shareStatus.hidden = true;
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = undefined;
  }

  override resize(): void {}
  override setPaused(paused: boolean): void { this.paused = paused; this.clearInput(); this.refresh(); }
  override update(seconds: number): void {
    if (!this.active || seconds <= 0) return;
    const axis = this.touch?.axis ?? (Number(RIGHT_KEYS.some(key => this.keys.has(key))) - Number(LEFT_KEYS.some(key => this.keys.has(key))));
    const x = this.actor.x;
    const wasAtSpot = this.atSpot;
    this.actor.x = Math.max(90, Math.min(890, x + axis * WALK_SPEED * seconds));
    if (axis) this.direction = Math.sign(axis);
    this.elapsed += seconds;
    this.animation.update(this.actor.x === x ? 'IDLE' : 'WANDER', this.elapsed, this.direction, 0, 0, seconds);
    if (this.atSpot !== wasAtSpot) this.refresh();
  }

  override destroy(options?: DestroyOptions): void {
    this.abort.abort();
    this.releaseImage();
    this.hud.remove();
    this.preview.remove();
    super.destroy(options);
  }
}
