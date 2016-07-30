import test from 'ava'

import { V } from 'dynamo-graph'
import { g } from '../helpers'

const CREATE = V.define
  ( 'Create'
  , { foo: "string!"
    , bar: "number"
    }
  )

test
  ( 'Creates a vertex'
  , async t => {
      const attrs =
        { foo: 'Foo'
        , bar: 9
        }
      const v = await V.create(g, CREATE, attrs)
      t.deepEqual(attrs, v.attrs)
      t.is(v.label, 'Create')
      const v$ = await V.get(g, v.id)
      t.deepEqual(v, v$)
    }
  )

test
  ( 'Creates distinct vertices'
  , async t => {
      const attrs =
        { foo: 'Bar'
        , bar: 7
        }
      const [ v1, v2 ] = await Promise.all(
        [ V.create(g, CREATE, attrs)
        , V.create(g, CREATE, attrs)
        ]
      )
      t.deepEqual(v1.attrs, v2.attrs)
      t.is(v1.label, v2.label)
      t.not(v1.id, v2.id)

      const [ v1$, v2$ ] = await V.getMany(g, [ v1.id, v2.id ])

      t.deepEqual(v1, v1$)
      t.deepEqual(v2, v2$)
      t.deepEqual(v1$.attrs, v2$.attrs)
    }
  )
