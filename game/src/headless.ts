import { createBattle, step, unitMen, cohortWidth } from './sim/battle'
import { V0_SNAPSHOT } from './snapshot'
import { TROOP_NAME } from './data/units'
import { makeRng } from './sim/rng'
import type { Side } from './sim/types'

// 1단계 A 헤드리스 검증: 스냅샷 로드 → 상태 확인 → 고정 틱 → 결정성 확인.
// 렌더 없음. `npm run sim` 으로 콘솔에서 확인.

console.log('== 산토쿠 sim — 1단계 A (헤드리스 코어) ==\n')

const battle = createBattle(V0_SNAPSHOT)
console.log(`지형: ${battle.terrain.kind} · phase: ${battle.phase} · seed: ${battle.rng.seed}\n`)

for (const side of ['A', 'B'] as Side[]) {
  const u = battle.units[side]
  console.log(`[${side}] 사기 ${u.morale} · 병력 ${unitMen(u)} · 장수 통${u.general.command}/무${u.general.might}/지${u.general.intel} HP${u.general.hp}`)
  console.log(`     명령반경 ${u.flag.commandRadius.toFixed(0)} · 군기HP ${u.flag.hp}`)
  for (const c of u.cohorts) {
    console.log(`     ${TROOP_NAME[c.kind].padEnd(4)} 병력 ${String(c.aliveHP).padStart(4)} · 폭 ${cohortWidth(c)}명 · 두께 ${c.depth}`)
  }
}

// 고정 틱 (30Hz) 몇 번 — 1A는 시간만 진행
const DT = 1000 / 30
for (let i = 0; i < 5; i++) step(battle, DT)
console.log(`\n${battle.tick}틱 진행 → time ${battle.time.toFixed(1)}ms (전투 로직은 C단계)`)

// 결정성: 같은 시드 → 같은 수열
const a = makeRng(42), b = makeRng(42)
const same = [0, 1, 2, 3, 4].every(() => a.next() === b.next())
console.log(`\n결정성(같은 시드=같은 수열): ${same ? 'OK ✓' : 'FAIL ✗'}`)
