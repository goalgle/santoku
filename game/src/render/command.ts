import { Container, Graphics } from 'pixi.js'
import type { Battle, Side, Vec } from '../sim/types'
import { moveCohort, canCommand } from '../sim/battle'

// 개입 UI: 액티브 포즈에서 아군(side) 병종을 탭 선택 → 지점 탭으로 이동/배치 명령.
// 명령반경 gating(반경 밖 선택 불가)은 sim의 canCommand/moveCohort를 그대로 쓴다.
export class CommandController {
  readonly overlay = new Graphics()
  private selected: number | null = null
  private readonly ptrs = new Set<number>()
  private wasMulti = false
  private downPt: Vec | null = null
  private downT = 0

  constructor(
    private readonly world: Container,
    canvas: HTMLCanvasElement,
    private readonly battle: Battle,
    private readonly isPaused: () => boolean,
    private readonly side: Side = 'A',
  ) {
    world.addChild(this.overlay)
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
  }

  private onDown = (e: PointerEvent) => {
    this.ptrs.add(e.pointerId)
    if (this.ptrs.size > 1) this.wasMulti = true
    if (this.ptrs.size === 1) { this.downPt = { x: e.offsetX, y: e.offsetY }; this.downT = performance.now() }
  }

  private onUp = (e: PointerEvent) => {
    this.ptrs.delete(e.pointerId)
    if (this.ptrs.size > 0) return
    const dp = this.downPt; this.downPt = null
    const multi = this.wasMulti; this.wasMulti = false
    if (multi || !dp) return // 핀치/드래그면 탭 아님
    if (Math.hypot(e.offsetX - dp.x, e.offsetY - dp.y) > 8 || performance.now() - this.downT > 350) return
    const p = this.world.toLocal({ x: e.offsetX, y: e.offsetY })
    this.onTap({ x: p.x, y: p.y })
  }

  private pick(pt: Vec): number | null {
    const u = this.battle.units[this.side]
    let best: number | null = null
    let bestD = 90 // world px 픽 반경
    u.cohorts.forEach((c, i) => {
      if (c.aliveHP <= 0) return
      const d = Math.hypot(c.anchor.x - pt.x, c.anchor.y - pt.y)
      if (d < bestD) { bestD = d; best = i }
    })
    return best
  }

  private onTap(pt: Vec): void {
    if (!this.isPaused()) return
    const u = this.battle.units[this.side]
    const hit = this.pick(pt)
    if (this.selected === null) {
      if (hit !== null && canCommand(u, u.cohorts[hit])) this.selected = hit // 반경 안 병종만 선택
    } else if (hit !== null) {
      this.selected = hit === this.selected ? null : hit // 같은 것=해제 / 다른 것=재선택
    } else {
      moveCohort(u, this.selected, pt) // 빈 곳=목표 지정 → 이동 명령
      this.selected = null
    }
  }

  draw(): void {
    const g = this.overlay
    g.clear()
    if (!this.isPaused()) return
    const u = this.battle.units[this.side]

    // 명령반경
    g.circle(u.flag.pos.x, u.flag.pos.y, u.flag.commandRadius).stroke({ color: 0x88ff88, width: 2, alpha: 0.35 })

    u.cohorts.forEach((c, i) => {
      if (c.aliveHP <= 0) return
      // 진행 중 명령(목표) 표시
      if (c.target) {
        g.moveTo(c.anchor.x, c.anchor.y).lineTo(c.target.x, c.target.y).stroke({ color: 0xffee55, width: 2, alpha: 0.6 })
        g.circle(c.target.x, c.target.y, 8).stroke({ color: 0xffee55, width: 2 })
      }
      // 병종 마커(명령 가능=밝게, 반경 밖=흐리게)
      const ok = canCommand(u, c)
      g.circle(c.anchor.x, c.anchor.y, 22).stroke({ color: ok ? 0xffffff : 0x888888, width: 2, alpha: ok ? 0.5 : 0.2 })
      if (i === this.selected) g.circle(c.anchor.x, c.anchor.y, 30).stroke({ color: 0xffee55, width: 3 })
    })
  }
}
