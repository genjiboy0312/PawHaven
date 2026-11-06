import type { HomeSnapshot, HomeState } from './HomeState';

/** Bounded, scene-owned edit history; snapshots never enter account storage. */
export class HomeHistory {
  private readonly back: HomeSnapshot[] = [];
  private readonly forward: HomeSnapshot[] = [];
  private readonly listeners = new Set<() => void>();
  private expected: string;
  constructor(private readonly state: HomeState) { this.expected = this.signature(); }
  private signature(): string { return JSON.stringify(this.state.snapshot()); }
  get canUndo(): boolean { return this.back.length > 0 && this.expected === this.signature(); }
  get canRedo(): boolean { return this.forward.length > 0 && this.expected === this.signature(); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(): void { this.listeners.forEach(listener => listener()); }
  private push(stack: HomeSnapshot[], snapshot: HomeSnapshot): void { stack.push(snapshot); if (stack.length > 3) stack.shift(); }
  /** External state changes invalidate history instead of overwriting a newer save. */
  reconcile(): void { if (this.expected !== this.signature()) this.clear(); }
  clear(): void { this.back.length = this.forward.length = 0; this.expected = this.signature(); this.emit(); }
  apply(action: () => void): boolean {
    this.reconcile();
    const before = this.state.snapshot(); action();
    const next = this.signature(); if (next === this.expected) return false;
    this.push(this.back, before); this.forward.length = 0; this.expected = next; this.emit(); return true;
  }
  undo(): boolean { return this.restore(this.back, this.forward); }
  redo(): boolean { return this.restore(this.forward, this.back); }
  private restore(from: HomeSnapshot[], to: HomeSnapshot[]): boolean {
    this.reconcile();
    const target = from.at(-1); if (!target) return false;
    const current = this.state.snapshot();
    if (!this.state.restore(target)) { this.clear(); return false; }
    from.pop(); this.push(to, current); this.expected = this.signature(); this.emit(); return true;
  }
  destroy(): void { this.listeners.clear(); this.clear(); }
}
