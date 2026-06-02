import { describe, it, expect } from 'vitest'
import { serialiseQGCWPL110, waypointFilename } from '@/lib/waypointExport'
import type { Waypoint } from '@/lib/missionGeometry'

const WPS: Waypoint[] = [
  { lat: 18.52, lon: 73.855, alt: 20 },
  { lat: 18.521, lon: 73.856, alt: 20 },
  { lat: 18.522, lon: 73.857, alt: 20 },
]

describe('serialiseQGCWPL110', () => {
  it('starts with the QGC WPL 110 header', () => {
    const text = serialiseQGCWPL110(WPS, 5)
    expect(text.split('\n')[0]).toBe('QGC WPL 110')
  })

  it('has a home row, a takeoff row, a camera-trigger row, waypoints, then RTL', () => {
    const text = serialiseQGCWPL110(WPS, 5)
    const lines = text.trim().split('\n')
    // header + home + takeoff + cam-trigger + 2 survey waypoints + RTL = 7 lines
    expect(lines.length).toBe(7)
    // home uses command 16
    expect(lines[1].split('\t')[3]).toBe('16')
    // takeoff = command 22
    expect(lines[2].split('\t')[3]).toBe('22')
    // camera trigger = command 206 with trigger dist in param1
    expect(lines[3].split('\t')[3]).toBe('206')
    expect(lines[3].split('\t')[4]).toBe('5')
    // last row is RTL = command 20
    expect(lines[lines.length - 1].split('\t')[3]).toBe('20')
  })

  it('indexes rows sequentially from 0', () => {
    const text = serialiseQGCWPL110(WPS, 5)
    const lines = text.trim().split('\n').slice(1) // skip header
    lines.forEach((line, i) => {
      expect(line.split('\t')[0]).toBe(String(i))
    })
  })

  it('returns just the header for empty waypoints', () => {
    const text = serialiseQGCWPL110([], 5)
    expect(text.trim()).toBe('QGC WPL 110')
  })
})

describe('waypointFilename', () => {
  it('slugifies the mission name and appends .waypoints', () => {
    expect(waypointFilename('PUNE_FARM_01 Grid #3')).toBe('PUNE_FARM_01_Grid_3.waypoints')
  })

  it('falls back to mission.waypoints for empty names', () => {
    expect(waypointFilename('')).toBe('mission.waypoints')
  })
})
