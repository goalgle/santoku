import { Application, Container, Graphics } from 'pixi.js'
import { Director } from '../director'
import { SCENARIOS } from '../scenarios'
import { Camera } from '../render/camera'
import { setTilt, getTilt, projectY } from '../render/blobView'
import { loadClips, loadNamed, SoldierView, CharacterSprite } from '../render/soldier'
import type { SoldierClips, Clear } from '../render/soldier'
import { CommandController, AbilityBar } from '../render/command'
import { CONFIG } from '../data/config'
import type { TroopKind } from '../data/units'
import type { Cohort, Side, Unit } from '../sim/types'

// 렌더 = sim(Director) 상태를 그림.  ?s=advance|charge|duel|hill|defile (기본 advance)
// 가짜 3D: y-정렬(아래=앞) + 원근 크기 + tiltLayer 수직 압축(카메라 앵글).

const hud = document.getElementById('hud')!
const KEY = new URLSearchParams(location.search).get('s') ?? 'advance'
// 옅은 팀 틴트(스프라이트 디테일 보존 — 곱연산이라 밝을수록 원본 유지)
const COLOR: Record<Side, number> = { A: 0xbcd4ff, B: 0xffc0b8 }
const CONDENSE = 8 // 병사 8명당 스프라이트 1

async function main() {
  const app = new Application()
  await app.init({ background: '#3a5a40', resizeTo: window, antialias: true })
  document.body.appendChild(app.canvas)

  const world = new Container()
  world.position.set(app.screen.width / 2, app.screen.height / 2)
  world.scale.set(0.65)
  app.stage.addChild(world)
  const camera = new Camera(world, app.canvas)

  // tiltLayer = 수직 압축(카메라 앵글)을 카메라 줌과 분리
  // tiltLayer: 좌표 그룹(원근은 이제 per-sprite projectY 로 처리 — 컨테이너 압축 없음)
  const tiltLayer = new Container()
  world.addChild(tiltLayer)

  const scn = SCENARIOS[KEY] ?? SCENARIOS.advance
  const d = new Director(scn)

  const terrain = new Graphics()
  tiltLayer.addChild(terrain)
  const drawTerrain = () => { // 매 프레임: 지형(고지 y도 원근 투영)
    terrain.clear()
    terrain.rect(-2000, -1200, 4000, 2400).fill(0x3f5e3a)
    for (const h of d.battle.terrain.hills) terrain.ellipse(h.x, projectY(h.y), h.radius, h.radius * 0.7).fill(0x63763f)
  }

  // 병종별 스프라이트 로드
  const base = import.meta.env.BASE_URL + 'sprites/'
  const KINDS: TroopKind[] = ['shield', 'spear', 'bow', 'cavalry']
  const clipsByKind = {} as Record<TroopKind, SoldierClips>
  await Promise.all(KINDS.map(async (k) => { clipsByKind[k] = await loadClips(base, k) }))

  // 장수·부대군기(깃발병) 클립
  const generalClips = await loadNamed(base, [
    { name: 'idle', file: 'general/general_idle_sheet_256x64.png', frames: 4, fps: 5, loop: true },
    { name: 'walk', file: 'general/general_walk_sheet_256x64.png', frames: 4, fps: 10, loop: true },
    { name: 'attack', file: 'general/general_attack_sheet_256x64.png', frames: 4, fps: 12, loop: true },
    { name: 'dead', file: 'general/general_dead_sheet_128x64.png', frames: 2, fps: 8, loop: false },
  ])
  const flagClips = await loadNamed(base, [
    { name: 'idle', file: 'flagbearer/flagbearer_idle_sheet_256x64.png', frames: 4, fps: 4, loop: true },
    { name: 'dead', file: 'flagbearer/flagbearer_dead_sheet_128x64.png', frames: 2, fps: 8, loop: false },
  ])

  const units = new Container()
  units.sortableChildren = true // zIndex=y 로 깊이 정렬
  tiltLayer.addChild(units)

  const views: { c: Cohort; v: SoldierView; side: Side }[] = []
  const gens: { u: Unit; c: CharacterSprite }[] = []
  const flags: { u: Unit; c: CharacterSprite }[] = []
  for (const side of ['A', 'B'] as Side[]) {
    const u = d.battle.units[side]
    for (const c of u.cohorts) views.push({ c, v: new SoldierView(units, clipsByKind[c.kind], COLOR[side], CONDENSE, c.aliveHP), side })
    gens.push({ u, c: new CharacterSprite(units, generalClips, COLOR[side], 1.4) })
    flags.push({ u, c: new CharacterSprite(units, flagClips, COLOR[side], 1.2) })
  }

  // 개입 UI (플레이어 = A): 어빌리티 바(주) + 탭 이동(위치 미세조정)
  const cmd = new CommandController(tiltLayer, app.canvas, d.battle, () => d.paused, 'A')
  const abilityBar = new AbilityBar(d.battle, 'A')

  // 액티브 포즈 토글(버튼 + space)
  const pauseBtn = document.getElementById('pausebtn')
  const togglePause = () => { d.paused = !d.paused; if (pauseBtn) pauseBtn.textContent = d.paused ? '▶ 재개' : '⏸ 명령' }
  pauseBtn?.addEventListener('click', togglePause)

  // 카메라 앵글: 시작 5단계(0.75). 명령 모드=평면(0)으로 전환, 종료 시 복귀. (ticker에서 애니)
  let baseTilt = 0.75
  setTilt(baseTilt)
  const nudgeTilt = (dv: number) => { baseTilt = Math.max(0, Math.min(1, baseTilt + dv)) }
  document.getElementById('angleUp')?.addEventListener('click', () => nudgeTilt(0.15))
  document.getElementById('angleDown')?.addEventListener('click', () => nudgeTilt(-0.15))

  // 화면 중앙 기준 확대/축소
  document.getElementById('zoomIn')?.addEventListener('click', () => camera.zoomBy(1.2))
  document.getElementById('zoomOut')?.addEventListener('click', () => camera.zoomBy(1 / 1.2))

  addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); togglePause() }
    if (e.key === '0') nudgeTilt(0.15)  // 앵글 ↑
    if (e.key === '9') nudgeTilt(-0.15) // 앵글 ↓
  })

  let rtime = 0
  app.ticker.add((t) => {
    // 앵글 애니: 명령 모드=평면(0), 아니면 선호 앵글(baseTilt)로 부드럽게
    const tiltTarget = d.paused ? 0 : baseTilt
    setTilt(getTilt() + (tiltTarget - getTilt()) * Math.min(1, (t.deltaMS / 1000) * 6))
    drawTerrain() // 지형(고지 원근 투영)
    if (!d.done) d.step(t.deltaMS)
    rtime += t.deltaMS / 1000

    // 결투장 정리 원(양측 다 물러남)
    const gA = d.battle.units.A.general, gB = d.battle.units.B.general
    const dueling = gA.state === 'out' && gB.state === 'out' &&
      Math.hypot(gA.pos.x - gB.pos.x, gA.pos.y - gB.pos.y) < 120
    let duelClear: Clear | undefined
    if (dueling) {
      const grow = Math.min(1, Math.max(gA.meleeTime, gB.meleeTime) / 6)
      duelClear = { cx: (gA.pos.x + gB.pos.x) / 2, cy: (gA.pos.y + gB.pos.y) / 2, r: 34 + grow * 60 }
    }
    // 장수 존재감: 결투 중이 아니면 아군 병사가 장수 주변에 거리를 둠
    const clearsBySide: Record<Side, Clear[]> = { A: [], B: [] }
    for (const side of ['A', 'B'] as Side[]) {
      if (duelClear) { clearsBySide[side].push(duelClear); continue }
      const g = d.battle.units[side].general
      if (g.state === 'out') clearsBySide[side].push({ cx: g.pos.x, cy: g.pos.y, r: CONFIG.generalSpace })
    }

    for (const { c, v, side } of views) v.update(c, t.deltaMS, clearsBySide[side])

    for (const { u, c } of gens) {
      const g = u.general
      c.sprite.visible = g.state === 'out' || g.state === 'rest'
      let gx = g.pos.x, gy = g.pos.y
      if (duelClear && g.state === 'out') { // 결투 중 서로 도는 연출
        const a = rtime * 3 + (u.side === 'A' ? 0 : Math.PI)
        gx = duelClear.cx + Math.cos(a) * 14
        gy = duelClear.cy + Math.sin(a) * 14
      }
      const clip = duelClear && g.state === 'out' ? 'attack' : g.state === 'rest' ? 'walk' : 'idle'
      c.update(t.deltaMS, clip, gx, gy, u.side === 'A' ? 1 : -1)
    }
    for (const { u, c } of flags) {
      c.update(t.deltaMS, 'idle', u.flag.pos.x, u.flag.pos.y, u.side === 'A' ? 1 : -1)
    }
    cmd.draw()
    abilityBar.update()

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
    `사기 A ${Math.round(b.units.A.morale)} / B ${Math.round(b.units.B.morale)}   ·  space=일시정지  9/0=앵글  드래그·핀치=카메라`
  )
}

main()
