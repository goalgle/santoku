import { Application, Container, Graphics, Texture } from 'pixi.js'
import { Blob } from './blob'
import { Camera } from './camera'

// 0단계 스파이크 — "움직이고 도는 덩어리가 병사를 흘리며 그려지나 + 몇 개까지 되나".
// 전투 로직 없음. 자동 배회로 이동(모임→펼침)을 보여주고, 더블탭으로 사상자 수축을 데모.

const hud = document.getElementById('hud')!

async function main() {
  const app = new Application()
  await app.init({ background: '#3a5a40', resizeTo: window, antialias: true })
  document.body.appendChild(app.canvas)

  // 카메라(world) — 화면 중앙을 원점으로
  const world = new Container()
  world.position.set(app.screen.width / 2, app.screen.height / 2)
  app.stage.addChild(world)
  new Camera(world, app.canvas)

  // 지형 배경(대충) — 평지 + 언덕 + 잡티
  const terrain = new Container()
  world.addChild(terrain)
  const ground = new Graphics().rect(-1500, -950, 3000, 1900).fill(0x3f5e3a)
  const hill = new Graphics()
    .ellipse(280, -110, 380, 250).fill(0x63763f)
    .ellipse(280, -110, 250, 160).fill(0x6f8347)
  const patches = new Graphics()
  for (let i = 0; i < 60; i++) {
    const px = -1400 + Math.random() * 2800
    const py = -880 + Math.random() * 1760
    patches.ellipse(px, py, 10 + Math.random() * 26, 6 + Math.random() * 16).fill({ color: 0x35502f, alpha: 0.5 })
  }
  terrain.addChild(ground, hill, patches)

  // 병사 애니 프레임(대충): ○ □ △ ★ — 흰색으로 그려 tint로 팀색 입힘
  const shapeTex = (draw: (g: Graphics) => void): Texture => {
    const g = new Graphics()
    draw(g)
    const t = app.renderer.generateTexture(g)
    g.destroy()
    return t
  }
  const star: number[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 6 : 2.6
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    star.push(Math.cos(a) * r, Math.sin(a) * r)
  }
  const frames = [
    shapeTex((g) => g.circle(0, 0, 5).fill(0xffffff)),
    shapeTex((g) => g.rect(-4.5, -4.5, 9, 9).fill(0xffffff)),
    shapeTex((g) => g.poly([0, -6, 5.2, 4, -5.2, 4]).fill(0xffffff)),
    shapeTex((g) => g.poly(star).fill(0xffffff)),
  ]

  const rows = 10
  const spacing = 12
  const blobs = [
    new Blob({ men: 2000, condense: 1, rows, spacing, color: 0x5599ff, x: -280, y: 0, facing: Math.PI / 2, frames }),
    new Blob({ men: 2000, condense: 1, rows, spacing, color: 0xff6655, x: 280, y: 0, facing: -Math.PI / 2, frames }),
  ]
  for (const b of blobs) world.addChild(b.container)

  // 두 대열은 마주본 채 정지. c=접점으로 이동해 멈춤 / d=푸른 사망 / k=붉은 사망 / f=도주 / r=리셋
  //  (배회 없음 — 정확히 보기 위해 고정)
  let lastTap = 0
  app.canvas.addEventListener('pointerdown', () => {
    const now = performance.now() // 렌더/입력용 — 시뮬 아님
    if (now - lastTap < 300) blobs.forEach((b) => b.rout())
    lastTap = now
  })
  addEventListener('keydown', (e) => {
    if (e.key === 'r') blobs.forEach((b) => b.reset())
    if (e.key === 'c') { blobs[0].moveTo(-64, 0); blobs[1].moveTo(64, 0) } // 접점으로 이동 후 멈춤
    if (e.key === 'd') blobs[0].killFront(10) // 푸른 대열 전면 사망
    if (e.key === 'k') blobs[1].killFront(10) // 붉은 대열 전면 사망
    if (e.key === 'f') blobs.forEach((b) => b.rout())
  })

  app.ticker.add((t) => {
    for (const b of blobs) b.update(t.deltaMS)

    const sprites = blobs.reduce((n, b) => n + b.spriteCount, 0)
    const state = blobs.some((b) => b.isRouting) ? '  [도주]' : ''
    hud.textContent =
      'santoku · spike-0 — 덩어리 렌더 검증 (○□△★ 애니 + 지형)\n' +
      `FPS ${Math.round(t.FPS)}    sprites ${sprites}${state}\n` +
      'c=접점 이동  d=푸른 사망  k=붉은 사망  f=도주  r=리셋  (드래그=이동 휠/핀치=줌)'
  })
}

main()
