import { describe, expect, it } from 'vitest'
import { CASTES, CASTE_IDS } from '../../src/sim/castes'
import { abilities, applyDamage, blastCoreShare, newBug, partReadout, tickBug } from '../../src/sim/damage'

describe('parts come off where they are shot', () => {
  it('a limb at zero is severed, and only that limb', () => {
    const b = newBug('reaver')
    const r = applyDamage(b, 'claw-l', 40)
    expect(r.severed).toEqual(['claw-l'])
    expect(b.hp['claw-l']).toBe(0)
    expect(b.hp['claw-r']).toBe(40)
    expect(b.alive).toBe(true)
  })
  it('a hit short of the limb\'s hit points leaves it on', () => {
    const b = newBug('reaver')
    expect(applyDamage(b, 'claw-l', 39).severed).toEqual([])
    expect(b.severed).toEqual([])
  })
  it('a shot at a part already gone is wasted', () => {
    const b = newBug('reaver')
    applyDamage(b, 'claw-l', 99)
    expect(applyDamage(b, 'claw-l', 10)).toMatchObject({ wasted: true, dealt: 0 })
    expect(applyDamage(b, 'no-such-part', 10).wasted).toBe(true)
  })
  it('losing a limb shocks the core, and enough limbs kill', () => {
    const b = newBug('reaver')
    applyDamage(b, 'leg-fl', 30)
    expect(b.hp.core).toBeCloseTo(120 - 30 * 0.35)
    for (const p of CASTES.reaver.parts) if (p.kind !== 'core' && p.kind !== 'head') applyDamage(b, p.id, 999)
    expect(b.hp.core).toBeGreaterThan(0) // every limb off does not quite kill a Reaver: it is left a helpless trunk
    expect(abilities(b).speed).toBeLessThan(0.1)
  })
  it('the core at zero is death', () => {
    const b = newBug('lobber')
    expect(applyDamage(b, 'core', 90).killed).toBe(true)
    expect(b.alive).toBe(false)
    expect(applyDamage(b, 'head', 10).wasted).toBe(true)
  })
})

describe('what a bug can still do', () => {
  it('a Reaver with no scythes can only bite, weakly', () => {
    const b = newBug('reaver')
    const full = abilities(b).melee
    applyDamage(b, 'claw-l', 99)
    const one = abilities(b).melee
    applyDamage(b, 'claw-r', 99)
    const none = abilities(b).melee
    expect(full).toBe(16)
    expect(one).toBeLessThan(full)
    expect(none).toBeLessThan(one)
    expect(none).toBeGreaterThan(0)
  })
  it('each lost leg slows it; one leg left is a crawl', () => {
    const b = newBug('reaver')
    const speeds = [abilities(b).speed]
    for (const id of ['leg-fl', 'leg-fr', 'leg-hl', 'leg-hr']) {
      applyDamage(b, id, 99)
      speeds.push(abilities(b).speed)
    }
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThan(speeds[i - 1] as number)
    expect(speeds[3]).toBe(0.2)
  })
  it('a Lobber without its tail has nothing to throw', () => {
    const b = newBug('lobber')
    expect(abilities(b).ranged).toBe(true)
    applyDamage(b, 'tail', 50)
    expect(abilities(b).ranged).toBe(false)
  })
  it('a headless bug thrashes blind, then dies', () => {
    const b = newBug('reaver')
    applyDamage(b, 'head', 45)
    expect(b.alive).toBe(true)
    expect(abilities(b).blind).toBe(true)
    expect(tickBug(b, 3.9)).toBe(false)
    expect(tickBug(b, 0.2)).toBe(true)
    expect(b.alive).toBe(false)
  })
  it('a Skirr with one wing gone is grounded', () => {
    const b = newBug('skirr')
    expect(abilities(b).flying).toBe(true)
    applyDamage(b, 'wing-l', 28)
    expect(abilities(b)).toMatchObject({ flying: false, speed: 0.22 })
  })
  it('a Bulwark lives without its head but loses the spray; its plates soak a blast', () => {
    const b = newBug('bulwark')
    expect(blastCoreShare(b)).toBeCloseTo(0.3)
    for (const id of ['plate-fl', 'plate-fr', 'plate-hl', 'plate-hr']) applyDamage(b, id, 999)
    expect(blastCoreShare(b)).toBe(1)
    applyDamage(b, 'head', 999)
    expect(b.alive).toBe(true)
    expect(b.headlessLeft).toBeNull()
    expect(abilities(b).ranged).toBe(false)
  })
  it('the Augur links the swarm until both feelers are off, and dies with its cranium', () => {
    const b = newBug('augur')
    expect(abilities(b).link).toBe(true)
    applyDamage(b, 'feeler-l', 70)
    expect(abilities(b).link).toBe(true)
    applyDamage(b, 'feeler-r', 70)
    expect(abilities(b).link).toBe(false)
    applyDamage(b, 'head', 420)
    expect(tickBug(b, 0.2)).toBe(true)
  })
})

describe('caste data', () => {
  it('every caste has one core whose hit points are the caste\'s, and unique part ids', () => {
    for (const id of CASTE_IDS) {
      const c = CASTES[id]
      const cores = c.parts.filter((p) => p.kind === 'core')
      expect(cores).toHaveLength(1)
      expect(cores[0]?.id).toBe('core')
      expect(cores[0]?.hp).toBe(c.coreHp)
      expect(new Set(c.parts.map((p) => p.id)).size).toBe(c.parts.length)
      if (c.ranged) expect(c.parts.some((p) => p.id === c.ranged?.part)).toBe(true)
    }
  })
  it('the visor readout comes from the sim', () => {
    const b = newBug('reaver')
    applyDamage(b, 'claw-l', 14)
    expect(partReadout(b, 'claw-l')).toEqual({ caste: 'Reaver', part: 'left scythe', hp: 26, max: 40 })
  })
})
