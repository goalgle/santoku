import { Container, Graphics } from 'pixi.js'
import type { Battle, Side, Vec, AbilityType, Unit } from '../sim/types'
import type { TroopKind } from '../data/units'
import { moveCohort, canCommand, useAbility } from '../sim/battle'
import { CONFIG } from '../data/config'
import { projectY, unprojectY } from './blobView'

// 어빌리티 바: 병종별 시그니처 어빌리티(방어/공격/일제사/돌진) 버튼 + 스태미너. 정지·실시간 둘 다.
// 인덱스 고정 아님 — 병종(kind)으로 대열에서 찾는다(조립 로스터·임의 순서 지원).
const BAR: { id: string; type: AbilityType; kind: TroopKind }[] = [
  { id: 'abDefend', type: 'defend', kind: 'shield' },
  { id: 'abAdvance', type: 'advance', kind: 'spear' },
  { id: 'abVolley', type: 'volley', kind: 'bow' },
  { id: 'abCharge', type: 'charge', kind: 'cavalry' },
]

const indexOfKind = (u: Unit, kind: TroopKind): number => u.cohorts.findIndex((c) => c.kind === kind && c.aliveHP > 0)

export class AbilityBar {
  private readonly items: { type: AbilityType; kind: TroopKind; el: HTMLButtonElement }[] = []
  constructor(private readonly battle: Battle, private readonly side: Side = 'A') {
    for (const b of BAR) {
      const el = document.getElementById(b.id) as HTMLButtonElement | null
      if (!el) continue
      el.addEventListener('click', () => {
        const i = indexOfKind(this.battle.units[this.side], b.kind)
        if (i >= 0) useAbility(this.battle, this.side, i, b.type)
      })
      this.items.push({ type: b.type, kind: b.kind, el })
    }
  }
  update(): void {
    const u = this.battle.units[this.side]
    for (const it of this.items) {
      const i = indexOfKind(u, it.kind)
      if (i < 0) { it.el.style.display = 'none'; continue } // 해당 병종 없음 → 버튼 숨김
      it.el.style.display = ''
      const c = u.cohorts[i]
      const cost = CONFIG.ability[it.type].cost
      const active = c.ability?.type === it.type
      it.el.disabled = !active && (!!c.ability || c.stamina < cost || !canCommand(u, c))
      it.el.classList.toggle('active', active)
      const pct = Math.round((c.stamina / CONFIG.staminaMax) * 100)
      it.el.style.background = `linear-gradient(to top, rgba(80,170,90,.8) ${pct}%, rgba(0,0,0,.5) ${pct}%)`
    }
  }
}

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
    this.onTap({ x: p.x, y: unprojectY(p.y) }) // 투영된 화면 y → sim y
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
    // 투영된 y로 그려 스프라이트와 정합
    g.circle(u.flag.pos.x, projectY(u.flag.pos.y), u.flag.commandRadius).stroke({ color: 0x88ff88, width: 2, alpha: 0.35 })
    u.cohorts.forEach((c, i) => {
      if (c.aliveHP <= 0) return
      const ay = projectY(c.anchor.y)
      if (c.target) { // 예약된 목표
        const ty = projectY(c.target.y)
        g.moveTo(c.anchor.x, ay).lineTo(c.target.x, ty).stroke({ color: 0xffee55, width: 2, alpha: 0.6 })
        g.circle(c.target.x, ty, 8).stroke({ color: 0xffee55, width: 2 })
      }
      const ok = canCommand(u, c)
      const col = c.stance === 'defend' ? 0x66ccff : ok ? 0xffffff : 0x888888
      g.circle(c.anchor.x, ay, 22).stroke({ color: col, width: 2, alpha: ok ? 0.5 : 0.2 })
      if (i === this.selected) g.circle(c.anchor.x, ay, 30).stroke({ color: 0xffee55, width: 3 })
    })
  }
}
