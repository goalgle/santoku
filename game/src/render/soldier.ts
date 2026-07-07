import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js'
import type { Cohort } from '../sim/types'
import { CONFIG } from '../data/config'
import { perspScale } from './blobView'

const SP = CONFIG.spacing
const F = 64 // 프레임 크기

export interface Clip { frames: Texture[]; fps: number; loop: boolean }
export interface SoldierClips { idle: Clip; walk: Clip; attack: Clip; dead: Clip }

// 가로 스트립 PNG(64×64 프레임)를 프레임 배열로 슬라이스.
async function sliceStrip(url: string, n: number): Promise<Texture[]> {
  const sheet: Texture = await Assets.load(url)
  const out: Texture[] = []
  for (let i = 0; i < n; i++) out.push(new Texture({ source: sheet.source, frame: new Rectangle(i * F, 0, F, F) }))
  return out
}

export async function loadSoldierClips(dir: string): Promise<SoldierClips> {
  const [idle, walk, attack, dead] = await Promise.all([
    sliceStrip(dir + 'soldier_idle_sheet.png', 4),
    sliceStrip(dir + 'soldier_walk_sheet.png', 4),
    sliceStrip(dir + 'soldier_attack_sheet.png', 4),
    sliceStrip(dir + 'soldier_dead_sheet.png', 2),
  ])
  return {
    idle: { frames: idle, fps: 5, loop: true },
    walk: { frames: walk, fps: 10, loop: true },
    attack: { frames: attack, fps: 12, loop: true },
    dead: { frames: dead, fps: 8, loop: false },
  }
}

interface St { phase: number; dying: boolean; dieT: number }

// 병종 덩어리를 애니 병사 스프라이트로 렌더. 상태(idle/walk/attack/dead)를 sim에서 읽어 클립 선택.
export class SoldierView {
  private readonly sprites: Sprite[] = []
  private readonly st: St[] = []
  private time = 0
  private prevN = 0

  constructor(
    parent: Container,
    private readonly clips: SoldierClips,
    tint: number,
    private readonly condense: number,
    maxMen: number,
    private readonly baseScale = 0.5,
  ) {
    const maxS = Math.max(1, Math.ceil(maxMen / condense))
    for (let i = 0; i < maxS; i++) {
      const s = new Sprite(clips.idle.frames[0])
      s.anchor.set(0.5, 1) // 발밑 기준(지면 정렬)
      s.tint = tint
      s.visible = false
      parent.addChild(s)
      this.sprites.push(s)
      this.st.push({ phase: Math.random(), dying: false, dieT: 0 })
    }
  }

  private clipFor(c: Cohort): Clip {
    if (c.inMelee) return this.clips.attack
    if (c.target) return this.clips.walk
    return this.clips.idle
  }

  update(c: Cohort, dtMs: number, clear?: { cx: number; cy: number; r: number }): void {
    const dt = dtMs / 1000
    this.time += dt
    const men = Math.max(0, c.aliveHP)
    const nS = Math.min(this.sprites.length, Math.ceil(men / this.condense))
    if (nS < this.prevN) for (let i = nS; i < this.prevN; i++) { this.st[i].dying = true; this.st[i].dieT = 0 }
    this.prevN = nS

    const widthMen = (men / c.depth) * c.spread
    const halfW = (widthMen * SP) / 2
    const halfD = (c.depth * SP) / 2
    const cols = Math.max(1, Math.round(Math.sqrt(nS * (halfW / Math.max(1, halfD)))))
    const rows = Math.max(1, Math.ceil(nS / cols))
    const cos = Math.cos(c.facing), sin = Math.sin(c.facing)
    const flip = cos < 0 ? -1 : 1 // 왼쪽 향하면 좌우 반전
    const clip = this.clipFor(c)

    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i]
      const stt = this.st[i]

      if (stt.dying) { // 사망 애니(제자리에서 재생 후 사라짐)
        stt.dieT += dt
        const fi = Math.min(this.clips.dead.frames.length - 1, Math.floor(stt.dieT * this.clips.dead.fps))
        s.texture = this.clips.dead.frames[fi]
        s.visible = true
        s.zIndex = s.y
        if (stt.dieT > 0.9) { s.visible = false; stt.dying = false }
        continue
      }

      if (i >= nS) { s.visible = false; continue }
      s.visible = true
      const col = i % cols, row = Math.floor(i / cols)
      const lx = cols > 1 ? (col / (cols - 1) - 0.5) * 2 * halfW : 0
      const ly = rows > 1 ? (row / (rows - 1) - 0.5) * 2 * halfD : 0
      let px = c.anchor.x + (-sin * lx + cos * ly)
      let py = c.anchor.y + (cos * lx + sin * ly) + Math.sin(this.time * 4 + stt.phase * 6) * 2
      if (clear) {
        const dx = px - clear.cx, dy = py - clear.cy, dd = Math.hypot(dx, dy)
        if (dd < clear.r) { const k = clear.r / (dd || 1); px = clear.cx + dx * k; py = clear.cy + dy * k }
      }
      s.x = px; s.y = py; s.zIndex = py
      const sc = this.baseScale * perspScale(py)
      s.scale.set(flip * sc, sc)
      const n = clip.frames.length
      const fi = Math.floor(this.time * clip.fps + stt.phase * n) % n
      s.texture = clip.frames[fi]
    }
  }
}
