import { Container } from 'pixi.js'

// 연속 줌 카메라: 휠·핀치 = 줌(커서 기준), 드래그 = 팬.
export class Camera {
  private readonly pointers = new Map<number, { x: number; y: number }>()
  private lastPinchDist = 0
  minScale = 0.1
  maxScale = 6

  constructor(private readonly world: Container, canvas: HTMLCanvasElement) {
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
  }

  private zoomAt(sx: number, sy: number, factor: number) {
    const w = this.world
    const wx = (sx - w.x) / w.scale.x
    const wy = (sy - w.y) / w.scale.y
    const ns = Math.min(this.maxScale, Math.max(this.minScale, w.scale.x * factor))
    w.scale.set(ns)
    w.x = sx - wx * ns
    w.y = sy - wy * ns
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.1 : 1 / 1.1)
  }
  private onDown = (e: PointerEvent) => { this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY }) }
  private onMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    const prev = this.pointers.get(e.pointerId)!
    const cur = { x: e.offsetX, y: e.offsetY }
    this.pointers.set(e.pointerId, cur)
    const pts = [...this.pointers.values()]
    if (pts.length === 1) {
      this.world.x += cur.x - prev.x
      this.world.y += cur.y - prev.y
    } else if (pts.length === 2) {
      const [a, b] = pts
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (this.lastPinchDist > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.lastPinchDist)
      this.lastPinchDist = d
    }
  }
  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId)
    if (this.pointers.size < 2) this.lastPinchDist = 0
  }
}
