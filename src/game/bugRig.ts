// A bug's body in the scene: one Object3D per part id, so a part can be hit, read out and torn off on its own.
// Two sources produce the same Rig: the placeholder built here from primitives (in use until the generated, segmented
// models arrive), and `rigFromScene` for a GLB whose nodes are named after the part ids (HANDOFF-GPU.md).
// Local axes: the bug faces +z, +y is up, its left is +x. The rig's origin is on the ground under the body.
import {
  BufferGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial, SphereGeometry,
  type Material, type Object3D,
} from 'three'
import { CASTES, type CasteId, type PartKind } from '../sim/castes'
import { TEX } from './textures'

export interface Rig {
  root: Group
  parts: Map<string, Object3D>
  /** every mesh a shot can land on; `userData.partId` names its part */
  hit: Mesh[]
  /** where a ranged attack leaves from, if the caste has one */
  muzzle: Object3D | null
  /** rest rotation of each part, so animation is an offset */
  rest: Map<string, { x: number; y: number; z: number }>
  placeholder: boolean
}

const CHITIN = 0x5c1712
const CHITIN_DARK = 0x260c0b
const SHELL = 0xc4ae8c
const BILE = 0xb6ff3a

interface Mats {
  chitin: MeshLambertMaterial
  dark: MeshLambertMaterial
  shell: MeshLambertMaterial
  glow: MeshLambertMaterial
  flesh: MeshLambertMaterial
  wing: MeshLambertMaterial
}

function mats(): Mats {
  // with a texture the image carries the colour and the material colour only tints it
  const chitin = TEX.chitin ?? null
  const shell = TEX.shell ?? null
  const flesh = TEX.flesh ?? null
  return {
    chitin: new MeshLambertMaterial({ color: chitin ? 0xe8b0a0 : CHITIN, map: chitin }),
    dark: new MeshLambertMaterial({ color: chitin ? 0x6a4a48 : CHITIN_DARK, map: chitin }),
    shell: new MeshLambertMaterial({ color: shell ? 0xe6d8c0 : SHELL, map: shell, side: DoubleSide }),
    glow: new MeshLambertMaterial({ color: BILE, emissive: BILE, emissiveIntensity: 0.9 }),
    flesh: new MeshLambertMaterial({ color: flesh ? 0xd9a09a : 0x9a6f6a, map: flesh, emissive: 0x3a1616, emissiveIntensity: 0.5 }),
    wing: new MeshLambertMaterial({ color: 0xd8b98f, side: DoubleSide, transparent: true, opacity: 0.8 }),
  }
}

/** A tapered limb segment from the origin along +y. */
function seg(len: number, r0: number, r1: number, mat: Material): Mesh {
  const g = new CylinderGeometry(r1, r0, len, 6)
  g.translate(0, len / 2, 0)
  return new Mesh(g, mat)
}

function ball(r: number, sx: number, sy: number, sz: number, mat: Material): Mesh {
  const m = new Mesh(new SphereGeometry(r, 12, 9), mat)
  m.scale.set(sx, sy, sz)
  return m
}

class Builder {
  readonly root = new Group()
  readonly parts = new Map<string, Object3D>()
  muzzle: Object3D | null = null
  readonly m = mats()

  part(id: string, x = 0, y = 0, z = 0): Group {
    const g = new Group()
    g.name = id
    g.position.set(x, y, z)
    this.root.add(g)
    this.parts.set(id, g)
    return g
  }

  /** A walking leg: out and up to a knee, then down to the ground. `side` is +1 for the bug's left. */
  leg(id: string, side: number, x: number, y: number, z: number, upper: number, thick: number): void {
    const g = this.part(id, side * x, y, z)
    const tilt = new Group()
    tilt.rotation.z = -side * 1.05
    tilt.add(seg(upper, thick, thick * 0.8, this.m.chitin))
    const knee = new Group()
    knee.position.y = upper
    knee.rotation.z = -side * 1.75
    const lower = (y + upper * Math.cos(1.05)) / Math.cos(Math.PI - 2.8)
    knee.add(seg(lower, thick * 0.8, thick * 0.2, this.m.dark))
    const cap = ball(thick * 1.1, 1, 1, 1, this.m.shell)
    knee.add(cap)
    tilt.add(knee)
    g.add(tilt)
  }

  done(): Rig {
    return finish(this.root, this.parts, this.muzzle, true)
  }
}

function finish(root: Group, parts: Map<string, Object3D>, muzzle: Object3D | null, placeholder: boolean): Rig {
  const hit: Mesh[] = []
  const rest = new Map<string, { x: number; y: number; z: number }>()
  for (const [id, obj] of parts) {
    rest.set(id, { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z })
    obj.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      m.userData.partId = id
      hit.push(m)
    })
  }
  return { root, parts, hit, muzzle, rest, placeholder }
}

function reaver(): Rig {
  const b = new Builder()
  const core = b.part('core')
  const thorax = ball(1, 0.62, 0.56, 1.0, b.m.chitin)
  thorax.position.set(0, 1.15, 0.3)
  const abdomen = ball(1, 0.5, 0.48, 0.95, b.m.dark)
  abdomen.position.set(0, 1.3, -1.05)
  abdomen.rotation.x = -0.25
  const ridge = ball(1, 0.34, 0.2, 0.8, b.m.shell)
  ridge.position.set(0, 1.62, 0.2)
  core.add(thorax, abdomen, ridge)

  const head = b.part('head', 0, 1.2, 1.2)
  const skull = new Mesh(new ConeGeometry(0.4, 1.1, 5), b.m.shell)
  skull.rotation.x = Math.PI / 2
  skull.position.z = 0.45
  skull.scale.y = 1
  head.add(skull)
  for (const s of [-1, 1]) {
    const jaw = new Mesh(new ConeGeometry(0.09, 0.6, 4), b.m.dark)
    jaw.rotation.x = Math.PI / 2 + 0.4
    jaw.position.set(s * 0.2, -0.25, 0.7)
    head.add(jaw)
  }

  for (const [id, s] of [['claw-l', 1], ['claw-r', -1]] as const) {
    const g = b.part(id, s * 0.5, 1.45, 0.75)
    g.rotation.set(0.35, 0, -s * 0.3)
    g.add(seg(1.15, 0.16, 0.12, b.m.chitin))
    const elbow = new Group()
    elbow.position.y = 1.15
    elbow.rotation.x = 1.9
    const blade = seg(1.7, 0.2, 0.02, b.m.shell)
    blade.scale.x = 0.35
    elbow.add(blade, ball(0.17, 1, 1, 1, b.m.dark))
    g.add(elbow)
  }
  b.leg('leg-fl', 1, 0.5, 1.05, 0.55, 0.95, 0.13)
  b.leg('leg-fr', -1, 0.5, 1.05, 0.55, 0.95, 0.13)
  b.leg('leg-hl', 1, 0.45, 1.1, -0.45, 1.05, 0.14)
  b.leg('leg-hr', -1, 0.45, 1.1, -0.45, 1.05, 0.14)
  return b.done()
}

function lobber(): Rig {
  const b = new Builder()
  const core = b.part('core')
  const body = ball(1, 0.85, 0.62, 1.05, b.m.chitin)
  body.position.y = 0.95
  const sac = ball(1, 0.6, 0.5, 0.6, b.m.glow)
  sac.position.set(0, 1.05, -0.75)
  core.add(body, sac)
  const head = b.part('head', 0, 0.85, 1.0)
  const skull = ball(0.38, 1, 0.8, 1.1, b.m.shell)
  skull.position.z = 0.2
  head.add(skull)
  const tail = b.part('tail', 0, 1.35, -0.7)
  tail.rotation.x = -0.55
  tail.add(seg(1.1, 0.22, 0.18, b.m.chitin))
  const j1 = new Group()
  j1.position.y = 1.1
  j1.rotation.x = 1.0
  j1.add(seg(1.0, 0.18, 0.14, b.m.dark))
  const j2 = new Group()
  j2.position.y = 1.0
  j2.rotation.x = 1.1
  j2.add(seg(0.7, 0.14, 0.1, b.m.chitin))
  const bulb = ball(0.36, 1, 1, 1, b.m.glow)
  bulb.position.y = 0.85
  j2.add(bulb)
  j1.add(j2)
  tail.add(j1)
  b.muzzle = bulb
  b.leg('leg-fl', 1, 0.7, 0.85, 0.5, 0.75, 0.12)
  b.leg('leg-fr', -1, 0.7, 0.85, 0.5, 0.75, 0.12)
  b.leg('leg-hl', 1, 0.7, 0.85, -0.45, 0.75, 0.12)
  b.leg('leg-hr', -1, 0.7, 0.85, -0.45, 0.75, 0.12)
  return b.done()
}

function wingGeo(side: number): BufferGeometry {
  const g = new BufferGeometry()
  const s = side
  g.setAttribute('position', new Float32BufferAttribute([0, 0, 0.55, 0, 0, -0.5, s * 2.7, 0, -0.35, 0, 0, 0.55, s * 2.7, 0, -0.35, s * 1.7, 0, 1.0], 3))
  g.computeVertexNormals()
  return g
}

function skirr(): Rig {
  const b = new Builder()
  const core = b.part('core')
  const body = ball(1, 0.36, 0.32, 1.1, b.m.chitin)
  body.position.y = 0.6
  core.add(body)
  const head = b.part('head', 0, 0.62, 1.05)
  const skull = new Mesh(new ConeGeometry(0.26, 0.8, 5), b.m.shell)
  skull.rotation.x = Math.PI / 2
  skull.position.z = 0.3
  head.add(skull)
  for (const [id, s] of [['wing-l', 1], ['wing-r', -1]] as const) {
    const g = b.part(id, s * 0.3, 0.8, 0.15)
    g.add(new Mesh(wingGeo(s), b.m.wing))
    const spar = seg(2.7, 0.07, 0.02, b.m.dark)
    spar.rotation.z = -s * Math.PI / 2
    spar.rotation.y = s * 0.13
    g.add(spar)
  }
  for (const [id, s] of [['claw-l', 1], ['claw-r', -1]] as const) {
    const g = b.part(id, s * 0.25, 0.45, 0.45)
    g.rotation.x = 2.5
    g.add(seg(0.85, 0.08, 0.02, b.m.shell))
  }
  const tail = b.part('tail', 0, 0.6, -1.0)
  tail.rotation.x = -Math.PI / 2 - 0.2
  tail.add(seg(1.3, 0.12, 0.02, b.m.dark))
  return b.done()
}

/** A quarter of an armoured dome: the quadrant on the given side, front or back. */
function shellQuarter(front: boolean, left: boolean, theta0: number, theta1: number, mat: Material): Mesh {
  // three's sphere: x = -cos(phi) sin(theta), z = sin(phi) sin(theta)
  const phi = front ? (left ? Math.PI / 2 : 0) : left ? Math.PI : Math.PI * 1.5
  return new Mesh(new SphereGeometry(1, 8, 8, phi + 0.03, Math.PI / 2 - 0.06, theta0, theta1 - theta0), mat)
}

function bulwark(): Rig {
  const b = new Builder()
  const core = b.part('core')
  const body = ball(1, 1.5, 1.2, 2.3, b.m.dark)
  body.position.y = 1.75
  core.add(body)
  for (const [id, front, left] of [['plate-fl', true, true], ['plate-fr', true, false], ['plate-hl', false, true], ['plate-hr', false, false]] as const) {
    const g = b.part(id, 0, 1.75, 0)
    const shell = shellQuarter(front, left, 0.12, 1.95, b.m.shell)
    shell.scale.set(1.68, 1.36, 2.52)
    g.add(shell)
  }
  const head = b.part('head', 0, 1.25, 2.25)
  const skull = ball(0.7, 1.1, 0.8, 1.0, b.m.chitin)
  skull.position.z = 0.35
  const nozzle = new Mesh(new ConeGeometry(0.3, 1.2, 6), b.m.glow)
  nozzle.rotation.x = Math.PI / 2
  nozzle.position.set(0, -0.05, 1.3)
  head.add(skull, nozzle)
  b.muzzle = nozzle
  for (const [row, z] of [['f', 1.35], ['m', 0], ['h', -1.35]] as const) {
    b.leg(`leg-${row}l`, 1, 1.3, 1.35, z, 1.5, 0.24)
    b.leg(`leg-${row}r`, -1, 1.3, 1.35, z, 1.5, 0.24)
  }
  return b.done()
}

function augur(): Rig {
  const b = new Builder()
  const core = b.part('core')
  const sac = ball(1, 2.4, 2.0, 3.2, b.m.flesh)
  sac.position.y = 2.15
  const rear = ball(1, 1.7, 1.5, 1.8, b.m.flesh)
  rear.position.set(0, 1.9, -3.3)
  core.add(sac, rear)
  for (let i = 0; i < 5; i++) {
    const rib = ball(1, 2.46, 0.16, 0.2, b.m.chitin)
    rib.position.set(0, 2.15 + 1.9 * Math.cos(i * 0.45 - 0.9), -2.2 + i * 1.0)
    rib.scale.x = 2.46 * Math.sin(Math.acos(Math.min(0.99, Math.abs((-2.2 + i) / 3.2)))) * 0.75
    core.add(rib)
  }
  const head = b.part('head', 0, 3.25, 2.6)
  head.add(ball(1.1, 1, 0.95, 1, b.m.glow))
  for (const [id, left] of [['plate-l', true], ['plate-r', false]] as const) {
    const g = b.part(id, 0, 3.25, 2.6)
    const shell = shellQuarter(true, left, 0.15, 2.3, b.m.shell)
    shell.scale.setScalar(1.36)
    g.add(shell)
  }
  for (const [id, s] of [['feeler-l', 1], ['feeler-r', -1]] as const) {
    const g = b.part(id, s * 0.9, 3.9, 2.2)
    g.rotation.set(0.5, 0, -s * 0.45)
    g.add(seg(2.8, 0.1, 0.04, b.m.dark))
    const tip = ball(0.2, 1, 1, 1, b.m.glow)
    tip.position.y = 2.8
    g.add(tip)
  }
  const prob = b.part('claw-c', 0, 2.1, 4.0)
  prob.rotation.x = 1.75
  prob.add(seg(2.4, 0.3, 0.04, b.m.shell))
  for (const [row, z] of [['f', 1.8], ['m', 0], ['h', -1.8]] as const) {
    b.leg(`leg-${row}l`, 1, 2.2, 0.95, z, 1.0, 0.3)
    b.leg(`leg-${row}r`, -1, 2.2, 0.95, z, 1.0, 0.3)
  }
  return b.done()
}

const BUILDERS: Record<CasteId, () => Rig> = { reaver, lobber, skirr, bulwark, augur }

export function placeholderRig(caste: CasteId): Rig {
  return BUILDERS[caste]()
}

/**
 * A rig from a loaded model: the scene must hold one node per part id of the caste, each with its origin at the joint
 * where the part meets the body. An optional node named `muzzle` marks where a ranged attack leaves from.
 * Throws with the missing ids, so the caller can fall back to the placeholder and say why.
 */
export function rigFromScene(scene: Object3D, caste: CasteId): Rig {
  const parts = new Map<string, Object3D>()
  const missing: string[] = []
  for (const p of CASTES[caste].parts) {
    const node = scene.getObjectByName(p.id)
    if (node) parts.set(p.id, node)
    else missing.push(p.id)
  }
  if (missing.length > 0) throw new Error(`model for ${caste} has no node named: ${missing.join(', ')}`)
  const root = new Group()
  root.add(scene)
  return finish(root, parts, scene.getObjectByName('muzzle') ?? null, false)
}

export function kindOf(caste: CasteId, partId: string): PartKind | undefined {
  return CASTES[caste].parts.find((p) => p.id === partId)?.kind
}

export function disposeObject(o: Object3D): void {
  o.traverse((x) => {
    const m = x as Mesh
    if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose() // a loaded model's geometry is shared by its clones
  })
}

export const ICHOR = BILE
