/**
 * Generates PNG icons for the PWA from the SVG source.
 * Run: node scripts/generate-icons.mjs
 * Requires: npm install -D sharp (dev dep only)
 */
import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

function drawIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const r = size * 0.22

  // Background
  ctx.fillStyle = '#0F4C35'
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, r)
  ctx.fill()

  // Phone body
  const pw = size * 0.375
  const ph = size * 0.625
  const px = (size - pw) / 2
  const py = (size - ph) / 2
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.roundRect(px, py, pw, ph, size * 0.065)
  ctx.fill()

  // Screen
  ctx.fillStyle = '#0F4C35'
  ctx.beginPath()
  ctx.roundRect(px + size * 0.03, py + size * 0.03, pw - size * 0.06, ph - size * 0.1, size * 0.04)
  ctx.fill()

  // Home button
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.arc(size / 2, py + ph - size * 0.055, size * 0.045, 0, Math.PI * 2)
  ctx.fill()

  return canvas.toBuffer('image/png')
}

mkdirSync(join('public', 'icons'), { recursive: true })
writeFileSync(join('public', 'icons', 'icon-192.png'), drawIcon(192))
writeFileSync(join('public', 'icons', 'icon-512.png'), drawIcon(512))
console.log('Icons generated: public/icons/icon-192.png, public/icons/icon-512.png')
