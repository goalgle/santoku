import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js'
import type { Cohort } from '../sim/types'
import type { TroopKind } from '../data/units'
import { CONFIG } from '../data/config'
import { perspScale, projectY } from './blobView'

const SP = CONFIG.spacing
const F = 64 // 프레임 크기

export interface Clip { frames: Texture[]; fps: number; loop: boolean }
export interface SoldierClips { idle: Clip; walk: Clip; attack: Clip; dead: Clip }
export interface Clear { cx: number; cy: number; r: number } // 병사를 밀어내는 원(결투장·장수 존재감)

// 가로 스트립 PNG(64×64 프레임)를 프레임 배열로 슬라이스.
async function sliceStrip(url: string, n: number): Promise<Texture[]> {
  const sheet: Texture = await Assets.load(url)
  const out: Texture[] = []
  for (let i = 0; i < n; i++) out.push(new Texture({ source: sheet.source, frame: new Rectangle(i * F, 0, F, F) }))
  return out
}

// 병종별 파일명 규칙. shield만 soldier_*, 나머지는 {unit}_*_sheet_{w}x64.
function clipFile(kind: TroopKind, clip: string, frames: number): string {
  if (kind === 'shield') return `shield/soldier_${clip}_sheet.png`
  const p: Record<'spear' | 'bow' | 'cavalry', string> = {
    spear: 'spearman/spearman', bow: 'archer/archer', cavalry: 'cavalry/cavalry',
  }
  return `${p[kind]}_${clip}_sheet_${frames * 64}x64.png`
}

export async function loadClips(baseUrl: string, kind: TroopKind): Promise<SoldierClips> {
  const [idle, walk, attack, dead] = await Promise.all([
    sliceStrip(baseUrl + clipFile(kind, 'idle', 4), 4),
    sliceStrip(baseUrl + clipFile(kind, 'walk', 4), 4),
    sliceStrip(baseUrl + clipFile(kind, 'attack', 4), 4),
    sliceStrip(baseUrl + clipFile(kind, 'dead', 2), 2),
  ])
  return {
    idle: { frames: idle, fps: 5, loop: true },
    walk: { frames: walk, fps: 10, loop: true },
    attack: { frames: attack, fps: 12, loop: true },
    dead: { frames: dead, fps: 8, loop: false },
  }
}

// 범용 클립 로더(장수·깃발병처럼 파일명이 제각각인 경우)
export async function loadNamed(
  baseUrl: string,
  entries: { name: string; file: string; frames: number; fps: number; loop: boolean }[],
): Promise<Record<string, Clip>> {
  const out: Record<string, Clip> = {}
  await Promise.all(entries.map(async (e) => {
    out[e.name] = { frames: await sliceStrip(baseUrl + e.file, e.frames), fps: e.fps, loop: e.loop }
  }))
  return out
}

// 단일 캐릭터(장수·부대군기) 애니 스프라이트.
export class CharacterSprite {
  readonly sprite: Sprite
  private time = 0
  constructor(parent: Container, private readonly clips: Record<string, Clip>, tint: number, private readonly scale = 1) {
    this.sprite = new Sprite(clips.idle.frames[0])
    this.sprite.anchor.set(0.5, 1) // 발밑
    this.sprite.tint = tint
    parent.addChild(this.sprite)
  }
  update(dtMs: number, clipName: string, x: number, y: number, flip = 1): void {
    this.time += dtMs / 1000
    const clip = this.clips[clipName] ?? this.clips.idle
    const n = clip.frames.length
    const fi = clip.loop ? Math.floor(this.time * clip.fps) % n : Math.min(n - 1, Math.floor(this.time * clip.fps))
    this.sprite.texture = clip.frames[fi]
    const ry = projectY(y)
    this.sprite.position.set(x, ry)
    this.sprite.zIndex = ry + 1 // 병사보다 살짝 앞
    const sc = this.scale * perspScale(y)
    this.sprite.scale.set(flip * sc, sc)
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
    private readonly baseScale = 1.0, // 캐릭터 크기(≈64px)
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
    if (c.inMelee || c.firing) return this.clips.attack // 근접 or 궁병 사격 → 공격 모션
    if (c.target) return this.clips.walk
    return this.clips.idle
  }

  update(c: Cohort, dtMs: number, clears?: Clear[]): void {
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
      if (clears) for (const cl of clears) { // 결투장·장수 존재감: 원 안이면 가장자리로 밀어냄
        const dx = px - cl.cx, dy = py - cl.cy, dd = Math.hypot(dx, dy)
        if (dd < cl.r) { const k = cl.r / (dd || 1); px = cl.cx + dx * k; py = cl.cy + dy * k }
      }
      const ry = projectY(py)
      s.x = px; s.y = ry; s.zIndex = ry
      const sc = this.baseScale * perspScale(py)
      s.scale.set(flip * sc, sc)
      const n = clip.frames.length
      const fi = Math.floor(this.time * clip.fps + stt.phase * n) % n
      s.texture = clip.frames[fi]
    }
  }
}
