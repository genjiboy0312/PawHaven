export interface CoinRushScore {
  score: number;
  time: number | null;
}

export function coinRushScore(mask = 0): number {
  let score = 0;
  for (let bits = mask; bits; bits >>>= 1) score += bits & 1;
  return score;
}

/** The server supplies accepted masks and full-collection times. */
export function compareCoinRushScores(a: CoinRushScore, b: CoinRushScore): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.time === b.time) return 0;
  return (a.time ?? Infinity) - (b.time ?? Infinity);
}
