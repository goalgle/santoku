import { createBattle, step } from './sim/battle'
import { V0_SNAPSHOT } from './snapshot'
import type { Battle } from './sim/types'

// 1단계 E(2/2) 헤드리스: 장수 일기토 · HP0→휴식·리젠·재출진 · 근접 지속→사기↑.

const DT = 1000 / 30
const r0 = (n: number) => Math.round(n)
const runFor = (b: Battle, sec: number) => { for (let i = 0; i < Math.round((sec * 1000) / DT); i++) step(b, DT) }

console.log('== 1단계 E (2/2) — 장수 일기토·휴식·리젠·사기 buff ==\n')

const b = createBattle(V0_SNAPSHOT)
const gA = b.units.A.general
const gB = b.units.B.general
gA.might = 85; gB.might = 65 // A가 더 강함
gA.pos = { x: -20, y: 0 }; gB.pos = { x: 20, y: 0 } // 근거리(≤45) → 일기토
b.units.A.flag.pos = { x: -120, y: 0 }; b.units.B.flag.pos = { x: 120, y: 0 } // 휴식 복귀 지점 가까이

console.log(`무력 A=${gA.might} vs B=${gB.might}  (일기토 거리 ${r0(45)})`)
console.log('t(s) | A장수 hp/상태     | B장수 hp/상태     | 사기A/B')
for (let s = 0; s <= 30; s += 2) {
  if (s > 0) runFor(b, 2)
  console.log(
    ` ${String(s).padStart(2)}  | ${String(r0(gA.hp)).padStart(3)} ${gA.state.padEnd(8)} | ${String(r0(gB.hp)).padStart(3)} ${gB.state.padEnd(8)} | ${r0(b.units.A.morale)}/${r0(b.units.B.morale)}`,
  )
}

console.log('\n확인: B 장수(약함) HP0 → 휴식 → 군기 복귀·리젠 → 재출진(out). 근접 10초 지속 → 사기 +5(50→55).')
console.log('(생사 판정 = 전투 종료 시 HP≥50% 대기 / 미만 부상·사망 — endBattle에 연결, D의 도주 종료에서 발동)')
