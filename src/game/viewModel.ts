// What the player sees of themselves: two armoured arms holding the weapon. Built from parts in code, in the Warden
// livery (bone ceramic plates over a dark undersuit, teal status strips), because the generated Warden figures are
// 10k-face miniatures that fall apart at arm's length. A generated first-person model replaces this (HANDOFF-GPU.md).
// Camera space: -z is forward, +x is right. Each weapon group has its origin at the pistol grip.
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector3, type Material, type Texture } from 'three'

export interface ViewWeapon {
  group: Group
  /** muzzle, in the group's space */
  muzzle: Vector3
  /** the part that cycles when it fires (the Scattergun's pump and the hand on it) */
  action: Group | null
}

export interface ViewMaterials {
  plate: MeshStandardMaterial
  suit: MeshStandardMaterial
  metal: MeshStandardMaterial
  dark: MeshStandardMaterial
  glow: MeshBasicMaterial
}

export function viewMaterials(tex: { plate?: Texture; metal?: Texture } = {}): ViewMaterials {
  return {
    plate: new MeshStandardMaterial({ color: tex.plate ? 0xffffff : 0xcfc8b6, map: tex.plate ?? null, roughness: 0.7, metalness: 0.05 }),
    suit: new MeshStandardMaterial({ color: 0x33383b, roughness: 0.9 }),
    metal: new MeshStandardMaterial({ color: tex.metal ? 0xd8dcd8 : 0x5d655f, map: tex.metal ?? null, roughness: 0.5, metalness: 0.25 }),
    dark: new MeshStandardMaterial({ color: 0x2b2f31, roughness: 0.6, metalness: 0.2 }),
    glow: new MeshBasicMaterial({ color: 0x35e0c0 }),
  }
}

const UP = new Vector3(0, 1, 0)
function box(w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}
/** A tapered tube from a to b. */
function tube(a: Vector3, b: Vector3, r0: number, r1: number, mat: Material, sides = 10): Mesh {
  const d = b.clone().sub(a)
  const m = new Mesh(new CylinderGeometry(r1, r0, d.length(), sides), mat)
  m.position.copy(a).addScaledVector(d, 0.5)
  m.quaternion.setFromUnitVectors(UP, d.normalize())
  return m
}
const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z)

/** A gauntlet gripping something at `at`, with its forearm running back to `elbow` (off the bottom of the view). */
function arm(m: ViewMaterials, at: Vector3, elbow: Vector3, side: 1 | -1): Group {
  const g = new Group()
  const dir = elbow.clone().sub(at).normalize()
  const wrist = at.clone().addScaledVector(dir, 0.07)
  // hand: palm, knuckle plate, four fingers curled forward, thumb
  const hand = new Group()
  hand.position.copy(at)
  hand.add(box(0.075, 0.085, 0.09, m.suit))
  hand.add(box(0.085, 0.03, 0.085, m.plate, 0, 0.05, -0.005))
  for (let i = 0; i < 4; i++) {
    hand.add(box(0.016, 0.03, 0.05, m.suit, -0.03 + i * 0.02, 0.02, -0.06))
    hand.add(box(0.016, 0.045, 0.02, m.suit, -0.03 + i * 0.02, -0.01, -0.08))
    hand.add(box(0.017, 0.012, 0.03, m.plate, -0.03 + i * 0.02, 0.038, -0.058))
  }
  hand.add(box(0.022, 0.03, 0.06, m.suit, side * -0.045, 0.01, -0.035))
  g.add(hand)
  // forearm: undersuit, a ceramic vambrace over it with a status strip, a cuff ring, an elbow cap
  const mid = wrist.clone().lerp(elbow, 0.55)
  g.add(tube(wrist, elbow, 0.045, 0.07, m.suit))
  g.add(tube(wrist.clone().lerp(elbow, 0.08), mid, 0.058, 0.082, m.plate, 8))
  g.add(tube(wrist.clone().lerp(elbow, 0.02), wrist.clone().lerp(elbow, 0.09), 0.062, 0.062, m.dark))
  const strip = tube(wrist.clone().lerp(elbow, 0.14), wrist.clone().lerp(elbow, 0.48), 0.006, 0.006, m.glow, 5)
  strip.position.addScaledVector(UP, 0.078).addScaledVector(v(side, 0, 0), -0.012)
  g.add(strip)
  const cap = new Mesh(new SphereGeometry(0.095, 10, 8), m.plate)
  cap.position.copy(elbow)
  g.add(cap)
  return g
}

export function buildRepeater(m: ViewMaterials): ViewWeapon {
  const g = new Group()
  // receiver, rail, stock, grip, drum
  g.add(box(0.07, 0.11, 0.4, m.metal, 0, 0.09, -0.08))
  g.add(box(0.03, 0.02, 0.36, m.dark, 0, 0.155, -0.08))
  g.add(box(0.05, 0.07, 0.12, m.dark, 0, 0.08, 0.17))
  g.add(box(0.045, 0.1, 0.05, m.dark, 0, -0.01, 0.02))
  const drum = new Mesh(new CylinderGeometry(0.062, 0.062, 0.09, 14), m.dark)
  drum.rotation.z = Math.PI / 2
  drum.position.set(0, 0, -0.12)
  g.add(drum)
  g.add(box(0.1, 0.02, 0.02, m.metal, 0, 0, -0.12))
  // boxy heat shroud in ceramic, vent slots, the twin barrels, a status strip and a round counter
  g.add(box(0.1, 0.105, 0.36, m.plate, 0, 0.095, -0.45))
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) g.add(box(0.004, 0.05, 0.03, m.dark, s * 0.051, 0.1, -0.31 - i * 0.065))
  for (const s of [-1, 1]) {
    g.add(tube(v(s * 0.024, 0.095, -0.6), v(s * 0.024, 0.095, -0.82), 0.016, 0.016, m.dark, 8))
    g.add(tube(v(s * 0.024, 0.095, -0.78), v(s * 0.024, 0.095, -0.82), 0.022, 0.022, m.metal, 8))
  }
  g.add(box(0.004, 0.012, 0.3, m.glow, -0.036, 0.13, -0.08))
  g.add(box(0.03, 0.02, 0.004, m.glow, 0, 0.17, 0.09))
  g.add(box(0.012, 0.03, 0.012, m.dark, 0, 0.175, -0.6))
  // right hand on the grip, left under the shroud
  g.add(arm(m, v(0.005, 0, 0.03), v(0.26, -0.3, 0.36), 1))
  const left = arm(m, v(-0.005, 0.02, -0.42), v(-0.42, -0.3, 0.2), -1)
  g.add(left)
  return { group: g, muzzle: v(0, 0.095, -0.86), action: null }
}

export function buildScattergun(m: ViewMaterials): ViewWeapon {
  const g = new Group()
  g.add(box(0.065, 0.1, 0.34, m.metal, 0, 0.085, -0.05))
  g.add(box(0.05, 0.07, 0.12, m.dark, 0, 0.075, 0.17))
  g.add(box(0.045, 0.1, 0.05, m.dark, 0, -0.01, 0.02))
  g.add(tube(v(0, 0.105, -0.2), v(0, 0.105, -0.8), 0.03, 0.03, m.dark, 12))
  g.add(tube(v(0, 0.105, -0.76), v(0, 0.105, -0.8), 0.038, 0.038, m.metal, 12))
  g.add(tube(v(0, 0.045, -0.2), v(0, 0.045, -0.7), 0.024, 0.024, m.metal, 10))
  g.add(box(0.03, 0.018, 0.2, m.dark, 0, 0.142, -0.05))
  g.add(box(0.004, 0.012, 0.2, m.glow, -0.034, 0.12, -0.05))
  const action = new Group()
  const pump = new Mesh(new CylinderGeometry(0.043, 0.043, 0.2, 10), m.plate)
  pump.rotation.x = Math.PI / 2
  pump.position.set(0, 0.045, -0.45)
  action.add(pump)
  for (let i = 0; i < 4; i++) action.add(box(0.09, 0.006, 0.012, m.dark, 0, 0.045, -0.39 - i * 0.04))
  action.add(arm(m, v(-0.005, -0.005, -0.44), v(-0.42, -0.3, 0.2), -1))
  g.add(action)
  g.add(arm(m, v(0.005, 0, 0.03), v(0.26, -0.3, 0.36), 1))
  return { group: g, muzzle: v(0, 0.105, -0.84), action }
}
