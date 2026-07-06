// 능력치 등급 → 수치 (doc/07 7.2, doc/03 3.6.2)
// S/A/B/C/D/E = 100/90/80/70/60/50. 치명율만 ÷10.

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E'

export const GRADE_VALUE: Record<Grade, number> = {
  S: 100, A: 90, B: 80, C: 70, D: 60, E: 50,
}

/** 배율(0.5~1.0). 대립 계산은 보통 내÷상대로 쓴다. */
export const coef = (g: Grade): number => GRADE_VALUE[g] / 100

/** 치명율(전사 비율): 배율 ÷ 10 = 10~5% → 0.10~0.05 */
export const lethalityFrac = (g: Grade): number => GRADE_VALUE[g] / 1000
