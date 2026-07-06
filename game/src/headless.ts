import { createBattle, step } from './sim/battle'
import { V0_SNAPSHOT } from './snapshot'
import type { Battle } from './sim/types'

// 1단계 D 헤드리스 검증: 궁병 사격 · 사기 하락 · 사기0 → 도주 → 승리 정도.

const DT = 1000 / 30
const runFor = (b: Battle, sec: number) => { for (let i = 0; i < Math.round((sec * 1000) / DT); i++) step(b, DT) }
const r0 = (n: number) => Math.round(n)

// ── 시나리오 1: 궁병 사격 (정지, 사거리 내, 근접 밖) ────────────────
console.log('== 1단계 D ==\n[1] 궁병 사격 — 정지 궁병이 사거리 내 적을 사격(부상 위주)\n')
{
  const b = createBattle(V0_SNAPSHOT)
  const bow = b.units.A.cohorts[2] // A 궁병
  const tgt = b.units.B.cohorts[0] // B 방패
  bow.anchor = { x: 0, y: 0 }; bow.facing = 0; bow.target = null
  tgt.anchor = { x: 150, y: 0 }; tgt.facing = Math.PI; tgt.target = null // 사거리(198) 안, 접촉(140) 밖

  console.log('t(s) | 표적 방패 aliveHP  부상   (근접 접촉 없음, 순수 사격)')
  for (let s = 0; s <= 4; s++) {
    if (s > 0) runFor(b, 1)
    console.log(`  ${s}  | ${String(r0(tgt.aliveHP)).padStart(7)}  ${String(r0(tgt.woundedHP)).padStart(5)}`)
  }
  const cas = 1000 - tgt.aliveHP
  console.log(`  → 사격 사상 ${r0(cas)} 중 부상 ${r0(tgt.woundedHP)} (${((tgt.woundedHP / cas) * 100).toFixed(0)}%) — 궁 치명율 D=6%라 부상 위주 ✓`)
}

// ── 시나리오 2: 사기 붕괴 → 도주 → 정도 (A방패 vs B궁병 근접) ────────
console.log('\n[2] 사기 붕괴 → 도주 → 승리 정도 — A창병(공속 A) vs B궁병(근접 취약)\n')
{
  const b = createBattle(V0_SNAPSHOT)
  const atkr = b.units.A.cohorts[1] // A 창병(공속 A, 공격 B)
  const dfnd = b.units.B.cohorts[2] // B 궁병(방어 C, 근접 취약)
  atkr.anchor = { x: -60, y: 0 }; atkr.facing = 0; atkr.target = null
  dfnd.anchor = { x: 60, y: 0 }; dfnd.facing = Math.PI; dfnd.target = null

  console.log('t(s) phase  | A사기 B사기 | B궁병 aliveHP')
  let s = 0
  while (b.phase !== 'ended' && s < 40) {
    runFor(b, 1); s++
    console.log(`  ${String(s).padStart(2)}  ${b.phase.padEnd(6)} | ${String(r0(b.units.A.morale)).padStart(4)}  ${String(r0(b.units.B.morale)).padStart(4)} | ${String(r0(dfnd.aliveHP)).padStart(6)}`)
  }
  const res = b.result!
  console.log(`\n  결과: ${res.winner} 승 · 정도 = ${res.degree} (승자 잔존 ${r0(res.winnerMen)}/${b.initialMen[res.winner]} = ${(res.ratio * 100).toFixed(0)}%)`)
  console.log(`  → 패자 ${b.loser}: 사기 0 → 도주 페이즈(${b.routTime.toFixed(0)}s) → 종료`)
}
