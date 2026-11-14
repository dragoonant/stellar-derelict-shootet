// The squad: the five Warden figures generated for Stellar Derelict, holding posts inside the wall. The figures are
// fixed-pose miniatures, so a Warden turns and fires from its post rather than walking.
// KB rule 26: every model is loaded before the mission can start; the stand-in is only for a model that failed.
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry, Vector3, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { CASTES, type CasteId } from '../sim/castes'
import bugModels from '../data/bugModels.json'
import { placeholderRig, rigFromScene, type Rig } from './bugRig'
import type { Bug, Target } from './bugs'

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
  private readonly protos = new Map<string, Object3D>()
  private readonly bugProtos = new Map<CasteId, Object3D>()
  private readonly bugList = Object.entries(bugModels.models as Record<string, { file: string; scale?: number } | null>).filter((e) => e[1] !== null) as [CasteId, { file: string; scale?: number }][]
  readonly progress: ModelProgress = { loaded: 0, total: SQUAD.length + this.bugList.length, failed: [] }
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
      ...bugJobs,
      ...SQUAD.map(async (s) => {
        try {
          const gltf = await loader.loadAsync(`${base}assets/models/${s.model}.glb`)
          const scene = gltf.scene
          scene.updateMatrixWorld(true)
          const box = new Box3().setFromObject(scene)
          const size = box.getSize(new Vector3())
          const centre = box.getCenter(new Vector3())
          scene.position.set(-centre.x, -box.min.y, -centre.z)
          const fit = new Group()
          fit.add(scene)
          fit.scale.setScalar(HEIGHT / (size.y || 1))
          this.protos.set(s.model, fit)
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

  figure(slug: string): Object3D {
    const p = this.protos.get(slug)
    return p ? p.clone(true) : standIn()
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
  /** deal damage to a bug part; `from` is the muzzle */
  shoot(w: Warden, bug: Bug, partId: string, damage: number, from: Vector3, hit: boolean): void
  flame(from: Vector3, dir: Vector3): void
  wounded(w: Warden, amount: number, from: Vector3): void
  fell(w: Warden): void
}

const tmp = new Vector3()

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
  ctx: SquadCtx | null = null

  constructor(readonly def: SquadDef, readonly figure: Object3D, post: Vector3) {
    this.pos.copy(post)
    figure.position.copy(post)
    this.yaw = Math.atan2(post.x, post.z)
    figure.rotation.y = this.yaw
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

  update(dt: number, ctx: SquadCtx): void {
    if (!this.alive) {
      if (this.fall < 1) {
        this.fall = Math.min(1, this.fall + dt * 2.2)
        this.figure.rotation.set((-Math.PI / 2) * this.fall, this.yaw, 0, 'YXZ')
        this.figure.position.y = 0.35 * this.fall
      }
      return
    }
    const range = this.def.weapon === 'scorcher' ? 17 : this.def.weapon === 'pistol' ? 38 : 60
    this.retarget -= dt
    if (this.retarget <= 0 || !this.bug?.alive) {
      this.retarget = 0.4
      this.bug = null
      let best = range * range
      for (const b of ctx.bugs) {
        if (!b.alive) continue
        const d = b.pos.distanceToSquared(this.pos)
        if (d < best) {
          best = d
          this.bug = b
        }
      }
    }
    const b = this.bug
    if (!b) return
    let turn = Math.atan2(b.pos.x - this.pos.x, b.pos.z - this.pos.z) - this.yaw
    while (turn > Math.PI) turn -= Math.PI * 2
    while (turn < -Math.PI) turn += Math.PI * 2
    this.yaw += turn * Math.min(1, dt * 6)
    this.figure.rotation.y = this.yaw
    this.fireT -= dt
    if (this.fireT > 0 || Math.abs(turn) > 0.35) return
    const from = this.muzzle(tmp)
    if (this.def.weapon === 'scorcher') {
      this.fireT = 0.12
      const part = pickPart(b)
      const at = b.partPoint(part, new Vector3())
      ctx.flame(from, at.clone().sub(from).normalize())
      ctx.shoot(this, b, part, 7, from, true)
      return
    }
    const pistol = this.def.weapon === 'pistol'
    this.burst++
    this.fireT = pistol ? 0.45 : 0.13
    if (this.burst >= (pistol ? 2 : 5)) {
      this.burst = 0
      this.fireT = 0.7 + Math.random() * 0.7
    }
    const odds = b.caste.flies && b.pos.y > this.pos.y + 3 ? 0.3 : 0.55
    ctx.shoot(this, b, pickPart(b), pistol ? 14 : 9, from, Math.random() < odds)
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
