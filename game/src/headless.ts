import { createBattle, step, moveCohort, unitMen, cohortWidth } from './sim/battle'
import { V0_SNAPSHOT } from './snapshot'
import { lethalityFrac } from './data/grades'
import { TROOPS } from './data/units'
import type { Battle, Cohort } from './sim/types'

// 1단계 C 헤드리스 검증: 전선 접촉 → 접전 폭 → 근접 피해 → 전사/부상 분배 → 병력 수축.

const DT = 1000 / 30
const P = (v: { x: number; y: number }) => `(${v.x.toFixed(0)},${v.y.toFixed(0)})`
const runFor = (b: Battle, sec: number) => { for (let i = 0; i < Math.round((sec * 1000) / DT); i++) step(b, DT) }
const killed = (c: Cohort, start: number) => start - c.aliveHP - c.woundedHP // 영구 손실

console.log('== 산토쿠 sim — 1단계 C (접전 폭·근접 전투) ==\n')

const battle = createBattle(V0_SNAPSHOT)
const A = battle.units.A
const B = battle.units.B
const sa = A.cohorts[0] // A 방패병(전면)
const sb = B.cohorts[0] // B 방패병(전면)
const start = sa.aliveHP

console.log(`대형 배치(전면 병종): A방패 ${P(sa.anchor)}  B방패 ${P(sb.anchor)}`)
console.log('두 방패병을 접점(±60)으로 이동 → 접촉 시 전투 시작\n')
moveCohort(A, 0, { x: -60, y: 0 })
moveCohort(B, 0, { x: 60, y: 0 })

console.log('t(s) phase   | A방패 aliveHP 부상  폭 | B방패 aliveHP 부상  폭')
for (let s = 0; s <= 8; s++) {
  if (s > 0) runFor(battle, 1)
  const t = String((battle.time / 1000).toFixed(0))
  console.log(
    ` ${t}  ${battle.phase.padEnd(7)} | ${String(Math.round(sa.aliveHP)).padStart(7)} ${String(Math.round(sa.woundedHP)).padStart(5)} ${String(cohortWidth(sa)).padStart(3)} ` +
    `| ${String(Math.round(sb.aliveHP)).padStart(7)} ${String(Math.round(sb.woundedHP)).padStart(5)} ${String(cohortWidth(sb)).padStart(3)}`,
  )
}

// 치명율 검증: 전사 : 부상 비율이 방패병 치명율(C=7%)과 맞는가
const leth = lethalityFrac(TROOPS.shield.lethal)
const cas = start - sa.aliveHP // 총 사상
const woundRatio = sa.woundedHP / cas
console.log(`\n치명율 검증(방패 ${TROOPS.shield.lethal}=${(leth * 100).toFixed(0)}%):`)
console.log(`  A방패 총 사상 ${cas.toFixed(0)} = 전사 ${killed(sa, start).toFixed(0)}(${((1 - woundRatio) * 100).toFixed(0)}%) + 부상 ${sa.woundedHP.toFixed(0)}(${(woundRatio * 100).toFixed(0)}%)`)
console.log(`  → 전사 비율 ${((1 - woundRatio) * 100).toFixed(1)}% ≈ 치명율 ${(leth * 100).toFixed(0)}% ${Math.abs(1 - woundRatio - leth) < 0.001 ? '✓' : ''}`)

console.log(`\n부대 A 잔존 ${unitMen(A)} / 2200 (전면 방패만 교전, 나머지 병종은 후방 대기)`)
