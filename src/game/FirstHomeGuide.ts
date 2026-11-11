export type FirstHomeStep = 'pet' | 'race' | 'shop' | 'place' | 'done';
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
const STEPS: FirstHomeStep[] = ['pet', 'race', 'shop', 'place', 'done'];

export class FirstHomeGuide {
  private step: FirstHomeStep;
  private readonly key: string;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: StorageAccess | undefined, owner: string | null, hasHome: boolean, hasFinishedRace: boolean) {
    this.key = owner ? `pawhaven.account.${owner}.first-home.v1` : 'pawhaven.first-home.v1';
    let saved: string | null = null;
    try { saved = storage?.getItem(this.key) ?? null; } catch { /* Keep session progress. */ }
    this.step = STEPS.find(step => step === saved) ?? 'pet';
    if (hasHome) this.advance('done');
    else if (hasFinishedRace && (this.step === 'pet' || this.step === 'race')) this.advance('shop');
  }

  get current(): FirstHomeStep { return this.step; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  pet(): void { if (this.step === 'pet') this.advance('race'); }
  finishRace(): boolean {
    if (this.step !== 'pet' && this.step !== 'race') return false;
    this.advance('shop');
    return true;
  }
  buyFurniture(): void { if (this.step === 'shop') this.advance('place'); }
  dismiss(): void { this.advance('done'); }

  private advance(step: FirstHomeStep): void {
    if (step === this.step) return;
    this.step = step;
    try { this.storage?.setItem(this.key, step); } catch { /* Keep session progress. */ }
    this.listeners.forEach(listener => listener());
  }
}
