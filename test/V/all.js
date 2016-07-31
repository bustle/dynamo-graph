import test from 'ava'

import { V } from 'dynamo-graph'
import { g, Gen } from '../helpers'

const N_1 = 10
const N_2 = 2

const P = 3

const ALL_1 = V.define('All1')
const ALL_2 = V.define('All2')

// TODO: split these off into multiple tests

test
  ( 'Retrieves all vertices'
  , async t => {

      // remove all previous test results
      const prev1 = await V.all(g, ALL_1)
      const prev2 = await V.all(g, ALL_2)

      await Promise.all(
        [].concat
          ( prev1.items.map(v => V.remove(g, v.id))
          , prev2.items.map(v => V.remove(g, v.id))
          )
      )

      // repopulate model
      await Promise.all(
        [].concat
          ( Gen.array(N_1).map(() => V.create(g, ALL_1, { foo: Gen.nat() }))
          , Gen.array(N_2).map(() => V.create(g, ALL_2, { bar: Gen.nat() }))
          )
      )

      // retrieve a whole index
      const all1 = await V.all(g, ALL_1)
      t.is(all1.count, 10)
      t.is(all1.total, undefined)
      for (const v of all1.items) {
        t.is(v.label, 'All1')
        for (const v2 of all1.items)
          v === v2 || t.notDeepEqual(v, v2)
      }

      // forward pagination works

      const pagef1 = await V.all(g, ALL_1, { first: P })
      t.is(pagef1.items.length, P)
      t.is(pagef1.count, P)
      t.is(pagef1.total, N_1)
      const pagef2 = await V.all(g, ALL_1, { first: P, after: pagef1.items[P-1].updatedAt })
      t.is(pagef2.items.length, P)
      t.is(pagef2.count, P)
      t.is(pagef2.total, N_1 - P)
      const pagef3 = await V.all(g, ALL_1, { after: pagef2.items[P-1].updatedAt })
      t.is(pagef3.items.length, N_1 - P - P)
      t.is(pagef3.count, N_1 - P - P)
      t.is(pagef3.total, undefined)

      t.deepEqual([].concat(pagef1.items, pagef2.items, pagef3.items), all1.items)

      // reverse pagination works

      const pager1 = await V.all(g, ALL_1, { last: P })
      t.is(pager1.items.length, P)
      t.is(pager1.count, P)
      t.is(pager1.total, N_1)
      const pager2 = await V.all(g, ALL_1, { last: P, before: pager1.items[P-1].updatedAt })
      t.is(pager2.items.length, P)
      t.is(pager2.count, P)
      t.is(pager2.total, N_1 - P)
      const pager3 = await V.all(g, ALL_1, { before: pager2.items[P-1].updatedAt })
      t.is(pager3.items.length, N_1 - P - P)
      t.is(pager3.count, N_1 - P - P)
      t.is(pager3.total, undefined)

      t.deepEqual([].concat(pager1.items, pager2.items, pager3.items).reverse(), all1.items)

    }
  )
