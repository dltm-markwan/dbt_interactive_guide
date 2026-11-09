// Fold the whole guide into ONE index.html.
//
//   GUIDE_CUSTOMER=abc-ro GUIDE_SINGLE=1 GUIDE_BASE=./ npm run build
//   node branding/single-file.mjs dist        # or: post-process an existing build
//
// Runs in closeBundle, from disk, not in generateBundle. Vite 8 (rolldown) injects the
// <script>/<link> tags during transformIndexHtml, which happens *after* generateBundle --
// so a generateBundle rewrite edits HTML that does not yet reference the chunks, silently
// leaving a broken single file that points at deleted assets.
//
// Only for handing a guide to someone: the result cannot be cached like a normal bundle.

import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf' }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function inline(dir, log = console.log) {
  const htmlPath = join(dir, 'index.html')
  if (!existsSync(htmlPath)) throw new Error(`no index.html in ${dir}`)
  let html = readFileSync(htmlPath, 'utf8')
  let inlined = 0
  const removable = []

  // 1. stylesheets -> <style>
  html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (tag, href) => {
    const p = join(dir, href.replace(/^\.?\//, ''))
    if (!existsSync(p)) return tag
    inlined += 1
    removable.push(p)
    return `<style>\n${readFileSync(p, 'utf8')}\n</style>`
  })

  // 2. module scripts -> <script type="module">
  html = html.replace(/<script([^>]*)\ssrc="([^"]+)"([^>]*)><\/script>/g, (tag, pre, src, post) => {
    const p = join(dir, src.replace(/^\.?\//, ''))
    if (!existsSync(p) || extname(p) !== '.js') return tag
    inlined += 1
    removable.push(p)
    const code = readFileSync(p, 'utf8').replace(/<\/script>/gi, '<\\/script>')
    const attrs = `${pre} ${post}`.includes('module') ? ' type="module"' : ''
    return `<script${attrs}>\n${code}\n</script>`
  })

  // 3. any remaining asset URL in the HTML or in the inlined code -> data URI
  const assets = new Map()
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (MIME[extname(p)]) assets.set(p, readFileSync(p).toString('base64'))
    }
  }
  walk(dir)

  for (const [p, b64] of assets) {
    const rel = p.slice(dir.length + 1)
    const mime = MIME[extname(p)]
    for (const ref of [rel, './' + rel]) {
      const re = new RegExp(`(["'(])${esc(ref)}(["')])`, 'g')
      if (!re.test(html)) continue
      html = html.replace(re, `$1data:${mime};base64,${b64}$2`)
      inlined += 1
      if (!removable.includes(p)) removable.push(p)
    }
  }

  writeFileSync(htmlPath, html)
  for (const p of removable) rmSync(p, { force: true })

  const leftovers = html.match(/(?:src|href)="(?!data:|#|mailto:|https?:)[^"]+"/g) || []
  log(`inlined ${inlined} part(s) -> ${htmlPath} (${(html.length / 1e6).toFixed(2)} MB)`)
  if (leftovers.length) log(`still external: ${[...new Set(leftovers)].slice(0, 5).join(', ')}`)
  return { leftovers }
}

export default function singleFile() {
  return {
    name: 'single-file',
    apply: 'build',
    closeBundle() {
      inline('dist', (m) => this.info(m))
    },
  }
}

if (process.argv[1]?.endsWith('single-file.mjs')) {
  inline(process.argv[2] || 'dist')
}
