import { createBattle, step, moveCohort, canCommand, unitMen, cohortWidth } from './sim/battle'
import { V0_SNAPSHOT } from './snapshot'
import { TROOP_NAME } from './data/units'
import type { Battle, Unit } from './sim/types'

// 1단계 B 헤드리스 검증: 이동/배치 명령 · 모임→펼침 · 회전 · 명령반경 gating · 기병 가속/선회.

const DT = 1000 / 30
const deg = (r: number) => ((r * 180) / Math.PI).toFixed(0)
const P = (v: { x: number; y: number }) => `(${v.x.toFixed(0)},${v.y.toFixed(0)})`

function runFor(battle: Battle, seconds: number) {
  const n = Math.round((seconds * 1000) / DT)
  for (let i = 0; i < n; i++) step(battle, DT)
}

console.log('== 산토쿠 sim — 1단계 B (이동/배치) ==\n')

const battle = createBattle(V0_SNAPSHOT)
const A: Unit = battle.units.A
const shield = A.cohorts[0]
const cav = A.cohorts[3]

console.log(`부대 A 병력 ${unitMen(A)} · 명령반경 ${A.flag.commandRadius.toFixed(0)} (군기 ${P(A.flag.pos)})\n`)

// 1) 이동/배치 명령 (반경 안이므로 성공)
console.log('명령: 방패병 → (0,0),  기병 → (0,-150) [사선: 선회 확인]')
console.log(`  방패 명령 가능? ${canCommand(A, shield)} → ${moveCohort(A, 0, { x: 0, y: 0 })}`)
console.log(`  기병 명령 가능? ${canCommand(A, cav)} → ${moveCohort(A, 3, { x: 0, y: -150 })}\n`)

// 2) 0.5초 간격으로 상태 로그 (모임→펼침, 회전, 기병 가속/선회)
console.log('t(s) | 방패 pos     폭   facing | 기병 pos      속도  facing')
for (let s = 0; s <= 3; s++) {
  if (s > 0) runFor(battle, 1)
  const t = (battle.time / 1000).toFixed(0)
  console.log(
    `  ${t}  | ${P(shield.anchor).padEnd(11)} ${String(cohortWidth(shield)).padStart(3)}  ${deg(shield.facing).padStart(4)}° ` +
    `| ${P(cav.anchor).padEnd(11)} ${cav.curSpeed.toFixed(0).padStart(4)}  ${deg(cav.facing).padStart(4)}°`,
  )
}

// 3) 명령반경 gating: 방패병이 중앙으로 나갔으니 군기(-280)에서 멀어져 재명령 불가
const far = Math.hypot(shield.anchor.x - A.flag.pos.x, shield.anchor.y - A.flag.pos.y)
console.log(`\n방패병-군기 거리 ${far.toFixed(0)} vs 반경 ${A.flag.commandRadius.toFixed(0)}`)
console.log(`  → 재명령 가능? ${canCommand(A, shield)} (반경 밖이면 false = 통제 상실)`)
console.log(`  → moveCohort 재시도: ${moveCohort(A, 0, { x: -280, y: 0 })}`)

// 4) 모임/펼침 확인: 도착 후 폭이 다시 펼쳐지는지
console.log(`\n${TROOP_NAME[shield.kind]} 정지 후 spread ${shield.spread.toFixed(2)} (이동 중 0.35 → 정지 1.0로 복원)`)
