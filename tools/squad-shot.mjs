// Dev tool: screenshots of the squad on the move. `node tools/squad-shot.mjs <out dir> [url]`
import { chromium } from '@playwright/test'
const out = process.argv[2]
const url = process.argv[3] ?? 'http://localhost:5199/'
const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1100, height: 620 } })
p.on('pageerror', (e) => console.log('PAGEERROR', e.message))
p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(m.type(), m.text().slice(0, 200)))
await p.goto(url)
await p.waitForFunction(() => !document.getElementById('btn-new').disabled, null, { timeout: 60000 })
await p.click('#btn-new')
await p.addStyleTag({ content: '#banner{display:none!important}' })
await p.evaluate(() => {
  const g = window.__bf
  g.god = true
  const V = g.player.pos.constructor
  g.player.pos.set(6, 0, 7); g.player.yaw = Math.PI / 2 + 0.5; g.player.pitch = -0.1
  const bug = g.spawn('bulwark', new V(-60, 0, -20)); bug.update = () => {}
})
for (let i = 0; i < 3; i++) {
  await p.waitForTimeout(1300)
  await p.screenshot({ path: `${out}/squad-${i}.png` })
}
console.log(await p.evaluate(() => window.__bf.wardens.map((w) => [w.def.id, w.pos.x.toFixed(1), w.pos.z.toFixed(1)].join(' ')).join(' | ')))
await b.close()
