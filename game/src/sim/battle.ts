import type { Battle, Cohort, Flag, General, Side, Unit, Vec } from './types'
import { makeRng } from './rng'
import { angleDiff, approachAngle, dist } from './mathutil'
import type { Snapshot, UnitSpec } from '../snapshot'
import { CONFIG } from '../data/config'
import { TROOPS } from '../data/units'
import { coef } from '../data/grades'

// 전투 코어: 스냅샷 → 상태 + 고정 timestep 틱 (doc/05 5.6.4).
// 1단계 A: 데이터/틱 뼈대. 1단계 B: 이동/배치·회전·모임펼침·기병 선회·명령반경 gating.
// (전투 C, 사기 D 이후)

/** 통솔 → 지휘 반경 (doc/03 3.2.1): 100 → 장수유닛 30배 */
export function commandRadius(command: number): number {
  return (command / 100) * CONFIG.radiusPer100 * CONFIG.generalUnitSize
}

function buildCohort(spec: { kind: Cohort['kind']; men: number }, anchor: Vec, facing: number): Cohort {
  return {
    kind: spec.kind,
    aliveHP: spec.men,
    woundedHP: 0,
    anchor: { ...anchor },
    facing,
    depth: CONFIG.depth,
    stance: 'idle',
    target: null,
    spread: CONFIG.spreadDeployed,
    curSpeed: 0,
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
    hp: CONFIG.flagHp,
    maxHp: CONFIG.flagHp,
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
    units: { A: buildUnit('A', snap.units.A), B: buildUnit('B', snap.units.B) },
    time: 0,
    tick: 0,
    phase: 'deploy',
    rng: makeRng(snap.seed),
  }
}

// --- 명령 (doc/04 4.5.2, 4.5.3) ---

/** 병종이 부대군기 명령반경 안에 있어 명령을 받을 수 있는가 (반경 밖=선택 불가). */
export function canCommand(unit: Unit, cohort: Cohort): boolean {
  return dist(cohort.anchor, unit.flag.pos) <= unit.flag.commandRadius
}

/** 이동/배치 명령. 반경 밖이면 거부. 목표 지점은 반경 무관. 성공 여부 반환. */
export function moveCohort(unit: Unit, index: number, target: Vec): boolean {
  const c = unit.cohorts[index]
  if (!canCommand(unit, c)) return false
  c.target = { ...target }
  c.stance = 'move'
  return true
}

// --- 틱 ---

function stepCohort(c: Cohort, dt: number): void {
  const stats = TROOPS[c.kind]
  const moveSpeed = CONFIG.moveBase * coef(stats.move)

  if (c.target) {
    const dx = c.target.x - c.anchor.x
    const dy = c.target.y - c.anchor.y
    const d = Math.hypot(dx, dy)
    const desired = Math.atan2(dy, dx)

    if (c.kind === 'cavalry') {
      // 가속(2초에 걸쳐 최대속도) + 선회(제자리 회전 불가, 호를 그림)
      c.curSpeed = Math.min(moveSpeed, c.curSpeed + (moveSpeed / CONFIG.cavAccelTime) * dt)
      const turnRadius = CONFIG.generalUnitSize * CONFIG.cavTurnRadiusMult
      const maxTurn = (c.curSpeed / turnRadius) * dt
      c.facing = approachAngle(c.facing, desired, maxTurn)
      const adv = c.curSpeed * dt
      c.anchor.x += Math.cos(c.facing) * adv // 항상 facing 방향으로 전진
      c.anchor.y += Math.sin(c.facing) * adv
      if (d < CONFIG.cavArriveDist) { c.target = null; c.stance = 'idle' }
    } else {
      // 보병: 제자리 회전(대열 유지) 후, 정렬되면 전진
      const turnSpeed = CONFIG.turnBase * coef(stats.turn)
      c.facing = approachAngle(c.facing, desired, turnSpeed * dt)
      if (Math.abs(angleDiff(c.facing, desired)) < CONFIG.moveAlignTol) {
        const step = Math.min(d, moveSpeed * dt)
        c.anchor.x += Math.cos(desired) * step
        c.anchor.y += Math.sin(desired) * step
        if (d < CONFIG.arriveDist) { c.target = null; c.stance = 'idle' }
      }
    }
  } else if (c.kind === 'cavalry' && c.curSpeed > 0) {
    c.curSpeed = Math.max(0, c.curSpeed - moveSpeed * dt) // 정지 시 감속
  }

  // 모임(이동) → 펼침(정지)
  const targetSpread = c.target ? CONFIG.spreadMoving : CONFIG.spreadDeployed
  c.spread += (targetSpread - c.spread) * Math.min(1, dt * CONFIG.spreadRate)
}

/** 고정 timestep 한 틱. */
export function step(battle: Battle, dtMs: number): void {
  const dt = dtMs / 1000
  battle.time += dtMs
  battle.tick += 1
  for (const side of ['A', 'B'] as Side[]) {
    for (const c of battle.units[side].cohorts) stepCohort(c, dt)
  }
  // TODO(C): 전선 접촉 → 접전 폭 → 피해(공속·치명율) → 사기 → 종료·도주
}

// --- 로깅/검증 헬퍼 ---
export const unitMen = (u: Unit): number =>
  u.cohorts.reduce((n, c) => n + c.aliveHP + c.woundedHP, 0)

/** 대형 폭(명) = (병력 ÷ 두께) × spread */
export const cohortWidth = (c: Cohort): number =>
  Math.ceil(((c.aliveHP + c.woundedHP) / c.depth) * c.spread)
