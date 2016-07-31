import test from 'ava'

import { E } from 'dynamo-graph'

const DEFINED = E.define('Defined', E.MANY_TO_ONE)

test
  ( 'Creates an edge definition'
  , t => {
      t.is(DEFINED.label, 'Defined')
      t.is(DEFINED.multiplicity[E.IN], 'MANY')
      t.is(DEFINED.multiplicity[E.OUT], 'ONE')
    }
  )

test
  ( 'Ensure there is a well defined multiplicity'
  , t => {
      t.throws(() => E.define('FreshName'))
      t.throws(() => E.define('FreshName', { in: 'MANY' }))
      t.throws(() => E.define('FreshName', { out: 'ONE' }))
      t.throws(() => E.define('FreshName', { in: 'SOME', out: 'ONE' }))
    }
  )

test
  ( 'Ensures there are no naming conflicts'
  , t => {
      t.is(DEFINED, E.define('Defined', E.MANY_TO_ONE))
      t.throws(() => E.define('Defined', E.MANY_TO_MANY))
      t.throws(() => E.define('Defined', E.ONE_TO_MANY))
      t.throws(() => E.define('Defined', E.ONE_TO_ONE))
    }
  )
