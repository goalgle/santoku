import { Director } from './director'
import { SCENARIOS } from './scenarios'
import { unitMen } from './sim/battle'
import type { Battle } from './sim/types'

// 시나리오/Director 구조 검증 (렌더가 쓸 바로 그 구조).
// 사용법: npm run sim [scenarioKey]   (기본: advance)

const DT = 1000 / 30
const r0 = (n: number) => Math.round(n)
const P = (v: { x: number; y: number }) => `(${r0(v.x)},${r0(v.y)})`

const key = process.argv[2] ?? 'advance'
const scn = SCENARIOS[key]
if (!scn) {
  console.log(`알 수 없는 시나리오: ${key}\n사용 가능: ${Object.keys(SCENARIOS).join(', ')}`)
  process.exit(1)
}

console.log(`== 시나리오 재생: "${scn.name}" (key=${key}) ==\n`)

const d = new Director(scn)
const b: Battle = d.battle
const line = () => {
  const A = b.units.A.cohorts[0], B = b.units.B.cohorts[0]
  return `t=${(b.time / 1000).toFixed(0)}s phase=${b.phase.padEnd(6)} | 지형 ${b.terrain.name} | A방패 ${P(A.anchor)} ${r0(A.aliveHP)} · B방패 ${P(B.anchor)} ${r0(B.aliveHP)}`
}

console.log(line())
let nextLog = 2
while (!d.done) {
  d.step(DT)
  if (b.time / 1000 >= nextLog) { console.log(line()); nextLog += 2 }
}
console.log(line())

if (b.result) {
  console.log(`\n결과: ${b.result.winner} · ${b.result.degree} (잔존 ${(b.result.ratio * 100).toFixed(0)}%)`)
  console.log(`장수 A=${b.units.A.general.state} B=${b.units.B.general.state}`)
} else {
  console.log(`\n(duration 도달로 종료) A병력 ${unitMen(b.units.A)} · B병력 ${unitMen(b.units.B)}`)
}
