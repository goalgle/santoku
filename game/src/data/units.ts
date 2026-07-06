import type { Grade } from './grades'

// 병종 로스터 & 능력치 등급 (doc/07 7.2)
// 병종간 상성 미도입 — 능력치·지형·facing으로 차별화.
// 깃발병 = 부대군기(별도, Flag)이므로 전투 Cohort 로스터에는 없음.

export type TroopKind = 'shield' | 'spear' | 'bow' | 'cavalry'

export interface TroopStats {
  attack: Grade   // 공격
  defense: Grade  // 방어
  move: Grade     // 이동
  turn: Grade     // 회전(방향 전환)
  range: Grade    // 사거리
  stop: Grade     // 저지(상대 이동력 감소); 기병=E=돌파
  atkSpeed: Grade // 공속
  lethal: Grade   // 치명율(전사:부상 분배)
}

// ˟ = 역할 기반 제안(확인 필요): 방패 방어 A, 기병 사거리 D, 치명율 초안값.
export const TROOPS: Record<TroopKind, TroopStats> = {
  shield:  { attack: 'C', defense: 'A', move: 'C', turn: 'B', range: 'D', stop: 'B', atkSpeed: 'C', lethal: 'C' },
  spear:   { attack: 'B', defense: 'B', move: 'B', turn: 'A', range: 'C', stop: 'A', atkSpeed: 'A', lethal: 'B' },
  bow:     { attack: 'B', defense: 'C', move: 'B', turn: 'A', range: 'A', stop: 'A', atkSpeed: 'B', lethal: 'D' },
  cavalry: { attack: 'A', defense: 'B', move: 'A', turn: 'D', range: 'D', stop: 'E', atkSpeed: 'S', lethal: 'A' },
}

export const TROOP_NAME: Record<TroopKind, string> = {
  shield: '방패병', spear: '창병', bow: '궁병', cavalry: '기병',
}
