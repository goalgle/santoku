import type { Terrain } from '../sim/types'

// v0 지형 템플릿 3종 (doc/04 4.8, doc/07 7.3). 각기 다른 축을 시험:
//  T1 평야 = 정면 폭 / T2 구릉지 = 고지 보정 / T3 애로 = 병목(접전 폭 제한).

export type TerrainKey = 'plain' | 'hills' | 'defile'

export const TERRAINS: Record<TerrainKey, Terrain> = {
  plain: { name: 'T1 평야 회전', hills: [], chokeWidth: Infinity },
  hills: { name: 'T2 구릉지', hills: [{ x: 0, y: 0, radius: 180 }], chokeWidth: Infinity },
  defile: { name: 'T3 애로', hills: [], chokeWidth: 30 }, // 30명 폭 병목
}
