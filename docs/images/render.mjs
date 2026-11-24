// Renders the README images from docs/images/src/*.html to docs/images/*.png
// at 2× with headless Chrome. Needs Playwright, which is not a dependency of
// any package:
//
//   npm i --no-save playwright && npx playwright install chromium
//   node docs/images/render.mjs [name…]
//
// The pages load Geist and IBM Plex from Google Fonts, so this needs network.

import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright')
const here = dirname(fileURLToPath(import.meta.url))
const wanted = process.argv.slice(2)
const pages = readdirSync(join(here, 'src'))
  .filter((f) => f.endsWith('.html'))
  .map((f) => f.slice(0, -5))
  .filter((name) => !wanted.length || wanted.includes(name))

const browser = await chromium.launch(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {})
for (const name of pages) {
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1280, height: 960 } })
  await page.goto(pathToFileURL(join(here, 'src', `${name}.html`)).href, { waitUntil: 'networkidle' })
  const size = await page.evaluate(() => {
    const { width, height } = document.body.getBoundingClientRect()
    return { width: Math.round(width), height: Math.round(height) }
  })
  await page.setViewportSize(size)
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 15000 })
  await page.screenshot({ path: join(here, `${name}.png`) })
  console.log(`${name}.png  ${size.width}×${size.height} @2x`)
  await page.close()
}
await browser.close()
