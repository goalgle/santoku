import { scene } from './scenario'
import type { Scenario } from './scenario'
import type { Snapshot, UnitSpec, GeneralSpec } from './snapshot'
import type { TroopKind } from './data/units'
import type { TerrainKey } from './data/terrain'

// 전술 레이어 조립 DSL (테스트용).
//   compose().addShield('left', 1000).addArcher('right', 200).build()
// 처럼 진영별로 병종을 추가해 스냅샷/시나리오를 만든다. SCENARIOS에 등록하면 ?s=키로 재생.
// 'left' = A(왼쪽, 전면 오른쪽), 'right' = B(오른쪽, 전면 왼쪽).

export type SideName = 'left' | 'right'

const DEF_GENERAL: GeneralSpec = { command: 70, might: 75, intel: 60, hp: 100 }
const DEF_MEN: Record<TroopKind, number> = { shield: 1000, spear: 600, bow: 400, cavalry: 200 }

function emptyUnit(side: SideName): UnitSpec {
  const left = side === 'left'
  return {
    anchor: { x: left ? -280 : 280, y: 0 },
    facing: left ? 0 : Math.PI, // 전면이 상대를 향함
    general: { ...DEF_GENERAL },
    cohorts: [],
  }
}

export class Composer {
  private _seed = 20260706
  private _terrain: TerrainKey = 'plain'
  private _name = '조립 전술'
  private readonly units: Record<SideName, UnitSpec> = { left: emptyUnit('left'), right: emptyUnit('right') }

  name(n: string): this { this._name = n; return this }
  seed(s: number): this { this._seed = s; return this }
  terrain(t: TerrainKey): this { this._terrain = t; return this }

  /** 병종 추가(추가 순서 = 앞→뒤 대열). men 생략 시 병종 기본값. */
  add(side: SideName, kind: TroopKind, men = DEF_MEN[kind]): this {
    this.units[side].cohorts.push({ kind, men })
    return this
  }
  addShield(side: SideName, men?: number): this { return this.add(side, 'shield', men) }
  addSpear(side: SideName, men?: number): this { return this.add(side, 'spear', men) }
  addArcher(side: SideName, men?: number): this { return this.add(side, 'bow', men) }
  addCavalry(side: SideName, men?: number): this { return this.add(side, 'cavalry', men) }

  /** 표준 로스터(방패1000·창600·궁400·기200)를 한 번에 */
  addRoster(side: SideName): this {
    return this.addShield(side).addSpear(side).addArcher(side).addCavalry(side)
  }

  general(side: SideName, g: Partial<GeneralSpec>): this { Object.assign(this.units[side].general, g); return this }
  anchor(side: SideName, x: number, y: number): this { this.units[side].anchor = { x, y }; return this }
  facing(side: SideName, rad: number): this { this.units[side].facing = rad; return this }

  snapshot(): Snapshot {
    return { seed: this._seed, terrain: this._terrain, units: { A: this.units.left, B: this.units.right } }
  }
  /** 타임라인 없는 전투(자유 개입). 더 붙이려면 .scene() 사용 */
  build(dur = 600): Scenario { return scene(this._name, this.snapshot()).duration(dur).build() }
  /** at()·duration() 등 컷신 타임라인을 이어 붙일 SceneBuilder */
  scene(): ReturnType<typeof scene> { return scene(this._name, this.snapshot()) }
}

export function compose(): Composer { return new Composer() }
