import { Application, Container, Graphics, Sprite } from 'pixi.js'
import { Director } from '../director'
import { SCENARIOS } from '../scenarios'
import { Camera } from '../render/camera'
import { BlobView, perspScale, setTilt, getTilt } from '../render/blobView'
import type { Cohort, Side, Unit } from '../sim/types'

// 렌더 = sim(Director) 상태를 그림.  ?s=advance|charge|duel|hill|defile (기본 advance)
// 가짜 3D: y-정렬(아래=앞) + 원근 크기 + tiltLayer 수직 압축(카메라 앵글).

const hud = document.getElementById('hud')!
const KEY = new URLSearchParams(location.search).get('s') ?? 'advance'
const COLOR: Record<Side, number> = { A: 0x5599ff, B: 0xff6655 }
const CONDENSE = 4 // 병사 4명당 스프라이트 1 (FPS 체크용으로 다소 촘촘히)

async function main() {
  const app = new Application()
  await app.init({ background: '#3a5a40', resizeTo: window, antialias: true })
  document.body.appendChild(app.canvas)

  const world = new Container()
  world.position.set(app.screen.width / 2, app.screen.height / 2)
  world.scale.set(0.65)
  app.stage.addChild(world)
  new Camera(world, app.canvas)

  // tiltLayer = 수직 압축(카메라 앵글)을 카메라 줌과 분리
  const tiltLayer = new Container()
  world.addChild(tiltLayer)
  const applyTilt = () => { tiltLayer.scale.y = 1 - getTilt() * 0.6 } // 앵글↑ = 세로 압축↑
  applyTilt()

  const scn = SCENARIOS[KEY] ?? SCENARIOS.advance
  const d = new Director(scn)

  const terrain = new Graphics()
  tiltLayer.addChild(terrain)
  terrain.rect(-2000, -1200, 4000, 2400).fill(0x3f5e3a)
  for (const h of d.battle.terrain.hills) terrain.ellipse(h.x, h.y, h.radius, h.radius * 0.7).fill(0x63763f)
  // 바닥 격자(틸트/원근 확인용) — 앵글 올리면 세로 간격이 압축돼 기울어 보임
  for (let gx = -1200; gx <= 1200; gx += 100) terrain.moveTo(gx, -800).lineTo(gx, 800)
  for (let gy = -800; gy <= 800; gy += 100) terrain.moveTo(-1200, gy).lineTo(1200, gy)
  terrain.stroke({ color: 0x2c4a2a, width: 1, alpha: 0.6 })

  const soldierTex = app.renderer.generateTexture(new Graphics().circle(0, 0, 5).fill(0xffffff).stroke({ color: 0x10240f, width: 1, alpha: 0.4 }))
  const genTex = app.renderer.generateTexture(new Graphics().star(0, 0, 5, 9, 4).fill(0xffffff))
  const flagTex = app.renderer.generateTexture(new Graphics().rect(-4, -11, 8, 22).fill(0xffffff))

  const units = new Container()
  units.sortableChildren = true // zIndex=y 로 깊이 정렬
  tiltLayer.addChild(units)

  const views: { c: Cohort; v: BlobView }[] = []
  const gens: { u: Unit; s: Sprite }[] = []
  const flags: { u: Unit; s: Sprite }[] = []
  for (const side of ['A', 'B'] as Side[]) {
    const u = d.battle.units[side]
    for (const c of u.cohorts) views.push({ c, v: new BlobView(units, soldierTex, COLOR[side], CONDENSE, c.aliveHP) })
    const gs = new Sprite(genTex); gs.anchor.set(0.5); gs.tint = 0xffe08a
    units.addChild(gs); gens.push({ u, s: gs })
    const fs = new Sprite(flagTex); fs.anchor.set(0.5, 1); fs.tint = COLOR[side]
    units.addChild(fs); flags.push({ u, s: fs })
  }

  // 카메라 앵글 버튼 + 키
  const nudgeTilt = (dv: number) => { setTilt(getTilt() + dv); applyTilt() } // 스텝 0.15
  document.getElementById('angleUp')?.addEventListener('click', () => nudgeTilt(0.15))
  document.getElementById('angleDown')?.addEventListener('click', () => nudgeTilt(-0.15))
  addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); d.paused = !d.paused }
    if (e.key === '[') nudgeTilt(-0.15)
    if (e.key === ']') nudgeTilt(0.15)
  })

  let rtime = 0
  app.ticker.add((t) => {
    if (!d.done) d.step(t.deltaMS)
    rtime += t.deltaMS / 1000

    // 결투장 정리 원
    const gA = d.battle.units.A.general, gB = d.battle.units.B.general
    let clear: { cx: number; cy: number; r: number } | undefined
    if (gA.state === 'out' && gB.state === 'out' &&
        Math.hypot(gA.pos.x - gB.pos.x, gA.pos.y - gB.pos.y) < 120) {
      const grow = Math.min(1, Math.max(gA.meleeTime, gB.meleeTime) / 6)
      clear = { cx: (gA.pos.x + gB.pos.x) / 2, cy: (gA.pos.y + gB.pos.y) / 2, r: 34 + grow * 60 }
    }

    for (const { c, v } of views) v.update(c, t.deltaMS, clear)

    for (const { u, s } of gens) {
      s.visible = u.general.state === 'out' || u.general.state === 'rest'
      let gx = u.general.pos.x, gy = u.general.pos.y
      if (clear && u.general.state === 'out') {
        const a = rtime * 3 + (u.side === 'A' ? 0 : Math.PI)
        gx = clear.cx + Math.cos(a) * 14
        gy = clear.cy + Math.sin(a) * 14
      }
      s.position.set(gx, gy)
      s.zIndex = gy + 1
      s.scale.set(1.5 * perspScale(gy))
    }
    for (const { u, s } of flags) {
      s.position.set(u.flag.pos.x, u.flag.pos.y)
      s.zIndex = u.flag.pos.y
      s.scale.set(perspScale(u.flag.pos.y))
    }

    const sprites = views.reduce((n, { c }) => n + Math.max(0, Math.ceil(c.aliveHP / CONDENSE)), 0)
    hud.textContent = hudText(d, t.FPS, sprites)
  })
}

function hudText(d: Director, fps: number, sprites: number): string {
  const b = d.battle
  const res = b.result ? `  ▶ ${b.result.winner} ${b.result.degree}` : ''
  return (
    `산토쿠 · "${d.scenario.name}"  [${KEY}]\n` +
    `FPS ${Math.round(fps)}  sprites ${sprites}  앵글 ${getTilt().toFixed(1)}  t=${(b.time / 1000).toFixed(1)}s  ${b.phase}${d.paused ? ' ⏸' : ''}${res}\n` +
    `사기 A ${Math.round(b.units.A.morale)} / B ${Math.round(b.units.B.morale)}   ·  space=일시정지  [ ]=앵글  드래그·핀치=카메라`
  )
}

main()
