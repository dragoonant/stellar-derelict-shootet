// Dev tool: a close look at each caste's rig. `node tools/closeup.mjs <out dir> [url]`
import { chromium } from '@playwright/test'
const out = process.argv[2]
const url = process.argv[3] ?? 'http://localhost:5199/'
const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 900, height: 600 } })
p.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await p.goto(url)
await p.waitForFunction(() => !document.getElementById('btn-new').disabled, null, { timeout: 60000 })
await p.click('#btn-new')
await p.addStyleTag({ content: '#banner{display:none!important}' })
for (const [k, dist, h] of [['reaver', 6, 0], ['lobber', 6, 0], ['skirr', 5, 1.2], ['bulwark', 10, 0], ['augur', 15, 0]]) {
  await p.evaluate(([k, dist, h]) => {
    const g = window.__bf
    g.god = true
    g.skipToWave(0)
    const V = g.player.pos.constructor
    g.player.pos.set(-40, 0, 14); g.player.yaw = -Math.PI / 2 - 0.5; g.player.pitch = -0.05
    const bug = g.spawn(k, new V(-40 + Math.cos(0.5) * dist, h, 14 + Math.sin(0.5) * dist))
    bug.rise = 0
    bug.update = () => {}
    bug.rig.root.rotation.y = -2.2
    if (h) bug.rig.root.position.y = h
    else bug.rig.root.position.y = 0
  }, [k, dist, h])
  await p.waitForTimeout(300)
  await p.screenshot({ path: `${out}/caste-${k}.png` })
}
await b.close()
