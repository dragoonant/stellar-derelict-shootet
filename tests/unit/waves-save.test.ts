import { describe, expect, it } from 'vitest'
import { describeSave, parseSave, readSave, writeSave, clearSave, SAVE_KEY, SAVE_VERSION, type SaveData, type Store } from '../../src/sim/save'
import { DIFFICULTIES, WAVES, waveQueue } from '../../src/sim/waves'

describe('waves', () => {
  it('the same seed gives the same order, and a wave holds what its table says', () => {
    expect(waveQueue(2, 'regular', 7)).toEqual(waveQueue(2, 'regular', 7))
    const q = waveQueue(3, 'regular', 3)
    expect(q.filter((c) => c === 'bulwark')).toHaveLength(1)
    expect(q.filter((c) => c === 'reaver')).toHaveLength(12)
    expect(q[0]).toBe('reaver')
  })
  it('difficulty scales the head count but there is always exactly one Augur, first, in the last wave', () => {
    for (const d of Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[]) {
      const q = waveQueue(WAVES.length - 1, d, 5)
      expect(q.filter((c) => c === 'augur')).toHaveLength(1)
      expect(q[0]).toBe('augur')
    }
    expect(waveQueue(0, 'recruit').length).toBeLessThan(waveQueue(0, 'veteran').length)
    expect(waveQueue(99, 'regular')).toEqual([])
  })
})

const sample = (): SaveData => ({
  v: SAVE_VERSION, savedAt: 1_000_000, difficulty: 'regular', wave: 2, score: 1250, kills: 9, severed: 14,
  player: { hp: 63, grenades: 2, ammo: { repeater: { mag: 12, reserve: 200 }, scatter: { mag: 6, reserve: 30 } } },
  squad: { venn: 150, brandt: 0, okafor: 80, riedel: 150, sato: 20 },
})
const mem = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

describe('the save', () => {
  it('round-trips through storage under the game\'s own key', () => {
    const s = mem()
    expect(writeSave(s, sample())).toBeNull()
    expect([...s.data.keys()]).toEqual([SAVE_KEY])
    expect(readSave(s)).toEqual({ ok: true, data: sample() })
    clearSave(s)
    expect(readSave(s)).toEqual({ ok: null })
  })
  it('says why a save cannot be opened', () => {
    expect(parseSave('{nope')).toMatchObject({ ok: false, reason: expect.stringContaining('unreadable') })
    expect(parseSave(JSON.stringify({ ...sample(), v: 99 }))).toMatchObject({ ok: false, reason: expect.stringContaining('another version') })
    expect(parseSave(JSON.stringify({ ...sample(), wave: 40 }))).toMatchObject({ ok: false, reason: expect.stringContaining('wave') })
    expect(parseSave(JSON.stringify({ ...sample(), difficulty: 'nightmare' }))).toMatchObject({ ok: false })
    expect(parseSave(JSON.stringify({ ...sample(), player: { hp: 0 } }))).toMatchObject({ ok: false })
  })
  it('reports a browser that refuses to store instead of failing silently', () => {
    const s: Store = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') }, removeItem: () => { throw new Error('denied') } }
    expect(writeSave(s, sample())).toContain('refused')
    expect(readSave(s)).toMatchObject({ ok: false })
    expect(() => clearSave(s)).not.toThrow()
  })
  it('the Continue line names what it reopens', () => {
    const line = describeSave(sample(), 1_000_000 + 5 * 60000)
    expect(line).toContain('Wave 3 of 6')
    expect(line).toContain('Regular')
    expect(line).toContain('4 of 5 squadmates standing')
    expect(line).toContain('health 63')
    expect(line).toContain('5 min ago')
  })
})
