import test from 'ava'

import { V, E } from 'dynamo-graph'
import { g, Gen } from '../helpers'

const REMOVE = V.define('Remove')

test
  ( 'Removes vertex'
  , async t => {
      const v = await V.create(g, REMOVE, { foo: 'foo' })
      t.truthy(await V.get(g, v.id))
      const v$ = await V.remove(g, v.id)
      t.deepEqual(v, v$)
      t.falsy(await V.get(g, v.id))
    }
  )

const N_e = 2
const N_v = 3
const N_t = 3
const EDGES = Gen.array(N_e).map(
  (_, i) => E.define(`RemoveE${i}`, E.MANY_TO_MANY)
)

test
  ( 'Removes all edges'
  , async t => {

      // run a trial N_t times in succession

      for (let i = 0; i < N_t; i++) {

        // generate an N_v vertex graph
        const vs = await Promise.all(
          Gen.array(N_v).map(
            (_, i) => V.create(g, REMOVE, { foo: i })
          )
        )

        // populate densely with edges
        await Promise.all(
          vs.map(async ({ id }) => {
            const idxs = Gen.array(Gen.int(N_v) + 1).map(() => Gen.int(N_v))
            for (const idx of idxs) {
              const EDGE = EDGES[Gen.int(N_e)]
              await E.set(g, id, EDGE, E.OUT, E.GENERATE, vs[idx].id)
            }
          })
        )

        // delete first vertex
        const [ v ] = vs
        await V.remove(g, v.id)

        // assert no edges persist
        await Promise.all(
          vs.map(async ({ id }) => {
            for (const EDGE of EDGES) {
              const [ e1, e2 ] = await Promise.all(
                [ E.get(g, v.id, EDGE, E.OUT, id)
                , E.get(g, v.id, EDGE, E.IN, id)
                ]
              )
              t.falsy(e1 || e2)
            }
          })
        )

      }
    }
  )
