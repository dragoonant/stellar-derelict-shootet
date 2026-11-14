// The Molt castes as data. Pure: no three.js, no DOM. Every number the HUD shows comes from here through damage.ts.
// A caste is a core (the body: its hit points are the bug's life) plus parts that can be shot off one by one.
// A generated model replaces the placeholder rig by naming its nodes after these part ids (HANDOFF-GPU.md).

export type PartKind = 'core' | 'head' | 'claw' | 'leg' | 'tail' | 'wing' | 'plate' | 'feeler'

export interface PartDef {
  id: string
  kind: PartKind
  /** what the visor calls it */
  label: string
  hp: number
}

export type CasteId = 'reaver' | 'lobber' | 'skirr' | 'bulwark' | 'augur'

export interface CasteDef {
  id: CasteId
  name: string
  blurb: string
  coreHp: number
  /** metres per second with every leg (or wing) attached */
  speed: number
  /** damage of one strike with every claw attached */
  meleeDamage: number
  meleeRange: number
  meleeCooldown: number
  /** ranged attack: needs the part named here */
  ranged?: { part: string; damage: number; range: number; cooldown: number; kind: 'lob' | 'spray' }
  /** a bug that loses its head thrashes blind for this many seconds and then dies; 0 means it lives on without one */
  headlessSeconds: number
  /** core damage dealt by the shock of losing any one part, as a share of that part's hit points */
  severShock: number
  flies: boolean
  /** body radius for spacing and blast checks */
  radius: number
  score: number
  parts: PartDef[]
}

const legs = (ids: string[], hp: number): PartDef[] =>
  ids.map((id) => ({ id: 'leg-' + id, kind: 'leg' as const, label: legLabel(id), hp }))

function legLabel(id: string): string {
  const side = id.endsWith('l') ? 'left' : 'right'
  const row = id.startsWith('f') ? 'fore' : id.startsWith('m') ? 'mid' : 'hind'
  return `${side} ${row} leg`
}

export const CASTES: Record<CasteId, CasteDef> = {
  reaver: {
    id: 'reaver',
    name: 'Reaver',
    blurb: 'The line caste. Two scything forelimbs and a habit of arriving in numbers.',
    coreHp: 120,
    speed: 7.5,
    meleeDamage: 16,
    meleeRange: 2.6,
    meleeCooldown: 1.1,
    headlessSeconds: 4,
    severShock: 0.35,
    flies: false,
    radius: 1.1,
    score: 100,
    parts: [
      { id: 'core', kind: 'core', label: 'thorax', hp: 120 },
      { id: 'head', kind: 'head', label: 'head', hp: 45 },
      { id: 'claw-l', kind: 'claw', label: 'left scythe', hp: 40 },
      { id: 'claw-r', kind: 'claw', label: 'right scythe', hp: 40 },
      ...legs(['fl', 'fr', 'hl', 'hr'], 30),
    ],
  },
  lobber: {
    id: 'lobber',
    name: 'Lobber',
    blurb: 'Hangs back and throws caustic bile from the bulb on its tail.',
    coreHp: 90,
    speed: 5,
    meleeDamage: 8,
    meleeRange: 2.2,
    meleeCooldown: 1.4,
    ranged: { part: 'tail', damage: 22, range: 45, cooldown: 3.2, kind: 'lob' },
    headlessSeconds: 4,
    severShock: 0.35,
    flies: false,
    radius: 1.0,
    score: 150,
    parts: [
      { id: 'core', kind: 'core', label: 'body', hp: 90 },
      { id: 'head', kind: 'head', label: 'head', hp: 35 },
      { id: 'tail', kind: 'tail', label: 'bile tail', hp: 50 },
      ...legs(['fl', 'fr', 'hl', 'hr'], 25),
    ],
  },
  skirr: {
    id: 'skirr',
    name: 'Skirr',
    blurb: 'The flying caste. Dives, rakes and climbs away. A Skirr with one wing is a Skirr on the ground.',
    coreHp: 60,
    speed: 13,
    meleeDamage: 14,
    meleeRange: 2.4,
    meleeCooldown: 1.0,
    headlessSeconds: 3,
    severShock: 0.35,
    flies: true,
    radius: 0.9,
    score: 150,
    parts: [
      { id: 'core', kind: 'core', label: 'body', hp: 60 },
      { id: 'head', kind: 'head', label: 'head', hp: 25 },
      { id: 'wing-l', kind: 'wing', label: 'left wing', hp: 28 },
      { id: 'wing-r', kind: 'wing', label: 'right wing', hp: 28 },
      { id: 'claw-l', kind: 'claw', label: 'left talon', hp: 20 },
      { id: 'claw-r', kind: 'claw', label: 'right talon', hp: 20 },
      { id: 'tail', kind: 'tail', label: 'stinger', hp: 20 },
    ],
  },
  bulwark: {
    id: 'bulwark',
    name: 'Bulwark',
    blurb: 'A walking shell. Four armour plates cover the body: shoot them off, then shoot what is under them.',
    coreHp: 700,
    speed: 3.2,
    meleeDamage: 24,
    meleeRange: 4.2,
    meleeCooldown: 2.0,
    ranged: { part: 'head', damage: 5, range: 11, cooldown: 0.35, kind: 'spray' },
    headlessSeconds: 0,
    severShock: 0.15,
    flies: false,
    radius: 2.6,
    score: 600,
    parts: [
      { id: 'core', kind: 'core', label: 'body', hp: 700 },
      { id: 'head', kind: 'head', label: 'spray head', hp: 160 },
      { id: 'plate-fl', kind: 'plate', label: 'left fore plate', hp: 170 },
      { id: 'plate-fr', kind: 'plate', label: 'right fore plate', hp: 170 },
      { id: 'plate-hl', kind: 'plate', label: 'left hind plate', hp: 170 },
      { id: 'plate-hr', kind: 'plate', label: 'right hind plate', hp: 170 },
      ...legs(['fl', 'fr', 'ml', 'mr', 'hl', 'hr'], 90),
    ],
  },
  augur: {
    id: 'augur',
    name: 'Augur',
    blurb: 'The thinking caste. While its feelers stand, every Molt on the field moves faster. Its cranium is the way in.',
    coreHp: 2200,
    speed: 1.6,
    meleeDamage: 45,
    meleeRange: 5.5,
    meleeCooldown: 2.6,
    headlessSeconds: 0.1,
    severShock: 0.1,
    flies: false,
    radius: 3.4,
    score: 3000,
    parts: [
      { id: 'core', kind: 'core', label: 'sac', hp: 2200 },
      { id: 'head', kind: 'head', label: 'cranium', hp: 420 },
      { id: 'plate-l', kind: 'plate', label: 'left brow plate', hp: 220 },
      { id: 'plate-r', kind: 'plate', label: 'right brow plate', hp: 220 },
      { id: 'feeler-l', kind: 'feeler', label: 'left feeler', hp: 70 },
      { id: 'feeler-r', kind: 'feeler', label: 'right feeler', hp: 70 },
      { id: 'claw-c', kind: 'claw', label: 'proboscis', hp: 120 },
      ...legs(['fl', 'fr', 'ml', 'mr', 'hl', 'hr'], 80),
    ],
  },
}

export const CASTE_IDS = Object.keys(CASTES) as CasteId[]

/** Speed multiplier every other Molt gets while an Augur with a feeler is alive. */
export const AUGUR_LINK_SPEED = 1.25
