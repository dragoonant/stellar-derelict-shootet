// One input surface for mouse and keyboard and for touch. The game reads `move`, takes the look deltas, and polls the
// held and pressed flags; it never looks at events itself.
export interface Actions {
  fire: boolean
  sprint: boolean
  jump: boolean
  reload: boolean
  swap: boolean
  grenade: boolean
  weapon1: boolean
  weapon2: boolean
  pause: boolean
  mute: boolean
}
const blank = (): Actions => ({ fire: false, sprint: false, jump: false, reload: false, swap: false, grenade: false, weapon1: false, weapon2: false, pause: false, mute: false })

const KEYS: Record<string, keyof Actions> = {
  ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump', KeyR: 'reload', KeyQ: 'swap', KeyG: 'grenade', Digit1: 'weapon1', Digit2: 'weapon2',
  KeyP: 'pause', KeyM: 'mute',
}

export class Input {
  /** strafe (x, right is +1) and advance (y, forward is +1), each -1..1 */
  readonly move = { x: 0, y: 0 }
  readonly held = blank()
  private pressed = blank()
  private lookX = 0
  private lookY = 0
  private readonly keys = new Set<string>()
  touch = false
  locked = false
  /** called when the first touch shows this is a touch device */
  onTouchMode: (() => void) | null = null
  /** called when pointer lock is lost while it was held (Esc) */
  onUnlock: (() => void) | null = null
  private stickId: number | null = null
  private stickOrigin = { x: 0, y: 0 }
  private readonly lookTouches = new Map<number, { x: number; y: number }>()

  constructor(private readonly canvas: HTMLElement, private readonly ui: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.keys.add(e.code)
      const a = KEYS[e.code]
      if (a) {
        this.held[a] = true
        this.pressed[a] = true
        if (e.code === 'Space') e.preventDefault()
      }
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
      const a = KEYS[e.code]
      if (a) this.held[a] = false
    })
    window.addEventListener('blur', () => {
      this.keys.clear()
      Object.assign(this.held, blank())
    })
    canvas.addEventListener('mousedown', (e) => {
      if (this.touch) return
      if (!this.locked) this.lock()
      if (e.button === 0) this.held.fire = true
      if (e.button === 2) this.pressed.grenade = true
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && !this.touch) this.held.fire = false
    })
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return
      this.lookX += e.movementX
      this.lookY += e.movementY
    })
    window.addEventListener('wheel', () => {
      if (this.locked) this.pressed.swap = true
    })
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked
      this.locked = document.pointerLockElement === canvas
      if (was && !this.locked) {
        this.held.fire = false
        this.onUnlock?.()
      }
    })

    // touch: the left half is a floating move stick, the right half drags the view; buttons carry data-act
    const opts = { passive: false } as const
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      if (!this.touch) {
        this.touch = true
        this.onTouchMode?.()
      }
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth * 0.42 && this.stickId === null) {
          this.stickId = t.identifier
          this.stickOrigin = { x: t.clientX, y: t.clientY }
          this.stick(t.clientX, t.clientY, true)
        } else this.lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY })
      }
    }, opts)
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      for (const t of Array.from(e.changedTouches)) this.touchMove(t)
    }, opts)
    const end = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) this.touchEnd(t.identifier)
    }
    canvas.addEventListener('touchend', end)
    canvas.addEventListener('touchcancel', end)
    ui.addEventListener('touchstart', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
      if (!btn) return
      e.preventDefault()
      if (!this.touch) {
        this.touch = true
        this.onTouchMode?.()
      }
      const act = btn.dataset.act as keyof Actions
      this.held[act] = true
      this.pressed[act] = true
      // the fire button also steers the view, so a thumb can track a limb while it shoots
      for (const t of Array.from(e.changedTouches)) {
        this.lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY })
        this.buttonTouch.set(t.identifier, act)
      }
    }, opts)
    ui.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) if (this.buttonTouch.has(t.identifier)) {
        e.preventDefault()
        this.touchMove(t)
      }
    }, opts)
    const uiEnd = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) {
        const act = this.buttonTouch.get(t.identifier)
        if (!act) continue
        this.held[act] = false
        this.buttonTouch.delete(t.identifier)
        this.touchEnd(t.identifier)
      }
    }
    ui.addEventListener('touchend', uiEnd)
    ui.addEventListener('touchcancel', uiEnd)
  }
  private readonly buttonTouch = new Map<number, keyof Actions>()

  private stick(x: number, y: number, show: boolean): void {
    const R = 56
    let dx = (x - this.stickOrigin.x) / R
    let dy = (y - this.stickOrigin.y) / R
    const l = Math.hypot(dx, dy)
    if (l > 1) {
      dx /= l
      dy /= l
    }
    this.touchMoveVec = { x: dx, y: -dy }
    this.held.sprint = l > 1.6
    const base = this.ui.querySelector<HTMLElement>('#stick')
    const nub = this.ui.querySelector<HTMLElement>('#stick-nub')
    if (base && nub) {
      base.style.display = show ? 'block' : 'none'
      base.style.left = this.stickOrigin.x - R + 'px'
      base.style.top = this.stickOrigin.y - R + 'px'
      nub.style.transform = `translate(${dx * R}px, ${dy * R}px)`
    }
  }
  private touchMoveVec = { x: 0, y: 0 }

  private touchMove(t: Touch): void {
    if (t.identifier === this.stickId) {
      this.stick(t.clientX, t.clientY, true)
      return
    }
    const prev = this.lookTouches.get(t.identifier)
    if (!prev) return
    this.lookX += (t.clientX - prev.x) * 2.4
    this.lookY += (t.clientY - prev.y) * 2.4
    prev.x = t.clientX
    prev.y = t.clientY
  }

  private touchEnd(id: number): void {
    if (id === this.stickId) {
      this.stickId = null
      this.stick(this.stickOrigin.x, this.stickOrigin.y, false)
      this.held.sprint = false
    }
    this.lookTouches.delete(id)
  }

  lock(): void {
    if (this.touch) return
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined
      p?.catch?.(() => undefined)
    } catch {
      /* a browser without pointer lock: the game still runs, the view just does not turn with the mouse */
    }
  }
  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  /** Call once a frame: refreshes `move` and hands back this frame's look delta and presses. */
  frame(): { lookX: number; lookY: number; pressed: Actions } {
    if (this.touch) {
      this.move.x = this.touchMoveVec.x
      this.move.y = this.touchMoveVec.y
    } else {
      const k = this.keys
      this.move.x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
      this.move.y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
    }
    const out = { lookX: this.lookX, lookY: this.lookY, pressed: this.pressed }
    this.lookX = 0
    this.lookY = 0
    this.pressed = blank()
    return out
  }
}
