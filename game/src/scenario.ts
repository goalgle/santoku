import type { Battle, Side, Terrain } from './sim/types'
import type { Snapshot } from './snapshot'
import { moveCohort } from './sim/battle'

// 시나리오/컷신 스크립트 — 병종·장수·지형을 타임라인으로 제어.
// 테스트와 컷신 연출이 같은 구조를 쓴다. 렌더는 Director로 이걸 재생한다.

export type Op = (b: Battle) => void
export interface TimedAction { at: number; label?: string; ops: Op[] } // at = sim 초
export interface Scenario { name: string; snapshot: Snapshot; timeline: TimedAction[]; duration?: number }

// --- op 헬퍼 (컷신에서 읽기 쉽게) ---

/** 병종을 특정 위치·방향에 즉시 배치(순간이동) */
export const place = (side: Side, idx: number, x: number, y: number, facing: number): Op =>
  (b) => { const c = b.units[side].cohorts[idx]; c.anchor = { x, y }; c.facing = facing; c.target = null; c.stance = 'idle' }

/** 이동 명령(명령반경 gating 적용 — 현실적) */
export const order = (side: Side, idx: number, x: number, y: number): Op =>
  (b) => { moveCohort(b.units[side], idx, { x, y }) }

/** 목표 강제 지정(반경 무시 — 컷신 연출용) */
export const forceTo = (side: Side, idx: number, x: number, y: number): Op =>
  (b) => { const c = b.units[side].cohorts[idx]; c.target = { x, y }; c.stance = 'move' }

export const setMight = (side: Side, v: number): Op => (b) => { b.units[side].general.might = v }
export const placeGeneral = (side: Side, x: number, y: number): Op => (b) => { b.units[side].general.pos = { x, y } }
export const placeFlag = (side: Side, x: number, y: number): Op => (b) => { b.units[side].flag.pos = { x, y } }
export const setTerrain = (t: Terrain): Op => (b) => { b.terrain = t }
export const say = (msg: string): Op => () => console.log(`   · ${msg}`)

// --- 빌더 ---
export function scene(name: string, snapshot: Snapshot): SceneBuilder {
  return new SceneBuilder(name, snapshot)
}
class SceneBuilder {
  private timeline: TimedAction[] = []
  private dur?: number
  constructor(private readonly name: string, private readonly snapshot: Snapshot) {}
  /** 특정 시각(초)에 op들을 발동 */
  at(sec: number, ...ops: Op[]): this { this.timeline.push({ at: sec, ops }); return this }
  duration(sec: number): this { this.dur = sec; return this }
  build(): Scenario { return { name: this.name, snapshot: this.snapshot, timeline: this.timeline, duration: this.dur } }
}
