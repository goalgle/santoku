import { Container, Graphics } from 'pixi.js'
import type { Battle, Side, Vec } from '../sim/types'
import { moveCohort, canCommand } from '../sim/battle'

type Mode = 'move' | 'charge'

// 개입 UI (noun-first): 액티브 포즈에서 아군 병종 탭 선택 → 명령(이동/돌격/방어) → 지점 탭.
// 명령반경 gating은 sim canCommand/moveCohort 그대로. 좌표는 layer(tiltLayer) 로컬.
export class CommandController {
  readonly overlay = new Graphics()
  private selected: number | null = null
  private mode: Mode = 'move'
  private readonly ptrs = new Set<number>()
  private wasMulti = false
  private downPt: Vec | null = null
  private downT = 0
  private readonly bar = document.getElementById('cmdbar') as HTMLElement | null
  private readonly btnMove = document.getElementById('cmdMove')
  private readonly btnCharge = document.getElementById('cmdCharge')
  private readonly btnDefend = document.getElementById('cmdDefend') as HTMLElement | null

  constructor(
    private readonly layer: Container,
    canvas: HTMLCanvasElement,
    private readonly battle: Battle,
    private readonly isPaused: () => boolean,
    private readonly side: Side = 'A',
  ) {
    layer.addChild(this.overlay)
    this.btnMove?.addEventListener('click', () => this.setMode('move'))
    this.btnCharge?.addEventListener('click', () => this.setMode('charge'))
    this.btnDefend?.addEventListener('click', () => this.doDefend())
    document.getElementById('cmdCancel')?.addEventListener('click', () => this.deselect())
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
  }

  private get unit() { return this.battle.units[this.side] }

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
    if (multi || !dp) return
    if (Math.hypot(e.offsetX - dp.x, e.offsetY - dp.y) > 8 || performance.now() - this.downT > 350) return
    const p = this.layer.toLocal({ x: e.offsetX, y: e.offsetY })
    this.onTap({ x: p.x, y: p.y })
  }

  private pick(pt: Vec): number | null {
    let best: number | null = null, bestD = 90
    this.unit.cohorts.forEach((c, i) => {
      if (c.aliveHP <= 0) return
      const d = Math.hypot(c.anchor.x - pt.x, c.anchor.y - pt.y)
      if (d < bestD) { bestD = d; best = i }
    })
    return best
  }

  private onTap(pt: Vec): void {
    if (!this.isPaused()) return
    const u = this.unit
    const hit = this.pick(pt)
    if (this.selected === null) {
      if (hit !== null && canCommand(u, u.cohorts[hit])) this.select(hit)
    } else if (hit !== null) {
      if (hit === this.selected) this.deselect(); else this.select(hit)
    } else {
      const c = u.cohorts[this.selected]
      if (moveCohort(u, this.selected, pt) && this.mode === 'charge' && c.kind === 'cavalry') c.chargeRun = true
      this.deselect()
    }
  }

  private select(i: number): void { this.selected = i; this.mode = 'move'; this.showBar() }
  private deselect(): void { this.selected = null; if (this.bar) this.bar.style.display = 'none' }
  private setMode(m: Mode): void { if (this.selected === null) return; this.mode = m; this.updateBtns() }

  private doDefend(): void {
    if (this.selected === null) return
    const c = this.unit.cohorts[this.selected]
    if (c.kind === 'bow' || c.kind === 'cavalry') return // 방어전념 불가
    c.stance = c.stance === 'defend' ? 'idle' : 'defend'
    c.target = null
    this.deselect()
  }

  private showBar(): void {
    if (!this.bar) return
    this.bar.style.display = 'flex'
    const c = this.unit.cohorts[this.selected as number]
    if (this.btnDefend) this.btnDefend.style.display = c.kind === 'bow' || c.kind === 'cavalry' ? 'none' : ''
    this.updateBtns()
  }
  private updateBtns(): void {
    this.btnMove?.classList.toggle('on', this.mode === 'move')
    this.btnCharge?.classList.toggle('on', this.mode === 'charge')
  }

  draw(): void {
    const g = this.overlay
    g.clear()
    if (!this.isPaused()) { if (this.selected !== null) this.deselect(); return }
    const u = this.unit
    g.circle(u.flag.pos.x, u.flag.pos.y, u.flag.commandRadius).stroke({ color: 0x88ff88, width: 2, alpha: 0.35 })
    u.cohorts.forEach((c, i) => {
      if (c.aliveHP <= 0) return
      if (c.target) { // 예약된 목표
        g.moveTo(c.anchor.x, c.anchor.y).lineTo(c.target.x, c.target.y).stroke({ color: 0xffee55, width: 2, alpha: 0.6 })
        g.circle(c.target.x, c.target.y, 8).stroke({ color: 0xffee55, width: 2 })
      }
      const ok = canCommand(u, c)
      const col = c.stance === 'defend' ? 0x66ccff : ok ? 0xffffff : 0x888888
      g.circle(c.anchor.x, c.anchor.y, 22).stroke({ color: col, width: 2, alpha: ok ? 0.5 : 0.2 })
      if (i === this.selected) g.circle(c.anchor.x, c.anchor.y, 30).stroke({ color: 0xffee55, width: 3 })
    })
  }
}
