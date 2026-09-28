// Renders the app icons from one SVG source (palette: #1F150C tile, #412D15 ring, #E1DCC9 mark).
// Run: node scripts/make-icons.mjs   (writes to public/ and src/app/icon.svg)
import fs from 'node:fs'
import sharp from 'sharp'

// Mark: two linked nodes (workflow), drawn on a 100×100 grid.
const mark = (s = 1, o = 0) => `
  <g transform="translate(${o} ${o}) scale(${s})" fill="none" stroke="#E1DCC9" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="22" y="22" width="24" height="24" rx="6"/>
    <rect x="54" y="54" width="24" height="24" rx="6"/>
    <path d="M34 46v10a8 8 0 0 0 8 8h12"/>
  </g>`

const tile = (rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${rounded ? 22 : 0}" fill="#1F150C"/>
  <rect x="3" y="3" width="94" height="94" rx="${rounded ? 19 : 0}" fill="none" stroke="#412D15" stroke-width="2"/>
  ${mark()}
</svg>`

// Maskable: full-bleed background, mark shrunk into the 80% safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#1F150C"/>
  ${mark(0.7, 15)}
</svg>`

fs.mkdirSync('public', { recursive: true })
fs.writeFileSync('src/app/icon.svg', tile(true))
const out = [
  ['public/icon-192.png', tile(true), 192],
  ['public/icon-512.png', tile(true), 512],
  ['public/icon-maskable-512.png', maskable, 512],
  ['src/app/apple-icon.png', tile(false), 180],
]
for (const [file, svg, size] of out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file)
  console.log('wrote', file)
}
