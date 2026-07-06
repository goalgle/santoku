import { createBattle, step } from './sim/battle'
import { V0_SNAPSHOT } from './snapshot'
import { TERRAINS } from './data/terrain'
import type { Battle, Terrain } from './sim/types'

// 1단계 F 헤드리스: 고지→저지 공격 보정(+20%) · 애로 병목(접전 폭 제한).

const DT = 1000 / 30
const r0 = (n: number) => Math.round(n)
const runFor = (b: Battle, sec: number) => { for (let i = 0; i < Math.round((sec * 1000) / DT); i++) step(b, DT) }

// 방패 vs 방패 4초 교전 → 각 측 사상. aAnchor로 A 위치 조정(고지 배치용).
function fight(terrain: Terrain, aAnchorX = -60): { aLoss: number; bLoss: number } {
  const b = createBattle(V0_SNAPSHOT)
  b.terrain = terrain
  const sa = b.units.A.cohorts[0], sb = b.units.B.cohorts[0]
  sa.anchor = { x: aAnchorX, y: 0 }; sa.facing = 0; sa.target = null
  sb.anchor = { x: 60, y: 0 }; sb.facing = Math.PI; sb.target = null
  const a0 = sa.aliveHP, b0 = sb.aliveHP
  runFor(b, 4)
  return { aLoss: a0 - sa.aliveHP, bLoss: b0 - sb.aliveHP }
}

console.log('== 1단계 F — 지형(고지 보정·애로 병목) ==\n')

// 1) 평지: 대칭 → 손실 같음
const plain = fight(TERRAINS.plain)
console.log(`[평지]  A손실 ${r0(plain.aLoss)}  B손실 ${r0(plain.bLoss)}  (대칭)`)

// 2) 고지: A를 언덕 위에(-60), B는 언덕 밖(60) → A 하향 공격 +20% → B 손실↑
const hill: Terrain = { name: '고지 테스트', hills: [{ x: -60, y: 0, radius: 70 }], chokeWidth: Infinity }
const h = fight(hill)
console.log(`[고지]  A손실 ${r0(h.aLoss)}  B손실 ${r0(h.bLoss)}  → B/A = ${(h.bLoss / h.aLoss).toFixed(2)} (≈1.2 = 하향 +20%) ${Math.abs(h.bLoss / h.aLoss - 1.2) < 0.05 ? '✓' : ''}`)

// 3) 애로: 접전 폭 30명으로 병목 → 손실이 평지보다 대폭↓
const defile = fight(TERRAINS.defile)
console.log(`[애로]  A손실 ${r0(defile.aLoss)}  B손실 ${r0(defile.bLoss)}  → 평지 대비 ${((defile.aLoss / plain.aLoss) * 100).toFixed(0)}% (접전 폭 100→30 병목) ${defile.aLoss < plain.aLoss ? '✓' : ''}`)

console.log('\n지형 템플릿 3종:', Object.values(TERRAINS).map((t) => t.name).join(' / '))
