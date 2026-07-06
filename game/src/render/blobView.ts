import { Container, Sprite, Texture } from 'pixi.js'
import type { Cohort } from '../sim/types'
import { CONFIG } from '../data/config'

const SP = CONFIG.spacing

// 하나의 Cohort(병종 덩어리)를 스프라이트로 렌더. 상태의 소스는 sim(cohort).
// 대형 폭 = (aliveHP/두께)*spread, 깊이 = 두께 → 물리 사각형에 스프라이트를 채운다. bob은 렌더 전용.
export class BlobView {
  readonly container = new Container()
  private readonly sprites: Sprite[] = []
  private readonly phases: number[] = []
  private time = 0

  constructor(tex: Texture, color: number, private readonly condense: number, maxMen: number) {
    const maxS = Math.max(1, Math.ceil(maxMen / condense))
    for (let i = 0; i < maxS; i++) {
      const s = new Sprite(tex)
      s.anchor.set(0.5)
      s.tint = color
      s.visible = false
      this.container.addChild(s)
      this.sprites.push(s)
      this.phases.push(Math.random() * Math.PI * 2) // 렌더 전용
    }
  }

  update(c: Cohort, dtMs: number): void {
    this.time += dtMs / 1000
    const men = Math.max(0, c.aliveHP)
    const nS = Math.min(this.sprites.length, Math.ceil(men / this.condense))
    const widthMen = (men / c.depth) * c.spread
    const halfW = (widthMen * SP) / 2
    const halfD = (c.depth * SP) / 2
    const cols = Math.max(1, Math.round(Math.sqrt(nS * (halfW / Math.max(1, halfD)))))
    const rows = Math.max(1, Math.ceil(nS / cols))
    const cos = Math.cos(c.facing), sin = Math.sin(c.facing)

    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i]
      if (i >= nS) { s.visible = false; continue }
      s.visible = true
      const col = i % cols, row = Math.floor(i / cols)
      const lx = cols > 1 ? (col / (cols - 1) - 0.5) * 2 * halfW : 0 // 폭(facing에 수직)
      const ly = rows > 1 ? (row / (rows - 1) - 0.5) * 2 * halfD : 0 // 깊이(facing 방향)
      const wx = -sin * lx + cos * ly
      const wy = cos * lx + sin * ly
      const bob = Math.sin(this.time * 4 + this.phases[i]) * 3
      s.x = c.anchor.x + wx
      s.y = c.anchor.y + wy + bob
    }
  }
}
