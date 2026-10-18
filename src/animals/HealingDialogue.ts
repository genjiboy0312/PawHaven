import { getLanguage, type Language } from '../settings/i18n';

/** Content stays separate from bubble appearance and account storage. */
export const HEALING_LINES: readonly Record<Language, string>[] = [
  { ko: '오늘도 고생 많았어.\n우리 내일도 힘내자!', en: 'You did well today.\nLet’s take on tomorrow together!' },
  { ko: '오늘은 푹 쉬어.\n내일 또 만나면 좋겠다.', en: 'Rest well today.\nI’d love to see you again tomorrow.' },
  { ko: '오늘도 만나러 와 줘서 고마워.\n같이 있으니까 참 좋다.', en: 'Thanks for visiting today.\nI love spending time with you.' },
  { ko: '힘든 날에도 난 네 편이야.\n잠깐 쉬어 가도 괜찮아.', en: 'I’m here, even on hard days.\nIt’s okay to take a break.' },
  { ko: '내일도 나 만나러 와 줘.\n우리 같이 놀자!', en: 'Come see me again tomorrow.\nLet’s play together!' },
  { ko: '오늘은 그냥 같이 있자.\n네가 와 줘서 행복해.', en: 'Let’s just be together today.\nI’m happy you’re here.' },
];

const NAMED_LINES: Readonly<Partial<Record<number, Record<Language, string>>>> = {
  0: { ko: '{name}님,\n오늘도 고생 많았어요.\n우리 내일도 힘내요!', en: '{name},\nYou did well today.\nLet’s take on tomorrow together!' },
  2: { ko: '{name}님,\n오늘도 만나러 와 주셔서 고마워요.\n함께 있으니 참 좋아요.', en: '{name},\nThanks for visiting today.\nI love spending time with you.' },
  5: { ko: '{name}님,\n오늘은 그냥 같이 쉬어요.\n와 주셔서 행복해요.', en: '{name},\nLet’s just be together today.\nI’m happy you’re here.' },
};

export class HealingDialogue {
  private last = -1;
  private remaining = 0;
  duration = 0;
  constructor(private readonly random: () => number = Math.random, private readonly nickname: () => string | null | undefined = () => undefined) {}
  get remainingTime(): number { return this.remaining; }
  get active(): boolean { return this.remaining > 0; }
  private line(language: Language): string {
    const name = this.nickname()?.trim();
    const named = NAMED_LINES[this.last]?.[language];
    return named && name && /^[A-Za-z0-9가-힣_]{2,16}$/.test(name)
      ? named.replace('{name}', name) : HEALING_LINES[this.last]![language];
  }
  get message(): string { return this.active ? this.line(getLanguage()) : ''; }
  start(replace = false): boolean {
    if (this.active && !replace) return false;
    // Sample from all entries except the previous one, including a constant RNG.
    const count = HEALING_LINES.length - (this.last < 0 ? 0 : 1);
    const sample = this.random();
    let next = Math.floor(Math.max(0, Math.min(0.999999, Number.isFinite(sample) ? sample : 0)) * count);
    if (this.last >= 0 && next >= this.last) next++;
    this.last = next;
    const length = Math.max(...(['ko', 'en'] as const).map(language => Array.from(this.line(language)).length));
    this.duration = Math.max(4.5, Math.min(7, 2 + length * 0.065));
    this.remaining = this.duration;
    return true;
  }
  update(seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0) this.remaining = Math.max(0, this.remaining - seconds);
  }
  clear(): void { this.remaining = 0; }
}
