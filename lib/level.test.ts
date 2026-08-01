import { describe, it, expect } from 'vitest'
import {
  xpThresholdForLevel,
  levelForXp,
  xpToNextLevel,
  levelInfo,
  rankName,
  MAX_LEVEL,
  XP_CAP,
} from './level'

describe('xpThresholdForLevel', () => {
  it('anchors the quadratic curve at both ends', () => {
    expect(xpThresholdForLevel(1)).toBe(0)
    expect(xpThresholdForLevel(MAX_LEVEL)).toBe(XP_CAP) // 200000
  })

  it('matches the rounded quadratic table at rank boundaries', () => {
    expect(xpThresholdForLevel(2)).toBe(103)
    expect(xpThresholdForLevel(6)).toBe(2583)
    expect(xpThresholdForLevel(11)).toBe(10331)
    expect(xpThresholdForLevel(16)).toBe(23244)
    expect(xpThresholdForLevel(21)).toBe(41322)
    expect(xpThresholdForLevel(26)).toBe(64566)
    expect(xpThresholdForLevel(31)).toBe(92975)
    expect(xpThresholdForLevel(36)).toBe(126550)
    expect(xpThresholdForLevel(41)).toBe(165289)
  })

  it('rises monotonically across the whole ladder', () => {
    for (let L = 2; L <= MAX_LEVEL; L++) {
      expect(xpThresholdForLevel(L)).toBeGreaterThan(xpThresholdForLevel(L - 1))
    }
  })

  it('clamps levels beyond the top to the cap', () => {
    expect(xpThresholdForLevel(MAX_LEVEL + 1)).toBe(XP_CAP)
    expect(xpThresholdForLevel(100)).toBe(XP_CAP)
  })

  it('rejects invalid levels', () => {
    expect(() => xpThresholdForLevel(0)).toThrow(RangeError)
    expect(() => xpThresholdForLevel(-1)).toThrow(RangeError)
    expect(() => xpThresholdForLevel(1.5)).toThrow(RangeError)
  })
})

describe('levelForXp — exact level crossings (boundaries)', () => {
  it('is level 1 below the L2 threshold', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(102)).toBe(1)
  })

  it('crosses to level 2 at exactly 103 XP', () => {
    expect(levelForXp(103)).toBe(2)
    expect(levelForXp(104)).toBe(2)
  })

  it('crosses to level 6 at exactly 2583 XP', () => {
    expect(levelForXp(2582)).toBe(5)
    expect(levelForXp(2583)).toBe(6)
  })

  it('caps at MAX_LEVEL at and beyond the XP cap', () => {
    expect(levelForXp(XP_CAP)).toBe(MAX_LEVEL)
    expect(levelForXp(XP_CAP + 50000)).toBe(MAX_LEVEL)
  })

  it('clamps negative XP to level 1', () => {
    expect(levelForXp(-100)).toBe(1)
  })
})

describe('xpToNextLevel', () => {
  it('reports the remaining XP to the next threshold', () => {
    expect(xpToNextLevel(0)).toBe(103) // 103 - 0
    expect(xpToNextLevel(50)).toBe(53) // 103 - 50
    expect(xpToNextLevel(103)).toBe(310) // 413 - 103
  })

  it('is 0 once the top level is reached', () => {
    expect(xpToNextLevel(XP_CAP)).toBe(0)
    expect(xpToNextLevel(XP_CAP + 1000)).toBe(0)
  })
})

describe('levelInfo', () => {
  it('gives full progress detail for a mid-level XP', () => {
    // 300 XP -> level 2 (103..413)
    expect(levelInfo(300)).toEqual({
      level: 2,
      rank: 'ฮีโร่ฝึกหัด',
      currentThreshold: 103,
      nextThreshold: 413,
      xpIntoLevel: 197,
      xpToNext: 113,
      progress: 197 / 310,
    })
  })

  it('is exactly at 0 progress on a level boundary', () => {
    const info = levelInfo(103)
    expect(info.level).toBe(2)
    expect(info.xpIntoLevel).toBe(0)
    expect(info.progress).toBe(0)
  })

  it('reports full progress and no remaining XP at the top level', () => {
    const info = levelInfo(XP_CAP)
    expect(info.level).toBe(MAX_LEVEL)
    expect(info.rank).toBe('ตำนานของบ้าน')
    expect(info.progress).toBe(1)
    expect(info.xpToNext).toBe(0)
    expect(info.nextThreshold).toBe(info.currentThreshold)
  })
})

describe('rankName', () => {
  it('gives one title per band of 5 levels', () => {
    expect(rankName(1)).toBe('ฮีโร่ฝึกหัด') // L1–5
    expect(rankName(5)).toBe('ฮีโร่ฝึกหัด')
    expect(rankName(6)).toBe('นักผจญภัยน้อย') // L6–10
    expect(rankName(11)).toBe('นักเก็บกวาด') // L11–15
    expect(rankName(16)).toBe('ผู้ช่วยคนเก่ง') // L16–20
    expect(rankName(21)).toBe('นักสู้ดาวรุ่ง') // L21–25
    expect(rankName(26)).toBe('แชมป์นิสัยดี') // L26–30
    expect(rankName(31)).toBe('ดาวเด่นประจำบ้าน') // L31–35
    expect(rankName(36)).toBe('วินัยขั้นสูงสุด') // L36–40
    expect(rankName(41)).toBe('ตำนานของบ้าน') // L41–45
  })

  it('clamps to the final band for levels beyond the ladder', () => {
    expect(rankName(45)).toBe('ตำนานของบ้าน')
    expect(rankName(50)).toBe('ตำนานของบ้าน')
  })

  it('never throws on out-of-range input', () => {
    expect(rankName(0)).toBe('ฮีโร่ฝึกหัด')
    expect(rankName(-3)).toBe('ฮีโร่ฝึกหัด')
  })
})
