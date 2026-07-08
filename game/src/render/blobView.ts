import { Container, Sprite, Texture } from 'pixi.js'
import type { Cohort } from '../sim/types'
import { CONFIG } from '../data/config'

const SP = CONFIG.spacing

// 가짜 3D(2.5D): 화면 아래(y 큼)일수록 카메라에 가깝다 → 나중에 그리고(위 겹침) 살짝 크게.
// TILT(0~1) = 카메라 앵글. 0=탑다운 평면, 클수록 비스듬히(원근 강조).
let TILT = 0 // 시작=평면. +로 기울인다.
export const setTilt = (v: number): void => { TILT = Math.max(0, Math.min(1, v)) }
export const getTilt = (): number => TILT
// 크기 원근: 앵글↑ 이면 앞(아래) 크게 / 뒤(위) 작게.
export const perspScale = (y: number): number =>
  1 + Math.max(-0.55, Math.min(0.8, (y / 900) * TILT * 2.5))

// 위치 투영: 대열을 눌러(압축) 겹치게 — 가까운 쪽은 밀집, 먼 쪽은 더 눌러 수렴.
//  (크기와 분리: 앞은 커지되 벌어지지 않아 겹침 유지)
export const projectY = (y: number): number => {
  const far = Math.max(0, -y / 900) // 0=근, 커질수록 원
  const compress = Math.max(0.3, 1 - TILT * (0.55 + far * 0.6))
  return y * compress
}

// 탭 좌표(투영된 y) → sim y 역변환 (projectY가 단조 증가라 이분탐색).
export const unprojectY = (sy: number): number => {
  let lo = -8000, hi = 8000
  for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (projectY(m) < sy) lo = m; else hi = m }
  return (lo + hi) / 2
}

// 하나의 Cohort를 스프라이트로 렌더. 스프라이트는 공유 정렬 컨테이너(sortableChildren)에 넣어
// 매 프레임 zIndex=y 로 깊이 정렬한다. 상태의 소스는 sim(cohort).
export class BlobView {
  private readonly sprites: Sprite[] = []
  private readonly phases: number[] = []
  private time = 0

  constructor(parent: Container, tex: Texture, color: number, private readonly condense: number, maxMen: number) {
    const maxS = Math.max(1, Math.ceil(maxMen / condense))
    for (let i = 0; i < maxS; i++) {
      const s = new Sprite(tex)
      s.anchor.set(0.5)
      s.tint = color
      s.visible = false
      parent.addChild(s) // 공유 정렬 컨테이너
      this.sprites.push(s)
      this.phases.push(Math.random() * Math.PI * 2)
    }
  }

  update(c: Cohort, dtMs: number, clear?: { cx: number; cy: number; r: number }): void {
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
      const lx = cols > 1 ? (col / (cols - 1) - 0.5) * 2 * halfW : 0
      const ly = rows > 1 ? (row / (rows - 1) - 0.5) * 2 * halfD : 0
      const wx = -sin * lx + cos * ly
      const wy = cos * lx + sin * ly
      const bob = Math.sin(this.time * 4 + this.phases[i]) * 3
      let px = c.anchor.x + wx
      let py = c.anchor.y + wy + bob
      if (clear) {
        const dx = px - clear.cx, dy = py - clear.cy, dd = Math.hypot(dx, dy)
        if (dd < clear.r) { const k = clear.r / (dd || 1); px = clear.cx + dx * k; py = clear.cy + dy * k }
      }
      const ry = projectY(py)       // Y 위치 원근 투영
      s.x = px
      s.y = ry
      s.zIndex = ry                 // 깊이 정렬(아래=앞)
      s.scale.set(perspScale(py))   // 원근 크기
    }
  }
}
