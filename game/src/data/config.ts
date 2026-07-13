// 밸런싱 튜닝 상수 (코드가 아니라 데이터). doc 근거를 주석에 남긴다.

export const CONFIG = {
  depth: 10,               // 대형 최소 두께 (doc/03 3.6.2)
  spacing: 12,             // 병사 간격(px/명) — 대형 물리 크기 환산
  flagHp: 500,             // 부대군기 HP (임시)

  // 겹침 규칙 (doc/04 4.2.1 개정): 같은 진영=겹침 허용, 반대 진영=전면 가장자리만
  formationDepthGap: 45,   // 같은 진영 병종 앞뒤 간격(작게=겹침. 방패 앞·창 바로 뒤)
  edgeOverlap: 25,         // 반대 진영 전면 겹침 허용량(그 이상 통과 불가; 기병 돌격은 예외)
  friendlyOverlapPenalty: 0.3, // 아군끼리 겹쳐 이동 시 이동속도 -30% (기병 예외)

  // 전투 (doc/03 3.6.2)
  contactSlop: 20,         // 전면 접촉 판정 여유(px)
  attackUnit: 10,          // 폭 10명 = 공격 1단위
  damageScale: 6,          // 근접 피해 배율(잠정 — 튜닝 대상)

  // 궁병 사격 (doc/03 3.6.2, doc/07): 전열 병목 없이 사거리 내 전원 사격(정지 시만)
  rangeBase: 880,          // 사거리 배율 1.0 기준 px (넓은 시야 — 궁병 장거리)
  rangedScale: 0.05,       // 원거리 피해 배율(잠정)

  // 지형 — 고지→저지 보정 (doc/04 4.8, doc/07 7.3)
  hillAttackBonus: 1.2,    // 하향 공격 +20%
  hillRangeBonus: 1.3,     // 궁병 고지 사거리 +30%
  // (이동 +30% 내리막은 elevation 그래디언트 필요 — 렌더 붙일 때)

  // 사기 (doc/03 3.6.1): 0~100 시작 50, 접전 하락, 0 → 도주
  moraleStart: 50,
  moraleBaseDrop: 2.5,     // 접전(피격) 중 초당 사기 하락
  moralePerCasualty: 0.08, // 사상 1명당 사기 하락

  // 장수 (doc/07 7.1)
  duelBase: 9,             // 일기토 피해 배율(무력 기반)
  generalRange: 45,        // 장수 근접 교전 거리(px)
  generalRegen: 12,        // 휴식 시 초당 HP 회복
  generalMoveSpeed: 100,   // 장수 이동(휴식 복귀)
  generalMeleeForMorale: 10, // 근접 지속 N초 → 사기 1회↑ (기본 규칙)
  generalMoraleBoost: 5,
  generalStandbyHp: 0.5,   // 종료 시 HP비 ≥ → 대기(재출전) / 미만 → 부상·사망
  generalSpace: 34,        // 아군 병사가 장수 주변에 두는 거리(렌더 — 존재감)
  generalHomeOffset: 46,   // 깃발 바로 뒤 대기 위치(적 반대쪽)
  generalRegenRange: 100,  // 깃발 이 거리 안 → HP 회복

  // 전술 어빌리티 + 스태미너 (전술 어빌리티 모델)
  staminaMax: 100,
  staminaRegen: 12,        // 초당 회복
  ability: {
    defend:  { cost: 30, dur: 2 },  // 방패: 2초 방어전념
    advance: { cost: 35, dur: 2 },  // 창: 2초 전진 공격
    charge:  { cost: 55, dur: 8 },  // 기병: 돌진→돌파→귀환 (도착 기반, dur=안전 상한)
    volley:  { cost: 30, dur: 2 },  // 궁: 2초 일제사
  },
  advanceAtkBoost: 1.3,    // 전진 공격 공속 부스트
  volleyMul: 2,            // 일제사 화력 배율

  // 도주/종료·정도 (doc/04 4.8)
  routDuration: 10,        // 도주 페이즈 상한(초)
  routKillRate: 0.03,      // 도주 중 초당 사상 비율(속수무책)
  routFleeSpeed: 150,      // 도주 이동 속도(자기 진영 쪽으로 달아남)
  degreeWin: 0.8,          // 잔존 ≥80% 대승리
  degreeMid: 0.5,          // 잔존 ≥50% 승리 (미만은 안타까운 승리)

  // 장수 반경 (doc/03 3.2.1): 통솔·지력 100 → 장수유닛 30배
  generalUnitSize: 10,
  radiusPer100: 30,
  flagRadiusMult: 2,       // 명령반경 2배 상향(게임플레이)
  flagSpeed: 70,           // 부대군기 이동(보병 1/2)
  flagBackOffset: 90,      // 군기를 대열 뒤(적 반대쪽)에 유지
  bowTooClose: 170,        // 궁병: 적이 이 거리 안이면 후퇴
  bowKeepRange: 0.75,      // 궁병: 사거리*이 값 거리 유지

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
  chargeDistance: 150,     // 이동 거리 이 이상 → 자동 charge (돌격)
  chargeDefMult: 1.2,      // charge 중 방어 보정

  // 저지 = 이동속도 일시 저하(상한 감속). 블록 아님 — 기병은 계속 돌파하되 느려짐.
  stopSlowScale: 0.65,     // 저지력 coef × 이 값 = 이동 저하율(창 A→0.585, 방패 B→0.52)
  stopSlowDecay: 3,        // 접전 이탈 후 저하 감쇠율(/s) — '일시' 저하
} as const
