import { createBattle, step } from './sim/battle'
import type { Scenario, TimedAction } from './scenario'
import type { Battle } from './sim/types'

// 시나리오 러너. 렌더도 이걸 써서 재생한다:
//   const d = new Director(scn); loop: d.step(dtMs); render(d.battle)
// 액티브 포즈 = paused = true (틱 정지, 렌더는 계속).

export class Director {
  readonly battle: Battle
  readonly scenario: Scenario
  paused = false
  private readonly timeline: TimedAction[]
  private fired = 0

  constructor(scenario: Scenario) {
    this.scenario = scenario
    this.battle = createBattle(scenario.snapshot)
    this.timeline = [...scenario.timeline].sort((a, b) => a.at - b.at)
    this.fireDue() // at:0 초기 배치(첫 틱 전에)
  }

  private fireDue(): void {
    while (this.fired < this.timeline.length && this.battle.time >= this.timeline[this.fired].at * 1000) {
      for (const op of this.timeline[this.fired].ops) op(this.battle)
      this.fired++
    }
  }

  step(dtMs: number): void {
    if (this.paused) return
    step(this.battle, dtMs)
    this.fireDue()
  }

  get done(): boolean {
    if (this.battle.phase === 'ended') return true
    const d = this.scenario.duration
    return d !== undefined && this.battle.time >= d * 1000
  }
}
