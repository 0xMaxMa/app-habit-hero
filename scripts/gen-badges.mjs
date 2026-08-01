/**
 * scripts/gen-badges.mjs — render the HabitHero achievement medals to PNG.
 *
 * The medals now match the exported Claude design's badge: a pointy-top
 * "gem" hexagon with a 3D bottom rim (edge), a coloured ring border, an inner
 * disc with a diagonal gloss + a darker bottom band — and, per the design,
 * the drawn icon glyph in the centre (NOT an emoji). Tones come straight from
 * the design's BADGE_TONES ([ring, disc, inner, edge]).
 *
 * Image generation isn't available in this environment and resvg can't
 * rasterize Noto Color Emoji, so everything is drawn as flat vector art and
 * rasterized once with @resvg/resvg-js. Output PNGs are committed to
 * public/badges/ and served at /badges/<id>.png — used by the web achievement
 * gallery, the new-badge popup, and the gateway agent (curls the PNG).
 *
 * Run:  node scripts/gen-badges.mjs   (dev-only; @resvg/resvg-js is a devDep)
 */

import { Resvg } from '@resvg/resvg-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'public', 'badges')

// Material-style icon paths (24×24 viewBox), recognizable at a glance.
const ICONS = {
  flame:
    'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z',
  dumbbell:
    'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z',
  bolt: 'M7 2v11h3v9l7-12h-4l4-8z',
  star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  crown:
    'M5 16L3 5l5.5 4L12 4l3.5 5L21 5l-2 11H5zm0 3v-1h14v1c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1z',
  // Open book (menu_book) — หนอนหนังสือ.
  book:
    'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z',
  // Diagonal broom (handle + bristle fan) — นักทำความสะอาด.
  broom:
    'M18 2 20 4 12 12 10 10Z M9.2 11.2 11.8 13.8 10.4 22 3 20Z',
  // Sun with rays (wb_sunny) — ตื่นเช้า (early riser).
  sun:
    'M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm7-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z',
  // Chef toque (puffy hat + band) — ผู้ช่วยเชฟ.
  toque:
    'M7 21h10v-3H7v3zM18.5 9.2c.32-.53.5-1.15.5-1.82C19 5.51 17.43 4 15.5 4c-.34 0-.66.05-.97.14C13.86 2.87 12.53 2 11 2 8.79 2 7 3.79 7 6c0 .04 0 .08.01.12C5.28 6.5 4 8.02 4 9.85 4 11.86 5.57 13.5 7.5 13.5h9c1.66 0 3-1.34 3-3 0-.55-.15-1.06-.4-1.5zM7 15h10v1.5H7z',
  // Cut gem (trophy of XP) — 5,000 XP.
  diamond: 'M6 2 18 2 22 8 12 22 2 8Z',
  // Trophy cup (emoji_events) — streak 30.
  trophy:
    'M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z',
  // --- Second wave (2026-07-31) glyphs, all Material 24px paths -------------
  // Check (done) — งานแรกของฉัน (first completion).
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  // Sparkles (auto_awesome) — สตรีค 3 วัน (a first spark).
  spark:
    'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z',
  // Target (my_location) — 10 ภารกิจแรก.
  target:
    'M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z',
  // Medal (military_tech) — เลเวล 10.
  medal:
    'M17 10.43V2c0-.55-.45-1-1-1H8c-.55 0-1 .45-1 1v8.43c0 .35.18.68.49.86l4.18 2.51-.99 2.34-3.41.29 2.59 2.24L9.07 22 12 20.23 14.93 22l-.78-3.36 2.59-2.24-3.41-.29-.99-2.34 4.18-2.51c.3-.18.48-.5.48-.86zM13 12.23l-1 .6-1-.6V3h2v9.23z',
  // Rosette (workspace_premium) — เลเวล 25.
  rosette:
    'M9.68 13.69L12 11.93l2.31 1.76-.88-2.85L15.75 9h-2.84L12 6.19 11.09 9H8.25l2.31 1.84-.88 2.85zM20 10c0-4.42-3.58-8-8-8s-8 3.58-8 8c0 2.03.76 3.87 2 5.28V23l6-2 6 2v-7.72c1.24-1.41 2-3.25 2-5.28zm-8-6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6zm0 15l-4 1.02v-3.1c1.18.68 2.54 1.08 4 1.08s2.82-.4 4-1.08v3.1L12 19z',
  // Shield (verified_user) — เลเวล 45 สูงสุด.
  shield: 'M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z',
  // Rocket (rocket_launch) — 50,000 XP.
  rocket:
    'M9.19 6.35c-2.04 2.29-3.44 5.58-3.57 5.89L2 10.69l4.05-4.05c.47-.47 1.15-.68 1.81-.55l1.33.26zM11.17 17s3.74-1.55 5.89-3.7c5.4-5.4 4.5-9.62 4.21-10.57-.95-.3-5.17-1.19-10.57 4.21C8.55 9.09 7 12.83 7 12.83L11.17 17zm6.48-2.19c-2.29 2.04-5.58 3.44-5.89 3.57L13.31 22l4.05-4.05c.47-.47.68-1.15.55-1.81l-.26-1.33zM9 18c0 .83-.34 1.58-.88 2.12C6.94 21.3 2 22 2 22s.7-4.94 1.88-6.12C4.42 15.34 5.17 15 6 15c1.66 0 3 1.34 3 3zm4-9c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z',
  // Star in a circle (stars) — 200,000 XP สูงสุด.
  stars:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l1.94 4.53 4.92.42-3.73 3.23L16.24 18z',
  // Coin with a value mark (paid) — นักออม (saver).
  coin:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z',
  // Gift box (card_giftcard) — แลกรางวัลครั้งแรก.
  gift:
    'M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 12 7.4l3.38 4.6L17 10.83 14.92 8H20v6z',
  // Artist palette (palette) — ครบเครื่อง (all categories).
  palette:
    'M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5 0 .12.05.23.13.33.41.47.64 1.06.64 1.67 0 1.38-1.12 2.5-2.5 2.5zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8c.28 0 .5-.22.5-.5a.54.54 0 0 0-.14-.35c-.41-.46-.63-1.05-.63-1.65 0-1.38 1.12-2.5 2.5-2.5H16c2.21 0 4-1.79 4-4 0-3.86-3.59-7-8-7zm-5.5 6c-.83 0-1.5-.67-1.5-1.5S5.67 7 6.5 7 8 7.67 8 8.5 7.33 10 6.5 10zm3-4C8.67 6 8 5.33 8 4.5S8.67 3 9.5 3s1.5.67 1.5 1.5S10.33 6 9.5 6zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 3 14.5 3s1.5.67 1.5 1.5S15.33 6 14.5 6zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 7 17.5 7s1.5.67 1.5 1.5S18.33 10 17.5 10z',
  // Calendar — Perfect Month.
  calendar:
    'M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z',
}

// Design BADGE_TONES → [ring, disc, inner, edge].
const TONES = {
  amber: ['#FBDFA4', '#F2A93B', '#D08D22', '#C9891F'],
  blue: ['#BEDAF2', '#3E86C9', '#2E6FAB', '#27619B'],
  green: ['#CFE4B4', '#6BA43C', '#568A2E', '#4E8A34'],
  rose: ['#F4CFC0', '#D9825C', '#BC6942', '#B0603B'],
}

// One medal per badge: its icon and colour tone. Order + tones mirror the
// exported design's badge grid (lib/badges.ts BADGES).
const BADGES = [
  { id: 'on_fire', icon: 'flame', tone: 'amber' },
  { id: 'cleaner', icon: 'broom', tone: 'blue' },
  { id: 'bookworm', icon: 'book', tone: 'green' },
  { id: 'xp_1000', icon: 'star', tone: 'amber' },
  { id: 'early_bird', icon: 'sun', tone: 'blue' },
  { id: 'iron_will', icon: 'trophy', tone: 'amber' },
  { id: 'chef', icon: 'toque', tone: 'rose' },
  { id: 'xp_5000', icon: 'diamond', tone: 'blue' },
  { id: 'speed_demon', icon: 'bolt', tone: 'rose' },
  { id: 'overachiever', icon: 'star', tone: 'green' },
  { id: 'perfect_week', icon: 'crown', tone: 'amber' },
  // --- Second wave (2026-07-31). Each (icon, tone) pair is unique so no two
  // medals look identical; higher tiers reuse a familiar glyph in a new tone.
  { id: 'first_chore', icon: 'check', tone: 'green' },
  { id: 'streak_3', icon: 'spark', tone: 'rose' },
  { id: 'ten_chores', icon: 'target', tone: 'blue' },
  { id: 'level_10', icon: 'medal', tone: 'blue' },
  { id: 'level_25', icon: 'rosette', tone: 'amber' },
  { id: 'level_45', icon: 'shield', tone: 'rose' },
  { id: 'streak_100', icon: 'trophy', tone: 'rose' },
  { id: 'cleaner_pro', icon: 'broom', tone: 'green' },
  { id: 'bookworm_pro', icon: 'book', tone: 'blue' },
  { id: 'chef_pro', icon: 'toque', tone: 'amber' },
  { id: 'xp_10000', icon: 'diamond', tone: 'green' },
  { id: 'xp_50000', icon: 'rocket', tone: 'rose' },
  { id: 'xp_200000', icon: 'stars', tone: 'amber' },
  { id: 'saver', icon: 'coin', tone: 'green' },
  { id: 'first_redeem', icon: 'gift', tone: 'rose' },
  { id: 'all_rounder', icon: 'palette', tone: 'amber' },
  { id: 'perfect_month', icon: 'calendar', tone: 'blue' },
]

// ---- Hexagon geometry (viewBox 100 × 117; the edge lip sticks out below) ----
// Pointy-top "gem" hexagon, matching the design clip-path
// polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%).
const H = 112 // ring hexagon height (design aspect 1/1.12)
const hex = (x, y, w, h) =>
  [
    [x + w / 2, y],
    [x + w, y + h * 0.25],
    [x + w, y + h * 0.75],
    [x + w / 2, y + h],
    [x, y + h * 0.75],
    [x, y + h * 0.25],
  ]
    .map((p) => p.map((n) => n.toFixed(2)).join(','))
    .join(' ')

const RING = hex(0, 0, 100, H)
const EDGE = hex(0, 5, 100, H) // shifted down 5px → 3D bottom rim
const PAD = 7
const DISC = hex(PAD, PAD, 100 - 2 * PAD, H - 2 * PAD)

// Icon 24-box scaled to ~40u, centred on the disc centre (50, H/2).
const ISCALE = 40 / 24
const CX = 50
const CY = H / 2
const TX = CX - 12 * ISCALE
const TY = CY - 12 * ISCALE

function medalSvg({ icon, tone }) {
  const [ring, disc, inner, edge] = TONES[tone]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="599" viewBox="0 0 100 117">
  <defs>
    <linearGradient id="gloss" x1="0" y1="0" x2="0.9" y2="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="0.44" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="0.44" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="discClip"><polygon points="${DISC}"/></clipPath>
    <filter id="ds" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="1.6" stdDeviation="1.8" flood-color="#5A3A1E" flood-opacity="0.32"/>
    </filter>
    <filter id="ico" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0.9" stdDeviation="0.9" flood-color="#000000" flood-opacity="0.22"/>
    </filter>
  </defs>
  <!-- 3D bottom rim -->
  <polygon points="${EDGE}" fill="${edge}" filter="url(#ds)"/>
  <!-- coloured ring border -->
  <polygon points="${RING}" fill="${ring}"/>
  <!-- inner disc + gloss + bottom band, clipped to the disc hexagon -->
  <g clip-path="url(#discClip)">
    <polygon points="${DISC}" fill="${disc}"/>
    <rect x="${PAD}" y="${(H - PAD - (H - 2 * PAD) * 0.16).toFixed(2)}" width="${100 - 2 * PAD}" height="${((H - 2 * PAD) * 0.16).toFixed(2)}" fill="${inner}" opacity="0.55"/>
    <polygon points="${DISC}" fill="url(#gloss)"/>
  </g>
  <!-- centred icon glyph (white line art, per the design) -->
  <g transform="translate(${TX.toFixed(2)},${TY.toFixed(2)}) scale(${ISCALE.toFixed(3)})" filter="url(#ico)">
    <path d="${ICONS[icon]}" fill="#ffffff"/>
  </g>
</svg>`
}

fs.mkdirSync(OUT, { recursive: true })
for (const b of BADGES) {
  const svg = medalSvg(b)
  const png = new Resvg(svg, { background: 'rgba(0,0,0,0)' }).render().asPng()
  const file = path.join(OUT, `${b.id}.png`)
  fs.writeFileSync(file, png)
  console.log(`✓ ${b.id}.png  ${(png.length / 1024).toFixed(1)} KB`)
}
console.log('done →', OUT)
