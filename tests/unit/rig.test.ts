import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { CASTES, CASTE_IDS } from '../../src/sim/castes'
import { placeholderRig, rigFromScene } from '../../src/game/bugRig'

describe('bug rigs', () => {
  it('the placeholder has one object per part id, each with something to hit', () => {
    for (const id of CASTE_IDS) {
      const rig = placeholderRig(id)
      for (const p of CASTES[id].parts) {
        expect(rig.parts.has(p.id), `${id} ${p.id}`).toBe(true)
        expect(rig.hit.some((m) => m.userData.partId === p.id), `${id} ${p.id} hit mesh`).toBe(true)
      }
      expect(rig.hit.every((m) => typeof m.userData.partId === 'string')).toBe(true)
      if (CASTES[id].ranged) expect(rig.muzzle).not.toBeNull()
    }
  })
  it('a model with a node per part id becomes a rig; a missing node is named', () => {
    const scene = new Group()
    for (const p of CASTES.lobber.parts) {
      const node = new Group()
      node.name = p.id
      node.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
      scene.add(node)
    }
    const rig = rigFromScene(scene, 'lobber')
    expect(rig.placeholder).toBe(false)
    expect(rig.hit).toHaveLength(CASTES.lobber.parts.length)
    scene.remove(scene.getObjectByName('tail') as Group)
    expect(() => rigFromScene(scene, 'lobber')).toThrow(/tail/)
  })
})
