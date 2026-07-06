import { V0_SNAPSHOT } from './snapshot'
import { scene, place, forceTo, setMight, placeGeneral, placeFlag, setTerrain, say } from './scenario'
import { TERRAINS } from './data/terrain'
import type { Scenario } from './scenario'
import type { Terrain } from './sim/types'

const PI = Math.PI
const HILL: Terrain = { name: '고지', hills: [{ x: -60, y: 0, radius: 70 }], chokeWidth: Infinity }

// 테스트 + 컷신 스크립트 라이브러리. 렌더는 이 중 하나를 골라 Director로 재생한다.
export const SCENARIOS: Record<string, Scenario> = {
  // 컷신: 양측이 진격해 격돌 (타임라인 발동 예시)
  advance: scene('컷신 · 진격 → 격돌', V0_SNAPSHOT)
    .at(0, place('A', 0, -300, 0, 0), place('B', 0, 300, 0, PI), say('양측 방패 대치'))
    .at(1.5, forceTo('A', 0, -40, 0), forceTo('B', 0, 40, 0), say('진격 개시'))
    .duration(14)
    .build(),

  // 기병 charge vs 창(저지 카운터)
  charge: scene('기병 charge vs 창', V0_SNAPSHOT)
    .at(0, place('A', 3, -600, 0, 0), place('B', 1, 0, 0, PI), forceTo('A', 3, 40, 0))
    .duration(6)
    .build(),

  // 장수 일기토 (결투장): 병사들이 모여 관객처럼 서고, 장수 전진→응전→일기토, 원이 자라며 병사를 밀어냄
  duel: scene('장수 일기토 (결투장)', V0_SNAPSHOT)
    .at(0, setMight('A', 80), setMight('B', 72),
      placeFlag('A', -180, 0), placeFlag('B', 180, 0),
      placeGeneral('A', -250, 0), placeGeneral('B', 250, 0),
      forceTo('A', 0, -95, 0), forceTo('B', 0, 95, 0),   // 방패 관객(앞줄)
      forceTo('A', 1, -140, 0), forceTo('B', 1, 140, 0)) // 창 관객(뒷줄)
    .at(1.2, placeGeneral('A', -22, 0), say('A 장수 전진'))
    .at(3, placeGeneral('B', 22, 0), say('B 장수 응전 — 일기토!'))
    .duration(40)
    .build(),

  // 지형: 고지 격돌(A 언덕 위)
  hill: scene('고지 격돌', V0_SNAPSHOT)
    .at(0, setTerrain(HILL), place('A', 0, -60, 0, 0), place('B', 0, 60, 0, PI))
    .duration(6)
    .build(),

  // 지형: 애로 병목
  defile: scene('애로 병목', V0_SNAPSHOT)
    .at(0, setTerrain(TERRAINS.defile), place('A', 0, -60, 0, 0), place('B', 0, 60, 0, PI))
    .duration(6)
    .build(),
}
