import { Container, Sprite, Texture } from 'pixi.js'

// 0단계 스파이크용 "덩어리(Cohort)" — 실제 코드베이스 아님(던져버리는 실험).
// 검증 대상: 앵커+슬롯+노이즈 렌더 / facing 회전 / 이동(모임→펼침) / 사상자 수축 /
//           ★도주 = 대형 붕괴·혼란 흩어짐 후퇴 (리스크 체크).
// ⚠️ bob·스캐터·흩어짐은 순수 렌더 표현이다(시뮬에 되먹이지 않음). doc/05 5.6 참고.

export interface BlobOptions {
  men: number
  condense: number
  rows: number
  spacing: number
  color: number
  x: number
  y: number
  facing: number
  texture: Texture
}

interface Slot {
  bx: number      // 중심 기준 열(width)
  by: number      // 중심 기준 행(depth)
  phase: number   // bob 위상차
  dx: number      // 도주 시 흩어질 방향(단위벡터)
  dy: number
}

export class Blob {
  readonly container = new Container()
  anchor: { x: number; y: number }
  facing: number
  private target: { x: number; y: number } | null = null
  private spread = 1
  private readonly speed = 130
  private readonly sprites: Sprite[] = []
  private slots: Slot[] = []
  private readonly rows: number
  private readonly spacing: number
  private readonly full: number
  private active: number
  private time = 0

  // 도주 상태
  private routing = false
  private routT = 0
  private fleeDir = { x: 0, y: 0 }
  private routKillAcc = 0

  constructor(opts: BlobOptions) {
    this.anchor = { x: opts.x, y: opts.y }
    this.facing = opts.facing
    this.rows = opts.rows
    this.spacing = opts.spacing
    this.full = Math.max(1, Math.floor(opts.men / opts.condense))
    this.active = this.full
    this.buildSlots(this.full)
    for (let i = 0; i < this.full; i++) {
      const s = new Sprite(opts.texture)
      s.anchor.set(0.5)
      s.tint = opts.color
      this.container.addChild(s)
      this.sprites.push(s)
    }
  }

  get spriteCount() { return this.active }
  get isRouting() { return this.routing }

  kill(fraction: number) { this.active = Math.max(1, Math.floor(this.active * (1 - fraction))) }
  moveTo(x: number, y: number) { if (!this.routing) this.target = { x, y } }

  // 도주 시작: 대형이 무너지며 자기 편 방향(가장자리)으로 혼란스럽게 후퇴
  rout() {
    if (this.routing) return
    this.routing = true
    this.routT = 0
    this.target = null
    const len = Math.hypot(this.anchor.x, this.anchor.y) || 1
    // 화면 중앙에서 멀어지는 쪽으로 도망(대략 자기 진영 방향)
    this.fleeDir = { x: this.anchor.x / len, y: this.anchor.y / len }
  }

  reset() {
    this.active = this.full
    this.routing = false
    this.routT = 0
    this.target = null
    this.spread = 1
  }

  private buildSlots(n: number) {
    const cols = Math.ceil(n / this.rows)
    const raw: Slot[] = []
    for (let c = 0; c < cols; c++) {
      const bx = c - (cols - 1) / 2
      for (let r = 0; r < this.rows; r++) {
        const by = r - (this.rows - 1) / 2
        // 위상·흩어짐 방향은 렌더 표현용(시뮬 아님) → Math.random 허용
        const ang = Math.random() * Math.PI * 2
        raw.push({ bx, by, phase: Math.random() * Math.PI * 2, dx: Math.cos(ang), dy: Math.sin(ang) })
      }
    }
    raw.sort((a, b) => Math.abs(a.bx) - Math.abs(b.bx)) // 중앙열 우선(사상자 좌우→중앙)
    this.slots = raw.slice(0, n)
  }

  update(dtMs: number) {
    const dt = dtMs / 1000
    this.time += dt

    if (this.routing) {
      this.routT += dt
      // 가장자리로 후퇴
      this.anchor.x += this.fleeDir.x * 170 * dt
      this.anchor.y += this.fleeDir.y * 170 * dt
      this.facing = Math.atan2(this.fleeDir.y, this.fleeDir.x) + Math.PI / 2
      // 도주 중 속수무책 사상자(약 10초에 걸쳐 얇아짐)
      this.routKillAcc += dt
      if (this.routKillAcc > 0.4) { this.routKillAcc = 0; this.kill(0.03) }
    } else if (this.target) {
      const dx = this.target.x - this.anchor.x
      const dy = this.target.y - this.anchor.y
      const dist = Math.hypot(dx, dy)
      if (dist < 2) { this.target = null }
      else {
        this.facing = Math.atan2(dy, dx) + Math.PI / 2
        const step = Math.min(dist, this.speed * dt)
        this.anchor.x += (dx / dist) * step
        this.anchor.y += (dy / dist) * step
      }
    }

    // 대열 폭: 도주=넓게 풀림 / 이동=모임 / 정지=펼침
    const targetSpread = this.routing ? 1.7 : this.target ? 0.35 : 1
    this.spread += (targetSpread - this.spread) * Math.min(1, dt * 3)

    // 흩어짐 정도(도주 경과에 비례해 대형이 구름처럼 퍼짐)
    const disperse = this.routing ? Math.min(140, this.routT * 55) : 0

    const cos = Math.cos(this.facing)
    const sin = Math.sin(this.facing)
    const bobAmp = this.routing ? 6 : 3
    const bobFreq = this.routing ? 7 : 4

    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i]
      if (i >= this.active) { s.visible = false; continue }
      s.visible = true
      const slot = this.slots[i]
      const lx = slot.bx * this.spacing * this.spread
      const ly = slot.by * this.spacing
      let wx = lx * cos - ly * sin
      let wy = lx * sin + ly * cos
      if (this.routing) {
        // 슬롯별 무작위 방향으로 벌어짐 + 매 프레임 지터(공황)
        wx += slot.dx * disperse + (Math.random() - 0.5) * 4
        wy += slot.dy * disperse + (Math.random() - 0.5) * 4
      }
      const pulse = Math.sin(this.time * bobFreq + slot.phase)
      s.x = this.anchor.x + wx
      s.y = this.anchor.y + wy + pulse * bobAmp
      const k = 1 + pulse * 0.06
      s.scale.set(cos >= 0 ? k : -k, k)
    }
  }
}
