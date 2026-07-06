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
}

export type GeneralState = 'out' | 'rest' | 'standby' | 'lost' // 출진/휴식/대기/부상·사망
export interface General {
  command: number  // 통솔
  might: number    // 무력
  intel: number    // 지력
  hp: number
  maxHp: number
  state: GeneralState
  pos: Vec
  meleeTime: number   // 근접 지속 누적(초) → 사기↑ 조건
  boostGiven: boolean // 이번 전투 사기 buff 지급 여부
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
export interface Terrain { kind: string } // 1A 임시(평지). 이후 07 7.3 항목화.

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
