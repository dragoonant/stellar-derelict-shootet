// The visor. It only draws what it is handed: every number comes from the sim (KB rule 8).
import { WARDEN_HP, type Warden } from './squad'

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el as T
}

export interface RadarDot {
  /** metres right of the player and ahead of the player */
  x: number
  y: number
  kind: 'molt' | 'big' | 'warden' | 'pad'
}

export class Hud {
  readonly root = $('hud')
  private readonly els = {
    cross: $('crosshair'), hit: $('hitmark'), target: $('target'), tName: $('target-name'), tBar: $('target-bar'), tHp: $('target-hp'),
    wave: $('wave'), count: $('count'), score: $('score'), objective: $('objective'), banner: $('banner'), bTitle: $('banner-title'),
    bBrief: $('banner-brief'), feed: $('feed'), squad: $('squad'), hpBar: $('hp-bar'), hp: $('hp'), weapon: $('weapon'), rounds: $('rounds'),
    grenades: $('grenades'), vignette: $('vignette'), notice: $('notice'), touch: $('touch'),
  }
  private readonly radar = $<HTMLCanvasElement>('radar').getContext('2d')
  private hitT = 0
  private bannerT = 0
  private hurtT = 0
  private squadKey = ''

  show(on: boolean): void {
    this.root.hidden = !on
  }
  touchMode(): void {
    this.els.touch.hidden = false
    document.body.classList.add('touch')
  }

  target(t: { caste: string; part: string; hp: number; max: number } | null): void {
    this.els.target.hidden = !t
    this.els.cross.classList.toggle('on', !!t)
    if (!t) return
    this.els.tName.textContent = `${t.caste} / ${t.part}`
    this.els.tBar.style.width = `${(100 * t.hp) / t.max}%`
    this.els.tHp.textContent = `${t.hp} of ${t.max}`
  }

  top(wave: string, count: string, score: number): void {
    this.els.wave.textContent = wave
    this.els.count.textContent = count
    this.els.score.textContent = `SCORE ${score}`
  }
  objective(text: string): void {
    if (this.els.objective.textContent !== text) this.els.objective.textContent = text
  }

  banner(title: string, brief: string, seconds = 5): void {
    this.els.bTitle.textContent = title
    this.els.bBrief.textContent = brief
    this.els.banner.hidden = false
    this.bannerT = seconds
  }

  feed(text: string, cls: 'sever' | 'kill' | 'bad' | '' = ''): void {
    const d = document.createElement('div')
    d.textContent = text
    if (cls) d.className = cls
    this.els.feed.prepend(d)
    while (this.els.feed.childElementCount > 7) this.els.feed.lastElementChild?.remove()
    setTimeout(() => d.remove(), 4000)
  }

  hitMarker(sever: boolean): void {
    this.els.hit.classList.add('show')
    this.els.hit.classList.toggle('sever', sever)
    this.hitT = sever ? 0.25 : 0.08
  }

  hurt(): void {
    this.hurtT = 0.6
    this.els.vignette.style.transition = 'none'
    this.els.vignette.style.opacity = '1'
  }

  vitals(hp: number, max: number): void {
    this.els.hp.textContent = String(Math.ceil(hp))
    this.els.hpBar.style.width = `${(100 * hp) / max}%`
    this.els.hpBar.style.background = hp < max * 0.3 ? 'var(--alarm)' : 'var(--ok)'
    if (this.hurtT <= 0) this.els.vignette.style.opacity = hp < max * 0.3 ? '0.45' : '0'
  }

  ammo(name: string, mag: number, reserve: number, reloading: boolean, grenades: number, low: boolean): void {
    this.els.weapon.textContent = name
    this.els.rounds.innerHTML = reloading ? 'RELOADING' : `${mag} <small>/ ${reserve}</small>`
    this.els.rounds.classList.toggle('low', low && !reloading)
    this.els.grenades.textContent = `GRENADES ${grenades}`
  }

  squad(list: Warden[]): void {
    const key = list.map((w) => Math.ceil(w.hp / 5)).join(',')
    if (key === this.squadKey) return
    this.squadKey = key
    this.els.squad.replaceChildren(
      ...list.map((w) => {
        const row = document.createElement('div')
        const n = document.createElement('span')
        n.className = 'n' + (w.alive ? '' : ' dead')
        n.textContent = `${w.def.rank} ${w.def.name}`
        const bar = document.createElement('span')
        bar.className = 'bar'
        const fill = document.createElement('span')
        fill.style.width = `${(100 * w.hp) / WARDEN_HP}%`
        if (w.hp < WARDEN_HP * 0.35) fill.style.background = 'var(--alarm)'
        bar.append(fill)
        row.append(n, bar)
        return row
      }),
    )
  }

  notice(text: string | null): void {
    this.els.notice.hidden = !text
    if (text) this.els.notice.textContent = text
  }

  drawRadar(dots: RadarDot[], range: number): void {
    const g = this.radar
    if (!g) return
    const S = 132
    const c = S / 2
    g.clearRect(0, 0, S, S)
    g.strokeStyle = 'rgba(233,227,207,0.25)'
    g.beginPath()
    g.arc(c, c, c / 2, 0, 7)
    g.moveTo(c, 4)
    g.lineTo(c, S - 4)
    g.moveTo(4, c)
    g.lineTo(S - 4, c)
    g.stroke()
    for (const d of dots) {
      let x = d.x / range
      let y = d.y / range
      const l = Math.hypot(x, y)
      if (l > 0.94) {
        x *= 0.94 / l
        y *= 0.94 / l
      }
      g.fillStyle = d.kind === 'warden' ? '#7fd08a' : d.kind === 'pad' ? '#e2b714' : '#e2472b'
      const r = d.kind === 'big' ? 5 : d.kind === 'pad' ? 4 : 2.6
      g.beginPath()
      if (d.kind === 'pad') g.rect(c + x * c - r, c - y * c - r, r * 2, r * 2)
      else g.arc(c + x * c, c - y * c, r, 0, 7)
      g.fill()
    }
    g.fillStyle = '#e9e3cf'
    g.beginPath()
    g.moveTo(c, c - 6)
    g.lineTo(c + 4, c + 4)
    g.lineTo(c - 4, c + 4)
    g.fill()
  }

  tick(dt: number): void {
    if (this.hitT > 0) {
      this.hitT -= dt
      if (this.hitT <= 0) this.els.hit.classList.remove('show')
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt
      if (this.bannerT <= 0) this.els.banner.hidden = true
    }
    if (this.hurtT > 0) {
      this.hurtT -= dt
      if (this.hurtT <= 0) {
        this.els.vignette.style.transition = 'opacity 0.5s'
        this.els.vignette.style.opacity = '0'
      }
    }
  }
}

export { $ }
