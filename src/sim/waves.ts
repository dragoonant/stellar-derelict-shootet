// Wave composition and the difficulty table. Pure.
import type { CasteId } from './castes'

export type Difficulty = 'recruit' | 'regular' | 'veteran'

export interface DifficultyDef {
  id: Difficulty
  label: string
  /** multiplier on every wave's head count (the Augur is always one) */
  count: number
  /** multiplier on damage the Molt deal */
  damage: number
  /** most Molt alive at once */
  cap: number
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  recruit: { id: 'recruit', label: 'Recruit', count: 0.7, damage: 0.6, cap: 10 },
  regular: { id: 'regular', label: 'Regular', count: 1, damage: 1, cap: 14 },
  veteran: { id: 'veteran', label: 'Veteran', count: 1.35, damage: 1.4, cap: 18 },
}

export interface WaveDef {
  title: string
  brief: string
  spawns: Partial<Record<CasteId, number>>
  /** seconds between spawns */
  interval: number
}

export const WAVES: WaveDef[] = [
  { title: 'First contact', brief: 'Reavers from the burrows. Take their scythes off before they reach the wall.', spawns: { reaver: 8 }, interval: 2.2 },
  { title: 'Bile', brief: 'Lobbers behind the line. A Lobber without its tail has nothing to throw.', spawns: { reaver: 10, lobber: 3 }, interval: 1.9 },
  { title: 'Wings', brief: 'Skirr overhead. One wing off and it comes down.', spawns: { reaver: 10, skirr: 4, lobber: 2 }, interval: 1.7 },
  { title: 'The shell', brief: 'A Bulwark. Strip the plates, then the body. Stay out of its spray.', spawns: { reaver: 12, lobber: 4, bulwark: 1 }, interval: 1.6 },
  { title: 'The press', brief: 'Everything they have, twice.', spawns: { reaver: 14, skirr: 6, lobber: 4, bulwark: 2 }, interval: 1.3 },
  { title: 'The Augur', brief: 'The thinking caste is on the field. Cut its feelers to slow the swarm; break the brow plates and burst the cranium.', spawns: { augur: 1, reaver: 16, lobber: 4, skirr: 4, bulwark: 1 }, interval: 1.4 },
]

/** The spawn order of one wave: deterministic for a seed, big castes spread through the middle, the Augur first. */
export function waveQueue(index: number, difficulty: Difficulty, seed = 1): CasteId[] {
  const def = WAVES[index]
  if (!def) return []
  const k = DIFFICULTIES[difficulty].count
  const pool: CasteId[] = []
  let augur = 0
  for (const [caste, n] of Object.entries(def.spawns) as [CasteId, number][]) {
    if (caste === 'augur') {
      augur = n
      continue
    }
    const scaled = Math.max(1, Math.round(n * k))
    for (let i = 0; i < scaled; i++) pool.push(caste)
  }
  let s = (seed * 2654435761 + index * 97) >>> 0
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = pool[i] as CasteId
    pool[i] = pool[j] as CasteId
    pool[j] = t
  }
  // open with a Reaver if there is one, so the first thing through the dust is the line caste
  const first = pool.indexOf('reaver')
  if (first > 0) {
    pool.splice(first, 1)
    pool.unshift('reaver')
  }
  return [...Array<CasteId>(augur).fill('augur'), ...pool]
}

export const waveSize = (index: number, difficulty: Difficulty): number => waveQueue(index, difficulty).length
