// A Molt in the field: its sim state, its rig, and the steering that turns "what it has left" into behaviour.
// All the rules live in sim/damage.ts; this file only asks `abilities()` what the bug can still do.
import { Box3, Vector3, type Object3D } from 'three'
import { AUGUR_LINK_SPEED, CASTES, type CasteDef, type CasteId } from '../sim/castes'
import { abilities, has, newBug, tickBug, type BugState } from '../sim/damage'
import { placeholderRig, type Rig } from './bugRig'
import { groundAt } from './world'

export interface Target {
  /** feet position */
  pos: Vector3
  alive: boolean
  radius: number
  aimHeight: number
  hurt(amount: number, from: Vector3): void
}

export interface BugCtx {
  time: number
  targets: Target[]
  bugs: Bug[]
  /** an Augur with a feeler is alive */
  linked: boolean
  damageScale: number
  lob(from: Vector3, at: Target, damage: number): void
  spray(from: Vector3, dir: Vector3, damage: number, range: number): void
  strikeSound(at: Vector3): void
  /** a bug died of something other than a hit (headless timer) */
  died(bug: Bug): void
}

const G = 22
const tmp = new Vector3()
const tmp2 = new Vector3()
const box = new Box3()
let nextId = 1

export class Bug {
  readonly id = nextId++
  readonly state: BugState
  readonly caste: CasteDef
  readonly rig: Rig
  yaw = 0
  target: Target | null = null
  removed = false
  /** seconds since death, or -1 while alive */
  deadFor = -1
  private retarget = 0
  private cooldown = 0.6
  private rangedCd = 1.5
  private strike = 0
  private pending = false
  private phase = Math.random() * 6
  private rise = 1.4
  private vy = 0
  private wander = Math.random() * 6
  private fly = { mode: 'circle' as 'circle' | 'dive' | 'climb', t: 2 + Math.random() * 3, angle: Math.random() * 6, dir: Math.random() < 0.5 ? -1 : 1 }
  private grounded = false
  private readonly legIds: string[]

  constructor(casteId: CasteId, at: Vector3, rig: Rig = placeholderRig(casteId)) {
    this.state = newBug(casteId)
    this.caste = CASTES[casteId]
    this.rig = rig
    this.legIds = this.caste.parts.filter((p) => p.kind === 'leg').map((p) => p.id)
    rig.root.position.copy(at)
    if (this.caste.flies) this.rise = 0
    for (const m of rig.hit) m.userData.bug = this
  }

  get pos(): Vector3 {
    return this.rig.root.position
  }
  get alive(): boolean {
    return this.state.alive
  }

  /** The middle of a part in the world: where the squad aims and where its ichor comes from. */
  partPoint(id: string, out: Vector3): Vector3 {
    const obj = this.rig.parts.get(id)
    if (!obj) return out.copy(this.pos)
    box.setFromObject(obj)
    return box.getCenter(out)
  }

  /** The part is gone from the rig: stop offering its meshes to the raycaster. Returns the object to throw. */
  detach(id: string): Object3D | undefined {
    const obj = this.rig.parts.get(id)
    if (!obj) return undefined
    this.rig.hit = this.rig.hit.filter((m) => m.userData.partId !== id)
    this.rig.parts.delete(id)
    return obj
  }

  die(): void {
    this.deadFor = 0
  }

  update(dt: number, ctx: BugCtx): void {
    const root = this.rig.root
    if (!this.state.alive) {
      if (this.deadFor < 0) this.deadFor = 0
      this.deadFor += dt
      const floor = groundAt(root.position.x, root.position.z)
      if (root.position.y > floor) {
        this.vy -= G * dt
        root.position.y = Math.max(floor, root.position.y + this.vy * dt)
      }
      root.rotation.z += (1.25 - root.rotation.z) * Math.min(1, dt * 5)
      if (this.deadFor > 9) root.position.y -= dt * 0.8
      if (this.deadFor > 12) this.removed = true
      return
    }
    if (tickBug(this.state, dt)) {
      ctx.died(this)
      return
    }
    const ab = abilities(this.state)
    const c = this.caste
    this.cooldown -= dt
    this.rangedCd -= dt
    this.retarget -= dt
    if (this.retarget <= 0 || !this.target?.alive) {
      this.retarget = 0.5 + Math.random() * 0.3
      let best: Target | null = null
      let bestD = Infinity
      for (const t of ctx.targets) {
        if (!t.alive) continue
        const d = t.pos.distanceToSquared(root.position) * (ab.blind ? 0.5 + Math.random() : 1)
        if (d < bestD) {
          bestD = d
          best = t
        }
      }
      this.target = best
    }
    const t = this.target
    let speed = c.speed * ab.speed * (ctx.linked && c.id !== 'augur' ? AUGUR_LINK_SPEED : 1)
    let moving = 0

    if (this.rise > 0) {
      // climbing out of the burrow
      this.rise -= dt
      moving = 1
    }

    if (c.flies && ab.flying && t) {
      this.flyStep(dt, t, speed, ab.melee * ctx.damageScale, ctx)
    } else {
      const floor = groundAt(root.position.x, root.position.z)
      if (root.position.y > floor + 0.05 && c.flies) {
        // a Skirr that has lost a wing comes down hard
        this.vy -= G * dt
        root.position.y += this.vy * dt
        root.rotation.z += dt * 7
        root.rotation.x += dt * 3
        if (root.position.y <= floor) {
          root.position.y = floor
          root.rotation.set(0, this.yaw, 0)
          this.grounded = true
        }
      } else if (t) {
        if (c.flies && !this.grounded) {
          this.grounded = true
          root.rotation.set(0, this.yaw, 0)
        }
        const dx = t.pos.x - root.position.x
        const dz = t.pos.z - root.position.z
        const d = Math.hypot(dx, dz)
        let want = Math.atan2(dx, dz)
        let advance = true
        const reach = c.meleeRange + t.radius
        if (ab.blind) {
          this.wander += (Math.random() - 0.5) * dt * 14
          want = this.wander
          speed *= 0.8
        } else if (ab.ranged && c.ranged?.kind === 'lob') {
          advance = d > c.ranged.range * 0.7
        } else {
          advance = d > reach * 0.7
        }
        let turn = want - this.yaw
        while (turn > Math.PI) turn -= Math.PI * 2
        while (turn < -Math.PI) turn += Math.PI * 2
        this.yaw += Math.max(-1, Math.min(1, turn)) * Math.min(1, dt * (ab.blind ? 9 : 5))
        if (advance && speed > 0) {
          root.position.x += Math.sin(this.yaw) * speed * dt
          root.position.z += Math.cos(this.yaw) * speed * dt
          moving = 1
        }
        // attacks
        if (!ab.blind || d < reach) {
          if (ab.melee > 0 && d < reach && this.cooldown <= 0) {
            this.cooldown = c.meleeCooldown
            this.strike = 0.4
            this.pending = true
          }
          if (ab.ranged && c.ranged && d < c.ranged.range && this.rangedCd <= 0 && Math.abs(turn) < 0.6) {
            this.rangedCd = c.ranged.cooldown * (0.8 + Math.random() * 0.4)
            const from = this.rig.muzzle ? this.rig.muzzle.getWorldPosition(tmp) : tmp.copy(root.position).setY(root.position.y + 1.5)
            if (c.ranged.kind === 'lob') {
              ctx.lob(from, t, c.ranged.damage * ctx.damageScale)
              this.strike = 0.4
            } else {
              tmp2.set(t.pos.x - from.x, t.pos.y + t.aimHeight * 0.7 - from.y, t.pos.z - from.z).normalize()
              ctx.spray(from, tmp2, c.ranged.damage * ctx.damageScale, c.ranged.range)
            }
          }
        }
        if (this.pending && this.strike <= 0.2) {
          this.pending = false
          if (d < reach * 1.25) {
            t.hurt(ab.melee * ctx.damageScale, root.position)
            ctx.strikeSound(root.position)
          }
        }
        // spacing
        for (const o of ctx.bugs) {
          if (o === this || !o.state.alive || o.caste.flies !== c.flies) continue
          const ox = root.position.x - o.pos.x
          const oz = root.position.z - o.pos.z
          const od = Math.hypot(ox, oz)
          const min = (c.radius + o.caste.radius) * 0.9
          if (od < min && od > 0.001 && c.radius <= o.caste.radius) {
            root.position.x += (ox / od) * (min - od) * 0.5
            root.position.z += (oz / od) * (min - od) * 0.5
          }
        }
        const r = Math.hypot(root.position.x, root.position.z)
        if (r > 100) {
          root.position.x *= 100 / r
          root.position.z *= 100 / r
        }
        root.position.y = groundAt(root.position.x, root.position.z) - Math.max(0, this.rise) * 1.6
        root.rotation.y = this.yaw
        if (ab.blind) root.rotation.z = Math.sin(ctx.time * 23 + this.id) * 0.25
      }
    }
    this.strike = Math.max(0, this.strike - dt)
    this.animate(dt, ctx.time, moving * speed, ab.flying)
  }

  private flyStep(dt: number, t: Target, speed: number, melee: number, ctx: BugCtx): void {
    const root = this.rig.root
    const f = this.fly
    f.t -= dt
    const goal = tmp
    if (f.mode === 'circle') {
      f.angle += dt * 0.8 * f.dir
      goal.set(t.pos.x + Math.cos(f.angle) * 16, t.pos.y + 9 + Math.sin(ctx.time + this.id) * 1.5, t.pos.z + Math.sin(f.angle) * 16)
      if (f.t <= 0 && melee > 0) f.mode = 'dive'
    } else if (f.mode === 'dive') {
      goal.set(t.pos.x, t.pos.y + t.aimHeight, t.pos.z)
      speed *= 1.35
      if (root.position.distanceTo(goal) < this.caste.meleeRange) {
        t.hurt(melee, root.position)
        ctx.strikeSound(root.position)
        this.strike = 0.4
        f.mode = 'climb'
        f.t = 1.4
      }
    } else {
      goal.set(root.position.x + Math.sin(this.yaw) * 10, t.pos.y + 12, root.position.z + Math.cos(this.yaw) * 10)
      if (f.t <= 0) {
        f.mode = 'circle'
        f.t = 2 + Math.random() * 3.5
        f.angle = Math.atan2(root.position.z - t.pos.z, root.position.x - t.pos.x)
      }
    }
    tmp2.copy(goal).sub(root.position)
    const d = tmp2.length()
    if (d > 0.01) {
      tmp2.multiplyScalar(Math.min(d, speed * dt) / d)
      root.position.add(tmp2)
      const want = Math.atan2(tmp2.x, tmp2.z)
      let turn = want - this.yaw
      while (turn > Math.PI) turn -= Math.PI * 2
      while (turn < -Math.PI) turn += Math.PI * 2
      this.yaw += turn * Math.min(1, dt * 6)
    }
    const floor = groundAt(root.position.x, root.position.z) + 1
    if (root.position.y < floor) root.position.y = floor
    root.rotation.set(f.mode === 'dive' ? 0.5 : 0, this.yaw, 0)
  }

  private animate(dt: number, time: number, groundSpeed: number, flying: boolean): void {
    const { parts, rest } = this.rig
    this.phase += dt * (2 + groundSpeed * 1.6)
    const stride = groundSpeed > 0.05 ? 0.45 : 0.04
    this.legIds.forEach((id, i) => {
      const leg = parts.get(id)
      const r = rest.get(id)
      if (leg && r && has(this.state, id)) leg.rotation.y = r.y + Math.sin(this.phase + (i % 2 ? Math.PI : 0) + Math.floor(i / 2) * 1.3) * stride
    })
    const swing = this.strike > 0 ? Math.sin((1 - this.strike / 0.4) * Math.PI) : 0
    for (const [id, obj] of parts) {
      const r = rest.get(id)
      if (!r) continue
      if (id.startsWith('claw')) obj.rotation.x = r.x + swing * 1.1 + Math.sin(time * 2.2 + this.id + (id.endsWith('l') ? 0 : 1.7)) * 0.08
      else if (id.startsWith('wing')) obj.rotation.z = r.z + (flying ? Math.sin(time * 24 + this.id) * 0.7 * (id.endsWith('l') ? 1 : -1) : id.endsWith('l') ? -1.1 : 1.1)
      else if (id === 'tail') obj.rotation.x = r.x + swing * 0.5 + Math.sin(time * 1.7 + this.id) * 0.06
      else if (id.startsWith('feeler')) obj.rotation.x = r.x + Math.sin(time * 1.3 + (id.endsWith('l') ? 0 : 2)) * 0.18
      else if (id === 'head' && this.caste.id === 'augur') obj.scale.setScalar(1 + Math.sin(time * 3) * 0.04)
    }
  }
}
