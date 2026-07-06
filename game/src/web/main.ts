import { Application, Container, Graphics, Sprite } from 'pixi.js'
import { Director } from '../director'
import { SCENARIOS } from '../scenarios'
import { Camera } from '../render/camera'
import { BlobView } from '../render/blobView'
import type { Cohort, Side, Unit } from '../sim/types'

// 렌더 = sim(Director) 상태를 그림. 시나리오를 재생한다.
//   ?s=advance|charge|duel|hill|defile  (기본 advance)

const hud = document.getElementById('hud')!
const KEY = new URLSearchParams(location.search).get('s') ?? 'advance'
const COLOR: Record<Side, number> = { A: 0x5599ff, B: 0xff6655 }

async function main() {
  const app = new Application()
  await app.init({ background: '#3a5a40', resizeTo: window, antialias: true })
  document.body.appendChild(app.canvas)

  const world = new Container()
  world.position.set(app.screen.width / 2, app.screen.height / 2)
  world.scale.set(0.65)
  app.stage.addChild(world)
  new Camera(world, app.canvas)

  const scn = SCENARIOS[KEY] ?? SCENARIOS.advance
  const d = new Director(scn)

  // 지형(생성 시 at:0에서 terrain 설정됨)
  const terrain = new Graphics()
  world.addChild(terrain)
  terrain.rect(-2000, -1200, 4000, 2400).fill(0x3f5e3a)
  for (const h of d.battle.terrain.hills) terrain.ellipse(h.x, h.y, h.radius, h.radius * 0.7).fill(0x63763f)

  // 텍스처
  const soldierTex = app.renderer.generateTexture(new Graphics().circle(0, 0, 4).fill(0xffffff).stroke({ color: 0x10240f, width: 1, alpha: 0.4 }))
  const genTex = app.renderer.generateTexture(new Graphics().star(0, 0, 5, 9, 4).fill(0xffffff))
  const flagTex = app.renderer.generateTexture(new Graphics().rect(-4, -11, 8, 22).fill(0xffffff))

  const layer = new Container()
  world.addChild(layer)

  const views: { c: Cohort; v: BlobView }[] = []
  const gens: { u: Unit; s: Sprite }[] = []
  const flags: { u: Unit; s: Sprite }[] = []
  for (const side of ['A', 'B'] as Side[]) {
    const u = d.battle.units[side]
    for (const c of u.cohorts) {
      const v = new BlobView(soldierTex, COLOR[side], 8, c.aliveHP)
      layer.addChild(v.container)
      views.push({ c, v })
    }
    const gs = new Sprite(genTex); gs.anchor.set(0.5); gs.tint = 0xffe08a; gs.scale.set(1.5)
    layer.addChild(gs); gens.push({ u, s: gs })
    const fs = new Sprite(flagTex); fs.anchor.set(0.5, 1); fs.tint = COLOR[side]
    layer.addChild(fs); flags.push({ u, s: fs })
  }

  addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); d.paused = !d.paused } })

  app.ticker.add((t) => {
    if (!d.done) d.step(t.deltaMS)
    for (const { c, v } of views) v.update(c, t.deltaMS)
    for (const { u, s } of gens) {
      s.visible = u.general.state === 'out' || u.general.state === 'rest'
      s.position.set(u.general.pos.x, u.general.pos.y)
    }
    for (const { u, s } of flags) s.position.set(u.flag.pos.x, u.flag.pos.y)
    hud.textContent = hudText(d, t.FPS)
  })
}

function hudText(d: Director, fps: number): string {
  const b = d.battle
  const res = b.result ? `  ▶ ${b.result.winner} ${b.result.degree}` : ''
  return (
    `산토쿠 · "${d.scenario.name}"  [${KEY}]\n` +
    `FPS ${Math.round(fps)}  t=${(b.time / 1000).toFixed(1)}s  ${b.phase}${d.paused ? ' ⏸' : ''}${res}\n` +
    `사기 A ${Math.round(b.units.A.morale)} / B ${Math.round(b.units.B.morale)}   ·  space=일시정지  드래그=이동 휠/핀치=줌`
  )
}

main()
