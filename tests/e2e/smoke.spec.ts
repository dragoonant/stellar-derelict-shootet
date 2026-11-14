import { expect, test, type Page } from '@playwright/test'

// The game object is on window.__bf; tests drive it the way the console would.
/* eslint-disable @typescript-eslint/no-explicit-any */
const errors: string[] = []
test.beforeEach(({ page }) => {
  errors.length = 0
  page.on('pageerror', (e) => errors.push(e.message))
})
test.afterEach(() => expect(errors).toEqual([]))

async function open(page: Page): Promise<void> {
  await page.goto('./')
  await expect(page.locator('#btn-new')).toBeEnabled({ timeout: 60_000 })
}
async function deploy(page: Page): Promise<void> {
  await open(page)
  await page.click('#btn-new')
  await expect(page.locator('#hud')).toBeVisible()
  await page.evaluate(() => ((window as any).__bf.god = true))
}

test('the bulletin opens, the squad models load, and a deployment starts', async ({ page }) => {
  await open(page)
  await expect(page.locator('h1')).toContainText('BUG FRONT')
  await expect(page.locator('#loading')).toContainText('Squad ready')
  await expect(page.locator('#continue-box')).toBeHidden()
  await page.click('#btn-new')
  await expect(page.locator('#title')).toBeHidden()
  await expect(page.locator('#banner-title')).toContainText('WAVE 1')
  const s = await page.evaluate(() => {
    const g = (window as any).__bf
    return { mode: g.mode, squad: g.wardens.length, failed: g.models.progress.failed }
  })
  expect(s).toEqual({ mode: 'playing', squad: 5, failed: [] })
})

test('a scythe comes off where it is shot, and the visor reads the part from the sim', async ({ page }) => {
  await deploy(page)
  const r = await page.evaluate(() => {
    const g = (window as any).__bf
    const V = g.player.pos.constructor
    g.player.pos.set(-40, 0, 14)
    const bug = g.spawn('reaver', new V(-28, 0, 14))
    bug.update = () => undefined // hold it still
    bug.rig.root.position.y = 0
    g.aimAt(bug, 'claw-r')
    const seen = g.reticle()
    let shots = 0
    while (bug.state.hp['claw-l'] > 0 && shots < 20) {
      g.aimAt(bug, 'claw-l')
      g.fire(false)
      shots++
    }
    return { seen: seen && seen.partId, shots, severed: bug.state.severed, clawR: bug.state.hp['claw-r'], alive: bug.alive, inRig: bug.rig.parts.has('claw-l'), total: g.severed }
  })
  expect(r.seen).toBe('claw-r')
  expect(r.shots).toBe(3) // 40 hit points, 14 a round
  expect(r.severed).toEqual(['claw-l'])
  expect(r.clawR).toBe(40)
  expect(r.alive).toBe(true)
  expect(r.inRig).toBe(false)
  expect(r.total).toBe(1)
  await expect(page.locator('#feed')).toContainText('Reaver: left scythe off')
})

test('a headless Reaver dies on its own; a grenade strips a Bulwark\'s plates', async ({ page }) => {
  await deploy(page)
  const r = await page.evaluate(async () => {
    const g = (window as any).__bf
    const V = g.player.pos.constructor
    g.player.pos.set(-40, 0, 14)
    const reaver = g.spawn('reaver', new V(-25, 0, 10))
    g.damageBug(reaver, 'head', 999, reaver.pos.clone(), new V(1, 0, 0), true)
    const blind = reaver.alive && reaver.state.headlessLeft > 0
    const tank = g.spawn('bulwark', new V(-70, 0, 60))
    tank.update = () => undefined
    const at = tank.pos.clone()
    at.y += 3.4
    g.explode(at)
    g.explode(at)
    // game time runs slow under software GL: wait on the game, not the clock
    for (let i = 0; i < 300 && reaver.alive; i++) await new Promise((res) => setTimeout(res, 200))
    return { blind, reaverAlive: reaver.alive, plates: tank.state.severed.filter((id: string) => id.startsWith('plate')).length, tankAlive: tank.alive }
  })
  expect(r.blind).toBe(true)
  expect(r.reaverAlive).toBe(false)
  expect(r.plates).toBe(4)
  expect(r.tankAlive).toBe(true)
})

test('the game saves at the wave start; Continue names it and reopens it; a bad save says why', async ({ page }) => {
  await deploy(page)
  await page.evaluate(() => {
    const g = (window as any).__bf
    g.score = 777
    g.wardens[1].hurt(999, g.player.pos)
    g.skipToWave(2)
  })
  await page.reload()
  await expect(page.locator('#btn-new')).toBeEnabled({ timeout: 60_000 })
  await expect(page.locator('#continue-text')).toContainText('Wave 3 of 6')
  await expect(page.locator('#continue-text')).toContainText('4 of 5 squadmates standing')
  await expect(page.locator('#continue-text')).toContainText('score 777')
  // New deployment asks before replacing it
  await page.click('#btn-new')
  await expect(page.locator('#confirm')).toBeVisible()
  await page.click('#btn-confirm-no')
  await page.click('#btn-continue')
  const s = await page.evaluate(() => {
    const g = (window as any).__bf
    return { mode: g.mode, wave: g.wave, score: g.score, brandt: g.wardens[1].alive }
  })
  expect(s).toEqual({ mode: 'playing', wave: 2, score: 777, brandt: false })
  await page.evaluate(() => localStorage.setItem('sds-bugfront-save', '{broken'))
  await page.reload()
  await expect(page.locator('#save-error-text')).toContainText('cannot be opened')
  await expect(page.locator('#continue-box')).toBeHidden()
  await page.click('#btn-discard')
  await expect(page.locator('#save-error')).toBeHidden()
})

test('killing the Augur routs the swarm and the lifter takes the player off', async ({ page }) => {
  await deploy(page)
  const mode = await page.evaluate(async () => {
    const g = (window as any).__bf
    const V = g.player.pos.constructor
    g.skipToWave(5)
    g.phaseT = 0
    await new Promise((res) => setTimeout(res, 1500))
    const augur = g.bugs.find((b: any) => b.caste.id === 'augur')
    if (!augur) return 'no augur'
    g.damageBug(augur, 'head', 9999, augur.pos.clone(), new V(0, 1, 0), true)
    for (let i = 0; i < 400 && g.phase !== 'extract'; i++) await new Promise((res) => setTimeout(res, 200))
    if (g.phase !== 'extract') return 'phase ' + g.phase
    g.shipT = 14
    g.player.pos.set(40, 0, 0)
    await new Promise((res) => setTimeout(res, 800))
    return g.mode
  })
  expect(mode).toBe('won')
  await expect(page.locator('#end-title')).toContainText('OUTPOST HELD')
  expect(await page.evaluate(() => localStorage.getItem('sds-bugfront-save'))).toBeNull()
})

test.describe('phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })
  test('the visor fits a phone in landscape, touch controls appear, and nothing selects', async ({ page }) => {
    await open(page)
    expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none')
    await page.tap('#btn-new')
    await expect(page.locator('#hud')).toBeVisible()
    await page.touchscreen.tap(600, 200)
    await expect(page.locator('#tb-fire')).toBeVisible()
    for (const id of ['#tb-fire', '#tb-reload', '#tb-swap', '#tb-grenade', '#ammo', '#vitals', '#squad']) {
      const box = await page.locator(id).boundingBox()
      expect(box, id).not.toBeNull()
      if (!box) continue
      expect(box.x, id).toBeGreaterThanOrEqual(0)
      expect(box.y, id).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, id).toBeLessThanOrEqual(844)
      expect(box.y + box.height, id).toBeLessThanOrEqual(390)
    }
    await page.locator('#wave').click({ clickCount: 3, force: true })
    expect(await page.evaluate(() => String(getSelection()))).toBe('')
  })
})
