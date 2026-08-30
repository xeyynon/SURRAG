const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message))

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.waitForSelector('text=CrimeLink')
  await page.fill('input[placeholder]', 'Insp. Rao')
  await page.click('button:has-text("Enter Workspace")')
  await page.waitForSelector('text=Network Analysis')

  // catalog schema toggle
  await page.click('text=Schema')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'shot1_catalog_schema.png' })
  await page.click('text=Schema')

  // analyze
  await page.click('button:has-text("Extract & Analyze Network")')
  await page.waitForSelector('text=Extracted Entities', { timeout: 20000 })
  await page.waitForTimeout(2000)

  // timeline with occurrence dates
  await page.click('nav button:has-text("Timeline")')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'shot2_timeline_dates.png' })

  // open case workspace via Case Registry
  await page.click('nav button:has-text("Case Registry")')
  await page.waitForTimeout(800)
  await page.locator('div.cursor-pointer').first().click()
  await page.waitForTimeout(500)
  await page.click('button:has-text("Open workspace")')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'shot3_case_workspace.png' })

  // click a person from workspace
  const personBtn = page.locator('button:has-text("Vijay Shinde")').first()
  if (await personBtn.count() > 0) {
    await personBtn.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'shot4_profile_from_workspace.png' })
  }

  console.log('CONSOLE_ERRORS:', JSON.stringify(consoleErrors, null, 2))
  await browser.close()
}

main().catch((e) => {
  console.error('TEST_FAILED', e)
  process.exit(1)
})
