import type { AbilityType, Battle, Cohort, Flag, General, Side, Terrain, Unit, Vec } from './types'
import type { TroopKind } from '../data/units'
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
  return (command / 100) * CONFIG.radiusPer100 * CONFIG.generalUnitSize * CONFIG.flagRadiusMult
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
    slow: 0,
    inMelee: false,
    firing: false,
    fireTarget: null,
    chargeRun: false,
    stamina: CONFIG.staminaMax,
    ability: null,
  }
}

/** 목표 설정 + 기병이면 이동 거리로 자동 돌격 판정 (doc/04 4.5.3) */
export function setCohortTarget(c: Cohort, x: number, y: number): void {
  c.target = { x, y }
  c.stance = 'move'
  c.chargeRun = c.kind === 'cavalry' && dist(c.anchor, { x, y }) > CONFIG.chargeDistance
}

function buildUnit(side: Side, spec: UnitSpec): Unit {
  const general: General = {
    command: spec.general.command,
    might: spec.general.might,
    intel: spec.general.intel,
    hp: spec.general.hp,
    maxHp: spec.general.hp,
    state: 'rest', // 시작: 깃발 뒤 대기(출전 명령 전까지)
    pos: { ...spec.anchor },
    meleeTime: 0,
    inCombat: false,
  }
  const flag: Flag = {
    pos: { ...spec.anchor },
    commandRadius: commandRadius(spec.general.command),
    hp: CONFIG.flagHp,
    maxHp: CONFIG.flagHp,
    broken: false,
  }
  const back = side === 'A' ? -1 : 1 // 적 반대쪽(깃발 바로 뒤)
  general.pos = { x: flag.pos.x + back * CONFIG.generalHomeOffset, y: flag.pos.y }
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
  setCohortTarget(c, target.x, target.y)
  return true
}

// --- 전술 어빌리티 (전술 어빌리티 모델) ---

const ABILITY_KIND: Record<AbilityType, TroopKind> = { defend: 'shield', advance: 'spear', charge: 'cavalry', volley: 'bow' }

export function nearestEnemy(battle: Battle, side: Side, from: Vec): Cohort | null {
  const foe: Side = side === 'A' ? 'B' : 'A'
  let best: Cohort | null = null, bestD = Infinity
  for (const e of battle.units[foe].cohorts) {
    if (e.aliveHP <= 0) continue
    const d = dist(from, e.anchor)
    if (d < bestD) { bestD = d; best = e }
  }
  return best
}

/** 어빌리티 발동. 병종·반경·스태미너·중복 확인 후 소모/시작. 성공 여부 반환. */
export function useAbility(battle: Battle, side: Side, index: number, type: AbilityType): boolean {
  const unit = battle.units[side]
  const c = unit.cohorts[index]
  const def = CONFIG.ability[type]
  if (!c || c.kind !== ABILITY_KIND[type] || c.aliveHP <= 0 || c.ability || c.stamina < def.cost || !canCommand(unit, c)) return false
  c.stamina -= def.cost
  c.ability = { type, timer: def.dur, phase: 'out', origin: { ...c.anchor }, path: [] }
  const foe = nearestEnemy(battle, side, c.anchor)
  if (type === 'defend') c.stance = 'defend'
  else if (type === 'volley') c.target = null // 정지 사격
  else if (foe) {
    if (type === 'advance') setCohortTarget(c, foe.anchor.x, foe.anchor.y)
    else if (type === 'charge') {
      // 돌진 루프: 적진(궁병 포함)을 뚫고 반대편까지 → 왼쪽으로 선회 → 출발점 귀환.
      const dx = foe.anchor.x - c.anchor.x, dy = foe.anchor.y - c.anchor.y
      const l = Math.hypot(dx, dy) || 1
      const ux = dx / l, uy = dy / l
      const lx = uy, ly = -ux // 진행방향 기준 왼쪽(선회 방향)
      const T = CONFIG.chargeThrough, W = CONFIG.chargeLoopWidth
      const deep = { x: foe.anchor.x + ux * T, y: foe.anchor.y + uy * T }          // 적 후방(궁병) 관통
      const wheel = { x: foe.anchor.x + lx * W, y: foe.anchor.y + ly * W }         // 왼쪽으로 선회
      c.ability.path = [wheel, { ...c.ability.origin }]                             // deep 도착 후 소비
      setCohortTarget(c, deep.x, deep.y)
      c.chargeRun = true
    }
  }
  return true
}

function endAbility(c: Cohort): void {
  const t = c.ability?.type
  if (t === 'defend') c.stance = 'idle'
  if (t === 'advance' || t === 'charge') { c.target = null; c.stance = 'idle'; c.chargeRun = false }
  c.ability = null
}

/** 스태미너 회복 + 어빌리티 진행(돌진 귀환 등). 매 틱 병종별로. */
function stepAbility(c: Cohort, dt: number): void {
  c.stamina = Math.min(CONFIG.staminaMax, c.stamina + CONFIG.staminaRegen * dt)
  const a = c.ability
  if (!a) return
  a.timer -= dt
  if (a.type === 'charge' && c.target === null) { // 웨이포인트 도착 → 다음 지점(관통→선회→귀환), 없으면 종료
    const next = a.path.shift()
    if (next) { a.phase = 'back'; setCohortTarget(c, next.x, next.y); c.chargeRun = true }
    else { endAbility(c); return }
  }
  if (a.timer <= 0) endAbility(c) // 안전 상한(멀리서 막혔을 때)
}

// --- 틱 ---

function stepCohort(c: Cohort, unit: Unit, dt: number): void {
  const stats = TROOPS[c.kind]
  let moveSpeed = CONFIG.moveBase * coef(stats.move) * CONFIG.moveMult[c.kind] * (1 - c.slow) // 병종 배율 + 저지 감속
  // 아군 겹쳐 이동 시 -30% (기병 예외 — 기병은 겹침/돌파 무페널티, 저지로만 감속)
  if (c.kind !== 'cavalry' && c.target) {
    const rc = (c.depth * CONFIG.spacing) / 2
    for (const o of unit.cohorts) {
      if (o === c || o.aliveHP <= 0) continue
      if (dist(c.anchor, o.anchor) < rc + (o.depth * CONFIG.spacing) / 2) { moveSpeed *= 1 - CONFIG.friendlyOverlapPenalty; break }
    }
  }

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
      if (d < CONFIG.cavArriveDist) { c.target = null; c.stance = 'idle'; c.chargeRun = false }
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
  // spread(모임↔펼침) 갱신은 교전 판정 이후 stepSpread()에서 — 교전 중이면 즉시 펼침으로 복귀
}

/** 대열 폭 갱신: 이동 중=모임, 정지/교전 중=펼침. 교전(inMelee)이면 이동명령이 있어도 즉시 펼침 복귀 */
function stepSpread(battle: Battle, dt: number): void {
  for (const s of ['A', 'B'] as Side[]) for (const c of battle.units[s].cohorts) {
    const targetSpread = c.target && !c.inMelee ? CONFIG.spreadMoving : CONFIG.spreadDeployed
    c.spread += (targetSpread - c.spread) * Math.min(1, dt * CONFIG.spreadRate)
  }
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
export const maxSpeed = (kind: Cohort['kind']): number => CONFIG.moveBase * coef(TROOPS[kind].move) * CONFIG.moveMult[kind]

/** 기병 돌격(돌파) 중 = chargeRun 이동 명령 실행 중. 저지는 감속만 시키므로 파훼 안 됨(도착까지 유지) (doc/04 4.5.3) */
export const isCharging = (c: Cohort): boolean =>
  c.kind === 'cavalry' && c.chargeRun && c.target !== null

/** attacker → target 근접 피해 1틱. 접전 폭 × 공속 × 공/방 → 전사/부상. charge·저지 반영. */
function applyMelee(attacker: Cohort, target: Cohort, overlapMen: number, dt: number, terrain: Terrain): void {
  const atk = TROOPS[attacker.kind]
  const def = TROOPS[target.kind]
  const attackUnits = overlapMen / CONFIG.attackUnit
  // charge 임팩트 = 속도 비례(A→S). 저지로 감속되면 임팩트도 줄어든다(정지시킴이 아니라 약화).
  const chargeFrac = isCharging(attacker) ? Math.max(0, Math.min(1, attacker.curSpeed / maxSpeed('cavalry'))) : 0
  const atkCoef = coef(atk.attack) + (coef('S') - coef(atk.attack)) * chargeFrac
  const defCoef = coef(def.defense) * (isCharging(target) ? CONFIG.chargeDefMult : 1) // charge: 방어 보정
  // 고지 → 저지 하향 공격 +20% (doc/04 4.8)
  const hill = elevationAt(terrain, attacker.anchor) > elevationAt(terrain, target.anchor) ? CONFIG.hillAttackBonus : 1
  // 방어전념(doc/04 4.5.2): 공격자=데미지 0, 방어자=방어 2배
  const attackerMul = attacker.stance === 'defend' ? 0 : 1
  const defendBoost = target.stance === 'defend' ? 2 : 1
  const advanceMul = attacker.ability?.type === 'advance' ? CONFIG.advanceAtkBoost : 1 // 전진 공격 부스트
  const dps = attackUnits * coef(atk.atkSpeed) * (atkCoef / (defCoef * defendBoost)) * CONFIG.damageScale * hill * attackerMul * advanceMul
  const dmg = Math.min(dps * dt, target.aliveHP)
  target.aliveHP -= dmg
  target.woundedHP += dmg * (1 - lethalityFrac(atk.lethal))
  // 저지: 공격자의 저지력 → 상대 이동속도 상한을 일시 저하(감속). 블록 아님, 기병은 계속 돌파하되 느려짐.
  // 창 저지 A가 가장 강하게 감속 → 임팩트↓ + 접전 노출↑로 카운터(정지시키지 않음).
  target.slow = Math.max(target.slow, Math.min(0.9, coef(atk.stop) * CONFIG.stopSlowScale))
}

// --- 궁병 사격 (doc/03 3.6.2): 정지 시만, 전열 병목 없이 사거리 내 전원 사격 ---

function applyRanged(bow: Cohort, target: Cohort, dt: number): void {
  const atk = TROOPS[bow.kind]
  const def = TROOPS[target.kind]
  const volley = bow.ability?.type === 'volley' ? CONFIG.volleyMul : 1 // 일제사 화력 부스트
  const dps = bow.aliveHP * (coef(atk.attack) / coef(def.defense)) * CONFIG.rangedScale * volley
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
      if (!inMelee && best) { c.firing = true; c.fireTarget = { ...best.anchor }; applyRanged(c, best, dt) }
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

/** 출진 장수 ↔ 적 병사 (③ 장수→병사 공격 · ⑤ 병사→장수 1/5 피해).
 *  범위 내 가장 가까운 적 코호트 1개를 무력 기반으로 타격, 접촉한 모든 적 코호트에게서 피해(감쇠). */
function generalVsCohorts(unit: Unit, enemy: Unit, dt: number): void {
  const g = unit.general
  const exposed = unitAlive(unit) <= 0 // 아군 전멸 → 노출: 무적 해제, 대기 중이어도 타겟
  if (g.state !== 'out' && !exposed) return
  let nearest: Cohort | null = null
  let nearD = Infinity
  let incoming = 0
  for (const c of enemy.cohorts) {
    if (c.aliveHP <= 0) continue
    const d = dist(g.pos, c.anchor) - frontExtent(c)
    if (d > CONFIG.generalRange) continue
    incoming += coef(TROOPS[c.kind].attack) // 병사→장수: 공격 등급 합산 (감쇠/증폭은 아래서)
    if (d < nearD) { nearD = d; nearest = c }
  }
  if (nearest && g.state === 'out') { // 출진 시에만 반격
    g.inCombat = true
    nearest.inMelee = true // 장수와 교전 중 → 대열 유지(펼침)·공격 애니
    const dmg = Math.min(nearest.aliveHP, CONFIG.generalDmgToSoldier * (g.might / 100) * dt) // 장수→병사(무력)
    nearest.aliveHP -= dmg
    nearest.woundedHP += dmg * (1 - lethalityFrac('A')) // 장수 = 고치명(A)
    unit.morale = Math.min(100, unit.morale + CONFIG.generalMoraleRate * dt) // ④ 전진 공격 → 사기 지속↑
  }
  if (incoming > 0) {
    g.inCombat = true
    const mult = exposed ? CONFIG.generalExposedMult : CONFIG.generalDmgReduction // ⑤ 평소 1/5, 전멸 시 3배
    g.hp = Math.max(0, g.hp - incoming * CONFIG.soldierDmgToGeneral * mult * dt)
  }
}

/** 깃발 바로 뒤(적 반대쪽) 대기 위치 */
function homePos(unit: Unit): Vec {
  const back = unit.side === 'A' ? -1 : 1
  return { x: unit.flag.pos.x + back * CONFIG.generalHomeOffset, y: unit.flag.pos.y }
}

/** 장수 출전/복귀 토글 (유저 명령). rest↔out, 부상·사망/대기 상태는 무시 */
export function toggleGeneral(battle: Battle, side: Side): void {
  const g = battle.units[side].general
  if (g.state === 'rest') { g.state = 'out'; g.meleeTime = 0 }      // 출전
  else if (g.state === 'out') g.state = 'rest'                       // 복귀
}

function handleGeneral(unit: Unit, enemy: Unit, dt: number): void {
  const g = unit.general
  if (g.state === 'out') {
    if (g.hp <= 0) { g.hp = 0; g.state = 'rest'; g.meleeTime = 0; return } // HP 0 → 강제 복귀
    // 출전: 적 "최전방(가장 가까운) 코호트"로 전진해 교전 거리에서 멈춤(병사 뚫고 적 장수까지 가지 않음)
    let target: Cohort | null = null
    let nearD = Infinity
    for (const c of enemy.cohorts) {
      if (c.aliveHP <= 0) continue
      const d = dist(g.pos, c.anchor) - frontExtent(c)
      if (d < nearD) { nearD = d; target = c }
    }
    if (target && nearD > CONFIG.generalRange * 0.8) { // 교전 거리 밖이면 접근
      const dx = target.anchor.x - g.pos.x, dy = target.anchor.y - g.pos.y, d = Math.hypot(dx, dy) || 1
      const s = Math.min(nearD - CONFIG.generalRange * 0.8, CONFIG.generalMoveSpeed * dt)
      g.pos.x += (dx / d) * s; g.pos.y += (dy / d) * s
    }
  } else if (g.state === 'rest') {
    // 복귀: 깃발 뒤 홈으로 이동 (자동 재출진 없음 — 출전은 명령으로만)
    const h = homePos(unit)
    const dx = h.x - g.pos.x, dy = h.y - g.pos.y, d = Math.hypot(dx, dy)
    if (d > 4) {
      const s = Math.min(d, CONFIG.generalMoveSpeed * dt)
      g.pos.x += (dx / d) * s; g.pos.y += (dy / d) * s
    }
    if (dist(g.pos, unit.flag.pos) < CONFIG.generalRegenRange) g.hp = Math.min(g.maxHp, g.hp + CONFIG.generalRegen * dt) // 깃발 근처 회복
  }
}

function stepGenerals(battle: Battle, dt: number): void {
  const A = battle.units.A, B = battle.units.B
  const gA = A.general, gB = B.general
  // 장수 ↔ 적 병사 (③ 공격 · ⑤ 1/5 피해)
  generalVsCohorts(A, B, dt)
  generalVsCohorts(B, A, dt)
  // 일기토: 둘 다 출진 & 근거리
  if (gA.state === 'out' && gB.state === 'out' && dist(gA.pos, gB.pos) <= CONFIG.generalRange) {
    duel(gA, gB, dt); duel(gB, gA, dt)
    for (const u of [A, B]) {
      u.general.meleeTime += dt // 렌더 결투장 원 성장용
      u.morale = Math.min(100, u.morale + CONFIG.generalMoraleRate * dt) // ④ 일기토도 전진 공격 → 사기 지속↑
    }
  }
  handleGeneral(A, B, dt)
  handleGeneral(B, A, dt)
}

function stepRout(battle: Battle, dt: number): void {
  battle.routTime += dt
  const side = battle.loser as Side
  const dir = side === 'A' ? -1 : 1 // A는 왼쪽(-x), B는 오른쪽(+x)으로 달아남
  for (const c of battle.units[side].cohorts) {
    c.aliveHP = Math.max(0, c.aliveHP - c.aliveHP * CONFIG.routKillRate * dt) // 속수무책 사상
    c.anchor.x += dir * CONFIG.routFleeSpeed * dt // 도주 이동
    c.facing = dir < 0 ? Math.PI : 0 // 달아나는 방향
    c.target = null; c.ability = null; c.stance = 'idle'; c.chargeRun = false
  }
  // 패배 장수도 병사들과 함께 후퇴 (도주 방향으로 이동). 노출 시엔 추격당함(아래 generalVsCohorts)
  const lg = battle.units[side].general
  if (lg.state === 'out' || lg.state === 'rest') lg.pos.x += dir * CONFIG.routFleeSpeed * dt
  // 승리측: 진행 중 이동/어빌리티(돌진 귀환 등)는 계속 갱신 — 전투는 결정났으므로 melee/사기는 없음.
  const winner = side === 'A' ? 'B' : 'A'
  const wu = battle.units[winner]
  for (const c of wu.cohorts) { stepAbility(c, dt); stepCohort(c, wu, dt) }
  // 전멸(노출)한 패배 장수는 도주 중에도 추격당함 (3배 피해)
  generalVsCohorts(battle.units[side], wu, dt)
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
  for (const s of ['A', 'B'] as Side[]) for (const c of battle.units[s].cohorts) {
    c.inMelee = false; c.firing = false
    c.slow = Math.max(0, c.slow - CONFIG.stopSlowDecay * dt) // 저지 저하 감쇠(이탈 시 회복). 접전 중이면 melee가 다시 갱신
  }
  battle.units.A.general.inCombat = false; battle.units.B.general.inCombat = false
  if (battle.phase === 'ended') return
  if (battle.phase === 'rout') { stepRout(battle, dt); return }

  // 어빌리티(스태미너·진행) → 이동/회전 → 반대 진영 충돌 해소
  for (const side of ['A', 'B'] as Side[]) {
    const u = battle.units[side]
    for (const c of u.cohorts) { stepAbility(c, dt); stepCohort(c, u, dt) }
  }
  resolveCollisions(battle)

  const beforeA = unitAlive(battle.units.A)
  const beforeB = unitAlive(battle.units.B)

  // 궁병 사격 → 근접 전투
  rangedPass(battle, dt)
  let contact = false
  for (const ca of battle.units.A.cohorts) {
    for (const cb of battle.units.B.cohorts) {
      const overlap = frontageOverlapMen(ca, cb, battle.terrain)
      if (overlap <= 0) continue
      contact = true
      ca.inMelee = true; cb.inMelee = true
      // 측면 초과 폭 보너스: 더 넓은(병력 많은) 대열이 좁은 적을 감싸 추가 공격폭 확보.
      // 애로(choke)면 감쌀 공간이 없어 상한으로 제한.
      const wa = activeWidthMen(ca), wb = activeWidthMen(cb)
      const cap = battle.terrain.chokeWidth
      const caW = Math.min(cap, overlap + CONFIG.flankBonus * Math.max(0, wa - wb))
      const cbW = Math.min(cap, overlap + CONFIG.flankBonus * Math.max(0, wb - wa))
      applyMelee(ca, cb, caW, dt, battle.terrain)
      applyMelee(cb, ca, cbW, dt, battle.terrain)
    }
  }
  if (contact && battle.phase === 'deploy') battle.phase = 'engage'

  // 장수: 일기토·휴식/리젠·근접 지속 사기 buff
  stepGenerals(battle, dt)

  // 대열 폭: 교전 판정(melee·장수) 이후 갱신 — 교전 중이면 이동 대열변경 취소(펼침 복귀)
  stepSpread(battle, dt)

  // 사기: 이번 틱 사상 기반 하락
  const casA = beforeA - unitAlive(battle.units.A)
  const casB = beforeB - unitAlive(battle.units.B)
  if (casA > 0) dropMorale(battle.units.A, casA, dt)
  if (casB > 0) dropMorale(battle.units.B, casB, dt)

  // 사기 0 또는 부대 전멸 → 도주(결착). 전멸측이 있으면 그쪽이 패배.
  const mA = battle.units.A.morale
  const mB = battle.units.B.morale
  const aWiped = unitAlive(battle.units.A) <= 0
  const bWiped = unitAlive(battle.units.B) <= 0
  if (mA <= 0 || mB <= 0 || aWiped || bWiped) {
    const loser: Side = aWiped && !bWiped ? 'A' : bWiped && !aWiped ? 'B' : mA <= mB ? 'A' : 'B'
    startRout(battle, loser)
  }
}

// --- 로깅/검증 헬퍼 ---
export const unitMen = (u: Unit): number =>
  u.cohorts.reduce((n, c) => n + c.aliveHP + c.woundedHP, 0)

/** 활성 대형 폭(명) = (전사가능 병력 ÷ 두께) × spread */
export const cohortWidth = (c: Cohort): number =>
  Math.ceil((c.aliveHP / c.depth) * c.spread)
