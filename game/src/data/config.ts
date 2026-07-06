// 밸런싱 튜닝 상수 (코드가 아니라 데이터). doc 근거를 주석에 남긴다.

export const CONFIG = {
  depth: 10,               // 대형 최소 두께 (doc/03 3.6.2)
  spacing: 12,             // 병사 간격(px/명) — 대형 물리 크기 환산
  flagHp: 500,             // 부대군기 HP (임시)

  // 전투 (doc/03 3.6.2)
  contactSlop: 20,         // 전면 접촉 판정 여유(px)
  attackUnit: 10,          // 폭 10명 = 공격 1단위
  damageScale: 6,          // 피해 배율(잠정 — 튜닝 대상)

  // 장수 반경 (doc/03 3.2.1): 통솔·지력 100 → 장수유닛 30배
  generalUnitSize: 10,
  radiusPer100: 30,

  // 이동/회전 (doc/04 4.5.3): 등급 배율(0.5~1.0)에 곱하는 기준값
  moveBase: 140,           // px/s @ 배율 1.0
  turnBase: 3.2,           // rad/s @ 배율 1.0
  moveAlignTol: 0.30,      // 이 각도 이내로 정렬돼야 전진(밖이면 제자리 회전)
  arriveDist: 2,

  // 모임 → 펼침
  spreadMoving: 0.35,      // 이동 중 대형 폭
  spreadDeployed: 1,       // 정지(대열) 폭
  spreadRate: 3,           // 초당 spread 접근율

  // 기병 (doc/04 4.5.3)
  cavAccelTime: 2,         // 최대속도 도달 시간(초)
  cavArriveDist: 6,
  cavTurnRadiusMult: 20,   // 선회 반경 = 장수유닛 * 20
} as const
