import { Container, Sprite, Texture } from 'pixi.js'

// 0단계 스파이크용 "덩어리(Cohort)" — 실제 코드베이스 아님(던져버리는 실험).
// 검증 대상: 앵커+슬롯+노이즈 렌더 / facing 회전 / 이동 시 모임→도착 펼침 / 사상자 좌우→중앙 수축.
// ⚠️ bob·스캐터는 순수 렌더 표현이다(시뮬에 되먹이지 않음). doc/05 5.6 참고.

export interface BlobOptions {
  men: number        // 병력수
  condense: number   // 축약: 병사 condense명당 스프라이트 1개
  rows: number       // 대형 깊이(스프라이트 행 수)
  spacing: number    // 병사 간격(px)
  color: number      // 팀 색(tint)
  x: number
  y: number
  facing: number     // radians
  texture: Texture
}

interface Slot {
  bx: number    // 중심 기준 열(width 방향)
  by: number    // 중심 기준 행(depth 방향)
  phase: number // bob 위상차
}

export class Blob {
  readonly container = new Container()
  anchor: { x: number; y: number }
  facing: number
  private target: { x: number; y: number } | null = null
  private spread = 1        // 1 = 펼침(대열) / 이동 중엔 0.35로 모임
  private readonly speed = 130
  private readonly sprites: Sprite[] = []
  private slots: Slot[] = []
  private readonly rows: number
  private readonly spacing: number
  private readonly full: number
  private active: number    // 현재 살아있는 스프라이트 수
  private time = 0

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

  // 사상자: 바깥 열(양끝)부터 사라져 중앙으로 수렴 (슬롯을 중앙열 우선 정렬해둠)
  kill(fraction: number) { this.active = Math.max(1, Math.floor(this.active * (1 - fraction))) }
  reset() { this.active = this.full }
  moveTo(x: number, y: number) { this.target = { x, y } }

  private buildSlots(n: number) {
    const cols = Math.ceil(n / this.rows)
    const raw: Slot[] = []
    for (let c = 0; c < cols; c++) {
      const bx = c - (cols - 1) / 2
      for (let r = 0; r < this.rows; r++) {
        const by = r - (this.rows - 1) / 2
        // 위상차는 렌더 표현용이므로 Math.random 허용(시뮬 아님)
        raw.push({ bx, by, phase: Math.random() * Math.PI * 2 })
      }
    }
    // 중앙 열 우선 정렬 → active를 줄이면 바깥부터 사라짐(좌우→중앙)
    raw.sort((a, b) => Math.abs(a.bx) - Math.abs(b.bx))
    this.slots = raw.slice(0, n)
  }

  update(dtMs: number) {
    const dt = dtMs / 1000
    this.time += dt

    // 이동 + 모임/펼침
    if (this.target) {
      const dx = this.target.x - this.anchor.x
      const dy = this.target.y - this.anchor.y
      const dist = Math.hypot(dx, dy)
      if (dist < 2) {
        this.target = null
      } else {
        this.facing = Math.atan2(dy, dx) + Math.PI / 2 // 전면이 진행 방향을 향하도록
        const step = Math.min(dist, this.speed * dt)
        this.anchor.x += (dx / dist) * step
        this.anchor.y += (dy / dist) * step
      }
    }
    const targetSpread = this.target ? 0.35 : 1 // 이동 중 모임 → 도착 시 펼침
    this.spread += (targetSpread - this.spread) * Math.min(1, dt * 4)

    // 슬롯 → 스프라이트 배치 (facing으로 회전, bob은 화면 수직 유지)
    const cos = Math.cos(this.facing)
    const sin = Math.sin(this.facing)
    const bobAmp = 3
    const bobFreq = 4
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i]
      if (i >= this.active) { s.visible = false; continue }
      s.visible = true
      const slot = this.slots[i]
      const lx = slot.bx * this.spacing * this.spread // 이동 시 width 축소(모임)
      const ly = slot.by * this.spacing
      const wx = lx * cos - ly * sin
      const wy = lx * sin + ly * cos
      const pulse = Math.sin(this.time * bobFreq + slot.phase)
      s.x = this.anchor.x + wx
      s.y = this.anchor.y + wy + pulse * bobAmp // bob = 화면 상하
      const k = 1 + pulse * 0.06
      s.scale.set(cos >= 0 ? k : -k, k) // 진행 방향에 따라 좌우 flip
    }
  }
}
