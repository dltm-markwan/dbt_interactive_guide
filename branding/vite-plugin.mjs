// Vite plugin: rewrite the guide's example vocabulary for whichever customer is being built.
//
//   GUIDE_CUSTOMER=abc-ro npm run build
//
// With GUIDE_CUSTOMER unset the guide builds exactly as upstream, so the template is
// always the default and a broken content pack can never take the whole thing down.

import { rename, loadCustomer } from './rename.mjs'

export default function brandPlugin() {
  const customer = process.env.GUIDE_CUSTOMER
  let pairs = []
  let totals = new Map()

  return {
    name: 'dbt-guide-brand',

    config() {
      if (!customer) return {}
      return { base: process.env.GUIDE_BASE || `/${customer}/` }
    },

    buildStart() {
      if (!customer) return
      const { pairs: p } = loadCustomer(customer)
      pairs = p
      this.info(`branding for "${customer}" (${pairs.length} tokens)`)
    },

    transform(code, id) {
      if (!customer || !/\.[jt]sx?$/.test(id) || id.includes('node_modules')) return null
      const { code: out, counts } = rename(code, pairs)
      for (const [k, v] of counts) totals.set(k, (totals.get(k) || 0) + v)
      if (out === code) return null
      return { code: out, map: null }
    },

    buildEnd(error) {
      if (!customer || error) return
      const unused = pairs.filter(([from]) => !totals.get(from)).map(([from]) => from)
      this.info(`branded ${[...totals.values()].reduce((a, b) => a + b, 0)} occurrence(s)`)
      if (unused.length) this.warn(`content pack tokens that matched nothing: ${unused.join(', ')}`)
    },
  }
}
