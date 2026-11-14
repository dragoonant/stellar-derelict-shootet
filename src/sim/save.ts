// The save (KB rule 22). A shooter has no action list to replay, so the save is a checkpoint written when a wave starts
// and when a wave is cleared: Continue reopens at the start of that wave with the squad, health, ammunition and score
// as they stood. One slot, a versioned envelope, never silent about a save it cannot read or a browser that will not store.
import { DIFFICULTIES, WAVES, type Difficulty } from './waves'

export const SAVE_KEY = 'sds-bugfront-save' // every Pages game shares one origin, so the key is per game
export const SAVE_VERSION = 1

export interface SaveData {
  v: number
  savedAt: number
  difficulty: Difficulty
  /** index of the wave Continue starts */
  wave: number
  score: number
  kills: number
  severed: number
  player: { hp: number; grenades: number; ammo: Record<string, { mag: number; reserve: number }> }
  /** squad member id to hit points; 0 is dead */
  squad: Record<string, number>
}

export type LoadResult = { ok: true; data: SaveData } | { ok: false; reason: string } | { ok: null }

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

export function parseSave(raw: string | null): LoadResult {
  if (raw === null || raw === '') return { ok: null }
  let j: unknown
  try {
    j = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'the save is unreadable (not valid data)' }
  }
  if (typeof j !== 'object' || j === null) return { ok: false, reason: 'the save is unreadable (not a save)' }
  const d = j as Partial<SaveData>
  if (d.v !== SAVE_VERSION) return { ok: false, reason: `the save is from another version of the game (v${String(d.v)})` }
  if (!d.difficulty || !(d.difficulty in DIFFICULTIES)) return { ok: false, reason: 'the save names a difficulty this game does not have' }
  if (!isNum(d.wave) || d.wave < 0 || d.wave >= WAVES.length) return { ok: false, reason: 'the save names a wave this game does not have' }
  if (!isNum(d.score) || !isNum(d.kills) || !isNum(d.severed) || !isNum(d.savedAt)) return { ok: false, reason: 'the save is missing its tallies' }
  const p = d.player
  if (!p || !isNum(p.hp) || p.hp <= 0 || !isNum(p.grenades) || typeof p.ammo !== 'object' || p.ammo === null) {
    return { ok: false, reason: 'the save is missing the player' }
  }
  if (typeof d.squad !== 'object' || d.squad === null || !Object.values(d.squad).every(isNum)) return { ok: false, reason: 'the save is missing the squad' }
  return { ok: true, data: d as SaveData }
}

/** The line the title screen shows beside Continue. */
export function describeSave(d: SaveData, now = Date.now()): string {
  const standing = Object.values(d.squad).filter((h) => h > 0).length
  const mins = Math.max(0, Math.round((now - d.savedAt) / 60000))
  const when = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 2880 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`
  const w = WAVES[d.wave]
  return `Wave ${d.wave + 1} of ${WAVES.length} (${w ? w.title : '?'}), ${DIFFICULTIES[d.difficulty].label}. ${standing} of ${Object.keys(d.squad).length} squadmates standing, health ${Math.ceil(d.player.hp)}, score ${d.score}. Saved ${when}.`
}

export interface Store {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export function readSave(store: Store): LoadResult {
  try {
    return parseSave(store.getItem(SAVE_KEY))
  } catch {
    return { ok: false, reason: 'this browser refused to open its storage' }
  }
}

/** Returns an error line for the HUD when the browser refuses to store, otherwise null. */
export function writeSave(store: Store, d: SaveData): string | null {
  try {
    store.setItem(SAVE_KEY, JSON.stringify(d))
    return null
  } catch {
    return 'This browser refused to store the save: progress will not survive closing the tab.'
  }
}

export function clearSave(store: Store): void {
  try {
    store.removeItem(SAVE_KEY)
  } catch {
    /* nothing to clear */
  }
}
