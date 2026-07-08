import type { Battle, Cohort, Flag, General, Side, Terrain, Unit, Vec } from './types'
import { makeRng } from './rng'
import { angleDiff, approachAngle, dist } from './mathutil'
import type { Snapshot, UnitSpec } from '../snapshot'
import { CONFIG } from '../data/config'
import { TROOPS } from '../data/units'
import { coef, lethalityFrac } from '../data/grades'
import { TERRAINS } from '../data/terrain'

/** 고지대면 1, 평지 0 (doc/07 7.3) */
const elevationAt = (terrain: Terrain, p: Vec): number => {
  for (const h of terrain.hills) {
    if ((p.x - h.x) ** 2 + (p.y - h.y) ** 2 <= h.radius * h.radius) return 1
  }
  return 0
}

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
    inMelee: false,
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
    meleeTime: 0,
    boostGiven: false,
  }
  const flag: Flag = {
    pos: { ...spec.anchor },
    commandRadius: commandRadius(spec.general.command),
    hp: CONFIG.flagHp,
    maxHp: CONFIG.flagHp,
    broken: false,
  }
  // 대형 배치: 앞 병종(로스터 순)을 전면에, 나머지는 바로 뒤로 촘촘히 스택(같은 진영 겹침 허용)
  const facingDir = { x: Math.cos(spec.facing), y: Math.sin(spec.facing) }
  const stepBack = CONFIG.formationDepthGap
  const cohorts = spec.cohorts.map((c) => buildCohort(c, spec.anchor, spec.facing))
  cohorts.forEach((c, i) => {
    c.anchor = { x: spec.anchor.x - facingDir.x * stepBack * i, y: spec.anchor.y - facingDir.y * stepBack * i }
  })
  return { side, morale: CONFIG.moraleStart, general, flag, cohorts }
}

export function createBattle(snap: Snapshot): Battle {
  const A = buildUnit('A', snap.units.A)
  const B = buildUnit('B', snap.units.B)
  return {
    terrain: { ...TERRAINS[snap.terrain] },
    units: { A, B },
    time: 0,
    tick: 0,
    phase: 'deploy',
    rng: makeRng(snap.seed),
    initialMen: { A: unitMen(A), B: unitMen(B) },
    loser: null,
    routTime: 0,
    result: null,
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

// --- 전투 (doc/03 3.6.2, 접전 폭 기하 doc/05 5.6.5) ---

/** 현재 활성 대형 폭(명) = (전사가능 병력 ÷ 두께) × spread */
const activeWidthMen = (c: Cohort): number => (c.aliveHP / c.depth) * c.spread

/**
 * 접전 폭(실효 전면, 명). 전면 선분 모델:
 *  - 마주보고(facing 반대) + 전면이 접촉거리 안일 때
 *  - 두 전면 선분을 접촉축(AB 수직)에 투영한 겹침 길이.
 */
function frontageOverlapMen(a: Cohort, b: Cohort, terrain: Terrain): number {
  const fa = { x: Math.cos(a.facing), y: Math.sin(a.facing) }
  const fb = { x: Math.cos(b.facing), y: Math.sin(b.facing) }
  if (fa.x * fb.x + fa.y * fb.y > -0.2) return 0 // 서로 마주보지 않음

  const frontA = (a.depth * CONFIG.spacing) / 2
  const frontB = (b.depth * CONFIG.spacing) / 2
  const sep = dist(a.anchor, b.anchor)
  if (sep > frontA + frontB + CONFIG.contactSlop) return 0 // 전면이 안 닿음

  // 접촉축 = AB 방향의 수직
  let abx = b.anchor.x - a.anchor.x
  let aby = b.anchor.y - a.anchor.y
  const abl = Math.hypot(abx, aby) || 1
  abx /= abl; aby /= abl
  const axx = -aby, axy = abx

  const Fa = { x: a.anchor.x + fa.x * frontA, y: a.anchor.y + fa.y * frontA }
  const Fb = { x: b.anchor.x + fb.x * frontB, y: b.anchor.y + fb.y * frontB }
  const pa = Fa.x * axx + Fa.y * axy
  const pb = Fb.x * axx + Fb.y * axy
  const ha = (activeWidthMen(a) * CONFIG.spacing) / 2
  const hb = (activeWidthMen(b) * CONFIG.spacing) / 2

  const overlapPx = Math.max(0, Math.min(pa + ha, pb + hb) - Math.max(pa - ha, pb - hb))
  return Math.min(overlapPx / CONFIG.spacing, terrain.chokeWidth) // 병목(애로/다리) 상한
}

/** 병종 최대 이동속도 */
export const maxSpeed = (kind: Cohort['kind']): number => CONFIG.moveBase * coef(TROOPS[kind].move)

/** 기병이 최대속도 근처 = charge 상태 (doc/04 4.5.3) */
export const isCharging = (c: Cohort): boolean =>
  c.kind === 'cavalry' && c.curSpeed >= CONFIG.chargeThreshold * maxSpeed('cavalry')

/** attacker → target 근접 피해 1틱. 접전 폭 × 공속 × 공/방 → 전사/부상. charge·저지 반영. */
function applyMelee(attacker: Cohort, target: Cohort, overlapMen: number, dt: number, terrain: Terrain): void {
  const atk = TROOPS[attacker.kind]
  const def = TROOPS[target.kind]
  const attackUnits = overlapMen / CONFIG.attackUnit
  const atkCoef = isCharging(attacker) ? coef('S') : coef(atk.attack)     // charge: 공격 A→S
  const defCoef = coef(def.defense) * (isCharging(target) ? CONFIG.chargeDefMult : 1) // charge: 방어 보정
  // 고지 → 저지 하향 공격 +20% (doc/04 4.8)
  const hill = elevationAt(terrain, attacker.anchor) > elevationAt(terrain, target.anchor) ? CONFIG.hillAttackBonus : 1
  const dps = attackUnits * coef(atk.atkSpeed) * (atkCoef / defCoef) * CONFIG.damageScale * hill
  const dmg = Math.min(dps * dt, target.aliveHP)
  target.aliveHP -= dmg
  target.woundedHP += dmg * (1 - lethalityFrac(atk.lethal))
  // 저지: 공격자가 상대 속도를 늦춤 → 기병 감속 시 charge 무효. (기병=저지 E=거의 못 늦춤=돌파)
  target.curSpeed = Math.max(0, target.curSpeed - coef(atk.stop) * CONFIG.stopScale * dt)
}

// --- 궁병 사격 (doc/03 3.6.2): 정지 시만, 전열 병목 없이 사거리 내 전원 사격 ---

function applyRanged(bow: Cohort, target: Cohort, dt: number): void {
  const atk = TROOPS[bow.kind]
  const def = TROOPS[target.kind]
  const dps = bow.aliveHP * (coef(atk.attack) / coef(def.defense)) * CONFIG.rangedScale
  const dmg = Math.min(dps * dt, target.aliveHP)
  target.aliveHP -= dmg
  target.woundedHP += dmg * (1 - lethalityFrac(atk.lethal)) // 궁=저치명(부상 위주)
}

function rangedPass(battle: Battle, dt: number): void {
  const baseRange = CONFIG.rangeBase * coef(TROOPS.bow.range)
  for (const [side, foe] of [['A', 'B'], ['B', 'A']] as [Side, Side][]) {
    for (const c of battle.units[side].cohorts) {
      if (c.kind !== 'bow' || c.target !== null || c.aliveHP <= 0) continue // 이동 중엔 사격 없음
      const range = baseRange * (elevationAt(battle.terrain, c.anchor) > 0 ? CONFIG.hillRangeBonus : 1) // 고지 사거리 +30%
      const frontC = (c.depth * CONFIG.spacing) / 2
      let best: Cohort | null = null
      let bestD = Infinity
      let inMelee = false
      for (const e of battle.units[foe].cohorts) {
        if (e.aliveHP <= 0) continue
        const frontE = (e.depth * CONFIG.spacing) / 2
        const anchorD = dist(c.anchor, e.anchor)
        if (anchorD <= frontC + frontE + CONFIG.contactSlop) { inMelee = true; break } // 근접 접촉 → 사격 불가(근접 취약)
        const d = anchorD - frontE
        if (d <= range && d < bestD) { bestD = d; best = e }
      }
      if (!inMelee && best) applyRanged(c, best, dt)
    }
  }
}

// --- 사기 & 도주/종료 (doc/03 3.6.1, doc/04 4.8) ---

const unitAlive = (u: Unit): number => u.cohorts.reduce((n, c) => n + c.aliveHP, 0)

function dropMorale(u: Unit, casualties: number, dt: number): void {
  u.morale = Math.max(0, u.morale - (CONFIG.moraleBaseDrop * dt + casualties * CONFIG.moralePerCasualty))
}

function startRout(battle: Battle, loser: Side): void {
  battle.phase = 'rout'
  battle.loser = loser
  battle.routTime = 0
}

function endBattle(battle: Battle): void {
  const winner: Side = battle.loser === 'A' ? 'B' : 'A'
  const men = unitMen(battle.units[winner])
  const ratio = men / battle.initialMen[winner]
  const degree = ratio >= CONFIG.degreeWin ? '대승리' : ratio >= CONFIG.degreeMid ? '승리' : '안타까운 승리'
  battle.result = { winner, degree, ratio, winnerMen: men }
  // 장수 생사: 종료 시점 HP비 ≥50% → 대기(재출전) / 미만 → 부상·사망 (doc/03 3.6.1, 07 7.1)
  for (const s of ['A', 'B'] as Side[]) {
    const g = battle.units[s].general
    if (g.state === 'out' || g.state === 'rest') {
      g.state = g.hp / g.maxHp >= CONFIG.generalStandbyHp ? 'standby' : 'lost'
    }
  }
  battle.phase = 'ended'
}

// --- 장수 (doc/07 7.1): 일기토 · HP 0→휴식·리젠 · 근접 지속→사기↑ ---

function duel(attacker: Unit['general'], target: Unit['general'], dt: number): void {
  target.hp -= CONFIG.duelBase * (attacker.might / 100) * dt // 무력 기반
}

function handleGeneral(unit: Unit, dt: number): void {
  const g = unit.general
  if (g.state === 'out' && g.hp <= 0) {
    g.hp = 0; g.state = 'rest'; g.meleeTime = 0 // HP 0 → 부대군기로 휴식
  } else if (g.state === 'rest') {
    const f = unit.flag.pos
    const dx = f.x - g.pos.x, dy = f.y - g.pos.y, d = Math.hypot(dx, dy)
    if (d > 2) {
      const s = Math.min(d, CONFIG.generalMoveSpeed * dt)
      g.pos.x += (dx / d) * s; g.pos.y += (dy / d) * s
    } else {
      g.hp = Math.min(g.maxHp, g.hp + CONFIG.generalRegen * dt) // 리젠
      if (g.hp >= g.maxHp) g.state = 'out' // 재출진
    }
  }
}

function stepGenerals(battle: Battle, dt: number): void {
  const A = battle.units.A, B = battle.units.B
  const gA = A.general, gB = B.general
  // 일기토: 둘 다 출진 & 근거리
  if (gA.state === 'out' && gB.state === 'out' && dist(gA.pos, gB.pos) <= CONFIG.generalRange) {
    duel(gA, gB, dt); duel(gB, gA, dt)
    for (const u of [A, B]) {
      const g = u.general
      g.meleeTime += dt // 근접 지속 → 사기 1회↑ (기본 규칙)
      if (!g.boostGiven && g.meleeTime >= CONFIG.generalMeleeForMorale) {
        u.morale = Math.min(100, u.morale + CONFIG.generalMoraleBoost)
        g.boostGiven = true
      }
    }
  }
  handleGeneral(A, dt)
  handleGeneral(B, dt)
}

function stepRout(battle: Battle, dt: number): void {
  battle.routTime += dt
  const loser = battle.units[battle.loser as Side]
  for (const c of loser.cohorts) {
    c.aliveHP = Math.max(0, c.aliveHP - c.aliveHP * CONFIG.routKillRate * dt) // 도주 중 속수무책
  }
  if (battle.routTime >= CONFIG.routDuration) endBattle(battle)
}

// 반대 진영 충돌: 전면이 edgeOverlap 이상 겹치지 못하게 밀어냄(통과 불가). 기병 돌격은 예외(돌파).
const frontExtent = (c: Cohort): number => (c.depth * CONFIG.spacing) / 2

function resolveCollisions(battle: Battle): void {
  for (const ca of battle.units.A.cohorts) {
    if (ca.aliveHP <= 0) continue
    for (const cb of battle.units.B.cohorts) {
      if (cb.aliveHP <= 0) continue
      if (isCharging(ca) || isCharging(cb)) continue // 돌격 = 돌파(통과 허용)
      const minSep = frontExtent(ca) + frontExtent(cb) - CONFIG.edgeOverlap
      const dx = cb.anchor.x - ca.anchor.x, dy = cb.anchor.y - ca.anchor.y
      const d = Math.hypot(dx, dy)
      if (d >= minSep || d < 0.01) continue
      const nx = dx / d, ny = dy / d
      const push = minSep - d
      const aMove = ca.target !== null, bMove = cb.target !== null
      // 미는 쪽(이동 중)이 막힌다. 양쪽 이동이면 반씩.
      const ha = aMove && bMove ? push / 2 : aMove ? push : 0
      const hb = aMove && bMove ? push / 2 : bMove ? push : 0
      const rest = !aMove && !bMove ? push / 2 : 0 // 둘 다 정지+겹침이면 반씩 분리
      ca.anchor.x -= nx * (ha + rest); ca.anchor.y -= ny * (ha + rest)
      cb.anchor.x += nx * (hb + rest); cb.anchor.y += ny * (hb + rest)
    }
  }
}

/** 고정 timestep 한 틱. */
export function step(battle: Battle, dtMs: number): void {
  const dt = dtMs / 1000
  battle.time += dtMs
  battle.tick += 1
  for (const s of ['A', 'B'] as Side[]) for (const c of battle.units[s].cohorts) c.inMelee = false
  if (battle.phase === 'ended') return
  if (battle.phase === 'rout') { stepRout(battle, dt); return }

  // 이동/회전 → 반대 진영 충돌 해소
  for (const side of ['A', 'B'] as Side[]) {
    for (const c of battle.units[side].cohorts) stepCohort(c, dt)
  }
  resolveCollisions(battle)

  const beforeA = unitAlive(battle.units.A)
  const beforeB = unitAlive(battle.units.B)

  // 궁병 사격 → 근접 전투
  rangedPass(battle, dt)
  let contact = false
  for (const ca of battle.units.A.cohorts) {
    for (const cb of battle.units.B.cohorts) {
      const wMen = frontageOverlapMen(ca, cb, battle.terrain)
      if (wMen <= 0) continue
      contact = true
      ca.inMelee = true; cb.inMelee = true
      applyMelee(ca, cb, wMen, dt, battle.terrain)
      applyMelee(cb, ca, wMen, dt, battle.terrain)
    }
  }
  if (contact && battle.phase === 'deploy') battle.phase = 'engage'

  // 장수: 일기토·휴식/리젠·근접 지속 사기 buff
  stepGenerals(battle, dt)

  // 사기: 이번 틱 사상 기반 하락
  const casA = beforeA - unitAlive(battle.units.A)
  const casB = beforeB - unitAlive(battle.units.B)
  if (casA > 0) dropMorale(battle.units.A, casA, dt)
  if (casB > 0) dropMorale(battle.units.B, casB, dt)

  // 사기 0 → 도주
  const mA = battle.units.A.morale
  const mB = battle.units.B.morale
  if (mA <= 0 || mB <= 0) startRout(battle, mA <= mB ? 'A' : 'B')
}

// --- 로깅/검증 헬퍼 ---
export const unitMen = (u: Unit): number =>
  u.cohorts.reduce((n, c) => n + c.aliveHP + c.woundedHP, 0)

/** 활성 대형 폭(명) = (전사가능 병력 ÷ 두께) × spread */
export const cohortWidth = (c: Cohort): number =>
  Math.ceil((c.aliveHP / c.depth) * c.spread)
