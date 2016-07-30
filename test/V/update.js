import test from 'ava'

import { V } from 'dynamo-graph'
import { g } from '../helpers'

const UPDATE = V.define
  ( 'Update'
  , { foo: "string"
    , bar: "number?"
    }
  )

test
  ( 'Updates replace old vertices'
  , async t => {

      const attrs =
        { foo: "original"
        }
      const v = await V.create(g, UPDATE, attrs)
      const v$ = await V.get(g, v.id)

      t.deepEqual(v, v$)
      t.deepEqual(v.attrs, attrs)

      const newAttrs =
        { foo: "new"
        , bar: 24
        }

      const v2 = await V.update(g, UPDATE, v.id, newAttrs)
      const v2$ = await V.get(g, v.id)

      t.is(v.id, v2.id)
      t.deepEqual(v2.attrs, newAttrs)
      t.deepEqual(v2, v2$)
      t.notDeepEqual(v2, v)
      t.notDeepEqual(v2$, v$)
    }
  )

// TODO: revisit this and see if this is ideal
// vs. a radredis approach where a partial model can be provided

// Personally I would rather encourage splitting a model into multiple vertices

test
  ( 'Updates completely override old vertices'
  , async t => {
      const { id } = await V.create(g, UPDATE, { foo: "test", bar: 20 })
      await V.update(g, UPDATE, id, { foo: "newTest" })
      const v = await V.get(g, id)
      t.is(v.attrs.foo, "newTest")
      t.is(v.attrs.bar, undefined)
    }
  )
