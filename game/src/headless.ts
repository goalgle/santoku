import { createBattle, step, isCharging, maxSpeed } from './sim/battle'
import { V0_SNAPSHOT } from './snapshot'
import type { Battle } from './sim/types'

// 1단계 E(1/2) 헤드리스: 기병 charge(최대속도→공격 S) + 저지 카운터(창 저지 A로 감속→charge 무효).

const DT = 1000 / 30
const r0 = (n: number) => Math.round(n)
const runFor = (b: Battle, sec: number) => { for (let i = 0; i < Math.round((sec * 1000) / DT); i++) step(b, DT) }

// 기병이 런웨이(-600→)에서 가속해 targetIdx 병종에 돌격. 속도/charge/사상 관찰.
function chargeRun(label: string, targetIdx: number) {
  const b: Battle = createBattle(V0_SNAPSHOT)
  const cav = b.units.A.cohorts[3] // A 기병
  const tgt = b.units.B.cohorts[targetIdx]
  cav.anchor = { x: -600, y: 0 }; cav.facing = 0; cav.target = { x: 40, y: 0 } // 긴 런웨이 + 밀고 들어감
  tgt.anchor = { x: 0, y: 0 }; tgt.facing = Math.PI; tgt.target = null
  const startTgt = tgt.aliveHP

  console.log(`\n[${label}]  최대속도=${r0(maxSpeed('cavalry'))}  charge 임계=${r0(0.9 * maxSpeed('cavalry'))}`)
  console.log('  t(s) | 기병속도 charge | 적 aliveHP')
  for (let s = 0; s <= 6; s++) {
    if (s > 0) runFor(b, 1)
    console.log(`   ${s}  | ${String(r0(cav.curSpeed)).padStart(6)}  ${isCharging(cav) ? 'YES' : ' no'}   | ${String(r0(tgt.aliveHP)).padStart(6)}`)
  }
  console.log(`  → 적 사상 ${r0(startTgt - tgt.aliveHP)}`)
}

console.log('== 1단계 E (1/2) — 기병 charge & 저지 카운터 ==')
chargeRun('vs 방패병 (저지 B)', 0) // 약한 저지 → charge 유지 오래
chargeRun('vs 창병 (저지 A)', 1)   // 강한 저지 → 더 빨리 감속 → charge 무효

console.log('\n요약: 런웨이에서 최대속도 도달 → 충돌 시 charge(공격 S). 창병(저지 A)에 붙으면 더 빨리 감속돼 charge가 꺼진다.')
