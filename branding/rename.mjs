// Rename the guide's example vocabulary to a customer's, without touching code.
//
// The examples live in JSX *text children* and template literals, right next to
// className="...border..." attributes. Replacing words across the raw source would
// corrupt Tailwind classes, imports and comments -- so every region that must not
// change is masked with equal-length filler first. Masks keep offsets identical, so
// replacements found on the masked copy splice straight back into the original.
//
//   node branding/rename.mjs --customer abc-ro --report
//   node branding/rename.mjs --customer abc-ro --check      # exit 1 if a token is unused

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

// regions that must never be rewritten
const MASKED = [
  // JSX/HTML attribute values: className, key, href, aria-*, data-*, style={...}
  /(\b(?:className|class|key|id|href|src|alt|role|title|type|name|value|htmlFor|to|target|rel|fill|stroke|viewBox|d|points|style|xmlns|width|height|preserveAspectRatio|aria-[\w-]+|data-[\w-]+)\s*=\s*)(?:"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})/g,
  // import / export specifiers and module ids
  /(\bimport\b[^;\n]*?from\s*)(?:"[^"]*"|'[^']*')/g,
  /(\bexport\b[^;\n]*?from\s*)(?:"[^"]*"|'[^']*')/g,
  // bare side-effect imports and dynamic imports
  /(\bimport\s*\()(?:"[^"]*"|'[^']*'|`[^`]*`)/g,
  // comments
  /\/\*[\s\S]*?\*\//g,
  /(^|[^:])\/\/[^\n]*/g,
]

const filler = (s) => s.replace(/[^\n]/g, '\u0000')

// Mask by index, never by rebuilding the string. Every earlier version of this that
// used String.replace with a captured prefix silently changed the length of the file
// when the prefix appeared twice in one match, which shifted every later offset and
// produced source that no longer parsed.
export function mask(source) {
  const chars = source.split('')
  for (const re of MASKED) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(source)) !== null) {
      const start = m.index + (m[1] ? m[1].length : 0)
      const end = m.index + m[0].length
      for (let i = start; i < end; i++) {
        if (chars[i] !== '\n') chars[i] = '\u0000'
      }
      if (m.index === re.lastIndex) re.lastIndex += 1   // never loop on a zero-width match
    }
  }
  return chars.join('')
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function apply(text, pairs, counts) {
  let out = text
  for (const [from, to] of pairs) {
    if (!from) continue
    const re = new RegExp(`(?<![\\w$-])${escapeRe(from)}(_[A-Za-z0-9]+)?(?![\\w-])`, 'gi')
    out = out.replace(re, (m) => {
      counts.set(from, (counts.get(from) || 0) + 1)
      // preserve a leading capital if the replacement is lowercase
      if (m[0] === m[0].toUpperCase() && to[0] === to[0].toLowerCase()) {
        return to[0].toUpperCase() + to.slice(1)
      }
      return to
    })
  }
  return out
}

export function rename(source, pairs) {
  const masked = mask(source)          // same length as source, protected regions blanked
  const counts = new Map()
  const edits = []

  for (const [from, to] of pairs) {
    if (!from) continue
    const re = new RegExp(`(?<![\\w$-])${escapeRe(from)}(_[A-Za-z0-9]+)?(?![\\w-])`, 'gi')
    let m
    while ((m = re.exec(masked)) !== null) {
      const hit = m[0]
      const suffix = m[1] || ''          // keep graph ids like stg_orders_w, dim_customers_v2 consistent
      const base = hit.slice(0, hit.length - suffix.length)
      // match case shape: STG_ORDERS stays shouting, Stg_orders stays capitalised
      const cased = base === base.toUpperCase() && base !== base.toLowerCase()
        ? to.toUpperCase()
        : base[0] === base[0].toUpperCase() && to[0] === to[0].toLowerCase()
          ? to[0].toUpperCase() + to.slice(1)
          : to
      edits.push({ start: m.index, end: m.index + hit.length, text: cased + suffix, from })
    }
  }

  if (!edits.length) return { code: source, counts }

  // earliest start wins; a later edit that overlaps an accepted one is dropped
  edits.sort((a, b) => a.start - b.start || b.end - a.end)
  const accepted = []
  let cursor = 0
  for (const e of edits) {
    if (e.start >= cursor) {
      accepted.push(e)
      cursor = e.end
      counts.set(e.from, (counts.get(e.from) || 0) + 1)
    }
  }

  // rebuild from the ORIGINAL, copying untouched spans verbatim
  let out = ''
  let pos = 0
  for (const e of accepted) {
    out += source.slice(pos, e.start) + e.text
    pos = e.end
  }
  out += source.slice(pos)
  return { code: out, counts }
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (['.jsx', '.js'].includes(extname(p))) acc.push(p)
  }
  return acc
}

export function loadCustomer(name) {
  const path = join(ROOT, 'content', `${name}.json`)
  if (!existsSync(path)) throw new Error(`no content pack: ${path}`)
  const pack = JSON.parse(readFileSync(path, 'utf8'))
  const pairs = [
    ...Object.entries(pack.models || {}),
    ...Object.entries(pack.columns || {}),
    ...Object.entries(pack.words || {}),
  ].filter(([from]) => from && !from.startsWith('_'))
  return { pack, pairs, path }
}

export function renameProject(dir, customer) {
  const { pack, pairs } = loadCustomer(customer)
  const totals = new Map()
  const files = []
  for (const file of walk(dir)) {
    const src = readFileSync(file, 'utf8')
    const { code, counts } = rename(src, pairs)
    if (code !== src) {
      files.push({ file, counts })
      for (const [k, v] of counts) totals.set(k, (totals.get(k) || 0) + v)
      writeFileSync(file, code)
    }
  }
  return { pack, totals, files }
}

// --- CLI -------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const ci = args.indexOf('--customer')
  if (ci < 0) {
    console.error('usage: node branding/rename.mjs --customer <slug> [--report] [--check] [--write]')
    process.exit(2)
  }
  const customer = args[ci + 1]
  const { pack, pairs } = loadCustomer(customer)
  const roots = [join(ROOT, 'src')]

  const totals = new Map()
  const perFile = []
  for (const root of roots) {
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8')
      const { code, counts } = rename(src, pairs)
      if (code !== src) {
        perFile.push({ file: relative(ROOT, file), counts })
        for (const [k, v] of counts) totals.set(k, (totals.get(k) || 0) + v)
        if (args.includes('--write')) writeFileSync(file, code)
      }
    }
  }

  if (args.includes('--report') || !args.includes('--check')) {
    console.log(`customer: ${customer}  (${pairs.length} tokens)`)
    for (const [from, to] of pairs) {
      const n = totals.get(from) || 0
      const flag = n === 0 ? '  UNUSED' : ''
      console.log(`  ${String(n).padStart(5)}  ${from} -> ${to}${flag}`)
    }
    console.log(`\n${perFile.length} file(s) would change:`)
    for (const f of perFile.slice(0, 20)) {
      const total = [...f.counts.values()].reduce((a, b) => a + b, 0)
      console.log(`  ${String(total).padStart(5)}  ${f.file}`)
    }
  }

  // anything upstream still visible after the rewrite, so compounds are caught rather than missed
  const upstream = pairs.map(([from]) => from).filter((f) => f.length > 3)
  const leftovers = new Map()
  for (const root of roots) {
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8')
      const { code } = rename(src, pairs)
      for (const tok of upstream) {
        const re = new RegExp(`(?<![\\w$-])${escapeRe(tok)}(?![\\w-])`, 'g')
        const n = (code.match(re) || []).length
        if (n) leftovers.set(tok, (leftovers.get(tok) || 0) + n)
      }
    }
  }
  if (leftovers.size) {
    console.warn('\nLEFTOVERS - still in the output, add an explicit entry for each:')
    for (const [k, v] of [...leftovers].sort((a, b) => b[1] - a[1])) console.warn(`  ${String(v).padStart(4)}  ${k}`)
  }

  if (args.includes('--check')) {
    const unused = pairs.filter(([from]) => !totals.get(from)).map(([from]) => from)
    if (unused.length) {
      console.error(`\nUNUSED tokens (typo, or the guide no longer mentions them): ${unused.join(', ')}`)
      process.exit(1)
    }
  }
}
