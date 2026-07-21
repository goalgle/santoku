import { V0_SNAPSHOT } from './snapshot'
import { scene, place, forceTo, setMight, placeGeneral, placeFlag, setTerrain, say, sortie } from './scenario'
import { compose } from './compose'
import { TERRAINS } from './data/terrain'
import type { Scenario } from './scenario'
import type { Terrain } from './sim/types'

// 좌우 대립. A=왼쪽(전면 오른쪽 RIGHT=0), B=오른쪽(전면 왼쪽 LEFT=π).
const RIGHT = 0
const LEFT = Math.PI
const HILL: Terrain = { name: '고지', hills: [{ x: -60, y: 0, radius: 70 }], chokeWidth: Infinity }

export const SCENARIOS: Record<string, Scenario> = {
  // 자유(개입 테스트): 대열 배치만, 스크립트 없음. 정지→A 병종 명령.
  free: scene('자유 (개입 테스트)', V0_SNAPSHOT).duration(600).build(),

  // 컷신: 양측이 진격해 격돌
  advance: scene('컷신 · 진격 → 격돌', V0_SNAPSHOT)
    .at(0, place('A', 0, -300, 0, RIGHT), place('B', 0, 300, 0, LEFT), say('양측 방패 대치'))
    .at(1.5, forceTo('A', 0, -40, 0), forceTo('B', 0, 40, 0), say('진격 개시'))
    .duration(14)
    .build(),

  // 기병 charge vs 창(저지 카운터)
  charge: scene('기병 charge vs 창', V0_SNAPSHOT)
    .at(0, place('A', 3, -600, 0, RIGHT), place('B', 1, 0, 0, LEFT), forceTo('A', 3, 40, 0))
    .duration(6)
    .build(),

  // 장수 일기토 결투장: 병사들이 모여 관객, 장수 전진→응전→일기토, 원이 자라며 병사를 밀어냄
  duel: scene('장수 일기토 (결투장)', V0_SNAPSHOT)
    .at(0, setMight('A', 80), setMight('B', 72),
      placeFlag('A', -180, 0), placeFlag('B', 180, 0),
      placeGeneral('A', -250, 0), placeGeneral('B', 250, 0),
      forceTo('A', 0, -95, 0), forceTo('B', 0, 95, 0),   // 방패 관객(앞줄)
      forceTo('A', 1, -140, 0), forceTo('B', 1, 140, 0)) // 창 관객(뒷줄)
    .at(1.2, sortie('A'), say('A 장수 전진'))
    .at(3, sortie('B'), say('B 장수 응전 — 일기토!'))
    .duration(40)
    .build(),

  // 지형: 고지 격돌(A 언덕 위)
  hill: scene('고지 격돌', V0_SNAPSHOT)
    .at(0, setTerrain(HILL), place('A', 0, -60, 0, RIGHT), place('B', 0, 60, 0, LEFT))
    .duration(6)
    .build(),

  // 지형: 애로 병목
  defile: scene('애로 병목', V0_SNAPSHOT)
    .at(0, setTerrain(TERRAINS.defile), place('A', 0, -60, 0, RIGHT), place('B', 0, 60, 0, LEFT))
    .duration(6)
    .build(),

  // 조립 DSL 예시(?s=lab): 여기 add* 만 바꿔가며 전술을 빠르게 테스트.
  // 사기 관찰 테스트 — 완전 대칭(A=B, 창 1500). A 장수만 🗡출전시켜 A 사기가 B보다 오르는지 비교.
  lab: compose()
    .name('사기 관찰 — 대칭 창 1500 vs 1500')
    .terrain('plain')
    .addSpear('left', 1500)
    .addSpear('right', 1500)
    .build(),
}
