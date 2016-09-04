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
          ( prev1.map(v => V.remove(g, v.id))
          , prev2.map(v => V.remove(g, v.id))
          )
      )

      // repopulate model
      for (const i in Gen.array(N_1)) {
        await V.create(g, ALL_1, { foo: Gen.nat() })
      }
      for (const i in Gen.array(N_2)) {
        await V.create(g, ALL_2, { bar: Gen.nat() })
      }

      // TODO: test count method

      // retrieve a whole index
      const all1 = await V.all(g, ALL_1)
      for (const v of all1) {
        t.is(v.label, 'All1')
        for (const v2 of all1)
          v === v2 || t.notDeepEqual(v, v2)
      }

      // TODO: fix this
      // dynamo-graph is now too parallel and the `updatdAt` field is not unique

      // forward pagination works

      const pagef1 = await V.all(g, ALL_1, { first: P })
      t.is(pagef1.length, P)
      const pagef2 = await V.all(g, ALL_1, { first: P, after: pagef1[P-1].updatedAt })
      t.is(pagef2.length, P)
      const pagef3 = await V.all(g, ALL_1, { after: pagef2[P-1].updatedAt })
      t.is(pagef3.length, N_1 - P - P)

      t.deepEqual([].concat(pagef1, pagef2, pagef3), all1)

      // reverse pagination works

      const pager1 = await V.all(g, ALL_1, { last: P })
      t.is(pager1.length, P)
      const pager2 = await V.all(g, ALL_1, { last: P, before: pager1[P-1].updatedAt })
      t.is(pager2.length, P)
      const pager3 = await V.all(g, ALL_1, { before: pager2[P-1].updatedAt })
      t.is(pager3.length, N_1 - P - P)

      t.deepEqual([].concat(pager1, pager2, pager3).reverse(), all1)

    }
  )
