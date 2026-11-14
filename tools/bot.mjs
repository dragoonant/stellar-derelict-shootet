// Dev tool: a bot plays a whole deployment through the real page, to check the flow and get a feel for balance.
// `node tools/bot.mjs [difficulty] [url]`. The bot stands at the start point, shoots limbs first, and runs for the pad.
import { chromium } from '@playwright/test'
const difficulty = process.argv[2] ?? 'regular'
const url = process.argv[3] ?? 'http://localhost:5199/'
const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 480, height: 270 } })
p.on('pageerror', (e) => console.log('PAGEERROR', e.message))
p.on('console', (m) => m.type() === 'error' && console.log('ERR', m.text()))
await p.goto(url)
await p.waitForFunction(() => !document.getElementById('btn-new').disabled, null, { timeout: 60000 })
await p.click(`[data-diff=${difficulty}]`)
await p.click('#btn-new')
await p.evaluate(() => {
  const g = window.__bf
  const order = ['plate', 'feeler', 'wing', 'claw', 'tail', 'head', 'leg', 'core']
  setInterval(() => {
    if (g.mode !== 'playing') return
    const me = g.player.pos
    if (g.phase === 'extract') {
      const dx = 40 - me.x, dz = 0 - me.z, d = Math.hypot(dx, dz)
      // out of the east gate, then to the pad
      const tx = Math.abs(me.z) > 2 && me.x < 14 ? 0 : dx, tz = Math.abs(me.z) > 2 && me.x < 14 ? -me.z : dz
      const l = Math.hypot(tx, tz) || 1
      if (d > 2) { me.x += (tx / l) * 0.6; me.z += (tz / l) * 0.6 }
    }
    let best = null, bd = 70 * 70
    for (const bug of g.bugs) { if (!bug.alive) continue; const d = bug.pos.distanceToSquared(me); if (d < bd) { bd = d; best = bug } }
    g.input.held.fire = !!best
    if (!best) return
    const parts = best.caste.parts.filter((q) => best.state.hp[q.id] > 0).sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind))
    g.aimAt(best, parts[0].id)
  }, 60)
})
const t0 = Date.now()
let last = ''
for (;;) {
  await p.waitForTimeout(5000)
  const s = await p.evaluate(() => {
    const g = window.__bf
    return { mode: g.mode, phase: g.phase, wave: g.wave + 1, hp: Math.round(g.player.hp), squad: g.wardens.map((w) => Math.round(w.hp)).join('/'), bugs: g.bugs.filter((x) => x.alive).length, score: g.score, kills: g.kills, severed: g.severed, t: Math.round(g.time) }
  })
  const line = JSON.stringify(s)
  if (line !== last) console.log(Math.round((Date.now() - t0) / 1000) + 's', line)
  last = line
  if (s.mode === 'won' || s.mode === 'dead' || Date.now() - t0 > 900000) break
}
await p.screenshot({ path: (process.env.BOT_OUT ?? '.') + '/bot-end.png' })
await b.close()
