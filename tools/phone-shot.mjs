// Dev tool: phone and desktop screenshots mid-fight. `node tools/phone-shot.mjs <out dir> [url]`
import { chromium } from '@playwright/test'
const out = process.argv[2]
const url = process.argv[3] ?? 'http://localhost:5199/'
const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
for (const [name, opts] of [['phone', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }], ['desk', { viewport: { width: 1280, height: 720 } }]]) {
  const ctx = await b.newContext(opts)
  const p = await ctx.newPage()
  await p.goto(url)
  await p.waitForFunction(() => !document.getElementById('btn-new').disabled, null, { timeout: 60000 })
  if (name === 'phone') await p.screenshot({ path: `${out}/${name}-title.png` })
  await p.click('#btn-new')
  if (name === 'phone') await p.touchscreen.tap(600, 150)
  await p.addStyleTag({ content: '#banner{display:none!important}' })
  await p.evaluate(async () => {
    const g = window.__bf
    g.god = true
    const V = g.player.pos.constructor
    g.player.pos.set(0, 0, 11)
    for (let i = 0; i < 5; i++) g.spawn('reaver', new V(-8 + i * 4, 0, 34 + (i % 2) * 5)).rise = 0
    g.spawn('lobber', new V(9, 0, 44)).rise = 0
    await new Promise((res) => setTimeout(res, 2500))
    const live = g.bugs.filter((x) => x.alive && x.caste.id === 'reaver')[0]
    if (!live) return
    for (const part of ['claw-l', 'leg-fr']) for (let i = 0; i < 4; i++) if (g.aimAt(live, part)) g.fire(false)
    g.aimAt(live, 'head')
  })
  await p.waitForTimeout(250)
  await p.screenshot({ path: `${out}/${name}-fight.png` })
  await ctx.close()
}
await b.close()
