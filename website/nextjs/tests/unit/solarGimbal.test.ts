import { describe, it, expect } from 'vitest'
import { generateSolar, generateGrid, resolvedHeadingDeg, type MissionParams } from '@/lib/missionGeometry'
import { DEFAULT_CAMERA } from '@/lib/cameras'

const cam = DEFAULT_CAMERA
const base: MissionParams = {
  altitudeM: 30, frontOverlap: 0.8, sideOverlap: 0.7, speedMs: 8, headingDeg: 'auto', gimbalPitchDeg: -45,
}

describe('generateSolar', () => {
  it('emits 2 waypoints per row with the configured gimbal, ordered across the array', () => {
    const direction = [{ lat: 18.5, lon: 73.8 }, { lat: 18.5, lon: 73.802 }] // east-west line
    const rows = [{ lat: 18.5005, lon: 73.801 }, { lat: 18.5001, lon: 73.801 }, { lat: 18.5003, lon: 73.801 }]
    const wps = generateSolar(direction, rows, base)
    expect(wps.length).toBe(rows.length * 2)
    for (const w of wps) expect(w.gimbalPitch).toBe(-45)
    // perpendicular axis is north → southernmost row first
    expect(wps[0].lat).toBeCloseTo(18.5001, 4)
  })

  it('returns empty without a direction or without rows', () => {
    expect(generateSolar([{ lat: 1, lon: 1 }], [{ lat: 1, lon: 1 }], base)).toHaveLength(0)
    expect(generateSolar([{ lat: 1, lon: 1 }, { lat: 1, lon: 2 }], [], base)).toHaveLength(0)
  })
})

describe('grid gimbal', () => {
  it('stamps gimbalPitchDeg on grid waypoints', () => {
    const poly = [{ lat: 18.52, lon: 73.85 }, { lat: 18.52, lon: 73.86 }, { lat: 18.525, lon: 73.86 }, { lat: 18.525, lon: 73.85 }]
    expect(generateGrid(poly, cam, base)[0].gimbalPitch).toBe(-45)
  })
})

describe('resolvedHeadingDeg', () => {
  it('returns the numeric angle, or a number for auto', () => {
    const poly = [{ lat: 18.52, lon: 73.85 }, { lat: 18.52, lon: 73.86 }, { lat: 18.525, lon: 73.86 }]
    expect(resolvedHeadingDeg(poly, { ...base, headingDeg: 90 })).toBe(90)
    expect(typeof resolvedHeadingDeg(poly, { ...base, headingDeg: 'auto' })).toBe('number')
  })
})
