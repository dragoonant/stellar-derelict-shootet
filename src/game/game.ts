// The game: the player, the weapons, the waves, the extraction. It owns the scene and asks the sim for every rule.
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, Raycaster, SphereGeometry, Vector3, WebGLRenderer } from 'three'
import { CASTES, type CasteId } from '../sim/castes'
import { abilities, applyDamage, blastCoreShare, partDef, partReadout } from '../sim/damage'
import { clearSave, readSave, writeSave, type SaveData, SAVE_VERSION } from '../sim/save'
import { DIFFICULTIES, WAVES, waveQueue, type Difficulty } from '../sim/waves'
import { Audio } from './audio'
import { Bug, type BugCtx, type Target } from './bugs'
import { ICHOR, disposeObject } from './bugRig'
import { Fx } from './fx'
import { Hud, type RadarDot } from './hud'
import { Input, type Actions } from './input'
import { Models, SQUAD, Warden, type SquadCtx } from './squad'
import { ARENA_RADIUS, BURROWS, PAD, PAD_RADIUS, buildWorld, groundAt, type World } from './world'

export interface WeaponDef {
  id: string
  name: string
  damage: number
  /** seconds between shots */
  rate: number
  mag: number
  reserve: number
  spread: number
  pellets: number
  reload: number
}
export const WEAPONS: WeaponDef[] = [
  { id: 'repeater', name: 'Mk 4 Repeater', damage: 14, rate: 0.085, mag: 40, reserve: 280, spread: 0.011, pellets: 1, reload: 1.5 },
  { id: 'scatter', name: 'Scattergun', damage: 11, rate: 0.7, mag: 6, reserve: 42, spread: 0.065, pellets: 9, reload: 2.1 },
]
export const PLAYER_HP = 100
const GRENADES = 3
const BLOOD = 0xb0140c
const G = 22
const EYE = 1.7
const BLAST_RADIUS = 7
const BLAST_DAMAGE = 150

export type Mode = 'title' | 'playing' | 'paused' | 'dead' | 'won'
type Phase = 'intermission' | 'wave' | 'extract'

interface Glob {
  mesh: Mesh
  vel: Vector3
  damage: number
}
interface Grenade {
  mesh: Mesh
  vel: Vector3
  fuse: number
}

export class Game {
  readonly renderer: WebGLRenderer
  readonly camera = new PerspectiveCamera(75, 1, 0.05, 900)
  readonly world: World
  readonly fx: Fx
  readonly audio: Audio
  readonly input: Input
  readonly hud = new Hud()
  readonly models = new Models()
  mode: Mode = 'title'
  phase: Phase = 'intermission'
  difficulty: Difficulty = 'regular'
  wave = 0
  score = 0
  kills = 0
  severed = 0
  bugs: Bug[] = []
  wardens: Warden[] = []
  /** test switch: the player takes no damage */
  god = false
  onMode: ((m: Mode) => void) | null = null

  private time = 0
  private phaseT = 0
  private queue: CasteId[] = []
  private spawnT = 0
  private seed = 1
  private globs: Glob[] = []
  private grenades: Grenade[] = []
  private readonly ray = new Raycaster()
  private frame = 0
  private shipT = 0
  private storageError: string | null = null

  // the player
  readonly player: Target & { hp: number; vy: number; yaw: number; pitch: number } = {
    pos: new Vector3(0, 0, 6),
    alive: true,
    radius: 0.5,
    aimHeight: 1.5,
    hp: PLAYER_HP,
    vy: 0,
    yaw: Math.PI,
    pitch: 0,
    hurt: (amount, from) => this.hurtPlayer(amount, from),
  }
  private readonly vel = new Vector3()
  private bob = 0
  private stepT = 0
  private weapon = 0
  private ammo = WEAPONS.map((w) => ({ mag: w.mag, reserve: w.reserve }))
  private grenadeCount = GRENADES
  private fireT = 0
  private reloadT = 0
  private kick = 0
  private readonly guns: Group[] = []
  private readonly muzzleFlash: Mesh
  private flashT = 0

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, base: string) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.world = buildWorld()
    this.fx = new Fx(this.world.scene)
    this.audio = new Audio(base)
    this.input = new Input(canvas, ui)
    this.input.onTouchMode = () => this.hud.touchMode()
    this.input.onUnlock = () => {
      if (this.mode === 'playing') this.setMode('paused')
    }
    this.world.scene.add(this.camera)
    this.muzzleFlash = new Mesh(new SphereGeometry(0.09, 6, 5), new MeshBasicMaterial({ color: 0xffd98a }))
    this.muzzleFlash.visible = false
    this.buildGuns()
    window.addEventListener('resize', () => this.resize())
    this.resize()
    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - this.lastNow) / 1000)
      this.lastNow = now
      this.tick(dt)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame((now) => {
      this.lastNow = now
      requestAnimationFrame(tick)
    })
  }
  private lastNow = 0

  private resize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private buildGuns(): void {
    const steel = new MeshLambertMaterial({ color: 0x3d4438 })
    const dark = new MeshLambertMaterial({ color: 0x1c1f1a })
    const bone = new MeshLambertMaterial({ color: 0xcfc8b6 })
    const rep = new Group()
    const body = new Mesh(new BoxGeometry(0.11, 0.14, 0.62), steel)
    const shroud = new Mesh(new BoxGeometry(0.13, 0.1, 0.3), bone)
    shroud.position.set(0, 0.02, -0.38)
    for (const s of [-1, 1]) {
      const barrel = new Mesh(new CylinderGeometry(0.018, 0.018, 0.5, 6), dark)
      barrel.rotation.x = Math.PI / 2
      barrel.position.set(s * 0.03, 0.02, -0.6)
      rep.add(barrel)
    }
    const magz = new Mesh(new BoxGeometry(0.07, 0.2, 0.1), dark)
    magz.position.set(0, -0.15, -0.05)
    rep.add(body, shroud, magz)
    const sc = new Group()
    const sbody = new Mesh(new BoxGeometry(0.1, 0.12, 0.5), steel)
    const tube = new Mesh(new CylinderGeometry(0.045, 0.045, 0.7, 8), dark)
    tube.rotation.x = Math.PI / 2
    tube.position.set(0, 0.03, -0.5)
    const pump = new Mesh(new BoxGeometry(0.12, 0.08, 0.2), bone)
    pump.position.set(0, -0.04, -0.4)
    sc.add(sbody, tube, pump)
    for (const g of [rep, sc]) {
      g.scale.setScalar(0.62)
      g.position.set(0.2, -0.2, -0.6)
      this.camera.add(g)
      this.guns.push(g)
    }
    sc.visible = false
    this.muzzleFlash.position.set(0.2, -0.185, -1.12)
    this.camera.add(this.muzzleFlash)
  }

  // ---------- modes ----------

  setMode(m: Mode): void {
    this.mode = m
    this.hud.show(m === 'playing' || m === 'paused')
    this.onMode?.(m)
  }

  /** Start a mission: fresh, or from a save. */
  start(difficulty: Difficulty, save?: SaveData): void {
    for (const b of this.bugs) this.world.scene.remove(b.rig.root)
    for (const w of this.wardens) this.world.scene.remove(w.figure)
    for (const g of this.globs) this.world.scene.remove(g.mesh)
    for (const g of this.grenades) this.world.scene.remove(g.mesh)
    this.bugs = []
    this.globs = []
    this.grenades = []
    this.difficulty = save ? save.difficulty : difficulty
    this.seed = (Date.now() % 100000) + 1
    this.score = save?.score ?? 0
    this.kills = save?.kills ?? 0
    this.severed = save?.severed ?? 0
    const p = this.player
    p.pos.set(0, 0, 6)
    p.yaw = Math.PI
    p.pitch = 0
    p.vy = 0
    p.hp = save?.player.hp ?? PLAYER_HP
    p.alive = true
    this.vel.set(0, 0, 0)
    this.weapon = 0
    this.ammo = WEAPONS.map((w) => ({ mag: save?.player.ammo[w.id]?.mag ?? w.mag, reserve: save?.player.ammo[w.id]?.reserve ?? w.reserve }))
    this.grenadeCount = save?.player.grenades ?? GRENADES
    this.reloadT = 0
    this.fireT = 0
    this.showGun()
    const sctx = this.squadCtx()
    this.wardens = SQUAD.map((def, i) => {
      const w = new Warden(def, this.models.figure(def.model), this.world.posts[i] as Vector3)
      w.ctx = sctx
      this.world.scene.add(w.figure)
      if (save) w.restore(save.squad[def.id] ?? 0)
      return w
    })
    this.world.dropship.visible = false
    this.hud.squad(this.wardens)
    this.setMode('playing')
    this.intermission(save?.wave ?? 0, !save)
  }

  private snapshot(): SaveData {
    const ammo: SaveData['player']['ammo'] = {}
    WEAPONS.forEach((w, i) => (ammo[w.id] = { ...(this.ammo[i] as { mag: number; reserve: number }) }))
    const squad: Record<string, number> = {}
    for (const w of this.wardens) squad[w.def.id] = w.hp
    return {
      v: SAVE_VERSION, savedAt: Date.now(), difficulty: this.difficulty, wave: this.wave, score: this.score, kills: this.kills, severed: this.severed,
      player: { hp: this.player.hp, grenades: this.grenadeCount, ammo }, squad,
    }
  }

  private intermission(wave: number, fresh: boolean): void {
    this.wave = wave
    this.phase = 'intermission'
    this.phaseT = wave === 0 ? 6 : 9
    if (wave > 0 && fresh) {
      this.player.hp = Math.min(PLAYER_HP, this.player.hp + 40)
      this.ammo.forEach((a, i) => (a.reserve = (WEAPONS[i] as WeaponDef).reserve))
      this.grenadeCount = GRENADES
      this.hud.feed('Resupplied: suit patched, ammunition and grenades full')
    }
    this.storageError = writeSave(localStorage, this.snapshot())
    this.hud.notice(this.storageError)
    const def = WAVES[wave] as (typeof WAVES)[number]
    this.hud.banner(`WAVE ${wave + 1}: ${def.title.toUpperCase()}`, def.brief, 7)
    this.audio.setMusic('tense')
    const alive = this.wardens.filter((w) => w.alive)
    const who = alive[Math.floor(Math.random() * alive.length)]
    if (who) this.audio.voice(`${who.def.id}-watch-set`)
  }

  private beginWave(): void {
    this.phase = 'wave'
    this.queue = waveQueue(this.wave, this.difficulty, this.seed)
    this.spawnT = 0
    this.audio.play('alarm')
    this.audio.play('wave')
    this.audio.setMusic(this.wave === WAVES.length - 1 ? 'alarm' : 'battle')
    const alive = this.wardens.filter((w) => w.alive)
    const who = alive[Math.floor(Math.random() * alive.length)]
    if (who) this.audio.voice(`${who.def.id}-revealed`)
  }

  private beginExtract(): void {
    this.phase = 'extract'
    this.shipT = 0
    this.spawnT = 4
    this.world.dropship.visible = true
    this.hud.banner('THE LIFTER IS INBOUND', 'The Augur is dead. Get to the landing pad through the east gate.', 8)
    this.audio.setMusic('battle')
  }

  private finish(won: boolean): void {
    this.player.alive = won
    this.input.unlock()
    this.audio.setMusic(won ? 'victory' : 'defeat')
    this.audio.play(won ? 'win' : 'loss')
    if (won) clearSave(localStorage)
    this.setMode(won ? 'won' : 'dead')
  }

  // ---------- spawning ----------

  spawn(caste: CasteId, at?: Vector3): Bug {
    let p = at
    if (!p) {
      if (CASTES[caste].flies) {
        const a = Math.random() * Math.PI * 2
        p = new Vector3(Math.cos(a) * 110, 30, Math.sin(a) * 110)
      } else {
        const b = BURROWS[Math.floor(Math.random() * BURROWS.length)] as Vector3
        p = new Vector3(b.x + (Math.random() - 0.5) * 5, 0, b.z + (Math.random() - 0.5) * 5)
        p.y = groundAt(p.x, p.z)
      }
    }
    const bug = new Bug(caste, p, this.models.bugRig(caste))
    bug.yaw = Math.atan2(-p.x, -p.z)
    this.world.scene.add(bug.rig.root)
    this.bugs.push(bug)
    this.audio.play('screech', bug.pos.distanceTo(this.player.pos) * 0.4, 1.2)
    return bug
  }

  // ---------- damage ----------

  /** The one place a bug is hurt: the sim decides, this shows it. */
  damageBug(bug: Bug, partId: string, amount: number, point: Vector3, dir: Vector3, byPlayer: boolean): void {
    const res = applyDamage(bug.state, partId, amount)
    if (res.wasted) return
    this.fx.burst(point, ICHOR, 5, 4, dir.clone().negate(), 1, 0.5)
    const far = point.distanceTo(this.player.pos)
    this.audio.play('hit', far, 0.05)
    if (byPlayer) this.hud.hitMarker(res.severed.length > 0)
    for (const id of res.severed) {
      const def = partDef(bug.state, id)
      const obj = bug.detach(id)
      if (obj) {
        this.fx.burst(point, ICHOR, 26, 7, undefined, 1, 1.1)
        this.fx.tearOff(obj, dir, ICHOR, bug.caste.radius > 2 ? 0.7 : 1)
      }
      this.severed++
      this.score += 25
      if (def) this.hud.feed(`${bug.caste.name}: ${def.label} off`, 'sever')
      if (bug.caste.id === 'augur' && !abilities(bug.state).link && bug.state.alive && def?.kind === 'feeler') {
        this.hud.banner('THE LINK IS CUT', 'The swarm has lost the Augur\'s push.', 4)
      }
    }
    if (res.killed) this.killed(bug, dir)
  }

  private killed(bug: Bug, dir: Vector3): void {
    bug.die()
    this.kills++
    this.score += bug.caste.score
    this.hud.feed(`${bug.caste.name} down`, 'kill')
    this.audio.play('death', bug.pos.distanceTo(this.player.pos), 0.1)
    const at = bug.pos.clone().setY(bug.pos.y + 1)
    this.fx.burst(at, ICHOR, 40, 8, undefined, 1, 1.2)
    this.fx.stain(bug.pos.x, bug.pos.z, ICHOR, bug.caste.radius * 1.6)
    // a dying bug comes apart a little more
    const loose = [...bug.rig.parts.keys()].filter((id) => id !== 'core')
    for (let i = 0; i < 2 && loose.length > 0; i++) {
      const id = loose.splice(Math.floor(Math.random() * loose.length), 1)[0] as string
      const obj = bug.detach(id)
      if (obj) this.fx.tearOff(obj, dir, ICHOR, 0.8)
    }
    for (const m of bug.rig.hit) m.userData.bug = null
    bug.rig.hit = []
    if (bug.caste.id === 'augur') {
      // the swarm loses its mind with it
      for (const o of this.bugs) if (o.alive && o !== bug) o.state.headlessLeft = 1.5 + Math.random() * 4
      this.queue = []
      this.hud.banner('THE AUGUR IS DEAD', 'The swarm is coming apart.', 5)
    }
  }

  private hurtPlayer(amount: number, _from: Vector3): void {
    const p = this.player
    if (!p.alive || this.god || this.mode !== 'playing') return
    p.hp = Math.max(0, p.hp - amount)
    this.hud.hurt()
    this.audio.play('hurt', 0, 0.3)
    if (p.hp === 0) {
      p.alive = false
      this.finish(false)
    }
  }

  private squadCtx(): SquadCtx {
    const dir = new Vector3()
    const at = new Vector3()
    return {
      bugs: this.bugs,
      shoot: (w, bug, part, damage, from, hit) => {
        bug.partPoint(part, at)
        dir.copy(at).sub(from).normalize()
        if (!hit) at.addScaledVector(dir, 20).add(new Vector3(Math.random() * 4 - 2, Math.random() * 3, Math.random() * 4 - 2))
        if (w.def.weapon !== 'scorcher') {
          this.fx.tracer(from, at)
          this.audio.play('shot', from.distanceTo(this.player.pos) + 8, 0.06)
        }
        if (hit) this.damageBug(bug, part, damage, at, dir, false)
      },
      flame: (from, d) => {
        this.fx.burst(from, 0xff8a1e, 5, 15, d, -0.05, 0.55)
        this.fx.burst(from, 0xffd24a, 2, 13, d, -0.05, 0.4)
        this.audio.play('scorch', from.distanceTo(this.player.pos), 0.9)
        if (Math.random() < 0.004) this.audio.voice('riedel-scorched')
      },
      wounded: (w, amount) => {
        const p = w.pos.clone().setY(1.2)
        this.fx.burst(p, BLOOD, 6 + Math.min(14, amount), 4, undefined, 1, 0.7)
        if (Math.random() < 0.3) this.fx.stain(w.pos.x + Math.random() - 0.5, w.pos.z + Math.random() - 0.5, BLOOD, 0.5)
        if (w.hp > 0 && w.hp < 60 && w.hp + amount >= 60) this.audio.voice(`${w.def.id}-breached`)
        this.hud.squad(this.wardens)
      },
      fell: (w) => {
        this.fx.burst(w.pos.clone().setY(1.1), BLOOD, 40, 6, undefined, 1, 1.2)
        this.fx.stain(w.pos.x, w.pos.z, BLOOD, 1.5)
        this.audio.play('down', w.pos.distanceTo(this.player.pos) * 0.5)
        this.hud.feed(`${w.def.rank} ${w.def.name} is down`, 'bad')
        this.hud.squad(this.wardens)
      },
    }
  }

  private bugCtx(): BugCtx {
    const targets: Target[] = [this.player, ...this.wardens]
    return {
      time: this.time,
      targets,
      bugs: this.bugs,
      linked: this.bugs.some((b) => abilities(b.state).link),
      damageScale: DIFFICULTIES[this.difficulty].damage,
      lob: (from, at, damage) => {
        const mesh = new Mesh(new SphereGeometry(0.28, 8, 6), new MeshBasicMaterial({ color: ICHOR }))
        mesh.position.copy(from)
        const to = new Vector3(at.pos.x, at.pos.y, at.pos.z)
        const T = Math.min(2.2, Math.max(0.9, from.distanceTo(to) / 22))
        const vel = to.sub(from).divideScalar(T)
        vel.y += 0.5 * G * T
        this.world.scene.add(mesh)
        this.globs.push({ mesh, vel, damage })
        this.audio.play('spit', from.distanceTo(this.player.pos), 0.2)
      },
      spray: (from, dir, damage, range) => {
        this.fx.burst(from, ICHOR, 7, 15, dir, 0.25, 0.6)
        this.audio.play('spit', from.distanceTo(this.player.pos), 0.3)
        const v = new Vector3()
        for (const t of targets) {
          if (!t.alive) continue
          v.set(t.pos.x - from.x, t.pos.y + t.aimHeight * 0.7 - from.y, t.pos.z - from.z)
          const d = v.length()
          if (d < range && v.angleTo(dir) < 0.38) t.hurt(damage, from)
        }
      },
      strikeSound: (at) => this.audio.play('claw', at.distanceTo(this.player.pos), 0.12),
      died: (bug) => this.killed(bug, new Vector3(0, 1, 0)),
    }
  }

  // ---------- weapons ----------

  private showGun(): void {
    this.guns.forEach((g, i) => (g.visible = i === this.weapon))
  }

  private swap(to?: number): void {
    const next = to ?? (this.weapon + 1) % WEAPONS.length
    if (next === this.weapon) return
    this.weapon = next
    this.reloadT = 0
    this.fireT = 0.25
    this.showGun()
    this.audio.play('swap')
  }

  private reload(): void {
    const w = WEAPONS[this.weapon] as WeaponDef
    const a = this.ammo[this.weapon] as { mag: number; reserve: number }
    if (this.reloadT > 0 || a.mag >= w.mag || a.reserve <= 0) return
    this.reloadT = w.reload
    this.audio.play('reload')
  }

  /** Distance along a ray to the ground, or Infinity. */
  private groundHit(from: Vector3, dir: Vector3, max: number): number {
    let prev = 0
    for (let d = 1; d <= max; d += d < 30 ? 1 : 3) {
      const y = from.y + dir.y * d
      if (y <= groundAt(from.x + dir.x * d, from.z + dir.z * d)) {
        let lo = prev
        let hi = d
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2
          if (from.y + dir.y * mid <= groundAt(from.x + dir.x * mid, from.z + dir.z * mid)) hi = mid
          else lo = mid
        }
        return hi
      }
      prev = d
    }
    return Infinity
  }

  private hitList(): Mesh[] {
    const list: Mesh[] = []
    for (const b of this.bugs) if (b.alive) for (const m of b.rig.hit) list.push(m)
    return list
  }

  /** Fire the current weapon along the view. `spread` false is a perfect shot (tests). */
  fire(spread = true): void {
    const w = WEAPONS[this.weapon] as WeaponDef
    const a = this.ammo[this.weapon] as { mag: number; reserve: number }
    if (a.mag <= 0) {
      this.audio.play('empty', 0, 0.3)
      this.reload()
      return
    }
    a.mag--
    this.fireT = w.rate
    this.kick = Math.min(1, this.kick + (w.pellets > 1 ? 1 : 0.35))
    this.flashT = 0.045
    this.audio.play('shot')
    this.world.scene.updateMatrixWorld()
    const origin = this.camera.getWorldPosition(new Vector3())
    const fwd = this.camera.getWorldDirection(new Vector3())
    const right = new Vector3().crossVectors(fwd, this.camera.up).normalize()
    const up = new Vector3().crossVectors(right, fwd)
    const muzzle = this.muzzleFlash.getWorldPosition(new Vector3())
    const list = this.hitList()
    const dir = new Vector3()
    for (let i = 0; i < w.pellets; i++) {
      dir.copy(fwd)
      if (spread) {
        const r = Math.sqrt(Math.random()) * w.spread
        const t = Math.random() * Math.PI * 2
        dir.addScaledVector(right, Math.cos(t) * r).addScaledVector(up, Math.sin(t) * r).normalize()
      }
      this.ray.set(origin, dir)
      this.ray.far = 260
      const hit = this.ray.intersectObjects(list, false)[0]
      const gd = this.groundHit(origin, dir, 260)
      let end: Vector3
      if (hit && hit.distance < gd) {
        end = hit.point
        const bug = hit.object.userData.bug as Bug | null
        if (bug) this.damageBug(bug, hit.object.userData.partId as string, w.damage, hit.point, dir.clone(), true)
      } else if (gd < Infinity) {
        end = origin.clone().addScaledVector(dir, gd)
        this.fx.burst(end, 0xc98a5e, 4, 2.5, undefined, 0.4, 0.5)
      } else end = origin.clone().addScaledVector(dir, 200)
      if (i % 3 === 0) this.fx.tracer(muzzle, end)
    }
    if (a.mag === 0) this.reload()
  }

  throwGrenade(): void {
    if (this.grenadeCount <= 0) {
      this.audio.play('empty', 0, 0.3)
      return
    }
    this.grenadeCount--
    const mesh = new Mesh(new SphereGeometry(0.14, 8, 6), new MeshLambertMaterial({ color: 0x2c3327, emissive: 0xe2472b, emissiveIntensity: 0.6 }))
    const fwd = this.camera.getWorldDirection(new Vector3())
    mesh.position.copy(this.camera.getWorldPosition(new Vector3())).addScaledVector(fwd, 0.6)
    const vel = fwd.multiplyScalar(24)
    vel.y += 5
    this.world.scene.add(mesh)
    this.grenades.push({ mesh, vel, fuse: 2.6 })
    this.audio.play('swap')
  }

  /** A blast: every part in reach takes damage by distance; plates soak the core's share. */
  explode(at: Vector3): void {
    this.world.scene.updateMatrixWorld() // part positions must be this frame's
    this.fx.flash(at, BLAST_RADIUS * 0.9)
    this.fx.burst(at, 0xffa53a, 50, 16, undefined, 0.6, 0.7)
    this.fx.burst(at, 0x4a3a30, 40, 7, undefined, -0.1, 1.6)
    this.audio.play('blast', at.distanceTo(this.player.pos) * 0.5)
    const p = new Vector3()
    const dir = new Vector3()
    for (const bug of this.bugs) {
      if (!bug.alive || bug.pos.distanceTo(at) > BLAST_RADIUS + bug.caste.radius + 3) continue
      for (const def of bug.caste.parts) {
        if (!bug.alive) break
        if ((bug.state.hp[def.id] ?? 0) <= 0) continue
        bug.partPoint(def.id, p)
        const d = Math.max(0, p.distanceTo(at) - (def.kind === 'core' ? bug.caste.radius * 0.6 : 0))
        if (d >= BLAST_RADIUS) continue
        let dmg = BLAST_DAMAGE * (1 - d / BLAST_RADIUS)
        if (def.kind === 'core') dmg *= blastCoreShare(bug.state)
        dir.copy(p).sub(at).normalize()
        this.damageBug(bug, def.id, dmg, p.clone(), dir.clone(), true)
      }
    }
    const pd = this.player.pos.distanceTo(at)
    if (pd < 5) this.hurtPlayer(40 * (1 - pd / 5), at)
  }

  // ---------- the frame ----------

  private tick(dt: number): void {
    this.frame++
    const inp = this.input.frame()
    if (inp.pressed.mute) this.audio.toggleMute()
    if (this.mode === 'playing') {
      if (inp.pressed.pause) {
        this.input.unlock()
        this.setMode('paused')
      } else this.step(dt, inp.lookX, inp.lookY, inp.pressed)
    } else if (this.mode === 'title') {
      // the bulletin's backdrop: a slow pass around the outpost
      this.time += dt
      const a = this.time * 0.07
      this.camera.position.set(Math.cos(a) * 34, 9, Math.sin(a) * 34)
      this.camera.lookAt(0, 3, 0)
      this.guns.forEach((g) => (g.visible = false))
      this.world.update(this.time)
    }
    this.fx.update(this.mode === 'paused' ? 0 : dt, this.camera.position)
    this.renderer.render(this.world.scene, this.camera)
  }

  private step(dt: number, lookX: number, lookY: number, pressed: Actions): void {
    this.time += dt
    const p = this.player
    const sens = this.input.touch ? 0.0032 : 0.0022
    p.yaw -= lookX * sens
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - lookY * sens))

    // movement
    const sprint = this.input.held.sprint && this.input.move.y > 0
    const speed = sprint ? 10.5 : 6.5
    const mx = this.input.move.x
    const my = this.input.move.y
    const ml = Math.hypot(mx, my) || 1
    const fx = -Math.sin(p.yaw)
    const fz = -Math.cos(p.yaw)
    const wantX = ((fx * my + -fz * mx) / Math.max(1, ml)) * speed
    const wantZ = ((fz * my + fx * mx) / Math.max(1, ml)) * speed
    const k = Math.min(1, dt * 12)
    this.vel.x += (wantX - this.vel.x) * k
    this.vel.z += (wantZ - this.vel.z) * k
    p.pos.x += this.vel.x * dt
    p.pos.z += this.vel.z * dt
    this.collide()
    const floor = groundAt(p.pos.x, p.pos.z)
    const onGround = p.pos.y <= floor + 0.02
    if (onGround) {
      p.pos.y = floor
      p.vy = 0
      if (pressed.jump) p.vy = 7.2
    }
    if (p.vy !== 0 || !onGround) {
      p.vy -= G * dt
      p.pos.y = Math.max(floor, p.pos.y + p.vy * dt)
    }
    const moving = Math.hypot(this.vel.x, this.vel.z)
    if (onGround && moving > 1) {
      this.bob += dt * moving * 1.5
      this.stepT -= dt * moving
      if (this.stepT <= 0) {
        this.stepT = 4.2
        this.audio.play('step')
      }
    }
    this.kick = Math.max(0, this.kick - dt * 6)
    this.camera.position.set(p.pos.x, p.pos.y + EYE + Math.sin(this.bob) * 0.04, p.pos.z)
    this.camera.rotation.set(p.pitch + this.kick * 0.02, p.yaw, 0, 'YXZ')
    const gun = this.guns[this.weapon] as Group
    gun.position.set(0.2 + Math.cos(this.bob * 0.5) * 0.006, -0.2 + Math.sin(this.bob) * 0.006 - (this.reloadT > 0 ? 0.1 : 0), -0.6 + this.kick * 0.05)
    gun.rotation.x = this.kick * 0.1 - (this.reloadT > 0 ? 0.5 : 0)

    // weapons
    this.fireT -= dt
    if (this.reloadT > 0) {
      this.reloadT -= dt
      if (this.reloadT <= 0) {
        const w = WEAPONS[this.weapon] as WeaponDef
        const a = this.ammo[this.weapon] as { mag: number; reserve: number }
        const take = Math.min(w.mag - a.mag, a.reserve)
        a.mag += take
        a.reserve -= take
      }
    }
    if (pressed.reload) this.reload()
    if (pressed.swap) this.swap()
    if (pressed.weapon1) this.swap(0)
    if (pressed.weapon2) this.swap(1)
    if (pressed.grenade) this.throwGrenade()
    if (this.input.held.fire && this.fireT <= 0 && this.reloadT <= 0) this.fire()
    this.flashT -= dt
    this.muzzleFlash.visible = this.flashT > 0

    // the mission
    const cap = DIFFICULTIES[this.difficulty].cap
    const aliveBugs = this.bugs.reduce((n, b) => n + (b.alive ? 1 : 0), 0)
    if (this.phase === 'intermission') {
      this.phaseT -= dt
      if (this.phaseT <= 0) this.beginWave()
    } else if (this.phase === 'wave') {
      this.spawnT -= dt
      if (this.queue.length > 0 && this.spawnT <= 0 && aliveBugs < cap) {
        this.spawn(this.queue.shift() as CasteId)
        this.spawnT = (WAVES[this.wave] as (typeof WAVES)[number]).interval
      }
      if (this.queue.length === 0 && aliveBugs === 0) {
        if (this.wave + 1 < WAVES.length) {
          this.hud.feed(`Wave ${this.wave + 1} cleared`, 'kill')
          this.intermission(this.wave + 1, true)
        } else this.beginExtract()
      }
    } else {
      this.shipT += dt
      this.spawnT -= dt
      if (this.spawnT <= 0 && aliveBugs < 6) {
        this.spawn('reaver')
        this.spawnT = 3
      }
      const ship = this.world.dropship
      const u = Math.min(1, this.shipT / 14)
      const e = 1 - (1 - u) ** 3
      ship.position.set(PAD.x + (1 - e) * 260, (1 - e) * 90 + (u < 1 ? 0.5 : 0), PAD.z - (1 - e) * 140)
      ship.rotation.y = Math.PI + (1 - e) * 0.6
      ship.traverse((o) => {
        if (o.name === 'jet') o.visible = u < 1 && Math.sin(this.time * 40) > -0.6
      })
      if (u < 1 && this.frame % 20 === 0) this.audio.play('lifter', ship.position.distanceTo(p.pos) * 0.3, 3)
      if (u >= 1 && Math.hypot(p.pos.x - PAD.x, p.pos.z - PAD.z) < PAD_RADIUS) {
        this.finish(true)
        return
      }
    }

    // actors
    const bctx = this.bugCtx()
    for (const b of this.bugs) b.update(dt, bctx)
    if (this.frame % 30 === 0) {
      const near = this.bugs.find((b) => b.alive && b.pos.distanceToSquared(p.pos) < 900)
      if (near) this.audio.play('skitter', near.pos.distanceTo(p.pos), 0.8)
    }
    for (let i = this.bugs.length - 1; i >= 0; i--) {
      const b = this.bugs[i] as Bug
      if (!b.removed) continue
      this.world.scene.remove(b.rig.root)
      disposeObject(b.rig.root)
      this.bugs.splice(i, 1)
    }
    const sctx = this.squadCtx()
    for (const w of this.wardens) w.update(dt, sctx)
    this.projectiles(dt)
    this.world.update(this.time)
    this.drawHud(dt, aliveBugs)
  }

  private collide(): void {
    const p = this.player.pos
    const r = this.player.radius
    for (const b of this.world.blockers) {
      const cx = Math.max(b.minX, Math.min(b.maxX, p.x))
      const cz = Math.max(b.minZ, Math.min(b.maxZ, p.z))
      const dx = p.x - cx
      const dz = p.z - cz
      const d2 = dx * dx + dz * dz
      if (d2 >= r * r) continue
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2)
        p.x += (dx / d) * (r - d)
        p.z += (dz / d) * (r - d)
      } else {
        // inside the box: leave by the nearest face
        const l = p.x - b.minX
        const rr = b.maxX - p.x
        const t = p.z - b.minZ
        const bt = b.maxZ - p.z
        const m = Math.min(l, rr, t, bt)
        if (m === l) p.x = b.minX - r
        else if (m === rr) p.x = b.maxX + r
        else if (m === t) p.z = b.minZ - r
        else p.z = b.maxZ + r
      }
    }
    for (const w of this.wardens) {
      const dx = p.x - w.pos.x
      const dz = p.z - w.pos.z
      const d = Math.hypot(dx, dz)
      const min = r + w.radius
      if (d < min && d > 1e-4) {
        p.x += (dx / d) * (min - d)
        p.z += (dz / d) * (min - d)
      }
    }
    const d = Math.hypot(p.x, p.z)
    if (d > ARENA_RADIUS) {
      p.x *= ARENA_RADIUS / d
      p.z *= ARENA_RADIUS / d
    }
  }

  private projectiles(dt: number): void {
    const targets: Target[] = [this.player, ...this.wardens]
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const g = this.globs[i] as Glob
      g.vel.y -= G * dt
      g.mesh.position.addScaledVector(g.vel, dt)
      const m = g.mesh.position
      if (this.frame % 2 === 0) this.fx.burst(m, ICHOR, 1, 0.6, undefined, 0.3, 0.4)
      if (m.y > groundAt(m.x, m.z)) continue
      this.fx.burst(m, ICHOR, 30, 7, undefined, 1, 0.9)
      this.fx.stain(m.x, m.z, ICHOR, 1.8)
      this.audio.play('hit', m.distanceTo(this.player.pos), 0.05)
      for (const t of targets) {
        const d = Math.hypot(t.pos.x - m.x, t.pos.z - m.z)
        if (t.alive && d < 3.2) t.hurt(g.damage * (1 - (d / 3.2) * 0.6), m)
      }
      this.world.scene.remove(g.mesh)
      g.mesh.geometry.dispose()
      this.globs.splice(i, 1)
    }
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i] as Grenade
      g.vel.y -= G * dt
      g.mesh.position.addScaledVector(g.vel, dt)
      g.fuse -= dt
      const m = g.mesh.position
      const floor = groundAt(m.x, m.z) + 0.14
      let boom = g.fuse <= 0
      if (m.y <= floor) {
        m.y = floor
        boom = true
      }
      if (!boom) for (const b of this.bugs) if (b.alive && b.pos.distanceTo(m) < b.caste.radius + 0.6) boom = true
      if (!boom) continue
      this.explode(m.clone().setY(m.y + 0.4))
      this.world.scene.remove(g.mesh)
      g.mesh.geometry.dispose()
      this.grenades.splice(i, 1)
    }
  }

  /** What the reticle is on: the sim's readout of that part, or null. */
  reticle(): { bug: Bug; partId: string } | null {
    this.ray.set(this.camera.getWorldPosition(new Vector3()), this.camera.getWorldDirection(new Vector3()))
    this.ray.far = 200
    const hit = this.ray.intersectObjects(this.hitList(), false)[0]
    const bug = hit?.object.userData.bug as Bug | null | undefined
    return hit && bug ? { bug, partId: hit.object.userData.partId as string } : null
  }

  private drawHud(dt: number, aliveBugs: number): void {
    const p = this.player
    this.hud.tick(dt)
    if (this.frame % 3 === 0) {
      const r = this.reticle()
      this.hud.target(r ? partReadout(r.bug.state, r.partId) : null)
    }
    if (this.frame % 6 !== 0) return
    const w = WEAPONS[this.weapon] as WeaponDef
    const a = this.ammo[this.weapon] as { mag: number; reserve: number }
    this.hud.vitals(p.hp, PLAYER_HP)
    this.hud.ammo(w.name, a.mag, a.reserve, this.reloadT > 0, this.grenadeCount, a.mag <= w.mag * 0.2)
    const left = aliveBugs + this.queue.length
    this.hud.top(
      `WAVE ${this.wave + 1}/${WAVES.length}`,
      this.phase === 'wave' ? `MOLT ${left}` : this.phase === 'intermission' ? `CONTACT IN ${Math.ceil(this.phaseT)}` : 'EXTRACT',
      this.score,
    )
    const linked = this.bugs.some((b) => abilities(b.state).link)
    let obj = this.phase === 'intermission' ? 'Hold the outpost. Reload and pick your ground.' : 'Hold the outpost.'
    if (linked) obj = 'An Augur is linked to the swarm: every Molt is faster. Shoot its feelers off.'
    if (this.phase === 'extract') {
      const d = Math.hypot(p.pos.x - PAD.x, p.pos.z - PAD.z)
      obj = this.shipT < 14 ? `Lifter inbound. Landing pad ${Math.round(d)} m (yellow square on the scope).` : `The lifter is down. Board it: ${Math.round(d)} m.`
    }
    this.hud.objective(obj)
    this.hud.squad(this.wardens)
    // the scope: ahead is up
    const dots: RadarDot[] = []
    const sin = Math.sin(p.yaw)
    const cos = Math.cos(p.yaw)
    const rel = (x: number, z: number, kind: RadarDot['kind']): void => {
      const dx = x - p.pos.x
      const dz = z - p.pos.z
      dots.push({ x: dx * cos - dz * sin, y: -dx * sin - dz * cos, kind })
    }
    for (const b of this.bugs) if (b.alive) rel(b.pos.x, b.pos.z, b.caste.radius > 2 ? 'big' : 'molt')
    for (const wd of this.wardens) if (wd.alive) rel(wd.pos.x, wd.pos.z, 'warden')
    if (this.phase === 'extract') rel(PAD.x, PAD.z, 'pad')
    this.hud.drawRadar(dots, 70)
  }

  /** For the title screen and the retry button. */
  loadSave(): ReturnType<typeof readSave> {
    return readSave(localStorage)
  }
  discardSave(): void {
    clearSave(localStorage)
  }

  // ---------- test and debug surface ----------

  /** Turn the view to a part of a bug. Returns false if the bug no longer has it. */
  aimAt(bug: Bug, partId: string): boolean {
    if (!bug.rig.parts.has(partId)) return false
    this.world.scene.updateMatrixWorld()
    const at = bug.partPoint(partId, new Vector3())
    const eye = new Vector3(this.player.pos.x, this.player.pos.y + EYE, this.player.pos.z)
    const d = at.sub(eye)
    this.player.yaw = Math.atan2(-d.x, -d.z)
    this.player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
    this.camera.position.copy(eye)
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ')
    this.camera.updateMatrixWorld()
    return true
  }
  skipToWave(i: number): void {
    for (const b of this.bugs) this.world.scene.remove(b.rig.root)
    this.bugs.length = 0
    this.queue = []
    this.intermission(Math.max(0, Math.min(WAVES.length - 1, i)), true)
  }
  refill(): void {
    this.ammo.forEach((a, i) => {
      a.mag = (WEAPONS[i] as WeaponDef).mag
      a.reserve = (WEAPONS[i] as WeaponDef).reserve
    })
    this.reloadT = 0
  }
}
