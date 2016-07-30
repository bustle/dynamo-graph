import test from 'ava'

import { V } from 'dynamo-graph'
import { g } from '../helpers'

const KEYED = V.define
  ( 'Keyed'
  , { foo: "number"
    , fooBar: "string"
    }
  )

test
  ( 'Creates new vertex if none is found'
  , async t => {

      const v = await V.putByKey(g, KEYED, 'create', { foo: 123 })

      await V.remove(g, v.id)

      const v2 = await V.putByKey(g, KEYED, 'create', { foo: 123 })
      const v2$ = await V.getByKey(g, KEYED, 'create')

      t.not(v.id, v2.id)
      t.not(v.id, v2$.id)
      t.is(v2.id, v2$.id)
    }
  )

test
  ( 'Updates existing vertex if one is found'
  , async t => {

      const v = await V.putByKey(g, KEYED, 'key', { foo: 123 })
      t.is(v.key, 'key')
      t.is(v.attrs.foo, 123)

      const v$ = await V.get(g, v.id)
      t.deepEqual(v, v$)

      const v$$ = await V.getByKey(g, KEYED, 'key')
      t.deepEqual(v, v$$)

      const v2 = await V.putByKey(g, KEYED, 'key', { foo: 456 })
      t.is(v.id, v2.id)
      t.is(v2.key, 'key')
      t.is(v2.attrs.foo, 456)

      const v2$ = await V.get(g, v2.id)
      t.deepEqual(v2, v2$)

      const v2$$ = await V.getByKey(g, KEYED, 'key')
      t.deepEqual(v2, v2$$)
    }
  )
