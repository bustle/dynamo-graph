import test from 'ava'

import { V } from 'dynamo-graph'

const DEFINED = V.define('Defined')

test
  ( 'Creates a vertex definition'
  , t => {
      t.is(DEFINED.label, 'Defined')
    }
  )

test
  ( 'Ensures there are no naming conflicts'
  , t => {
      t.is(DEFINED, V.define('Defined'))
    }
  )
