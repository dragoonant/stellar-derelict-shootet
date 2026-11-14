// Boot: the bulletin (title), the pause and end sheets, and the wiring between them and the game.
import './style.css'
import { CASTES, CASTE_IDS } from './sim/castes'
import { describeSave, type SaveData } from './sim/save'
import { DIFFICULTIES, WAVES, type Difficulty } from './sim/waves'
import { Game, type Mode } from './game/game'
import { $ } from './game/hud'
import { SQUAD } from './game/squad'

// KB rule 24 fallback for browsers that ignore the CSS
for (const type of ['selectstart', 'contextmenu'] as const) {
  document.addEventListener(type, (e) => {
    const t = e.target as HTMLElement | null
    if (t && (t.matches?.('input, textarea, select') || t.isContentEditable)) return
    e.preventDefault()
  })
}

const base = import.meta.env.BASE_URL
const game = new Game($<HTMLCanvasElement>('view'), $('ui'), base)
let difficulty: Difficulty = 'regular'
let save: SaveData | null = null
let modelsReady = false

const screens = { title: $('title'), pause: $('pause'), end: $('end'), confirm: $('confirm') }
const show = (name: keyof typeof screens | null): void => {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name
}

// the title
const diffRow = $('difficulty')
for (const d of Object.values(DIFFICULTIES)) {
  const b = document.createElement('button')
  b.textContent = d.label
  b.dataset.diff = d.id
  b.addEventListener('click', () => {
    difficulty = d.id
    game.audio.unlock()
    game.audio.play('select')
    paintDifficulty()
  })
  diffRow.append(b)
}
function paintDifficulty(): void {
  for (const b of Array.from(diffRow.children) as HTMLElement[]) b.classList.toggle('on', b.dataset.diff === difficulty)
}
paintDifficulty()

const guide = $('guide')
for (const id of CASTE_IDS) {
  const c = CASTES[id]
  const p = document.createElement('p')
  const b = document.createElement('b')
  b.textContent = c.name + '. '
  p.append(b, c.blurb)
  guide.append(p)
}

function refreshTitle(): void {
  const r = game.loadSave()
  save = r.ok === true ? r.data : null
  $('continue-box').hidden = !save
  if (save) $('continue-text').textContent = describeSave(save)
  $('save-error').hidden = r.ok !== false
  if (r.ok === false) $('save-error-text').textContent = `The saved game cannot be opened: ${r.reason}.`
  paintLoading()
}
function paintLoading(): void {
  const p = game.models.progress
  const btns = [$<HTMLButtonElement>('btn-new'), $<HTMLButtonElement>('btn-continue')]
  for (const b of btns) b.disabled = !modelsReady
  $('loading').textContent = !modelsReady
    ? `Loading models ${p.loaded}/${p.total}`
    : p.failed.length > 0
      ? `${p.failed.length} of ${p.total} squad models failed to load; those Wardens use a stand-in figure.`
      : `Squad ready: ${SQUAD.map((s) => s.name).join(', ')}. ${WAVES.length} waves, then the lifter.`
}
game.models.onProgress = paintLoading
void game.models.preload(base).then(() => {
  modelsReady = true
  paintLoading()
})

function begin(from?: SaveData): void {
  game.audio.unlock()
  game.audio.play('confirm')
  show(null)
  game.start(difficulty, from)
  game.input.lock()
}
$('btn-new').addEventListener('click', () => {
  if (!save) return begin()
  $('confirm-text').textContent = `A new deployment replaces the saved game. ${describeSave(save)}`
  show('confirm')
})
$('btn-confirm-yes').addEventListener('click', () => begin())
$('btn-confirm-no').addEventListener('click', () => show('title'))
$('btn-continue').addEventListener('click', () => save && begin(save))
$('btn-discard').addEventListener('click', () => {
  game.discardSave()
  refreshTitle()
})
$('btn-how').addEventListener('click', () => {
  $('how').hidden = !$('how').hidden
})
$('title').addEventListener('pointerdown', () => {
  game.audio.unlock()
  game.audio.setMusic('title')
}, { once: true })

// pause
const paintMute = (): void => {
  $('btn-mute').textContent = game.audio.muted ? 'SOUND IS OFF' : 'SOUND IS ON'
}
$('btn-resume').addEventListener('click', () => {
  show(null)
  game.setMode('playing')
  game.input.lock()
})
$('btn-mute').addEventListener('click', () => {
  game.audio.toggleMute()
  paintMute()
})
const toTitle = (): void => {
  game.setMode('title')
  game.audio.setMusic('title')
}
$('btn-quit').addEventListener('click', toTitle)
$('btn-title').addEventListener('click', toTitle)
$('btn-retry').addEventListener('click', () => {
  const r = game.loadSave()
  begin(r.ok === true ? r.data : undefined)
})

game.onMode = (m: Mode): void => {
  if (m === 'title') {
    refreshTitle()
    show('title')
  } else if (m === 'paused') {
    paintMute()
    show('pause')
  } else if (m === 'dead' || m === 'won') {
    const r = game.loadSave()
    const stats = `Score ${game.score}. ${game.kills} Molt killed, ${game.severed} parts shot off. ${game.wardens.filter((w) => w.alive).length} of ${game.wardens.length} squadmates standing.`
    $('end-title').textContent = m === 'won' ? 'OUTPOST HELD' : 'SUIT BREACHED'
    $('end-text').textContent =
      m === 'won'
        ? 'The Augur is dead and the lifter is away with you on it. The Service thanks you.'
        : `You fell on wave ${game.wave + 1} of ${WAVES.length}. The Molt do not take prisoners.`
    $('end-stats').textContent = stats
    $('btn-retry').textContent = m === 'won' ? 'DEPLOY AGAIN' : r.ok === true ? `REDEPLOY AT WAVE ${r.data.wave + 1}` : 'NEW DEPLOYMENT'
    show('end')
  } else show(null)
}
refreshTitle()

// the test and debug surface (also handy in the console)
declare global {
  interface Window {
    __bf: Game
  }
}
window.__bf = game
