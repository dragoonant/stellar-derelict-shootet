// Everything that flies, splashes or fades: ichor and blood, torn-off parts, tracers, ground stains.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, Color, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Points,
  PointsMaterial, Quaternion, Vector3, type Object3D, type Scene,
} from 'three'
import { disposeObject } from './bugRig'
import { groundAt } from './world'

const MAX_P = 1800
const MAX_DEBRIS = 70
const MAX_STAINS = 80
const G = 22

interface Debris {
  obj: Object3D
  vel: Vector3
  spin: Vector3
  life: number
  drip: number
  color: number
}

export class Fx {
  private readonly pos = new Float32Array(MAX_P * 3)
  private readonly col = new Float32Array(MAX_P * 3)
  private readonly vel = new Float32Array(MAX_P * 3)
  private readonly life = new Float32Array(MAX_P)
  private readonly grav = new Float32Array(MAX_P)
  private next = 0
  private readonly points: Points
  private readonly debris: Debris[] = []
  private readonly stains: Mesh[] = []
  private stainNext = 0
  private readonly tracers: { line: Line; life: number }[] = []
  private readonly flashes: { mesh: Mesh; life: number; grow: number }[] = []
  private readonly c = new Color()
  private readonly q = new Quaternion()

  constructor(private readonly scene: Scene) {
    const geo = new BufferGeometry()
    this.pos.fill(-9999)
    geo.setAttribute('position', new BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new BufferAttribute(this.col, 3))
    this.points = new Points(geo, new PointsMaterial({ size: 0.22, vertexColors: true, sizeAttenuation: true }))
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  /** A burst of droplets. `dir` biases the spray; `gravity` 0 makes smoke or flame. */
  burst(at: Vector3, color: number, n: number, speed: number, dir?: Vector3, gravity = 1, life = 0.9): void {
    this.c.set(color)
    for (let i = 0; i < n; i++) {
      const k = this.next
      this.next = (this.next + 1) % MAX_P
      const s = speed * (0.3 + Math.random() * 0.9)
      let vx = Math.random() * 2 - 1
      let vy = Math.random() * 2 - 0.4
      let vz = Math.random() * 2 - 1
      const l = Math.hypot(vx, vy, vz) || 1
      vx = (vx / l) * s + (dir ? dir.x * speed * 0.7 : 0)
      vy = (vy / l) * s + (dir ? dir.y * speed * 0.7 : 0)
      vz = (vz / l) * s + (dir ? dir.z * speed * 0.7 : 0)
      this.pos.set([at.x, at.y, at.z], k * 3)
      this.vel.set([vx, vy, vz], k * 3)
      const shade = 0.7 + Math.random() * 0.3
      this.col.set([this.c.r * shade, this.c.g * shade, this.c.b * shade], k * 3)
      this.life[k] = life * (0.5 + Math.random() * 0.8)
      this.grav[k] = gravity
    }
  }

  /** A part leaves its bug: it keeps its place in the world, then tumbles, bleeds and lands. */
  tearOff(part: Object3D, away: Vector3, color: number, force = 1): void {
    part.updateWorldMatrix(true, false)
    const p = new Vector3()
    const s = new Vector3()
    part.matrixWorld.decompose(p, this.q, s)
    part.removeFromParent()
    part.position.copy(p)
    part.quaternion.copy(this.q)
    part.scale.copy(s)
    this.scene.add(part)
    const vel = new Vector3(away.x + (Math.random() - 0.5) * 0.9, 0, away.z + (Math.random() - 0.5) * 0.9).normalize().multiplyScalar((4 + Math.random() * 5) * force)
    vel.y = (5 + Math.random() * 5) * force
    this.debris.push({ obj: part, vel, spin: new Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5), life: 14, drip: 0, color })
    if (this.debris.length > MAX_DEBRIS) this.dropDebris(0)
  }

  private dropDebris(i: number): void {
    const d = this.debris[i]
    if (!d) return
    d.obj.removeFromParent()
    disposeObject(d.obj)
    this.debris.splice(i, 1)
  }

  stain(x: number, z: number, color: number, radius: number): void {
    let m = this.stains[this.stainNext]
    if (!m) {
      m = new Mesh(new CircleGeometry(1, 10), new MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false }))
      m.rotation.x = -Math.PI / 2
      this.scene.add(m)
      this.stains[this.stainNext] = m
    }
    ;(m.material as MeshBasicMaterial).color.set(color)
    m.scale.set(radius * (0.7 + Math.random() * 0.6), radius * (0.7 + Math.random() * 0.6), 1)
    m.rotation.z = Math.random() * 6
    m.position.set(x, groundAt(x, z) + 0.05 + this.stainNext * 0.0004, z)
    this.stainNext = (this.stainNext + 1) % MAX_STAINS
  }

  tracer(from: Vector3, to: Vector3, color = 0xffe08a): void {
    const geo = new BufferGeometry().setFromPoints([from, to])
    const line = new Line(geo, new LineBasicMaterial({ color, transparent: true, opacity: 0.9 }))
    this.scene.add(line)
    this.tracers.push({ line, life: 0.07 })
  }

  /** An expanding fireball. */
  flash(at: Vector3, radius: number, color = 0xffb347): void {
    const mesh = new Mesh(new CircleGeometry(1, 14), new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: 2 }))
    mesh.position.copy(at)
    this.scene.add(mesh)
    this.flashes.push({ mesh, life: 0.28, grow: radius })
  }

  update(dt: number, cameraPos: Vector3): void {
    for (let k = 0; k < MAX_P; k++) {
      const life = this.life[k] as number
      if (life <= 0) continue
      const i = k * 3
      this.life[k] = life - dt
      if (life - dt <= 0) {
        this.pos[i + 1] = -9999
        continue
      }
      this.vel[i + 1] = (this.vel[i + 1] as number) - G * (this.grav[k] as number) * dt
      this.pos[i] = (this.pos[i] as number) + (this.vel[i] as number) * dt
      this.pos[i + 1] = (this.pos[i + 1] as number) + (this.vel[i + 1] as number) * dt
      this.pos[i + 2] = (this.pos[i + 2] as number) + (this.vel[i + 2] as number) * dt
    }
    const geo = this.points.geometry
    ;(geo.getAttribute('position') as BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('color') as BufferAttribute).needsUpdate = true

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i] as Debris
      d.life -= dt
      if (d.life <= 0) {
        this.dropDebris(i)
        continue
      }
      const o = d.obj
      const floor = groundAt(o.position.x, o.position.z) + 0.15
      if (o.position.y > floor || d.vel.y > 0) {
        d.vel.y -= G * dt
        o.position.addScaledVector(d.vel, dt)
        o.rotation.x += d.spin.x * dt
        o.rotation.y += d.spin.y * dt
        o.rotation.z += d.spin.z * dt
        d.drip -= dt
        if (d.drip <= 0) {
          d.drip = 0.05
          this.burst(o.position, d.color, 2, 1.5, undefined, 1, 0.6)
        }
        if (o.position.y <= floor) {
          o.position.y = floor
          if (Math.abs(d.vel.y) > 3) {
            d.vel.y *= -0.3
            d.vel.x *= 0.5
            d.vel.z *= 0.5
            d.spin.multiplyScalar(0.4)
          } else {
            d.vel.set(0, 0, 0)
            this.stain(o.position.x, o.position.z, d.color, 0.9)
          }
        }
      }
      if (d.life < 1.5) o.scale.multiplyScalar(Math.max(0, 1 - dt * 1.5))
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i] as { line: Line; life: number }
      t.life -= dt
      if (t.life <= 0) {
        this.scene.remove(t.line)
        t.line.geometry.dispose()
        ;(t.line.material as LineBasicMaterial).dispose()
        this.tracers.splice(i, 1)
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i] as { mesh: Mesh; life: number; grow: number }
      f.life -= dt
      const k = 1 - Math.max(0, f.life) / 0.28
      f.mesh.scale.setScalar(0.3 + f.grow * k)
      f.mesh.lookAt(cameraPos)
      ;(f.mesh.material as MeshBasicMaterial).opacity = 0.9 * (1 - k)
      if (f.life <= 0) {
        this.scene.remove(f.mesh)
        f.mesh.geometry.dispose()
        ;(f.mesh.material as MeshBasicMaterial).dispose()
        this.flashes.splice(i, 1)
      }
    }
  }
}
