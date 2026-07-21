import type { Rng } from './rng'
import type { TroopKind } from '../data/units'

// 전술 전투 데이터 모델 (doc/05 5.6.3). 헤드리스 sim의 상태.

export type Side = 'A' | 'B'
export interface Vec { x: number; y: number }
export type Stance = 'idle' | 'move' | 'defend'

/** 병종 덩어리. 병력수 = aliveHP + woundedHP. 대형 width = 병력 ÷ depth. */
export interface Cohort {
  kind: TroopKind
  aliveHP: number    // 전사 가능 병력(줄면 영구 손실)
  woundedHP: number  // 부상(복구 가능, 전술 중 회복 없음 — doc/03 3.6.2)
  anchor: Vec
  facing: number     // radians (전면이 향하는 방향)
  depth: number      // 대형 깊이(기본 10)
  stance: Stance
  target: Vec | null
  spread: number     // 대형 폭 계수: 1=펼침, 이동 중 0.35로 모임
  curSpeed: number   // 현재 속도(기병 가속용). px/s
  slow: number       // 저지에 의한 이동 저하율 0~1(이동속도 상한 = 최대×(1-slow)). 접전 중 갱신·이탈 시 감쇠
  inMelee: boolean   // 이번 틱 근접 교전 중인가 (렌더 공격 애니용)
  firing: boolean    // 이번 틱 궁병 사격 중인가 (렌더 사격 애니·화살용)
  fireTarget: Vec | null // 사격 대상 위치 (화살 연출용)
  chargeRun: boolean // 기병 돌격 중(이동거리 임계 초과로 발동, 저지로 파훼)
  stamina: number    // 어빌리티 자원 0~100
  ability: Ability | null // 발동 중인 어빌리티
}

export type AbilityType = 'defend' | 'advance' | 'charge' | 'volley'
export interface Ability { type: AbilityType; timer: number; phase: 'out' | 'back'; origin: Vec; path: Vec[] }

export type GeneralState = 'out' | 'rest' | 'standby' | 'lost' // 출진/휴식/대기/부상·사망
export interface General {
  command: number  // 통솔
  might: number    // 무력
  intel: number    // 지력
  hp: number
  maxHp: number
  state: GeneralState
  pos: Vec
  meleeTime: number   // 근접 지속 누적(초) → 렌더 결투장 원 성장용
  inCombat: boolean   // 이번 틱 병사/장수와 근접 교전 중 (렌더 공격 애니용)
}

/** 부대군기(= 깃발병). 이동 보병 1/2, 명령 반경, 파괴 가능. */
export interface Flag {
  pos: Vec
  commandRadius: number
  hp: number
  maxHp: number
  broken: boolean
}

export interface Unit {
  side: Side
  morale: number   // 0~100, 시작 50
  general: General
  flag: Flag
  cohorts: Cohort[]
}

export type BattlePhase = 'deploy' | 'engage' | 'rout' | 'ended'
export type Degree = '대승리' | '승리' | '안타까운 승리'
export interface BattleResult { winner: Side; degree: Degree; ratio: number; winnerMen: number }

export interface Hill { x: number; y: number; radius: number } // 고지대
export interface Terrain {
  name: string
  hills: Hill[]         // 고지 → 저지 공격/궁 사거리 보정
  chokeWidth: number    // 접전 폭 상한(명). Infinity면 병목 없음 (다리·애로)
}

export interface Battle {
  terrain: Terrain
  units: Record<Side, Unit>
  time: number   // sim 경과(ms)
  tick: number
  phase: BattlePhase
  rng: Rng
  initialMen: Record<Side, number> // 정도 산출 기준(초반 병력)
  loser: Side | null
  routTime: number
  result: BattleResult | null
}
