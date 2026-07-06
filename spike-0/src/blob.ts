import { Container, Sprite, Texture } from 'pixi.js'

// 0단계 스파이크용 "덩어리(Cohort)" — 실제 코드베이스 아님(던져버리는 실험).
// 검증 대상: 앵커+슬롯+노이즈 렌더 / facing / 이동(모임→펼침) / 사상자 수축 /
//           도주(대형 붕괴 흩어짐) / ★사상자 = 개별 스프라이트 "폴짝 튀어 소멸" 연출.
// ⚠️ bob·흩어짐·사망연출은 순수 렌더 표현이다(시뮬에 되먹이지 않음). doc/05 5.6 참고.
// 핵심: sim은 "이번 틱 N명 사망"이라는 숫자만 준다(O(부대)). N개 스프라이트를 튀겨 없애는 건 렌더.

export interface BlobOptions {
  men: number
  condense: number
  rows: number
  spacing: number
  color: number
  x: number
  y: number
  facing: number
  frames: Texture[] // ○□△★ 연속 애니 프레임(성능 테스트용)
}

const ANIM_FPS = 6 // 프레임 전환 속도(초당)

interface Slot { bx: number; by: number; phase: number; dx: number; dy: number }
interface Death { t: number; x: number; y: number; vx: number; vy: number }

const DEATH_DUR = 0.5 // 폴짝→소멸 지속(초)

export class Blob {
  readonly container = new Container()
  anchor: { x: number; y: number }
  facing: number
  private target: { x: number; y: number } | null = null
  private spread = 1
  private readonly speed = 130
  private readonly sprites: Sprite[] = []
  private readonly death: (Death | null)[] = []
  private slots: Slot[] = []
  private readonly rows: number
  private readonly spacing: number
  private readonly frames: Texture[]
  private readonly full: number
  private active: number
  private time = 0

  private routing = false
  private routT = 0
  private fleeDir = { x: 0, y: 0 }
  private routKillAcc = 0
  private readonly start: { x: number; y: number; facing: number }

  constructor(opts: BlobOptions) {
    this.anchor = { x: opts.x, y: opts.y }
    this.facing = opts.facing
    this.start = { x: opts.x, y: opts.y, facing: opts.facing }
    this.rows = opts.rows
    this.spacing = opts.spacing
    this.frames = opts.frames
    this.full = Math.max(1, Math.floor(opts.men / opts.condense))
    this.active = this.full
    this.buildSlots(this.full)
    for (let i = 0; i < this.full; i++) {
      const s = new Sprite(opts.frames[0])
      s.anchor.set(0.5)
      s.tint = opts.color
      this.container.addChild(s)
      this.sprites.push(s)
      this.death.push(null)
    }
  }

  get spriteCount() { return this.active }
  get isRouting() { return this.routing }

  // 사망 = 스프라이트 하나를 (ox,oy)에서 폴짝 튀어 소멸시키기 시작
  private die(i: number, ox: number, oy: number) {
    this.death[i] = { t: 0, x: ox, y: oy, vx: (Math.random() - 0.5) * 60, vy: -(110 + Math.random() * 90) }
  }

  // 일반 사망 N명: 각자 현재(슬롯) 위치에서 팝 — 흩어짐/일반 감소용
  killCount(n: number) {
    const start = Math.max(1, this.active - n)
    for (let i = start; i < this.active; i++) this.die(i, this.sprites[i].x, this.sprites[i].y)
    this.active = start
  }
  kill(fraction: number) { this.killCount(this.active - Math.max(1, Math.floor(this.active * (1 - fraction)))) }

  // ★접전 사망 N명: 대열 "전면 1~3열"의 랜덤 위치에서 팝.
  //   실루엣은 여전히 좌우(꼬리)부터 줄지만, 팝만 전면에 띄운다.
  //   위치는 렌더와 동일한 변환(facing·spread)으로 계산 → 대열에 딱 붙는다(무관한 장소 X).
  killFront(n: number) {
    const start = Math.max(1, this.active - n)
    const cos = Math.cos(this.facing)
    const sin = Math.sin(this.facing)
    const cols = Math.ceil(this.active / this.rows)
    const byFront = -(this.rows - 1) / 2 // 전면열(local -by가 앞)
    for (let i = start; i < this.active; i++) {
      const bx = (Math.random() * 2 - 1) * ((cols - 1) / 2) // 폭 방향 랜덤
      const by = byFront + Math.random() * 2.5              // 전면 1~3열
      const lx = bx * this.spacing * this.spread
      const ly = by * this.spacing
      this.die(i, this.anchor.x + lx * cos - ly * sin, this.anchor.y + lx * sin + ly * cos)
    }
    this.active = start
  }

  moveTo(x: number, y: number) { if (!this.routing) this.target = { x, y } }

  rout() {
    if (this.routing) return
    this.routing = true
    this.routT = 0
    this.target = null
    const len = Math.hypot(this.anchor.x, this.anchor.y) || 1
    this.fleeDir = { x: this.anchor.x / len, y: this.anchor.y / len }
  }

  reset() {
    this.active = this.full
    this.routing = false
    this.routT = 0
    this.target = null
    this.spread = 1
    this.anchor = { x: this.start.x, y: this.start.y } // 시작 위치·방향 복원
    this.facing = this.start.facing
    for (let i = 0; i < this.sprites.length; i++) { this.death[i] = null; this.sprites[i].alpha = 1 }
  }

  private buildSlots(n: number) {
    const cols = Math.ceil(n / this.rows)
    const raw: Slot[] = []
    for (let c = 0; c < cols; c++) {
      const bx = c - (cols - 1) / 2
      for (let r = 0; r < this.rows; r++) {
        const by = r - (this.rows - 1) / 2
        const ang = Math.random() * Math.PI * 2
        raw.push({ bx, by, phase: Math.random() * Math.PI * 2, dx: Math.cos(ang), dy: Math.sin(ang) })
      }
    }
    raw.sort((a, b) => Math.abs(a.bx) - Math.abs(b.bx))
    this.slots = raw.slice(0, n)
  }

  update(dtMs: number) {
    const dt = dtMs / 1000
    this.time += dt

    if (this.routing) {
      this.routT += dt
      this.anchor.x += this.fleeDir.x * 170 * dt
      this.anchor.y += this.fleeDir.y * 170 * dt
      this.facing = Math.atan2(this.fleeDir.y, this.fleeDir.x) + Math.PI / 2
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

    const targetSpread = this.routing ? 1.7 : this.target ? 0.35 : 1
    this.spread += (targetSpread - this.spread) * Math.min(1, dt * 3)
    const disperse = this.routing ? Math.min(140, this.routT * 55) : 0

    const cos = Math.cos(this.facing)
    const sin = Math.sin(this.facing)
    const bobAmp = this.routing ? 6 : 3
    const bobFreq = this.routing ? 7 : 4

    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i]

      // 사망 연출(폴짝 튀어올라 페이드 소멸) — 대형과 무관하게 개별 이벤트
      const d = this.death[i]
      if (d) {
        d.t += dt
        if (d.t >= DEATH_DUR) { s.visible = false; s.alpha = 1; this.death[i] = null; continue }
        d.vy += 560 * dt // 중력
        d.x += d.vx * dt
        d.y += d.vy * dt
        const p = d.t / DEATH_DUR
        s.visible = true
        s.alpha = 1 - p
        s.x = d.x
        s.y = d.y
        s.scale.set(1 + 0.6 * Math.sin(p * Math.PI)) // 폴짝: 커졌다 작아짐
        continue
      }

      if (i >= this.active) { s.visible = false; continue }

      s.visible = true
      s.alpha = 1
      const slot = this.slots[i]
      const lx = slot.bx * this.spacing * this.spread
      const ly = slot.by * this.spacing
      let wx = lx * cos - ly * sin
      let wy = lx * sin + ly * cos
      if (this.routing) {
        wx += slot.dx * disperse + (Math.random() - 0.5) * 4
        wy += slot.dy * disperse + (Math.random() - 0.5) * 4
      }
      // 연속 애니: 매 틱 프레임 교체(슬롯별 위상차로 비동기) — 성능 테스트
      s.texture = this.frames[Math.floor(this.time * ANIM_FPS + slot.phase * 3) % this.frames.length]
      const pulse = Math.sin(this.time * bobFreq + slot.phase)
      s.x = this.anchor.x + wx
      s.y = this.anchor.y + wy + pulse * bobAmp
      const k = 1 + pulse * 0.06
      s.scale.set(cos >= 0 ? k : -k, k)
    }
  }
}
