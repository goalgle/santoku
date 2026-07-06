import type { TroopKind } from './data/units'

// 교전 스냅샷 = 전술 레이어의 입력 (doc/04 4.6, doc/05 5.6.1).
// v0는 하드코딩. 1:1 대칭, 부대당 방패1000·창600·궁400·기200 + 장수.

export interface CohortSpec { kind: TroopKind; men: number }
export interface GeneralSpec { command: number; might: number; intel: number; hp: number }
export interface UnitSpec {
  anchor: { x: number; y: number }
  facing: number
  general: GeneralSpec
  cohorts: CohortSpec[]
}
export interface Snapshot {
  seed: number
  terrain: { kind: string }
  units: { A: UnitSpec; B: UnitSpec }
}

const ROSTER: CohortSpec[] = [
  { kind: 'shield', men: 1000 },
  { kind: 'spear', men: 600 },
  { kind: 'bow', men: 400 },
  { kind: 'cavalry', men: 200 },
]

export const V0_SNAPSHOT: Snapshot = {
  seed: 20260706,
  terrain: { kind: 'plain' },
  units: {
    A: {
      anchor: { x: -280, y: 0 },
      facing: 0, // 전면 = +x (오른쪽의 B를 향함)
      general: { command: 70, might: 75, intel: 60, hp: 100 },
      cohorts: ROSTER.map((c) => ({ ...c })),
    },
    B: {
      anchor: { x: 280, y: 0 },
      facing: Math.PI, // 전면 = -x (왼쪽의 A를 향함)
      general: { command: 70, might: 75, intel: 60, hp: 100 },
      cohorts: ROSTER.map((c) => ({ ...c })),
    },
  },
}
