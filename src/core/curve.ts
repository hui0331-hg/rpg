import { BALANCE, MAX_LEVEL } from '../data/balance'
import type { Track } from '../types'

export type CurveKind = 'core' | 'skill' | 'char'

const CURVE = {
  core: BALANCE.core,
  skill: BALANCE.skill,
  char: BALANCE.char,
} as const

/** 升到下一级需要多少经验（等级内的需求量） */
export function needXp(level: number, kind: CurveKind): number {
  const { base, exp } = CURVE[kind]
  return Math.round(base * Math.pow(Math.max(1, level), exp))
}

export function newTrack(): Track {
  return { level: 1, xp: 0, totalXp: 0 }
}

/** 保留 1 位小数，避免浮点误差累积 */
export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** 数字展示：整数不带小数点，非整数保留 1 位 */
export function fmt(n: number): string {
  const r = round1(n)
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/**
 * 给轨道加经验，返回新轨道与被触发的升级。
 * 纯函数：不修改入参。
 */
export function addXp(
  track: Track,
  points: number,
  kind: CurveKind,
): { track: Track; levelUps: number[] } {
  if (points <= 0 || track.level >= MAX_LEVEL) {
    return {
      track: { ...track, totalXp: round1(track.totalXp + Math.max(0, points)) },
      levelUps: [],
    }
  }

  let level = track.level
  let xp = round1(track.xp + points)
  const totalXp = round1(track.totalXp + points)
  const levelUps: number[] = []

  while (level < MAX_LEVEL && xp >= needXp(level, kind)) {
    xp = round1(xp - needXp(level, kind))
    level += 1
    levelUps.push(level)
  }

  return { track: { level, xp, totalXp }, levelUps }
}

/** 等级内进度 0~1 */
export function progressOf(track: Track, kind: CurveKind): number {
  if (track.level >= MAX_LEVEL) return 1
  const need = needXp(track.level, kind)
  return Math.max(0, Math.min(1, track.xp / need))
}
