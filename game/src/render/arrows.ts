import { Container, Graphics } from 'pixi.js'
import { projectY } from './blobView'

interface Arrow { x: number; y: number; tx: number; ty: number; t: number; dur: number; peak: number }

// 궁병 사격 연출 (렌더 전용 eye-candy). sim 데미지와 무관 — 화살 궤적만 그린다.
// 지면 y는 projectY로 투영, 비행 중엔 포물선으로 살짝 떠오른다.
export class Arrows {
  private readonly g = new Graphics()
  private readonly list: Arrow[] = []
  constructor(parent: Container) { parent.addChild(this.g) }

  spawn(x: number, y: number, tx: number, ty: number): void {
    const d = Math.hypot(tx - x, ty - y)
    this.list.push({ x, y, tx, ty, t: 0, dur: 0.3 + d / 1400, peak: 24 + d * 0.14 })
  }

  private posAt(a: Arrow, t: number): [number, number] {
    const sx = a.x + (a.tx - a.x) * t
    const simY = a.y + (a.ty - a.y) * t
    return [sx, projectY(simY) - Math.sin(t * Math.PI) * a.peak] // 포물선 상승
  }

  update(dt: number): void {
    const g = this.g
    g.clear()
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i]
      a.t += dt / a.dur
      if (a.t >= 1) { this.list.splice(i, 1); continue }
      const [sx, sy] = this.posAt(a, a.t)
      const [nx, ny] = this.posAt(a, Math.min(1, a.t + 0.05)) // 진행 방향 짧은 선분(화살대)
      g.moveTo(sx, sy).lineTo(nx, ny).stroke({ color: 0xffe08a, width: 2, alpha: 0.9 })
    }
  }
}
