// The field: Outpost Kessel on a rust desert, four Molt burrows around it, a landing pad to the east, ships overhead.
import {
  BoxGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, DodecahedronGeometry, Float32BufferAttribute, Fog,
  Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, RingGeometry, Scene, SphereGeometry, TorusGeometry, Vector3,
} from 'three'

export const ARENA_RADIUS = 86
export const OUTPOST_HALF = 13
export const PAD = new Vector3(40, 0, 0)
export const PAD_RADIUS = 7
export const BURROWS: Vector3[] = [45, 135, 225, 315].map((deg) => {
  const a = (deg * Math.PI) / 180
  return new Vector3(Math.cos(a) * 70, 0, Math.sin(a) * 70)
})

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Ground height. Dunes, flattened under the outpost and the pad, dished at the burrows. */
export function groundAt(x: number, z: number): number {
  let h = Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038 - 0.4) * 2.4 + Math.sin(x * 0.11 + z * 0.07) * 0.7 + Math.cos(z * 0.16 - x * 0.05) * 0.35
  h *= smooth(OUTPOST_HALF + 4, OUTPOST_HALF + 22, Math.hypot(x, z))
  h *= smooth(PAD_RADIUS + 1, PAD_RADIUS + 10, Math.hypot(x - PAD.x, z - PAD.z))
  for (const b of BURROWS) {
    const d = Math.hypot(x - b.x, z - b.z)
    h = h * smooth(2, 9, d) - 1.6 * (1 - smooth(0, 6, d))
  }
  const r = Math.hypot(x, z)
  if (r > 92) h += (r - 92) * 0.55 // the rim rises into the mesas
  return h
}

export interface Box {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface World {
  scene: Scene
  /** things the player cannot walk through */
  blockers: Box[]
  /** where the squad stands, in order */
  posts: Vector3[]
  dropship: Group
  update(t: number): void
}

const SAND = 0xa2583a
const lam = (color: number, extra: object = {}): MeshLambertMaterial => new MeshLambertMaterial({ color, ...extra })

export function buildWorld(): World {
  const scene = new Scene()
  const sky = new Color(0xd9a276)
  scene.background = sky
  scene.fog = new Fog(sky, 60, 230)
  scene.add(new HemisphereLight(0xffe2c4, 0x5a2f22, 1.25))
  const sun = new DirectionalLight(0xfff0d8, 1.9)
  sun.position.set(-60, 90, 40)
  scene.add(sun)

  // ground
  const geo = new PlaneGeometry(520, 520, 150, 150)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.getAttribute('position')
  const cols: number[] = []
  const a = new Color(0xb5653f)
  const b = new Color(0x7c3d2b)
  const c = new Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = groundAt(x, z)
    pos.setY(i, h)
    const k = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.sin(z * 0.23) * 2) * Math.cos(z * 0.27)
    c.copy(a).lerp(b, Math.min(1, Math.max(0, 0.45 - h * 0.12 + k * 0.35)))
    cols.push(c.r, c.g, c.b)
  }
  geo.setAttribute('color', new Float32BufferAttribute(cols, 3))
  geo.computeVertexNormals()
  scene.add(new Mesh(geo, new MeshLambertMaterial({ vertexColors: true })))

  // mesas on the rim
  const rock = lam(0x6e3524, { flatShading: true })
  for (let i = 0; i < 30; i++) {
    const ang = (i / 30) * Math.PI * 2 + Math.sin(i * 7.1) * 0.08
    const r = 112 + Math.sin(i * 3.7) * 14
    const m = new Mesh(new DodecahedronGeometry(1, 0), rock)
    m.scale.set(16 + Math.sin(i * 1.9) * 6, 14 + Math.cos(i * 2.3) * 9, 16 + Math.cos(i * 1.3) * 6)
    m.position.set(Math.cos(ang) * r, groundAt(Math.cos(ang) * r, Math.sin(ang) * r) + 3, Math.sin(ang) * r)
    m.rotation.set(i, i * 2.1, i * 0.7)
    scene.add(m)
  }
  for (let i = 0; i < 70; i++) {
    const ang = i * 2.399
    const r = 20 + ((i * 37) % 64)
    const x = Math.cos(ang) * r
    const z = Math.sin(ang) * r
    if (Math.hypot(x - PAD.x, z - PAD.z) < PAD_RADIUS + 2) continue
    const m = new Mesh(new DodecahedronGeometry(0.25 + ((i * 13) % 5) * 0.09, 0), rock)
    m.position.set(x, groundAt(x, z) + 0.1, z)
    m.rotation.set(i, i * 3, i * 5)
    scene.add(m)
  }

  // burrows
  const dark = new MeshBasicMaterial({ color: 0x120706 })
  for (const p of BURROWS) {
    const y = groundAt(p.x, p.z)
    const hole = new Mesh(new CircleGeometry(4.2, 20), dark)
    hole.rotation.x = -Math.PI / 2
    hole.position.set(p.x, y + 0.25, p.z)
    scene.add(hole)
    const lip = new Mesh(new TorusGeometry(5.2, 1.5, 6, 14), rock)
    lip.rotation.x = Math.PI / 2
    lip.position.set(p.x, y + 0.6, p.z)
    scene.add(lip)
  }

  // the outpost
  const blockers: Box[] = []
  const steel = lam(0x56604f)
  const steelDark = lam(0x2f352c)
  const hazard = lam(0xe2b714)
  const H = OUTPOST_HALF
  const wall = (x0: number, z0: number, x1: number, z1: number): void => {
    const w = Math.abs(x1 - x0) + 0.7
    const d = Math.abs(z1 - z0) + 0.7
    const m = new Mesh(new BoxGeometry(w, 1.25, d), steel)
    m.position.set((x0 + x1) / 2, 0.62, (z0 + z1) / 2)
    scene.add(m)
    const cap = new Mesh(new BoxGeometry(w + 0.1, 0.12, d + 0.1), hazard)
    cap.position.set((x0 + x1) / 2, 1.3, (z0 + z1) / 2)
    scene.add(cap)
    blockers.push({ minX: Math.min(x0, x1) - 0.35, maxX: Math.max(x0, x1) + 0.35, minZ: Math.min(z0, z1) - 0.35, maxZ: Math.max(z0, z1) + 0.35 })
  }
  const GATE = 3.2
  for (const s of [-1, 1]) {
    wall(-H, s * H, -GATE, s * H)
    wall(GATE, s * H, H, s * H)
    wall(s * H, -H, s * H, -GATE)
    wall(s * H, GATE, s * H, H)
    for (const t of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(1.4, 3.4, 1.4), steelDark)
      post.position.set(s * H, 1.7, t * H)
      scene.add(post)
      const lamp = new Mesh(new SphereGeometry(0.28, 8, 6), new MeshBasicMaterial({ color: 0xfff3c2 }))
      lamp.position.set(s * H, 3.6, t * H)
      scene.add(lamp)
    }
  }
  // comms mast in the middle
  const mast = new Mesh(new CylinderGeometry(0.35, 0.6, 11, 8), steelDark)
  mast.position.set(0, 5.5, 0)
  scene.add(mast)
  const hut = new Mesh(new BoxGeometry(4, 2.6, 3), steel)
  hut.position.set(0, 1.3, 0)
  scene.add(hut)
  blockers.push({ minX: -2.1, maxX: 2.1, minZ: -1.6, maxZ: 1.6 })
  const dish = new Mesh(new ConeGeometry(1.8, 0.8, 14, 1, true), lam(0x8d9685, { side: 2 }))
  dish.position.set(0, 10.4, 0)
  dish.rotation.set(0.9, 0, 0.3)
  scene.add(dish)
  const beacon = new Mesh(new SphereGeometry(0.22, 8, 6), new MeshBasicMaterial({ color: 0xff4a2e }))
  beacon.position.set(0, 11.2, 0)
  scene.add(beacon)
  for (const [x, z, s] of [[-7, -8, 1.1], [-8.4, -6.8, 0.8], [7.5, 8, 1.2], [8.6, 6.4, 0.9]] as const) {
    const crate = new Mesh(new BoxGeometry(1.5 * s, 1.1 * s, 1.5 * s), lam(0x6b5a2e))
    crate.position.set(x, 0.55 * s, z)
    crate.rotation.y = x
    scene.add(crate)
    blockers.push({ minX: x - 0.9 * s, maxX: x + 0.9 * s, minZ: z - 0.9 * s, maxZ: z + 0.9 * s })
  }

  // landing pad
  const pad = new Mesh(new CircleGeometry(PAD_RADIUS, 28), lam(0x3b4038))
  pad.rotation.x = -Math.PI / 2
  pad.position.set(PAD.x, 0.04, PAD.z)
  scene.add(pad)
  const ring = new Mesh(new RingGeometry(PAD_RADIUS - 0.9, PAD_RADIUS - 0.4, 28), new MeshBasicMaterial({ color: 0xe2b714 }))
  ring.rotation.x = -Math.PI / 2
  ring.position.set(PAD.x, 0.07, PAD.z)
  scene.add(ring)
  const padGlow = new Mesh(new RingGeometry(1.2, 1.7, 20), new MeshBasicMaterial({ color: 0xe2b714 }))
  padGlow.rotation.x = -Math.PI / 2
  padGlow.position.set(PAD.x, 0.08, PAD.z)
  scene.add(padGlow)

  // the sky: a pale moon and the troop carriers holding orbit
  const moon = new Mesh(new SphereGeometry(26, 20, 14), new MeshBasicMaterial({ color: 0xf4d9bd, fog: false }))
  moon.position.set(-240, 190, -330)
  scene.add(moon)
  const hull = new MeshBasicMaterial({ color: 0x7d6a5f, fog: false })
  const carriers: Group[] = []
  for (let i = 0; i < 3; i++) {
    const g = new Group()
    g.add(new Mesh(new BoxGeometry(46, 6, 9), hull))
    const prow = new Mesh(new ConeGeometry(4.6, 16, 4), hull)
    prow.rotation.z = -Math.PI / 2
    prow.position.x = 31
    g.add(prow)
    const tower = new Mesh(new BoxGeometry(9, 7, 5), hull)
    tower.position.set(-12, 6, 0)
    g.add(tower)
    const eng = new Mesh(new BoxGeometry(6, 9, 12), hull)
    eng.position.x = -24
    g.add(eng)
    g.position.set(-150 + i * 120, 170 + i * 18, -260 - i * 30)
    g.rotation.y = 0.3
    scene.add(g)
    carriers.push(g)
  }

  const dropship = buildDropship()
  dropship.visible = false
  scene.add(dropship)

  const posts = [new Vector3(0, 0, 9.5), new Vector3(-9.5, 0, 0), new Vector3(9.5, 0, -2), new Vector3(-2, 0, -9.5), new Vector3(5.5, 0, 5.5)]
  return {
    scene,
    blockers,
    posts,
    dropship,
    update(t) {
      beacon.visible = Math.sin(t * 4) > 0
      padGlow.scale.setScalar(1 + 0.15 * Math.sin(t * 3))
      carriers.forEach((g, i) => (g.position.x = -150 + i * 120 + ((t * 1.5) % 400)))
    },
  }
}

/** The Kestrel lifter: a boxy troop hull between two tilting engine pods. Faces +x. */
function buildDropship(): Group {
  const g = new Group()
  const hull = lam(0x4a5346)
  const dark = lam(0x23281f)
  const body = new Mesh(new BoxGeometry(9, 2.8, 3.6), hull)
  body.position.y = 2.6
  g.add(body)
  const nose = new Mesh(new BoxGeometry(3, 1.8, 2.8), hull)
  nose.position.set(5.6, 2.3, 0)
  g.add(nose)
  const glass = new Mesh(new BoxGeometry(1.6, 0.9, 2.4), new MeshBasicMaterial({ color: 0xffc46b }))
  glass.position.set(6.2, 3.1, 0)
  g.add(glass)
  const tail = new Mesh(new BoxGeometry(4, 0.5, 5.2), hull)
  tail.position.set(-5.6, 3.8, 0)
  g.add(tail)
  const fin = new Mesh(new BoxGeometry(2.4, 2.4, 0.3), hull)
  fin.position.set(-5.4, 4.8, 0)
  g.add(fin)
  for (const s of [-1, 1]) {
    const arm = new Mesh(new BoxGeometry(2.4, 0.5, 2.6), hull)
    arm.position.set(0.5, 3.6, s * 3)
    g.add(arm)
    const pod = new Mesh(new CylinderGeometry(1.1, 1.3, 3, 10), dark)
    pod.position.set(0.5, 3.4, s * 4.9)
    g.add(pod)
    const jet = new Mesh(new CylinderGeometry(0.9, 0.3, 2.2, 10), new MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.7 }))
    jet.position.set(0.5, 1.2, s * 4.9)
    jet.name = 'jet'
    g.add(jet)
    const skid = new Mesh(new BoxGeometry(6, 0.25, 0.4), dark)
    skid.position.set(0, 0.15, s * 1.5)
    g.add(skid)
    const strut = new Mesh(new BoxGeometry(0.25, 1.1, 0.25), dark)
    strut.position.set(0, 0.7, s * 1.5)
    g.add(strut)
  }
  const stripe = new Mesh(new BoxGeometry(9.05, 0.35, 3.65), lam(0xe2b714))
  stripe.position.y = 1.7
  g.add(stripe)
  const ramp = new Mesh(new BoxGeometry(3, 0.2, 3), dark)
  ramp.position.set(-5.6, 0.75, 0)
  ramp.rotation.z = 0.42
  g.add(ramp)
  return g
}

export { SAND }
