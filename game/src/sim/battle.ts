import type { Battle, Cohort, Flag, General, Side, Unit } from './types'
import { makeRng } from './rng'
import type { Snapshot, UnitSpec } from '../snapshot'

// 전투 코어: 스냅샷 → 상태 생성 + 고정 timestep 틱 (doc/05 5.6.4).
// 1단계 A는 뼈대만 — 이동(B)·전투(C)는 이후 단계.

export const DEFAULT_DEPTH = 10        // 대형 최소 두께 (doc/03 3.6.2)
const GENERAL_UNIT_SIZE = 10           // 장수 유닛 크기(기준)
const RADIUS_PER_100 = 30              // 통솔 100 → 장수유닛 30배 반경 (doc/03 3.2.1)
const FLAG_HP = 500                    // 부대군기 HP (임시)

/** 통솔 → 지휘 반경 (doc/03 3.2.1) */
export function commandRadius(command: number): number {
  return (command / 100) * RADIUS_PER_100 * GENERAL_UNIT_SIZE
}

function buildCohort(spec: { kind: Cohort['kind']; men: number }, anchor: Cohort['anchor'], facing: number): Cohort {
  return {
    kind: spec.kind,
    aliveHP: spec.men,
    woundedHP: 0,
    anchor: { ...anchor },
    facing,
    depth: DEFAULT_DEPTH,
    stance: 'idle',
    target: null,
  }
}

function buildUnit(side: Side, spec: UnitSpec): Unit {
  const general: General = {
    command: spec.general.command,
    might: spec.general.might,
    intel: spec.general.intel,
    hp: spec.general.hp,
    maxHp: spec.general.hp,
    state: 'out',
    pos: { ...spec.anchor },
  }
  const flag: Flag = {
    pos: { ...spec.anchor },
    commandRadius: commandRadius(spec.general.command),
    hp: FLAG_HP,
    maxHp: FLAG_HP,
    broken: false,
  }
  return {
    side,
    morale: 50,
    general,
    flag,
    cohorts: spec.cohorts.map((c) => buildCohort(c, spec.anchor, spec.facing)),
  }
}

export function createBattle(snap: Snapshot): Battle {
  return {
    terrain: { kind: snap.terrain.kind },
    units: {
      A: buildUnit('A', snap.units.A),
      B: buildUnit('B', snap.units.B),
    },
    time: 0,
    tick: 0,
    phase: 'deploy',
    rng: makeRng(snap.seed),
  }
}

/** 고정 timestep 한 틱. 1A는 시간만 진행(이동=B, 전투=C에서 추가). */
export function step(battle: Battle, dtMs: number): void {
  battle.time += dtMs
  battle.tick += 1
  // TODO(B): 이동/회전(이동력·회전속도, 모임→펼침, 기병 가속·선회)
  // TODO(C): 전선 접촉 → 접전 폭 → 피해(공속·치명율) → 사기 → 종료(사기0)·도주
}

// --- 로깅/검증 헬퍼 ---
export const unitMen = (u: Unit): number =>
  u.cohorts.reduce((n, c) => n + c.aliveHP + c.woundedHP, 0)

export const cohortWidth = (c: Cohort): number =>
  Math.ceil((c.aliveHP + c.woundedHP) / c.depth) // 대형 폭(명) = 병력 ÷ 두께
