// The squad: the five Warden figures generated for Stellar Derelict, holding posts inside the wall. The figures are
// fixed-pose miniatures, so a Warden turns and fires from its post rather than walking.
// KB rule 26: every model is loaded before the mission can start; the stand-in is only for a model that failed.
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry, Vector3, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { CASTES, type CasteId } from '../sim/castes'
import bugModels from '../data/bugModels.json'
import { placeholderRig, rigFromScene, type Rig } from './bugRig'
import { TEXTURE_NAMES, loadTextures } from './textures'
import { bakeFigure, puppet, type FigureProto, type Puppet } from './wardenRig'
import { OUTPOST_HALF, PAD } from './world'
import type { Bug, Target } from './bugs'
import { groundAt } from './world'

export interface SquadDef {
  id: string
  name: string
  rank: string
  model: string
  weapon: 'repeater' | 'pistol' | 'scorcher'
}

export const SQUAD: SquadDef[] = [
  { id: 'venn', name: 'Venn', rank: 'Sgt', model: 'warden-sergeant', weapon: 'pistol' },
  { id: 'brandt', name: 'Brandt', rank: 'Wdn', model: 'warden-rifle-a', weapon: 'repeater' },
  { id: 'okafor', name: 'Okafor', rank: 'Wdn', model: 'warden-rifle-b', weapon: 'repeater' },
  { id: 'riedel', name: 'Riedel', rank: 'Wdn', model: 'warden-scorcher', weapon: 'scorcher' },
  { id: 'sato', name: 'Sato', rank: 'Tech', model: 'warden-tech', weapon: 'repeater' },
]
export const WARDEN_HP = 150
const HEIGHT = 2.05

export interface ModelProgress {
  loaded: number
  total: number
  failed: string[]
}

/** Loads every squad model once; `proto(slug)` hands out a figure standing on y = 0 and facing +z. */
export class Models {
  private readonly protos = new Map<string, FigureProto>()
  private readonly bugProtos = new Map<CasteId, Object3D>()
  private readonly bugList = Object.entries(bugModels.models as Record<string, { file: string; scale?: number } | null>).filter((e) => e[1] !== null) as [CasteId, { file: string; scale?: number }][]
  readonly progress: ModelProgress = { loaded: 0, total: SQUAD.length + this.bugList.length + TEXTURE_NAMES.length, failed: [] }
  onProgress: (() => void) | null = null

  async preload(base: string): Promise<void> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const bugJobs = this.bugList.map(async ([caste, entry]) => {
      try {
        const gltf = await loader.loadAsync(`${base}assets/models/${entry.file}`)
        gltf.scene.scale.setScalar(entry.scale ?? 1)
        gltf.scene.traverse((o) => {
          const m = o as Mesh
          if (m.isMesh) m.geometry.userData.shared = true
        })
        rigFromScene(gltf.scene.clone(true), caste) // prove the part nodes are all there before a wave needs them
        this.bugProtos.set(caste, gltf.scene)
      } catch (e) {
        this.progress.failed.push(entry.file)
        console.warn(`Bug Front: model for the ${caste} was not used (${e instanceof Error ? e.message : String(e)}); using the stand-in rig.`)
      }
      this.progress.loaded++
      this.onProgress?.()
    })
    await Promise.all([
      loadTextures(base, () => {
        this.progress.loaded++
        this.onProgress?.()
      }),
      ...bugJobs,
      ...SQUAD.map(async (s) => {
        try {
          const gltf = await loader.loadAsync(`${base}assets/models/${s.model}.glb`)
          this.protos.set(s.model, bakeFigure(gltf.scene, HEIGHT))
        } catch (e) {
          this.progress.failed.push(s.model)
          console.warn(`Bug Front: model "${s.model}" failed to load (${e instanceof Error ? e.message : String(e)}); using the stand-in figure.`)
        }
        this.progress.loaded++
        this.onProgress?.()
      }),
    ])
  }

  /** A fresh rig for one bug: the generated model when the caste has one, otherwise the stand-in built from primitives. */
  bugRig(caste: CasteId): Rig {
    const proto = this.bugProtos.get(caste)
    return proto ? rigFromScene(proto.clone(true), caste) : placeholderRig(caste)
  }

  /** A walking figure for a squad member, or the stand-in with no moving parts if its model failed to load. */
  figure(slug: string): { object: Object3D; puppet: Puppet | null } {
    const p = this.protos.get(slug)
    if (!p) return { object: standIn(), puppet: null }
    const pup = puppet(p)
    return { object: pup.object, puppet: pup }
  }
}

function standIn(): Object3D {
  const g = new Group()
  const armour = new MeshLambertMaterial({ color: 0xcfc8b6 })
  const under = new MeshLambertMaterial({ color: 0x33383a })
  const body = new Mesh(new BoxGeometry(0.95, 0.8, 0.55), armour)
  body.position.y = 1.2
  const legs = new Mesh(new BoxGeometry(0.7, 0.8, 0.45), under)
  legs.position.y = 0.4
  const helm = new Mesh(new SphereGeometry(0.33, 10, 8), armour)
  helm.position.y = 1.85
  const visor = new Mesh(new BoxGeometry(0.5, 0.1, 0.2), new MeshLambertMaterial({ color: 0xffb648, emissive: 0xffb648 }))
  visor.position.set(0, 1.86, 0.25)
  const gun = new Mesh(new CylinderGeometry(0.07, 0.07, 0.9, 6), under)
  gun.rotation.x = Math.PI / 2
  gun.position.set(0.25, 1.25, 0.5)
  g.add(body, legs, helm, visor, gun)
  return g
}

export interface SquadCtx {
  bugs: Bug[]
  /** during the extraction the squad runs for the pad */
  extract: boolean
  /** deal damage to a bug part; `from` is the muzzle */
  shoot(w: Warden, bug: Bug, partId: string, damage: number, from: Vector3, hit: boolean): void
  flame(from: Vector3, dir: Vector3): void
  wounded(w: Warden, amount: number, from: Vector3): void
  fell(w: Warden): void
}

const tmp = new Vector3()

const WALK = 3.8
const HOLD = OUTPOST_HALF - 3.4

export class Warden implements Target {
  readonly pos = new Vector3()
  readonly radius = 0.6
  readonly aimHeight = 1.3
  hp = WARDEN_HP
  alive = true
  yaw = 0
  private bug: Bug | null = null
  private retarget = Math.random() * 0.4
  private fireT = 1 + Math.random()
  private burst = 0
  private fall = 0
  private readonly goal = new Vector3()
  private replan = 0
  private stride = Math.random() * 6
  private walking = 0
  private recoil = 0
  private pitch = 0
  readonly figure: Object3D
  private readonly puppet: Puppet | null
  ctx: SquadCtx | null = null

  constructor(readonly def: SquadDef, fig: { object: Object3D; puppet: Puppet | null }, private readonly post: Vector3, private readonly slot: number) {
    this.figure = fig.object
    this.puppet = fig.puppet
    this.pos.copy(post)
    this.goal.copy(post)
    this.figure.position.copy(post)
    this.yaw = Math.atan2(post.x, post.z)
    this.figure.rotation.y = this.yaw
  }

  hurt(amount: number, from: Vector3): void {
    if (!this.alive) return
    this.hp = Math.max(0, this.hp - amount)
    this.ctx?.wounded(this, amount, from)
    if (this.hp === 0) {
      this.alive = false
      this.ctx?.fell(this)
    }
  }

  /** Put a Warden back as a save describes it. */
  restore(hp: number): void {
    this.hp = hp
    this.alive = hp > 0
    if (!this.alive) {
      this.fall = 1
      this.figure.rotation.set(-Math.PI / 2, this.yaw, 0, 'YXZ')
      this.figure.position.y = 0.35
    }
  }

  muzzle(out: Vector3): Vector3 {
    return out.set(this.pos.x + Math.sin(this.yaw) * 0.7, this.pos.y + 1.25, this.pos.z + Math.cos(this.yaw) * 0.7)
  }

  /** Where this Warden wants to stand: at the wall facing the threat, or on the way to the lifter. */
  private plan(): void {
    const g = this.goal
    if (this.ctx?.extract) {
      // out through the east gate, then the pad
      if (this.pos.x < OUTPOST_HALF + 1.5 && Math.abs(this.pos.z) > 2) g.set(Math.min(this.pos.x, OUTPOST_HALF - 2.5), 0, (this.slot - 2) * 0.6)
      else if (this.pos.x < OUTPOST_HALF + 1.5) g.set(OUTPOST_HALF + 3, 0, (this.slot - 2) * 0.6)
      else g.set(PAD.x - 3 + (this.slot % 2) * 2, 0, PAD.z + (this.slot - 2) * 1.6)
      return
    }
    const b = this.bug
    if (!b) {
      g.copy(this.post)
      return
    }
    // a place on the firing line toward the threat, fanned out by slot so the squad does not stack
    const reach = this.def.weapon === 'scorcher' ? HOLD + 1.6 : HOLD
    const a = Math.atan2(b.pos.x, b.pos.z) + (this.slot - 2) * 0.3
    const m = Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a)))
    g.set((Math.sin(a) / m) * reach, 0, (Math.cos(a) / m) * reach)
  }

  update(dt: number, ctx: SquadCtx): void {
    this.ctx = ctx
    if (!this.alive) {
      if (this.fall < 1) {
        this.fall = Math.min(1, this.fall + dt * 2.2)
        this.figure.rotation.set((-Math.PI / 2) * this.fall, this.yaw, 0, 'YXZ')
        this.figure.position.y = this.pos.y + 0.35 * this.fall
      }
      return
    }
    const range = this.def.weapon === 'scorcher' ? 17 : this.def.weapon === 'pistol' ? 38 : 60
    this.retarget -= dt
    if (this.retarget <= 0 || !this.bug?.alive) {
      this.retarget = 0.4
      this.bug = null
      let best = (range + 25) ** 2
      for (const b of ctx.bugs) {
        if (!b.alive) continue
        const d = b.pos.distanceToSquared(this.pos)
        if (d < best) {
          best = d
          this.bug = b
        }
      }
    }
    this.replan -= dt
    if (this.replan <= 0) {
      this.replan = ctx.extract ? 0.3 : 2 + Math.random() * 1.5
      this.plan()
    }
    // walk to the goal, round the comms hut
    let mx = this.goal.x - this.pos.x
    let mz = this.goal.z - this.pos.z
    const md = Math.hypot(mx, mz)
    const moving = md > 0.5
    if (moving) {
      mx /= md
      mz /= md
      const hd = Math.hypot(this.pos.x, this.pos.z)
      if (hd < 4.2 && hd > 0.01) {
        mx += (this.pos.x / hd) * 1.2
        mz += (this.pos.z / hd) * 1.2
        const l = Math.hypot(mx, mz) || 1
        mx /= l
        mz /= l
      }
      const speed = WALK * (ctx.extract ? 1.5 : 1)
      this.pos.x += mx * speed * dt
      this.pos.z += mz * speed * dt
      this.stride += dt * speed * 2.6
    }
    this.pos.y = groundAt(this.pos.x, this.pos.z)
    this.walking += ((moving ? 1 : 0) - this.walking) * Math.min(1, dt * 8)

    const b = this.bug
    const inRange = !!b && b.pos.distanceToSquared(this.pos) < range * range
    let want = this.yaw
    if (b && inRange) want = Math.atan2(b.pos.x - this.pos.x, b.pos.z - this.pos.z)
    else if (moving) want = Math.atan2(mx, mz)
    let turn = want - this.yaw
    while (turn > Math.PI) turn -= Math.PI * 2
    while (turn < -Math.PI) turn += Math.PI * 2
    this.yaw += turn * Math.min(1, dt * 6)
    if (b && inRange) {
      const up = Math.atan2(b.pos.y + 1 - (this.pos.y + 1.25), Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z))
      this.pitch += (Math.max(-0.25, Math.min(0.5, up)) - this.pitch) * Math.min(1, dt * 5)
    } else this.pitch *= 1 - Math.min(1, dt * 4)
    this.recoil = Math.max(0, this.recoil - dt * 7)
    this.pose()

    this.fireT -= dt
    if (!b || !inRange || this.fireT > 0 || Math.abs(turn) > 0.35) return
    const from = this.muzzle(tmp)
    if (this.def.weapon === 'scorcher') {
      this.fireT = 0.12
      const part = pickPart(b)
      const at = b.partPoint(part, new Vector3())
      ctx.flame(from, at.clone().sub(from).normalize())
      ctx.shoot(this, b, part, 7, from, true)
      this.recoil = 0.3
      return
    }
    const pistol = this.def.weapon === 'pistol'
    this.burst++
    this.fireT = pistol ? 0.45 : 0.13
    if (this.burst >= (pistol ? 2 : 5)) {
      this.burst = 0
      this.fireT = 0.7 + Math.random() * 0.7
    }
    this.recoil = 1
    const odds = (b.caste.flies && b.pos.y > this.pos.y + 3 ? 0.3 : 0.55) * (moving ? 0.7 : 1)
    ctx.shoot(this, b, pickPart(b), pistol ? 14 : 9, from, Math.random() < odds)
  }

  private pose(): void {
    const s = Math.sin(this.stride)
    const swing = s * 0.55 * this.walking
    // a swung leg is shorter top to bottom: sink by that much so the planted boot stays on the ground
    const sink = (this.puppet ? 0.76 : 0) * (1 - Math.cos(swing))
    this.figure.position.set(this.pos.x, this.pos.y - sink, this.pos.z)
    this.figure.rotation.set(0, this.yaw, 0)
    const p = this.puppet
    if (!p) return
    p.legL.rotation.x = -swing
    p.legR.rotation.x = swing
    p.torso.rotation.set(-this.pitch - this.recoil * 0.05 + 0.06 * this.walking, s * 0.08 * this.walking, Math.cos(this.stride) * 0.04 * this.walking)
  }
}

/** The squad shoots what a trained Warden would: plates before the body under them, limbs half the time. */
function pickPart(b: Bug): string {
  const alive = CASTES[b.state.caste].parts.filter((p) => (b.state.hp[p.id] ?? 0) > 0)
  const plates = alive.filter((p) => p.kind === 'plate')
  if (plates.length > 0 && Math.random() < 0.8) return (plates[Math.floor(Math.random() * plates.length)] as { id: string }).id
  const limbs = alive.filter((p) => p.kind !== 'core' && p.kind !== 'plate')
  if (limbs.length > 0 && Math.random() < 0.5) return (limbs[Math.floor(Math.random() * limbs.length)] as { id: string }).id
  return 'core'
}
