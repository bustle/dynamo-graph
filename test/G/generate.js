import test from 'ava'

import { G } from 'dynamo-graph'
import g from '../helpers/g'

test
  ( 'should create the appropriate resources'
  , async t => {
      await G.generate(g)
      // TODO: write this test
    }
  )
