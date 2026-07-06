import type { Vec } from './types'

export const TAU = Math.PI * 2

/** 각도를 [-π, π] 로 정규화 */
export function normAngle(a: number): number {
  a %= TAU
  if (a > Math.PI) a -= TAU
  if (a < -Math.PI) a += TAU
  return a
}

/** from → to 최단 각차 [-π, π] */
export function angleDiff(from: number, to: number): number {
  return normAngle(to - from)
}

/** cur를 target 쪽으로 최대 maxStep 만큼 회전 */
export function approachAngle(cur: number, target: number, maxStep: number): number {
  const d = angleDiff(cur, target)
  return cur + Math.max(-maxStep, Math.min(maxStep, d))
}

export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)
