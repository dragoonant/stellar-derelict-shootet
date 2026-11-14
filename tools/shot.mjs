import { chromium } from '@playwright/test'
const out = process.argv[2]
const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()) })
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
await p.goto('http://localhost:5199/')
await p.waitForFunction(() => !document.getElementById('btn-new').disabled, null, { timeout: 60000 })
await p.screenshot({ path: out + '/title.png' })
await p.click('#btn-new')
await p.waitForTimeout(1500)
await p.screenshot({ path: out + '/start.png' })
// line up one of each caste in front of the player
const info = await p.evaluate(() => {
  const g = window.__bf
  g.god = true
  g.skipToWave(0)
  const V = g.player.pos.constructor
  const kinds = ['reaver', 'lobber', 'skirr', 'bulwark', 'augur']
  g.player.pos.set(-40, 0, 14); g.player.yaw = -Math.PI / 2; g.player.pitch = 0.08
  kinds.forEach((k, i) => g.spawn(k, new V(-12 + (k === 'augur' ? 14 : 0), k === 'skirr' ? 5 : 0, 14 + (i - 2) * 7)))
  return g.bugs.length
})
await p.waitForTimeout(1700)
await p.screenshot({ path: out + '/lineup.png' })
// shoot the left scythe off the Reaver, then count what the sim says
const sever = await p.evaluate(() => {
  const g = window.__bf
  const r = g.bugs.find((b) => b.caste.id === 'reaver')
  let shots = 0
  while (r.state.hp['claw-l'] > 0 && shots < 30) { g.aimAt(r, 'claw-l'); g.fire(false); shots++ }
  return { shots, hp: r.state.hp, severed: r.state.severed, hitMeshes: r.rig.hit.length, total: g.severed }
})
await p.waitForTimeout(350)
await p.screenshot({ path: out + '/sever.png' })
const boom = await p.evaluate(() => { const g = window.__bf; const b = g.bugs.find((x) => x.caste.id === 'bulwark'); g.explode(b.pos.clone().setY(b.pos.y + 3.2)); return { hp: b.state.hp, severed: b.state.severed } })
await p.waitForTimeout(450)
await p.screenshot({ path: out + '/blast.png' })
console.log(JSON.stringify(sever), JSON.stringify(boom))
console.log('bugs', info, errs.slice(0, 10))
await b.close()
