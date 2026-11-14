// Sound: the effects, music and squad voices generated for Stellar Derelict, reused here. Not verified by ear in this
// game yet (KB rule 9). A missing or undecodable file is skipped with one console warning; nothing is synthesised.
const SFX: Record<string, string[]> = {
  shot: ['repeater-shot-1', 'repeater-shot-2', 'repeater-shot-3'],
  hit: ['repeater-hit-1', 'repeater-hit-2'],
  scorch: ['scorch-1', 'scorch-2'],
  claw: ['melee-hit-1', 'melee-hit-2', 'melee-hit-3'],
  blast: ['maul'],
  hurt: ['breach'],
  down: ['warden-down'],
  screech: ['stalker-screech-1', 'stalker-screech-2', 'stalker-screech-3'],
  death: ['stalker-death-1', 'stalker-death-2', 'stalker-death-3'],
  skitter: ['skitter-1', 'skitter-2', 'skitter-3'],
  step: ['footstep-1', 'footstep-2', 'footstep-3'],
  alarm: ['alarm'],
  lifter: ['purge'],
  reload: ['watch-set'],
  empty: ['ui-deny'],
  swap: ['ui-arm'],
  select: ['ui-select'],
  confirm: ['ui-confirm'],
  win: ['sting-win'],
  loss: ['sting-loss'],
  wave: ['phase-molt'],
  spit: ['vent'],
}
const GAIN: Record<string, number> = { shot: 0.5, hit: 0.5, step: 0.25, skitter: 0.3, screech: 0.5, death: 0.6, claw: 0.7, alarm: 0.5, lifter: 0.7, spit: 0.4 }
export type MusicState = 'title' | 'tense' | 'battle' | 'alarm' | 'victory' | 'defeat'
const MUTE_KEY = 'sds-bugfront-mute'

export class Audio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private readonly buffers = new Map<string, AudioBuffer | null>()
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>()
  private music: { state: MusicState; src: AudioBufferSourceNode; gain: GainNode } | null = null
  private wantMusic: MusicState | null = null
  private readonly last = new Map<string, number>()
  muted = false

  constructor(private readonly base: string) {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      /* storage refused: start unmuted */
    }
  }

  /** Browsers only start audio from a user gesture: call from the first click or tap. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const AC = window.AudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.master.connect(this.ctx.destination)
    for (const id of ['shot', 'hit', 'claw', 'death', 'screech']) for (const f of SFX[id] ?? []) void this.load('sfx/' + f)
    if (this.wantMusic) this.setMusic(this.wantMusic)
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0')
    } catch {
      /* not remembered */
    }
    return this.muted
  }

  private load(path: string): Promise<AudioBuffer | null> {
    const hit = this.loading.get(path)
    if (hit) return hit
    const job = (async (): Promise<AudioBuffer | null> => {
      try {
        const r = await fetch(`${this.base}assets/audio/${path}.mp3`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const buf = await (this.ctx as AudioContext).decodeAudioData(await r.arrayBuffer())
        this.buffers.set(path, buf)
        return buf
      } catch (e) {
        console.warn(`Bug Front: sound "${path}" did not load (${e instanceof Error ? e.message : String(e)})`)
        this.buffers.set(path, null)
        return null
      }
    })()
    this.loading.set(path, job)
    return job
  }

  private start(buf: AudioBuffer, gain: number, rate: number, loop: boolean): { src: AudioBufferSourceNode; gain: GainNode } | null {
    if (!this.ctx || !this.master) return null
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    src.loop = loop
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(g)
    g.connect(this.master)
    src.start()
    return { src, gain: g }
  }

  /** Play an effect. `distance` (metres) fades it; `gap` is the least time between two plays of the same id. */
  play(id: string, distance = 0, gap = 0): void {
    if (!this.ctx) return
    const files = SFX[id]
    if (!files) return
    const now = this.ctx.currentTime
    if (gap > 0 && now - (this.last.get(id) ?? -99) < gap) return
    this.last.set(id, now)
    const path = 'sfx/' + (files[Math.floor(Math.random() * files.length)] as string)
    const vol = (GAIN[id] ?? 0.6) / (1 + (distance / 18) ** 2)
    if (vol < 0.02) return
    const buf = this.buffers.get(path)
    if (buf) this.start(buf, vol, 0.94 + Math.random() * 0.12, false)
    else if (buf === undefined) void this.load(path).then((b) => b && this.start(b, vol, 1, false))
  }

  voice(id: string): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    if (now - (this.last.get('voice') ?? -99) < 3.5) return
    this.last.set('voice', now)
    void this.load('voice/' + id).then((b) => b && this.start(b, 0.9, 1, false))
  }

  setMusic(state: MusicState): void {
    this.wantMusic = state
    if (!this.ctx || this.music?.state === state) return
    const ctx = this.ctx
    void this.load('music/' + state).then((buf) => {
      if (!buf || this.wantMusic !== state || this.music?.state === state) return
      const old = this.music
      if (old) {
        old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
        old.src.stop(ctx.currentTime + 2)
      }
      const n = this.start(buf, 0, 1, state !== 'victory' && state !== 'defeat')
      if (!n) return
      n.gain.gain.setTargetAtTime(0.32, ctx.currentTime, 0.6)
      this.music = { state, ...n }
    })
  }
}
