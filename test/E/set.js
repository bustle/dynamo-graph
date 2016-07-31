import test from 'ava'

import { V, E } from 'dynamo-graph'
import { g, Gen } from '../helpers'

const SET_NODE_A = V.define('SetNodeA')
const SET_NODE_B = V.define('SetNodeB')

const SET_EDGE = E.define('SetEdge', E.MANY_TO_MANY)

test
  ( 'Creates persistent edges with inverses'
  , async t => {

      // create edge
      const v1 = await V.create(g, SET_NODE_A, { node: 'a' })
      const v2 = await V.create(g, SET_NODE_B, { node: 'b' })
      const e = await E.set(g, v1.id, SET_EDGE, E.OUT, 10, v2.id)
      t.is(e.from, v1.id)
      t.is(e.label, 'SetEdge')
      t.is(e.direction, E.OUT)
      t.is(e.to, v2.id)
      t.is(e.attrs, undefined)
      t.truthy(e.updatedAt)

      // check forward persistence
      const e$ = await E.get(g, v1.id, SET_EDGE, E.OUT, v2.id)
      t.deepEqual(e$, e)

      // check inverse persistence
      const e$$ = await E.get(g, v2.id, SET_EDGE, E.IN, v1.id)
      t.is(e$$.updatedAt, e$.updatedAt)
      t.is(e$$.label, e$.label)
      t.is(e$$.direction, E.IN)
      t.is(e$$.in, e$.out)
      t.is(e$$.out, e$.in)
    }
  )

test
  ( 'Generates unique weights when prompted'
  , async t => {

      const N = 10

      const vr = await V.create(g, SET_NODE_A, { node: 'root' })
      const vs = await Promise.all(
        Gen.array(N).map(() => V.create(g, SET_NODE_A, { node: 'child' }))
      )
      const es = await Promise.all(
        Gen.array(N).map(
          (_, i) => E.set(g, vr.id, SET_EDGE, E.OUT, E.GENERATE, vs[i].id, { index: i })
        )
      )

      for (let e of es) {
        t.truthy(e.weight)
        for (let e2 of es) e === e2 || t.not(e.weight, e2.weight)
      }
    }
  )

test
  ( 'Persists attributes'
  , async t => {

      const v1 = await V.create(g, SET_NODE_B, { node: 'v1' })
      const v2 = await V.create(g, SET_NODE_B, { node: 'v2' })

      const attrs =
        { edge: 'My Edge'
        }

      const e = await E.set(g, v1.id, SET_EDGE, E.OUT, E.GENERATE, v2.id,  attrs)

      t.deepEqual(e.attrs, attrs)

      const e$  = await E.get(g, v1.id, SET_EDGE, E.OUT, v2.id)
      const e$$ = await E.get(g, v2.id, SET_EDGE, E.IN, v1.id)

      t.deepEqual(e$.attrs, e.attrs)
      t.deepEqual(e$$.attrs, e.attrs)

    }
  )

const SET_OWNS = E.define('SetOwns', E.ONE_TO_MANY)
const SET_MAIN = E.define('SetMain', E.MANY_TO_ONE)
const SET_MAPS = E.define('SetMaps', E.ONE_TO_ONE)

test
  ( 'Respects multiplicities'
  , async t => {

      const [a1, a2, b1, b2] = await Promise.all(
        [ V.create(g, SET_NODE_A, { node: 'a1' })
        , V.create(g, SET_NODE_A, { node: 'a2' })
        , V.create(g, SET_NODE_B, { node: 'b1' })
        , V.create(g, SET_NODE_B, { node: 'b2' })
        ]
      )

      const set = (v1, e, dir, v2) => E.set(g, v1.id, e, dir, E.GENERATE, v2.id)

      const check = async (v1, e, v2, exists) => {
        const [e1, e2] = await Promise.all(
          [ E.get(g, v1.id, e, E.OUT, v2.id)
          , E.get(g, v2.id, e, E.IN , v1.id)
          ]
        )
        t.truthy(exists ? (e1 && e2) : !(e1 || e2))
      }

      // respects IN multiplicities

      await set(a1, SET_OWNS, E.OUT, b1)
      await set(a1, SET_OWNS, E.OUT, b2)
      await Promise.all(
        [ check(a1, SET_OWNS, b1, true)
        , check(a2, SET_OWNS, b1, false)
        , check(a1, SET_OWNS, b2, true)
        ]
      )

      await set(a2, SET_OWNS, E.OUT, b1)
      await Promise.all(
        [ check(a1, SET_OWNS, b1, false)
        , check(a2, SET_OWNS, b1, true)
        , check(a1, SET_OWNS, b2, true)
        ]
      )

      await set(b1, SET_OWNS, E.IN, a1)
      await Promise.all(
        [ check(a1, SET_OWNS, b1, true)
        , check(a2, SET_OWNS, b1, false)
        , check(a1, SET_OWNS, b2, true)
        ]
      )

      // respects OUT multiplicities
      await set(b1, SET_MAIN, E.OUT, a1)
      await set(b2, SET_MAIN, E.OUT, a1)
      await Promise.all(
        [ check(b1, SET_MAIN, a1, true)
        , check(b1, SET_MAIN, a2, false)
        , check(b2, SET_MAIN, a1, true)
        ]
      )

      await set(b1, SET_MAIN, E.OUT, a2)
      await Promise.all(
        [ check(b1, SET_MAIN, a1, false)
        , check(b1, SET_MAIN, a2, true)
        , check(b2, SET_MAIN, a1, true)
        ]
      )

      await set(a1, SET_MAIN, E.IN, b1)
      await Promise.all(
        [ check(b1, SET_MAIN, a1, true)
        , check(b1, SET_MAIN, a2, false)
        , check(b2, SET_MAIN, a1, true)
        ]
      )

      // respects both multiplicities
      await set(a1, SET_MAPS, E.OUT, b1)
      await set(a2, SET_MAPS, E.OUT, b2)
      await Promise.all(
        [ check(a1, SET_MAPS, b1, true)
        , check(a2, SET_MAPS, b2, true)
        , check(a1, SET_MAPS, b2, false)
        ]
      )

      await set(a1, SET_MAPS, E.OUT, b2)
      await Promise.all(
        [ check(a1, SET_MAPS, b1, false)
        , check(a2, SET_MAPS, b2, false)
        , check(a1, SET_MAPS, b2, true)
        ]
      )
    }
  )
