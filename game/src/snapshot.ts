import type { TroopKind } from './data/units'
import type { TerrainKey } from './data/terrain'

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
  terrain: TerrainKey
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
  terrain: 'plain',
  units: {
    // 모바일 세로 화면 → 상하 대립. A=위(전면 아래), B=아래(전면 위).
    A: {
      anchor: { x: 0, y: -280 },
      facing: Math.PI / 2, // 전면 = +y (아래의 B를 향함)
      general: { command: 70, might: 75, intel: 60, hp: 100 },
      cohorts: ROSTER.map((c) => ({ ...c })),
    },
    B: {
      anchor: { x: 0, y: 280 },
      facing: -Math.PI / 2, // 전면 = -y (위의 A를 향함)
      general: { command: 70, might: 75, intel: 60, hp: 100 },
      cohorts: ROSTER.map((c) => ({ ...c })),
    },
  },
}
