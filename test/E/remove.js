import test from 'ava'

import { V, E } from 'dynamo-graph'
import { g } from '../helpers'

const REM_NODE = V.define('RemoveNode')
const REM_1 = E.define('Remove1', E.MANY_TO_MANY)
const REM_2 = E.define('Remove2', E.MANY_TO_MANY)

test
  ( 'Removes the edge'
  , async t => {

      const [ a, b, c ] = await Promise.all(
        [ V.create(g, REM_NODE, { node: 'a' })
        , V.create(g, REM_NODE, { node: 'b' })
        , V.create(g, REM_NODE, { node: 'c' })
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

      await set(a, REM_1, E.OUT, b)
      await set(a, REM_1, E.OUT, c)
      await set(a, REM_2, E.OUT, b)

      await Promise.all(
        [ check(a, REM_1, b, true)
        , check(a, REM_1, c, true)
        , check(a, REM_2, b, true)
        , check(a, REM_2, c, false)
        ]
      )

      await E.remove(g, a.id, REM_1, E.OUT, b.id)

      await Promise.all(
        [ check(a, REM_1, b, false)
        , check(a, REM_1, c, true)
        , check(a, REM_2, b, true)
        , check(a, REM_2, c, false)
        ]
      )

    }
  )
