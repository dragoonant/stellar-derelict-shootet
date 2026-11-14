// Part damage and what a bug can still do with the parts it has left. Pure, so the unit tests drive it directly.
import { CASTES, type CasteDef, type CasteId, type PartDef, type PartKind } from './castes'

export interface BugState {
  caste: CasteId
  /** hit points left per part id; a severed part is 0 */
  hp: Record<string, number>
  severed: string[]
  alive: boolean
  /** seconds of blind thrashing left once the head is gone; null while it has a head (or does not need one) */
  headlessLeft: number | null
}

export interface DamageResult {
  /** damage that landed on the part aimed at */
  dealt: number
  /** part ids that came off with this hit */
  severed: string[]
  killed: boolean
  /** the hit struck a part already gone (a flying limb, a stump) */
  wasted: boolean
}

export function newBug(caste: CasteId): BugState {
  const hp: Record<string, number> = {}
  for (const p of CASTES[caste].parts) hp[p.id] = p.hp
  return { caste, hp, severed: [], alive: true, headlessLeft: null }
}

export const casteOf = (b: BugState): CasteDef => CASTES[b.caste]
export const partDef = (b: BugState, id: string): PartDef | undefined => casteOf(b).parts.find((p) => p.id === id)
export const has = (b: BugState, id: string): boolean => (b.hp[id] ?? 0) > 0

function count(b: BugState, kind: PartKind): { left: number; total: number } {
  let left = 0
  let total = 0
  for (const p of casteOf(b).parts) {
    if (p.kind !== kind) continue
    total++
    if (has(b, p.id)) left++
  }
  return { left, total }
}

/** Hit one part. Limbs come off at 0; the core at 0 is death. Losing a limb also shocks the core. */
export function applyDamage(b: BugState, partId: string, amount: number): DamageResult {
  const out: DamageResult = { dealt: 0, severed: [], killed: false, wasted: false }
  const def = partDef(b, partId)
  if (!b.alive || !def || amount <= 0) return { ...out, wasted: true }
  const before = b.hp[partId] ?? 0
  if (before <= 0) return { ...out, wasted: true }
  const c = casteOf(b)
  const after = Math.max(0, before - amount)
  b.hp[partId] = after
  out.dealt = before - after
  if (def.kind === 'core') {
    if (after === 0) kill(b, out)
    return out
  }
  if (after > 0) return out
  b.severed.push(partId)
  out.severed.push(partId)
  if (def.kind === 'head' && c.headlessSeconds > 0) b.headlessLeft = c.headlessSeconds
  const core = Math.max(0, (b.hp.core ?? 0) - def.hp * c.severShock)
  b.hp.core = core
  if (core === 0) kill(b, out)
  return out
}

function kill(b: BugState, out: DamageResult): void {
  b.alive = false
  out.killed = true
}

/** Advance the headless timer. Returns true when the bug dies of it on this tick. */
export function tickBug(b: BugState, dt: number): boolean {
  if (!b.alive || b.headlessLeft === null) return false
  b.headlessLeft -= dt
  if (b.headlessLeft > 0) return false
  b.alive = false
  b.hp.core = 0
  return true
}

export interface Abilities {
  /** multiplier on the caste's speed */
  speed: number
  /** still airborne (flying castes only) */
  flying: boolean
  /** damage of one melee strike; 0 when it has nothing left to strike with */
  melee: number
  ranged: boolean
  /** thrashing blind: it attacks whatever is nearest and steers badly */
  blind: boolean
  /** an Augur with a feeler left: the swarm is linked */
  link: boolean
}

export function abilities(b: BugState): Abilities {
  const c = casteOf(b)
  const legs = count(b, 'leg')
  const wings = count(b, 'wing')
  const claws = count(b, 'claw')
  const feelers = count(b, 'feeler')
  const headed = has(b, 'head')
  const flying = c.flies && wings.left === wings.total
  let speed = 1
  if (c.flies) speed = flying ? 1 : 0.22
  else if (legs.total > 0) {
    const f = legs.left / legs.total
    speed = legs.left === 0 ? 0.08 : legs.left === 1 ? 0.2 : 0.35 + 0.65 * f
  }
  let melee = 0
  if (claws.total > 0 && claws.left > 0) melee = c.meleeDamage * (0.5 + 0.5 * (claws.left / claws.total))
  else if (claws.total > 0 && c.id === 'skirr' && has(b, 'tail')) melee = c.meleeDamage * 0.5 // the stinger still works
  else if (headed) melee = c.meleeDamage * (claws.total > 0 ? 0.35 : 1) // a bite or a ram
  return {
    speed,
    flying,
    melee,
    ranged: !!c.ranged && has(b, c.ranged.part) && b.headlessLeft === null,
    blind: b.headlessLeft !== null,
    link: b.alive && c.id === 'augur' && feelers.left > 0,
  }
}

/** Share of the core a blast reaches: plates soak it while they are on. */
export function blastCoreShare(b: BugState): number {
  const plates = count(b, 'plate')
  return plates.total === 0 ? 1 : 1 - 0.7 * (plates.left / plates.total)
}

/** What the visor shows for the part under the reticle. */
export function partReadout(b: BugState, partId: string): { caste: string; part: string; hp: number; max: number } | null {
  const def = partDef(b, partId)
  if (!def) return null
  return { caste: casteOf(b).name, part: def.label, hp: Math.ceil(b.hp[partId] ?? 0), max: def.hp }
}
