// 시드 고정 결정적 PRNG (mulberry32). 운(運)=시드 RNG (doc/05 5.1, doc/07 7.1).
// 같은 시드 → 같은 수열. sim 안에서 무작위는 반드시 이걸로만(Date.now/Math.random 금지).

export interface Rng {
  readonly seed: number
  /** [0, 1) */
  next(): number
  /** [min, max) */
  range(min: number, max: number): number
  /** 0..n-1 정수 */
  int(n: number): number
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    seed,
    next,
    range: (min, max) => min + next() * (max - min),
    int: (n) => Math.floor(next() * n),
  }
}
